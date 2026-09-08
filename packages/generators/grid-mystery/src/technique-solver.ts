import type { Cell, EvidenceFact, GridMysteryPuzzle } from "./types";
import type { ClueConstraint } from "./solve";

// Difficulty as a HUMAN experiences it: which techniques a puzzle
// actually forces you to use.
//
// The existing calibration measures search NODES — how much a
// backtracking machine has to grind. That correlates with difficulty but
// isn't it: a puzzle can be node-cheap and still require a case split,
// or node-expensive and solvable by reading clues off one at a time. A
// tier is only honest if it names the reasoning it demands.
//
// THE OBSTACLE, and how this gets around it. Clues are stored as opaque
// predicates: `isSatisfied(partialAssignment) => boolean`. You cannot
// classify a black box, and rewriting every clue family into a
// structured form would be a rewrite of the generator with a lot of
// room to change puzzles by accident.
//
// So structure is RECOVERED by probing instead. Ask a clue about every
// cell in turn and it tells you which cells it permits; ask it about
// every pair and it tells you which pairings it permits. The predicate
// stays exactly as it is, and the solver gets the candidate sets it
// needs. Grids are 6x6 to 8x8, so the probe is small and one-off.

/** The reasoning ladder, easiest first. A tier claims the technique at its rung. */
export const TECHNIQUES = [
  /** T1: a clue names a cell outright, or leaves exactly one. */
  "direct",
  /** T2: a cell is forced because every other suspect is excluded from it (or vice versa). */
  "elimination",
  /** T3: one suspect's options are cut down by another's — arc consistency. */
  "relational",
  /**
   * T4: the seating layer and the object layer constrain each other.
   *
   * Specifically: the grid cannot be finished from the seating clues
   * alone — you have to work the evidence block, pin an object to a
   * person, and carry that back to move the grid. Progress made purely
   * inside the object layer does NOT count; only a deduction that
   * crosses from evidence into seating does.
   */
  "crossLayer",
  /** T5: no deduction available; assume, propagate, and use the contradiction. */
  "caseSplit",
] as const;
export type Technique = (typeof TECHNIQUES)[number];

export function techniqueRank(technique: Technique): number {
  return TECHNIQUES.indexOf(technique) + 1;
}

export interface TechniqueProfile {
  /** The hardest technique the puzzle forced. This is what a tier is certified against. */
  hardest: Technique;
  /** How many times the solver had to assume-and-test. Zero for anything below T5. */
  splits: number;
  /** Longest run of consecutive deductions from one clue's propagation. */
  longestChain: number;
  /** True when the solver reached a single complete solution. */
  solved: boolean;
  /** Every technique that fired at least once, for the card's "logic profile" line. */
  used: Technique[];
}

/** Cells are indexed row-major so candidate sets can be plain integer sets. */
function cellIndex(size: number, cell: Cell): number {
  return cell.row * size + cell.col;
}
function cellAt(size: number, index: number): Cell {
  return { row: Math.floor(index / size), col: index % size };
}

/**
 * The cells a clue permits for its own suspect, found by asking it.
 *
 * A predicate returns false only when it is DEFINITELY violated, so a
 * one-suspect probe answers exactly the question a candidate set needs:
 * could this suspect sit here at all?
 */
function unaryMask(
  constraint: ClueConstraint,
  size: number,
  seats: readonly number[],
): Set<number> {
  const allowed = new Set<number>();
  for (const index of seats) {
    if (constraint.isSatisfied({ [constraint.suspectId]: cellAt(size, index) })) {
      allowed.add(index);
    }
  }
  return allowed;
}

/**
 * Whether a clue's verdict depends on where some OTHER suspect sits, and
 * on which one.
 *
 * Found the same way: hold the clue's own suspect somewhere it allows,
 * move a second suspect around, and see whether the answer ever changes.
 * A clue that never changes its mind isn't about that suspect.
 */
function relatedSuspects(
  constraint: ClueConstraint,
  size: number,
  seats: readonly number[],
  suspectIds: readonly string[],
  own: Set<number>,
): string[] {
  const anchor = own.values().next().value;
  if (anchor === undefined) return [];
  const base = { [constraint.suspectId]: cellAt(size, anchor) };
  const related: string[] = [];
  for (const other of suspectIds) {
    if (other === constraint.suspectId) continue;
    let sawTrue = false;
    let sawFalse = false;
    for (const index of seats) {
      const verdict = constraint.isSatisfied({ ...base, [other]: cellAt(size, index) });
      if (verdict) sawTrue = true;
      else sawFalse = true;
      if (sawTrue && sawFalse) break;
    }
    if (sawTrue && sawFalse) related.push(other);
  }
  return related;
}

