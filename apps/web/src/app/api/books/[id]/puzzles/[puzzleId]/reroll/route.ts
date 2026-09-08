import { NextResponse } from "next/server";
import { prisma, Prisma } from "@kdp/db";
import { rerollPuzzleSchema } from "@kdp/shared";
import { getOrCreateCurrentUser } from "@/lib/current-user";
import { checkRateLimit } from "@/lib/rate-limit";
import {
  PUZZLE_SELECT,
  asOverrides,
  asTier,
  loadOwnedBook,
  rerollPuzzle,
  toClientRow,
} from "@/lib/puzzle-set";

// Reroll one puzzle.
//
// Three properties this route is built around:
//
//   Isolation. The WHERE clause names one row by id, scoped to the book.
//   No other puzzle in the book is read, written, or regenerated, so
//   rerolling #42 cannot disturb #41 or #43 — not their seeds, not their
//   renames, not their verification.
//
//   Proof before swap. The replacement is fully generated first (and
//   generateGridMystery refuses to return a puzzle it hasn't proved has
//   exactly one solution). Only then is the row updated, in one write
//   that sets the new seed and the verification stamp together. There is
//   no window in which the row carries a new seed and an old badge.
//
//   Undo. The previous seed and tier come back in the response, and the
//   undo route restores them through the same proof. That keeps history
//   on the client, where it belongs — no server-side undo buffer to
//   expire or fall out of step with the row.

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string; puzzleId: string }> },
) {
  const user = await getOrCreateCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Rerolling runs the solver, so it's the one editing action worth a
  // limit — a held-down button shouldn't be able to pin a CPU.
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

  const body = await request.json().catch(() => ({}));
  const parsed = rerollPuzzleSchema.safeParse(body ?? {});
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input", issues: parsed.error.flatten() },
      { status: 400 },
    );
  }

  // What Undo restores. Captured before anything is written.
  const undo = {
    seed: row.seed,
    difficulty: asTier(row.difficulty),
    requestedDifficulty: asTier(row.requestedDifficulty),
    solveNodes: row.solveNodes,
    /** False for a row nobody had opened yet — Undo shouldn't invent a badge the original never had. */
    wasVerified: row.verifiedAt !== null,
  };

  let result;
  try {
    result = rerollPuzzle(row, owned.input, parsed.data.difficulty);
  } catch (error) {
    // The generator throws rather than return an unverified puzzle. A
    // failure here means the old puzzle is untouched, which is the safe
    // outcome — say so instead of leaving a half-swapped row.
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      { error: `Couldn't build a replacement puzzle (${message}). Nothing was changed.` },
      { status: 502 },
    );
  }

  // What survives a reroll, and why.
  //
  // Names and typed titles are the publisher's own words. A reroll
  // changes the puzzle, not their writing: a publisher who renamed the
  // whole cast to their own characters would be furious to find those
  // names wiped because they didn't like one floor plan. Suspect ids are
  // stable across puzzles (s0..sN), so the renames land exactly as
  // before.
  //
  // Heights are dropped. They were chosen against the old cast's
  // ordering, and this puzzle has its own "Nth-tallest" clues written
  // from its own heights — carrying the old numbers over is the one
  // edit that could put a false statement on the page.
  const carried = asOverrides(row.overrides) as Record<string, unknown> | null;
  const kept = carried ? { ...carried } : null;
  if (kept) delete kept.heights;
  const overrides =
    kept && Object.keys(kept).length > 0
      ? (kept as Prisma.InputJsonValue)
      : Prisma.JsonNull;

  // Verification and the new seed land in the same write — there is no
  // moment where the row carries a new seed and the old badge.
  const updated = await prisma.puzzle.update({
    where: { id: row.id },
    data: {
      seed: result.seed,
      difficulty: result.difficulty,
      requestedDifficulty: result.requestedDifficulty,
      solveNodes: result.solveNodes,
      overrides,
      verifiedAt: new Date(),
    },
    select: PUZZLE_SELECT,
  });

  return NextResponse.json({ puzzle: toClientRow(updated), undo });
}
