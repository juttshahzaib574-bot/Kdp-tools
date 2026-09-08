import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { BOOK_FONT_FILES, type BookFontBytes } from "./fonts";

// Node-side font loading, kept in its own module so the browser bundle
// never pulls `node:fs` in. The browser has its own loader (it fetches
// the same files from /fonts) — see apps/web/src/workers.
//
// Resolved relative to this file rather than process.cwd() so the worker
// finds the fonts regardless of where it was launched from.

let cached: BookFontBytes | null = null;

function assetsDir(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  // src/ during dev+tests, dist/ once built — assets sits beside both.
  return join(here, "..", "assets", "fonts");
}

/**
 * Reads the five interior typefaces from disk, memoised for the life of
 * the process — the worker renders many books and these bytes never
 * change, so re-reading ~1.6 MB per book would be pure waste.
 *
 * Throws rather than silently degrading: a worker that can't find its
 * fonts would otherwise ship books with unembedded base-14 fonts, which
 * KDP rejects. Failing loudly here surfaces it as a job error instead.
 */
export async function loadNodeBookFonts(): Promise<BookFontBytes> {
  if (cached) return cached;
  const dir = assetsDir();
  const [displayRegular, displayBold, bodyRegular, bodyBold, bodyItalic] = await Promise.all([
    readFile(join(dir, BOOK_FONT_FILES.displayRegular)),
    readFile(join(dir, BOOK_FONT_FILES.displayBold)),
    readFile(join(dir, BOOK_FONT_FILES.bodyRegular)),
    readFile(join(dir, BOOK_FONT_FILES.bodyBold)),
    readFile(join(dir, BOOK_FONT_FILES.bodyItalic)),
  ]);
  cached = {
    displayRegular: new Uint8Array(displayRegular),
    displayBold: new Uint8Array(displayBold),
    bodyRegular: new Uint8Array(bodyRegular),
    bodyBold: new Uint8Array(bodyBold),
    bodyItalic: new Uint8Array(bodyItalic),
  };
  return cached;
}
