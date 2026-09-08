import { describe, expect, it } from "vitest";
import {
  alignedGroup,
  CHIP_WINDOW_SIZE,
  clampPuzzleNumber,
  groupForPuzzle,
  parseJump,
  stepPuzzleNumber,
  windowAfterStep,
  showingLabel,
  windowForJump,
} from "../puzzle-window";

// One numbering system, exercised at the exact boundaries the UI hits.
// The chips are derived from the selection rather than stored beside it,
// so these also pin the property that makes that safe: the selection is
// always one of the chips on screen.

const TOTAL = 100;

describe("jumping", () => {
  it("puts the target first and the next four after it", () => {
    expect(windowForJump(85, TOTAL)).toEqual([85, 86, 87, 88, 89]);
    expect(windowForJump(1, TOTAL)).toEqual([1, 2, 3, 4, 5]);
    expect(windowForJump(42, TOTAL)).toEqual([42, 43, 44, 45, 46]);
  });

  it("backs the window up at the end rather than showing a short row", () => {
    expect(windowForJump(99, TOTAL)).toEqual([96, 97, 98, 99, 100]);
    expect(windowForJump(100, TOTAL)).toEqual([96, 97, 98, 99, 100]);
    expect(windowForJump(97, TOTAL)).toEqual([96, 97, 98, 99, 100]);
    // 96 is the last target that still leads its own window.
    expect(windowForJump(96, TOTAL)).toEqual([96, 97, 98, 99, 100]);
    expect(windowForJump(95, TOTAL)).toEqual([95, 96, 97, 98, 99]);
  });

  it("always keeps the selection on screen", () => {
    for (let target = 1; target <= TOTAL; target++) {
      expect(windowForJump(target, TOTAL), `target ${target}`).toContain(target);
    }
  });

  it("shows a short book whole", () => {
    expect(windowForJump(2, 3)).toEqual([1, 2, 3]);
    expect(windowForJump(1, 1)).toEqual([1]);
    expect(windowForJump(4, 5)).toEqual([1, 2, 3, 4, 5]);
  });
});

describe("stepping", () => {
  it("leaves the chips alone while the selection is already on screen", () => {
    const window = [85, 86, 87, 88, 89];
    expect(windowAfterStep(86, window, TOTAL)).toEqual(window);
    expect(windowAfterStep(89, window, TOTAL)).toEqual(window);
    expect(windowAfterStep(85, window, TOTAL)).toEqual(window);
  });

  it("slides by exactly one when the selection crosses an edge", () => {
    // The stated case: arrow-right from 89 gives 86-90 with 90 selected.
    expect(windowAfterStep(90, [85, 86, 87, 88, 89], TOTAL)).toEqual([86, 87, 88, 89, 90]);
    expect(windowAfterStep(84, [85, 86, 87, 88, 89], TOTAL)).toEqual([84, 85, 86, 87, 88]);
  });

  it("follows the selection when it wraps around the book", () => {
    // 100 -> 1 is a jump in disguise; the window belongs at the start.
    expect(windowAfterStep(1, [96, 97, 98, 99, 100], TOTAL)).toEqual([1, 2, 3, 4, 5]);
    expect(windowAfterStep(100, [1, 2, 3, 4, 5], TOTAL)).toEqual([96, 97, 98, 99, 100]);
  });

  it("never slides past the end of the book", () => {
    expect(windowAfterStep(100, [96, 97, 98, 99, 100], TOTAL)).toEqual([96, 97, 98, 99, 100]);
  });

  it("keeps the selection visible through a full walk of the book", () => {
    // The invariant the whole design rests on.
    let window = windowForJump(1, TOTAL);
    let selected = 1;
    for (let i = 0; i < TOTAL * 2; i++) {
      selected = stepPuzzleNumber(selected, 1, TOTAL);
      window = windowAfterStep(selected, window, TOTAL);
      expect(window, `at ${selected}`).toContain(selected);
      expect(window).toHaveLength(CHIP_WINDOW_SIZE);
      expect(window[0]).toBeGreaterThanOrEqual(1);
      expect(window[window.length - 1]).toBeLessThanOrEqual(TOTAL);
    }
  });
});

describe("stepPuzzleNumber", () => {
  it("wraps at both ends, so the book is a loop", () => {
    expect(stepPuzzleNumber(100, 1, TOTAL)).toBe(1);
    expect(stepPuzzleNumber(1, -1, TOTAL)).toBe(TOTAL);
    expect(stepPuzzleNumber(50, 1, TOTAL)).toBe(51);
    expect(stepPuzzleNumber(50, -1, TOTAL)).toBe(49);
  });

  it("stays put in a one-puzzle book", () => {
    expect(stepPuzzleNumber(1, 1, 1)).toBe(1);
    expect(stepPuzzleNumber(1, -1, 1)).toBe(1);
  });
});

