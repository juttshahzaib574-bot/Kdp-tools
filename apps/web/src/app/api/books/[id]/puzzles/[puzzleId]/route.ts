import { NextResponse } from "next/server";
import { prisma, Prisma } from "@kdp/db";
import { patchPuzzleSchema } from "@kdp/shared";
import { getOrCreateCurrentUser } from "@/lib/current-user";
import {
  PUZZLE_SELECT,
  asOverrides,
  heightsWouldBreakClues,
  loadOwnedBook,
} from "@/lib/puzzle-set";

// Per-puzzle publisher edits.
//
// The performance contract this route exists to keep: a rename must
// reach every text surface with no re-solve. Names are stored as tokens
// in the generated text (see text-template.ts), so applying one is a map
// edit — this handler writes a JSON column and returns. It does not
// generate a puzzle, does not run the solver, and does not touch the
// row's verification, because none of those depend on spelling.
//
// The client doesn't wait on it either: it already holds the resolved
// text and re-renders locally, so the visible update is a React render
// and this call is a background autosave.

/**
 * Merges an incoming override patch onto what's stored.
 *
 * A blank value CLEARS that override rather than storing an empty
 * string, which is what makes "select all, delete" in the title field
 * mean "go back to the generated title" instead of printing a blank
 * heading.
 */
function mergeOverrides(
  stored: Record<string, unknown> | null,
  patch: {
    title?: string;
    subtitle?: string;
    names?: Record<string, string>;
    heights?: Record<string, number>;
  },
): Prisma.InputJsonValue | typeof Prisma.JsonNull {
  const next: Record<string, unknown> = { ...(stored ?? {}) };

  if (patch.title !== undefined) {
    if (patch.title.trim()) next.title = patch.title.trim();
    else delete next.title;
  }
  if (patch.subtitle !== undefined) {
    if (patch.subtitle.trim()) next.subtitle = patch.subtitle.trim();
    else delete next.subtitle;
  }
  if (patch.names !== undefined) {
    const names: Record<string, string> = {
      ...((next.names as Record<string, string> | undefined) ?? {}),
    };
    for (const [suspectId, name] of Object.entries(patch.names)) {
      if (name.trim()) names[suspectId] = name.trim();
      else delete names[suspectId];
    }
    if (Object.keys(names).length > 0) next.names = names;
    else delete next.names;
  }
  if (patch.heights !== undefined) {
    const heights: Record<string, number> = {
      ...((next.heights as Record<string, number> | undefined) ?? {}),
    };
    for (const [suspectId, value] of Object.entries(patch.heights)) heights[suspectId] = value;
    if (Object.keys(heights).length > 0) next.heights = heights;
    else delete next.heights;
  }

  // Prisma needs its own sentinel to write SQL NULL into a Json column;
  // a plain JS null isn't a valid Json value there.
  return Object.keys(next).length > 0 ? (next as Prisma.InputJsonValue) : Prisma.JsonNull;
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string; puzzleId: string }> },
) {
  const user = await getOrCreateCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id, puzzleId } = await params;
  const owned = await loadOwnedBook(id, user.id);
  if (!owned) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const row = await prisma.puzzle.findFirst({
    where: { id: puzzleId, bookId: id },
    select: PUZZLE_SELECT,
  });
  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await request.json().catch(() => null);
  const parsed = patchPuzzleSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input", issues: parsed.error.flatten() },
      { status: 400 },
    );
  }
  const patch = parsed.data.overrides;

  // Height is the one field that can falsify text already on the page:
  // the "Nth-tallest guest" clues read height ORDER, so reordering the
  // cast makes a printed clue untrue. Rejecting is the honest answer —
  // silently accepting would ship an unsolvable puzzle, and re-solving
  // wouldn't help because the clue text is fixed by the seed. This is
  // also the only branch that materialises the puzzle at all.
  if (patch.heights && heightsWouldBreakClues(row, owned.input, patch.heights)) {
    return NextResponse.json(
      {
        error:
          "Those heights would reorder the cast, and this puzzle has a clue about who's tallest — it would no longer be true. Keep the same tallest-to-shortest order, or reroll this puzzle for a fresh one.",
      },
      { status: 409 },
    );
  }

  const stored = asOverrides(row.overrides) as Record<string, unknown> | null;
  const updated = await prisma.puzzle.update({
    where: { id: row.id },
    data: { overrides: mergeOverrides(stored, patch) },
    select: PUZZLE_SELECT,
  });

  // Deliberately NOT a puzzle summary. Building one would mean
  // materialising the puzzle, and materialising means solving — which
  // would put a solver run back on the rename path this route exists to
  // keep clear of one. The client already holds the resolved text; all
  // it needs back is confirmation of what was saved.
  return NextResponse.json({
    id: updated.id,
    index: updated.index,
    overrides: updated.overrides ?? null,
    verified: updated.verifiedAt !== null,
  });
}
