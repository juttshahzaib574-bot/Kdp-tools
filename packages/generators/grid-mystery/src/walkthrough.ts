import type { Cell, EvidenceFact, GridMysteryPuzzle } from "./types";
import type { ClueConstraint } from "./solve";
import {
  type SolvableInput,
  type Technique,
  structureClues,
  type PreparedClues,
  type Candidates,
} from "./technique-solver";
import { solvableFrom } from "./technique-solver";

/** One step in the reasoning chain. */
export interface WalkthroughStep {
  /** Which technique justified this step. */
  technique: Technique;
  /** Human-readable explanation of what was deduced. */
  explanation: string;
  /** The suspect(s) this step is about. */
  suspectIds: string[];
  /** If this step pins a cell, which one. */
  cell?: Cell;
  /** If this step references a clue, its index. */
  clueIndex?: number;
}

/** The complete solution path, from first deduction to final answer. */
export interface SolutionWalkthrough {
  /** Every deduction step in order. */
  steps: WalkthroughStep[];
  /** Whether the puzzle was solved without guessing. */
  deducible: boolean;
  /** How many case splits (what-ifs) were needed if any. */
  splits: number;
  /** Final culprit identification step. */
  culpritReveal: {
    culpritId: string;
    explanation: string;
  };
}

/**
 * Builds a human-readable walkthrough of how to solve the puzzle.
 *
 * This runs the same propagation logic as the technique solver but
 * captures each deduction as it happens, turning the solver's internal
 * state changes into explanations a reader can follow.
 */
