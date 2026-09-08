import {
  isCattyCorner,
  isEastOf,
  isNorthOf,
  isSouthOf,
  isWallAdjacent,
  isWestOf,
  landmarkAdjacentTo,
  ordinal,
  roomNameAt,
} from "./geometry";
import {
  COMPOUND,
  DIRECT_COLUMN,
  DIRECT_ROOM,
  DIRECT_ROW,
  DIRECT_WALL,
  REL_CARDINAL,
  REL_LANDMARK,
  REL_SAME_COLUMN,
  REL_SAME_ROW,
  STRONG_CATTY,
  STRONG_DIAGONAL,
  STRONG_DISTANCE,
  STRONG_HEIGHT,
  STRONG_SAME_ROOM,
  phrase,
} from "./phrasings";
import { type Rng, randInt, shuffle } from "./rng";
import type { ClueConstraint } from "./solve";
import { countSolutions, SolverBudgetExceededError } from "./solve";
import { techniqueRank, type SolvableInput } from "./technique-solver";
import { TIER_CONTRACT, gradePuzzle, type TierGrade } from "./tier-contract";
import { suspectToken } from "./text-template";
import type { Assignment, Clue, Difficulty, FloorPlan, Suspect } from "./types";

type Tier = "direct" | "relational" | "strong";

interface Candidate extends ClueConstraint {
  tier: Tier;
  /**
   * A predicate-phrase form of this clue ("in the Library", "against one
   * of the outer walls") with the subject and verb stripped off. Only
   * set on candidates whose constraint reads naturally after "X was …",
   * which is what lets two of them be joined into one compound card
   * without splicing finished sentences together. Candidates without a
   * fragment simply never appear in a compound.
   */
  fragment?: string;
}

/**
 * Builds every clue candidate the algorithm may pick for one suspect,
 * across all three tiers. New archetypes go here — the escalation loop
 * and phrasings module both take care of themselves.
 */
