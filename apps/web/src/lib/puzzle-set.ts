import { prisma } from "@kdp/db";
import {
  DIFFICULTY_TIER_IDS,
  gridMysteryInputSchema,
  planMix,
  type DifficultyTier,
  type GridMysteryInput,
  type MixPlanInput,
} from "@kdp/shared";
import {
  applyOverrides,
  generateGridMystery,
  heightEditInvalidatesClues,
  type GridMysteryPuzzle,
  type PuzzleOverrides,
} from "@kdp/generator-grid-mystery";

// The puzzle set: a book's puzzles as durable rows the publisher can
// review and edit before exporting.
//
// Rows store a SEED, not a puzzle. Generation is deterministic, so
// seed + difficulty + grid size + theme rebuilds the identical puzzle
// whenever it's needed — for a thumbnail, for an edit preview, for the
// final export (see apps/worker/src/process-job.ts, which reads these
// same rows). Storing the expanded puzzle instead would mean a large
// denormalised blob that silently drifts out of sync the moment the
// generator changes.
//
// Two costs are deliberately split apart here:
//
//   Creating a row is cheap — a seed and a requested tier, no solving.
//   A hundred-puzzle book is therefore one fast INSERT, not four
//   minutes of search inside an HTTP request.
//
//   Verifying a row is expensive, and happens the first time anyone
//   actually looks at that puzzle (or at export). Until then the row is
//   honestly marked unverified: `verifiedAt` is null and the UI shows no
//   badge. A verified badge in this product means a solver run proved
//   exactly one solution — it can never be a promise the code made in
//   advance.

export interface PuzzleRow {
  id: string;
  index: number;
  seed: number;
  difficulty: string;
  requestedDifficulty: string;
  gridSize: number;
  solveNodes: number;
  overrides: unknown;
  verifiedAt: Date | null;
}

const PUZZLE_SELECT = {
  id: true,
  index: true,
  seed: true,
  difficulty: true,
  requestedDifficulty: true,
  gridSize: true,
  solveNodes: true,
  overrides: true,
  verifiedAt: true,
} as const;

/** Narrows a stored tier string back to a tier id, falling back to medium for anything unrecognised. */
export function asTier(value: string): DifficultyTier {
  return (DIFFICULTY_TIER_IDS as readonly string[]).includes(value)
    ? (value as DifficultyTier)
    : "medium";
}

/** Parses a stored overrides blob back into its typed shape. Anything malformed reads as "no overrides". */
export function asOverrides(value: unknown): PuzzleOverrides | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as PuzzleOverrides;
}

/**
 * Memo for materialised puzzles.
 *
 * Paging back and forth through a hundred-puzzle book would otherwise
 * re-solve the same five puzzles on every visit. The key is everything
 * generation depends on, so a reroll (new seed) or a theme change misses
 * the cache rather than serving a stale puzzle. Bounded so a long-lived
 * server process can't grow without limit.
 */
const MATERIALIZE_CACHE = new Map<string, GridMysteryPuzzle>();
const MATERIALIZE_CACHE_MAX = 400;

function cacheKey(row: { seed: number; gridSize: number; difficulty: string }, theme: string) {
  return `${theme}|${row.gridSize}|${row.difficulty}|${row.seed}`;
}

/**
 * Rebuilds the puzzle a row describes, with the publisher's overrides applied.
 *
 * Deterministic: a pure function of the row plus the book's theme. The
 * generator verifies uniqueness itself and throws otherwise, so a puzzle
 * coming out of here has been proved.
 */
export function materialize(row: PuzzleRow, input: GridMysteryInput): GridMysteryPuzzle {
  const key = cacheKey(row, input.theme);
  let puzzle = MATERIALIZE_CACHE.get(key);
  if (!puzzle) {
    puzzle = generateGridMystery({
      gridSize: row.gridSize,
      difficulty: asTier(row.difficulty),
      themeId: input.theme,
      seed: row.seed,
    });
    if (MATERIALIZE_CACHE.size >= MATERIALIZE_CACHE_MAX) {
      // Cheapest sound eviction: drop the oldest insertion. Map preserves
      // insertion order, so the first key is the least recently added.
      const oldest = MATERIALIZE_CACHE.keys().next().value;
      if (oldest !== undefined) MATERIALIZE_CACHE.delete(oldest);
    }
    MATERIALIZE_CACHE.set(key, puzzle);
  }
  return applyOverrides(puzzle, asOverrides(row.overrides) ?? undefined);
}

