// The evidence layer: a second, fully orthogonal deduction dimension on
// top of seating.
//
// Every suspect carries exactly one distinct object, and a separate block
// of "Evidence" clues pins which. Most evidence clues reference a
// LOCATION rather than a person ("the poison vial was in the 3rd row"),
// so the reader has to solve the seating grid first before the evidence
// block becomes tractable — the two layers chain rather than sitting
// side by side.
//
// Why this is verified separately from seating rather than as one giant
// search: seating uniqueness is established first, using seating clues
// only. Given that unique placement, every location-based evidence clue
// collapses to a statement about a specific suspect, and what's left is a
// plain permutation problem over N objects — cheap to enumerate
// exhaustively. Unique seating plus unique objects-given-seating is a
// sufficient condition for the whole puzzle having exactly one solution,
// and it keeps the combined search from multiplying out to N! times the
// seating cost.
import { roomNameAt } from "./geometry";
import {
  EV_OBJECT_COLUMN,
  EV_OBJECT_PERSON,
  EV_OBJECT_ROOM,
  EV_OBJECT_ROW,
  EV_OBJECT_TALLEST,
  EV_OBJECT_NOT_PERSON,
  phrase,
} from "./phrasings";
import { type Rng, randInt, shuffle } from "./rng";
import { suspectToken } from "./text-template";
import type {
  Assignment,
  EvidenceClue,
  EvidenceFact,
  FloorPlan,
  ObjectAssignment,
  Suspect,
} from "./types";

/**
 * A constraint over the suspect -> object mapping. `isSatisfied` takes a
 * possibly-partial mapping and returns false only when the constraint is
 * definitely violated, matching the seating solver's convention.
 */
interface ObjectConstraint {
  text: string;
  /**
   * The same statement as data. Carried so the printed clue can be
   * reasoned over in both directions — see EvidenceFact. The predicate
   * stays as the verification path; the fact is the solving path.
   */
  fact: EvidenceFact;
  isSatisfied: (assignment: Partial<ObjectAssignment>) => boolean;
}

/**
 * Counts how many complete suspect -> object assignments satisfy every
 * constraint, stopping at `cap`. Objects are distinct, so this is a
 * permutation search with constraint pruning at every level — at the
 * supported grid sizes (<= 8) the worst case is 8! = 40,320 leaves, and
 * pruning cuts that down enormously in practice.
 */
export function countObjectAssignments(
  suspectIds: readonly string[],
  objectPool: readonly string[],
  // Only the predicate is needed to count, so this deliberately asks for
  // less than a full ObjectConstraint: callers testing the search itself
  // shouldn't have to invent a printable fact for a throwaway predicate.
  constraints: readonly Pick<ObjectConstraint, "isSatisfied">[],
  cap: number,
): number {
  let count = 0;
  const assignment: Partial<ObjectAssignment> = {};
  const usedObjects = new Set<string>();

  function satisfiesAll(): boolean {
    return constraints.every((c) => c.isSatisfied(assignment));
  }

  function backtrack(index: number): boolean {
    if (index === suspectIds.length) {
      count++;
      return count >= cap;
    }
    const suspectId = suspectIds[index]!;
    for (const object of objectPool) {
      if (usedObjects.has(object)) continue;
      assignment[suspectId] = object;
      usedObjects.add(object);
      if (satisfiesAll() && backtrack(index + 1)) return true;
      delete assignment[suspectId];
      usedObjects.delete(object);
    }
    return false;
  }

  backtrack(0);
  return count;
}

export interface VerifiedEvidence {
  objects: ObjectAssignment;
  clues: EvidenceClue[];
}

/**
 * Builds the full candidate pool of evidence clues for a known
 * suspect -> object solution and a known seating.
 *
 * Deliberately weighted toward location-based clues: those are the ones
 * that force the reader to finish the grid first, which is what makes
 * the evidence layer feel like a second act rather than a separate
 * mini-puzzle stapled on.
 */