function buildCandidates(
  suspect: Suspect,
  others: readonly Suspect[],
  floorPlan: FloorPlan,
  solution: Assignment,
  suspectsByHeightDesc: readonly Suspect[],
  rng: Rng,
): Candidate[] {
  const cell = solution[suspect.id]!;
  const candidates: Candidate[] = [];
  // Clue text is stored as a template — names are substituted at render
  // time so a rename never requires re-solving. See text-template.ts.
  const self = suspectToken(suspect.id);

  // ---- Direct tier ----
  candidates.push({
    tier: "direct",
    suspectId: suspect.id,
    text: phrase(rng, DIRECT_COLUMN, { name: self, col: cell.col + 1 }),
    fragment: `in the ${ordinal(cell.col + 1)} column`,
    isSatisfied: (a) => !a[suspect.id] || a[suspect.id]!.col === cell.col,
  });
  candidates.push({
    tier: "direct",
    suspectId: suspect.id,
    text: phrase(rng, DIRECT_ROW, { name: self, row: cell.row + 1 }),
    fragment: `in the ${ordinal(cell.row + 1)} row`,
    isSatisfied: (a) => !a[suspect.id] || a[suspect.id]!.row === cell.row,
  });

  const roomName = roomNameAt(floorPlan, cell);
  candidates.push({
    tier: "direct",
    suspectId: suspect.id,
    text: phrase(rng, DIRECT_ROOM, { name: self, room: roomName }),
    fragment: `in the ${roomName}`,
    isSatisfied: (a) => !a[suspect.id] || roomNameAt(floorPlan, a[suspect.id]!) === roomName,
  });

  if (isWallAdjacent(cell, floorPlan.size)) {
    candidates.push({
      tier: "direct",
      suspectId: suspect.id,
      text: phrase(rng, DIRECT_WALL, { name: self }),
      fragment: "against one of the outer walls",
      isSatisfied: (a) => !a[suspect.id] || isWallAdjacent(a[suspect.id]!, floorPlan.size),
    });
  }

  // ---- Relational tier ----
  const landmarkName = landmarkAdjacentTo(floorPlan, cell);
  if (landmarkName) {
    candidates.push({
      tier: "relational",
      suspectId: suspect.id,
      text: phrase(rng, REL_LANDMARK, { name: self, landmark: landmarkName }),
      fragment: `beside a ${landmarkName}`,
      isSatisfied: (a) =>
        !a[suspect.id] || landmarkAdjacentTo(floorPlan, a[suspect.id]!) === landmarkName,
    });
  }

  // Comparisons against a random subset of other suspects — bounding here
  // instead of building against all N-1 keeps the candidate pool tractable
  // as gridSize grows.
  const comparisonPool = shuffle(rng, others).slice(0, Math.min(others.length, 6));
  for (const other of comparisonPool) {
    const otherCell = solution[other.id]!;
    const otherToken = suspectToken(other.id);
    const ns = isSouthOf(cell, otherCell) ? "south" : "north";
    const ew = isEastOf(cell, otherCell) ? "east" : "west";

    if (cell.row !== otherCell.row) {
      candidates.push({
        tier: "relational",
        suspectId: suspect.id,
        text: phrase(rng, REL_CARDINAL, { name: self, other: otherToken, dir: ns }),
        fragment: `${ns} of ${otherToken}`,
        isSatisfied: (a) => {
          const mine = a[suspect.id];
          const theirs = a[other.id];
          if (!mine || !theirs) return true;
          return ns === "south" ? isSouthOf(mine, theirs) : isNorthOf(mine, theirs);
        },
      });
    }
    if (cell.col !== otherCell.col) {
      candidates.push({
        tier: "relational",
        suspectId: suspect.id,
        text: phrase(rng, REL_CARDINAL, { name: self, other: otherToken, dir: ew }),
        fragment: `${ew} of ${otherToken}`,
        isSatisfied: (a) => {
          const mine = a[suspect.id];
          const theirs = a[other.id];
          if (!mine || !theirs) return true;
          return ew === "east" ? isEastOf(mine, theirs) : isWestOf(mine, theirs);
        },
      });
    }

    // Same-row / same-column (only ever seatable when at least two seats
    // in that line are occupiable — which by construction of the mask is
    // often the case, but not always at higher gridSize). Cheap to guard
    // in the isSatisfied itself; false only when both are placed and
    // don't match.
    if (cell.row === otherCell.row) {
      candidates.push({
        tier: "relational",
        suspectId: suspect.id,
        text: phrase(rng, REL_SAME_ROW, { name: self, other: otherToken }),
        isSatisfied: (a) => {
          const mine = a[suspect.id];
          const theirs = a[other.id];
          if (!mine || !theirs) return true;
          return mine.row === theirs.row;
        },
      });
    }
    if (cell.col === otherCell.col) {
      candidates.push({
        tier: "relational",
        suspectId: suspect.id,
        text: phrase(rng, REL_SAME_COLUMN, { name: self, other: otherToken }),
        isSatisfied: (a) => {
          const mine = a[suspect.id];
          const theirs = a[other.id];
          if (!mine || !theirs) return true;
          return mine.col === theirs.col;
        },
      });
    }

    // ---- Strong tier ----
    if (cell.row !== otherCell.row && cell.col !== otherCell.col) {
      candidates.push({
        tier: "strong",
        suspectId: suspect.id,
        text: phrase(rng, STRONG_DIAGONAL, { name: self, other: otherToken, ns, ew }),
        isSatisfied: (a) => {
          const mine = a[suspect.id];
          const theirs = a[other.id];
          if (!mine || !theirs) return true;
          const nsOk = ns === "south" ? isSouthOf(mine, theirs) : isNorthOf(mine, theirs);
          const ewOk = ew === "east" ? isEastOf(mine, theirs) : isWestOf(mine, theirs);
          return nsOk && ewOk;
        },
      });
    }

    if (isCattyCorner(cell, otherCell)) {
      candidates.push({
        tier: "strong",
        suspectId: suspect.id,
        text: phrase(rng, STRONG_CATTY, { name: self, other: otherToken }),
        isSatisfied: (a) => {
          const mine = a[suspect.id];
          const theirs = a[other.id];
          return !mine || !theirs || isCattyCorner(mine, theirs);
        },
      });
    }

    // Same-room across a boundary: sharpest room-pinning clue we have
    // when the shared room contains many occupiable cells.
    const otherRoom = roomNameAt(floorPlan, otherCell);
    if (roomName === otherRoom) {
      candidates.push({
        tier: "strong",
        suspectId: suspect.id,
        text: phrase(rng, STRONG_SAME_ROOM, {
          name: self,
          other: otherToken,
          room: roomName,
        }),
        isSatisfied: (a) => {
          const mine = a[suspect.id];
          const theirs = a[other.id];
          if (!mine || !theirs) return true;
          return roomNameAt(floorPlan, mine) === roomNameAt(floorPlan, theirs);
        },
      });
    }

    // Exact-distance clues — only when the two suspects are on the same
    // row or column, otherwise the phrasing has to name two distances
    // and the text loses its punch.
    if (cell.row === otherCell.row && cell.col !== otherCell.col) {
      const n = Math.abs(cell.col - otherCell.col);
      candidates.push({
        tier: "strong",
        suspectId: suspect.id,
        text: phrase(rng, STRONG_DISTANCE, {
          name: self,
          other: otherToken,
          axis: "columns",
          dir: ew,
          n,
        }),
        isSatisfied: (a) => {
          const mine = a[suspect.id];
          const theirs = a[other.id];
          if (!mine || !theirs) return true;
          if (mine.row !== theirs.row) return false;
          const delta = mine.col - theirs.col;
          return ew === "east" ? delta === n : delta === -n;
        },
      });
    }
    if (cell.col === otherCell.col && cell.row !== otherCell.row) {
      const n = Math.abs(cell.row - otherCell.row);
      candidates.push({
        tier: "strong",
        suspectId: suspect.id,
        text: phrase(rng, STRONG_DISTANCE, {
          name: self,
          other: otherToken,
          axis: "rows",
          dir: ns,
          n,
        }),
        isSatisfied: (a) => {
          const mine = a[suspect.id];
          const theirs = a[other.id];
          if (!mine || !theirs) return true;
          if (mine.col !== theirs.col) return false;
          const delta = mine.row - theirs.row;
          return ns === "south" ? delta === n : delta === -n;
        },
      });
    }
  }

  const rank = suspectsByHeightDesc.findIndex((s) => s.id === suspect.id) + 1;
  candidates.push({
    tier: "strong",
    suspectId: suspect.id,
    text: phrase(rng, STRONG_HEIGHT, { rank, room: roomName }),
    isSatisfied: (a) => !a[suspect.id] || roomNameAt(floorPlan, a[suspect.id]!) === roomName,
  });

  // ---- Compound cards ----
  // Two fragments about the same suspect joined into one sentence. The
  // conjunction of two constraints is at least as constraining as either
  // alone, so these belong at the strong tier — and they read like the
  // denser clue cards a reader expects at higher difficulty ("She was in
  // the Vegetable Garden and in the 5th column") instead of two thin
  // separate lines.
  const fragmentCandidates = candidates.filter((c) => c.fragment);
  const pairs = shuffle(rng, fragmentCandidates).slice(0, 4);
  for (let i = 0; i + 1 < pairs.length; i += 2) {
    const first = pairs[i]!;
    const second = pairs[i + 1]!;
    candidates.push({
      tier: "strong",
      suspectId: suspect.id,
      text: phrase(rng, COMPOUND, {
        name: self,
        first: first.fragment!,
        second: second.fragment!,
      }),
      isSatisfied: (a) => first.isSatisfied(a) && second.isSatisfied(a),
    });
  }

  return candidates;
}

