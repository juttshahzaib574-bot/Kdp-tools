import { KDP_MAX_PAGE_COUNT_PAPERBACK, KDP_MIN_PAGE_COUNT } from "./kdp";

// Hard limits KDP enforces on an upload, checked before we let anyone
// spend twenty minutes generating a book that cannot be published.
//
// The binding constraint is PAGE COUNT, not file size. A paperback tops
// out at 828 pages; the 650 MB interior cap is effectively unreachable
// for this product, since a fully textured vector page is around 100 KB
// and a maximum-length book therefore lands near 80 MB. The size check
// exists anyway because it is cheap and because a future raster asset
// pack could change that arithmetic overnight.

/** KDP's interior file ceiling. */
export const KDP_MAX_INTERIOR_BYTES = 650 * 1024 * 1024;

/**
 * Measured bytes per rendered page, from real exports of textured colour
 * interiors. Deliberately a little pessimistic — a wrong estimate that
 * blocks a valid book is annoying, one that lets through an invalid book
 * wastes the whole generation run.
 */
const BYTES_PER_PAGE = 110 * 1024;
/**
 * Front and back matter, when the caller doesn't say.
 *
 * The six built-ins: title, copyright, dedication, how-to-solve, about,
 * review request. Callers that know what the publisher has actually
 * turned on — or added — pass their own count, because that number
 * feeds both the facts line and the COVER SPINE. A spine sized off six
 * pages for a book carrying ten is a spine that's wrong.
 */
const DEFAULT_MATTER_PAGES = 6;

export interface BookSizeEstimate {
  pageCount: number;
  bytes: number;
}

/**
 * Estimates the finished interior from the settings alone, before
 * anything is generated.
 *
 * One page per puzzle is the layout's own guarantee (see puzzle-page.ts);
 * spread mode adds a blank verso before each puzzle, and the answer key
 * packs roughly eight puzzles to a page.
 */
export function estimateBookSize(input: {
  puzzleCount: number;
  includeAnswerKey: boolean;
  puzzlesPerSpread: "packed" | "onePerSpread";
  /** Front and back matter pages actually included. Defaults to the six built-ins. */
  matterPages?: number;
}): BookSizeEstimate {
  const perPuzzle = input.puzzlesPerSpread === "onePerSpread" ? 2 : 1;
  // Answer-key density, measured against a real 100-puzzle render
  // rather than guessed: that book produced 31 key pages, a little over
  // three puzzles each. The old figure of eight per page under-counted a
  // hundred-puzzle book by 18 pages — which reaches the COVER SPINE, so
  // it wasn't a cosmetic error.
  const answerKey = input.includeAnswerKey ? Math.max(1, Math.ceil(input.puzzleCount / 3.2)) : 0;
  const matter = Math.max(0, input.matterPages ?? DEFAULT_MATTER_PAGES);
  const raw = matter + input.puzzleCount * perPuzzle + answerKey;
  // KDP requires a minimum length; a short book is padded, not rejected.
  const pageCount = Math.max(raw, KDP_MIN_PAGE_COUNT);
  return { pageCount, bytes: pageCount * BYTES_PER_PAGE };
}

export type LimitSeverity = "ok" | "warn" | "block";

export interface LimitCheck {
  severity: LimitSeverity;
  /** Reader-facing explanation. Empty when severity is "ok". */
  message: string;
  estimate: BookSizeEstimate;
  /** The largest puzzleCount that would still fit, when blocked. */
  maxPuzzleCount?: number;
}

/**
 * Whether this book may be exported.
 *
 * "block" is a real stop — KDP would reject the upload — so the UI
 * disables export on it. "warn" flags a book that is legal but large
 * enough that KDP's own processing will be slow.
 */
export function checkKdpLimits(input: {
  puzzleCount: number;
  includeAnswerKey: boolean;
  puzzlesPerSpread: "packed" | "onePerSpread";
  matterPages?: number;
}): LimitCheck {
  const estimate = estimateBookSize(input);

  if (estimate.pageCount > KDP_MAX_PAGE_COUNT_PAPERBACK) {
    // Solve for the puzzle count that just fits, so the message can say
    // what to do rather than only what is wrong.
    const perPuzzle = input.puzzlesPerSpread === "onePerSpread" ? 2 : 1;
    let maxPuzzleCount = input.puzzleCount;
    while (
      maxPuzzleCount > 1 &&
      estimateBookSize({ ...input, puzzleCount: maxPuzzleCount }).pageCount >
        KDP_MAX_PAGE_COUNT_PAPERBACK
    ) {
      maxPuzzleCount -= Math.max(1, Math.floor(perPuzzle));
    }
    return {
      severity: "block",
      message: `This book would run to about ${estimate.pageCount} pages. KDP's paperback limit is ${KDP_MAX_PAGE_COUNT_PAPERBACK}. Reduce to about ${maxPuzzleCount} puzzles, or switch off the one-puzzle-per-spread layout.`,
      estimate,
      maxPuzzleCount,
    };
  }

  if (estimate.bytes > KDP_MAX_INTERIOR_BYTES) {
    return {
      severity: "block",
      message: `The interior would be roughly ${(estimate.bytes / 1024 / 1024).toFixed(0)} MB, over KDP's ${KDP_MAX_INTERIOR_BYTES / 1024 / 1024} MB limit. Reduce the puzzle count or turn texture intensity down.`,
      estimate,
    };
  }

  if (estimate.pageCount > KDP_MAX_PAGE_COUNT_PAPERBACK * 0.9) {
    return {
      severity: "warn",
      message: `About ${estimate.pageCount} pages — close to KDP's ${KDP_MAX_PAGE_COUNT_PAPERBACK}-page limit. It will publish, but there's little room left.`,
      estimate,
    };
  }

  return { severity: "ok", message: "", estimate };
}
