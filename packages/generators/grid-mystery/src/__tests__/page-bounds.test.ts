import { describe, expect, it } from "vitest";
import { PDFDocument } from "pdf-lib";
import { generateGridMystery } from "../generate";
import { renderPuzzleOnlyPdf } from "../render-pdf";
import { boundsGuardEnabled, guardPageBounds, PageBoundsError } from "../page-bounds";

// Print layout fails silently: an element 20pt past the margin renders
// fine, tests that count pages still pass, and the defect shows up as a
// trimmed-off word in a printed book. The guard turns that into a thrown
// error during development, and these tests keep both halves honest —
// that it fires when it should, and that the real layout never fires it.

const TRIMS = ["6x9", "7x10", "8.5x11"] as const;
const LONG_TITLE =
  "The Extraordinarily Protracted Affair of the Uncommonly Circumlocutory Antimacassar";
/**
 * No spaces to wrap at. This is not a contrived string — it's the shape
 * of a name a publisher can type into the Customize tab's rename field,
 * and before the fix it put text up to 327pt past the page margin at
 * every single trim size.
 */
const UNBREAKABLE = "Pneumonoultramicroscopicsilicovolcanoconiosis-Blackwood-Fitzherbert-Montmorency";

describe("the bounds guard itself", () => {
  it("is active outside production builds", () => {
    expect(boundsGuardEnabled()).toBe(true);
  });

  it("throws for an element crossing the safe area, and allows one inside it", async () => {
    const doc = await PDFDocument.create();
    const page = doc.addPage([432, 648]);
    const safe = { x: 27, y: 27, width: 378, height: 594 };
    const guarded = guardPageBounds(page, safe, "test");

    expect(() => guarded.drawRectangle({ x: 10, y: 100, width: 50, height: 50 })).toThrow(
      PageBoundsError,
    );
    expect(() => guarded.drawRectangle({ x: 380, y: 100, width: 50, height: 50 })).toThrow(
      PageBoundsError,
    );
    expect(() => guarded.drawRectangle({ x: 30, y: 100, width: 50, height: 50 })).not.toThrow();
  });

  it("names what overflowed and by how much", async () => {
    const doc = await PDFDocument.create();
    const page = doc.addPage([432, 648]);
    const guarded = guardPageBounds(page, { x: 27, y: 27, width: 378, height: 594 }, "test");
    try {
      guarded.drawRectangle({ x: 7, y: 100, width: 50, height: 50 });
      expect.unreachable("should have thrown");
    } catch (error) {
      expect(error).toBeInstanceOf(PageBoundsError);
      expect((error as Error).message).toContain("20.00pt past the left");
    }
  });
});

describe("the puzzle page stays inside its safe area", () => {
  // One puzzle per trim x grid size. The guard runs on every draw call
  // inside each render, so each case here is hundreds of assertions.
  for (const trimSize of TRIMS) {
    for (const gridSize of [6, 8]) {
      it(`${trimSize} at ${gridSize}x${gridSize}`, async () => {
        const puzzle = generateGridMystery({ gridSize, difficulty: "medium", seed: 31_337 });
        await expect(
          renderPuzzleOnlyPdf(puzzle, { trimSize, includeAnswerKey: true }),
        ).resolves.toBeDefined();
      });
    }
  }

  it("survives a title far longer than the page is wide", async () => {
    const puzzle = generateGridMystery({ gridSize: 7, difficulty: "medium", seed: 4 });
    for (const trimSize of TRIMS) {
      await expect(
        renderPuzzleOnlyPdf(puzzle, { trimSize, includeAnswerKey: false, caseTitle: LONG_TITLE }),
      ).resolves.toBeDefined();
    }
  });

  it("survives a title with no spaces to wrap at", async () => {
    const puzzle = generateGridMystery({ gridSize: 7, difficulty: "medium", seed: 4 });
    for (const trimSize of TRIMS) {
      await expect(
        renderPuzzleOnlyPdf(puzzle, {
          trimSize,
          includeAnswerKey: false,
          caseTitle: UNBREAKABLE,
          caseSubtitle: UNBREAKABLE,
        }),
      ).resolves.toBeDefined();
    }
  });

  it("survives an unbreakable suspect name in the clue cards", async () => {
    // Renames flow into every clue, so the same hazard reaches the
    // narrow two-column card text, not just the heading.
    const base = generateGridMystery({ gridSize: 7, difficulty: "medium", seed: 9 });
    const puzzle = {
      ...base,
      suspects: base.suspects.map((s, i) => (i === 0 ? { ...s, name: UNBREAKABLE } : s)),
    };
    await expect(
      renderPuzzleOnlyPdf(puzzle, { trimSize: "6x9", includeAnswerKey: false }),
    ).resolves.toBeDefined();
  });

  it("holds with bleed on, where every margin shifts", async () => {
    const puzzle = generateGridMystery({ gridSize: 8, difficulty: "hard", seed: 77 });
    for (const trimSize of TRIMS) {
      await expect(
        renderPuzzleOnlyPdf(puzzle, { trimSize, includeAnswerKey: true, bleed: true }),
      ).resolves.toBeDefined();
    }
  });
});
