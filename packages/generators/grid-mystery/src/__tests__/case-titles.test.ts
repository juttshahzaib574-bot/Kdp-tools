import { describe, expect, it } from "vitest";
import {
  caseBriefFor,
  caseTitleFor,
  caseTitleVariants,
  howToSolveFor,
  resolveCaseTitles,
} from "../case-titles";
import { chooseLabelAnchor } from "../puzzle-page";
import { generateGridMystery } from "../generate";
import { THEMES } from "../content";
import { renderTemplate, resolveNames } from "../text-template";

// Every puzzle in a book used to print the same heading and the same
// opening sentence — thirty pages of "The Blackwood Manor Mystery". That
// is a duplicate-content signal all by itself, so these guard the
// property that fixed it.

describe("per-puzzle case titles", () => {
  const book = Array.from({ length: 30 }, (_, i) =>
    generateGridMystery({ gridSize: 7, difficulty: "medium", seed: 4000 + i }),
  );

  it("gives a whole book distinct headings", () => {
    const titles = resolveCaseTitles(book);
    expect(titles).toHaveLength(book.length);
    expect(new Set(titles).size).toBe(book.length);
    for (const title of titles) expect(title.trim().length).toBeGreaterThan(0);
  });

  it("never falls back to the bare theme name", () => {
    // The old behaviour: every heading was "The <theme> Mystery".
    for (const title of resolveCaseTitles(book)) {
      expect(title).not.toBe(`The ${book[0]!.theme} Mystery`);
    }
  });

  it("draws the title from that puzzle's own facts", () => {
    // A title should name this case's victim, room or weapon — that is
    // what makes it meaningful rather than decorative.
    for (const puzzle of book.slice(0, 12)) {
      const victim = puzzle.suspects.find((s) => s.id === puzzle.victimSuspectId)!;
      // Titles are stored as TEMPLATES with name tokens (see
      // text-template.ts) — resolve before asserting on the prose.
      const resolved = renderTemplate(caseTitleFor(puzzle), resolveNames(puzzle.suspects));
      const title = resolved.toLowerCase();
      const mentionsSomething =
        title.includes(victim.name.toLowerCase()) ||
        title.includes(puzzle.crimeRoomName.toLowerCase()) ||
        title.includes(puzzle.murderWeapon.toLowerCase());
      expect(mentionsSomething, `"${resolved}" names nothing from its own case`).toBe(true);
    }
  });

  it("is deterministic for a given puzzle", () => {
    const puzzle = book[0]!;
    expect(caseTitleFor(puzzle)).toBe(caseTitleFor(puzzle));
    expect(caseTitleVariants(puzzle)).toEqual(caseTitleVariants(puzzle));
  });

  it("offers enough distinct fallbacks to survive collisions", () => {
    // resolveCaseTitles can only keep a book unique if each puzzle brings
    // a decent spread of alternatives.
    for (const puzzle of book.slice(0, 8)) {
      const variants = caseTitleVariants(puzzle);
      expect(variants.length).toBeGreaterThanOrEqual(12);
      expect(new Set(variants).size).toBe(variants.length);
    }
  });

  it("varies the opening hook across a book while always naming the victim", () => {
    const briefs = book.map((p) => renderTemplate(caseBriefFor(p), resolveNames(p.suspects)));
    // Several distinct framings, not one boilerplate line thirty times.
    expect(new Set(briefs).size).toBeGreaterThan(3);
    // The hook carries the STORY. The row/column rule it used to carry
    // now lives in the method panel, asserted in verdict.test.ts — see
    // the comment on howToSolve for why the two were split.
    for (const [i, brief] of briefs.entries()) {
      const victim = book[i]!.suspects.find((s) => s.id === book[i]!.victimSuspectId)!;
      expect(brief).toContain(victim.name);
    }
  });

  it("prints the same method on every page of one book, and a different one in the next", () => {
    // The method block is the one text that must NOT vary page to page:
    // a reader who has learned the rules skips it, and a reader checking
    // a rule needs it in the same words in the same place.
    const method = book.map((p) => howToSolveFor(p, 4242));
    // Steps 1 and 2 are the rules of the grid — identical on every page.
    for (const m of method) {
      expect(m[0]).toBe(method[0]![0]);
      expect(m[1]).toBe(method[0]![1]);
    }
    // Step 3 is the rule that names the murderer. Two things legitimately
    // move it: the tier, because a Hard page cannot be answered the way an
    // Easy one is, and the murder weapon, because a rule that turns on the
    // weapon has to name that puzzle's weapon. Neither is the wording
    // drifting — so the check is on the SHAPE, with the weapon masked out.
    const shape = (i: number) => method[i]![2].replace(book[i]!.murderWeapon, "<weapon>");
    const byKind = new Map<string, string>();
    book.forEach((p, i) => {
      const seen = byKind.get(p.verdict.kind);
      if (seen === undefined) byKind.set(p.verdict.kind, shape(i));
      else expect(shape(i)).toBe(seen);
    });
    // Across books the wording still moves, which is where the
    // duplicate-content risk actually sits.
    const otherBook = book.map((p) => howToSolveFor(p, 99));
    expect(otherBook[0]!.join(" | ")).not.toBe(method[0]!.join(" | "));
  });

  it("works across every theme pack", () => {
    for (const theme of THEMES) {
      const themed = Array.from({ length: 6 }, (_, i) =>
        generateGridMystery({ gridSize: 6, difficulty: "easy", theme, seed: 8100 + i }),
      );
      expect(new Set(resolveCaseTitles(themed)).size).toBe(themed.length);
    }
  });
});

