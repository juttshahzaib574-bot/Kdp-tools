import { describe, expect, it } from "vitest";
import {
  estimatePrintingCostUsd,
  estimateRoyalty,
  KDP_PRINTING_COST_BW,
  KDP_PRINTING_COST_PREMIUM_COLOR,
  KDP_PRINTING_COST_STANDARD_COLOR,
  printingScheduleFor,
} from "../royalty";

// Colour is this product's default interior, and colour printing costs
// roughly twice what black-and-white does per page. Estimating a colour
// book on the black-and-white schedule doesn't drift a little — it can
// report a profit on a book that loses money on every copy.

describe("printingScheduleFor", () => {
  it("picks the schedule that matches the interior and tier", () => {
    expect(printingScheduleFor("color", "standard")).toBe(KDP_PRINTING_COST_STANDARD_COLOR);
    expect(printingScheduleFor("color", "premium")).toBe(KDP_PRINTING_COST_PREMIUM_COLOR);
    // Black and white ignores the tier entirely — there isn't one.
    expect(printingScheduleFor("blackAndWhite", "premium")).toBe(KDP_PRINTING_COST_BW);
  });

  it("defaults a colour book to the standard tier", () => {
    expect(printingScheduleFor("color")).toBe(KDP_PRINTING_COST_STANDARD_COLOR);
  });

  it("orders the three schedules by what they actually cost", () => {
    expect(KDP_PRINTING_COST_STANDARD_COLOR.perPageCostUsd).toBeGreaterThan(
      KDP_PRINTING_COST_BW.perPageCostUsd,
    );
    expect(KDP_PRINTING_COST_PREMIUM_COLOR.perPageCostUsd).toBeGreaterThan(
      KDP_PRINTING_COST_STANDARD_COLOR.perPageCostUsd,
    );
  });
});

describe("royalty on a colour book", () => {
  const pageCount = 124;

  it("is materially lower than the same book priced as black and white", () => {
    const bw = estimateRoyalty({
      listPriceUsd: 9.99,
      pageCount,
      royaltyRate: 0.6,
      schedule: KDP_PRINTING_COST_BW,
    });
    const color = estimateRoyalty({
      listPriceUsd: 9.99,
      pageCount,
      royaltyRate: 0.6,
      schedule: KDP_PRINTING_COST_STANDARD_COLOR,
    });
    expect(color.netRoyaltyUsd).toBeLessThan(bw.netRoyaltyUsd);
    expect(color.minimumListPriceUsd).toBeGreaterThan(bw.minimumListPriceUsd);
  });

  it("reports a loss rather than hiding it", () => {
    // A price below printing cost has to show as negative, so the panel
    // can say "raise your price" instead of quietly showing a small win.
    const estimate = estimateRoyalty({
      listPriceUsd: 4.99,
      pageCount: 400,
      royaltyRate: 0.6,
      schedule: KDP_PRINTING_COST_STANDARD_COLOR,
    });
    expect(estimate.netRoyaltyUsd).toBeLessThan(0);
    expect(estimate.minimumListPriceUsd).toBeGreaterThan(4.99);
  });

  it("breaks even exactly at the minimum list price it reports", () => {
    const schedule = KDP_PRINTING_COST_STANDARD_COLOR;
    const first = estimateRoyalty({ listPriceUsd: 1, pageCount, royaltyRate: 0.6, schedule });
    const atMinimum = estimateRoyalty({
      listPriceUsd: first.minimumListPriceUsd,
      pageCount,
      royaltyRate: 0.6,
      schedule,
    });
    expect(atMinimum.netRoyaltyUsd).toBeCloseTo(0, 9);
  });

  it("scales with page count", () => {
    expect(estimatePrintingCostUsd(200, KDP_PRINTING_COST_STANDARD_COLOR)).toBeGreaterThan(
      estimatePrintingCostUsd(100, KDP_PRINTING_COST_STANDARD_COLOR),
    );
  });
});
