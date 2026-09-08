import { DIFFICULTY_TIERS, difficultyRank, type DifficultyTier } from "./difficulty";

// The mix planner: turning "I want 100 puzzles" into an ordered list of
// tiers.
//
// Three ways to say what you want, because publishers think about it
// three different ways: weights (a shape), explicit counts (a contract),
// or percentages (a ratio). All three resolve to the same thing — an
// exact per-tier count that sums to the requested total, ordered easiest
// to hardest so the book ramps.
//
// Integer rounding is the whole difficulty here. Weights and percentages
// almost never divide evenly into a puzzle count, and the leftover has
// to go somewhere explicit; silently dropping it or silently padding the
// first tier both produce books that don't match what was asked for.

export const MIX_MODES = ["ramp", "sequence", "percent"] as const;
export type MixMode = (typeof MIX_MODES)[number];

/**
 * Where a SEQUENCE plan's shortfall goes.
 *
 * Only custom sequences need this. An explicit list of counts may not
 * add up to the book length — someone asks for 30 puzzles and types
 * rows totalling 28 — and the two spare slots have to go somewhere the
 * author chose. Default is the hardest tier they selected, because a
 * book that lands slightly harder than asked reads as generous while one
 * that lands easier reads as short-changed.
 *
 * Weighted plans (ramp and percent) do NOT use this: their rounding is
 * largest-remainder, which stays closest to the shape that was asked
 * for. See planMix.
 */
export type RemainderPolicy = (typeof REMAINDER_POLICIES)[number];

export const REMAINDER_POLICIES = [
  "add_to_hardest_selected",
  "add_to_easiest_selected",
  "distribute_evenly",
] as const;

/** Default ramp shape: a gentle opening, a fat middle, a real finish. */
export const DEFAULT_RAMP_WEIGHTS: Record<DifficultyTier, number> = {
  easy: 10,
  medium: 25,
  hard: 30,
  expert: 20,
  extreme: 15,
};

export interface MixPlanInput {
  total: number;
  mode: MixMode;
  /** ramp/percent: relative weight per tier. Omitted tiers count as 0. */
  weights?: Partial<Record<DifficultyTier, number>>;
  /** sequence: explicit counts, in the order given. Up to 5 rows. */
  sequence?: { tier: DifficultyTier; count: number }[];
  remainderPolicy?: RemainderPolicy;
}

export interface MixPlan {
  /** Exact count per tier. Always sums to `total`. */
  counts: Record<DifficultyTier, number>;
  /** One entry per puzzle, ordered easiest to hardest. Length === total. */
  order: DifficultyTier[];
  /** Rough generation seconds, weighted by how much search each tier costs. */
  estimatedSeconds: number;
}

/** Relative generation cost per tier — harder tiers search more (see calibration). */
const COST_WEIGHT: Record<DifficultyTier, number> = {
  easy: 0.4,
  medium: 0.6,
  hard: 1.4,
  expert: 1.6,
  extreme: 2.2,
};

const ALL_TIERS = DIFFICULTY_TIERS.map((t) => t.id);

function emptyCounts(): Record<DifficultyTier, number> {
  return Object.fromEntries(ALL_TIERS.map((t) => [t, 0])) as Record<DifficultyTier, number>;
}

/**
 * Applies the leftover from integer rounding.
 *
 * `selected` is the set of tiers the plan actually asked for — the
 * remainder must land inside it, or a plan of "easy and medium only"
 * would sprout an Extreme puzzle nobody requested.
 */
function applyRemainder(
  counts: Record<DifficultyTier, number>,
  remainder: number,
  selected: DifficultyTier[],
  policy: RemainderPolicy,
): void {
  if (remainder === 0 || selected.length === 0) return;
  const byRank = [...selected].sort((a, b) => difficultyRank(a) - difficultyRank(b));

  if (policy === "distribute_evenly") {
    // Round-robin from the easiest selected tier, so the shape stays
    // closest to what was asked for.
    let i = 0;
    let left = remainder;
    while (left > 0) {
      counts[byRank[i % byRank.length]!] += 1;
      left--;
      i++;
    }
    return;
  }
  const target =
    policy === "add_to_easiest_selected" ? byRank[0]! : byRank[byRank.length - 1]!;
  counts[target] += remainder;
}

/** Expands per-tier counts into one ordered list, easiest to hardest. */
function rampOrder(counts: Record<DifficultyTier, number>): DifficultyTier[] {
  const order: DifficultyTier[] = [];
  for (const tier of ALL_TIERS) {
    for (let i = 0; i < counts[tier]; i++) order.push(tier);
  }
  return order;
}

function estimateSeconds(counts: Record<DifficultyTier, number>): number {
  const raw = ALL_TIERS.reduce((sum, t) => sum + counts[t] * COST_WEIGHT[t], 0);
  return Math.round(raw * 10) / 10;
}