/**
 * One puzzle as the client receives it.
 *
 * Note what ISN'T here: the title, the cast, the clues. Producing those
 * means generating the puzzle, and generating means solving — so putting
 * them on this shape would put a solver run behind every page load, for
 * puzzles that were proved once and haven't changed since.
 *
 * The browser rebuilds them from the seed in a worker instead (see
 * puzzle-review.worker.js), off the main thread and cached per seed. The
 * seed is the puzzle; everything else is derivable from it.
 */
export interface PuzzleRowView {
  id: string;
  index: number;
  seed: number;
  difficulty: DifficultyTier;
  requestedDifficulty: DifficultyTier;
  gridSize: number;
  solveNodes: number;
  verified: boolean;
  /** The publisher's own words, raw — the client resolves name tokens itself. */
  overrides: PuzzleOverrides | null;
}

/** Shapes a stored row for the wire. One shape, so list, reroll and undo all agree. */
export function toClientRow(row: PuzzleRow): PuzzleRowView {
  return {
    id: row.id,
    index: row.index,
    seed: row.seed,
    difficulty: asTier(row.difficulty),
    requestedDifficulty: asTier(row.requestedDifficulty),
    gridSize: row.gridSize,
    solveNodes: row.solveNodes,
    verified: row.verifiedAt !== null,
    overrides: asOverrides(row.overrides),
  };
}

function randomSeed(): number {
  return Math.floor(Math.random() * 2 ** 31);
}

/**
 * The tier plan for a book.
 *
 * A book with no saved mix gets the progressive ramp, not its
 * `difficulty` field repeated N times. A real puzzle book opens gently
 * and finishes hard; building all thirty at one tier was never what a
 * publisher wanted, and combined with the old rounding it produced books
 * like "29 Medium and 1 Expert" — neither one thing nor the other.
 * `difficulty` survives as the tier the Generate tab rolls its sample
 * previews at, and as a one-row sequence for anyone who genuinely wants
 * a single-tier book.
 */
export function planFor(input: GridMysteryInput, mix?: MixPlanInput) {
  if (mix) return planMix(mix);
  const saved = input.mix;
  if (saved) {
    return planMix({
      total: input.puzzleCount,
      mode: saved.mode,
      weights: saved.weights,
      sequence: saved.sequence,
      remainderPolicy: saved.remainderPolicy,
    });
  }
  return planMix({ total: input.puzzleCount, mode: "ramp" });
}

/**
 * Creates the rows for a book, replacing any that exist.
 *
 * Nothing is solved here — see the module header. Each row is a seed and
 * the tier the mix planner assigned to that slot, marked unverified
 * until something proves it.
 */
export async function buildPuzzleSet(
  bookId: string,
  input: GridMysteryInput,
  mix?: MixPlanInput,
): Promise<number> {
  const plan = planFor(input, mix);
  const rows = plan.order.map((tier, index) => ({
    bookId,
    index,
    seed: randomSeed(),
    difficulty: tier,
    requestedDifficulty: tier,
    gridSize: input.gridSize,
    solveNodes: 0,
    verifiedAt: null,
  }));

  await prisma.$transaction([
    prisma.puzzle.deleteMany({ where: { bookId } }),
    prisma.puzzle.createMany({ data: rows }),
  ]);
  return rows.length;
}

/**
 * Brings an existing set back in line with the book's settings.
 *
 * The publisher may go back to Generate after customising. Two cases,
 * treated very differently on purpose:
 *
 *   Grid size or theme changed — every stored seed now describes a
 *   different puzzle, and per-puzzle renames refer to a cast that no
 *   longer exists. The set is rebuilt, and the edits are gone; there is
 *   no honest way to carry them across.
 *
 *   Only the count changed — existing rows, including every reroll and
 *   every rename, are left exactly as they are. Extra rows are dropped
 *   from the end and new ones appended at the book's current tier, so a
 *   publisher who bumps 30 to 40 keeps the thirty they already approved.
 */
