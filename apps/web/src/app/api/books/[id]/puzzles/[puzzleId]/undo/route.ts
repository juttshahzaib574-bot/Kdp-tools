import { NextResponse } from "next/server";
import { prisma } from "@kdp/db";
import { restorePuzzleSchema } from "@kdp/shared";
import { generateGridMystery } from "@kdp/generator-grid-mystery";
import { getOrCreateCurrentUser } from "@/lib/current-user";
import { checkRateLimit } from "@/lib/rate-limit";
import { PUZZLE_SELECT, loadOwnedBook, toClientRow } from "@/lib/puzzle-set";

// Undo a reroll: put the previous seed back.
//
// The restored puzzle is regenerated and re-proved before the row is
// written, exactly like a reroll. That matters more than it looks —
// Undo is the one path where it would be tempting to trust a badge from
// before, and a client that can hand back an arbitrary seed must never
// be able to hand back a verified stamp along with it.

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string; puzzleId: string }> },
) {
  const user = await getOrCreateCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const rateLimit = await checkRateLimit(`reroll:${user.id}`);
  if (!rateLimit.success) {
    return NextResponse.json({ error: "Too many rerolls — give it a moment." }, { status: 429 });
  }

  const { id, puzzleId } = await params;
  const owned = await loadOwnedBook(id, user.id);
  if (!owned) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const row = await prisma.puzzle.findFirst({
    where: { id: puzzleId, bookId: id },
    select: PUZZLE_SELECT,
  });
  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await request.json().catch(() => null);
  const parsed = restorePuzzleSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input", issues: parsed.error.flatten() },
      { status: 400 },
    );
  }

  let puzzle;
  try {
    puzzle = generateGridMystery({
      gridSize: row.gridSize,
      difficulty: parsed.data.difficulty,
      themeId: owned.input.theme,
      seed: parsed.data.seed,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      { error: `Couldn't restore that puzzle (${message}). Nothing was changed.` },
      { status: 502 },
    );
  }

  const updated = await prisma.puzzle.update({
    where: { id: row.id },
    data: {
      seed: parsed.data.seed,
      difficulty: puzzle.difficulty,
      requestedDifficulty: parsed.data.requestedDifficulty ?? parsed.data.difficulty,
      solveNodes: puzzle.solveDepth.nodes,
      verifiedAt: new Date(),
    },
    select: PUZZLE_SELECT,
  });

  return NextResponse.json({ puzzle: toClientRow(updated) });
}