interface Structured {
  constraint: ClueConstraint;
  /** Cells this clue alone permits its suspect. */
  own: Set<number>;
  /** Other suspects whose placement this clue also depends on. */
  related: string[];
}

/**
 * Recovers structure for every clue.
 *
 * Exported because the tier certifier needs it too, and because doing it
 * twice on the same puzzle is pure waste.
 */
export interface PreparedClues {
  seats: number[];
  structured: Structured[];
}

export function structureClues(
  puzzle: SolvableInput,
  constraints: readonly ClueConstraint[],
): PreparedClues {
  const size = puzzle.floorPlan.size;
  const seats: number[] = [];
  for (let row = 0; row < size; row++) {
    for (let col = 0; col < size; col++) {
      if (puzzle.floorPlan.occupyMask[row]![col]) seats.push(row * size + col);
    }
  }
  const suspectIds = puzzle.suspects.map((s) => s.id);
  const structured = constraints.map((constraint) => {
    const own = unaryMask(constraint, size, seats);
    return {
      constraint,
      own,
      related: relatedSuspects(constraint, size, seats, suspectIds, own),
    };
  });
  return { seats, structured };
}

type Candidates = Map<string, Set<number>>;

/**
 * Rows or columns k suspects are confined to belong to those k alone.
 *
 * The naked subset. With as many suspects as rows and one per row, k
 * suspects sharing k rows between them fill those rows completely — so
 * nobody else can be there. A person spots this constantly; a solver
 * without it stalls and starts guessing, and then reports a perfectly
 * deducible puzzle as requiring trial and error.
 */
function applyNakedSubsets(candidates: Candidates, size: number): boolean {
  let changed = false;
  const entries = [...candidates];

  for (const axis of ["row", "col"] as const) {
    const lineOf = (index: number) =>
      axis === "row" ? Math.floor(index / size) : index % size;
    const lines = new Map<string, Set<number>>();
    for (const [id, set] of entries) {
      lines.set(id, new Set([...set].map(lineOf)));
    }

    // Pairs and triples only. Larger subsets are vanishingly rare at
    // these grid sizes and cost combinatorially more to look for.
    for (let k = 2; k <= 3; k++) {
      for (const group of combinations(entries.map(([id]) => id), k)) {
        const union = new Set<number>();
        for (const id of group) for (const line of lines.get(id)!) union.add(line);
        if (union.size !== k) continue;
        for (const [id, set] of entries) {
          if (group.includes(id)) continue;
          for (const index of [...set]) {
            if (union.has(lineOf(index))) {
              set.delete(index);
              changed = true;
            }
          }
        }
      }
    }
  }
  return changed;
}

/** Every k-sized combination of ids. Small k, small n — a plain recursion is fine. */
function combinations(ids: readonly string[], k: number): string[][] {
  if (k === 0) return [[]];
  const out: string[][] = [];
  for (let i = 0; i <= ids.length - k; i++) {
    for (const rest of combinations(ids.slice(i + 1), k - 1)) {
      out.push([ids[i]!, ...rest]);
    }
  }
  return out;
}

/**
 * The rule the reader is told in the brief but the solver was never given.
 *
 * "Exactly one person shared the room in which the victim was found."
 * That sentence is on every puzzle page, and a human uses it from the
 * first minute — but it lives in the brief, not in the clue list, so the
 * simulator was solving with strictly less information than the reader
 * has. Puzzles were being reported as needing guesswork when they need
 * nothing of the sort.
 *
 * Two sound directions, both used by any real solver:
 *   once the victim's room is known, at most one other suspect is in it;
 *   and if only one other suspect CAN be in it, that suspect is.
 */