export function buildWalkthrough(
  puzzle: GridMysteryPuzzle,
  constraints: readonly ClueConstraint[],
): SolutionWalkthrough {
  const input = solvableFrom(puzzle);
  const size = input.floorPlan.size;
  const prepared = structureClues(input, constraints);
  const { seats, structured } = prepared;

  // Cell -> room index for room-based reasoning
  const roomOfCell: number[] = new Array(size * size).fill(-1);
  input.floorPlan.rooms.forEach((room, roomIndex) => {
    for (const cell of room.cells) {
      roomOfCell[cell.row * size + cell.col] = roomIndex;
    }
  });

  // Initialize candidates: every suspect could be in any seat
  const candidates: Candidates = new Map();
  for (const suspect of input.suspects) {
    candidates.set(suspect.id, new Set(seats));
  }

  const steps: WalkthroughStep[] = [];
  let splits = 0;

  // Helper to get suspect name
  const getSuspectName = (id: string) =>
    input.suspects.find((s) => s.id === id)?.name ?? id;

  // Helper to get cell description
  const describeCell = (index: number): string => {
    const row = Math.floor(index / size);
    const col = index % size;
    const roomName = input.floorPlan.rooms.find((r) =>
      r.cells.some((c) => c.row === row && c.col === col),
    )?.name;
    return roomName ? `${roomName} (row ${row + 1}, column ${col + 1})` : `row ${row + 1}, column ${col + 1}`;
  };

  // Track which clues have been used for direct deductions
  const applyDirectClues = () => {
    for (let i = 0; i < structured.length; i++) {
      const entry = structured[i]!;
      const set = candidates.get(entry.constraint.suspectId);
      if (!set) continue;
      const before = set.size;
      for (const index of [...set]) {
        if (!entry.own.has(index)) {
          set.delete(index);
        }
      }
      if (set.size < before && set.size > 0) {
        steps.push({
          technique: "direct",
          explanation: `From the clue "${entry.constraint.text}", ${getSuspectName(entry.constraint.suspectId)} must be in one of ${set.size} possible locations.`,
          suspectIds: [entry.constraint.suspectId],
          clueIndex: i,
        });
      }
    }
  };

  // Apply initial direct clues
  applyDirectClues();

  // Propagation with step capture
  const propagateWithTrace = (
    candidates: Candidates,
    ceiling: Technique,
    depth = 0,
  ): boolean => {
    const evidenceState = buildEvidenceState(input);
    let changed = true;
    let solved = false;

    while (changed) {
      changed = false;

      // Uniqueness propagation
      for (const [id, set] of candidates) {
        if (set.size !== 1) continue;
        const only = set.values().next().value!;
        const row = Math.floor(only / size);
        const col = only % size;
        for (const [otherId, otherSet] of candidates) {
          if (otherId === id) continue;
          for (const index of [...otherSet]) {
            if (
              index === only ||
              Math.floor(index / size) === row ||
              index % size === col
            ) {
              otherSet.delete(index);
              changed = true;
              if (otherSet.size === 1 && !steps.some((s) => 
                s.suspectIds.includes(otherId) && s.technique === "elimination"
              )) {
                const remaining = otherSet.values().next().value!;
                steps.push({
                  technique: "elimination",
                  explanation: `Since ${getSuspectName(id)} is in ${describeCell(only)}, ${getSuspectName(otherId)} cannot be in the same row or column. ${getSuspectName(otherId)} must be in ${describeCell(remaining)}.`,
                  suspectIds: [otherId],
                  cell: { row: Math.floor(remaining / size), col: remaining % size },
                });
              }
            }
          }
        }
      }

      // Hidden singles (row/column)
      if (ceiling >= "elimination") {
        for (const axis of ["row", "col"] as const) {
          for (let line = 0; line < size; line++) {
            const inLine = (index: number) =>
              axis === "row"
                ? Math.floor(index / size) === line
                : index % size === line;
            const holders = [...candidates].filter(([, set]) =>
              [...set].some(inLine),
            );
            if (holders.length !== 1) continue;
            const [suspectId, set] = holders[0]!;
            const narrowed = new Set([...set].filter(inLine));
            if (narrowed.size === set.size || narrowed.size === 0) continue;
            
            const oldSize = set.size;
            set.clear();
            for (const index of narrowed) set.add(index);
            changed = true;

            if (oldSize > 1 && set.size === 1) {
              const remaining = set.values().next().value!;
              steps.push({
                technique: "elimination",
                explanation: `In ${axis} ${line + 1}, only ${getSuspectName(suspectId)} can fit there. So ${getSuspectName(suspectId)} must be in ${describeCell(remaining)}.`,
                suspectIds: [suspectId],
                cell: { row: Math.floor(remaining / size), col: remaining % size },
              });
            }
          }
        }
      }

      // Relational propagation
      if (ceiling >= "relational") {
        for (const entry of structured) {
          if (entry.related.length === 0) continue;
          const own = candidates.get(entry.constraint.suspectId);
          if (!own) continue;
          
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
                if (own.size === 1) {
                  const remaining = own.values().next().value!;
                  steps.push({
                    technique: "relational",
                    explanation: `The clue "${entry.constraint.text}" means ${getSuspectName(entry.constraint.suspectId)} and ${getSuspectName(otherId)} have constrained positions. This eliminates possibilities for ${getSuspectName(entry.constraint.suspectId)}, leaving only ${describeCell(remaining)}.`,
                    suspectIds: [entry.constraint.suspectId, otherId],
                    cell: { row: Math.floor(remaining / size), col: remaining % size },
                    clueIndex: structured.indexOf(entry),
                  });
                }
              }
            }
          }
        }
      }

      // Cross-layer propagation
      if (ceiling >= "crossLayer" && evidenceState) {
        const crossResult = applyCrossLayerTrace(
          candidates,
          evidenceState,
          size,
          roomOfCell,
          steps,
          input,
        );
        if (crossResult.changed) {
          changed = true;
        }
      }

      // Check for contradictions or solution
      for (const set of candidates.values()) {
        if (set.size === 0) return false;
      }
      
      solved = [...candidates.values()].every((set) => set.size === 1);
      if (solved) break;
    }

    return solved;
  };

  // Run propagation at crossLayer level (highest non-guessing technique)
  const solved = propagateWithTrace(candidates, "crossLayer");

  // If not solved by pure deduction, we need case splits
  if (!solved) {
    // For now, mark that guessing would be needed
    splits = 1;
    steps.push({
      technique: "caseSplit",
      explanation: "At this point, logical deduction alone is insufficient. A solver would need to make an assumption and test it (what-if reasoning).",
      suspectIds: [],
    });
  }

  // Add culprit reveal step
  const victimId = input.victimSuspectId;
  const victimRoom = findRoomForSuspect(puzzle.solution, victimId, input.floorPlan);
  const culpritId = puzzle.culpritSuspectId;
  
  const culpritReveal = {
    culpritId,
    explanation: `The victim (${getSuspectName(victimId)}) was found in the ${victimRoom?.name ?? "crime scene"}. According to the rules, whoever shared that room is the murderer. Since ${getSuspectName(culpritId)} was the other person in the ${victimRoom?.name ?? "room"}, ${getSuspectName(culpritId)} is the culprit.`,
  };

  return {
    steps,
    deducible: splits === 0,
    splits,
    culpritReveal,
  };
}

