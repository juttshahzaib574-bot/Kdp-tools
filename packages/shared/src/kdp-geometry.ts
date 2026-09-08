import { KDP_TRIM_SIZES, type KdpTrimSize } from "./kdp";

// KDP page geometry: bleed and the page-count-dependent gutter.
//
// The renderer previously used one uniform margin on all four sides. That
// is not what KDP asks for, and it fails in two directions at once: the
// inside (gutter) margin must GROW with page count so text isn't
// swallowed by the spine on a thick book, and it must alternate sides —
// the gutter is on the left of a recto and the right of a verso.
//
// Sources: KDP "Set Trim Size, Bleed, and Margins".

export const BLEED_IN = 0.125;
/** KDP's floor for outside/top/bottom on a book without bleed. */
export const MIN_OUTER_MARGIN_IN = 0.25;
/** What we actually use outside — comfortably above the floor, so trimming variance never clips content. */
export const OUTER_MARGIN_IN = 0.375;

/**
 * KDP's minimum inside (gutter) margin by total page count. A book that
 * crosses a bracket boundary needs the larger gutter — adding four pages
 * to a 148-page book pushes it from 0.375" to 0.5".
 */
const GUTTER_BRACKETS: readonly { maxPages: number; gutterIn: number }[] = [
  { maxPages: 150, gutterIn: 0.375 },
  { maxPages: 300, gutterIn: 0.5 },
  { maxPages: 500, gutterIn: 0.625 },
  { maxPages: 700, gutterIn: 0.75 },
  { maxPages: 828, gutterIn: 0.875 },
];

/** Minimum inside margin, in inches, for a book of `pageCount` pages. */
export function gutterForPageCount(pageCount: number): number {
  for (const bracket of GUTTER_BRACKETS) {
    if (pageCount <= bracket.maxPages) return bracket.gutterIn;
  }
  return GUTTER_BRACKETS[GUTTER_BRACKETS.length - 1]!.gutterIn;
}

export interface PageGeometry {
  /** Full PDF page size in points — trim, plus bleed on every side when bleed is on. */
  widthPt: number;
  heightPt: number;
  /** Distance from the physical page edge to the trim edge (0 without bleed). */
  bleedPt: number;
  /** Margins measured from the PHYSICAL page edge, already including bleed. */
  insideMarginPt: number;
  outsideMarginPt: number;
  topMarginPt: number;
  bottomMarginPt: number;
  contentWidthPt: number;
  contentHeightPt: number;
}

const PT_PER_IN = 72;

/**
 * Computes one page's geometry.
 *
 * `isRecto` decides which side the gutter falls on: a recto (odd,
 * right-hand page) is bound on its LEFT, a verso on its RIGHT. Callers
 * that don't lay out spreads can pass true throughout and get a
 * consistent, still-valid page.
 *
 * With bleed on, the page grows by 0.125" on every side and all margins
 * are measured from the enlarged edge, so the printed safe area stays put
 * relative to the trim line.
 */
export function pageGeometry(
  trimSize: KdpTrimSize,
  pageCount: number,
  options: { bleed?: boolean; isRecto?: boolean } = {},
): PageGeometry {
  const trim = KDP_TRIM_SIZES[trimSize];
  const bleed = options.bleed ?? false;
  const isRecto = options.isRecto ?? true;
  const bleedPt = bleed ? BLEED_IN * PT_PER_IN : 0;

  const widthPt = (trim.widthIn + (bleed ? BLEED_IN * 2 : 0)) * PT_PER_IN;
  const heightPt = (trim.heightIn + (bleed ? BLEED_IN * 2 : 0)) * PT_PER_IN;

  const insideMarginPt = gutterForPageCount(pageCount) * PT_PER_IN + bleedPt;
  const outsideMarginPt = OUTER_MARGIN_IN * PT_PER_IN + bleedPt;
  const topMarginPt = OUTER_MARGIN_IN * PT_PER_IN + bleedPt;
  const bottomMarginPt = OUTER_MARGIN_IN * PT_PER_IN + bleedPt;

  const leftMarginPt = isRecto ? insideMarginPt : outsideMarginPt;
  const rightMarginPt = isRecto ? outsideMarginPt : insideMarginPt;

  return {
    widthPt,
    heightPt,
    bleedPt,
    insideMarginPt,
    outsideMarginPt,
    topMarginPt,
    bottomMarginPt,
    contentWidthPt: widthPt - leftMarginPt - rightMarginPt,
    contentHeightPt: heightPt - topMarginPt - bottomMarginPt,
  };
}

/** Left margin for a page, accounting for which side the gutter is on. */
export function leftMarginPt(geometry: PageGeometry, isRecto: boolean): number {
  return isRecto ? geometry.insideMarginPt : geometry.outsideMarginPt;
}

// ---- Display geometry ----------------------------------------------
//
// Fitting a page into a viewer is separate from laying one out for
// print, but it has its own way of going wrong, and it went wrong: a
// preview measured a container that included its arrow buttons, padding
// and borders, rendered the page ~90px wider than the space it had, and
// dropped it into a box with `overflow: hidden`. Roughly 45px vanished
// off each side — enough to slice the first letter off the title. It
// threw nothing and looked plausible; it just wasn't what would print.
//
// The invariant that prevents it is small enough to state and test:
// the fitted box never exceeds the space it was given, on either axis.

export interface FitInput {
  /** The page's own size, in points. Read from the PDF, so bleed is already in it. */
  pageWidthPt: number;
  pageHeightPt: number;
  /** Drawable width of the container — its content box, excluding padding and borders. */
  availableWidth: number;
  /** Optional cap so one page can't dominate a wide layout. */
  maxWidth?: number;
  /** Optional height limit, for a viewer that must not scroll. */
  availableHeight?: number;
}

export interface FitResult {
  /** Scale factor from PDF points to CSS pixels. */
  scale: number;
  width: number;
  height: number;
}

/**
 * Scales a page to fit, preserving its aspect ratio and never exceeding
 * the space available. Spare room becomes letterboxing around a whole
 * page — never a crop through one.
 */
export function fitPageIntoBox(input: FitInput): FitResult {
  const { pageWidthPt, pageHeightPt, availableWidth } = input;
  if (pageWidthPt <= 0 || pageHeightPt <= 0 || availableWidth <= 0) {
    return { scale: 0, width: 0, height: 0 };
  }
  const widthLimit = Math.min(availableWidth, input.maxWidth ?? Number.POSITIVE_INFINITY);
  let scale = widthLimit / pageWidthPt;
  if (input.availableHeight !== undefined && input.availableHeight > 0) {
    scale = Math.min(scale, input.availableHeight / pageHeightPt);
  }
  return { scale, width: pageWidthPt * scale, height: pageHeightPt * scale };
}
