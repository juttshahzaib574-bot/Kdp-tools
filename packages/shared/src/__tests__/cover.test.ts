import { describe, expect, it } from "vitest";
import {
  computeCoverDimensions,
  computeSpineWidthIn,
  KDP_MIN_PAGES_FOR_SPINE_TEXT,
} from "../cover";
import { KDP_BLEED_IN, KDP_TRIM_SIZES } from "../kdp";

describe("computeSpineWidthIn", () => {
  it("uses KDP's published per-page thickness for each stock", () => {
    // White B&W paper: 0.002252 in / page.
    expect(computeSpineWidthIn(200, "blackAndWhite", "white")).toBeCloseTo(200 * 0.002252, 6);
    // Cream paper (B&W-only): 0.0025 in / page.
    expect(computeSpineWidthIn(200, "blackAndWhite", "cream")).toBeCloseTo(200 * 0.0025, 6);
    // Premium colour: 0.002347 in / page.
    expect(computeSpineWidthIn(200, "color", "white", "premium")).toBeCloseTo(200 * 0.002347, 6);
    // Standard colour prints on the SAME stock as white B&W, so it takes
    // the same factor — the detail third-party calculators get wrong.
    expect(computeSpineWidthIn(200, "color", "white", "standard")).toBeCloseTo(200 * 0.002252, 6);
  });

  it("does not treat the two colour tiers as interchangeable", () => {
    // A regression guard with teeth: this file previously asserted the
    // tiers shared one thickness, which over-widened every standard
    // colour spine.
    const standard = computeSpineWidthIn(300, "color", "white", "standard");
    const premium = computeSpineWidthIn(300, "color", "white", "premium");
    expect(premium).toBeGreaterThan(standard);
    // ~0.0285" apart on a 300-page book — enough to move spine text off
    // the spine.
    expect(premium - standard).toBeCloseTo(300 * (0.002347 - 0.002252), 6);
  });

  it("defaults to standard colour, the cheaper and more common tier", () => {
    expect(computeSpineWidthIn(200, "color", "white")).toBeCloseTo(
      computeSpineWidthIn(200, "color", "white", "standard"),
      9,
    );
  });

  it("rejects a non-positive page count", () => {
    expect(() => computeSpineWidthIn(0, "blackAndWhite", "white")).toThrow();
    expect(() => computeSpineWidthIn(-1, "blackAndWhite", "white")).toThrow();
  });
});

describe("computeCoverDimensions", () => {
  it("lays out a 6x9 200-page cream book as two trims + spine + outer bleed", () => {
    const dims = computeCoverDimensions("6x9", 200, "blackAndWhite", "cream");
    const trim = KDP_TRIM_SIZES["6x9"];
    const expectedSpine = 200 * 0.0025;

    expect(dims.spineWidthIn).toBeCloseTo(expectedSpine, 6);
    expect(dims.fullWidthIn).toBeCloseTo(trim.widthIn * 2 + expectedSpine + KDP_BLEED_IN * 2, 6);
    expect(dims.fullHeightIn).toBeCloseTo(trim.heightIn + KDP_BLEED_IN * 2, 6);
    expect(dims.spineStartXIn).toBeCloseTo(KDP_BLEED_IN + trim.widthIn, 6);
    expect(dims.spineEndXIn).toBeCloseTo(dims.spineStartXIn + expectedSpine, 6);
  });

  it("allows spine text from 80 pages, on any stock", () => {
    // KDP's rule is a PAGE COUNT, not a spine width. This used to be a
    // 0.25"-of-spine test, which is 111 pages on white stock — so a legal
    // 100-page book was wrongly told it couldn't have spine text.
    expect(KDP_MIN_PAGES_FOR_SPINE_TEXT).toBe(80);
    for (const [interiorColor, paper] of [
      ["blackAndWhite", "white"],
      ["blackAndWhite", "cream"],
      ["color", "white"],
    ] as const) {
      expect(computeCoverDimensions("6x9", 79, interiorColor, paper).showSpineText).toBe(false);
      expect(computeCoverDimensions("6x9", 80, interiorColor, paper).showSpineText).toBe(true);
    }
  });

  it("does not let thin stock veto spine text on a long enough book", () => {
    // 100 pages of white stock is 0.225" of spine — under the old width
    // rule, and perfectly legal under Amazon's actual one.
    const dims = computeCoverDimensions("6x9", 100, "blackAndWhite", "white");
    expect(dims.spineWidthIn).toBeLessThan(0.25);
    expect(dims.showSpineText).toBe(true);
  });
});
