// KDP paperback royalty estimator.
//
// Royalty = (list price x royalty rate) - printing cost
// Printing cost = fixed cost + (per-page cost x page count)
//
// The rate/cost constants below are Amazon KDP's long-published US-marketplace
// black-and-white paperback figures. Amazon can and does revise its printing
// cost schedule; this sandbox has no live network path to KDP's pricing page,
// so treat this as an estimate to sanity-check pricing decisions, not as the
// figure to print in a spreadsheet — reconfirm against KDP's own royalty
// calculator before relying on it for a real launch price.
export const KDP_ROYALTY_RATES = [0.6, 0.35] as const;
export type KdpRoyaltyRate = (typeof KDP_ROYALTY_RATES)[number];

interface PrintingCostSchedule {
  fixedCostUsd: number;
  perPageCostUsd: number;
}

// Standard trim, black-and-white interior, US marketplace.
export const KDP_PRINTING_COST_BW: PrintingCostSchedule = {
  fixedCostUsd: 1.0,
  perPageCostUsd: 0.012,
};

// ---- Colour schedules: LESS well established than the ones above ----
//
// A note on confidence, because it differs across this file and the
// difference matters. The spine factors in ./cover.ts have been checked
// against KDP's own cover guidelines. These printing costs have NOT been
// re-verified against KDP's current pricing page — this sandbox has no
// network path to it. They are the right shape and the right order of
// magnitude, and they are far better than pricing a colour book on the
// black-and-white schedule, but the UI labels them an estimate and so
// does this comment. Re-check them before anyone sets a launch price.

/** Colour interiors, US marketplace, standard colour. */
export const KDP_PRINTING_COST_STANDARD_COLOR: PrintingCostSchedule = {
  fixedCostUsd: 1.0,
  perPageCostUsd: 0.0255,
};

/** Colour interiors, US marketplace, premium colour — the higher-quality, more expensive tier. */
export const KDP_PRINTING_COST_PREMIUM_COLOR: PrintingCostSchedule = {
  fixedCostUsd: 1.0,
  perPageCostUsd: 0.085,
};

/** @deprecated Ambiguous once the tiers were split apart; use printingScheduleFor. */
export const KDP_PRINTING_COST_COLOR = KDP_PRINTING_COST_STANDARD_COLOR;

/**
 * The schedule that applies to a book's chosen interior and colour tier.
 *
 * Colour costs several times what black-and-white does per page, and
 * colour is this product's DEFAULT interior — so estimating a colour
 * book on the black-and-white schedule doesn't drift a little, it can
 * report a profit on a book that loses money on every copy. The two
 * colour tiers are far apart from each other too, which is why the tier
 * is modelled rather than averaged.
 */
export function printingScheduleFor(
  interiorColor: "color" | "blackAndWhite",
  colorTier: "standard" | "premium" = "standard",
): PrintingCostSchedule {
  if (interiorColor !== "color") return KDP_PRINTING_COST_BW;
  return colorTier === "premium"
    ? KDP_PRINTING_COST_PREMIUM_COLOR
    : KDP_PRINTING_COST_STANDARD_COLOR;
}

export interface RoyaltyEstimateInput {
  listPriceUsd: number;
  pageCount: number;
  royaltyRate: KdpRoyaltyRate;
  schedule?: PrintingCostSchedule;
}

export interface RoyaltyEstimate {
  printingCostUsd: number;
  grossRoyaltyUsd: number;
  netRoyaltyUsd: number;
  minimumListPriceUsd: number;
}

export function estimatePrintingCostUsd(
  pageCount: number,
  schedule = KDP_PRINTING_COST_BW,
): number {
  if (pageCount <= 0) throw new Error("pageCount must be positive");
  return schedule.fixedCostUsd + schedule.perPageCostUsd * pageCount;
}

/**
 * Estimates KDP paperback royalty for a given list price. Amazon requires
 * list price to exceed printing cost, so `netRoyaltyUsd` can be negative here
 * to make an unviable price visible — callers should raise the list price to
 * at least `minimumListPriceUsd` rather than publish at a loss.
 */
export function estimateRoyalty(input: RoyaltyEstimateInput): RoyaltyEstimate {
  const schedule = input.schedule ?? KDP_PRINTING_COST_BW;
  const printingCostUsd = estimatePrintingCostUsd(input.pageCount, schedule);
  const grossRoyaltyUsd = input.listPriceUsd * input.royaltyRate;
  const netRoyaltyUsd = grossRoyaltyUsd - printingCostUsd;
  const minimumListPriceUsd = printingCostUsd / input.royaltyRate;

  return { printingCostUsd, grossRoyaltyUsd, netRoyaltyUsd, minimumListPriceUsd };
}
