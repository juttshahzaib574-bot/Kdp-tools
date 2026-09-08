// Navigating a long book with five chips.
//
// There is ONE numbering system: the puzzle number, 1..total. Everything
// on screen — the chips, the arrows, the jump box, the caption — reads
// and writes that single number. The carousel used to show three at once
// ("Puzzle 3 of 100" beside "Page 1 of 20" beside chips reading 1..5),
// which forced a reader to work out which of three numbers meant the
// thing they were looking at.
//
// The chip window is derived from the selection rather than being its
// own state, which is what keeps them from disagreeing.

/** Chips shown at once. Five is what fits comfortably on a phone. */
export const CHIP_WINDOW_SIZE = 5;

/** Brings a puzzle number inside 1..total. */
export function clampPuzzleNumber(value: number, total: number): number {
  if (!Number.isFinite(value) || total <= 0) return 1;
  return Math.min(Math.max(1, Math.floor(value)), total);
}

/**
 * The window a JUMP produces: the target leads, and the next four
 * follow.
 *
 * Anchoring the target at the left edge — rather than centring it — is
 * deliberate: someone who types 85 is heading INTO the eighties, so the
 * useful chips are the ones after it. At the end of the book there is
 * nothing after it, so the window backs up to keep five chips rather
 * than showing a short row.
 */
export function windowForJump(
  target: number,
  total: number,
  size: number = CHIP_WINDOW_SIZE,
): number[] {
  const span = Math.min(size, Math.max(1, total));
  const selected = clampPuzzleNumber(target, total);
  const start = Math.min(selected, Math.max(1, total - span + 1));
  return Array.from({ length: span }, (_, i) => start + i);
}

/**
 * The window after moving the selection by a step.
 *
 * Minimal sliding: while the new selection is already on screen the
 * chips don't move at all, so stepping through a book doesn't make the
 * row jitter under the reader's finger. Crossing an edge slides it by
 * exactly the amount needed to bring the selection back in.
 *
 * Wrapping (100 -> 1) is a jump, not a step, so the window follows the
 * selection to the other end of the book.
 */
export function windowAfterStep(
  selected: number,
  current: readonly number[],
  total: number,
  size: number = CHIP_WINDOW_SIZE,
): number[] {
  const span = Math.min(size, Math.max(1, total));
  const target = clampPuzzleNumber(selected, total);
  if (current.length !== span) return windowForJump(target, total, span);

  const first = current[0]!;
  const last = current[current.length - 1]!;
  if (target >= first && target <= last) return [...current];

  // One past an edge slides by one; anything further is a jump.
  const start =
    target === last + 1
      ? first + 1
      : target === first - 1
        ? first - 1
        : Math.min(target, Math.max(1, total - span + 1));
  const bounded = Math.min(Math.max(1, start), Math.max(1, total - span + 1));
  return Array.from({ length: span }, (_, i) => bounded + i);
}

/** Steps the selection by ±1, wrapping at both ends so a book is a loop. */
export function stepPuzzleNumber(selected: number, delta: number, total: number): number {
  if (total <= 0) return 1;
  const zero = (clampPuzzleNumber(selected, total) - 1 + delta) % total;
  return ((zero + total) % total) + 1;
}

/**
 * Reads what someone typed into the jump box.
 *
 * Three outcomes, because they call for three different responses: a
 * usable number, a number outside the book (clamp, and say what the
 * range is), and something that isn't a number at all (reject, and say
 * nothing — the box just refuses).
 */
export type JumpResult =
  | { kind: "ok"; value: number }
  | { kind: "clamped"; value: number; total: number }
  | { kind: "invalid" };

export function parseJump(raw: string, total: number): JumpResult {
  const trimmed = raw.trim();
  if (!/^\d+$/.test(trimmed)) return { kind: "invalid" };
  const value = Number(trimmed);
  if (value < 1 || value > total) {
    return { kind: "clamped", value: clampPuzzleNumber(value, total), total };
  }
  return { kind: "ok", value };
}

/** The 0-based page of five a puzzle number belongs to — the Customize list's grouping. */
export function groupForPuzzle(
  puzzleNumber: number,
  total: number,
  size: number = CHIP_WINDOW_SIZE,
): number {
  return Math.floor((clampPuzzleNumber(puzzleNumber, total) - 1) / size) + 1;
}

// ---- The LIST window, which is not the carousel's ------------------
//
// Two surfaces, two rules, for a reason worth stating.
//
// The carousel shows ONE puzzle, and its chips are a lookahead: jump to
// 85 and you get 85..89, because you're heading into the eighties and
// the useful chips are the ones after it.
//
// The list shows FIVE puzzles at once, and its chips must equal the five
// cards on screen — a chip that selects something you can't see is a
// lie. So the list works in ALIGNED groups: 1-5, 6-10, 11-15. Jump to 13
// and the group holding it comes up (11-15) with 13 marked, rather than
// 13-17, which would be five cards that don't line up with any page of
// the list.

/** The aligned group of `size` containing this puzzle, clamped to the book. */
export function alignedGroup(
  puzzleNumber: number,
  total: number,
  size: number = CHIP_WINDOW_SIZE,
): number[] {
  if (total <= 0) return [];
  const page = groupForPuzzle(puzzleNumber, total, size);
  const start = (page - 1) * size + 1;
  const end = Math.min(start + size - 1, total);
  return Array.from({ length: end - start + 1 }, (_, i) => start + i);
}

/** "Showing 11–15 of 100" — the list's caption, which never says "page". */
export function showingLabel(window: readonly number[], total: number): string {
  if (window.length === 0) return `0 of ${total}`;
  const first = window[0]!;
  const last = window[window.length - 1]!;
  return first === last ? `Showing ${first} of ${total}` : `Showing ${first}–${last} of ${total}`;
}
