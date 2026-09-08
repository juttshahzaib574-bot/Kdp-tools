// Feeds the Review & Customize tab.
//
// Two things come back per puzzle, and the split is the whole point:
//
//   TEMPLATES — the case title, brief, clues and evidence notes exactly
//   as the engine stores them, with suspects still written as `{{sN}}`
//   tokens (see text-template.ts). The tab resolves those tokens in
//   React, so renaming a suspect updates every line on screen in a
//   render, with no worker round-trip and no re-solve. That is the
//   entire reason the engine emits templates rather than finished prose.
//
//   A PAGE IMAGE — the real PDF for that puzzle, rendered by the same
//   code path the book export uses, so the thumbnail is a print preview
//   rather than an impression of one. It's the slow half, so it's sent
//   as a second message: the text lands first and the tab is usable
//   immediately, the picture catches up.
//
// Plain JavaScript on purpose — see the header of puzzle-sample.worker.js
// for why a .ts worker can't be loaded by the browser here. The message
// shapes are typed in the sibling .d.ts.
import {
  applyOverrides,
  caseBriefFor,
  caseTitleFor,
  generateGridMystery,
  renderPuzzleOnlyPdf,
} from "@kdp/generator-grid-mystery";
import { toEngineDifficulty } from "@kdp/shared";
import { loadBrowserBookFonts } from "./load-fonts";
import { loadBrowserArtPack } from "./load-art";

self.onmessage = async (event) => {
  const req = event.data;
  const fontBytes = await loadBrowserBookFonts();

  for (const item of req.puzzles) {
    try {
      const base = generateGridMystery({
        gridSize: item.gridSize,
        difficulty: toEngineDifficulty(item.difficulty),
        themeId: req.theme,
        seed: item.seed,
      });
      const puzzle = applyOverrides(base, item.overrides ?? undefined);

      // Text first: cheap, and it's what the editor binds to.
      self.postMessage({
        requestId: req.requestId,
        kind: "text",
        id: item.id,
        seed: item.seed,
        difficulty: puzzle.difficulty,
        titleTemplate: caseTitleFor(puzzle),
        briefTemplate: caseBriefFor(puzzle),
        clueTemplates: puzzle.clues.map((clue) => clue.text),
        evidenceTemplates: puzzle.evidenceClues.map((clue) => clue.text),
        suspects: puzzle.suspects.map((s) => ({
          id: s.id,
          name: s.name,
          heightIn: s.heightIn,
          isVictim: s.id === puzzle.victimSuspectId,
        })),
        crimeRoomName: puzzle.crimeRoomName,
        solveNodes: puzzle.solveDepth.nodes,
        // What the tier claim actually rests on. Sent so the card can
        // show the reasoning the puzzle demands rather than just the
        // label asserting it — see tier-contract.ts.
        logicProfile: puzzle.logicProfile,
        // The solution, for the PUBLISHER only. It appears on the review
        // card and in the exported answer key; the puzzle page itself
        // carries a blank "THE MURDERER IS" line and nothing else.
        culpritSuspectId: puzzle.culpritSuspectId,
        victimSuspectId: puzzle.victimSuspectId,
        murderWeapon: puzzle.murderWeapon,
      });

      if (req.includeThumbnails === false) continue;

      // Fetched per puzzle, not per book: each page has its own cast and
      // its own rooms, and the loader caches across calls so a shared
      // butler is fetched once for the whole session.
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
        // A thumbnail is the puzzle page, not the answer — printing the
        // solution next to it in the review list would be an odd thing
        // to hand a publisher, and it doubles the render for nothing.
        includeAnswerKey: false,
        caseTitle: item.overrides?.title,
        caseSubtitle: item.overrides?.subtitle,
      });
      self.postMessage({
        requestId: req.requestId,
        kind: "page",
        id: item.id,
        pdf,
        pageCount,
      });
    } catch (error) {
      self.postMessage({
        requestId: req.requestId,
        kind: "error",
        id: item.id,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  self.postMessage({ requestId: req.requestId, kind: "done" });
};
