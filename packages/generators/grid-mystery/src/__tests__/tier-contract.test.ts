import { describe, expect, it } from "vitest";
import { generateWithProof } from "../generate";
import { gradePuzzle, TIER_CONTRACT, tierFor, EXTREME_MIN_CHAIN } from "../tier-contract";
import {
  solvableFrom,
  solveByTechnique,
  techniqueRank,
  type SolvableInput,
} from "../technique-solver";
import type { Difficulty } from "../types";

const TIERS: Difficulty[] = ["easy", "medium", "hard", "expert", "extreme"];

/** The solver's view of a generated puzzle, evidence layer included. */
const solvableOf = (result: ReturnType<typeof generateWithProof>): SolvableInput =>
  solvableFrom(result.puzzle);

describe("tier contract", () => {
  it("grades by the LOWEST ceiling that works, so a tier is claimed from both sides", () => {
    // The property the whole contract rests on. If grading returned any
    // ceiling that happens to solve, every puzzle would qualify as
    // Extreme and the ladder would be decoration.
    const result = generateWithProof({ gridSize: 7, difficulty: "medium", seed: 4242 });
    const grade = gradePuzzle(solvableOf(result), result.constraints);
    expect(grade.solvedAt).not.toBeNull();

    const rung = techniqueRank(grade.solvedAt!);
    for (const lower of ["direct", "elimination", "relational", "crossLayer"] as const) {
      if (techniqueRank(lower) >= rung) continue;
      const below = solveByTechnique(solvableOf(result), result.constraints, lower);
      expect(below.solved && below.splits === 0).toBe(false);
    }
  });

  it("ships every puzzle under the tier it actually earned", () => {
    // Not "the tier that was asked for". A seed that can't support the
    // request is re-tiered rather than mislabeled, so this holds even
    // when the request is missed.
    for (const tier of TIERS) {
      for (let i = 0; i < 3; i++) {
        const result = generateWithProof({ gridSize: 7, difficulty: tier, seed: 700 + i * 91 });
        const grade = gradePuzzle(solvableOf(result), result.constraints);
        expect(grade.earned).toBe(result.puzzle.difficulty);
        expect(result.puzzle.logicProfile.solvedAt).toBe(grade.solvedAt);
      }
    }
  });

  it("never ships a puzzle that needs guessing", () => {
    // The reason the contract exists. A unique answer is not the same as
    // a reachable one; this asserts the reachable half at every tier.
    for (const tier of TIERS) {
      for (let i = 0; i < 3; i++) {
        const result = generateWithProof({ gridSize: 7, difficulty: tier, seed: 1300 + i * 57 });
        const profile = solveByTechnique(
          solvableOf(result),
          result.constraints,
          result.puzzle.logicProfile.solvedAt,
        );
        expect(profile.solved).toBe(true);
        expect(profile.splits).toBe(0);
      }
    }
  });

  it("puts the shipped tier's rung at or above what its contract promises", () => {
    for (const tier of TIERS) {
      const result = generateWithProof({ gridSize: 7, difficulty: tier, seed: 2600 });
      const shipped = result.puzzle.difficulty;
      expect(techniqueRank(result.puzzle.logicProfile.solvedAt)).toBe(
        techniqueRank(TIER_CONTRACT[shipped].requires),
      );
      expect(result.puzzle.logicProfile.chain).toBeGreaterThanOrEqual(
        TIER_CONTRACT[shipped].minChain,
      );
    }
  });

  it("separates Extreme from Expert by chain length, not by clue count", () => {
    expect(tierFor("crossLayer", EXTREME_MIN_CHAIN - 1)).toBe("expert");
    expect(tierFor("crossLayer", EXTREME_MIN_CHAIN)).toBe("extreme");
    // And the rungs below cannot reach either, whatever the chain.
    expect(tierFor("relational", 99)).toBe("hard");
    expect(tierFor("elimination", 99)).toBe("medium");
    expect(tierFor("direct", 99)).toBe("easy");
  });

  it("carries a printable logic profile on every puzzle", () => {
    const result = generateWithProof({ gridSize: 7, difficulty: "expert", seed: 8181 });
    const { logicProfile } = result.puzzle;
    expect(logicProfile.summary.length).toBeGreaterThan(0);
    // "case split" would mean the card is advertising guesswork.
    expect(logicProfile.summary).not.toContain("what-if");
    expect(logicProfile.techniques.length).toBeGreaterThan(0);
  });
});

describe("cross-layer reasoning", () => {
  it("is what Expert and Extreme actually need — remove the evidence and they stall", () => {
    // The band's definition, tested as a difference rather than asserted.
    // With the evidence block the grid finishes; without it, the same
    // clues no longer get there by reasoning alone.
    let checked = 0;
    for (let i = 0; i < 6 && checked < 2; i++) {
      const result = generateWithProof({ gridSize: 7, difficulty: "expert", seed: 5500 + i * 173 });
      if (result.puzzle.logicProfile.solvedAt !== "crossLayer") continue;
      checked++;

      const withEvidence = solveByTechnique(solvableOf(result), result.constraints, "crossLayer");
      expect(withEvidence.solved && withEvidence.splits === 0).toBe(true);

      const stripped: SolvableInput = { ...solvableOf(result), evidence: undefined };
      const without = solveByTechnique(stripped, result.constraints, "crossLayer");
      expect(without.solved && without.splits === 0).toBe(false);
    }
    expect(checked).toBeGreaterThan(0);
  });

  it("gives every evidence clue a machine-readable fact, not just prose", () => {
    const result = generateWithProof({ gridSize: 7, difficulty: "hard", seed: 3300 });
    expect(result.puzzle.evidenceClues.length).toBeGreaterThan(0);
    for (const clue of result.puzzle.evidenceClues) {
      expect(clue.text.length).toBeGreaterThan(0);
      expect(clue.fact).toBeDefined();
      expect(typeof clue.fact.kind).toBe("string");
    }
  });
});