/** Helper to get cell from index */
function cellAt(size: number, index: number): Cell {
  return { row: Math.floor(index / size), col: index % size };
}

/** Find the room a suspect occupies in the solution */
function findRoomForSuspect(
  solution: Record<string, Cell>,
  suspectId: string,
  floorPlan: GridMysteryPuzzle["floorPlan"],
): GridMysteryPuzzle["floorPlan"]["rooms"][number] | null {
  const cell = solution[suspectId];
  if (!cell) return null;
  
  for (const room of floorPlan.rooms) {
    if (room.cells.some((c) => c.row === cell.row && c.col === cell.col)) {
      return room;
    }
  }
  return null;
}

/** Build evidence state from puzzle input */
function buildEvidenceState(puzzle: SolvableInput) {
  const evidence = puzzle.evidence;
  if (!evidence || evidence.facts.length === 0) return null;

  const objects: Map<string, Set<string>> = new Map();
  for (const suspect of puzzle.suspects) {
    objects.set(suspect.id, new Set(evidence.objectPool));
  }
  
  const roomIndexByName = new Map<string, number>();
  puzzle.floorPlan.rooms.forEach((room, index) => {
    roomIndexByName.set(room.name, index);
  });

  return {
    objects,
    facts: evidence.facts,
    byHeightDesc: [...puzzle.suspects]
      .sort((a, b) => b.heightIn - a.heightIn)
      .map((suspect) => suspect.id),
    roomIndexByName,
  };
}

