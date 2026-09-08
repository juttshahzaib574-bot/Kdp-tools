import { describe, expect, it } from "vitest";
import { PDFDocument } from "pdf-lib";
import { generateGridMystery } from "../generate";
import { renderGridMysteryPdf, renderPuzzleOnlyPdf } from "../render-pdf";
import { applyOverrides, suspectToken } from "../text-template";
import { DEFAULT_MATTER_TOGGLES } from "../matter";

// Publisher edits have to reach the printed page, not just the screen.
// Nothing else in the suite covers the wire between the Customize tab's
// overrides and the renderer, and a silently-ignored override is exactly
// the class of bug that only shows up in a finished book.

const matter = { authorName: "A. Publisher", ...DEFAULT_MATTER_TOGGLES };

function differs(a: Uint8Array, b: Uint8Array): boolean {
  return !Buffer.from(a).equals(Buffer.from(b));
}

describe("per-puzzle overrides reach the PDF", () => {
  const puzzle = generateGridMystery({ gridSize: 6, difficulty: "easy", seed: 4242 });

  it("a case title override changes what is drawn", async () => {
    const plain = await renderPuzzleOnlyPdf(puzzle, { trimSize: "6x9", includeAnswerKey: false });
    const retitled = await renderPuzzleOnlyPdf(puzzle, {
      trimSize: "6x9",
      includeAnswerKey: false,
      caseTitle: "The Vanishing at Copperfield Hall",
    });
    expect(differs(plain.pdf, retitled.pdf)).toBe(true);
    expect(retitled.pageCount).toBe(plain.pageCount);
  });

  it("a subtitle is drawn without spilling onto another page", async () => {
    const plain = await renderPuzzleOnlyPdf(puzzle, { trimSize: "6x9", includeAnswerKey: false });
    const withSubtitle = await renderPuzzleOnlyPdf(puzzle, {
      trimSize: "6x9",
      includeAnswerKey: false,
      caseSubtitle: "Seven guests, one locked door, and a great deal of nerve.",
    });
    expect(differs(plain.pdf, withSubtitle.pdf)).toBe(true);
    // The one-page-per-puzzle guarantee is the whole layout. A subtitle
    // may not quietly cost a second page.
    expect(withSubtitle.pageCount).toBe(plain.pageCount);
  });

  it("a blank override is the same as no override at all", async () => {
    // The editor sends whatever is in the field, including "". That must
    // fall back to the generated title rather than printing nothing.
    const plain = await renderPuzzleOnlyPdf(puzzle, { trimSize: "6x9", includeAnswerKey: false });
    const blank = await renderPuzzleOnlyPdf(puzzle, {
      trimSize: "6x9",
      includeAnswerKey: false,
      caseTitle: "   ",
      caseSubtitle: "",
    });
    expect(differs(plain.pdf, blank.pdf)).toBe(false);
  });

  it("renames reach the printed clues", async () => {
    const renamed = applyOverrides(puzzle, { names: { s0: "Perpetua Vane-Hollis" } });
    const before = await renderPuzzleOnlyPdf(puzzle, { trimSize: "6x9", includeAnswerKey: false });
    const after = await renderPuzzleOnlyPdf(renamed, { trimSize: "6x9", includeAnswerKey: false });
    expect(differs(before.pdf, after.pdf)).toBe(true);
  });

  it("resolves name tokens inside a publisher's own title", async () => {
    // A hand-written title may name a suspect. It goes through the same
    // substitution as generated text, so the book never prints `{{s0}}`.
    const { pdf, pageCount } = await renderPuzzleOnlyPdf(puzzle, {
      trimSize: "6x9",
      includeAnswerKey: false,
      caseTitle: `The Last Word of ${suspectToken("s0")}`,
    });
    expect(pageCount).toBeGreaterThan(0);
    // Raw template syntax must not survive into the file.
    expect(Buffer.from(pdf).toString("latin1")).not.toContain("{{s0}}");
    const doc = await PDFDocument.load(pdf, { updateMetadata: false });
    expect(doc.getPageCount()).toBe(pageCount);
  });
});

describe("book-level override arrays", () => {
  const puzzles = [4001, 4002, 4003].map((seed) =>
    generateGridMystery({ gridSize: 6, difficulty: "easy", seed }),
  );

  it("retitles only the puzzle it names", async () => {
    const plain = await renderGridMysteryPdf(puzzles, {
      bookTitle: "Case Files",
      trimSize: "6x9",
      includeAnswerKey: false,
      matter,
    });
    const edited = await renderGridMysteryPdf(puzzles, {
      bookTitle: "Case Files",
      trimSize: "6x9",
      includeAnswerKey: false,
      matter,
      caseTitles: [undefined, "The Second One, Renamed", undefined],
    });
    expect(differs(plain.pdf, edited.pdf)).toBe(true);
    // Retitling must not change how many pages the book runs to — the
    // publisher's cover spine is sized off that number.
    expect(edited.pageCount).toBe(plain.pageCount);
  });

  it("ignores entries past the end of the book", async () => {
    // Puzzle counts change while a publisher edits; a stale array must
    // not throw or shift titles onto the wrong puzzles.
    const edited = await renderGridMysteryPdf(puzzles, {
      bookTitle: "Case Files",
      trimSize: "6x9",
      includeAnswerKey: false,
      matter,
      caseTitles: [undefined, undefined, undefined, "No such puzzle", "Nor this"],
    });
    const plain = await renderGridMysteryPdf(puzzles, {
      bookTitle: "Case Files",
      trimSize: "6x9",
      includeAnswerKey: false,
      matter,
    });
    expect(differs(plain.pdf, edited.pdf)).toBe(false);
  });
});
