import { describe, expect, it } from "vitest";
import { estimatePrintingCostUsd, estimateRoyalty, KDP_PRINTING_COST_BW } from "../royalty";

describe("estimatePrintingCostUsd", () => {
  it("adds the fixed cost to per-page cost times page count", () => {
    expect(estimatePrintingCostUsd(100)).toBeCloseTo(
      KDP_PRINTING_COST_BW.fixedCostUsd + KDP_PRINTING_COST_BW.perPageCostUsd * 100,
      6,
    );
  });

  it("rejects a non-positive page count", () => {
    expect(() => estimatePrintingCostUsd(0)).toThrow();
  });
});

describe("estimateRoyalty", () => {
  it("computes gross minus printing cost at the 60% rate", () => {
    const estimate = estimateRoyalty({ listPriceUsd: 9.99, pageCount: 120, royaltyRate: 0.6 });
    const printingCost = estimatePrintingCostUsd(120);
    expect(estimate.printingCostUsd).toBeCloseTo(printingCost, 6);
    expect(estimate.grossRoyaltyUsd).toBeCloseTo(9.99 * 0.6, 6);
    expect(estimate.netRoyaltyUsd).toBeCloseTo(9.99 * 0.6 - printingCost, 6);
  });

  it("reports a minimum viable list price that breaks even", () => {
    const estimate = estimateRoyalty({ listPriceUsd: 1, pageCount: 200, royaltyRate: 0.6 });
    expect(estimate.netRoyaltyUsd).toBeLessThan(0); // $1 doesn't cover printing at 200 pages

    const atMinimum = estimateRoyalty({
      listPriceUsd: estimate.minimumListPriceUsd,
      pageCount: 200,
      royaltyRate: 0.6,
    });
    expect(atMinimum.netRoyaltyUsd).toBeCloseTo(0, 6);
  });
});
