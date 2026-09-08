import {
  KDP_BLEED_IN,
  KDP_TRIM_SIZES,
  type ColorTier,
  type InteriorColor,
  type KdpTrimSize,
  type PaperType,
} from "./kdp";

// Amazon KDP's published paperback cover-calculator formulas. Spine width is
// pages x a per-page factor that depends on physical paper stock; the full
// wrap cover is two trim widths plus the spine, with bleed only on the outer
// edges (the spine itself is never bled). These constants are stable but
// Amazon-owned — re-check them against KDP's own "Paperback Cover Calculator"
// before trusting them for anything print-critical, since this sandbox can't
// fetch KDP's live spec page to reconfirm them at code-review time.
//
// FOUR stocks, not three. KDP's published per-page thicknesses:
//
//   white B&W        0.002252"
//   cream B&W        0.0025"
//   standard colour  0.002252"   — the same stock as white B&W
//   premium colour   0.002347"
//
// Standard colour sharing white B&W's thickness is the detail most
// third-party cover calculators get wrong: they apply the premium factor
// to every colour book, which over-widens the spine of every standard
// colour title. On a 300-page book that is a 0.03" error — enough to
// push spine text off the spine.
type SpineStock = "white" | "cream" | "standardColor" | "premiumColor";
export const KDP_SPINE_FACTOR_IN: Record<SpineStock, number> = {
  white: 0.002252,
  cream: 0.0025,
  standardColor: 0.002252,
  premiumColor: 0.002347,
};

/** Which physical paper thickness applies to a given (interior colour, paper, colour tier) combination. */
function spineStockFor(
  interiorColor: InteriorColor,
  paperType: PaperType,
  colorTier: ColorTier,
): SpineStock {
  if (interiorColor === "color") {
    return colorTier === "premium" ? "premiumColor" : "standardColor";
  }
  return paperType === "cream" ? "cream" : "white";
}

/**
 * The shortest book KDP will print spine text on.
 *
 * This is a PAGE COUNT rule, not a spine-width one. KDP's own pages are
 * inconsistent about it — the spine-text section says "more than 79
 * pages" while a bullet on the same page says "at least 79" — but the
 * Cover Creator documentation states 80 outright, and "more than 79" is
 * 80 anyway. 80 is the reading that can't get a cover rejected.
 *
 * This replaced a 0.25"-of-spine rule, which was both wrong and stricter
 * than Amazon: on white stock 0.25" is 111 pages, so a perfectly legal
 * 100-page book was being told it couldn't have spine text.
 */
export const KDP_MIN_PAGES_FOR_SPINE_TEXT = 80;

export function computeSpineWidthIn(
  pageCount: number,
  interiorColor: InteriorColor,
  paperType: PaperType,
  colorTier: ColorTier = "standard",
): number {
  if (pageCount <= 0) throw new Error("pageCount must be positive");
  return pageCount * KDP_SPINE_FACTOR_IN[spineStockFor(interiorColor, paperType, colorTier)];
}

export interface CoverDimensions {
  trimWidthIn: number;
  trimHeightIn: number;
  spineWidthIn: number;
  bleedIn: number;
  /** Total flat width of the printable wrap: back cover + spine + front cover, plus outer bleed. */
  fullWidthIn: number;
  /** Total flat height of the wrap: trim height plus bleed top and bottom. */
  fullHeightIn: number;
  /** X-offset (in) from the left edge of the wrap to where the spine begins. */
  spineStartXIn: number;
  /** X-offset (in) from the left edge of the wrap to where the spine ends / front cover begins. */
  spineEndXIn: number;
  showSpineText: boolean;
}

