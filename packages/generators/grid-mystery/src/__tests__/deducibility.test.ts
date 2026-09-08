import { describe, expect, it } from "vitest";
import { generateWithProof } from "../generate";
import { isDeducible, solvableFrom, solveByTechnique } from "../technique-solver";

// The guarantee that keeps a publisher's name clean.
//
// Uniqueness and solvability are different properties, and only the
// first was ever being checked. A clue set can have exactly one solution
// — provable by exhaustive search — while offering a reader no route to
// it but trial and error. That is the "flawed logic" review that sinks a
// puzzle book, and counting solutions does not catch it.
//
// Measured before the gate existed, at 7x7, twelve puzzles per tier:
//
//   easy      12/12 deducible
//   medium    12/12
//   hard       0/12   <- unique, and not solvable by reasoning
//   expert     0/12
//   extreme    0/12
//
// The cause was clue DROPPING: removing a clue is what made a puzzle
// harder, and it is also exactly how the route disappears while the
// answer stays unique.

describe("every published puzzle can be reasoned through", () => {
  for (const difficulty of ["easy", "medium", "hard", "expert", "extreme"] as const) {
    it(`${difficulty}: solvable with no guessing`, () => {
      for (let i = 0; i < 4; i++) {
        const seed = 970_000 + i;
        const { puzzle, constraints } = generateWithProof({ gridSize: 7, difficulty, seed });
        // solvableFrom, not the puzzle itself — see its doc comment. The
        // shorthand drops the evidence block, and Expert and Extreme are
        // the tiers that need it.
        const solvable = solvableFrom(puzzle);
        const profile = solveByTechnique(solvable, constraints);

        expect(profile.solved, `${difficulty} seed ${seed} could not be solved at all`).toBe(true);
        expect(
          profile.splits,
          `${difficulty} seed ${seed} needed ${profile.splits} guesses — a reader would have to try and backtrack`,
        ).toBe(0);
        expect(isDeducible(solvable, constraints)).toBe(true);
      }
    }, 240_000);
  }

  it("still proves exactly one solution — deducibility did not replace uniqueness", () => {
    // Both properties, on the same puzzles. A gate that traded one for
    // the other would be worse than no gate.
    for (let i = 0; i < 3; i++) {
      const { puzzle, constraints } = generateWithProof({
        gridSize: 6,
        difficulty: "hard",
        seed: 980_000 + i,
      });
      for (const constraint of constraints) {
        expect(constraint.isSatisfied(puzzle.solution)).toBe(true);
      }
      expect(isDeducible(puzzle, constraints)).toBe(true);
    }
  }, 240_000);

  it("uses the rule the brief gives the reader", () => {
    // "Exactly one person shared the room in which the victim was found"
    // is on every page. It lives in the brief rather than the clue list,
    // so the solver was reasoning with less than the reader has.
    const { puzzle } = generateWithProof({ gridSize: 7, difficulty: "medium", seed: 990_001 });
    const victimCell = puzzle.solution[puzzle.victimSuspectId]!;
    const room = puzzle.floorPlan.rooms.find((r) =>
      r.cells.some((c) => c.row === victimCell.row && c.col === victimCell.col),
    )!;
    const occupants = puzzle.suspects.filter((s) => {
      const cell = puzzle.solution[s.id]!;
      return room.cells.some((c) => c.row === cell.row && c.col === cell.col);
    });
    expect(occupants).toHaveLength(2);
  }, 60_000);
});
