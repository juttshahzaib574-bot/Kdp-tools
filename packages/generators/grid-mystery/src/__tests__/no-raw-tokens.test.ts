import { describe, expect, it } from "vitest";
import { generateGridMystery } from "../generate";
import { caseBriefFor, caseTitleFor, resolveCaseTitles } from "../case-titles";
import { renderTemplate, resolveNames } from "../text-template";
import { THEMES } from "../content";

// Storing text with `{{sN}}` name tokens is what makes a rename cost a
// map edit instead of a regeneration. The cost of that design is a class
// of bug where a template escapes to a surface that never resolved it —
// which shipped: the preview carousel printed captions reading
// "{{s4}} Never Left the Conservatory".
//
// The rule these enforce: a template is fine anywhere it's stored, and
// never acceptable anywhere a person reads it. Every boundary that hands
// text to a person resolves first.

const TOKEN = /\{\{[^}]*\}\}/;

/** Every string a reader could see for one puzzle, already resolved. */
function readableStrings(puzzle: ReturnType<typeof generateGridMystery>): string[] {
  const names = resolveNames(puzzle.suspects);
  return [
    renderTemplate(caseTitleFor(puzzle), names),
    renderTemplate(caseBriefFor(puzzle), names),
    ...puzzle.clues.map((c) => renderTemplate(c.text, names)),
    ...puzzle.evidenceClues.map((c) => renderTemplate(c.text, names)),
    ...puzzle.suspects.map((s) => s.name),
    puzzle.crimeRoomName,
    ...puzzle.floorPlan.rooms.map((r) => r.name),
    ...Object.values(puzzle.objects),
  ];
}

describe("no raw template tokens reach a reader", () => {
  const book = [1, 2, 3, 4, 5].map((seed) =>
    generateGridMystery({ gridSize: 7, difficulty: "medium", seed }),
  );

  it("leaves no braces in any resolved string, across a whole book", () => {
    for (const puzzle of book) {
      for (const text of readableStrings(puzzle)) {
        expect(text).not.toMatch(TOKEN);
        expect(text).not.toContain("{{");
        expect(text).not.toContain("}}");
      }
    }
  });

  it("holds for every theme pack and every difficulty tier", () => {
    for (const theme of THEMES) {
      for (const difficulty of ["easy", "medium", "hard", "expert", "extreme"] as const) {
        const puzzle = generateGridMystery({
          gridSize: 6,
          difficulty,
          themeId: theme.id,
          seed: 808,
        });
        for (const text of readableStrings(puzzle)) {
          expect(text, `${theme.id}/${difficulty}: ${text}`).not.toContain("{{");
        }
      }
    }
  });

  it("holds for the book-level de-duplicated titles too", () => {
    // resolveCaseTitles picks between candidate TEMPLATES; the caller
    // still has to resolve what it picks. This is the exact shape of the
    // caption bug, one level up.
    const titles = resolveCaseTitles(book);
    for (let i = 0; i < titles.length; i++) {
      const resolved = renderTemplate(titles[i]!, resolveNames(book[i]!.suspects));
      expect(resolved).not.toContain("{{");
    }
  });

  it("still finds the tokens in the STORED text, so this isn't passing vacuously", () => {
    // If the engine stopped tokenising, every assertion above would pass
    // for the wrong reason. Templates must genuinely contain tokens.
    const stored = book.flatMap((p) => p.clues.map((c) => c.text));
    expect(stored.some((text) => TOKEN.test(text))).toBe(true);
  });

  it("substitutes a renamed suspect everywhere, leaving nothing behind", () => {
    const puzzle = book[0]!;
    const names = { ...resolveNames(puzzle.suspects), s0: "Perpetua" };
    for (const template of [
      caseTitleFor(puzzle),
      caseBriefFor(puzzle),
      ...puzzle.clues.map((c) => c.text),
    ]) {
      expect(renderTemplate(template, names)).not.toContain("{{");
    }
  });
});
