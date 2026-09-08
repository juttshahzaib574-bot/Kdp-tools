// Runs the exact same deterministic, verified generator + PDF renderer the
// server uses (packages/generators/grid-mystery is pure TypeScript + pdf-lib,
// with zero Node-only dependencies) — but here, in the browser, so a live
// preview never needs a server round trip, a queue, or a cost. Off the main
// thread specifically because the solver is a real backtracking search
// (occasionally a few seconds at 8x8) and must never freeze the form.
//
// Covers aren't previewed here — most books' covers are designed externally
// (Canva, etc.) and uploaded straight to KDP, so this only ever needs to
// preview the interior.
//
// Kept as plain JavaScript on purpose: Next 16's Turbopack copies a
// `.worker.ts` source file to /_next/static/media unchanged, and the
// browser then refuses to run it as a Worker script (video/mp2t MIME plus
// raw TypeScript syntax it can't parse). Written as .js, Turbopack emits
// and serves it as application/javascript and the browser runs it. The
// message-shape types live in the sibling puzzle-preview.worker.d.ts.
import {
  applyOverrides,
  generateGridMystery,
  renderGridMysteryPdf,
} from "@kdp/generator-grid-mystery";
import { toEngineDifficulty } from "@kdp/shared";
import { loadBrowserBookFonts } from "./load-fonts";
import { loadBrowserArtPackForBook } from "./load-art";

self.onmessage = async (event) => {
  const req = event.data;
  // Same faces the export embeds, so the preview matches the print.
  const fontBytes = await loadBrowserBookFonts();
  try {
    const pageImages = {};
    for (const [key, buffer] of Object.entries(req.pageImages)) {
      if (buffer) pageImages[key] = new Uint8Array(buffer);
    }

    // THE WHOLE BOOK, not a sample.
    //
    // This used to build one representative puzzle and label the result
    // "showing 1 of 100", which meant the page count was wrong, the
    // spine derived from it was wrong, and a publisher checking their
    // margins was checking a document that didn't exist. A preview whose
    // page count is a guess is worse than no preview.
    //
    // Puzzles are deterministic, so rebuilding them from their stored
    // seeds reproduces exactly what the export will render — the same
    // engine, the same seeds, the same overrides. It costs real time for
    // a long book, which is why progress is reported per puzzle rather
    // than leaving the tab frozen.
    const specs =
      req.puzzles && req.puzzles.length > 0
        ? req.puzzles
        : [{ seed: undefined, gridSize: req.gridSize, difficulty: req.difficulty, overrides: null }];

    const puzzles = [];
    const caseTitles = [];
    const caseSubtitles = [];
    for (let i = 0; i < specs.length; i++) {
      const spec = specs[i];
      const base = generateGridMystery({
        gridSize: spec.gridSize ?? req.gridSize,
        // toEngineDifficulty is identity — see puzzle-sample.worker.js.
        difficulty: toEngineDifficulty(spec.difficulty ?? req.difficulty),
        themeId: req.theme,
        ...(spec.seed === undefined ? {} : { seed: spec.seed }),
      });
      puzzles.push(applyOverrides(base, spec.overrides ?? undefined));
      caseTitles.push(spec.overrides?.title);
      caseSubtitles.push(spec.overrides?.subtitle);
      // Every few puzzles, not every one: postMessage into a React state
      // update is not free, and 100 of them would cost more than the
      // rendering they're reporting on.
      if (i % 5 === 4 || i === specs.length - 1) {
        self.postMessage({
          requestId: req.requestId,
          kind: "progress",
          built: i + 1,
          total: specs.length,
        });
      }
    }

    // One pack for the whole book: every page embeds into the same
    // document, so the images are shared and fetched as a single batch.
    const artPack = await loadBrowserArtPackForBook(
      "noir-1930s",
      puzzles,
      req.textureSeed ?? 1,
      req.interiorColor === "blackAndWhite",
    );
    const { pdf: interiorPdf, pageCount } = await renderGridMysteryPdf(puzzles, {
      artPack,
      bookTitle: req.bookTitle,
      trimSize: req.trimSize,
      includeAnswerKey: req.includeAnswerKey,
      matter: req.matter,
      pageImages,
      customPages: req.customPages,
      frontMatterOrder: req.frontMatterOrder,
      backMatterOrder: req.backMatterOrder,
      disabledPageKeys: req.disabledPageKeys,
      pageOverrides: req.pageOverrides,
      puzzlesPerSpread: req.puzzlesPerSpread,
      interiorColor: req.interiorColor,
      floorStrength:
        (req.interiorColor === "blackAndWhite"
          ? (req.floorStrengthGrey ?? 30)
          : (req.floorStrengthColor ?? 38)) / 100,
      roomContrast: (req.roomContrast ?? 55) / 100,
        cardCorners: req.cardCorners ?? "rounded",
      bleed: req.bleed,
      fontBytes,
      caseTitles,
      caseSubtitles,
    });

    self.postMessage({
      requestId: req.requestId,
      ok: true,
      interiorPdf,
      pageCount,
      puzzleCount: puzzles.length,
    });
  } catch (error) {
    self.postMessage({
      requestId: req.requestId,
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
};