function applyVictimRoomRule(
  candidates: Candidates,
  victimId: string,
  roomOfCell: readonly number[],
): boolean {
  const victim = candidates.get(victimId);
  if (!victim) return false;

  // Which rooms the victim could still be in.
  const victimRooms = new Set([...victim].map((index) => roomOfCell[index]!));
  if (victimRooms.size !== 1) return false;
  const room = [...victimRooms][0]!;

  const others = [...candidates].filter(([id]) => id !== victimId);
  const canBeInRoom = others.filter(([, set]) =>
    [...set].some((index) => roomOfCell[index] === room),
  );
  if (canBeInRoom.length !== 1) return false;

  // Exactly one candidate for the killer's seat: they are in that room,
  // and nobody else can be.
  const [id, set] = canBeInRoom[0]!;
  let changed = false;
  for (const index of [...set]) {
    if (roomOfCell[index] !== room) {
      set.delete(index);
      changed = true;
    }
  }
  void id;
  return changed;
}

function copy(candidates: Candidates): Candidates {
  const next: Candidates = new Map();
  for (const [id, set] of candidates) next.set(id, new Set(set));
  return next;
}

/** One suspect per row and per column — the rule the whole grid rests on. */
function applyUniqueness(candidates: Candidates, size: number): boolean {
  let changed = false;
  for (const [id, set] of candidates) {
    if (set.size !== 1) continue;
    const only = set.values().next().value!;
    const row = Math.floor(only / size);
    const col = only % size;
    for (const [otherId, otherSet] of candidates) {
      if (otherId === id) continue;
      for (const index of [...otherSet]) {
        if (index === only || Math.floor(index / size) === row || index % size === col) {
          otherSet.delete(index);
          changed = true;
        }
      }
    }
  }
  return changed;
}

/**
 * Hidden singles, in all three shapes a person actually spots them.
 *
 * This is the "elimination" rung, and getting it complete matters more
 * than it looks: a simulator that misses these declares puzzles
 * unsolvable-without-guessing that a competent solver walks straight
 * through, which would certify Easy books as Expert. The three shapes:
 *
 *   a cell only one suspect can occupy is that suspect's;
 *   a ROW only one suspect can be in belongs to them (there are exactly
 *   as many suspects as rows, so every row holds exactly one);
 *   and the same for columns.
 */
function applyHiddenSingles(
  candidates: Candidates,
  seats: readonly number[],
  size: number,
): boolean {
  let changed = false;

  // NOT the cell-wise hidden single. A grid has far more seats than
  // suspects — seven guests across forty-odd squares — so a cell only
  // one suspect COULD occupy needn't be occupied at all. Asserting it
  // eliminates true solutions, which is how this was caught: measured
  // solve rates of 1/12 on Easy puzzles a person finishes in a minute.
  //
  // The row and column arguments below are different, and they are
  // valid: there are exactly as many suspects as rows, and one suspect
  // per row, so every row holds exactly one. That is a counting
  // argument, not an assumption.
  for (const axis of ["row", "col"] as const) {
    for (let line = 0; line < size; line++) {
      const inLine = (index: number) =>
        axis === "row" ? Math.floor(index / size) === line : index % size === line;
      const holders = [...candidates].filter(([, set]) => [...set].some(inLine));
      if (holders.length !== 1) continue;
      const [, set] = holders[0]!;
      const narrowed = new Set([...set].filter(inLine));
      if (narrowed.size === set.size || narrowed.size === 0) continue;
      set.clear();
      for (const index of narrowed) set.add(index);
      changed = true;
    }
  }

  return changed;
}

/**
 * Hidden subsets — the dual of the naked subset above, and the missing
 * half of the pair.
 *
 * applyNakedSubsets works from the suspects: k guests confined between
 * them to k rows fill those rows, so nobody else can be there.
 * This works from the rows: if only k guests can be in a given k rows,
 * then those k guests are IN those rows, and every other seat of theirs
 * is gone. Seats and guests are a perfect matching — as many guests as
 * rows, one each — so both directions are sound counting arguments, and
 * neither implies the other.
 *
 * Leaving this out is not a cosmetic gap. applyHiddenSingles is exactly
 * this argument at k = 1, and stopping there is fine on a small grid
 * where a chain of singles gets you home. At 8x8 it isn't: with eight
 * guests the deductions that carry a solve are pair- and triple-shaped,
 * and without them the simulator stalls, reports puzzles as needing
 * guesswork, and the generator throws away seed after seed looking for
 * one it can certify. Six tests at 8x8 failed to generate at all before
 * this existed.
 */
