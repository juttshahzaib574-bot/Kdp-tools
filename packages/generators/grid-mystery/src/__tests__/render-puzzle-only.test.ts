import { describe, it, expect } from "vitest";
import { PDFDocument } from "pdf-lib";
import { generateGridMystery } from "../generate";
import { renderPuzzleOnlyPdf } from "../render-pdf";

describe("renderPuzzleOnlyPdf", () => {
  it("renders just the puzzle pages (no matter) and each PDF is loadable", async () => {
    const puzzle = generateGridMystery({ gridSize: 6, difficulty: "easy", seed: 42 });
    const { pdf, pageCount } = await renderPuzzleOnlyPdf(puzzle, { trimSize: "6x9" });
    // Puzzle-only = ONE page holding the grid, suspect cards and evidence
    // together, plus one optional answer-key page. This used to be 4-5
    // pages before the puzzle page was laid out as a single designed page
    // (see puzzle-page.ts).
    expect(pageCount).toBeGreaterThanOrEqual(1);
    expect(pageCount).toBeLessThanOrEqual(2);
    const doc = await PDFDocument.load(pdf);
    expect(doc.getPageCount()).toBe(pageCount);
  });

  it("skips the answer key page when includeAnswerKey is false", async () => {
    const puzzle = generateGridMystery({ gridSize: 6, difficulty: "easy", seed: 42 });
    const withKey = await renderPuzzleOnlyPdf(puzzle, { trimSize: "6x9", includeAnswerKey: true });
    const withoutKey = await renderPuzzleOnlyPdf(puzzle, { trimSize: "6x9", includeAnswerKey: false });
    expect(withoutKey.pageCount).toBe(withKey.pageCount - 1);
  });

  it("produces distinct PDFs for distinct seeds", async () => {
    const [a, b] = await Promise.all([
      renderPuzzleOnlyPdf(generateGridMystery({ gridSize: 6, difficulty: "easy", seed: 1 }), {
        trimSize: "6x9",
      }),
      renderPuzzleOnlyPdf(generateGridMystery({ gridSize: 6, difficulty: "easy", seed: 999 }), {
        trimSize: "6x9",
      }),
    ]);
    expect(Buffer.from(a.pdf).equals(Buffer.from(b.pdf))).toBe(false);
  });
});
