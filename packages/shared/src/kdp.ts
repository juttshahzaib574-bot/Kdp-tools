// Amazon KDP interior formatting constraints. Centralized here because every
// generator (murder mystery, color-by-number, mosaic, ...) must produce
// print-ready PDFs that pass KDP's own validator, and these numbers are easy
// to get subtly wrong if each generator hardcodes its own copy.

export const KDP_TRIM_SIZES = {
  "6x9": { widthIn: 6, heightIn: 9 },
  "7x10": { widthIn: 7, heightIn: 10 },
  "8.5x11": { widthIn: 8.5, heightIn: 11 },
} as const;

export type KdpTrimSize = keyof typeof KDP_TRIM_SIZES;

export const KDP_MIN_MARGIN_IN = 0.375;
export const KDP_BLEED_IN = 0.125;
export const KDP_MIN_PAGE_COUNT = 24;
export const KDP_MAX_PAGE_COUNT_PAPERBACK = 828;

// KDP interior print options. We ship one PDF per book — the colour tier
// is a print-quality choice KDP prices, not something we render
// differently — but it is NOT invisible to us, because the two colour
// tiers use different paper stock and therefore produce different spine
// widths. Colour choice also gates the available paper (KDP doesn't
// allow cream on a colour interior). Enforced at the schema layer so a
// user picking an invalid combination fails validation up front, not at
// KDP's own validator hours later.
export const INTERIOR_COLORS = ["blackAndWhite", "color"] as const;
export type InteriorColor = (typeof INTERIOR_COLORS)[number];
export const INTERIOR_COLOR_LABELS: Record<InteriorColor, string> = {
  blackAndWhite: "Black & white (cheapest)",
  color: "Color",
};

// KDP only sells two paper stocks: white and cream. Cream is B&W-only.
// There's no "color paper" — a color interior always prints on white
// stock, so the picker just doesn't offer a paper choice on color books.
export const PAPER_TYPES = ["white", "cream"] as const;
export type PaperType = (typeof PAPER_TYPES)[number];
export const PAPER_TYPE_LABELS: Record<PaperType, string> = {
  white: "White",
  cream: "Cream",
};

/** Which paper types are valid for each interior color, per KDP's own ordering rules. */
export const PAPER_TYPES_BY_INTERIOR_COLOR: Record<InteriorColor, readonly PaperType[]> = {
  blackAndWhite: ["white", "cream"],
  color: ["white"],
};

// KDP's two colour tiers, and the reason this app has to know which one
// the publisher will pick.
//
// It would be easy to treat the tier as purely KDP's business — it is a
// print-quality and pricing choice, and we render the same PDF either
// way. But the tiers print on DIFFERENT paper stock, so they produce
// different spine widths for the same page count: standard colour is the
// same 0.002252" per page as white B&W stock, while premium colour is
// 0.002347". On a 300-page book that is a 0.03" difference in the spine,
// which is enough to put spine text off the spine.
//
// Third-party cover calculators routinely apply the premium factor to
// every colour book, which is exactly the error this exists to avoid.
export const COLOR_TIERS = ["standard", "premium"] as const;
export type ColorTier = (typeof COLOR_TIERS)[number];
export const COLOR_TIER_LABELS: Record<ColorTier, string> = {
  standard: "Standard colour",
  premium: "Premium colour",
};
