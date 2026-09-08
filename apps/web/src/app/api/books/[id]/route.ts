import { NextResponse } from "next/server";
import { prisma } from "@kdp/db";
import { gridMysteryInputSchema } from "@kdp/shared";
import { getOrCreateCurrentUser } from "@/lib/current-user";
import { reconcilePuzzleSet } from "@/lib/puzzle-set";

/**
 * Reloads a draft so a refresh loses nothing.
 *
 * Everything that makes a book — its settings, its seeds, every rename
 * and every reroll, and which puzzles have been proved — is already
 * durable server-side. What was missing was any way for the wizard to
 * ask for it back, so a reload started from an empty form while the
 * draft sat in the database untouched.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getOrCreateCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const book = await prisma.book.findFirst({ where: { id, userId: user.id } });
  if (!book) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const parsed = gridMysteryInputSchema.safeParse(book.inputParams);
  const [puzzleCount, verifiedCount] = await Promise.all([
    prisma.puzzle.count({ where: { bookId: id } }),
    prisma.puzzle.count({ where: { bookId: id, verifiedAt: { not: null } } }),
  ]);

  return NextResponse.json({
    book: { id: book.id, title: book.title, status: book.status },
    // Null rather than a 500 when a stored blob predates a schema
    // change: the caller can start fresh instead of being stuck on a
    // draft it can't open.
    input: parsed.success ? parsed.data : null,
    puzzles: { total: puzzleCount, verified: verifiedCount },
  });
}

// A draft book: update its settings, and send it to the worker.
//
// Only a DRAFT is editable. Once a book has been queued or rendered its
// inputParams are the record of what was actually produced — a book the
// publisher already downloaded must not silently describe different
// settings than the PDF in their hands.

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getOrCreateCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const book = await prisma.book.findFirst({ where: { id, userId: user.id } });
  if (!book) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (book.status !== "DRAFT") {
    return NextResponse.json(
      { error: "This book has already been generated and can't be edited." },
      { status: 409 },
    );
  }

  const body = (await request.json().catch(() => null)) as
    | { input?: unknown; enqueue?: unknown }
    | null;
  const parsed = gridMysteryInputSchema.safeParse(body?.input);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input", issues: parsed.error.flatten() },
      { status: 400 },
    );
  }

  // Defense in depth, same as on create: a page-image reference must
  // belong to this user before it's persisted.
  const assetIds = Object.values(parsed.data.pageImages ?? {}).filter((value): value is string =>
    Boolean(value),
  );
  if (assetIds.length > 0) {
    const ownedCount = await prisma.asset.count({
      where: { id: { in: assetIds }, userId: user.id },
    });
    if (ownedCount !== new Set(assetIds).size) {
      return NextResponse.json(
        { error: "One or more page images were not found" },
        { status: 400 },
      );
    }
  }

  await prisma.book.update({
    where: { id: book.id },
    data: { title: parsed.data.title, inputParams: parsed.data },
  });

  // Bring the puzzle set in line with the new settings. This keeps every
  // reroll and rename the publisher made wherever it honestly can — see
  // reconcilePuzzleSet for the one case where it can't.
  const reconciled = await reconcilePuzzleSet(book.id, parsed.data);

  if (body?.enqueue === true) {
    const updated = await prisma.book.update({
      where: { id: book.id },
      data: { status: "QUEUED", jobs: { create: { status: "QUEUED" } } },
      select: { id: true, title: true, status: true, createdAt: true },
    });
    return NextResponse.json({ book: updated, puzzles: reconciled });
  }

  return NextResponse.json({
    book: { id: book.id, title: parsed.data.title, status: book.status },
    puzzles: reconciled,
  });
}
