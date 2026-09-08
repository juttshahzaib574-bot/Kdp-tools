import { NextResponse } from "next/server";
import { prisma } from "@kdp/db";
import { getOrCreateCurrentUser } from "@/lib/current-user";
import {
  getSignedDownloadUrl,
  isObjectStorageConfigured,
  readAsset,
  StorageNotConfiguredError,
} from "@/lib/storage";

/**
 * Serves an asset's actual image bytes — used both as an <img src> for
 * gallery thumbnails and by the live preview, which fetches this and hands
 * the bytes to the preview worker to embed. Unlike the interior/cover PDF
 * download route, this works in local dev without object storage too:
 * assets are uploaded through this same web process (not the worker), so
 * the local-disk fallback lives on a filesystem this route can actually
 * read from.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getOrCreateCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const asset = await prisma.asset.findFirst({ where: { id, userId: user.id } });
  if (!asset) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (isObjectStorageConfigured()) {
    const url = await getSignedDownloadUrl(asset.fileKey);
    if (!url)
      return NextResponse.json({ error: "Could not generate a download link" }, { status: 500 });
    return NextResponse.redirect(url);
  }

  try {
    const bytes = await readAsset(asset.fileKey);
    return new NextResponse(new Uint8Array(bytes), {
      headers: { "Content-Type": asset.mimeType, "Cache-Control": "private, max-age=3600" },
    });
  } catch (error) {
    if (error instanceof StorageNotConfiguredError) {
      return NextResponse.json({ error: error.message }, { status: 503 });
    }
    console.error("[assets/raw] readAsset failed", error);
    return NextResponse.json({ error: "Couldn't read image from storage" }, { status: 502 });
  }
}
