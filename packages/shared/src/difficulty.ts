// The five-tier difficulty ladder.
//
// Each tier names the REASONING its puzzles demand, not how many clues
// they withhold. Withholding clues is how a puzzle stops being solvable
// at all — it keeps a unique answer while destroying the route to it —
// so the ladder is built on technique instead:
//
//   Easy     read the clues off; nothing plays against anything else
//   Medium   counting arguments (a row only one guest can be in is theirs)
//   Hard     clues played against each other — arc consistency
//   Expert   the grid can't be finished without working the evidence
//            block back into it
//   Extreme  the same, sustained through a long chain of deductions
//
// A puzzle is graded by the LOWEST rung that solves it with no guessing,
// which certifies the label from both sides at once: too easy fails as
// surely as too hard. See tier-contract.ts in the generator for the
// contract and its enforcement, and clues.ts DIFFICULTY_CONFIG for the
// search policy that aims at each band.
export const DIFFICULTY_TIERS = [
  { id: "easy", label: "Easy" },
  { id: "medium", label: "Medium" },
  { id: "hard", label: "Hard" },
  { id: "expert", label: "Expert" },
  { id: "extreme", label: "Brain-Melting" },
] as const;

export type DifficultyTier = (typeof DIFFICULTY_TIERS)[number]["id"];
/** Alias kept so existing call sites reading "engine difficulty" still typecheck; they're the same set of ids. */
export type EngineDifficulty = DifficultyTier;

export const DIFFICULTY_TIER_IDS = DIFFICULTY_TIERS.map((t) => t.id) as [
  DifficultyTier,
  ...DifficultyTier[],
];

/**
 * Tier ids are stable and internal; the words shown to a reader are not.
 * A publisher may want "Gentle / Steady / Testing / Fiendish / Impossible"
 * on their own list, and the ladder should not need a code change for
 * that — so display labels are looked up through here rather than read
 * off DIFFICULTY_TIERS directly.
 */
export type DifficultyLabels = Record<DifficultyTier, string>;

export const DEFAULT_DIFFICULTY_LABELS: DifficultyLabels = Object.fromEntries(
  DIFFICULTY_TIERS.map((t) => [t.id, t.label]),
) as DifficultyLabels;

export function difficultyLabel(tier: DifficultyTier, labels?: Partial<DifficultyLabels>): string {
  return labels?.[tier] ?? DEFAULT_DIFFICULTY_LABELS[tier];
}

/** Position on the ladder, 1-5. Used by the mix planner and by ramp ordering. */
export function difficultyRank(tier: DifficultyTier): number {
  return DIFFICULTY_TIERS.findIndex((t) => t.id === tier) + 1;
}

/**
 * Tier ids that this build no longer uses, mapped to their replacement.
 *
 * The fifth tier was called "dragon" before it was renamed to "extreme".
 * A book saved under the old id must still open — its inputParams are
 * stored JSON, not code — so the input schema runs values through here
 * before validating. Without it, every previously-saved book at that tier
 * would fail validation and become unopenable.
 */
const LEGACY_TIER_IDS: Record<string, DifficultyTier> = {
  dragon: "extreme",
};

/** Normalises a possibly-legacy tier id. Unknown values pass through for the schema to reject. */
export function normalizeDifficultyTier(value: unknown): unknown {
  return typeof value === "string" && value in LEGACY_TIER_IDS ? LEGACY_TIER_IDS[value] : value;
}

/**
 * Kept as an identity function so the mapping seam in worker/web code
 * stays put — any future re-introduction of a UI-only alias (say, a
 * marketing tier that reuses an engine tier) plugs in here without
 * touching every call site again.
 */
export function toEngineDifficulty(tier: DifficultyTier): EngineDifficulty {
  return tier;
}
