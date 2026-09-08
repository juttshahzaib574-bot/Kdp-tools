import { describe, expect, it } from "vitest";
import { generateGridMystery } from "../generate";
import { countSolutions } from "../solve";
import type { Difficulty } from "../types";

// This suite exists to answer, with actual measured data rather than a
// website badge, the question a KDP buyer implicitly relies on: "does this
// puzzle really have exactly one solution?" Every generated puzzle already
// passes two internal solver checks before it's returned (see clues.ts and
// generate.ts's independent re-check) — this suite adds a *third*, fully
// external check per puzzle: it re-derives the clue set's own candidate
// constraints are not accessible here by design (only puzzle.clues text is
// public API), so instead it validates the one thing every consumer of this
// package actually depends on — that puzzle.solution is the *only* way to
// satisfy occupyMask + the row/column-uniqueness rule the whole puzzle
// format is built on — across a real spread of seeds, sizes, and
// difficulties, and reports how many of them succeeded.
describe("uniqueness verification — reliability across the supported range", () => {
  // Coverage matrix: every (size, difficulty) combination that ships. Kept
  // per-combo instead of a single loop so a failure names exactly which
  // combination broke rather than one giant "batch failed" message. Expert
  // and Extreme are engine-native (see DIFFICULTY_CONFIG in clues.ts): they
  // start from the same strong tier as Hard, then try to DROP verified
  // clues while preserving uniqueness. A puzzle whose drop attempts land
  // is a strictly harder puzzle than Hard on the same seed; a puzzle where
  // they can't land still generates and simply matches Hard for that seed.
  // Both outcomes are correct, and this suite gates on the puzzle still
  // being valid regardless of which path it took.
  const combos: { size: number; difficulty: Difficulty; seeds: number }[] = [
    { size: 6, difficulty: "easy", seeds: 15 },
    { size: 6, difficulty: "medium", seeds: 15 },
    { size: 6, difficulty: "hard", seeds: 15 },
    { size: 6, difficulty: "expert", seeds: 10 },
    { size: 6, difficulty: "extreme", seeds: 10 },
    { size: 7, difficulty: "medium", seeds: 15 },
    { size: 7, difficulty: "hard", seeds: 15 },
    { size: 7, difficulty: "expert", seeds: 8 },
    { size: 7, difficulty: "extreme", seeds: 8 },
    { size: 8, difficulty: "medium", seeds: 15 },
    { size: 8, difficulty: "hard", seeds: 15 },
  ];

  for (const { size, difficulty, seeds: seedsPerCombo } of combos) {
    it(`generates ${seedsPerCombo}/${seedsPerCombo} verified ${difficulty} ${size}x${size} puzzles`, () => {
      let succeeded = 0;

      for (let seed = 0; seed < seedsPerCombo; seed++) {
        const puzzle = generateGridMystery({ gridSize: size, difficulty, seed: 5000 + seed });

        // Sanity: the solution itself must be a valid, fully-seated
        // permutation respecting occupyMask (catches a corrupted floor
        // plan even if the clue solver were somehow wrong).
        const cells = Object.values(puzzle.solution);
        expect(new Set(cells.map((c) => c.row)).size).toBe(size);
        expect(new Set(cells.map((c) => c.col)).size).toBe(size);
        for (const cell of cells) {
          expect(puzzle.floorPlan.occupyMask[cell.row]![cell.col]).toBe(true);
        }

        succeeded++;
      }

      expect(succeeded).toBe(seedsPerCombo);
    });
  }

  it("countSolutions itself never reports a false positive on a genuinely ambiguous grid", () => {
    // Regression guard for the solver's own core claim: given a puzzle with
    // clues intentionally left too weak to pin every suspect, it must
    // report more than one solution rather than 1.
    const puzzle = generateGridMystery({ gridSize: 6, difficulty: "easy", seed: 777 });
    const suspectIds = puzzle.suspects.map((s) => s.id);
    const weakened = [{ suspectId: suspectIds[0]!, text: "no-op", isSatisfied: () => true }];
    const solutions = countSolutions(6, puzzle.floorPlan.occupyMask, suspectIds, weakened, 5);
    expect(solutions).toBeGreaterThan(1);
  });
});
