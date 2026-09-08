import { PDFDocument } from "pdf-lib";
import { describe, expect, it } from "vitest";
import { generateGridMystery } from "../generate";
import { DEFAULT_MATTER_TOGGLES, type BookMatterOptions } from "../matter";
import {
  renderGridMysteryPdf,
  type RenderCustomPage,
  type RenderGridMysteryPdfOptions,
} from "../render-pdf";

const baseMatter: BookMatterOptions = {
  authorName: "J. Rivera",
  ...DEFAULT_MATTER_TOGGLES,
};

// A real, minimal 2x2 JPEG (generated via sharp) — pdf-lib's embedJpg needs
// genuinely valid JPEG bytes, not just any buffer, to prove image-page
// substitution actually embeds one.
const TEST_JPEG_BASE64 =
  "/9j/2wBDAAYEBQYFBAYGBQYHBwYIChAKCgkJChQODwwQFxQYGBcUFhYaHSUfGhsjHBYWICwgIyYnKSopGR8tMC0oMCUoKSj/2wBDAQcHBwoIChMKChMoGhYaKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCj/wAARCAACAAIDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAb/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAABQf/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwCTABKs/9k=";
// Copy into a fresh, zero-offset Uint8Array — Buffer.from(base64, ...) can
// return a view into Node's shared small-buffer pool with a nonzero
// byteOffset, and pdf-lib's embedJpg reads `imageData.buffer` directly
// without honoring byteOffset, so a pooled buffer looks like corrupt JPEG
// data to it. Real image bytes from disk/S3 are large enough to avoid the
// pool in practice, but this fixture is 173 bytes — squarely in pool range.
const TEST_JPEG_BYTES = new Uint8Array(Buffer.from(TEST_JPEG_BASE64, "base64"));

function optionsWith(
  overrides: Partial<RenderGridMysteryPdfOptions> = {},
): RenderGridMysteryPdfOptions {
  return {
    bookTitle: "The Blackwood Manor Mystery",
    trimSize: "6x9",
    includeAnswerKey: true,
    matter: baseMatter,
    ...overrides,
  };
}

function customPage(overrides: Partial<RenderCustomPage> = {}): RenderCustomPage {
  return {
    id: "cp1",
    name: "Series Promo Page",
    subtitle: null,
    content: null,
    section: "BACK",
    titleLayout: null,
    subtitleLayout: null,
    contentLayout: null,
    ...overrides,
  };
}

