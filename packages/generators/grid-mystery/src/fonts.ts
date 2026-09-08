import fontkit from "@pdf-lib/fontkit";
import { StandardFonts, type PDFDocument, type PDFFont } from "pdf-lib";

// Font embedding.
//
// KDP requires every font in an interior file to be EMBEDDED — a file
// with unembedded fonts fails their automated check or prints with
// substituted glyphs. The previous implementation called
// `doc.embedFont(StandardFonts.Helvetica)`, which despite the method name
// writes only a base-14 *reference*: no glyph data reaches the PDF. Every
// book produced that way was exposed to rejection or silent substitution.
//
// Now the real TTFs ship with this package (assets/fonts, both OFL) and
// are embedded with fontkit, subsetted so only the glyphs actually used
// are written — which keeps files small even though the sources total
// ~1.6 MB.
//
// The bytes are injected rather than read here, because this module runs
// in two very different places: the Node worker (reads from disk) and a
// browser Web Worker (fetches from /fonts). Keeping the I/O at the edges
// lets both share this code without bundling `fs` into the browser.

/** The five faces the interior uses. */
export interface BookFontBytes {
  /** Alegreya Sans — headings, labels, badges, grid numerals. */
  displayRegular: Uint8Array;
  displayBold: Uint8Array;
  /** PT Serif — body copy, clues, evidence. Reads well at 8-9pt in print. */
  bodyRegular: Uint8Array;
  bodyBold: Uint8Array;
  bodyItalic: Uint8Array;
}

export interface BookFonts {
  display: PDFFont;
  displayBold: PDFFont;
  body: PDFFont;
  bodyBold: PDFFont;
  bodyItalic: PDFFont;
  /** False when we fell back to base-14 — such a file is NOT KDP-safe. */
  embedded: boolean;
}

/**
 * Embeds the real typefaces when bytes are supplied, otherwise falls back
 * to the base-14 standard fonts.
 *
 * The fallback exists so a preview can still render if the font assets
 * fail to load — it is explicitly NOT print-safe, and `embedded: false`
 * is surfaced on the result so callers (and tests) can assert that an
 * export destined for KDP actually embedded.
 */
export async function loadBookFonts(
  doc: PDFDocument,
  bytes: BookFontBytes | undefined,
): Promise<BookFonts> {
  if (!bytes) {
    const body = await doc.embedFont(StandardFonts.Helvetica);
    const bodyBold = await doc.embedFont(StandardFonts.HelveticaBold);
    const bodyItalic = await doc.embedFont(StandardFonts.HelveticaOblique);
    return {
      display: body,
      displayBold: bodyBold,
      body,
      bodyBold,
      bodyItalic,
      embedded: false,
    };
  }

  doc.registerFontkit(fontkit);
  // subset: true writes only the glyphs actually drawn. Without it each
  // export would carry the full ~1.6 MB of outlines.
  const opts = { subset: true } as const;
  const [display, displayBold, body, bodyBold, bodyItalic] = await Promise.all([
    doc.embedFont(bytes.displayRegular, opts),
    doc.embedFont(bytes.displayBold, opts),
    doc.embedFont(bytes.bodyRegular, opts),
    doc.embedFont(bytes.bodyBold, opts),
    doc.embedFont(bytes.bodyItalic, opts),
  ]);
  return { display, displayBold, body, bodyBold, bodyItalic, embedded: true };
}

/** Relative paths of the shipped font files, for loaders on both platforms. */
export const BOOK_FONT_FILES = {
  displayRegular: "AlegreyaSans-Regular.ttf",
  displayBold: "AlegreyaSans-Bold.ttf",
  bodyRegular: "PTSerif-Regular.ttf",
  bodyBold: "PTSerif-Bold.ttf",
  bodyItalic: "PTSerif-Italic.ttf",
} as const satisfies Record<keyof BookFontBytes, string>;
