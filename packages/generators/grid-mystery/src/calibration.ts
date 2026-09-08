import type { Difficulty } from "./types";

// Difficulty calibration.
//
// A tier label is a promise to a reader. Before this module the promise
// was unverified: the generator applied a different clue policy per tier
// and assumed the result was correspondingly harder. Measuring the
// solver's own search effort showed that assumption was wrong in two
// specific ways, both recorded here because they constrain what the
// ladder can honestly claim:
//
//   1. The clue-drop budget SATURATES. A clue set stops being uniquely
//      solvable somewhere around N-2 clues, so drop budgets of 2 and 3
//      resolve to the same set and the two tiers collapse onto identical
//      puzzles.
//   2. At a fixed grid size the ladder is therefore only about four
//      levels deep, and at 8x8 the top of it inverts — more aggressive
//      clue policies sometimes produce LESS search, because dropping a
//      clue occasionally forces the escalation loop to substitute a
//      sharper one.
//
// So grid size was made the fifth lever (see recommendedGridSize), and
// every puzzle is classified against measured data before it ships.
//
// SINCE SUPERSEDED, and this file's role narrowed accordingly. The tier
// label is now decided by the reasoning a puzzle demands, not by search
// effort — see tier-contract.ts. Search nodes remain a useful secondary
// signal and the ledger still reports them, but they no longer pick the
// label, and grid size is no longer how the tiers are held apart: all
// five bands are reachable at every supported size. recommendedGridSize
// still climbs with the tier, because a top-tier puzzle looks like one,
// not because the grid is what makes it hard.
//
// The one thing that never happens, then and now, is shipping a
// mislabeled puzzle.

/** Measured search effort (nodes) for one solve. Mirrors SolveStats. */
export interface SolveDepth {
  nodes: number;
  backtracks: number;
}

export const CALIBRATION_TIERS: readonly Difficulty[] = [
  "easy",
  "medium",
  "hard",
  "expert",
  "extreme",
];

/**
 * Median nodes-to-verify per (grid size, tier), measured over 30 seeds
 * each with the generator's own verification solve.
 *
 * This is DATA, not configuration — it describes what the generator
 * currently produces. Changing clue policy invalidates it, which is why
 * the measurement harness lives alongside the tests: re-run it and paste
 * the new medians here rather than nudging numbers to make a test pass.
 */
const MEASURED_MEDIAN_NODES: Record<number, Record<Difficulty, number>> = {
  6: { easy: 62, medium: 135, hard: 924, expert: 971, extreme: 1300 },
  7: { easy: 85, medium: 206, hard: 3838, expert: 3921, extreme: 5412 },
  8: { easy: 125, medium: 253, hard: 10554, expert: 10554, extreme: 11000 },
};

/** Nearest measured grid size, so unmeasured sizes still classify sensibly. */
function nearestMeasuredSize(size: number): number {
  const sizes = Object.keys(MEASURED_MEDIAN_NODES).map(Number);
  return sizes.reduce((best, s) => (Math.abs(s - size) < Math.abs(best - size) ? s : best), sizes[0]!);
}

/**
 * Tier medians for a size, forced monotonically increasing.
 *
 * The raw 8x8 measurements are not monotone (expert and extreme tie, and
 * an earlier policy had medium above hard). Classification needs an
 * ordered ladder or the buckets overlap incoherently, so a running
 * maximum is applied — a tier can never be classified as easier than the
 * tier below it, whatever the raw numbers say.
 */
function monotoneMedians(size: number): Record<Difficulty, number> {
  const raw = MEASURED_MEDIAN_NODES[nearestMeasuredSize(size)]!;
  const out = {} as Record<Difficulty, number>;
  let running = 0;
  for (const tier of CALIBRATION_TIERS) {
    running = Math.max(running * 1.05, raw[tier]);
    out[tier] = running;
  }
  return out;
}

/**
 * Boundaries between adjacent tiers, at the geometric mean of their
 * medians. Geometric rather than arithmetic because effort grows
 * multiplicatively with size — an arithmetic midpoint between 253 and
 * 10554 sits far closer to the easy end than it should.
 */
function thresholdsFor(size: number): number[] {
  const medians = monotoneMedians(size);
  const bounds: number[] = [];
  for (let i = 0; i < CALIBRATION_TIERS.length - 1; i++) {
    const lo = medians[CALIBRATION_TIERS[i]!]!;
    const hi = medians[CALIBRATION_TIERS[i + 1]!]!;
    bounds.push(Math.sqrt(lo * hi));
  }
  return bounds;
}

/** The tier a puzzle's measured depth actually earns, at this grid size. */
export function classifyDepth(size: number, depth: SolveDepth): Difficulty {
  const bounds = thresholdsFor(size);
  for (let i = 0; i < bounds.length; i++) {
    if (depth.nodes < bounds[i]!) return CALIBRATION_TIERS[i]!;
  }
  return CALIBRATION_TIERS[CALIBRATION_TIERS.length - 1]!;
}

/**
 * How far a measured tier sits from the requested one, in ladder steps.
 * 0 means the label is honest; the sign says which way it is wrong.
 */
export function tierDistance(requested: Difficulty, measured: Difficulty): number {
  return CALIBRATION_TIERS.indexOf(measured) - CALIBRATION_TIERS.indexOf(requested);
}

/**
 * Whether a puzzle may ship under its requested label.
 *
 * One step of slack is deliberate. The measured bands overlap heavily —
 * the p10-p90 spread inside a single tier is wider than the gap between
 * neighbouring tiers — so demanding an exact match would reject most
 * perfectly good puzzles and make generation crawl. Two steps out is a
 * real mislabel and is never allowed.
 */
export function isAcceptableForTier(
  requested: Difficulty,
  size: number,
  depth: SolveDepth,
): boolean {
  return Math.abs(tierDistance(requested, classifyDepth(size, depth))) <= 1;
}

/**
 * The grid size a tier is designed around.
 *
 * This is the fifth lever. Clue policy alone separates about four levels
 * before the drop budget saturates; grid size is what makes the top of
 * the ladder genuinely harder rather than nominally harder. Callers that
 * let the reader pin a grid size explicitly should honour that instead —
 * this is the default when they haven't.
 */
export function recommendedGridSize(tier: Difficulty): number {
  switch (tier) {
    case "easy":
    case "medium":
      return 6;
    case "hard":
    case "expert":
      return 7;
    case "extreme":
      return 8;
  }
}