describe("renderGridMysteryPdf", () => {
  it("renders a valid, loadable PDF with the expected pages", async () => {
    const puzzle = generateGridMystery({ gridSize: 7, difficulty: "medium", seed: 5 });
    const { pdf, pageCount } = await renderGridMysteryPdf([puzzle], optionsWith());

    expect(pdf.byteLength).toBeGreaterThan(0);

    const loaded = await PDFDocument.load(pdf);
    // title, copyright, how-to-solve, ONE puzzle page, answer key,
    // review request. The puzzle is a single page now — grid, suspects and
    // evidence all sit on it together (see puzzle-page.ts); it used to
    // take five, which is why this floor dropped from 8.
    expect(loaded.getPageCount()).toBeGreaterThanOrEqual(5);
    expect(pageCount).toBe(loaded.getPageCount());
  });

  it("omits the answer key page when not requested", async () => {
    const puzzle = generateGridMystery({ gridSize: 6, difficulty: "easy", seed: 5 });
    const withKey = await renderGridMysteryPdf([puzzle], optionsWith({ includeAnswerKey: true }));
    const withoutKey = await renderGridMysteryPdf([puzzle], optionsWith({ includeAnswerKey: false }));

    expect(withoutKey.pageCount).toBeLessThan(withKey.pageCount);
  });

  it("uses the real book title, not a fixed theme name, on the title page", async () => {
    const puzzle = generateGridMystery({ gridSize: 6, difficulty: "easy", seed: 5 });
    const a = await renderGridMysteryPdf([puzzle], optionsWith({ bookTitle: "Deadly Secrets" }));
    const b = await renderGridMysteryPdf([puzzle], optionsWith({ bookTitle: "A Much Longer Title" }));

    // Page content streams are compressed, so this can't grep for the
    // literal string — but a title that's actually rendered (rather than
    // ignored in favor of a fixed theme name) changes the encoded output
    // bytes, and a longer title reliably changes their length too.
    expect(Buffer.from(a.pdf).equals(Buffer.from(b.pdf))).toBe(false);
    expect(a.pageCount).toBe(b.pageCount);
  });

  it("omits every optional front/back matter page when all toggles are off and no text is given", async () => {
    const puzzle = generateGridMystery({ gridSize: 6, difficulty: "easy", seed: 5 });
    const minimal = await renderGridMysteryPdf(
      [puzzle],
      optionsWith({
        matter: {
          authorName: "J. Rivera",
          includeTitlePage: false,
          includeCopyrightPage: false,
          includeHowToSolvePage: false,
          includeReviewRequestPage: false,
        },
      }),
    );
    const full = await renderGridMysteryPdf([puzzle], optionsWith());

    expect(minimal.pageCount).toBeLessThan(full.pageCount);
  });

  it("includes a dedication page only when dedication content is provided", async () => {
    const puzzle = generateGridMystery({ gridSize: 6, difficulty: "easy", seed: 5 });
    const withoutDedication = await renderGridMysteryPdf([puzzle], optionsWith());
    const withDedication = await renderGridMysteryPdf(
      [puzzle],
      optionsWith({
        pageOverrides: { dedicationPage: { content: "For my grandmother." } },
      }),
    );

    expect(withDedication.pageCount).toBe(withoutDedication.pageCount + 1);
  });

  it("includes an about-the-author page only when a bio is provided", async () => {
    const puzzle = generateGridMystery({ gridSize: 6, difficulty: "easy", seed: 5 });
    const withoutBio = await renderGridMysteryPdf([puzzle], optionsWith());
    const withBio = await renderGridMysteryPdf(
      [puzzle],
      optionsWith({
        pageOverrides: { aboutAuthorPage: { content: "J. Rivera writes puzzle books." } },
      }),
    );

    expect(withBio.pageCount).toBe(withoutBio.pageCount + 1);
  });

  it("keeps a page's generated default content when its override content is left blank", async () => {
    const puzzle = generateGridMystery({ gridSize: 6, difficulty: "easy", seed: 5 });
    const plain = await renderGridMysteryPdf([puzzle], optionsWith());
    const titleOnly = await renderGridMysteryPdf(
      [puzzle],
      optionsWith({ pageOverrides: { copyrightPage: { title: "Legal Notice" } } }),
    );

    // Same page count (still just the one copyright page) — but the title
    // override changed the rendered bytes, proving it was actually applied
    // on top of, not instead of, the generated copyright notice.
    expect(titleOnly.pageCount).toBe(plain.pageCount);
    expect(Buffer.from(titleOnly.pdf).equals(Buffer.from(plain.pdf))).toBe(false);
  });

  it("replaces a page's generated content when override content is provided", async () => {
    const puzzle = generateGridMystery({ gridSize: 6, difficulty: "easy", seed: 5 });
    const generated = await renderGridMysteryPdf([puzzle], optionsWith());
    const overridden = await renderGridMysteryPdf(
      [puzzle],
      optionsWith({
        pageOverrides: { howToSolvePage: { content: "Just solve it, you've got this." } },
      }),
    );

    // Same page count either way (How to Solve is still a single page) but
    // different bytes, since the generated instructions were swapped out.
    expect(overridden.pageCount).toBe(generated.pageCount);
    expect(Buffer.from(overridden.pdf).equals(Buffer.from(generated.pdf))).toBe(false);
  });

  it("renders identical bytes when a section's layout is left unset vs explicitly set to its own default", async () => {
    const puzzle = generateGridMystery({ gridSize: 6, difficulty: "easy", seed: 5 });
    const unset = await renderGridMysteryPdf(
      [puzzle],
      optionsWith({ pageOverrides: { howToSolvePage: { content: "Solve it." } } }),
    );
    const explicitDefault = await renderGridMysteryPdf(
      [puzzle],
      optionsWith({
        pageOverrides: {
          howToSolvePage: {
            content: "Solve it.",
            titleLayout: { align: "left", position: "flow" },
            contentLayout: { align: "left", position: "flow" },
          },
        },
      }),
    );

    expect(Buffer.from(explicitDefault.pdf).equals(Buffer.from(unset.pdf))).toBe(true);
  });

  it("changes the rendered bytes when a section's alignment or position is overridden", async () => {
    const puzzle = generateGridMystery({ gridSize: 6, difficulty: "easy", seed: 5 });
    const left = await renderGridMysteryPdf(
      [puzzle],
      optionsWith({ pageOverrides: { howToSolvePage: { content: "Solve it." } } }),
    );
    const centered = await renderGridMysteryPdf(
      [puzzle],
      optionsWith({
        pageOverrides: {
          howToSolvePage: { content: "Solve it.", contentLayout: { align: "center", position: "flow" } },
        },
      }),
    );
    const pinnedBottom = await renderGridMysteryPdf(
      [puzzle],
      optionsWith({
        pageOverrides: {
          howToSolvePage: { content: "Solve it.", contentLayout: { align: "left", position: "bottom" } },
        },
      }),
    );

    expect(left.pageCount).toBe(centered.pageCount);
    expect(left.pageCount).toBe(pinnedBottom.pageCount);
    expect(Buffer.from(centered.pdf).equals(Buffer.from(left.pdf))).toBe(false);
    expect(Buffer.from(pinnedBottom.pdf).equals(Buffer.from(left.pdf))).toBe(false);
    expect(Buffer.from(pinnedBottom.pdf).equals(Buffer.from(centered.pdf))).toBe(false);
  });

  it("renders optional content typed on the Title Page, off by default", async () => {
    const puzzle = generateGridMystery({ gridSize: 6, difficulty: "easy", seed: 5 });
    const plain = await renderGridMysteryPdf([puzzle], optionsWith());
    const withContent = await renderGridMysteryPdf(
      [puzzle],
      optionsWith({ pageOverrides: { titlePage: { content: "Book two of the Blackwood series." } } }),
    );

    expect(withContent.pageCount).toBe(plain.pageCount);
    expect(Buffer.from(withContent.pdf).equals(Buffer.from(plain.pdf))).toBe(false);
  });

  it("substitutes an assigned image for a page's generated content", async () => {
    const puzzle = generateGridMystery({ gridSize: 6, difficulty: "easy", seed: 5 });
    const withoutImage = await renderGridMysteryPdf([puzzle], optionsWith());
    const withImage = await renderGridMysteryPdf(
      [puzzle],
      optionsWith({ pageImages: { titlePage: TEST_JPEG_BYTES } }),
    );

    // Same page count either way (still one title page) — but a real image
    // embed makes the file meaningfully larger and the bytes different.
    expect(withImage.pageCount).toBe(withoutImage.pageCount);
    expect(withImage.pdf.byteLength).toBeGreaterThan(withoutImage.pdf.byteLength);
  });

  it("includes a page purely because an image is assigned, even with its toggle off", async () => {
    const puzzle = generateGridMystery({ gridSize: 6, difficulty: "easy", seed: 5 });
    const withoutHowTo = await renderGridMysteryPdf(
      [puzzle],
      optionsWith({ matter: { ...baseMatter, includeHowToSolvePage: false } }),
    );
    const withImageOnly = await renderGridMysteryPdf(
      [puzzle],
      optionsWith({
        matter: { ...baseMatter, includeHowToSolvePage: false },
        pageImages: { howToSolvePage: TEST_JPEG_BYTES },
      }),
    );

    expect(withImageOnly.pageCount).toBe(withoutHowTo.pageCount + 1);
  });

  it("skips a custom page with neither content nor an image", async () => {
    const puzzle = generateGridMystery({ gridSize: 6, difficulty: "easy", seed: 5 });
    const withoutCustom = await renderGridMysteryPdf([puzzle], optionsWith());
    const withEmptyCustom = await renderGridMysteryPdf(
      [puzzle],
      optionsWith({ customPages: [customPage()] }),
    );

    expect(withEmptyCustom.pageCount).toBe(withoutCustom.pageCount);
  });

  it("renders a custom page with typed content, and its subtitle changes the output", async () => {
    const puzzle = generateGridMystery({ gridSize: 6, difficulty: "easy", seed: 5 });
    const withoutCustom = await renderGridMysteryPdf([puzzle], optionsWith());
    const withCustom = await renderGridMysteryPdf(
      [puzzle],
      optionsWith({
        customPages: [customPage({ content: "Check out the next book in the series!" })],
      }),
    );
    const withSubtitle = await renderGridMysteryPdf(
      [puzzle],
      optionsWith({
        customPages: [
          customPage({ content: "Check out the next book in the series!", subtitle: "Coming soon" }),
        ],
      }),
    );

    expect(withCustom.pageCount).toBe(withoutCustom.pageCount + 1);
    expect(withSubtitle.pageCount).toBe(withCustom.pageCount);
    expect(Buffer.from(withSubtitle.pdf).equals(Buffer.from(withCustom.pdf))).toBe(false);
  });

  it("applies a custom page's own title/subtitle/content layout independently of a built-in page's", async () => {
    const puzzle = generateGridMystery({ gridSize: 6, difficulty: "easy", seed: 5 });
    const flowing = await renderGridMysteryPdf(
      [puzzle],
      optionsWith({
        customPages: [customPage({ content: "Check out the next book in the series!" })],
      }),
    );
    const centeredContent = await renderGridMysteryPdf(
      [puzzle],
      optionsWith({
        customPages: [
          customPage({
            content: "Check out the next book in the series!",
            contentLayout: { align: "center", position: "flow" },
          }),
        ],
      }),
    );

    expect(centeredContent.pageCount).toBe(flowing.pageCount);
    expect(Buffer.from(centeredContent.pdf).equals(Buffer.from(flowing.pdf))).toBe(false);
  });

  it("substitutes an assigned image for a custom page, keyed by its id", async () => {
    const puzzle = generateGridMystery({ gridSize: 6, difficulty: "easy", seed: 5 });
    const pages = [customPage()];
    const withContent = await renderGridMysteryPdf(
      [puzzle],
      optionsWith({ customPages: [customPage({ content: "Placeholder text" })] }),
    );
    const withImage = await renderGridMysteryPdf(
      [puzzle],
      optionsWith({ customPages: pages, pageImages: { cp1: TEST_JPEG_BYTES } }),
    );

    // Both render exactly one page for it — the image takes priority over
    // content rather than adding a second page.
    expect(withImage.pageCount).toBe(withContent.pageCount);
  });

  it("places front-matter custom pages before the puzzle and back-matter ones at the very end", async () => {
    const puzzle = generateGridMystery({ gridSize: 6, difficulty: "easy", seed: 5 });
    const front = await renderGridMysteryPdf(
      [puzzle],
      optionsWith({
        customPages: [customPage({ name: "Front Extra", content: "Front matter text", section: "FRONT" })],
      }),
    );
    const back = await renderGridMysteryPdf(
      [puzzle],
      optionsWith({
        customPages: [customPage({ name: "Back Extra", content: "Back matter text", section: "BACK" })],
      }),
    );

    // Same page count either way (one extra page either section) — the
    // encoded bytes differ because the extra page lands in a different
    // position in the document, which is the only thing distinguishing
    // "front" from "back" placement observable from the public API.
    expect(front.pageCount).toBe(back.pageCount);
    expect(Buffer.from(front.pdf).equals(Buffer.from(back.pdf))).toBe(false);
  });

  it("respects an explicit frontMatterOrder/backMatterOrder over the historical fixed order", async () => {
    const puzzle = generateGridMystery({ gridSize: 6, difficulty: "easy", seed: 5 });
    const defaultOrder = await renderGridMysteryPdf([puzzle], optionsWith());
    const reordered = await renderGridMysteryPdf(
      [puzzle],
      optionsWith({
        frontMatterOrder: ["howToSolvePage", "copyrightPage", "titlePage", "dedicationPage"],
        backMatterOrder: ["reviewRequestPage", "aboutAuthorPage"],
      }),
    );

    // Same pages, same count, different byte layout — proves the order was
    // actually followed rather than silently falling back to the fixed one.
    expect(reordered.pageCount).toBe(defaultOrder.pageCount);
    expect(Buffer.from(reordered.pdf).equals(Buffer.from(defaultOrder.pdf))).toBe(false);
  });

  it("disabledPageKeys excludes a page even though its own inclusion rule would otherwise show it", async () => {
    const puzzle = generateGridMystery({ gridSize: 6, difficulty: "easy", seed: 5 });
    const withBio = optionsWith({
      pageOverrides: { aboutAuthorPage: { content: "J. Rivera writes puzzle books." } },
    });
    const enabled = await renderGridMysteryPdf([puzzle], withBio);
    const disabled = await renderGridMysteryPdf(
      [puzzle],
      optionsWith({ ...withBio, disabledPageKeys: ["aboutAuthorPage"] }),
    );

    expect(disabled.pageCount).toBe(enabled.pageCount - 1);
  });

  it("disabledPageKeys excludes a custom page even with content assigned", async () => {
    const puzzle = generateGridMystery({ gridSize: 6, difficulty: "easy", seed: 5 });
    const customPages = [customPage({ content: "Book 2 out now!" })];
    const enabled = await renderGridMysteryPdf([puzzle], optionsWith({ customPages }));
    const disabled = await renderGridMysteryPdf(
      [puzzle],
      optionsWith({ customPages, disabledPageKeys: ["cp1"] }),
    );

    expect(disabled.pageCount).toBe(enabled.pageCount - 1);
  });

  it("renders N puzzles in one book with one combined answer key at the end", async () => {
    const puzzles = [
      generateGridMystery({ gridSize: 6, difficulty: "easy", seed: 1 }),
      generateGridMystery({ gridSize: 6, difficulty: "easy", seed: 2 }),
      generateGridMystery({ gridSize: 6, difficulty: "easy", seed: 3 }),
    ];
    const one = await renderGridMysteryPdf([puzzles[0]!], optionsWith());
    const three = await renderGridMysteryPdf(puzzles, optionsWith());

    // Each extra puzzle adds exactly ONE body page now. Two extra puzzles
    // therefore add 2 pages, plus at most one more if the combined answer
    // key spills onto a second page.
    const delta = three.pageCount - one.pageCount;
    expect(delta).toBeGreaterThanOrEqual(2);
    expect(delta).toBeLessThanOrEqual(3);

    const doc = await PDFDocument.load(three.pdf);
    expect(doc.getPageCount()).toBe(three.pageCount);
  });

  it("onePerSpread mode pads with blank versos so every puzzle starts on recto", async () => {
    const puzzles = [
      generateGridMystery({ gridSize: 6, difficulty: "easy", seed: 1 }),
      generateGridMystery({ gridSize: 6, difficulty: "easy", seed: 2 }),
    ];
    const packed = await renderGridMysteryPdf(puzzles, optionsWith({ puzzlesPerSpread: "packed" }));
    const spread = await renderGridMysteryPdf(
      puzzles,
      optionsWith({ puzzlesPerSpread: "onePerSpread" }),
    );

    // Blank versos before each puzzle grow the page count; the second
    // rendering must contain strictly more pages than the packed one.
    expect(spread.pageCount).toBeGreaterThan(packed.pageCount);
  });

  it("rejects an empty puzzles array", async () => {
    await expect(renderGridMysteryPdf([], optionsWith())).rejects.toThrow(/empty/i);
  });
});