function applyHiddenSubsets(candidates: Candidates, size: number): boolean {
  let changed = false;
  const entries = [...candidates];
  const lineIndices = Array.from({ length: size }, (_, i) => i);

  for (const axis of ["row", "col"] as const) {
    const lineOf = (index: number) => (axis === "row" ? Math.floor(index / size) : index % size);

    // Pairs and triples, matching applyNakedSubsets. Larger subsets cost
    // combinatorially more and are vanishingly rare at these sizes.
    for (let k = 2; k <= 3; k++) {
      for (const group of combinations(lineIndices.map(String), k)) {
        const lines = new Set(group.map(Number));
        const holders = entries.filter(([, set]) => [...set].some((i) => lines.has(lineOf(i))));
        // Fewer possible occupants than lines is a contradiction, and the
        // caller detects it from the empty set this leaves behind. More
        // than k says nothing.
        if (holders.length !== k) continue;
        for (const [, set] of holders) {
          for (const index of [...set]) {
            if (!lines.has(lineOf(index))) {
              set.delete(index);
              changed = true;
            }
          }
        }
      }
    }
  }
  return changed;
}

/**
 * Arc consistency across a clue that mentions two suspects.
 *
 * A candidate survives only if the other suspect has somewhere to sit
 * that keeps the clue true. This is the rung where a solver stops
 * reading clues in isolation and starts playing them against each other.
 */
function applyRelational(
  entry: Structured,
  candidates: Candidates,
  size: number,
): boolean {
  let changed = false;
  const own = candidates.get(entry.constraint.suspectId);
  if (!own) return false;
  for (const otherId of entry.related) {
    const other = candidates.get(otherId);
    if (!other) continue;
    for (const index of [...own]) {
      const supported = [...other].some((otherIndex) =>
        entry.constraint.isSatisfied({
          [entry.constraint.suspectId]: cellAt(size, index),
          [otherId]: cellAt(size, otherIndex),
        }),
      );
      if (!supported) {
        own.delete(index);
        changed = true;
      }
    }
  }
  return changed;
}

/**
 * The object layer, as a candidate matrix: who could be carrying what.
 *
 * Mirrors the seating matrix exactly — a suspect -> possibilities map
 * narrowed by propagation — so the two layers can be worked against each
 * other by the same kind of reasoning a reader uses.
 */
type ObjectCandidates = Map<string, Set<string>>;

interface EvidenceState {
  objects: ObjectCandidates;
  facts: readonly EvidenceFact[];
  /** Suspect ids ordered tallest first, so "the 3rd tallest" resolves. */
  byHeightDesc: readonly string[];
  roomIndexByName: ReadonlyMap<string, number>;
}

function buildEvidenceState(puzzle: SolvableInput): EvidenceState | null {
  const evidence = puzzle.evidence;
  if (!evidence || evidence.facts.length === 0) return null;

  const objects: ObjectCandidates = new Map();
  for (const suspect of puzzle.suspects) {
    objects.set(suspect.id, new Set(evidence.objectPool));
  }
  const roomIndexByName = new Map<string, number>();
  puzzle.floorPlan.rooms.forEach((room, index) => roomIndexByName.set(room.name, index));

  return {
    objects,
    facts: evidence.facts,
    byHeightDesc: [...puzzle.suspects]
      .sort((a, b) => b.heightIn - a.heightIn)
      .map((suspect) => suspect.id),
    roomIndexByName,
  };
}

function copyEvidence(state: EvidenceState): EvidenceState {
  const objects: ObjectCandidates = new Map();
  for (const [id, set] of state.objects) objects.set(id, new Set(set));
  return { ...state, objects };
}

/**
 * Which seats a location fact points at, or null if the fact says
 * nothing about location.
 */
function seatFilterFor(
  fact: EvidenceFact,
  size: number,
  roomOfCell: readonly number[],
  roomIndexByName: ReadonlyMap<string, number>,
): ((index: number) => boolean) | null {
  switch (fact.kind) {
    case "objectInRow":
      return (index) => Math.floor(index / size) === fact.row;
    case "objectInColumn":
      return (index) => index % size === fact.col;
    case "objectInRoom": {
      const roomIndex = roomIndexByName.get(fact.roomName);
      if (roomIndex === undefined) return null;
      return (index) => roomOfCell[index] === roomIndex;
    }
    default:
      return null;
  }
}