// Candidates are always sorted weakest-to-strongest so that escalation
// (triggered when a clue set is ambiguous) only ever moves toward *more*
// constraining clues, regardless of difficulty. Difficulty instead picks
// where each suspect *starts* in that list — harder puzzles start further
// along, closer to the more oblique/relational clue types.
const STRENGTH_ORDER: Tier[] = ["direct", "relational", "strong"];

/**
 * Two knobs realize each difficulty tier at generation time:
 *
 * - `startingTier` picks how far along each suspect's clue list the
 *   algorithm *starts*, so higher tiers open with more oblique clues.
 * - `dropAttempts` says how many clues we try to REMOVE from a
 *   verified-unique set while keeping it unique — the sharp version of
 *   "harder puzzle = less to work with". Every drop is only kept if the
 *   solver still finds exactly one solution, so uniqueness is preserved
 *   by construction; the result is a clue set that would still verify
 *   from scratch, only sparser.
 *
 * Expert and Extreme are engine-native, not aliases for Hard: Expert
 * removes one earned clue, Extreme removes two. That's real information
 * the solver has to make up from the remaining set.
 */
interface DifficultyConfig {
  startingTier: Tier;
  dropAttempts: number;
}
// Calibrated against measured solver effort, not guessed. The previous
// table (drops 0/0/0/1/2) made Medium, Hard and Expert nearly
// indistinguishable — all three started at relational-or-stronger and
// differed only in whether one clue was removed — and at 8x8 the order
// actually INVERTED, with Medium measuring harder than Hard. That is
// five labels over about two real difficulties.
//
// Clue count is the dominant lever on search effort: removing a verified
// clue forces the solver (and the reader) to recover that information by
// deduction. So the drop budget climbs across the whole upper ladder
// rather than only at the top, and each tier gets a distinct starting
// strength.
//
// The drop budget SATURATES, which is worth knowing before touching this
// table: a clue set stops being uniquely solvable somewhere around N-2
// clues, so budgets of 2 and 3 resolve to the same set and the two tiers
// collapse into each other. That is why the top of the ladder is
// separated by grid size as well — see recommendedGridSize in
// calibration.ts. Re-run the calibration measurement after any change
// here; the bands are derived from it, not guessed.
//
// The drop budgets below are larger than they were, and that is safe now
// in a way it was not before: every drop has to leave the puzzle still
// solvable by reasoning at the tier's own ceiling (see dropClues). A
// drop is therefore no longer a way to make a puzzle unsolvable — it is
// the lever that raises the TECHNIQUE the puzzle demands, which is what
// separates the tiers. Dropping stops the moment the target tier is
// reached, so a bigger budget means "keep trying to get there", not
// "take more away".
const DIFFICULTY_CONFIG: Record<Difficulty, DifficultyConfig> = {
  easy: { startingTier: "direct", dropAttempts: 0 },
  medium: { startingTier: "direct", dropAttempts: 2 },
  hard: { startingTier: "relational", dropAttempts: 3 },
  expert: { startingTier: "relational", dropAttempts: 4 },
  extreme: { startingTier: "relational", dropAttempts: 5 },
};

