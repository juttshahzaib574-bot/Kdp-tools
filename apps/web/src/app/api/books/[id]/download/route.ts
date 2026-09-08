import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@kdp/db";
import { getOrCreateCurrentUser } from "@/lib/current-user";
import { getSignedDownloadUrl, isObjectStorageConfigured } from "@/lib/storage";

// "cover" is kept for books generated before the app stopped drawing
// its own covers — those files still exist and their owners should still
// be able to fetch them. Nothing produces new ones; see the note in
// apps/worker/src/process-job.ts.
const VALID_KINDS = new Set(["interior", "cover"]);

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = await getOrCreateCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const kindParam = new URL(request.url).searchParams.get("kind") ?? "interior";
  if (!VALID_KINDS.has(kindParam)) {
    return NextResponse.json({ error: "kind must be 'interior' or 'cover'" }, { status: 400 });
  }
  const kind = kindParam as "interior" | "cover";

  // Scoped to the signed-in user in the query itself — a book that exists
  // but belongs to someone else looks identical to a nonexistent one.
  const book = await prisma.book.findFirst({
    where: { id, userId: user.id },
    include: { jobs: { where: { status: "SUCCEEDED" }, orderBy: { finishedAt: "desc" }, take: 1 } },
  });
  if (!book) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const job = book.jobs[0];
  const fileKey = kind === "cover" ? job?.coverFileKey : job?.resultFileKey;
  if (!job || !fileKey) {
    return NextResponse.json(
      {
        error:
          kind === "cover"
            ? "This book has no generated cover. Build your cover from the spec on the Preview & Export tab."
            : "This book isn't ready to download yet",
      },
      { status: 409 },
    );
  }

  if (!isObjectStorageConfigured()) {
    return NextResponse.json(
      { error: "Object storage isn't configured in this environment, so downloads aren't available." },
      { status: 503 },
    );
  }

  const url = await getSignedDownloadUrl(fileKey);
  if (!url) {
    return NextResponse.json({ error: "Could not generate a download link" }, { status: 500 });
  }

  return NextResponse.redirect(url);
}
