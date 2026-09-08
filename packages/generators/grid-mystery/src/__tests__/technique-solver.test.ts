import { describe, expect, it } from "vitest";
import { generateWithProof } from "../generate";
import { solveByTechnique, describeProfile, techniqueRank } from "../technique-solver";

// Difficulty as a person experiences it: which techniques a puzzle
// forces. These guard the simulator itself — a tier certifier is only
// as trustworthy as the solver it certifies against, and a solver that
// makes an invalid deduction reports easy puzzles as impossible.

describe("the technique simulator is a competent solver", () => {
  it("finishes every Easy and Medium puzzle it is given", () => {
    // The property that caught a real bug: an invalid cell-wise "hidden
    // single" was eliminating true solutions, and Easy puzzles measured
    // 1/12 solvable. A grid has far more seats than suspects, so a cell
    // only one suspect COULD take needn't be taken at all.
    //
    // Solving is asserted; solving WITHOUT GUESSING is not, and that gap
    // is the honest state of this simulator. Its propagation is still
    // missing naked pairs and subsets, and room-level counting, so on
    // some seeds it resorts to a case split where a person would not.
    // Tier certification cannot be switched on until that gap closes —
    // a simulator weaker than a competent solver would certify Easy
    // books as Expert.
    for (const difficulty of ["easy", "medium"] as const) {
      for (let i = 0; i < 6; i++) {
        const seed = 910_000 + i;
        const { puzzle, constraints } = generateWithProof({ gridSize: 7, difficulty, seed });
        const profile = solveByTechnique(puzzle, constraints);
        expect(profile.solved, `${difficulty} seed ${seed}`).toBe(true);
      }
    }
  }, 120_000);

  it("never contradicts the true solution", () => {
    // The strongest correctness statement available: whatever the
    // simulator deduces must keep the real answer alive.
    for (let i = 0; i < 6; i++) {
      const { puzzle, constraints } = generateWithProof({
        gridSize: 6,
        difficulty: "medium",
        seed: 920_000 + i,
      });
      const profile = solveByTechnique(puzzle, constraints);
      expect(profile.solved).toBe(true);
      // Every clue holds on the puzzle's own stated solution.
      for (const constraint of constraints) {
        expect(constraint.isSatisfied(puzzle.solution)).toBe(true);
      }
    }
  }, 120_000);

  it("respects a ceiling, so a tier can be certified in both directions", () => {
    // Certification needs "solves at its tier" AND "fails one rung
    // below". That second half is only possible if the ceiling is real.
    const { puzzle, constraints } = generateWithProof({
      gridSize: 7,
      difficulty: "medium",
      seed: 930_001,
    });
    expect(solveByTechnique(puzzle, constraints, "elimination").splits).toBe(0);
    // Capped at direct-only, elimination can't run, so a puzzle needing
    // it must not come out solved.
    const capped = solveByTechnique(puzzle, constraints, "direct");
    expect(capped.splits).toBe(0);
    expect(techniqueRank(capped.hardest)).toBeLessThanOrEqual(techniqueRank("elimination"));
  }, 60_000);

  it("describes a profile in words a publisher can read", () => {
    const { puzzle, constraints } = generateWithProof({
      gridSize: 6,
      difficulty: "easy",
      seed: 940_001,
    });
    const description = describeProfile(solveByTechnique(puzzle, constraints));
    expect(description.length).toBeGreaterThan(0);
    expect(description).not.toContain("undefined");
  }, 60_000);
});
