import { describe, expect, it } from "vitest";
import { generateGridMystery } from "../generate";
import { THEMES } from "../content";
import { renderTemplate, resolveNames } from "../text-template";
import type { GridMysteryPuzzle } from "../types";

/**
 * KDP's duplicate-content bots flag books whose interiors look like other
 * books' interiors — including books published by *other* sellers using
 * the same tool. That makes cross-book similarity an existential concern
 * for a puzzle-book generator, not a nice-to-have.
 *
 * This suite turns the claim into a measurement instead of a promise. It
 * generates a realistic book's worth of puzzles from independent seeds
 * and checks three things a flagging bot would look at:
 *
 *   1. No two puzzles are the same puzzle (identical solution + clues).
 *   2. No two puzzles share their full clue-text block.
 *   3. Individual clue SENTENCES repeat rarely across puzzles — this is
 *      the n-gram signal, and the phrasing pools in phrasings.ts exist
 *      specifically to keep it low.
 */
describe("cross-book uniqueness — what a KDP duplicate-content bot would measure", () => {
  /**
   * Clue/evidence text is stored as a TEMPLATE with name tokens (see
   * text-template.ts). A duplicate-content bot reads the PRINTED page, so
   * every similarity measurement here resolves templates first —
   * comparing raw templates would understate distinctness badly, since
   * two puzzles with different casts share the token form.
   */
  const printed = (puzzle: GridMysteryPuzzle, template: string) =>
    renderTemplate(template, resolveNames(puzzle.suspects));

  function fingerprint(puzzle: GridMysteryPuzzle): string {
    const seats = Object.entries(puzzle.solution)
      .map(([id, cell]) => `${id}@${cell.row},${cell.col}`)
      .sort()
      .join("|");
    const clues = puzzle.clues
      .map((c) => printed(puzzle, c.text))
      .sort()
      .join("|");
    return `${seats}::${clues}`;
  }

  const BOOK_SIZE = 60;
  const puzzles: GridMysteryPuzzle[] = [];
  for (let i = 0; i < BOOK_SIZE; i++) {
    puzzles.push(
      generateGridMystery({
        gridSize: 7,
        difficulty: "medium",
        seed: 900_000 + i * 7919, // stride by a prime so seeds aren't adjacent
      }),
    );
  }

  it(`generates ${BOOK_SIZE} puzzles with zero duplicate solution+clue fingerprints`, () => {
    const seen = new Set(puzzles.map(fingerprint));
    expect(seen.size).toBe(BOOK_SIZE);
  });

  it("no two puzzles share an identical clue block", () => {
    const blocks = puzzles.map((p) =>
      p.clues
        .map((c) => printed(p, c.text))
        .sort()
        .join("\n"),
    );
    expect(new Set(blocks).size).toBe(BOOK_SIZE);
  });

  it("no two puzzles share an identical evidence block", () => {
    const blocks = puzzles.map((p) =>
      p.evidenceClues
        .map((c) => printed(p, c.text))
        .sort()
        .join("\n"),
    );
    expect(new Set(blocks).size).toBe(BOOK_SIZE);
  });

  it("individual clue sentences repeat across puzzles only rarely", () => {
    // The metric a duplicate-detector actually computes: of every clue
    // sentence printed across the whole book, what share are distinct?
    // Some repetition is unavoidable and harmless — "Emil was against one
    // of the outer walls" is a sentence a 7x7 grid will legitimately
    // produce more than once across 60 puzzles. What matters is that the
    // book doesn't read as the same few sentences shuffled.
    const allClues = puzzles.flatMap((p) => p.clues.map((c) => printed(p, c.text)));
    const distinct = new Set(allClues);
    const distinctRatio = distinct.size / allClues.length;

    // Reported so a regression shows the actual number rather than just
    // a red check — if a future change collapses phrasing variety, this
    // line says by how much.
    console.log(
      `clue-sentence distinctness: ${distinct.size}/${allClues.length} = ${(distinctRatio * 100).toFixed(1)}%`,
    );
    expect(distinctRatio).toBeGreaterThan(0.9);
  });

  it("every theme pack produces puzzles that verify and stay distinct", () => {
    for (const theme of THEMES) {
      const themed = Array.from({ length: 8 }, (_, i) =>
        generateGridMystery({ gridSize: 6, difficulty: "hard", theme, seed: 4242 + i * 31 }),
      );
      // Sanity that the pack is actually being used, not silently falling
      // back to the manor pack.
      for (const puzzle of themed) expect(puzzle.theme).toBe(theme.name);
      expect(new Set(themed.map(fingerprint)).size).toBe(themed.length);
    }
  });
});