export function computeCoverDimensions(
  trimSize: KdpTrimSize,
  pageCount: number,
  interiorColor: InteriorColor,
  paperType: PaperType,
  colorTier: ColorTier = "standard",
): CoverDimensions {
  const trim = KDP_TRIM_SIZES[trimSize];
  const spineWidthIn = computeSpineWidthIn(pageCount, interiorColor, paperType, colorTier);
  const fullWidthIn = trim.widthIn * 2 + spineWidthIn + KDP_BLEED_IN * 2;
  const fullHeightIn = trim.heightIn + KDP_BLEED_IN * 2;
  const spineStartXIn = KDP_BLEED_IN + trim.widthIn;
  const spineEndXIn = spineStartXIn + spineWidthIn;

  return {
    trimWidthIn: trim.widthIn,
    trimHeightIn: trim.heightIn,
    spineWidthIn,
    bleedIn: KDP_BLEED_IN,
    fullWidthIn,
    fullHeightIn,
    spineStartXIn,
    spineEndXIn,
    showSpineText: pageCount >= KDP_MIN_PAGES_FOR_SPINE_TEXT,
  };
}

// ---- The cover as a SPEC, not as artwork ----------------------------
//
// We deliberately don't design covers. Cover art is the single biggest
// driver of clicks on a KDP listing, and a procedurally drawn one from a
// puzzle engine loses to a Canva template every time — so shipping an
// auto-cover means shipping the worst-looking part of the product.
//
// What a publisher genuinely cannot get from Canva is the ARITHMETIC.
// The wrap size depends on spine width, spine width depends on the
// interior page count, and that number only exists once the interior is
// final. Getting it wrong means a rejected upload or a spine whose text
// sits off the spine. That is the part worth owning, so this is what we
// hand over: exact sizes, the zones Amazon reserves, and a blank guide
// to design on top of.

/**
 * The area KDP reserves for its barcode, in the lower-right of the BACK
 * cover (the left panel of the wrap, since the wrap reads back-to-front).
 *
 * Amazon prints the barcode itself; anything a designer puts underneath
 * it is covered up. It is a rectangle 2" x 1.2", set in 0.25" from the
 * trimmed edge on both sides.
 */
export const KDP_BARCODE_WIDTH_IN = 2;
export const KDP_BARCODE_HEIGHT_IN = 1.2;
export const KDP_BARCODE_INSET_IN = 0.25;

export interface CoverZone {
  xIn: number;
  yIn: number;
  widthIn: number;
  heightIn: number;
}

/**
 * Where the barcode lands on the flat wrap, measured from the wrap's
 * top-left corner (so it can be drawn directly in an SVG or canvas whose
 * origin is top-left).
 */
export function coverBarcodeZone(dimensions: CoverDimensions): CoverZone {
  const { bleedIn, trimWidthIn, fullHeightIn } = dimensions;
  return {
    // Back cover spans from the bleed edge to the spine, so its trimmed
    // right edge is at bleed + trimWidth.
    xIn: bleedIn + trimWidthIn - KDP_BARCODE_INSET_IN - KDP_BARCODE_WIDTH_IN,
    yIn: fullHeightIn - bleedIn - KDP_BARCODE_INSET_IN - KDP_BARCODE_HEIGHT_IN,
    widthIn: KDP_BARCODE_WIDTH_IN,
    heightIn: KDP_BARCODE_HEIGHT_IN,
  };
}

/** KDP wants cover art at 300 DPI; anything less is flagged as low resolution. */
export const KDP_COVER_DPI = 300;

/**
 * The wrap in pixels, which is what a design tool's "custom size" box
 * actually wants. Rounded to whole pixels — a fractional canvas size is
 * not a thing any editor accepts.
 */
export function coverPixelSize(
  dimensions: CoverDimensions,
  dpi: number = KDP_COVER_DPI,
): { width: number; height: number; dpi: number } {
  return {
    width: Math.round(dimensions.fullWidthIn * dpi),
    height: Math.round(dimensions.fullHeightIn * dpi),
    dpi,
  };
}

/** Formats an inch measurement the way a print spec reads it. */
export function formatInches(value: number): string {
  return `${value.toFixed(2)}"`;
}