export async function reconcilePuzzleSet(
  bookId: string,
  input: GridMysteryInput,
): Promise<{ rebuilt: boolean; count: number }> {
  const rows = await prisma.puzzle.findMany({
    where: { bookId },
    orderBy: { index: "asc" },
    select: { id: true, index: true, gridSize: true },
  });
  if (rows.length === 0) {
    return { rebuilt: true, count: await buildPuzzleSet(bookId, input) };
  }

  const gridChanged = rows.some((row) => row.gridSize !== input.gridSize);
  if (gridChanged) {
    return { rebuilt: true, count: await buildPuzzleSet(bookId, input) };
  }

  if (rows.length > input.puzzleCount) {
    await prisma.puzzle.deleteMany({
      where: { bookId, index: { gte: input.puzzleCount } },
    });
    return { rebuilt: false, count: input.puzzleCount };
  }

  if (rows.length < input.puzzleCount) {
    const added = Array.from({ length: input.puzzleCount - rows.length }, (_, i) => ({
      bookId,
      index: rows.length + i,
      seed: randomSeed(),
      difficulty: input.difficulty,
      requestedDifficulty: input.difficulty,
      gridSize: input.gridSize,
      solveNodes: 0,
      verifiedAt: null,
    }));
    await prisma.puzzle.createMany({ data: added });
  }
  return { rebuilt: false, count: input.puzzleCount };
}

/**
 * How many times a slot may be re-seeded before we give up on it.
 *
 * The engine refuses to return a puzzle it can't prove has exactly one
 * solution, and for a small fraction of seeds it can't. That is not
 * something to show a publisher — a puzzle they never chose, failing for
 * a reason they can't act on — so the slot silently draws a new seed and
 * tries again. Bounded so a pathological configuration reports a real
 * error rather than looping.
 */
const MAX_VERIFY_ATTEMPTS = 6;

export class PuzzleVerificationExhaustedError extends Error {
  constructor(readonly index: number, readonly attempts: number) {
    super(
      `Puzzle ${index + 1} could not be built with a single solution after ${attempts} attempts.`,
    );
    this.name = "PuzzleVerificationExhaustedError";
  }
}

/**
 * Proves one row, re-seeding it if the engine can't.
 *
 * The ordering is the point: the puzzle is generated — which is to say
 * verified — BEFORE the timestamp is written, and the seed that produced
 * it is written in the same update. A row can never carry a verified
 * badge that no solver run stands behind, and never a badge belonging to
 * a different seed than the one stored.
 *
 * Calibration can also re-tier a puzzle — a seed asked for at Expert may
 * only earn Hard — so the earned tier is written back at the same time
 * and the UI shows what the reader will actually get.
 */
export async function verifyRow(row: PuzzleRow, input: GridMysteryInput): Promise<PuzzleRow> {
  if (row.verifiedAt !== null) return row;

  let seed = row.seed;
  for (let attempt = 0; attempt < MAX_VERIFY_ATTEMPTS; attempt++) {
    try {
      const puzzle = generateGridMystery({
        gridSize: row.gridSize,
        difficulty: asTier(row.difficulty),
        themeId: input.theme,
        seed,
      });
      MATERIALIZE_CACHE.set(cacheKey({ ...row, seed, difficulty: puzzle.difficulty }, input.theme), puzzle);
      return await prisma.puzzle.update({
        where: { id: row.id },
        data: {
          seed,
          difficulty: puzzle.difficulty,
          solveNodes: puzzle.solveDepth.nodes,
          verifiedAt: new Date(),
        },
        select: PUZZLE_SELECT,
      });
    } catch {
      // A seed the engine couldn't prove. Draw another and move on —
      // this is invisible to the publisher by design.
      seed = randomSeed();
    }
  }
  throw new PuzzleVerificationExhaustedError(row.index, MAX_VERIFY_ATTEMPTS);
}

/**
 * Proves up to `limit` of a book's unverified puzzles.
 *
 * Chunked rather than all-at-once because proving a long book takes real
 * time — a hundred Extreme puzzles is minutes of search — and a single
 * request that long would hit a gateway timeout and report nothing.
 * Chunks also give the UI something true to show while it happens:
 * verification is progress, not a defect.
 */
