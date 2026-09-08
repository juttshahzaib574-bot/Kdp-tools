import { describe, expect, it } from "vitest";
import { generateGridMystery } from "../generate";
import { caseBriefFor, caseTitleFor } from "../case-titles";
import { applyOverrides, renderTemplate, resolveNames, suspectToken } from "../text-template";
import type { GridMysteryPuzzle } from "../types";

// The two guarantees the Review & Customize tab is built on.
//
// Both are ultimately properties of the ENGINE rather than of the UI —
// a rename is cheap because text is stored tokenised, and a reroll is
// isolated because generation is a pure function of a seed — so this is
// where they're pinned. The API routes that expose them
// (apps/web/src/app/api/books/[id]/puzzles/**) are a thin layer over
// exactly these facts.

/** Every text surface a reader sees on one puzzle's page, still tokenised. */
function surfaces(puzzle: GridMysteryPuzzle): string[] {
  return [
    caseTitleFor(puzzle),
    caseBriefFor(puzzle),
    ...puzzle.clues.map((clue) => clue.text),
    ...puzzle.evidenceClues.map((clue) => clue.text),
  ];
}

function render(puzzle: GridMysteryPuzzle, names: Record<string, string>): string[] {
  return surfaces(puzzle).map((template) => renderTemplate(template, names));
}

describe("renaming a suspect", () => {
  const puzzle = generateGridMystery({ gridSize: 7, difficulty: "hard", seed: 90210 });
  const original = resolveNames(puzzle.suspects);

  it("stores names as tokens, never as prose", () => {
    // The property that makes everything else here possible. If a name
    // were baked into a clue, renaming would mean regenerating the clue
    // set — and regenerating means re-solving to re-verify.
    for (const template of surfaces(puzzle)) {
      for (const suspect of puzzle.suspects) {
        expect(template).not.toContain(suspect.name);
      }
    }
    const joined = surfaces(puzzle).join(" ");
    // At least the clues address suspects, so tokens must be present.
    expect(joined).toContain(suspectToken(puzzle.clues[0]!.suspectId));
  });

  it("updates every surface that mentioned the old name", () => {
    const target = puzzle.clues[0]!.suspectId;
    const oldName = original[target]!;
    const before = render(puzzle, original);
    const mentions = before
      .map((line, i) => (line.includes(oldName) ? i : -1))
      .filter((i) => i >= 0);
    expect(mentions.length).toBeGreaterThan(0);

    const renamed = { ...original, [target]: "Wilhelmina Ashgrove-Pike" };
    const after = render(puzzle, renamed);

    for (const i of mentions) {
      expect(after[i]).toContain("Wilhelmina Ashgrove-Pike");
    }
    // And nowhere else changed: a surface that never named this suspect
    // is byte-identical.
    for (let i = 0; i < before.length; i++) {
      if (!mentions.includes(i)) expect(after[i]).toBe(before[i]);
    }
  });

  it("does not corrupt a name that is a prefix of another", () => {
    // The trap a naive string-replace falls into: renaming "Mara" would
    // turn "Maranda" into "<new>nda". Tokens make it impossible.
    const [first, second] = [puzzle.suspects[0]!, puzzle.suspects[1]!];
    const names = { ...original, [first.id]: "Mara", [second.id]: "Maranda" };
    const renamed = { ...names, [first.id]: "Delphine" };
    for (const line of render(puzzle, renamed)) {
      expect(line).not.toContain("Delphinenda");
    }
    expect(render(puzzle, renamed).join(" ")).toContain("Maranda");
  });

  it("costs a map edit, not a regeneration", () => {
    // The acceptance criterion is under 200ms for every surface. This
    // measures only the rename path — the puzzle above is already built,
    // and nothing in here calls the generator or the solver.
    const renamed = { ...original };
    for (const suspect of puzzle.suspects) renamed[suspect.id] = `Renamed ${suspect.id}`;

    const started = performance.now();
    const after = render(puzzle, renamed);
    const elapsed = performance.now() - started;

    expect(elapsed).toBeLessThan(200);
    expect(after.join(" ")).toContain("Renamed s0");
  });

  it("leaves the puzzle's logic untouched", () => {
    // Nothing about a rename may move a suspect, change a clue's meaning
    // or alter the proof — which is why no re-verification is needed.
    const edited = applyOverrides(puzzle, { names: { s0: "Someone Else" } });
    expect(edited.solution).toEqual(puzzle.solution);
    expect(edited.clues.map((c) => c.text)).toEqual(puzzle.clues.map((c) => c.text));
    expect(edited.solveDepth).toEqual(puzzle.solveDepth);
    expect(edited.victimSuspectId).toBe(puzzle.victimSuspectId);
    expect(edited.culpritSuspectId).toBe(puzzle.culpritSuspectId);
  });
});

describe("rerolling one puzzle", () => {
  const options = { gridSize: 7, difficulty: "hard", themeId: "manor" } as const;
  const seeds = [77_001, 77_002, 77_003];
  const book = seeds.map((seed) => generateGridMystery({ ...options, seed }));

  it("gives a genuinely different puzzle at a new seed", () => {
    const before = book[1]!;
    const after = generateGridMystery({ ...options, seed: 77_042 });
    expect(after.solution).not.toEqual(before.solution);
    expect(after.clues.map((c) => c.text)).not.toEqual(before.clues.map((c) => c.text));
  });

  it("touches nothing else in the book", () => {
    // Puzzle i is a pure function of seed i, so a reroll of #2 cannot
    // reach #1 or #3. The API route enforces the database half of this
    // with a WHERE on one row id; this is the half that makes that
    // enough.
    const neighbours = [book[0]!, book[2]!];
    const rebuilt = [
      generateGridMystery({ ...options, seed: seeds[0]! }),
      generateGridMystery({ ...options, seed: seeds[2]! }),
    ];
    for (let i = 0; i < neighbours.length; i++) {
      expect(rebuilt[i]!.solution).toEqual(neighbours[i]!.solution);
      expect(rebuilt[i]!.clues.map((c) => c.text)).toEqual(
        neighbours[i]!.clues.map((c) => c.text),
      );
      expect(rebuilt[i]!.solveDepth).toEqual(neighbours[i]!.solveDepth);
    }
  });

  it("restores the exact original puzzle on undo", () => {
    // Undo hands the old seed back and the engine rebuilds from it. If
    // generation weren't deterministic, Undo would be a second reroll
    // wearing the wrong label.
    const before = book[1]!;
    const restored = generateGridMystery({ ...options, seed: seeds[1]! });
    expect(restored.solution).toEqual(before.solution);
    expect(restored.clues.map((c) => c.text)).toEqual(before.clues.map((c) => c.text));
    expect(restored.suspects).toEqual(before.suspects);
    expect(restored.difficulty).toBe(before.difficulty);
    expect(restored.solveDepth).toEqual(before.solveDepth);
  });

  it("only ever returns a puzzle it has proved", () => {
    // The verified badge means this and nothing else: generateGridMystery
    // throws rather than return a puzzle whose clue set it couldn't prove
    // has exactly one solution, so every reroll and every undo that
    // returns at all has been through the solver.
    for (const seed of [12_345, 54_321, 99_999]) {
      const puzzle = generateGridMystery({ ...options, seed });
      expect(puzzle.solveDepth.nodes).toBeGreaterThan(0);
      expect(Object.keys(puzzle.solution)).toHaveLength(puzzle.suspects.length);
    }
  });
});