function startingIndexFor(candidates: readonly Candidate[], startingTier: Tier): number {
  const minRank = STRENGTH_ORDER.indexOf(startingTier);
  const index = candidates.findIndex((c) => STRENGTH_ORDER.indexOf(c.tier) >= minRank);
  return index === -1 ? 0 : index;
}

const MAX_ATTEMPTS = 150;
/**
 * How many fair-but-off-band clue sets to pass over before settling.
 *
 * The search escalates clue strength, which makes a puzzle EASIER, so it
 * cannot climb toward a harder rung by trying again on the same floor
 * plan indefinitely. A handful of retries catches the sets that just
 * needed a different draw; past that the seed is the problem, and
 * changing seeds is the generator's job, not this loop's.
 */
const NEAR_MISS_BUDGET = 12;

/**
 * How many clues beyond one-per-suspect the search may add, by grid size.
 *
 * One clue per suspect is enough on a small grid and demonstrably not
 * enough on a large one. Measured at 8x8: of 19,320 candidate sets the
 * escalation loop tried, 237 reached a unique solution — and 230 of
 * those had NO deductive route to it at all. Uniqueness at that size
 * comes from constraints interacting globally, which a search finds and
 * a reader cannot; the local chain a person follows just isn't there
 * with only eight clues across sixty-four squares.
 *
 * Extra clues are the fix, and they are not a way of making puzzles
 * easier for its own sake: the tier contract still grades whatever comes
 * out, so a set that ends up needing less reasoning is labelled for less
 * reasoning. What the extras buy is a puzzle that can be reasoned about
 * at all.
 */
