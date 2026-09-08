import { describe, expect, it } from "vitest";
import { fitPageIntoBox } from "../kdp-geometry";
import { KDP_TRIM_SIZES, type KdpTrimSize } from "../kdp";

// The crop bug in one sentence: the rendered page came out wider than
// the box it was put in, and the box hid the overflow. These pin the
// invariant that makes that impossible.

const PT_PER_IN = 72;
/** Every trim the product offers, in points, without and with bleed. */
const PAGES = (Object.keys(KDP_TRIM_SIZES) as KdpTrimSize[]).flatMap((id) => {
  const trim = KDP_TRIM_SIZES[id];
  return [
    { id, pageWidthPt: trim.widthIn * PT_PER_IN, pageHeightPt: trim.heightIn * PT_PER_IN },
    {
      id: `${id} + bleed`,
      pageWidthPt: (trim.widthIn + 0.25) * PT_PER_IN,
      pageHeightPt: (trim.heightIn + 0.25) * PT_PER_IN,
    },
  ];
});

/** Real widths a page box gets: a phone, a tablet column, a desktop panel. */
const WIDTHS = [148, 240, 320, 375, 414, 600, 768, 1024, 1280];

describe("fitPageIntoBox", () => {
  it("never returns a box wider than the space it was given", () => {
    for (const page of PAGES) {
      for (const availableWidth of WIDTHS) {
        const fit = fitPageIntoBox({ ...page, availableWidth });
        expect(fit.width).toBeLessThanOrEqual(availableWidth + 1e-9);
      }
    }
  });

  it("keeps the page's aspect ratio at every trim and width", () => {
    for (const page of PAGES) {
      const ratio = page.pageHeightPt / page.pageWidthPt;
      for (const availableWidth of WIDTHS) {
        const fit = fitPageIntoBox({ ...page, availableWidth });
        expect(fit.height / fit.width).toBeCloseTo(ratio, 9);
      }
    }
  });

  it("fills the width exactly, so a fitted page letterboxes rather than shrinks needlessly", () => {
    const fit = fitPageIntoBox({ pageWidthPt: 432, pageHeightPt: 648, availableWidth: 600 });
    expect(fit.width).toBeCloseTo(600, 9);
    expect(fit.height).toBeCloseTo(900, 9);
  });

  it("honours a max width without breaking the aspect ratio", () => {
    const fit = fitPageIntoBox({
      pageWidthPt: 612,
      pageHeightPt: 792,
      availableWidth: 1280,
      maxWidth: 720,
    });
    expect(fit.width).toBeCloseTo(720, 9);
    expect(fit.height).toBeCloseTo(720 * (792 / 612), 9);
  });

  it("fits inside a height limit too, when one is given", () => {
    // A tall page in a short box must shrink to the HEIGHT, not overflow it.
    const fit = fitPageIntoBox({
      pageWidthPt: 432,
      pageHeightPt: 648,
      availableWidth: 600,
      availableHeight: 300,
    });
    expect(fit.height).toBeLessThanOrEqual(300 + 1e-9);
    expect(fit.width).toBeLessThanOrEqual(600 + 1e-9);
    expect(fit.height / fit.width).toBeCloseTo(648 / 432, 9);
  });

  it("returns nothing to draw before the container has been measured", () => {
    // First paint, before the ResizeObserver has reported: a zero width
    // must yield a zero box rather than a division by zero.
    expect(fitPageIntoBox({ pageWidthPt: 432, pageHeightPt: 648, availableWidth: 0 })).toEqual({
      scale: 0,
      width: 0,
      height: 0,
    });
  });
});