export async function verifyChunk(
  bookId: string,
  input: GridMysteryInput,
  limit: number,
): Promise<{ verified: number; total: number; done: boolean }> {
  const pending = await prisma.puzzle.findMany({
    where: { bookId, verifiedAt: null },
    orderBy: { index: "asc" },
    take: limit,
    select: PUZZLE_SELECT,
  });
  for (const row of pending) await verifyRow(row, input);

  const [verified, total] = await Promise.all([
    prisma.puzzle.count({ where: { bookId, verifiedAt: { not: null } } }),
    prisma.puzzle.count({ where: { bookId } }),
  ]);
  return { verified, total, done: verified >= total };
}



export interface RerollResult {
  seed: number;
  difficulty: DifficultyTier;
  requestedDifficulty: DifficultyTier;
  solveNodes: number;
}

/**
 * Generates a replacement for one puzzle.
 *
 * Returns the new row values WITHOUT writing them, so the caller can
 * hand the previous seed back for Undo and commit exactly once. The
 * puzzle is fully generated — and therefore fully verified, since the
 * engine refuses to return an unverified puzzle — before anything is
 * swapped in, which is what lets the badge mean something.
 */
export function rerollPuzzle(
  current: PuzzleRow,
  input: GridMysteryInput,
  difficulty?: DifficultyTier,
): RerollResult {
  const tier = difficulty ?? asTier(current.requestedDifficulty);

  // Not every seed yields a puzzle. The engine refuses to return one it
  // can't prove is both uniquely solvable AND reachable by reasoning, so
  // a given seed can simply fail — measurably about 1 in 10 at the upper
  // tiers, where the tier contract is strictest.
  //
  // That is a property of the seed, not of the publisher's request, so it
  // is handled the way verifyRow handles it: draw another and try again.
  // Surfacing it as an error made Reroll look broken roughly one press in
  // ten, for a condition the next draw resolves.
  let seed = current.seed;
  let lastError: unknown;
  for (let attempt = 0; attempt < MAX_VERIFY_ATTEMPTS; attempt++) {
    // A reroll must actually change the puzzle. Re-drawing the same seed
    // by chance would look like a broken button, so keep drawing until it
    // differs. (1 in 2^31 per draw — the loop is a guarantee, not a hot path.)
    for (let draw = 0; draw < 8 && seed === current.seed; draw++) {
      seed = randomSeed();
    }
    try {
      const puzzle = generateGridMystery({
        gridSize: current.gridSize,
        difficulty: tier,
        themeId: input.theme,
        seed,
      });
      MATERIALIZE_CACHE.set(
        cacheKey({ ...current, seed, difficulty: puzzle.difficulty }, input.theme),
        puzzle,
      );
      return {
        seed,
        difficulty: puzzle.difficulty,
        requestedDifficulty: tier,
        solveNodes: puzzle.solveDepth.nodes,
      };
    } catch (error) {
      lastError = error;
      // Force a fresh draw on the next pass: `seed` currently holds the
      // one that just failed, and the inner loop only redraws while it
      // still equals the ORIGINAL seed.
      seed = randomSeed();
    }
  }
  throw lastError instanceof Error
    ? lastError
    : new Error(`Reroll failed after ${MAX_VERIFY_ATTEMPTS} seeds`);
}

/**
 * Whether a height edit would falsify a printed clue.
 *
 * The "Nth-tallest guest" clue family reads height ORDER, so an edit
 * that reorders the cast can make a clue on the page untrue. Renames
 * never can — no clue depends on spelling — which is why only this one
 * field needs the puzzle materialised at all.
 */
export function heightsWouldBreakClues(
  row: PuzzleRow,
  input: GridMysteryInput,
  heights?: Record<string, number>,
): boolean {
  if (!heights || Object.keys(heights).length === 0) return false;
  const puzzle = materialize({ ...row, overrides: null }, input);
  return heightEditInvalidatesClues(puzzle, heights);
}

/** Loads a book the caller owns, with its validated generator input. */
export async function loadOwnedBook(bookId: string, userId: string) {
  const book = await prisma.book.findFirst({ where: { id: bookId, userId } });
  if (!book) return null;
  const parsed = gridMysteryInputSchema.safeParse(book.inputParams);
  if (!parsed.success) return null;
  return { book, input: parsed.data };
}

export { PUZZLE_SELECT };
