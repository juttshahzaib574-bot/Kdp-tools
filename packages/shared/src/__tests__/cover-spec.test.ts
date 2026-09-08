import { describe, expect, it } from "vitest";
import {
  computeCoverDimensions,
  coverBarcodeZone,
  coverPixelSize,
  KDP_BARCODE_HEIGHT_IN,
  KDP_BARCODE_INSET_IN,
  KDP_BARCODE_WIDTH_IN,
  KDP_COVER_DPI,
} from "../cover";
import { KDP_TRIM_SIZES, type KdpTrimSize } from "../kdp";

// The cover panel hands a publisher numbers they'll paste into Canva and
// then print. A wrong one costs them a rejected upload or a misprinted
// run, so the arithmetic is pinned here rather than eyeballed in the UI.

const TRIMS = Object.keys(KDP_TRIM_SIZES) as KdpTrimSize[];

describe("wrap dimensions", () => {
  it("is two covers plus the spine plus outer bleed", () => {
    for (const trimSize of TRIMS) {
      const trim = KDP_TRIM_SIZES[trimSize];
      const dims = computeCoverDimensions(trimSize, 120, "color", "white");
      expect(dims.fullWidthIn).toBeCloseTo(trim.widthIn * 2 + dims.spineWidthIn + 0.25, 9);
      expect(dims.fullHeightIn).toBeCloseTo(trim.heightIn + 0.25, 9);
    }
  });

  it("grows the spine, and only the spine, as the book gets longer", () => {
    const short = computeCoverDimensions("6x9", 100, "color", "white");
    const long = computeCoverDimensions("6x9", 300, "color", "white");
    expect(long.spineWidthIn).toBeGreaterThan(short.spineWidthIn);
    expect(long.fullWidthIn - short.fullWidthIn).toBeCloseTo(
      long.spineWidthIn - short.spineWidthIn,
      9,
    );
    // Height never depends on page count.
    expect(long.fullHeightIn).toBeCloseTo(short.fullHeightIn, 9);
  });

  it("withholds spine text below KDP's 80-page minimum", () => {
    // Telling a publisher "no spine text" is more useful than letting
    // them design one KDP then refuses to print.
    expect(computeCoverDimensions("6x9", 79, "blackAndWhite", "white").showSpineText).toBe(false);
    expect(computeCoverDimensions("6x9", 80, "blackAndWhite", "white").showSpineText).toBe(true);
  });
});

describe("barcode zone", () => {
  it("sits inside the back cover, clear of the trim and the spine", () => {
    for (const trimSize of TRIMS) {
      const dims = computeCoverDimensions(trimSize, 150, "color", "white");
      const zone = coverBarcodeZone(dims);

      expect(zone.widthIn).toBe(KDP_BARCODE_WIDTH_IN);
      expect(zone.heightIn).toBe(KDP_BARCODE_HEIGHT_IN);
      // Left of the spine — it must never stray onto the front cover.
      expect(zone.xIn + zone.widthIn).toBeLessThanOrEqual(dims.spineStartXIn);
      // Inside the bleed on the left, and inset from the trimmed edge.
      expect(zone.xIn).toBeGreaterThan(dims.bleedIn);
      expect(dims.bleedIn + dims.trimWidthIn - (zone.xIn + zone.widthIn)).toBeCloseTo(
        KDP_BARCODE_INSET_IN,
        9,
      );
      // Inset from the trimmed bottom edge by the same margin.
      expect(dims.fullHeightIn - dims.bleedIn - (zone.yIn + zone.heightIn)).toBeCloseTo(
        KDP_BARCODE_INSET_IN,
        9,
      );
    }
  });
});

describe("pixel size", () => {
  it("is inches x 300, rounded to whole pixels", () => {
    const dims = computeCoverDimensions("6x9", 120, "color", "white");
    const px = coverPixelSize(dims);
    expect(px.dpi).toBe(KDP_COVER_DPI);
    expect(px.width).toBe(Math.round(dims.fullWidthIn * 300));
    expect(px.height).toBe(Math.round(dims.fullHeightIn * 300));
    // A 6x9 wrap is always taller than 9" and wider than two covers.
    expect(px.height).toBe(Math.round(9.25 * 300));
    expect(Number.isInteger(px.width)).toBe(true);
  });
});
