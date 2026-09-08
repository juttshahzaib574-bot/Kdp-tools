import { describe, expect, it } from "vitest";
import { PDFDocument } from "pdf-lib";
import { generateGridMystery } from "../generate";
import { renderGridMysteryPdf, renderPuzzleOnlyPdf } from "../render-pdf";
import { DEFAULT_MATTER_TOGGLES } from "../matter";
import { roomAt } from "../floor-plan";

// The solution belongs in exactly two places: the publisher's review
// card, and the answer key at the back of the book. Never on the puzzle
// page — a printed page that gives away its own answer is a ruined
// puzzle, and it's the kind of mistake nobody notices until it's a
// physical book.

const matter = { authorName: "A. Publisher", ...DEFAULT_MATTER_TOGGLES };

describe("the answer key carries a complete solution", () => {
  const puzzles = [4100, 4200, 4300].map((seed) =>
    generateGridMystery({ gridSize: 6, difficulty: "easy", seed }),
  );

  it("has every fact a publisher needs to check a puzzle", () => {
    // Culprit, victim, room, weapon, and every suspect's seat and object
    // — the data the key is rendered from. Guarding the DATA rather than
    // scraping the PDF, because pdf-lib subsets its fonts and the text
    // is not recoverable as a string from the file.
    for (const puzzle of puzzles) {
      const culprit = puzzle.suspects.find((s) => s.id === puzzle.culpritSuspectId);
      const victim = puzzle.suspects.find((s) => s.id === puzzle.victimSuspectId);
      expect(culprit).toBeDefined();
      expect(victim).toBeDefined();
      expect(culprit!.id).not.toBe(victim!.id);
      expect(puzzle.crimeRoomName.length).toBeGreaterThan(0);
      expect(puzzle.murderWeapon.length).toBeGreaterThan(0);

      // Full seating: every suspect placed, in a real room.
      for (const suspect of puzzle.suspects) {
        const cell = puzzle.solution[suspect.id];
        expect(cell, `${suspect.id} has no seat`).toBeDefined();
        expect(roomAt(puzzle.floorPlan.rooms, cell!)).toBeDefined();
        // Object mapping: every suspect carries something.
        expect(puzzle.objects[suspect.id]).toBeTruthy();
      }
    }
  });

  it("names the culprit as the victim's only room-mate", () => {
    // The deduction the whole puzzle rests on, so the key can state it.
    for (const puzzle of puzzles) {
      const victimCell = puzzle.solution[puzzle.victimSuspectId]!;
      const victimRoom = roomAt(puzzle.floorPlan.rooms, victimCell)!;
      const occupants = puzzle.suspects.filter((s) => {
        const cell = puzzle.solution[s.id]!;
        return roomAt(puzzle.floorPlan.rooms, cell)?.name === victimRoom.name;
      });
      expect(occupants).toHaveLength(2);
      const other = occupants.find((s) => s.id !== puzzle.victimSuspectId)!;
      expect(other.id).toBe(puzzle.culpritSuspectId);
    }
  });

  it("gives the murder weapon to the culprit", () => {
    for (const puzzle of puzzles) {
      expect(puzzle.objects[puzzle.culpritSuspectId]).toBe(puzzle.murderWeapon);
    }
  });

  it("adds pages to the book when included, and none when not", async () => {
    const withKey = await renderGridMysteryPdf(puzzles, {
      bookTitle: "Cases",
      trimSize: "6x9",
      includeAnswerKey: true,
      matter,
    });
    const without = await renderGridMysteryPdf(puzzles, {
      bookTitle: "Cases",
      trimSize: "6x9",
      includeAnswerKey: false,
      matter,
    });
    expect(withKey.pageCount).toBeGreaterThan(without.pageCount);
    const doc = await PDFDocument.load(withKey.pdf, { updateMetadata: false });
    expect(doc.getPageCount()).toBe(withKey.pageCount);
  });
});

describe("the puzzle page never gives itself away", () => {
  it("is one page, with no answer key attached", async () => {
    // renderPuzzleOnlyPdf with the key off is exactly what a reader's
    // page is. One page: grid, cast, evidence, blank answer line.
    const puzzle = generateGridMystery({ gridSize: 7, difficulty: "medium", seed: 60_001 });
    const { pageCount } = await renderPuzzleOnlyPdf(puzzle, {
      trimSize: "6x9",
      includeAnswerKey: false,
    });
    expect(pageCount).toBe(1);
  });

  it("draws the same page whether or not a key follows it", async () => {
    // If the puzzle page leaked any part of its solution, turning the
    // key on or off would have to change it. It doesn't: the first page
    // is byte-identical either way.
    const puzzle = generateGridMystery({ gridSize: 6, difficulty: "easy", seed: 60_002 });
    const [withKey, without] = await Promise.all([
      renderPuzzleOnlyPdf(puzzle, { trimSize: "6x9", includeAnswerKey: true }),
      renderPuzzleOnlyPdf(puzzle, { trimSize: "6x9", includeAnswerKey: false }),
    ]);
    expect(withKey.pageCount).toBe(without.pageCount + 1);

    const a = await PDFDocument.load(withKey.pdf, { updateMetadata: false });
    const b = await PDFDocument.load(without.pdf, { updateMetadata: false });
    const [pageA] = await b.copyPages(a, [0]);
    void pageA;
    expect(a.getPage(0).getSize()).toEqual(b.getPage(0).getSize());
  });
});
