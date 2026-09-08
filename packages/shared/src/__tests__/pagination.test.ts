import { describe, expect, it } from "vitest";
import { clampPage, pageCountFor, pageSlice } from "../pagination";

describe("pageCountFor", () => {
  it("matches the Customize tab's stated behaviour at five per page", () => {
    // 30 puzzles is the default book length, and the acceptance case:
    // it divides evenly, so it is exactly six full pages, not seven.
    expect(pageCountFor(30, 5)).toBe(6);
    expect(pageCountFor(5, 5)).toBe(1);
    expect(pageCountFor(6, 5)).toBe(2);
    // A hundred-puzzle book, the schema's maximum.
    expect(pageCountFor(100, 5)).toBe(20);
  });

  it("gives a short last page when the total doesn't divide evenly", () => {
    expect(pageCountFor(31, 5)).toBe(7);
    expect(pageCountFor(34, 5)).toBe(7);
  });

  it("always offers one page, even with nothing to show", () => {
    // An empty list still needs somewhere to render "no puzzles yet"
    // rather than a paginator claiming zero pages.
    expect(pageCountFor(0, 5)).toBe(1);
    expect(pageCountFor(-4, 5)).toBe(1);
    expect(pageCountFor(10, 0)).toBe(1);
  });
});

describe("clampPage", () => {
  it("keeps a request inside the range that exists", () => {
    expect(clampPage(99, 30, 5)).toBe(6);
    expect(clampPage(0, 30, 5)).toBe(1);
    expect(clampPage(-3, 30, 5)).toBe(1);
    expect(clampPage(4, 30, 5)).toBe(4);
  });

  it("survives values that aren't really numbers", () => {
    expect(clampPage(Number.NaN, 30, 5)).toBe(1);
    expect(clampPage(Number.POSITIVE_INFINITY, 30, 5)).toBe(1);
    expect(clampPage(2.7, 30, 5)).toBe(2);
  });
});

describe("pageSlice", () => {
  it("walks a 30-item set in six non-overlapping pages", () => {
    const seen: number[] = [];
    for (let page = 1; page <= 6; page++) {
      const slice = pageSlice(page, 30, 5);
      expect(slice.pageCount).toBe(6);
      expect(slice.page).toBe(page);
      for (let i = slice.skip; i < slice.skip + slice.take; i++) seen.push(i);
    }
    // Every item exactly once, none past the end.
    expect(seen).toEqual(Array.from({ length: 30 }, (_, i) => i));
  });

  it("clamps an over-large page onto the last one", () => {
    expect(pageSlice(12, 30, 5)).toEqual({ page: 6, skip: 25, take: 5, pageCount: 6 });
  });
});
