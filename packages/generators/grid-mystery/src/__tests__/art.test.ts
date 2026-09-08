import { describe, expect, it } from "vitest";
import { PDFDocument } from "pdf-lib";
import { generateGridMystery } from "../generate";
import { renderPuzzleOnlyPdf } from "../render-pdf";
import { loadNodeArtPack } from "../node-art";
import {
  bakedPathFor,
  castPortraits,
  planPuzzleArt,
  resolveFloors,
  resolveProp,
  rolesForTheme,
  type LoadedArtPack,
} from "../art";
import { embedPuzzleArt } from "../art-embed";
import { PDFDocument as Doc } from "pdf-lib";
import { roomTypeSlug } from "../textures";

describe("real artwork", () => {
  const pack = async (grey = false) => {
    const p = await loadNodeArtPack("noir-1930s", grey);
    if (!p) throw new Error("noir-1930s did not load — run `pnpm art:build`");
    return p;
  };

  it("loads the pack with bytes for every listed entry", async () => {
    const p = await pack();
    const listed =
      p.manifest.portraits.length + p.manifest.furniture.length + p.manifest.floors.length;
    expect(listed).toBeGreaterThan(50);
    // Every entry the manifest lists must have arrived — a listed file
    // with no bytes silently degrades to procedural art, which is the
    // fallback for a MISSING file, not for a broken build.
    expect(p.images.size).toBe(listed);
  });

  it("casts a distinct portrait per suspect", async () => {
    const p = await pack();
    const puzzle = generateGridMystery({ gridSize: 7, difficulty: "medium", themeId: "manor", seed: 4242 });
    const ids = puzzle.suspects.map((s) => s.id);
    const cast = castPortraits(p, puzzle.themeId, ids, 4242, false);
    expect(cast.filter(Boolean)).toHaveLength(ids.length);
    // A page showing the same face twice reads as a bug even when the
    // names differ.
    const used = cast.filter(Boolean).map((e) => e!.id);
    expect(new Set(used).size).toBe(used.length);
  });

  it("only casts roles the theme admits", async () => {
    const p = await pack();
    for (const themeId of ["manor", "farm", "camp", "messHall"]) {
      const allowed = new Set(rolesForTheme(themeId));
      const cast = castPortraits(p, themeId, ["s0", "s1", "s2", "s3"], 7, false);
      for (const entry of cast) {
        if (entry) expect(allowed, `${themeId} cast a ${entry.role}`).toContain(entry.role);
      }
    }
  });

  it("matches props by landmark name despite the folder being a slug", async () => {
    // The manifest stores "grandfather-clock"; the engine asks for
    // "grandfather clock". This mismatch silently sent every prop back to
    // its procedural glyph while portraits and floors rendered fine.
    const p = await pack();
    expect(resolveProp(p, "grandfather clock", "manor", 1, false)).not.toBeNull();
    expect(resolveProp(p, "hay bale", "farm", 1, false)).not.toBeNull();
    expect(resolveProp(p, "vegetable patch", "farm", 1, false)).not.toBeNull();
  });

  it("does not lend one theme's props to another", async () => {
    const p = await pack();
    expect(resolveProp(p, "hay bale", "manor", 1, false)).toBeNull();
    expect(resolveProp(p, "grandfather clock", "farm", 1, false)).toBeNull();
  });

  it("gives no two rooms in a puzzle the same floor", async () => {
    const p = await pack();
    for (const themeId of ["manor", "farm"]) {
      const puzzle = generateGridMystery({ gridSize: 7, difficulty: "medium", themeId, seed: 99 });
      const slugs = puzzle.floorPlan.rooms.map((r) => roomTypeSlug(r.name));
      const floors = resolveFloors(p, slugs, 99, false);
      const ids = floors.filter(Boolean).map((f) => f!.id);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });

  it("renders a page with art, and embeds each image exactly once", async () => {
    const p = await pack();
    const puzzle = generateGridMystery({ gridSize: 7, difficulty: "medium", themeId: "farm", seed: 31337 });
    const withArt = await renderPuzzleOnlyPdf(puzzle, { trimSize: "8.5x11", artPack: p });
    const doc = await PDFDocument.load(withArt.pdf);
    expect(doc.getPageCount()).toBeGreaterThanOrEqual(1);
    // Embed-per-draw versus embed-once was measured at 198MB against
    // 0.15MB on the procedural textures; real art only widens that. A
    // page drawing ~6 floors across ~30 cells must not carry 30 copies.
    expect(withArt.pdf.length).toBeLessThan(6 * 1024 * 1024);
  }, 120_000);

  it("still renders when there is no art at all", async () => {
    // The path every caller took before any artwork existed, and the path
    // a theme with no pack still takes.
    const puzzle = generateGridMystery({ gridSize: 6, difficulty: "easy", themeId: "camp", seed: 5 });
    const bare = await renderPuzzleOnlyPdf(puzzle, { trimSize: "6x9" });
    expect(bare.pdf.length).toBeGreaterThan(0);
  }, 60_000);

  it("plans exactly the files the page will draw — no more, no fewer", async () => {
    // A browser preview fetches the PLAN and draws with the RESOLVERS. If
    // those two disagree the preview silently loses art, or wastes a
    // download on a file no page reaches. They cannot disagree here
    // because the plan runs the same resolvers, and this is what pins it.
    const p = await pack();
    const puzzle = generateGridMystery({ gridSize: 7, difficulty: "medium", themeId: "manor", seed: 777 });
    const planned = new Set(planPuzzleArt(p.manifest, puzzle, 777, false, roomTypeSlug));

    const doc = await Doc.create();
    const art = await embedPuzzleArt(doc, p, puzzle, 777, false);
    const drawnCount = art.portraits.size + art.props.size + art.floors.size;

    expect(planned.size).toBe(drawnCount);
    // And a plan built from a manifest alone must be fetchable: every
    // path it names has to exist in the real pack.
    for (const path of planned) expect(p.images.has(path)).toBe(true);
  }, 60_000);

  it("plans nothing when the manifest is empty", () => {
    const empty = { id: "x", portraits: [], furniture: [], floors: [] };
    const puzzle = generateGridMystery({ gridSize: 6, difficulty: "easy", themeId: "farm", seed: 3 });
    expect(planPuzzleArt(empty, puzzle, 3, false, roomTypeSlug)).toEqual([]);
  });

  it("plans the greyscale copies for a black-ink book", async () => {
    const p = await pack(true);
    const puzzle = generateGridMystery({ gridSize: 6, difficulty: "easy", themeId: "manor", seed: 11 });
    const planned = planPuzzleArt(p.manifest, puzzle, 11, true, roomTypeSlug);
    expect(planned.length).toBeGreaterThan(0);
    for (const path of planned) expect(path).toMatch(/-grey\.png$/);
  });

  it("degrades to procedural art rather than failing when bytes are missing", async () => {
    const real = await pack();
    // A manifest that lists everything, with nothing loaded.
    const empty: LoadedArtPack = { manifest: real.manifest, images: new Map() };
    expect(castPortraits(empty, "manor", ["s0", "s1"], 1, false)).toEqual([null, null]);
    expect(resolveProp(empty, "grandfather clock", "manor", 1, false)).toBeNull();
    expect(resolveFloors(empty, ["pantry", "cellar"], 1, false)).toEqual([null, null]);
  });
});
