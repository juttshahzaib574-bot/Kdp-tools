import { describe, expect, it } from "vitest";
import {
  CALIBRATION_TIERS,
  classifyDepth,
  isAcceptableForTier,
  recommendedGridSize,
  tierDistance,
} from "../calibration";
import { generateGridMystery } from "../generate";
import { TIER_CONTRACT } from "../tier-contract";
import type { Difficulty } from "../types";

// A tier label is a promise about how much work a puzzle demands. These
// guard the machinery that keeps that promise honest — see calibration.ts
// for the measured findings that motivated it.

describe("difficulty calibration", () => {
  it("classifies deeper searches as harder tiers, monotonically", () => {
    // Whatever the raw measurements say, classification must be an
    // ordered ladder: more search can never mean an easier label.
    for (const size of [6, 7, 8]) {
      let previousRank = -1;
      for (const nodes of [10, 100, 500, 2000, 8000, 50_000]) {
        const tier = classifyDepth(size, { nodes, backtracks: nodes });
        const rank = CALIBRATION_TIERS.indexOf(tier);
        expect(rank, `size ${size}, ${nodes} nodes`).toBeGreaterThanOrEqual(previousRank);
        previousRank = rank;
      }
    }
  });

  it("puts a trivial solve at the bottom and a huge one at the top", () => {
    expect(classifyDepth(6, { nodes: 5, backtracks: 5 })).toBe("easy");
    expect(classifyDepth(6, { nodes: 500_000, backtracks: 500_000 })).toBe("extreme");
  });

  it("scales with grid size — the same node count means different things", () => {
    // 3000 nodes is a hard puzzle on a 6x6 and an easy-ish one on an 8x8,
    // because the search space itself is far bigger.
    const small = classifyDepth(6, { nodes: 3000, backtracks: 3000 });
    const large = classifyDepth(8, { nodes: 3000, backtracks: 3000 });
    expect(CALIBRATION_TIERS.indexOf(small)).toBeGreaterThan(CALIBRATION_TIERS.indexOf(large));
  });

  it("allows one step of slack but never two", () => {
    // The measured spread inside one tier is wider than the gap between
    // neighbours, so exact matching would reject good puzzles. Two steps
    // out is a genuine mislabel.
    expect(tierDistance("hard", "expert")).toBe(1);
    expect(tierDistance("hard", "easy")).toBe(-2);
    // A depth firmly in easy territory cannot ship as extreme.
    expect(isAcceptableForTier("extreme", 6, { nodes: 5, backtracks: 5 })).toBe(false);
    // ...and one neighbouring tier away is fine.
    const hardish = { nodes: 950, backtracks: 950 };
    expect(isAcceptableForTier("hard", 6, hardish)).toBe(true);
  });

  it("recommends a larger grid for harder tiers", () => {
    // Grid size is the fifth lever: clue policy alone saturates around
    // four distinguishable levels.
    let previous = 0;
    for (const tier of CALIBRATION_TIERS) {
      const size = recommendedGridSize(tier);
      expect(size).toBeGreaterThanOrEqual(previous);
      previous = size;
    }
    expect(recommendedGridSize("easy")).toBeLessThan(recommendedGridSize("extreme"));
  });
});

describe("generation never ships a mislabeled puzzle", () => {
  const tiers: Difficulty[] = ["easy", "medium", "hard", "expert", "extreme"];

  for (const tier of tiers) {
    it(`${tier}: every generated puzzle is acceptable for the label it carries`, () => {
      // The gate's actual contract. A puzzle may be re-tiered on the way
      // out, but whatever label it ends up with must match what it
      // demands of a solver — that is the difference between a
      // difficulty ladder and five words.
      //
      // What "demands" means changed, and this test changed with it.
      // Search NODES measure how hard a machine has to grind, and they
      // decided the label until the technique ladder existed; they are
      // now a secondary signal the ledger reports, not the authority.
      // The label is the reasoning rung the puzzle forces — see
      // tier-contract.ts and the two-sided certification tests in
      // tier-contract.test.ts.
      for (let seed = 0; seed < 8; seed++) {
        const puzzle = generateGridMystery({ gridSize: 7, difficulty: tier, seed: 71_000 + seed });
        expect(
          TIER_CONTRACT[puzzle.difficulty].requires,
          `${tier} seed ${seed} shipped as ${puzzle.difficulty} but needs ${puzzle.logicProfile.solvedAt}`,
        ).toBe(puzzle.logicProfile.solvedAt);
        expect(puzzle.logicProfile.chain).toBeGreaterThanOrEqual(
          TIER_CONTRACT[puzzle.difficulty].minChain,
        );
      }
    });
  }

  it("records the measured depth on the puzzle", () => {
    const puzzle = generateGridMystery({ gridSize: 6, difficulty: "hard", seed: 72_001 });
    expect(puzzle.solveDepth.nodes).toBeGreaterThan(0);
    expect(puzzle.solveDepth.backtracks).toBeGreaterThan(0);
  });

  it("remembers what was asked for even when it re-tiers", () => {
    for (const tier of tiers) {
      const puzzle = generateGridMystery({ gridSize: 6, difficulty: tier, seed: 73_000 });
      expect(puzzle.requestedDifficulty).toBe(tier);
    }
  });

  it("separates easy from the top of the ladder by a wide margin", () => {
    // The one separation the engine can guarantee at a fixed grid size.
    const depthOf = (tier: Difficulty) => {
      const runs = Array.from({ length: 6 }, (_, i) =>
        generateGridMystery({ gridSize: 7, difficulty: tier, seed: 74_000 + i }).solveDepth.nodes,
      ).sort((a, b) => a - b);
      return runs[Math.floor(runs.length / 2)]!;
    };
    expect(depthOf("extreme")).toBeGreaterThan(depthOf("easy") * 5);
  });
});
