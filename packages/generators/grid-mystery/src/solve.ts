import type { Assignment, Cell } from "./types";

export interface ClueConstraint {
  suspectId: string;
  text: string;
  /**
   * Must return true for the true solution. Given a possibly-partial
   * assignment, returns false only if the clue is definitely violated;
   * returns true if satisfied so far or not yet determinable (a suspect it
   * depends on hasn't been placed yet in this partial assignment).
   */
  isSatisfied: (assignment: Partial<Assignment>) => boolean;
}

/**
 * Search effort for one solve. This is what difficulty CALIBRATION is
 * measured against: a tier label is only honest if the puzzle actually
 * takes the amount of searching that tier promises.
 *
 * `nodes` counts placements attempted; `backtracks` counts placements
 * undone after failing a constraint. Neither is a model of a human
 * solver, but both scale with how much a puzzle has to be worked out
 * rather than read off, which is the property the ladder is claiming.
 */
export interface SolveStats {
  nodes: number;
  backtracks: number;
}

/** Thrown when a solve exceeds its node budget — treat as "inconclusive", not "ambiguous". */
export class SolverBudgetExceededError extends Error {
  constructor() {
    super("countSolutions exceeded its search node budget");
    this.name = "SolverBudgetExceededError";
  }
}

const DEFAULT_MAX_NODES = 2_000_000;

/**
 * Counts how many full assignments (one suspect per row, one per occupied
 * column) satisfy every constraint, stopping as soon as `cap` is reached.
 * This is the "verified deduction engine" — a puzzle is only accepted once
 * this returns exactly 1, guaranteeing the printed clues have one and only
 * one logical solution.
 *
 * Bounded by `maxNodes` search-tree nodes so a pathological clue set can
 * never hang the generator indefinitely — it throws instead, and the caller
 * treats that as "try a different clue combination", not as a real answer.
 */
export function countSolutions(
  size: number,
  occupyMask: readonly (readonly boolean[])[],
  suspectIds: readonly string[],
  constraints: readonly ClueConstraint[],
  cap: number,
  maxNodes = DEFAULT_MAX_NODES,
  /** Filled in with the search effort, when supplied. See SolveStats. */
  stats?: SolveStats,
): number {
  let count = 0;
  let nodes = 0;
  let backtracks = 0;
  const usedCols = new Set<number>();
  const usedSuspects = new Set<string>();
  const assignment: Partial<Assignment> = {};

  function satisfiesAll(): boolean {
    return constraints.every((c) => c.isSatisfied(assignment));
  }

  function backtrack(row: number): boolean {
    if (row === size) {
      count++;
      return count >= cap;
    }
    for (let col = 0; col < size; col++) {
      if (!occupyMask[row]![col] || usedCols.has(col)) continue;
      const cell: Cell = { row, col };
      for (const suspectId of suspectIds) {
        if (usedSuspects.has(suspectId)) continue;
        if (++nodes > maxNodes) throw new SolverBudgetExceededError();

        assignment[suspectId] = cell;
        usedCols.add(col);
        usedSuspects.add(suspectId);

        if (satisfiesAll() && backtrack(row + 1)) return true;

        backtracks++;
        delete assignment[suspectId];
        usedCols.delete(col);
        usedSuspects.delete(suspectId);
      }
    }
    return false;
  }

  try {
    backtrack(0);
  } finally {
    // Written even when the node budget throws, so a caller that treats
    // "too expensive" as a signal can still see how far it got.
    if (stats) {
      stats.nodes = nodes;
      stats.backtracks = backtracks;
    }
  }
  return count;
}
