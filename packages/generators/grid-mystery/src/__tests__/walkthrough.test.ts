import { describe, it, expect } from "vitest";
import { generateWithProof } from "../generate";
import { buildWalkthrough, formatWalkthrough } from "../walkthrough";
import { solveByTechnique, solvableFrom } from "../technique-solver";

describe("Solution Walkthrough", () => {
  it("generates a walkthrough for an easy puzzle", () => {
    const generated = generateWithProof({
      gridSize: 6,
      difficulty: "easy",
      themeId: "manor",
      seed: 12345,
    });

    const walkthrough = buildWalkthrough(generated.puzzle, generated.constraints);

    expect(walkthrough.steps).toBeDefined();
    expect(walkthrough.steps.length).toBeGreaterThan(0);
    expect(walkthrough.culpritReveal).toBeDefined();
    expect(walkthrough.culpritReveal.culpritId).toBe(generated.puzzle.culpritSuspectId);
    
    // Easy puzzles should be deducible without guessing
    expect(walkthrough.deducible).toBe(true);
    expect(walkthrough.splits).toBe(0);

    // Verify the culprit reveal explanation makes sense
    expect(walkthrough.culpritReveal.explanation).toContain("victim");
    expect(walkthrough.culpritReveal.explanation).toContain("murderer");
  });

  it("formats walkthrough as readable text", () => {
    const generated = generateWithProof({
      gridSize: 6,
      difficulty: "easy",
      themeId: "manor",
      seed: 12345,
    });

    const walkthrough = buildWalkthrough(generated.puzzle, generated.constraints);
    const formatted = formatWalkthrough(walkthrough);

    expect(formatted).toContain("SOLUTION WALKTHROUGH");
    expect(formatted).toContain("Step");
    expect(formatted).toContain("CULPRIT REVEAL");
    
    // Should contain at least one step explanation
    expect(formatted.split("\n").length).toBeGreaterThan(5);
  });

  it("walkthrough steps match technique solver profile", () => {
    const generated = generateWithProof({
      gridSize: 7,
      difficulty: "medium",
      themeId: "farm",
      seed: 67890,
    });

    const walkthrough = buildWalkthrough(generated.puzzle, generated.constraints);
    const profile = solveByTechnique(
      solvableFrom(generated.puzzle),
      generated.constraints,
      "crossLayer"
    );

    // If the profile says it's solvable without splits, walkthrough should agree
    if (profile.solved && profile.splits === 0) {
      expect(walkthrough.deducible).toBe(true);
    }

    // Techniques used in walkthrough should be subset of profile techniques
    const walkthroughTechniques = new Set(walkthrough.steps.map((s) => s.technique));
    for (const technique of walkthroughTechniques) {
      if (technique !== "caseSplit") {
        expect(profile.used).toContain(technique);
      }
    }
  });

  it("handles puzzles with evidence layer", () => {
    const generated = generateWithProof({
      gridSize: 8,
      difficulty: "expert",
      themeId: "camp",
      seed: 11111,
    });

    const walkthrough = buildWalkthrough(generated.puzzle, generated.constraints);

    // Expert puzzles should have evidence clues
    expect(generated.puzzle.evidenceClues.length).toBeGreaterThan(0);
    
    // Walkthrough should handle cross-layer reasoning
    expect(walkthrough.steps).toBeDefined();
    
    // Should still identify the culprit correctly
    expect(walkthrough.culpritReveal.culpritId).toBe(generated.puzzle.culpritSuspectId);
  });

  it("each step has required fields", () => {
    const generated = generateWithProof({
      gridSize: 6,
      difficulty: "easy",
      themeId: "manor",
      seed: 99999,
    });

    const walkthrough = buildWalkthrough(generated.puzzle, generated.constraints);

    for (const step of walkthrough.steps) {
      expect(step.technique).toBeDefined();
      expect(step.explanation).toBeDefined();
      expect(step.explanation.length).toBeGreaterThan(10);
      expect(step.suspectIds).toBeDefined();
      expect(Array.isArray(step.suspectIds)).toBe(true);
    }
  });
});
