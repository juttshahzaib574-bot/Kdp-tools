import { NextResponse } from "next/server";
import { prisma } from "@kdp/db";
import { getOrCreateCurrentUser } from "@/lib/current-user";
import { asOverrides, asTier, loadOwnedBook } from "@/lib/puzzle-set";

// The whole book's puzzles, as the preview carousel needs them.
//
// Deliberately NOT the summary payload that /puzzles returns. That one
// materialises each puzzle — generating and solving it — to report its
// cast and title, which is right for five cards on a page and absurd for
// a hundred-puzzle carousel. A preview only needs what reproduces the
// puzzle: its seed, its grid size and its tier. The browser worker does
// the rest, off the main thread.

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getOrCreateCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const owned = await loadOwnedBook(id, user.id);
  if (!owned) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const rows = await prisma.puzzle.findMany({
    where: { bookId: id },
    orderBy: { index: "asc" },
    select: {
      id: true,
      index: true,
      seed: true,
      gridSize: true,
      difficulty: true,
      overrides: true,
    },
  });

  return NextResponse.json({
    puzzles: rows.map((row) => ({
      id: row.id,
      index: row.index,
      seed: row.seed,
      gridSize: row.gridSize,
      difficulty: asTier(row.difficulty),
      // Carried so the full-book preview prints the publisher's own
      // titles and names rather than the engine's defaults — a preview
      // showing different words than the export is not a preview.
      overrides: asOverrides(row.overrides),
    })),
  });
}