export function extraClueBudget(size: number): number {
  if (size >= 8) return 4;
  if (size === 7) return 2;
  return 0;
}
const SOLVE_NODE_BUDGET = 250_000;

export interface VerifiedClueSet {
  clues: Clue[];
  /** The exact constraint predicates the solver confirmed unique against — kept so the caller can independently re-verify before trusting this result. */
  constraints: ClueConstraint[];
}

function tryCountSolutions(
  floorPlan: FloorPlan,
  suspectIds: readonly string[],
  constraints: readonly ClueConstraint[],
): number {
  try {
    return countSolutions(
      floorPlan.size,
      floorPlan.occupyMask,
      suspectIds,
      constraints,
      2,
      SOLVE_NODE_BUDGET,
    );
  } catch (error) {
    if (!(error instanceof SolverBudgetExceededError)) throw error;
    return 2; // "too expensive to verify" is treated as "ambiguous"
  }
}

/**
 * Tries to drop up to `dropAttempts` clues from a verified-unique set
 * while keeping it unique. Every drop is verified by re-running the
 * solver — a drop that would let a second solution appear is refused,
 * so the returned set is still solvable to exactly one answer and, in
 * fact, still passes independent verification from scratch.
 *
 * Runs against a shuffled copy so which clue gets dropped is
 * seed-dependent (deterministic per seed, different across seeds) —
 * two Expert books never lose the same clue in the same order.
 */
/** The same list with any repeated sentence removed, first occurrence kept. */
function dedupeByText(clues: readonly Candidate[]): Candidate[] {
  const seen = new Set<string>();
  return clues.filter((c) => {
    if (seen.has(c.text)) return false;
    seen.add(c.text);
    return true;
  });
}

function dropClues(
  floorPlan: FloorPlan,
  suspectIds: readonly string[],
  active: readonly Candidate[],
  dropAttempts: number,
  rng: Rng,
  /** Rejects a trimmed set a reader couldn't reason their way through. */
  stillDeducible: (clues: readonly Candidate[]) => boolean,
  /** True once the set demands exactly the technique its tier promises. */
  targetReached: (clues: readonly Candidate[]) => boolean,
): Candidate[] {
  if (dropAttempts <= 0) return [...active];

  let current = [...active];
  // Already the right difficulty — taking more away would overshoot the
  // tier, which is as dishonest as undershooting it.
  if (targetReached(current)) return current;
  const order = shuffle(
    rng,
    Array.from({ length: active.length }, (_, i) => i),
  );

  let drops = 0;
  for (const idxInOriginal of order) {
    if (drops >= dropAttempts) break;
    // Find the same candidate in `current` — the index may have shifted
    // due to earlier successful drops.
    const originalCandidate = active[idxInOriginal]!;
    const currentIndex = current.indexOf(originalCandidate);
    if (currentIndex === -1) continue;
    const trial = current.slice();
    trial.splice(currentIndex, 1);
    // Uniqueness AND deducibility. Dropping a clue is what makes a
    // puzzle harder, and it is also exactly how a puzzle stops being
    // solvable by reasoning: the answer stays unique because exhaustive
    // search still pins it, while the route a reader could follow
    // disappears. Every drop now has to survive both questions.
    if (
      tryCountSolutions(floorPlan, suspectIds, trial) === 1 &&
      stillDeducible(trial)
    ) {
      current = trial;
      drops++;
      if (targetReached(current)) break;
    }
  }
  return current;
}

/**
 * Selects one clue per suspect and verifies (via brute-force solving) that
 * the full set has exactly one solution, escalating individual clues to
 * stronger candidates until it does. For higher-difficulty tiers, also
 * tries to drop redundant clues from the verified set while preserving
 * uniqueness — a smaller unique set is a strictly harder puzzle.
 *
 * Returns null if it can't reach uniqueness within the attempt budget —
 * the caller should regenerate the underlying floor plan/solution and
 * try again rather than ship an unverified puzzle.
 */
