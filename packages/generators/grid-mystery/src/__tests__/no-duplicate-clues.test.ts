import { describe, expect, it } from "vitest";
import { generateGridMystery } from "../generate";
import { renderTemplate, resolveNames } from "../text-template";

// No page may print the same sentence twice.
//
// Found on a proof, not in a test: a Hard 7x7 card read
//
//   Fenna Doyle sat both north and west of Priya Marsh.
//   Fenna Doyle sat both north and west of Priya Marsh.
//
// Two candidates can phrase identically — a compound clue built from a
// pair of relations reads the same whichever relation came first — and
// both the candidate pool and the extras pass deduped by object identity,
// which does not notice. A repeated clue is the most visible kind of
// "recycled" a puzzle book can have, and it is worse than cosmetic: it
// costs the reader a foothold they were promised and it spends the
// extras budget to print nothing.

describe("clue text is distinct", () => {
  it("never repeats a sentence within one puzzle, at any tier", () => {
    for (const difficulty of ["easy", "medium", "hard", "expert", "extreme"] as const) {
      for (let seed = 0; seed < 12; seed++) {
        const puzzle = generateGridMystery({
          gridSize: 7,
          difficulty,
          themeId: "manor",
          seed: 20_260 + seed * 31,
        });
        const names = resolveNames(puzzle.suspects);
        const rendered = puzzle.clues.map((c) => renderTemplate(c.text, names));
        expect(new Set(rendered).size, `${difficulty} seed ${seed}`).toBe(rendered.length);

        // Same for the evidence block, which is a second list of
        // sentences on the same page and built by the same kind of pass.
        const evidence = puzzle.evidenceClues.map((c) => renderTemplate(c.text, names));
        expect(new Set(evidence).size, `${difficulty} evidence seed ${seed}`).toBe(evidence.length);
      }
    }
  }, 900_000);

  it("never gives one suspect the same sentence twice", () => {
    // The observed failure: both copies landed on one card, where the
    // repetition is unmissable.
    for (let seed = 0; seed < 20; seed++) {
      const puzzle = generateGridMystery({
        gridSize: 8,
        difficulty: "hard",
        themeId: "manor",
        seed: 41_000 + seed * 17,
      });
      const names = resolveNames(puzzle.suspects);
      const bySuspect = new Map<string, string[]>();
      for (const clue of puzzle.clues) {
        const list = bySuspect.get(clue.suspectId) ?? [];
        list.push(renderTemplate(clue.text, names));
        bySuspect.set(clue.suspectId, list);
      }
      for (const [id, texts] of bySuspect) {
        expect(new Set(texts).size, `${id} on seed ${seed}`).toBe(texts.length);
      }
    }
  }, 900_000);
});