describe("room label placement", () => {
  // Two visible defects came out of this one function: a name running
  // across the plan border, and a name printing straight through a
  // furniture glyph. The run must stop at BOTH.
  const rowOf = (row: number, cols: number[]) => cols.map((col) => ({ row, col }));

  it("stops the run at a prop, not just at the room edge", () => {
    // A five-wide room with a prop in the middle: the label may only
    // span the cells before it.
    const cells = rowOf(0, [0, 1, 2, 3, 4]);
    const { anchor, run } = chooseLabelAnchor(cells, (r, c) => r === 0 && c === 2);
    expect(anchor).toEqual({ row: 0, col: 0 });
    expect(run).toBe(2); // cols 0 and 1, stopping before the prop at col 2
  });

  it("stops the run at the room boundary", () => {
    const cells = rowOf(0, [0, 1, 2]);
    const { run } = chooseLabelAnchor(cells, () => false);
    expect(run).toBe(3);
  });

  it("prefers the longest prop-free run available", () => {
    // Row 0 is chopped short by a prop; row 1 is clear and wider.
    const cells = [...rowOf(0, [0, 1, 2, 3]), ...rowOf(1, [0, 1, 2, 3])];
    const { anchor, run } = chooseLabelAnchor(cells, (r, c) => r === 0 && c === 1);
    expect(run).toBe(4);
    expect(anchor.row).toBe(1);
  });

  it("never anchors on a prop cell when a clear cell exists", () => {
    const cells = rowOf(0, [0, 1]);
    const { anchor } = chooseLabelAnchor(cells, (r, c) => r === 0 && c === 0);
    expect(anchor).toEqual({ row: 0, col: 1 });
  });

  it("degrades to a zero run rather than throwing when every cell has a prop", () => {
    const cells = rowOf(0, [0, 1]);
    const { run } = chooseLabelAnchor(cells, () => true);
    expect(run).toBe(0);
  });

  it("holds for every room of real generated puzzles", () => {
    // The property that matters end to end: whatever anchor is chosen,
    // no cell the label spans may carry a prop.
    for (let seed = 0; seed < 12; seed++) {
      const puzzle = generateGridMystery({ gridSize: 7, difficulty: "medium", seed: 9100 + seed });
      const props = new Set(
        puzzle.floorPlan.landmarks.map((l) => `${l.cell.row},${l.cell.col}`),
      );
      for (const room of puzzle.floorPlan.rooms) {
        const { anchor, run } = chooseLabelAnchor(room.cells, (r, c) => props.has(`${r},${c}`));
        for (let i = 0; i < run; i++) {
          expect(
            props.has(`${anchor.row},${anchor.col + i}`),
            `${room.name} label would cover a prop at ${anchor.row},${anchor.col + i}`,
          ).toBe(false);
        }
      }
    }
  });
});