describe("the jump box", () => {
  it("accepts a number inside the book", () => {
    expect(parseJump("85", TOTAL)).toEqual({ kind: "ok", value: 85 });
    expect(parseJump("  7 ", TOTAL)).toEqual({ kind: "ok", value: 7 });
  });

  it("clamps a number outside it, and says what the range is", () => {
    expect(parseJump("0", TOTAL)).toEqual({ kind: "clamped", value: 1, total: TOTAL });
    expect(parseJump("101", TOTAL)).toEqual({ kind: "clamped", value: 100, total: TOTAL });
  });

  it("rejects anything that isn't a number", () => {
    for (const raw of ["", "   ", "abc", "1.5", "-3", "1e3", "12a"]) {
      expect(parseJump(raw, TOTAL), raw).toEqual({ kind: "invalid" });
    }
  });
});

describe("grouping for the Customize list", () => {
  it("maps a puzzle to the page of five holding it", () => {
    expect(groupForPuzzle(1, TOTAL)).toBe(1);
    expect(groupForPuzzle(5, TOTAL)).toBe(1);
    expect(groupForPuzzle(6, TOTAL)).toBe(2);
    expect(groupForPuzzle(85, TOTAL)).toBe(17);
    expect(groupForPuzzle(100, TOTAL)).toBe(20);
  });

  it("agrees with the page the puzzle actually lands on", () => {
    for (let n = 1; n <= TOTAL; n++) {
      const page = groupForPuzzle(n, TOTAL);
      const firstOnPage = (page - 1) * CHIP_WINDOW_SIZE + 1;
      expect(n).toBeGreaterThanOrEqual(firstOnPage);
      expect(n).toBeLessThan(firstOnPage + CHIP_WINDOW_SIZE);
    }
  });
});

describe("clampPuzzleNumber", () => {
  it("survives values that aren't really numbers", () => {
    expect(clampPuzzleNumber(Number.NaN, TOTAL)).toBe(1);
    expect(clampPuzzleNumber(Number.POSITIVE_INFINITY, TOTAL)).toBe(1);
    expect(clampPuzzleNumber(3.9, TOTAL)).toBe(3);
  });
});

describe("the list window, which is aligned rather than leading", () => {
  it("brings up the group holding the target", () => {
    // The stated case: 13 shows 11-15, not 13-17.
    expect(alignedGroup(13, TOTAL)).toEqual([11, 12, 13, 14, 15]);
    expect(alignedGroup(1, TOTAL)).toEqual([1, 2, 3, 4, 5]);
    expect(alignedGroup(5, TOTAL)).toEqual([1, 2, 3, 4, 5]);
    expect(alignedGroup(6, TOTAL)).toEqual([6, 7, 8, 9, 10]);
    expect(alignedGroup(100, TOTAL)).toEqual([96, 97, 98, 99, 100]);
  });

  it("differs from the carousel's rule, deliberately", () => {
    // Same input, two surfaces, two answers — because the list's chips
    // must equal the five cards on screen and the carousel's are a
    // lookahead from a single visible puzzle.
    expect(alignedGroup(13, TOTAL)).toEqual([11, 12, 13, 14, 15]);
    expect(windowForJump(13, TOTAL)).toEqual([13, 14, 15, 16, 17]);
  });

  it("never moves when a chip inside the group is clicked", () => {
    // "Clicks always select, never slide."
    const group = alignedGroup(13, TOTAL);
    for (const n of group) expect(alignedGroup(n, TOTAL)).toEqual(group);
  });

  it("slides one group when a step leaves the current one", () => {
    expect(alignedGroup(stepPuzzleNumber(15, 1, TOTAL), TOTAL)).toEqual([16, 17, 18, 19, 20]);
    expect(alignedGroup(stepPuzzleNumber(11, -1, TOTAL), TOTAL)).toEqual([6, 7, 8, 9, 10]);
  });

  it("gives a short final group rather than overshooting the book", () => {
    expect(alignedGroup(30, 32)).toEqual([26, 27, 28, 29, 30]);
    expect(alignedGroup(32, 32)).toEqual([31, 32]);
    expect(alignedGroup(3, 3)).toEqual([1, 2, 3]);
  });

  it("covers every puzzle exactly once across all groups", () => {
    const seen = new Set<number>();
    for (let n = 1; n <= TOTAL; n++) for (const m of alignedGroup(n, TOTAL)) seen.add(m);
    expect(seen.size).toBe(TOTAL);
  });
});

describe("the showing label", () => {
  it("says what is on screen, and never says page", () => {
    expect(showingLabel([11, 12, 13, 14, 15], 100)).toBe("Showing 11–15 of 100");
    expect(showingLabel([1, 2, 3, 4, 5], 100)).toBe("Showing 1–5 of 100");
    expect(showingLabel([31, 32], 32)).toBe("Showing 31–32 of 32");
    expect(showingLabel([7], 7)).toBe("Showing 7 of 7");
    for (const label of [showingLabel([1, 2], 9), showingLabel([], 0)]) {
      expect(label.toLowerCase()).not.toContain("page");
    }
  });
});
