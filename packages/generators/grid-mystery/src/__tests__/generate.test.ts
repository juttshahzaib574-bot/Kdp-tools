import { describe, expect, it } from "vitest";
import { extraClueBudget } from "../clues";
import { generateGridMystery } from "../generate";
import type { Difficulty } from "../types";

describe("generateGridMystery", () => {
  const sizes = [6, 7, 8];
  const difficulties: Difficulty[] = ["easy", "medium", "hard"];

  for (const size of sizes) {
    for (const difficulty of difficulties) {
      it(`produces a verified ${difficulty} puzzle at ${size}x${size} (seed 1)`, () => {
        const puzzle = generateGridMystery({ gridSize: size, difficulty, seed: 1 });

        expect(puzzle.suspects).toHaveLength(size);
        // The clue count has a ceiling and a floor, and neither is the
        // difficulty lever any more.
        //
        // It used to be: one clue per suspect was the cap, and harder
        // tiers dropped clues from that. Dropping clues is how a puzzle
        // stops being solvable at all, though, so difficulty now comes
        // from the technique a puzzle demands (see tier-contract.ts) and
        // the clue count is free to move in whichever direction keeps
        // the puzzle reasonable. On a big grid that direction is UP —
        // eight clues across sixty-four squares leaves a unique answer
        // with no route to it — so the ceiling is one per suspect plus
        // the extra budget for that size. The floor still guards against
        // the drop pass running away and gutting the set.
        expect(puzzle.clues.length).toBeLessThanOrEqual(size + extraClueBudget(size));
        expect(puzzle.clues.length).toBeGreaterThanOrEqual(size - 3);

        const cells = Object.values(puzzle.solution);
        const rows = new Set(cells.map((c) => c.row));
        const cols = new Set(cells.map((c) => c.col));
        expect(rows.size).toBe(size); // one suspect per row
        expect(cols.size).toBe(size); // one suspect per column

        for (const cell of cells) {
          expect(puzzle.floorPlan.occupyMask[cell.row]![cell.col]).toBe(true);
        }

        expect(puzzle.suspects.some((s) => s.id === puzzle.culpritSuspectId)).toBe(true);
      });
    }
  }

  it("is deterministic for a given seed", () => {
    const a = generateGridMystery({ gridSize: 7, difficulty: "medium", seed: 42 });
    const b = generateGridMystery({ gridSize: 7, difficulty: "medium", seed: 42 });
    expect(a.solution).toEqual(b.solution);
    expect(a.clues).toEqual(b.clues);
  });

  it("produces different puzzles across a range of seeds", () => {
    // A single pair of seeds can legitimately collide (there are only 7! = 5040
    // possible position solutions at size 7), so check a spread of seeds
    // instead of asserting any two specific ones must differ.
    const solutions = Array.from({ length: 6 }, (_, i) =>
      JSON.stringify(generateGridMystery({ gridSize: 7, difficulty: "medium", seed: i }).solution),
    );
    expect(new Set(solutions).size).toBeGreaterThan(1);
  });

  it("rejects grid sizes outside the supported range", () => {
    expect(() => generateGridMystery({ gridSize: 5, difficulty: "easy" })).toThrow();
    expect(() => generateGridMystery({ gridSize: 17, difficulty: "easy" })).toThrow();
  });
});