/** Object candidates are a permutation: pin one, and nobody else has it. */
function applyObjectUniqueness(objects: ObjectCandidates): boolean {
  let changed = false;
  for (const [id, set] of objects) {
    if (set.size !== 1) continue;
    const only = set.values().next().value!;
    for (const [otherId, otherSet] of objects) {
      if (otherId === id) continue;
      if (otherSet.delete(only)) changed = true;
    }
  }
  // And the counting argument in the other direction: an object only one
  // person could be carrying IS theirs.
  const pool = new Set<string>();
  for (const set of objects.values()) for (const object of set) pool.add(object);
  for (const object of pool) {
    const holders = [...objects].filter(([, set]) => set.has(object));
    if (holders.length !== 1) continue;
    const [, set] = holders[0]!;
    if (set.size === 1) continue;
    set.clear();
    set.add(object);
    changed = true;
  }
  return changed;
}

/**
 * The cross-layer rung: evidence and seating narrowing each other.
 *
 * Three moves, all of which a reader makes on the page:
 *
 *   NAMED. "Ada was carrying the letter opener" pins her object outright,
 *   and takes that object away from everyone else. "The 3rd tallest was
 *   carrying the ledger" is the same move — heights are printed, so the
 *   rank resolves to a person without touching the grid.
 *
 *   SEATING -> EVIDENCE. "The letter opener was in the 3rd row." Anyone
 *   who cannot possibly be in the 3rd row cannot be holding it.
 *
 *   EVIDENCE -> SEATING. Once only one person can be holding the letter
 *   opener, that person is in the 3rd row — so every seat of theirs
 *   outside it is gone. THIS is the move that makes the rung worth its
 *   name: information entered through the evidence block and came out as
 *   a placement on the grid.
 *
 * Returns whether the SEATING moved. Progress confined to the object
 * layer is real work but it is not cross-layer work, and counting it
 * would let any puzzle with an evidence block claim the rung.
 */
function applyCrossLayer(
  candidates: Candidates,
  state: EvidenceState,
  size: number,
  roomOfCell: readonly number[],
): { seatingChanged: boolean; objectsChanged: boolean } {
  let seatingChanged = false;
  let objectsChanged = false;

  const pin = (suspectId: string, object: string) => {
    const set = state.objects.get(suspectId);
    if (!set || (set.size === 1 && set.has(object))) return;
    set.clear();
    set.add(object);
    objectsChanged = true;
  };

  for (const fact of state.facts) {
    if (fact.kind === "personHas") {
      pin(fact.suspectId, fact.object);
      continue;
    }
    if (fact.kind === "personLacks") {
      if (state.objects.get(fact.suspectId)?.delete(fact.object)) objectsChanged = true;
      continue;
    }
    if (fact.kind === "objectHeldByRank") {
      const holder = state.byHeightDesc[fact.rank - 1];
      if (holder) pin(holder, fact.object);
      continue;
    }

    const inPlace = seatFilterFor(fact, size, roomOfCell, state.roomIndexByName);
    if (!inPlace) continue;

    // SEATING -> EVIDENCE.
    for (const [suspectId, seats] of candidates) {
      if ([...seats].some(inPlace)) continue;
      if (state.objects.get(suspectId)?.delete(fact.object)) objectsChanged = true;
    }

    // EVIDENCE -> SEATING.
    const holders = [...state.objects].filter(([, set]) => set.has(fact.object));
    if (holders.length !== 1) continue;
    const seats = candidates.get(holders[0]![0]);
    if (!seats) continue;
    for (const index of [...seats]) {
      if (!inPlace(index)) {
        seats.delete(index);
        seatingChanged = true;
      }
    }
  }

  if (applyObjectUniqueness(state.objects)) objectsChanged = true;
  return { seatingChanged, objectsChanged };
}

interface PropagationResult {
  contradiction: boolean;
  solved: boolean;
  used: Set<Technique>;
  longestChain: number;
}

