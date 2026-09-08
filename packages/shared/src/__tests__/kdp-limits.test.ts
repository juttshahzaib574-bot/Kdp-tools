import { describe, expect, it } from "vitest";
import { estimateBookSize } from "../kdp-limits";

describe("matter pages feed the estimate", () => {
  const base = { puzzleCount: 30, includeAnswerKey: true, puzzlesPerSpread: "packed" } as const;

  it("counts the matter the publisher actually included", () => {
    // The number matters twice over: it's on the facts line, and it's
    // what the cover spine is cut to.
    const six = estimateBookSize({ ...base, matterPages: 6 });
    const ten = estimateBookSize({ ...base, matterPages: 10 });
    expect(ten.pageCount - six.pageCount).toBe(4);
  });

  it("falls back to the six built-ins when nobody says", () => {
    expect(estimateBookSize(base)).toEqual(estimateBookSize({ ...base, matterPages: 6 }));
  });

  it("handles a book with no matter at all", () => {
    const none = estimateBookSize({ ...base, matterPages: 0 });
    expect(none.pageCount).toBeGreaterThan(0);
    expect(none.pageCount).toBeLessThan(estimateBookSize(base).pageCount);
  });
});
