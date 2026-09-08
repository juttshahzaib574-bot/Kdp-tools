import type { Verdict } from "./verdict";

export interface Cell {
  row: number;
  col: number;
}

export interface Room {
  name: string;
  cells: Cell[];
}

export interface Landmark {
  cell: Cell;
  name: string;
}

export interface FloorPlan {
  size: number;
  rooms: Room[];
  landmarks: Landmark[];
  /** occupyMask[row][col] === true means a suspect can be seated there. */
  occupyMask: boolean[][];
}

export interface Suspect {
  id: string;
  /**
   * The printed name — given name and surname together. This is the one
   * field every renderer, clue and title reads, and the one a publisher's
   * rename override replaces, so it holds the whole name rather than half
   * of it.
   */
  name: string;
  /**
   * The two halves, kept alongside the printed name. Nothing needs them
   * yet; they exist so a clue voice can say "Ashford" or "Miss Ashford"
   * without re-parsing a string that a rename override may have replaced
   * with anything at all.
   */
  givenName: string;
  surname: string;
  heightIn: number;
}

/** suspectId -> the cell they occupy in the solution. */
export type Assignment = Record<string, Cell>;

export interface Clue {
  suspectId: string;
  text: string;
}

/**
 * The evidence layer: every suspect carries exactly one distinct object,
 * and a second set of clues pins which. This is a fully orthogonal
 * deduction dimension on top of seating — the solver verifies it
 * separately (see objects.ts) and the reader has to nail the seating
 * first before most evidence clues can be resolved.
 */
/**
 * What an evidence clue SAYS, in a form the technique solver can reason
 * over from both directions.
 *
 * The predicate form ("does this object assignment violate the clue?")
 * is enough to verify a puzzle, and it was all the evidence layer used
 * to carry. It is not enough to SOLVE one the way a reader does, because
 * it hides the direction that matters: "the letter opener was in the 3rd
 * row" plus "Ava carries the letter opener" tells you where Ava sits.
 * A predicate over object assignments alone can never say that — it
 * takes the seating as already known.
 *
 * So the clue's content travels alongside its text as plain data. That
 * is what makes the cross-layer rung real reasoning rather than a label:
 * the object layer can move the seating grid, not just read from it.
 */
export type EvidenceFact =
  | { kind: "personHas"; suspectId: string; object: string }
  | { kind: "personLacks"; suspectId: string; object: string }
  | { kind: "objectInRoom"; object: string; roomName: string }
  | { kind: "objectInRow"; object: string; row: number }
  | { kind: "objectInColumn"; object: string; col: number }
  | { kind: "objectHeldByRank"; object: string; rank: number };

export interface EvidenceClue {
  text: string;
  /**
   * Plain-data form of the same statement. Serializable, so it survives
   * the worker and database boundaries the clue predicates cannot.
   */
  fact: EvidenceFact;
}

/** suspectId -> the object they carried in the solution. */
export type ObjectAssignment = Record<string, string>;

/**
 * All five tiers are engine-native: each one picks a different starting
 * clue-strength AND a different extra-clue budget (see clues.ts), so a
 * Extreme-tier book is measurably harder than an Expert one, not just
 * relabeled. Kept in the exact order of the UI ladder in
 * @kdp/shared/difficulty so DifficultyTier and Difficulty are the same
 * string set.
 */
export type Difficulty = "easy" | "medium" | "hard" | "expert" | "extreme";

export interface GridMysteryPuzzle {
  /** The theme's DISPLAY name — "Sunnybrook Farm". Printed, not matched on. */
  theme: string;
  /**
   * The theme's stable id — "farm". Separate from `theme` because that
   * field holds a display name, and code that needed to match on a theme
   * had nothing else to reach for: the art resolver filtered props by
   * `puzzle.theme` and silently matched nothing, so every prop fell back
   * to its procedural glyph while portraits and floors (which do not
   * filter by theme) rendered fine.
   */
  themeId: string;
  difficulty: Difficulty;
  floorPlan: FloorPlan;
  suspects: Suspect[];
  solution: Assignment;
  clues: Clue[];
  /**
   * The murder victim. They occupy a seat like everyone else, and their
   * room holds exactly two people in the solution — so once the grid is
   * solved, the *other* occupant of the victim's room is the culprit.
   * That makes "who did it?" a real final deduction step rather than an
   * arbitrary reveal the reader could never have derived.
   */
  victimSuspectId: string;
  culpritSuspectId: string;
  crimeRoomName: string;
  /** Object carried by each suspect — the evidence layer's solution. */
  objects: ObjectAssignment;
  /** Clues pinning the object layer, printed as their own "Evidence" block. */
  evidenceClues: EvidenceClue[];
  /** The culprit's object — named as the murder weapon in the answer key. */
  murderWeapon: string;
  /**
   * How the solved grid names the murderer, and in which words.
   *
   * Was a constant — every puzzle at every tier ended "whoever shared
   * their room is the murderer", so the last step of an Extreme puzzle
   * was the same lookup as an Easy one and that sentence printed
   * identically on every page of every book. See verdict.ts.
   */
  verdict: Verdict;
  /**
   * How much searching it took to prove this puzzle's clue set has
   * exactly one solution, measured on the generator's own final
   * verification solve (see solve.ts SolveStats).
   *
   * This is what the difficulty label is CALIBRATED against: a tier is
   * only honest if the puzzle actually demands the work that tier
   * promises. Recorded on the puzzle so the value that gated it is the
   * same value the ledger and the UI report — not a re-derived guess.
   */
  solveDepth: { nodes: number; backtracks: number };
  /**
   * The tier originally asked for. Differs from `difficulty` only when
   * calibration re-tiered the puzzle because its measured depth did not
   * match the request — see calibration.ts. Kept so the ledger records
   * what happened rather than quietly showing the corrected value.
   */
  requestedDifficulty: Difficulty;
  /**
   * What solving this actually takes, measured rather than asserted.
   *
   * The tier label is a summary of this, and this is the audit trail
   * behind it: the rung of the reasoning ladder the puzzle forces, how
   * far the deductions cascade, and the techniques that fired. Printed
   * on the review card so a publisher can check the claim instead of
   * trusting it — see tier-contract.ts for what each rung means.
   */
  logicProfile: {
    /** Lowest technique ceiling that reaches the answer with zero guesses. */
    solvedAt: "direct" | "elimination" | "relational" | "crossLayer";
    /** Longest run of deductions that cascade from one another. */
    chain: number;
    /** Every technique that fired, easiest first. */
    techniques: readonly string[];
    /** One line for the card, e.g. "elimination · relational · cross-layer". */
    summary: string;
  };
}
