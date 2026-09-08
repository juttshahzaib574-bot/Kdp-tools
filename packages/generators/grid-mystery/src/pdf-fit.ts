import type { PDFFont } from "pdf-lib";

/**
 * Iteratively finds the largest font size (within [minSize, maxSize]) at
 * which `text` fits within `maxWidth` on a single line. Falls back to
 * `minSize` if even the smallest size overflows — the caller is then
 * responsible for truncating or wrapping, since shrinking further would
 * make the text illegible rather than just tight.
 *
 * This is the vector-PDF equivalent of the auto-fit trick some competitor
 * tools do by measuring rendered DOM nodes and re-laying-out: instead of
 * measuring pixels after paint, pdf-lib can measure exact glyph widths up
 * front, so the "iterate until it fits" idea works the same way without
 * ever needing a real (or headless) browser in the render path.
 */
export function fitFontSize(
  text: string,
  font: PDFFont,
  maxWidth: number,
  maxSize: number,
  minSize: number,
): number {
  let size = maxSize;
  while (size > minSize && font.widthOfTextAtSize(text, size) > maxWidth) {
    size -= 0.5;
  }
  return Math.max(size, minSize);
}

export function wrapText(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (font.widthOfTextAtSize(candidate, size) > maxWidth && current) {
      lines.push(current);
      current = word;
    } else {
      current = candidate;
    }
  }
  if (current) lines.push(current);
  return lines;
}

/**
 * Fits `text` into `maxWidth` at the given size by shrinking the font down
 * to `minSize` first, and only truncating with an ellipsis as a last resort
 * once even the smallest legible size doesn't fit — preferring "smaller but
 * complete" over "full-size but cut off".
 */
export function fitLabel(
  text: string,
  font: PDFFont,
  maxWidth: number,
  preferredSize: number,
  minSize: number,
): { text: string; size: number } {
  const size = fitFontSize(text, font, maxWidth, preferredSize, minSize);
  if (font.widthOfTextAtSize(text, size) <= maxWidth) {
    return { text, size };
  }

  let truncated = text;
  while (truncated.length > 1 && font.widthOfTextAtSize(`${truncated}…`, size) > maxWidth) {
    truncated = truncated.slice(0, -1);
  }
  return { text: `${truncated}…`, size };
}
