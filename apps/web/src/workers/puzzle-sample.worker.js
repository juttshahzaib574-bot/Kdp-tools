// Generates a batch of fresh puzzles for the Generate-tab carousel. Same
// deterministic engine + renderer the real book export uses, so what the
// carousel shows is exactly what will print. Puzzle-only (no matter, no
// cover) so each preview finishes in a fraction of the time a full book
// render would take.
//
// Kept as plain JavaScript on purpose: Next 16's Turbopack copies a
// `.worker.ts` source file to /_next/static/media unchanged, and the
// browser then refuses to run it as a Worker script — both the MIME type
// (video/mp2t, because the file extension is .ts) and the raw TypeScript
// syntax the browser can't parse. Written as .js, Turbopack emits and
// serves it as application/javascript and the browser runs it. The
// message-shape types live in the sibling puzzle-sample.worker.d.ts so
// callers still get full type checking without shipping TypeScript syntax
// to the browser.
import {
  caseTitleFor,
  generateGridMystery,
  renderPuzzleOnlyPdf,
  renderTemplate,
  resolveNames,
} from "@kdp/generator-grid-mystery";
import { toEngineDifficulty } from "@kdp/shared";
import { loadBrowserBookFonts } from "./load-fonts";
import { loadBrowserArtPack } from "./load-art";

self.onmessage = async (event) => {
  const req = event.data;
  // Same faces the export embeds, so the preview matches the print.
  const fontBytes = await loadBrowserBookFonts();
  for (let index = 0; index < req.samples.length; index++) {
    const { seed, difficulty } = req.samples[index];
    try {
      const puzzle = generateGridMystery({
        gridSize: req.gridSize,
        // The UI ladder has five tiers; the engine implements three.
        // All five tiers are engine-native — see DIFFICULTY_CONFIG in the
        // grid-mystery clues module. toEngineDifficulty is identity here;
        // keeping the call as the seam so any future UI-only alias plugs
        // in one place.
        difficulty: toEngineDifficulty(difficulty),
        themeId: req.theme,
        seed,
      });
      const artPack = await loadBrowserArtPack(
        "noir-1930s",
        puzzle,
        req.textureSeed ?? 1,
        req.interiorColor === "blackAndWhite",
      );
      const { pdf, pageCount } = await renderPuzzleOnlyPdf(puzzle, {
        artPack,
        interiorColor: req.interiorColor,
        floorStrength:
          (req.interiorColor === "blackAndWhite"
            ? (req.floorStrengthGrey ?? 30)
            : (req.floorStrengthColor ?? 38)) / 100,
        roomContrast: (req.roomContrast ?? 55) / 100,
        cardCorners: req.cardCorners ?? "rounded",
        bleed: req.bleed,
        fontBytes,
        trimSize: req.trimSize,
        includeAnswerKey: req.includeAnswerKey,
      });
      self.postMessage({
        requestId: req.requestId,
        kind: "puzzle",
        index,
        total: req.samples.length,
        pdf,
        pageCount,
        theme: puzzle.theme,
        seed,
        difficulty,
        // RESOLVED, not the raw template. The engine stores titles and
        // clues with `{{sN}}` name tokens (see text-template.ts), and
        // this used to post the template straight to the UI — which
        // printed captions like "{{s4}} Never Left the Conservatory".
        // Anything crossing into UI text must be resolved first.
        caseTitle: renderTemplate(caseTitleFor(puzzle), resolveNames(puzzle.suspects)),
      });
    } catch (error) {
      self.postMessage({
        requestId: req.requestId,
        kind: "error",
        index,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
  self.postMessage({ requestId: req.requestId, kind: "done", total: req.samples.length });
};