/** Cross-layer propagation with tracing */
function applyCrossLayerTrace(
  candidates: Map<string, Set<number>>,
  state: {
    objects: Map<string, Set<string>>;
    facts: readonly EvidenceFact[];
    byHeightDesc: readonly string[];
    roomIndexByName: ReadonlyMap<string, number>;
  },
  size: number,
  roomOfCell: readonly number[],
  steps: WalkthroughStep[],
  input: SolvableInput,
): { changed: boolean } {
  let changed = false;
  const getSuspectName = (id: string) =>
    input.suspects.find((s) => s.id === id)?.name ?? id;

  for (const fact of state.facts) {
    if (fact.kind === "personHas") {
      const suspectId = fact.suspectId;
      const object = fact.object;
      const currentObjects = state.objects.get(suspectId);
      if (currentObjects && (currentObjects.size > 1 || !currentObjects.has(object))) {
        currentObjects.clear();
        currentObjects.add(object);
        changed = true;
        steps.push({
          technique: "crossLayer",
          explanation: `The evidence states "${getSuspectName(suspectId)} was carrying the ${object}". This pins the ${object} to ${getSuspectName(suspectId)}.`,
          suspectIds: [suspectId],
        });
      }
      continue;
    }

    if (fact.kind === "objectInRow" || fact.kind === "objectInColumn" || fact.kind === "objectInRoom") {
      const object = fact.object;
      let locationDesc: string;
      
      if (fact.kind === "objectInRow") {
        locationDesc = `row ${fact.row + 1}`;
      } else if (fact.kind === "objectInColumn") {
        locationDesc = `column ${fact.col + 1}`;
      } else {
        locationDesc = `the ${fact.roomName}`;
      }

      // SEATING -> EVIDENCE: eliminate suspects who can't be in that location
      for (const [suspectId, seats] of candidates) {
        const canBeInLocation = [...seats].some((index) => {
          if (fact.kind === "objectInRow") {
            return Math.floor(index / size) === fact.row;
          } else if (fact.kind === "objectInColumn") {
            return index % size === fact.col;
          } else {
            const roomIndex = state.roomIndexByName.get(fact.roomName);
            return roomIndex !== undefined && roomOfCell[index] === roomIndex;
          }
        });

        if (!canBeInLocation) {
          const suspectObjects = state.objects.get(suspectId);
          if (suspectObjects?.delete(object)) {
            changed = true;
            steps.push({
              technique: "crossLayer",
              explanation: `The ${object} was in ${locationDesc}, but ${getSuspectName(suspectId)} cannot be in that location. So ${getSuspectName(suspectId)} cannot be carrying the ${object}.`,
              suspectIds: [suspectId],
            });
          }
        }
      }

      // EVIDENCE -> SEATING: if only one suspect can have the object, pin their location
      const holders = [...state.objects].filter(([, set]) => set.has(object));
      if (holders.length === 1) {
        const [holderId] = holders[0]!;
        const seats = candidates.get(holderId);
        if (seats) {
          for (const index of [...seats]) {
            const isInLocation = 
              (fact.kind === "objectInRow" && Math.floor(index / size) === fact.row) ||
              (fact.kind === "objectInColumn" && index % size === fact.col) ||
              (fact.kind === "objectInRoom" && roomOfCell[index] === state.roomIndexByName.get(fact.roomName));
            
            if (!isInLocation) {
              seats.delete(index);
              changed = true;
              if (seats.size === 1) {
                const remaining = seats.values().next().value!;
                steps.push({
                  technique: "crossLayer",
                  explanation: `Only ${getSuspectName(holderId)} can be carrying the ${object}, and the ${object} was in ${locationDesc}. So ${getSuspectName(holderId)} must be in ${describeCellFromIndex(remaining, size, input.floorPlan)}.`,
                  suspectIds: [holderId],
                  cell: { row: Math.floor(remaining / size), col: remaining % size },
                });
              }
            }
          }
        }
      }
    }
  }

  return { changed };
}

/** Describe a cell from its index */
function describeCellFromIndex(
  index: number,
  size: number,
  floorPlan: GridMysteryPuzzle["floorPlan"],
): string {
  const row = Math.floor(index / size);
  const col = index % size;
  const room = floorPlan.rooms.find((r) =>
    r.cells.some((c) => c.row === row && c.col === col),
  );
  return room ? `${room.name} (row ${row + 1}, column ${col + 1})` : `row ${row + 1}, column ${col + 1}`;
}

/** Format the walkthrough as readable text */
export function formatWalkthrough(walkthrough: SolutionWalkthrough): string {
  const lines: string[] = [];
  
  lines.push("=== SOLUTION WALKTHROUGH ===\n");
  
  if (!walkthrough.deducible) {
    lines.push("NOTE: This puzzle requires guess-and-check (what-if reasoning).");
    lines.push(`Number of case splits needed: ${walkthrough.splits}\n`);
  }
  
  lines.push("Step-by-step solution:");
  lines.push("----------------------");
  
  walkthrough.steps.forEach((step, i) => {
    lines.push(`\nStep ${i + 1} [${step.technique}]:`);
    lines.push(`  ${step.explanation}`);
  });
  
  lines.push("\n\n=== CULPRIT REVEAL ===");
  lines.push(walkthrough.culpritReveal.explanation);
  
  return lines.join("\n");
}

/** Convert walkthrough to JSON for API responses */
export function walkthroughToJson(walkthrough: SolutionWalkthrough) {
  return {
    steps: walkthrough.steps.map((step) => ({
      ...step,
      cell: step.cell ? `${step.cell.row + 1},${step.cell.col + 1}` : undefined,
    })),
    deducible: walkthrough.deducible,
    splits: walkthrough.splits,
    culpritReveal: walkthrough.culpritReveal,
  };
}
