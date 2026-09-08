import { NextResponse } from "next/server";
import { prisma } from "@kdp/db";
import { getOrCreateCurrentUser } from "@/lib/current-user";
import { deleteAsset } from "@/lib/storage";

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getOrCreateCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const asset = await prisma.asset.findFirst({ where: { id, userId: user.id } });
  if (!asset) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // The DB row is the source of truth for quota accounting — delete it
  // first so a failed object-storage delete never leaves a phantom row
  // still counting against the user's usage.
  await prisma.asset.delete({ where: { id: asset.id } });
  await deleteAsset(asset.fileKey).catch(() => {
    // Best-effort: an orphaned object in storage costs a few KB and isn't
    // visible to the user; a delete that appears to fail while secretly
    // succeeding would be worse.
  });

  return NextResponse.json({ ok: true });
}