function buildEvidenceCandidates(
  suspects: readonly Suspect[],
  objects: ObjectAssignment,
  floorPlan: FloorPlan,
  solution: Assignment,
  rng: Rng,
): ObjectConstraint[] {
  const candidates: ObjectConstraint[] = [];
  const suspectsByHeightDesc = [...suspects].sort((a, b) => b.heightIn - a.heightIn);

  for (const suspect of suspects) {
    const object = objects[suspect.id]!;
    const cell = solution[suspect.id]!;
    const room = roomNameAt(floorPlan, cell);

    // Direct: names the person outright. Strongest, and the pool needs
    // some of these or the layer can never resolve.
    candidates.push({
      text: phrase(rng, EV_OBJECT_PERSON, { name: suspectToken(suspect.id), object }),
      fact: { kind: "personHas", suspectId: suspect.id, object },
      isSatisfied: (a) => !a[suspect.id] || a[suspect.id] === object,
    });

    // Location-based: resolvable only once the grid is solved. The
    // predicate says "whoever is at this location holds this object",
    // which given a fixed seating is a statement about one suspect.
    const holderAt = (predicate: (s: Suspect) => boolean) => (a: Partial<ObjectAssignment>) => {
      const holder = suspects.find(predicate);
      if (!holder) return true;
      return !a[holder.id] || a[holder.id] === object;
    };

    candidates.push({
      text: phrase(rng, EV_OBJECT_ROOM, { object, room }),
      fact: { kind: "objectInRoom", object, roomName: room },
      isSatisfied: holderAt((s) => roomNameAt(floorPlan, solution[s.id]!) === room),
    });
    candidates.push({
      text: phrase(rng, EV_OBJECT_COLUMN, { object, col: cell.col + 1 }),
      fact: { kind: "objectInColumn", object, col: cell.col },
      isSatisfied: holderAt((s) => solution[s.id]!.col === cell.col),
    });
    candidates.push({
      text: phrase(rng, EV_OBJECT_ROW, { object, row: cell.row + 1 }),
      fact: { kind: "objectInRow", object, row: cell.row },
      isSatisfied: holderAt((s) => solution[s.id]!.row === cell.row),
    });

    const rank = suspectsByHeightDesc.findIndex((s) => s.id === suspect.id) + 1;
    candidates.push({
      text: phrase(rng, EV_OBJECT_TALLEST, { rank, object }),
      fact: { kind: "objectHeldByRank", object, rank },
      isSatisfied: holderAt((s) => s.id === suspectsByHeightDesc[rank - 1]!.id),
    });

    // Negative: eliminates one pairing. Weak on its own, which is
    // exactly why it's useful as filler on harder tiers.
    const otherObjects = Object.values(objects).filter((o) => o !== object);
    if (otherObjects.length > 0) {
      const wrong = otherObjects[randInt(rng, 0, otherObjects.length - 1)]!;
      candidates.push({
        text: phrase(rng, EV_OBJECT_NOT_PERSON, { name: suspectToken(suspect.id), object: wrong }),
        fact: { kind: "personLacks", suspectId: suspect.id, object: wrong },
        isSatisfied: (a) => !a[suspect.id] || a[suspect.id] !== wrong,
      });
    }
  }

  return candidates;
}

const MAX_EVIDENCE_ATTEMPTS = 40;

/**
 * Assigns each suspect a distinct object and selects a minimal-ish set of
 * evidence clues that pins the assignment to exactly one possibility,
 * given the (already unique) seating.
 *
 * Greedy: shuffle the candidate pool, add clues one at a time, and stop
 * the moment the assignment count hits 1. Then make a reduction pass that
 * drops any clue the set no longer needs — the same "verify every
 * removal" discipline the seating layer uses, so the printed evidence
 * block has no dead weight.
 *
 * Returns null if the shuffled pool couldn't pin it within the attempt
 * budget; the caller regenerates rather than shipping an ambiguous
 * evidence layer.
 */
export function generateEvidence(
  suspects: readonly Suspect[],
  floorPlan: FloorPlan,
  solution: Assignment,
  objectPool: readonly string[],
  rng: Rng,
): VerifiedEvidence | null {
  if (objectPool.length < suspects.length) return null;
  const suspectIds = suspects.map((s) => s.id);

  for (let attempt = 0; attempt < MAX_EVIDENCE_ATTEMPTS; attempt++) {
    const chosenObjects = shuffle(rng, objectPool).slice(0, suspects.length);
    const objects: ObjectAssignment = {};
    suspects.forEach((suspect, i) => {
      objects[suspect.id] = chosenObjects[i]!;
    });

    const pool = shuffle(rng, buildEvidenceCandidates(suspects, objects, floorPlan, solution, rng));

    const active: ObjectConstraint[] = [];
    let solved = false;
    for (const candidate of pool) {
      active.push(candidate);
      if (countObjectAssignments(suspectIds, chosenObjects, active, 2) === 1) {
        solved = true;
        break;
      }
    }
    if (!solved) continue;

    // Reduction pass: drop any clue the set can do without. Each removal
    // is re-verified, so the surviving set still pins exactly one
    // assignment — it just says it with fewer words.
    let reduced = active.slice();
    for (const candidate of active) {
      if (reduced.length <= 1) break;
      const trial = reduced.filter((c) => c !== candidate);
      if (countObjectAssignments(suspectIds, chosenObjects, trial, 2) === 1) {
        reduced = trial;
      }
    }

    return {
      objects,
      clues: reduced.map((c) => ({ text: c.text, fact: c.fact })),
    };
  }

  return null;
}