export function generateClueSet(
  floorPlan: FloorPlan,
  suspects: readonly Suspect[],
  solution: Assignment,
  difficulty: Difficulty,
  rng: Rng,
  /** The victim — the brief tells the reader their room holds exactly two people, and the solver needs that too. */
  victimSuspectId: string,
  /**
   * The evidence block, generated first so the upper tiers can be graded
   * against it. Expert and Extreme are defined by needing it: their
   * grids cannot be finished from the seating clues alone.
   */
  evidence: SolvableInput["evidence"],
): VerifiedClueSet | null {
  const suspectsByHeightDesc = [...suspects].sort((a, b) => b.heightIn - a.heightIn);
  const suspectIds = suspects.map((s) => s.id);
  const config = DIFFICULTY_CONFIG[difficulty];
  const startingTier = config.startingTier;

  const candidatesBySuspect = new Map<string, Candidate[]>();
  for (const suspect of suspects) {
    const others = suspects.filter((s) => s.id !== suspect.id);
    const candidates = buildCandidates(
      suspect,
      others,
      floorPlan,
      solution,
      suspectsByHeightDesc,
      rng,
    );
    // Shuffle BEFORE the tier sort, which is stable — so candidates keep
    // their tier ordering but their order *within* a tier is randomised.
    //
    // Without this, every suspect at a direct-starting tier received the
    // same KIND of clue: buildCandidates pushes column, row, room, wall
    // in that order, the sort preserved it, and the selector always took
    // the first candidate at or above the starting tier. Every Easy and
    // Medium puzzle came out as six column clues in a row — monotonous
    // to solve, and a measurable duplicate-content problem, since a pool
    // of one clue type over a handful of column numbers collides across
    // a book far sooner than a mixed pool does.
    const shuffled = shuffle(rng, candidates).sort(
      (a, b) => STRENGTH_ORDER.indexOf(a.tier) - STRENGTH_ORDER.indexOf(b.tier),
    );
    // One candidate per distinct SENTENCE.
    //
    // Two different facts can phrase identically — a compound clue built
    // from a pair of relations reads the same whichever relation was
    // discovered first — and the pool held both as separate objects. The
    // extras pass then deduped by object identity, so a card could be
    // handed a second clue whose text already appeared on it: "Fenna
    // Doyle sat both north and west of Priya Marsh." printed twice, on
    // the same card, in a released page.
    //
    // Deduped after the tier sort, so the entry kept is the weakest
    // phrasing of that sentence — which is the one the escalation ladder
    // wants to start from.
    const seenText = new Set<string>();
    const distinct = shuffled.filter((c) => {
      if (seenText.has(c.text)) return false;
      seenText.add(c.text);
      return true;
    });
    candidatesBySuspect.set(suspect.id, distinct);
  }

  /**
   * Whether a reader could reach the answer by reasoning alone.
   *
   * Escalation raises clue strength until the set is unique; this makes
   * it keep going until the set is also SOLVABLE. Without it the loop
   * happily accepts a clue set whose only route to the answer is trial
   * and error — unique, verifiable, and miserable to sit down with.
   */
  const solvable: SolvableInput = { floorPlan, suspects, victimSuspectId, evidence };
  const ceiling = techniqueRank(TIER_CONTRACT[difficulty].requires);

  /**
   * Grades a candidate set, once per distinct set.
   *
   * Both questions below — "can a reader get there at all?" and "does it
   * demand the right technique?" — are answered by the same grade, and
   * the drop loop asks them back to back about the same clues. Grading
   * is the expensive operation in this file (it solves the set at up to
   * four ceilings), so asking twice doubled the cost of every drop for
   * no new information.
   *
   * Keyed on the clue texts: a set is exactly its clues, and the drop
   * loop rebuilds arrays rather than mutating them, so identity is no
   * use as a key.
   */
  const grades = new Map<string, TierGrade>();
  const grade = (clues: readonly Candidate[]): TierGrade => {
    const key = clues.map((c) => c.text).join("\u0000");
    let cached = grades.get(key);
    if (!cached) {
      cached = gradePuzzle(solvable, clues);
      grades.set(key, cached);
    }
    return cached;
  };

  /** Can a reader reason their way there, using no more than this tier's technique? */
  const deducible = (clues: readonly Candidate[]): boolean => {
    const solvedAt = grade(clues).solvedAt;
    return solvedAt !== null && techniqueRank(solvedAt) <= ceiling;
  };

  /**
   * The two-sided question: does this set demand exactly the technique
   * the tier promises — no less, and no more?
   *
   * Checked here as well as in the generator so the search can steer
   * toward the band instead of stumbling into it. See tier-contract.ts.
   */
  const certified = (clues: readonly Candidate[]): boolean =>
    grade(clues).earned === difficulty;

  const chosenIndex = new Map<string, number>(
    suspects.map((s) => [s.id, startingIndexFor(candidatesBySuspect.get(s.id)!, startingTier)]),
  );

  let nearMiss: VerifiedClueSet | null = null;
  let nearMisses = 0;

  // Clues beyond the one-per-suspect base, added when the base set can't
  // be reasoned through. See extraClueBudget.
  const extras: Candidate[] = [];
  const extraBudget = extraClueBudget(floorPlan.size);

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const base = suspects.map((s) => {
      const candidates = candidatesBySuspect.get(s.id)!;
      const index = Math.min(chosenIndex.get(s.id)!, candidates.length - 1);
      return candidates[index]!;
    });
    // Deduped by TEXT at the point of use, not only where clues are
    // picked. Escalation swaps one suspect's base clue for a stronger one
    // and can land it on a sentence an extra already carries, so filtering
    // only when an extra is chosen leaves a window open. This closes it
    // wherever a duplicate came from: the set that gets graded, dropped
    // and printed cannot contain the same sentence twice.
    const active = dedupeByText(extras.length > 0 ? [...base, ...extras] : base);

    const solutions = tryCountSolutions(floorPlan, suspectIds, active);
    if (solutions === 1 && deducible(active)) {
      const trimmed = dropClues(
        floorPlan,
        suspectIds,
        active,
        config.dropAttempts,
        rng,
        deducible,
        certified,
      );
      const result: VerifiedClueSet = {
        clues: trimmed.map((c) => ({ suspectId: c.suspectId, text: c.text })),
        constraints: trimmed,
      };
      if (certified(trimmed)) return result;

      // Fair, unique, and solvable — but not at the rung this tier
      // promises. Taking it would be how five labels ended up on two
      // bands, so it is kept only as a floor and the search continues.
      //
      // Bounded, because "keep looking" against a floor plan that simply
      // cannot support the tier would burn the whole attempt budget on
      // one hopeless seed. After NEAR_MISS_BUDGET of these, hand back
      // the best near miss; the generator re-tiers it to what it earned
      // and tries a different seed, which is the cheaper move.
      nearMiss ??= result;
      if (++nearMisses >= NEAR_MISS_BUDGET) return nearMiss;
    }

    // Two ways forward, and they do different jobs. Escalating swaps one
    // clue for a stronger one, which moves the set toward uniqueness.
    // Adding an extra leaves every existing clue alone and gives the
    // reader one more foothold, which moves it toward being solvable at
    // all. A set can need either, so the loop alternates rather than
    // exhausting one and never trying the other.
    if (extras.length < extraBudget && attempt % 3 === 2) {
      const source = suspects[randInt(rng, 0, suspects.length - 1)]!;
      const pool = candidatesBySuspect.get(source.id)!;
      // By TEXT, not by object identity. A clue that repeats a sentence
      // already on the page is not an extra foothold — it is the same
      // foothold printed twice, and it spends the extras budget to do it.
      const taken = new Set(active.map((c) => c.text));
      const unused = pool.filter((c) => !taken.has(c.text));
      if (unused.length > 0) {
        extras.push(unused[randInt(rng, 0, unused.length - 1)]!);
        continue;
      }
    }

    const escalatable = suspects.filter((s) => {
      const candidates = candidatesBySuspect.get(s.id)!;
      return chosenIndex.get(s.id)! < candidates.length - 1;
    });
    if (escalatable.length === 0) return nearMiss;

    const target = escalatable[randInt(rng, 0, escalatable.length - 1)]!;
    chosenIndex.set(target.id, chosenIndex.get(target.id)! + 1);
  }

  return nearMiss;
}
