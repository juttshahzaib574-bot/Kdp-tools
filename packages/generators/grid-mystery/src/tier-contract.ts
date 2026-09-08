import type { ClueConstraint } from "./solve";
import {
  type SolvableInput,
  type Technique,
  type TechniqueProfile,
  solveByTechnique,
  structureClues,
} from "./technique-solver";
import type { Difficulty } from "./types";

// The tier contract.
//
// A tier is a promise about the REASONING a puzzle demands, and until
// now it was enforced from one side only: a puzzle had to be solvable
// without guessing, and that was it. So five labels sat on two bands —
// Medium, Hard, Expert and Extreme all landed at the same clue count and
// differed only in how obliquely the clues were worded. Extreme did not
// feel four steps past Medium because it wasn't.
//
// The fix is not to take clues away again. Withholding information
// doesn't make a puzzle harder to REASON about; it makes it impossible
// to reason about, which is the failure mode that fills a book's reviews
// with "this one can't be solved". Difficulty has to come from the
// technique the puzzle forces.
//
// So every puzzle is graded the way sudoku is graded: by the lowest
// technique ceiling that solves it with no guessing at all. That single
// number certifies in BOTH directions at once — a puzzle solvable at
// elimination can never earn Hard, because elimination is lower than
// relational and the grade is the LOWEST ceiling that works. There is no
// separate "and check it isn't too easy" step to forget.

/** How long a chain of consecutive deductions Extreme has to sustain. */
export const EXTREME_MIN_CHAIN = 4;

export interface TierContract {
  /** The rung this tier's puzzles must actually need. */
  requires: Technique;
  /** Deductions that must cascade from one another, at minimum. */
  minChain: number;
}

export const TIER_CONTRACT: Record<Difficulty, TierContract> = {
  /** Read the clues, cross off what they say. Nothing plays off anything else. */
  easy: { requires: "direct", minChain: 0 },
  /** Counting arguments: a row only one guest can be in is theirs. */
  medium: { requires: "elimination", minChain: 0 },
  /** Clues played against each other — one guest's options cut down by another's. */
  hard: { requires: "relational", minChain: 0 },
  /** The grid cannot be finished without working the evidence block back into it. */
  expert: { requires: "crossLayer", minChain: 0 },
  /** Cross-layer, and sustained: a long cascade rather than one lucky crossing. */
  extreme: { requires: "crossLayer", minChain: EXTREME_MIN_CHAIN },
};

/**
 * The ladder in order, so "the lowest ceiling that works" is a scan.
 * caseSplit is deliberately absent: a puzzle that needs it is not
 * solvable by reasoning, and no tier is allowed to require guessing.
 */
export type DeductiveTechnique = Exclude<Technique, "caseSplit">;

const DEDUCTIVE_CEILINGS: readonly DeductiveTechnique[] = [
  "direct",
  "elimination",
  "relational",
  "crossLayer",
];

export interface TierGrade {
  /**
   * Lowest ceiling that reaches the answer with zero what-ifs, or null
   * when no amount of pure reasoning gets there.
   */
  solvedAt: DeductiveTechnique | null;
  /** Longest cascade of consecutive deductions at that ceiling. */
  chain: number;
  /** The tier this puzzle has actually earned, or null if it earns none. */
  earned: Difficulty | null;
  /** The full profile at the grading ceiling — what the card prints. */
  profile: TechniqueProfile | null;
}

/**
 * Grades a puzzle by the reasoning it forces.
 *
 * Walks the ladder from the bottom and stops at the first rung that
 * solves cleanly. Stopping at the FIRST is the whole point: it is what
 * makes the grade a two-sided claim rather than an upper bound.
 */
export function gradePuzzle(
  puzzle: SolvableInput,
  constraints: readonly ClueConstraint[],
): TierGrade {
  // One structure recovery for all four attempts — see solveByTechnique's
  // `prepared` argument for why that matters.
  const prepared = structureClues(puzzle, constraints);
  for (const ceiling of DEDUCTIVE_CEILINGS) {
    const profile = solveByTechnique(puzzle, constraints, ceiling, prepared);
    if (!profile.solved || profile.splits > 0) continue;
    return {
      solvedAt: ceiling,
      chain: profile.longestChain,
      earned: tierFor(ceiling, profile.longestChain),
      profile,
    };
  }
  return { solvedAt: null, chain: 0, earned: null, profile: null };
}

/** Which tier a grade earns. The inverse of TIER_CONTRACT. */
export function tierFor(solvedAt: DeductiveTechnique, chain: number): Difficulty {
  switch (solvedAt) {
    case "direct":
      return "easy";
    case "elimination":
      return "medium";
    case "relational":
      return "hard";
    default:
      // Cross-layer splits into two by how far the reasoning cascades.
      // A single crossing that immediately resolves the grid is Expert;
      // one that has to be carried through a long chain is Extreme.
      return chain >= EXTREME_MIN_CHAIN ? "extreme" : "expert";
  }
}

/**
 * Does this puzzle honestly deserve the label being asked for?
 *
 * Equality against the earned tier, not "at least as hard as" — a
 * Medium puzzle printed under an Extreme heading and an Extreme puzzle
 * printed under a Medium one are both broken promises, and the second
 * one costs a reader an evening.
 */
export function certifiesAs(
  puzzle: SolvableInput,
  constraints: readonly ClueConstraint[],
  tier: Difficulty,
): boolean {
  return gradePuzzle(puzzle, constraints).earned === tier;
}