/** Runs every technique below case-splitting until nothing more can be deduced. */
function propagate(
  candidates: Candidates,
  structured: readonly Structured[],
  seats: readonly number[],
  size: number,
  ceiling: Technique,
  victimId: string,
  roomOfCell: readonly number[],
  evidence: EvidenceState | null,
): PropagationResult {
  const used = new Set<Technique>();
  const limit = techniqueRank(ceiling);
  let longestChain = 0;
  let chain = 0;

  for (;;) {
    let changed = false;

    if (applyUniqueness(candidates, size)) {
      used.add("elimination");
      changed = true;
    }
    if (limit >= techniqueRank("elimination") && applyHiddenSingles(candidates, seats, size)) {
      used.add("elimination");
      changed = true;
    }
    if (limit >= techniqueRank("elimination") && applyNakedSubsets(candidates, size)) {
      used.add("elimination");
      changed = true;
    }
    if (limit >= techniqueRank("elimination") && applyHiddenSubsets(candidates, size)) {
      used.add("elimination");
      changed = true;
    }
    if (limit >= techniqueRank("relational")) {
      // Reasoning about one person's seat from another's, which is what
      // the relational rung IS. It was previously tagged cross-layer,
      // but nothing here crosses a layer: the victim rule relates
      // suspects to suspects inside the seating grid. Cross-layer is
      // reserved for the evidence block below, so that the tier claiming
      // it means something specific.
      if (applyVictimRoomRule(candidates, victimId, roomOfCell)) {
        used.add("relational");
        changed = true;
      }
      for (const entry of structured) {
        if (entry.related.length === 0) continue;
        if (applyRelational(entry, candidates, size)) {
          used.add("relational");
          changed = true;
        }
      }
    }
    if (limit >= techniqueRank("crossLayer") && evidence) {
      const cross = applyCrossLayer(candidates, evidence, size, roomOfCell);
      // Only a deduction that reached the grid earns the rung; object
      // bookkeeping on its own keeps the loop alive without claiming it.
      if (cross.seatingChanged) used.add("crossLayer");
      if (cross.seatingChanged || cross.objectsChanged) changed = true;
    }

    for (const set of candidates.values()) {
      if (set.size === 0) return { contradiction: true, solved: false, used, longestChain };
    }
    if (!changed) break;
    chain += 1;
    longestChain = Math.max(longestChain, chain);
  }

  const solved = [...candidates.values()].every((set) => set.size === 1);
  return { contradiction: false, solved, used, longestChain };
}

/** How deep the assume-and-test may go before the puzzle is called unsolvable at this ceiling. */
const MAX_SPLIT_DEPTH = 3;

/**
 * Solves the way a person does, and reports what it had to use.
 *
 * `ceiling` caps the ladder: passing "relational" asks whether the
 * puzzle is solvable using nothing harder than T3. That is what makes
 * tier certification possible in both directions — a Hard puzzle must
 * solve at its own ceiling AND fail one rung below, or it isn't Hard, it
 * is Medium wearing a badge.
 */
export interface SolvableInput {
  floorPlan: GridMysteryPuzzle["floorPlan"];
  suspects: readonly GridMysteryPuzzle["suspects"][number][];
  victimSuspectId: string;
  /**
   * The evidence block, as facts rather than predicates.
   *
   * Optional: a puzzle without one is simply a puzzle with no
   * cross-layer rung available, and grades at relational or below.
   */
  evidence?: {
    /** Every object in play — the object layer is a permutation over these. */
    objectPool: readonly string[];
    facts: readonly EvidenceFact[];
  };
}

/**
 * The solver's view of a finished puzzle, evidence layer included.
 *
 * Use this rather than passing a GridMysteryPuzzle straight in. A puzzle
 * structurally satisfies SolvableInput — it has the floor plan, the
 * suspects and the victim, and `evidence` is optional — so TypeScript
 * accepts the shorthand and the evidence block silently goes missing.
 * The solver then can't reach the cross-layer rung, and reports Expert
 * and Extreme puzzles (which are DEFINED by needing it) as requiring
 * guesswork. Nothing errors; the answer is just wrong.
 */
export function solvableFrom(puzzle: GridMysteryPuzzle): SolvableInput {
  return {
    floorPlan: puzzle.floorPlan,
    suspects: puzzle.suspects,
    victimSuspectId: puzzle.victimSuspectId,
    evidence: {
      objectPool: Object.values(puzzle.objects),
      facts: puzzle.evidenceClues.map((clue) => clue.fact),
    },
  };
}

