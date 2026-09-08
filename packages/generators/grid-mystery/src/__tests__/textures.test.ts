import { describe, expect, it } from "vitest";
import { PDFDocument, rgb } from "pdf-lib";
import {
  MAX_DELTA,
  TEXTURE_FAMILIES,
  paintTextureCell,
  surfaceForRoom,
  surfacesForRooms,
  candidateFamilies,
  textureInk,
} from "../textures";
import { paletteFor } from "../palette";
import { FARM_THEME, MANOR_THEME, THEMES } from "../content";
import { generateGridMystery } from "../generate";
import { renderPuzzleOnlyPdf } from "../render-pdf";
import { loadNodeBookFonts } from "../node-fonts";

describe("texture engine", () => {
  const palette = paletteFor("color");
  const grey = paletteFor("blackAndWhite");
  const base = rgb(0.85, 0.87, 0.83);

  it("draws every family without throwing, across scales and seeds", async () => {
    // A family that throws would take down a whole book render, and the
    // families are only reachable through a big switch — so this walks
    // all of them rather than trusting that the switch is exhaustive.
    const doc = await PDFDocument.create();
    const page = doc.addPage([200, 200]);
    for (const family of TEXTURE_FAMILIES) {
      for (const scale of [2, 5, 11]) {
        for (const seed of [1, 987654]) {
          expect(() =>
            paintTextureCell(
              page,
              { x: 20, y: 20, w: 60, h: 60 },
              { x: 0, y: 0 },
              { family, scale, angle: Math.PI / 6, jitter: 0.6, contrast: 1, seed },
              base,
              palette,
              "normal",
            ),
          ).not.toThrow();
        }
      }
    }
    expect((await doc.save()).byteLength).toBeGreaterThan(0);
  });

  describe("legibility ceiling", () => {
    // The engine's core safety property: a texture may suggest a surface
    // but can never darken enough to compete with the grid's own ink. If
    // this cap ever loosens, decorated puzzles stop being solvable.
    it("clamps any delta to the cap, however extreme the request", () => {
      for (const delta of [-99, -1, -0.5, 0.5, 1, 99]) {
        for (const intensity of [1, 5, 1000]) {
          const out = textureInk(base, delta, false, intensity);
          expect(Math.abs(out.red - base.red)).toBeLessThanOrEqual(MAX_DELTA.color + 1e-9);
          expect(Math.abs(out.green - base.green)).toBeLessThanOrEqual(MAX_DELTA.color + 1e-9);
          expect(Math.abs(out.blue - base.blue)).toBeLessThanOrEqual(MAX_DELTA.color + 1e-9);
        }
      }
    });

    it("holds a tighter cap in greyscale, where value alone carries the plan", () => {
      expect(MAX_DELTA.grey).toBeLessThan(MAX_DELTA.color);
      const out = textureInk(base, -99, true, 1000);
      expect(Math.abs(out.red - base.red)).toBeLessThanOrEqual(MAX_DELTA.grey + 1e-9);
    });

    it("never produces a colour outside [0,1]", () => {
      for (const b of [rgb(0, 0, 0), rgb(1, 1, 1), rgb(0.02, 0.5, 0.99)]) {
        for (const delta of [-5, 5]) {
          const out = textureInk(b, delta, false, 10);
          for (const ch of [out.red, out.green, out.blue]) {
            expect(ch).toBeGreaterThanOrEqual(0);
            expect(ch).toBeLessThanOrEqual(1);
          }
        }
      }
    });
  });

  describe("room -> surface mapping", () => {
    // The mapping table is ordered, and a keyword that is a substring of
    // another silently steals its rooms. These pin the collisions that
    // actually bit: "Mess Hall" contains "hall", "Servants' Hall" too,
    // "Cold Store" contains "store", "Tool Shed" contains "shed".
    const expectations: [string, string[]][] = [
      ["Tool Shed", ["stoneBlock", "brickRunning", "cobble"]],
      ["Stable", ["woodPlank", "straw", "cobble", "soilRows", "concrete"]],
      ["Hayloft", ["straw", "woodPlank", "burlap", "soilRows"]],
      ["Main Barn", ["woodPlank", "straw", "cobble", "soilRows", "concrete"]],
      ["Vegetable Garden", ["soilRows", "grass", "gravel", "stoneBlock"]],
      ["Pantry", ["tileHex", "tileSquare", "subwayTile"]],
      ["Scullery", ["tileHex", "tileSquare", "subwayTile"]],
      ["Wine Cellar", ["stoneBlock", "brickRunning", "cobble"]],
      ["Ballroom", ["parquet", "marble", "checker"]],
      ["Library", ["parquet", "carpet", "woodPlank"]],
      ["Boathouse", ["water", "woodPlank", "concrete", "metalBrushed"]],
      ["Grain Silo", ["concrete", "diamondPlate", "metalBrushed"]],
      // The collisions:
      ["Mess Hall", ["checker", "tileSquare", "linenWeave"]],
      ["Servants' Hall", ["woodPlank", "linenWeave", "stoneBlock"]],
      ["Cold Store", ["tileHex", "concrete", "tileSquare"]],
      ["Hallway", ["tileSquare", "parquet", "marble"]],
    ];

    for (const [room, allowed] of expectations) {
      it(`gives "${room}" a surface that fits it, for every seed`, () => {
        // Every seed must land inside the room's own candidate set — the
        // seed picks WHICH plausible surface, never whether it's plausible.
        for (let seed = 0; seed < 40; seed++) {
          const { family } = surfaceForRoom(room, seed);
          expect(allowed, `"${room}" seed ${seed} chose ${family}`).toContain(family);
        }
      });
    }

    it("falls back to a neutral surface for an unrecognised room", () => {
      const { family } = surfaceForRoom("Zorblax Chamber", 7);
      expect(TEXTURE_FAMILIES).toContain(family);
      expect(family).not.toBe("plain");
    });

    it("is deterministic per seed and varies across seeds", () => {
      const a = surfaceForRoom("Tool Shed", 1);
      const b = surfaceForRoom("Tool Shed", 1);
      expect(a).toEqual(b);
      // Across many seeds the parameter space is genuinely exercised —
      // this is what moves the page hash between books.
      const variants = new Set(
        Array.from({ length: 60 }, (_, i) => JSON.stringify(surfaceForRoom("Tool Shed", i))),
      );
      expect(variants.size).toBeGreaterThan(20);
    });

    it("produces sane parameters", () => {
      for (let seed = 0; seed < 30; seed++) {
        const p = surfaceForRoom("Library", seed);
        expect(p.scale).toBeGreaterThan(0);
        expect(Number.isFinite(p.angle)).toBe(true);
        expect(p.jitter).toBeGreaterThanOrEqual(0);
        expect(p.jitter).toBeLessThanOrEqual(1);
        expect(p.contrast).toBeGreaterThan(0);
      }
    });
  });

  describe("distinct surfaces within one puzzle", () => {
    // Two rooms on the same page sharing a material read as one room cut
    // in half — it undoes the whole reason for drawing surfaces. But the
    // fix cannot come at the cost of the semantic band: a barn floor
    // belongs in barns. These hold both rules at once.
    //
    // The set is exhaustive rather than sampled because the failures are
    // combinatorial, not random: the farm's five agricultural rooms all
    // want the same short list, and only certain subsets of them collide.
    // Sampling missed it; enumerating found 86 broken sets.
    const ROOM_COUNTS = [4, 5, 6]; // roomCountFor(): 6x6 -> 4, 7x7 -> 5, 8x8+ -> 6

    function combinations<T>(items: readonly T[], k: number): T[][] {
      if (k === 0) return [[]];
      if (items.length < k) return [];
      const [first, ...rest] = items as [T, ...T[]];
      return [
        ...combinations(rest, k - 1).map((c) => [first, ...c]),
        ...combinations(rest, k),
      ];
    }

    const allSets = THEMES.flatMap((theme) =>
      ROOM_COUNTS.flatMap((k) =>
        combinations(theme.roomNames, k).map((rooms) => ({ theme: theme.id, rooms })),
      ),
    );

    it("enumerates every room combination a puzzle can actually draw", () => {
      // Guards the guard: if a theme gains rooms and this number moves,
      // the coverage below moved with it and that is worth seeing.
      expect(allSets.length).toBe(2688);
    });

    it("gives every room in a puzzle a different material, for every combination", () => {
      const broken: string[] = [];
      for (const { theme, rooms } of allSets) {
        const families = surfacesForRooms(rooms, 12345).map((s) => s.family);
        if (new Set(families).size !== rooms.length) {
          broken.push(`${theme}: ${rooms.join(", ")} -> ${families.join(", ")}`);
        }
      }
      expect(broken.slice(0, 5), `${broken.length} sets could not be made distinct`).toEqual([]);
    });

    it("keeps every room inside its own semantic band while doing it", () => {
      // The distinctness must never be bought by putting marble in a barn.
      for (const { theme, rooms } of allSets.filter((_, i) => i % 7 === 0)) {
        for (let seed = 0; seed < 3; seed++) {
          const picks = surfacesForRooms(rooms, seed * 977 + 3);
          rooms.forEach((room, i) => {
            expect(
              candidateFamilies(room),
              `${theme} "${room}" seed ${seed} got ${picks[i]!.family}`,
            ).toContain(picks[i]!.family);
          });
        }
      }
    });

    it("still varies the assignment across seeds", () => {
      // Distinct-per-puzzle must not collapse into one fixed answer, or
      // every Library in the book is the same floor — the duplicate-content
      // risk the rule exists to avoid.
      const rooms = MANOR_THEME.roomNames.slice(0, 6);
      const shapes = new Set(
        Array.from({ length: 40 }, (_, i) =>
          surfacesForRooms(rooms, i).map((s) => s.family).join("|"),
        ),
      );
      expect(shapes.size).toBeGreaterThan(3);
    });

    it("is deterministic for a given seed", () => {
      const rooms = FARM_THEME.roomNames.slice(0, 6);
      expect(surfacesForRooms(rooms, 42)).toEqual(surfacesForRooms(rooms, 42));
    });
  });

  describe("integration with the puzzle page", () => {
    it("intensity 'off' produces a different, smaller page than 'normal'", async () => {
      const fontBytes = await loadNodeBookFonts();
      const puzzle = generateGridMystery({ gridSize: 6, difficulty: "easy", seed: 21 });
      const render = (textureIntensity: "off" | "normal") =>
        renderPuzzleOnlyPdf(puzzle, {
          trimSize: "6x9",
          fontBytes,
          includeAnswerKey: false,
          textureIntensity,
          textureSeed: 5,
        });
      const [off, normal] = await Promise.all([render("off"), render("normal")]);
      expect(Buffer.from(off.pdf).equals(Buffer.from(normal.pdf))).toBe(false);
      // Textures are drawn geometry, so they must cost bytes.
      expect(normal.pdf.length).toBeGreaterThan(off.pdf.length);
    });

    it("two texture seeds give different pages — this is the per-book variation", async () => {
      const fontBytes = await loadNodeBookFonts();
      const puzzle = generateGridMystery({ gridSize: 6, difficulty: "easy", seed: 22 });
      const render = (textureSeed: number) =>
        renderPuzzleOnlyPdf(puzzle, {
          trimSize: "6x9",
          fontBytes,
          includeAnswerKey: false,
          textureSeed,
        });
      const [a, b, aAgain] = await Promise.all([render(1), render(2), render(1)]);
      expect(Buffer.from(a.pdf).equals(Buffer.from(b.pdf))).toBe(false);
      // ...but the same seed must still reproduce exactly.
      expect(Buffer.from(a.pdf).equals(Buffer.from(aAgain.pdf))).toBe(true);
    });

    it("keeps a textured page well under a sane print file size", async () => {
      // Vector textures are the whole reason this is affordable — a
      // raster equivalent would be megabytes per page. If a family ever
      // starts emitting a pathological number of shapes, catch it here.
      const fontBytes = await loadNodeBookFonts();
      const puzzle = generateGridMystery({ gridSize: 8, difficulty: "medium", seed: 23 });
      const { pdf } = await renderPuzzleOnlyPdf(puzzle, {
        trimSize: "8.5x11",
        fontBytes,
        includeAnswerKey: false,
      });
      expect(pdf.length).toBeLessThan(600_000);
      // Generous timeout: an 8x8 puzzle's SOLVER is the slow part here,
      // not the texturing — this test is about output size, so it must
      // not become a flaky timing test.
    }, 60_000);

    it("applies textures in greyscale books too", async () => {
      const fontBytes = await loadNodeBookFonts();
      const puzzle = generateGridMystery({ gridSize: 6, difficulty: "easy", seed: 24 });
      const render = (textureIntensity: "off" | "normal") =>
        renderPuzzleOnlyPdf(puzzle, {
          trimSize: "6x9",
          fontBytes,
          includeAnswerKey: false,
          interiorColor: "blackAndWhite",
          textureIntensity,
        });
      const [off, normal] = await Promise.all([render("off"), render("normal")]);
      expect(Buffer.from(off.pdf).equals(Buffer.from(normal.pdf))).toBe(false);
    });
  });

  it("greyscale palette textures stay greyscale (no colour cast in a B&W book)", () => {
    for (const room of ["Tool Shed", "Pantry", "Stable"]) {
      const p = surfaceForRoom(room, 3);
      expect(p.family).toBeTruthy();
    }
    // The ink helper is what a B&W page draws with; from a grey base it
    // must stay grey, or a "black and white" interior ships with colour.
    const greyBase = grey.rooms[0]!;
    const out = textureInk(greyBase, -0.5, true, 1);
    expect(out.red).toBeCloseTo(out.green, 6);
    expect(out.green).toBeCloseTo(out.blue, 6);
  });
});
