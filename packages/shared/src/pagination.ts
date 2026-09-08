// Paging arithmetic, in one place.
//
// This exists because the app had two paginators counting two different
// collections and labelling them the same way. The Generate tab showed
// five preview puzzles under a header reading "5 of 5", and directly
// beneath the puzzle sat "Page 1 of 2 [1][2]" — the PDF pages of the one
// puzzle in view. Two collections, two numbering schemes, inches apart,
// both called a page.
//
// The fix is partly naming (a preview paginator counts PUZZLES and says
// so; the Customize tab counts PAGES OF PUZZLES and says so) and partly
// this: the client and the API must agree on how many pages there are,
// and they only agree reliably if they run the same function.

/** How many pages `total` items fill at `pageSize` each. Always at least 1, so an empty list still has a page to show. */
export function pageCountFor(total: number, pageSize: number): number {
  if (pageSize <= 0) return 1;
  return Math.max(1, Math.ceil(Math.max(0, total) / pageSize));
}

/**
 * Brings a requested page inside range.
 *
 * Clamping rather than erroring is deliberate: someone sitting on the
 * last page when items are removed should land on the new last page, not
 * on a 404.
 */
export function clampPage(page: number, total: number, pageSize: number): number {
  const pages = pageCountFor(total, pageSize);
  if (!Number.isFinite(page)) return 1;
  return Math.min(Math.max(1, Math.floor(page)), pages);
}

/** The 0-based slice bounds for a page, ready for `skip`/`take`. */
export function pageSlice(
  page: number,
  total: number,
  pageSize: number,
): { page: number; skip: number; take: number; pageCount: number } {
  const pageCount = pageCountFor(total, pageSize);
  const clamped = clampPage(page, total, pageSize);
  return { page: clamped, skip: (clamped - 1) * pageSize, take: pageSize, pageCount };
}