export function solveByTechnique(
  puzzle: SolvableInput,
  constraints: readonly ClueConstraint[],
  ceiling: Technique = "caseSplit",
  /**
   * Structure recovered earlier for this same clue set.
   *
   * Recovering it means probing every clue against every cell and every
   * pair of suspects, which at 8x8 is the single most expensive thing
   * here — and grading a puzzle solves the SAME clue set at up to four
   * ceilings in a row. Doing the probe once and handing it down turns
   * that into one probe instead of four.
   */
  prepared?: PreparedClues,
): TechniqueProfile {
  const size = puzzle.floorPlan.size;
  const { seats, structured } = prepared ?? structureClues(puzzle, constraints);

  // Cell -> room index, so room-level reasoning is a lookup rather than
  // a search on every step.
  const roomOfCell: number[] = new Array(size * size).fill(-1);
  puzzle.floorPlan.rooms.forEach((room, roomIndex) => {
    for (const cell of room.cells) roomOfCell[cell.row * size + cell.col] = roomIndex;
  });

  const start: Candidates = new Map();
  for (const suspect of puzzle.suspects) start.set(suspect.id, new Set(seats));

  // T1: every clue's own mask, applied once. A puzzle solvable here and
  // nowhere else is one you can read straight off the cards.
  const usedOverall = new Set<Technique>();
  for (const entry of structured) {
    const set = start.get(entry.constraint.suspectId);
    if (!set) continue;
    const before = set.size;
    for (const index of [...set]) if (!entry.own.has(index)) set.delete(index);
    if (set.size !== before) usedOverall.add("direct");
  }

  let splits = 0;
  let longestChain = 0;

  const evidenceState = buildEvidenceState(puzzle);

  const attempt = (candidates: Candidates, depth: number, evidence: EvidenceState | null): boolean => {
    const result = propagate(
      candidates,
      structured,
      seats,
      size,
      ceiling,
      puzzle.victimSuspectId,
      roomOfCell,
      evidence,
    );
    for (const technique of result.used) usedOverall.add(technique);
    longestChain = Math.max(longestChain, result.longestChain);
    if (result.contradiction) return false;
    if (result.solved) return true;
    if (techniqueRank(ceiling) < techniqueRank("caseSplit") || depth >= MAX_SPLIT_DEPTH) {
      return false;
    }

    // Nothing deducible left: assume, and let the contradiction teach us.
    // Splitting on the fewest options keeps the tree narrow, and the
    // count is what a tier-5 contract is written against.
    let pivotId: string | null = null;
    let pivot: Set<number> | null = null;
    for (const [id, set] of candidates) {
      if (set.size > 1 && (!pivot || set.size < pivot.size)) {
        pivotId = id;
        pivot = set;
      }
    }
    if (!pivotId || !pivot) return false;

    for (const guess of [...pivot]) {
      splits += 1;
      usedOverall.add("caseSplit");
      const branch = copy(candidates);
      branch.set(pivotId, new Set([guess]));
      // The object layer branches with the seating: a what-if that
      // narrows objects must be undone alongside it when it fails.
      if (attempt(branch, depth + 1, evidence ? copyEvidence(evidence) : null)) {
        for (const [id, set] of branch) candidates.set(id, set);
        return true;
      }
    }
    return false;
  };

  const solved = attempt(start, 0, evidenceState);
  const ordered = TECHNIQUES.filter((technique) => usedOverall.has(technique));
  return {
    hardest: ordered[ordered.length - 1] ?? "direct",
    splits,
    longestChain,
    solved,
    used: ordered,
  };
}

/** A one-line description for the review card, e.g. "elimination · relational · 1 what-if". */
export function describeProfile(profile: TechniqueProfile): string {
  const labels: Record<Technique, string> = {
    direct: "direct",
    elimination: "elimination",
    relational: "relational",
    crossLayer: "cross-layer",
    caseSplit: "case split",
  };
  const parts = profile.used.filter((t) => t !== "caseSplit").map((t) => labels[t]);
  if (profile.splits > 0) {
    parts.push(`${profile.splits} what-if${profile.splits === 1 ? "" : "s"}`);
  }
  return parts.join(" · ");
}

export { cellIndex };

/**
 * Can a person actually reason their way to this answer?
 *
 * The question that matters most and was never being asked. Uniqueness
 * is proved by exhaustive search, which a machine can do and a reader
 * cannot: a clue set can have exactly one solution and still offer no
 * route to it except trial and error. That is the "flawed logic"
 * complaint that sinks puzzle books, and it is not caught by counting
 * solutions.
 *
 * Deducible here means: solvable by propagation alone, with no
 * case-splitting — every step justified by the clues rather than by
 * assuming something and seeing what breaks.
 */
export function isDeducible(
  puzzle: SolvableInput,
  constraints: readonly ClueConstraint[],
): boolean {
  const profile = solveByTechnique(puzzle, constraints, "crossLayer");
  return profile.solved && profile.splits === 0;
}
