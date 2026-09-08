import { NextResponse } from "next/server";
import { prisma } from "@kdp/db";
import {
  ALLOWED_ASSET_MIME_TYPES,
  FREE_TIER_STORAGE_QUOTA_BYTES,
  MATTER_PAGE_ROLES,
  MAX_ASSET_UPLOAD_BYTES,
  type MatterPageRole,
  formatBytes,
} from "@kdp/shared";
import { normalizeImage } from "@/lib/assets";
import { getOrCreateCurrentUser } from "@/lib/current-user";
import { checkRateLimit } from "@/lib/rate-limit";
import { StorageNotConfiguredError, uploadAsset } from "@/lib/storage";

async function currentStorageUsage(userId: string): Promise<number> {
  const result = await prisma.asset.aggregate({ where: { userId }, _sum: { byteSize: true } });
  return result._sum.byteSize ?? 0;
}

export async function GET() {
  const user = await getOrCreateCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const assets = await prisma.asset.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
  });
  const usedBytes = assets.reduce((sum, asset) => sum + asset.byteSize, 0);

  return NextResponse.json({
    assets,
    quota: { usedBytes, totalBytes: FREE_TIER_STORAGE_QUOTA_BYTES },
  });
}

export async function POST(request: Request) {
  const user = await getOrCreateCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const rateLimit = await checkRateLimit(`upload-asset:${user.id}`);
  if (!rateLimit.success) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  const formData = await request.formData().catch(() => null);
  const file = formData?.get("file");
  if (!formData || !(file instanceof File)) {
    return NextResponse.json({ error: "Missing file" }, { status: 400 });
  }
  if (!ALLOWED_ASSET_MIME_TYPES.includes(file.type as (typeof ALLOWED_ASSET_MIME_TYPES)[number])) {
    return NextResponse.json(
      { error: "Only PNG, JPEG, and WEBP images are accepted" },
      { status: 400 },
    );
  }
  if (file.size > MAX_ASSET_UPLOAD_BYTES) {
    return NextResponse.json(
      { error: `Image is too large — max ${formatBytes(MAX_ASSET_UPLOAD_BYTES)} per upload` },
      { status: 413 },
    );
  }

  // An upload is tagged with exactly one gallery: a built-in page role, or
  // a user-defined custom page — both work the same way from here on.
  const pageRoleRaw = formData.get("pageRole");
  const pageRole =
    typeof pageRoleRaw === "string" &&
    MATTER_PAGE_ROLES.includes(pageRoleRaw as MatterPageRole)
      ? (pageRoleRaw as MatterPageRole)
      : null;

  const customPageIdRaw = formData.get("customPageId");
  const customPageId =
    !pageRole && typeof customPageIdRaw === "string" && customPageIdRaw ? customPageIdRaw : null;
  if (customPageId) {
    const customPage = await prisma.customPage.findFirst({
      where: { id: customPageId, userId: user.id },
    });
    if (!customPage) return NextResponse.json({ error: "Page not found" }, { status: 404 });
  }

  let normalized;
  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    normalized = await normalizeImage(buffer);
  } catch {
    return NextResponse.json(
      { error: "Couldn't process that image — is it a valid PNG, JPEG, or WEBP file?" },
      { status: 400 },
    );
  }

  const usedBytes = await currentStorageUsage(user.id);
  if (usedBytes + normalized.buffer.length > FREE_TIER_STORAGE_QUOTA_BYTES) {
    return NextResponse.json(
      {
        error: `This would exceed your storage quota (${formatBytes(usedBytes)} of ${formatBytes(FREE_TIER_STORAGE_QUOTA_BYTES)} used). Delete an image to free up space.`,
      },
      { status: 413 },
    );
  }

  const key = `assets/${user.id}/${crypto.randomUUID()}.jpg`;
  try {
    await uploadAsset(key, normalized.buffer, normalized.mimeType);
  } catch (error) {
    if (error instanceof StorageNotConfiguredError) {
      return NextResponse.json({ error: error.message }, { status: 503 });
    }
    // Anything else here is a real infra failure (bucket auth wrong,
    // network dropped, etc). Log for the operator; give the user something
    // actionable rather than a blank 500.
    console.error("[assets/upload] uploadAsset failed", error);
    return NextResponse.json(
      { error: "Couldn't save the image to storage. Please try again in a moment." },
      { status: 502 },
    );
  }

  const asset = await prisma.asset.create({
    data: {
      userId: user.id,
      customPageId,
      pageRole,
      fileKey: key,
      originalName: file.name.slice(0, 200),
      mimeType: normalized.mimeType,
      byteSize: normalized.buffer.length,
      width: normalized.width,
      height: normalized.height,
    },
  });

  return NextResponse.json(
    {
      asset,
      quota: {
        usedBytes: usedBytes + normalized.buffer.length,
        totalBytes: FREE_TIER_STORAGE_QUOTA_BYTES,
      },
    },
    { status: 201 },
  );
}
