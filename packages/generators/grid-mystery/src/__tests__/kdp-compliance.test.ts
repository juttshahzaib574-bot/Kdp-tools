import { describe, expect, it } from "vitest";
import { PDFDocument } from "pdf-lib";
import { generateGridMystery } from "../generate";
import { renderGridMysteryPdf, renderPuzzleOnlyPdf } from "../render-pdf";
import { loadNodeBookFonts } from "../node-fonts";
import { gutterForPageCount, pageGeometry } from "@kdp/shared";

// Guards for the requirements KDP actually enforces on an interior file.
// Each of these previously failed silently — a book would upload and then
// be rejected, or print with substituted glyphs, with nothing in our own
// output hinting at why.

const baseMatter = {
  authorName: "A. Publisher",
  includeTitlePage: true,
  includeCopyrightPage: true,
  includeHowToSolvePage: true,
  includeReviewRequestPage: true,
};

describe("KDP interior compliance", () => {
  it("embeds every font — the export path must never fall back to base-14", async () => {
    const fontBytes = await loadNodeBookFonts();
    const puzzle = generateGridMystery({ gridSize: 6, difficulty: "easy", seed: 11 });
    const { pdf } = await renderPuzzleOnlyPdf(puzzle, { trimSize: "6x9", fontBytes });

    // pdf-lib's `embedFont(StandardFonts.X)` writes only a base-14
    // *reference* — no glyph data. A conforming embedded font carries a
    // FontFile2 stream, and the subset gets a six-letter tag prefix.
    const doc = await PDFDocument.load(pdf);
    const text = new TextDecoder("latin1").decode(await doc.save({ useObjectStreams: false }));
    expect(text).toContain("/FontFile2");
    for (const base14 of ["/Helvetica", "/Times-Roman", "/Courier"]) {
      expect(text).not.toContain(base14);
    }
  });

  it("reports embedded:false when no font bytes are supplied, so previews can't masquerade as print-ready", async () => {
    const doc = await PDFDocument.create();
    const { loadBookFonts } = await import("../fonts");
    expect((await loadBookFonts(doc, undefined)).embedded).toBe(false);
    expect((await loadBookFonts(doc, await loadNodeBookFonts())).embedded).toBe(true);
  });

  it("writes real document metadata instead of pdf-lib's default fingerprint", async () => {
    const fontBytes = await loadNodeBookFonts();
    const puzzle = generateGridMystery({ gridSize: 6, difficulty: "easy", seed: 12 });
    const { pdf } = await renderGridMysteryPdf([puzzle], {
      bookTitle: "Murder at Blackwood Manor",
      trimSize: "6x9",
      includeAnswerKey: false,
      matter: baseMatter,
      fontBytes,
    });
    // updateMetadata:false matters — pdf-lib's LOAD path re-stamps the
    // Producer with its own string, so reading it back with the default
    // would report pdf-lib's value no matter what the file on disk says.
    const doc = await PDFDocument.load(pdf, { updateMetadata: false });
    expect(doc.getTitle()).toBe("Murder at Blackwood Manor");
    expect(doc.getAuthor()).toBe("A. Publisher");
    const producer = doc.getProducer() ?? "";
    expect(producer).not.toMatch(/pdf-lib/i);
    expect(producer.length).toBeGreaterThan(0);
  });

  it("gives two different books different producer strings, but is stable for one book", async () => {
    const fontBytes = await loadNodeBookFonts();
    const puzzle = generateGridMystery({ gridSize: 6, difficulty: "easy", seed: 13 });
    const render = async (bookTitle: string) => {
      const { pdf } = await renderGridMysteryPdf([puzzle], {
        bookTitle,
        trimSize: "6x9",
        includeAnswerKey: false,
        matter: baseMatter,
        fontBytes,
      });
      return (await PDFDocument.load(pdf, { updateMetadata: false })).getProducer();
    };
    // Stable for the same book — reproducibility depends on it.
    expect(await render("Book One")).toBe(await render("Book One"));
    // Across a spread of titles the pool is actually exercised, so books
    // don't all share one greppable producer string.
    const producers = new Set(
      await Promise.all(
        ["Alpha", "Beta", "Gamma", "Delta", "Epsilon", "Zeta", "Eta", "Theta"].map(render),
      ),
    );
    expect(producers.size).toBeGreaterThan(1);
    // Ten full book renders, each now drawing room textures — this is a
    // correctness test, not a timing one, so give it real headroom.
  }, 60_000);

  it("scales the gutter with page count, per KDP's bracket table", () => {
    expect(gutterForPageCount(24)).toBe(0.375);
    expect(gutterForPageCount(150)).toBe(0.375);
    // The documented cliff: 151 pages needs a wider gutter than 150.
    expect(gutterForPageCount(151)).toBe(0.5);
    expect(gutterForPageCount(300)).toBe(0.5);
    expect(gutterForPageCount(301)).toBe(0.625);
    expect(gutterForPageCount(828)).toBe(0.875);
    expect(gutterForPageCount(2000)).toBe(0.875);
  });

  it("mirrors the gutter so it always falls on the bound edge", () => {
    const recto = pageGeometry("6x9", 200, { isRecto: true });
    const verso = pageGeometry("6x9", 200, { isRecto: false });
    // Same page size and same content width either way...
    expect(recto.widthPt).toBe(verso.widthPt);
    expect(recto.contentWidthPt).toBeCloseTo(verso.contentWidthPt, 6);
    // ...but the wide margin swaps sides.
    expect(recto.insideMarginPt).toBeGreaterThan(recto.outsideMarginPt);
  });

  it("grows the page by exactly 0.125in per side when bleed is on", () => {
    const plain = pageGeometry("6x9", 100, { bleed: false });
    const bled = pageGeometry("6x9", 100, { bleed: true });
    expect(plain.widthPt).toBeCloseTo(6 * 72, 6);
    expect(plain.heightPt).toBeCloseTo(9 * 72, 6);
    expect(bled.widthPt).toBeCloseTo(6.25 * 72, 6);
    expect(bled.heightPt).toBeCloseTo(9.25 * 72, 6);
    expect(bled.bleedPt).toBeCloseTo(9, 6);
  });

  it("renders every supported trim size, including 7x10", async () => {
    const fontBytes = await loadNodeBookFonts();
    const puzzle = generateGridMystery({ gridSize: 6, difficulty: "easy", seed: 14 });
    for (const [trim, w, h] of [
      ["6x9", 432, 648],
      ["7x10", 504, 720],
      ["8.5x11", 612, 792],
    ] as const) {
      const { pdf } = await renderPuzzleOnlyPdf(puzzle, {
        trimSize: trim,
        fontBytes,
        includeAnswerKey: false,
      });
      const doc = await PDFDocument.load(pdf);
      const page = doc.getPage(0);
      expect(page.getWidth()).toBeCloseTo(w, 0);
      expect(page.getHeight()).toBeCloseTo(h, 0);
    }
  });

  it("renders colour by default and greyscale only when asked", async () => {
    const fontBytes = await loadNodeBookFonts();
    const puzzle = generateGridMystery({ gridSize: 6, difficulty: "easy", seed: 15 });
    const render = (interiorColor?: "color" | "blackAndWhite") =>
      renderPuzzleOnlyPdf(puzzle, {
        trimSize: "6x9",
        fontBytes,
        includeAnswerKey: false,
        interiorColor,
      });
    const [colour, grey, dflt] = await Promise.all([
      render("color"),
      render("blackAndWhite"),
      render(undefined),
    ]);
    // The two modes must actually differ — the whole bug was that
    // interiorColor never reached the interior renderer, so a colour book
    // came out byte-identical to a black-and-white one.
    expect(Buffer.from(colour.pdf).equals(Buffer.from(grey.pdf))).toBe(false);
    // ...and the default must be colour, not greyscale.
    expect(Buffer.from(dflt.pdf).equals(Buffer.from(colour.pdf))).toBe(true);
  });
});
