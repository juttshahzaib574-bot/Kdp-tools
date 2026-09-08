// Fetches the interior typefaces in the browser so a preview embeds the
// SAME fonts the server export does.
//
// Without this the preview falls back to base-14 standard fonts and looks
// materially different from the printed book (different metrics, different
// line breaks, different page fill) — which defeats the purpose of a
// preview. The files are copied into public/fonts/ by
// scripts/build-workers.mjs, from the generator package's own assets, so
// there is exactly one source of truth for which faces the book uses.
//
// Memoised at module scope: a worker renders many puzzles per session and
// these ~1.6 MB never change. The browser HTTP cache handles it across
// worker restarts.
import { BOOK_FONT_FILES } from "@kdp/generator-grid-mystery";

let cached = null;

async function fetchFont(file) {
  const response = await fetch(`/fonts/${file}`);
  if (!response.ok) throw new Error(`font fetch failed: ${file} (${response.status})`);
  return new Uint8Array(await response.arrayBuffer());
}

/**
 * Returns the five faces, or null if any of them can't be fetched.
 *
 * Null rather than throwing: a preview that renders with fallback fonts
 * is far better than a preview that shows an error box. The EXPORT path
 * (apps/worker) has no such fallback — it throws — because an export with
 * unembedded fonts is the thing KDP rejects.
 */
export async function loadBrowserBookFonts() {
  if (cached !== null) return cached;
  try {
    const [displayRegular, displayBold, bodyRegular, bodyBold, bodyItalic] = await Promise.all([
      fetchFont(BOOK_FONT_FILES.displayRegular),
      fetchFont(BOOK_FONT_FILES.displayBold),
      fetchFont(BOOK_FONT_FILES.bodyRegular),
      fetchFont(BOOK_FONT_FILES.bodyBold),
      fetchFont(BOOK_FONT_FILES.bodyItalic),
    ]);
    cached = { displayRegular, displayBold, bodyRegular, bodyBold, bodyItalic };
  } catch {
    cached = undefined; // remembered as "tried and failed", so we don't refetch every render
  }
  return cached ?? undefined;
}