/**
 * Resolves a plan into exact counts.
 *
 * The invariant every mode shares: `counts` sums to exactly `total`, and
 * `order` has exactly `total` entries. A planner that returns 99 puzzles
 * for a 100-puzzle book is worse than useless, so both are enforced here
 * rather than left to the caller.
 */
export function planMix(input: MixPlanInput): MixPlan {
  const total = Math.max(0, Math.floor(input.total));
  const policy = input.remainderPolicy ?? "add_to_hardest_selected";
  const counts = emptyCounts();

  if (total === 0) {
    return { counts, order: [], estimatedSeconds: 0 };
  }

  if (input.mode === "sequence") {
    // Explicit counts are a contract: honour them exactly, clamped so
    // they can't overshoot the book, and give any shortfall to the
    // remainder policy.
    const rows = (input.sequence ?? []).slice(0, ALL_TIERS.length);
    let used = 0;
    for (const row of rows) {
      const take = Math.max(0, Math.min(Math.floor(row.count), total - used));
      counts[row.tier] += take;
      used += take;
    }
    const selected = rows.length > 0 ? rows.map((r) => r.tier) : ALL_TIERS.slice();
    applyRemainder(counts, total - used, selected, policy);
    return { counts, order: rampOrder(counts), estimatedSeconds: estimateSeconds(counts) };
  }

  // ramp and percent are the same computation — both are a weighting.
  // "percent" only differs in that its numbers are expected to sum to
  // 100, which the normalisation below makes irrelevant.
  const weights = input.weights ?? (input.mode === "ramp" ? DEFAULT_RAMP_WEIGHTS : {});
  const selected = ALL_TIERS.filter((t) => (weights[t] ?? 0) > 0);
  const weightSum = selected.reduce((s, t) => s + (weights[t] ?? 0), 0);
  if (weightSum <= 0) {
    // No usable weights: fall back to the default ramp rather than
    // returning an empty book.
    return planMix({ ...input, weights: DEFAULT_RAMP_WEIGHTS, mode: "ramp" });
  }

  // LARGEST REMAINDER, not floor-then-dump.
  //
  // A weighting is a shape, and the job of rounding it to whole puzzles
  // is to stay as close to that shape as integers allow. Flooring every
  // tier and giving the whole leftover to one of them does the opposite:
  // on the default 10/25/30/20/15 ramp at 30 puzzles the exact shares
  // are 3 / 7.5 / 9 / 6 / 4.5, and dumping both leftover seats on the
  // hardest tier yields 3/7/9/6/5 — a book measurably harder than the
  // ramp asked for, and it drifts further the shorter the book is.
  //
  // Largest remainder hands each spare seat to whichever tier was cut
  // by the most, giving 3/8/9/6/4. Ties go to the EASIER tier, so a
  // rounding coin-flip never makes a book harder than requested.
  const exact = selected.map((tier) => (total * (weights[tier] ?? 0)) / weightSum);
  let used = 0;
  selected.forEach((tier, i) => {
    counts[tier] = Math.floor(exact[i]!);
    used += counts[tier];
  });

  const spare = total - used;
  if (spare > 0) {
    const byRemainder = selected
      .map((tier, i) => ({ tier, remainder: exact[i]! - Math.floor(exact[i]!) }))
      // Ties broken by ladder position, easiest first.
      .sort((a, b) => b.remainder - a.remainder || difficultyRank(a.tier) - difficultyRank(b.tier));
    for (let i = 0; i < spare; i++) {
      counts[byRemainder[i % byRemainder.length]!.tier] += 1;
    }
  }
  return { counts, order: rampOrder(counts), estimatedSeconds: estimateSeconds(counts) };
}

export interface MixPreset {
  id: string;
  label: string;
  description: string;
  build(total: number): MixPlanInput;
}

/**
 * Named starting points. Each is expressed as WEIGHTS rather than fixed
 * counts so it scales to any book length, except where the preset's
 * whole point is an exact hundred-puzzle shape.
 */
export const MIX_PRESETS: readonly MixPreset[] = [
  {
    id: "cozy",
    label: "Cozy Starter",
    description: "Gentle all the way through — nothing above Hard.",
    build: (total) => ({
      total,
      mode: "percent",
      weights: { easy: 20, medium: 50, hard: 30 },
    }),
  },
  {
    id: "classic100",
    label: "Classic 100",
    description: "The full ladder, weighted toward the middle.",
    build: (total) => ({
      total,
      mode: "percent",
      weights: { easy: 10, medium: 25, hard: 30, expert: 20, extreme: 15 },
    }),
  },
  {
    id: "gauntlet",
    label: "Gauntlet",
    description: "Warms up fast and stays punishing.",
    build: (total) => ({
      total,
      mode: "percent",
      weights: { easy: 5, medium: 15, hard: 30, expert: 25, extreme: 25 },
    }),
  },
];

export function presetById(id: string): MixPreset | undefined {
  return MIX_PRESETS.find((p) => p.id === id);
}
