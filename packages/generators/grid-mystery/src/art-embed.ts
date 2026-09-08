import {
  clip,
  closePath,
  endPath,
  lineTo,
  moveTo,
  popGraphicsState,
  pushGraphicsState,
  rgb,
  type PDFDocument,
  type PDFImage,
  type PDFPage,
} from "pdf-lib";
import {
  bakedPathFor,
  castPortraits,
  resolveFloors,
  resolveProp,
  type LoadedArtPack,
} from "./art";
import { roomTypeSlug } from "./textures";
import type { GridMysteryPuzzle } from "./types";

/**
 * Embedding is per DOCUMENT, not per page.
 *
 * A thirty-puzzle book draws the same butler and the same parquet on many
 * pages. pdf-lib will happily embed the same PNG thirty times and the
 * file grows thirtyfold; embedded once, every page references one
 * XObject. This was measured on the procedural textures before any
 * artwork existed — embed-per-draw came to 198MB against 0.15MB for
 * embed-once — and real art only makes the gap wider.
 *
 * Keyed weakly by document so a long-running worker rendering many books
 * does not hold every book's images alive.
 */
const EMBEDS = new WeakMap<PDFDocument, Map<string, PDFImage>>();

async function embed(
  doc: PDFDocument,
  pack: LoadedArtPack,
  bakedPath: string,
): Promise<PDFImage | null> {
  let perDoc = EMBEDS.get(doc);
  if (!perDoc) {
    perDoc = new Map();
    EMBEDS.set(doc, perDoc);
  }
  const hit = perDoc.get(bakedPath);
  if (hit) return hit;
  const bytes = pack.images.get(bakedPath);
  if (!bytes) return null;
  try {
    const image = await doc.embedPng(bytes);
    perDoc.set(bakedPath, image);
    return image;
  } catch {
    // A corrupt or non-PNG file must not take a book down — the caller
    // falls back to procedural art for that slot.
    return null;
  }
}

/** Everything one puzzle page needs, already embedded and ready to draw. */
export interface PuzzleArt {
  /** By suspect id. Missing or null means "draw the procedural bust". */
  portraits: Map<string, PDFImage>;
  /** By landmark name. Missing means "draw the procedural glyph". */
  props: Map<string, PDFImage>;
  /** By room index in floorPlan.rooms. Missing means "paint the texture". */
  floors: Map<number, PDFImage>;
}

/**
 * Resolves and embeds every asset one puzzle needs.
 *
 * Everything about this is best-effort by design: a slot with no art, or
 * art that fails to embed, is simply absent from the returned maps and
 * the page falls back to what it drew before. That is what lets a pack
 * holding eleven floors out of twenty-four improve the pages it can
 * instead of blocking the book.
 */
export async function embedPuzzleArt(
  doc: PDFDocument,
  pack: LoadedArtPack,
  puzzle: GridMysteryPuzzle,
  seed: number,
  greyscale: boolean,
): Promise<PuzzleArt> {
  const art: PuzzleArt = { portraits: new Map(), props: new Map(), floors: new Map() };
  const themeId = puzzle.themeId;

  const suspectIds = puzzle.suspects.map((s) => s.id);
  const cast = castPortraits(pack, themeId, suspectIds, seed, greyscale);
  await Promise.all(
    cast.map(async (entry, i) => {
      if (!entry) return;
      const image = await embed(doc, pack, bakedPathFor(entry, greyscale));
      if (image) art.portraits.set(suspectIds[i]!, image);
    }),
  );

  const propNames = [...new Set(puzzle.floorPlan.landmarks.map((l) => l.name))];
  await Promise.all(
    propNames.map(async (name) => {
      const entry = resolveProp(pack, name, themeId, seed, greyscale);
      if (!entry) return;
      const image = await embed(doc, pack, bakedPathFor(entry, greyscale));
      if (image) art.props.set(name, image);
    }),
  );

  const slugs = puzzle.floorPlan.rooms.map((r) => roomTypeSlug(r.name));
  const floors = resolveFloors(pack, slugs, seed, greyscale);
  await Promise.all(
    floors.map(async (entry, i) => {
      if (!entry) return;
      const image = await embed(doc, pack, bakedPathFor(entry, greyscale));
      if (image) art.floors.set(i, image);
    }),
  );

  return art;
}

// ---------------------------------------------------------------------
// Drawing
// ---------------------------------------------------------------------

/**
 * How much of a cell a floor tile spans, in cells.
 *
 * The uploaded floors are photographic and finely grained — a mosaic
 * squeezed into a single half-inch cell reads as grey noise and fights
 * the grid it sits under. Spanning two cells halves the repeat frequency
 * and lets the pattern read as a floor rather than as texture. It must
 * stay a whole number of cells so every cell falls inside exactly one
 * tile, which is what makes the single-clip-per-cell draw below correct.
 */
const FLOOR_TILE_CELLS = 2;

/**
 * The wash laid over a floor image, as an opacity.
 *
 * The procedural textures are capped at 0.16 luminance deviation in
 * colour and 0.10 in greyscale, because a floor competing with the grid's
 * own ink makes a puzzle harder to read rather than nicer to look at. A
 * photograph arrives at full contrast with no such cap. So it is drawn
 * and then flooded, which collapses its range into roughly the band the
 * procedural cap allows.
 *
 * Flooded with the ROOM'S OWN FILL, not with white. Rooms are told apart
 * by hue first, and washing to paper would bleach that away — every room
 * would become the same off-white with a different photograph faintly
 * showing through. Washing to the room colour keeps the hue carrying the
 * identity and lets the photograph read as its texture.
 *
 * Both values were rendered and compared rather than reasoned about. At
 * 0.78 a colour page bleached grass to neutral grey — 22% of an image
 * with saturation 114 survives as about 25, which is no hue at all. At
 * 0.48 the pattern started competing with the seat rings. 0.62 keeps the
 * material readable with the grid still dominant.
 *
 * Greyscale went the other way from the assumption. The room greys span
 * only 0.05 luminance on their own, so a heavier wash there was making a
 * measured problem worse; at 0.70 the floor image supplies real value
 * separation between rooms, which is the one thing a black-ink interior
 * has to carry the plan with.
 */
export const FLOOR_WASH = { color: 0.62, grey: 0.7 } as const;

/**
 * Floor art strength as a publisher sets it: 0 hides the art entirely
 * (flat room fill), 1 draws it at full contrast with no wash at all.
 *
 * The defaults below are the wash values above expressed the other way
 * round, because "how much of the picture do I want" is the question
 * somebody actually has, and "how much paper am I flooding it with" is
 * not. Colour and greyscale are separate settings because they are
 * separate problems: colour is fighting the ink, greyscale is carrying
 * the whole plan by value.
 */
export const DEFAULT_FLOOR_STRENGTH = {
  color: 1 - FLOOR_WASH.color,
  grey: 1 - FLOOR_WASH.grey,
} as const;

/** Strength (what a publisher sets) to wash opacity (what the page draws). */
export function washFor(strength: number | undefined, greyscale: boolean): number {
  const fallback = greyscale ? DEFAULT_FLOOR_STRENGTH.grey : DEFAULT_FLOOR_STRENGTH.color;
  const s = Number.isFinite(strength) ? (strength as number) : fallback;
  return 1 - Math.max(0, Math.min(1, s));
}

/**
 * Paints one cell of a room's floor image.
 *
 * `origin` is the GRID origin, not the cell's — that is what makes the
 * tiling continuous across a room instead of restarting in every square,
 * the same contract paintTextureCell keeps.
 */
export function drawFloorCell(
  page: PDFPage,
  image: PDFImage,
  cell: { x: number; y: number; w: number; h: number },
  origin: { x: number; y: number },
  cellSize: number,
  greyscale: boolean,
  roomFill: ReturnType<typeof rgb>,
  /** Publisher's floor strength, 0..1. Omitted uses the measured default. */
  strength?: number,
): void {
  const tile = cellSize * FLOOR_TILE_CELLS;
  // Which tile this cell sits in, measured from the grid origin. Integer
  // cells per tile means a cell never straddles two tiles.
  const col = Math.floor((cell.x - origin.x) / tile + 1e-6);
  const row = Math.floor((cell.y - origin.y) / tile + 1e-6);

  page.pushOperators(
    pushGraphicsState(),
    moveTo(cell.x, cell.y),
    lineTo(cell.x + cell.w, cell.y),
    lineTo(cell.x + cell.w, cell.y + cell.h),
    lineTo(cell.x, cell.y + cell.h),
    closePath(),
    clip(),
    endPath(),
  );
  page.drawImage(image, {
    x: origin.x + col * tile,
    y: origin.y + row * tile,
    width: tile,
    height: tile,
  });
  // Flood so the photograph sits under the ink rather than beside it.
  // Drawn inside the clip so it never bleeds past the cell.
  page.drawRectangle({
    x: cell.x,
    y: cell.y,
    width: cell.w,
    height: cell.h,
    color: roomFill,
    opacity: washFor(strength, greyscale),
  });
  page.pushOperators(popGraphicsState());
}

/**
 * Draws a prop image centred in its cell.
 *
 * Real artwork earns more of the cell than the procedural glyph took
 * (0.62): these are drawings with their own margins, already trimmed to
 * their ink at bake time, so 0.78 lands them at about the same visual
 * weight without crowding the cell's border.
 */
export function drawPropImage(
  page: PDFPage,
  image: PDFImage,
  cx: number,
  cy: number,
  cellSize: number,
): void {
  const box = cellSize * 0.78;
  const scaled = image.scaleToFit(box, box);
  page.drawImage(image, {
    x: cx - scaled.width / 2,
    y: cy - scaled.height / 2,
    width: scaled.width,
    height: scaled.height,
  });
}

/** Draws a portrait into the suspect card's square slot. */
export function drawPortraitImage(
  page: PDFPage,
  image: PDFImage,
  x: number,
  y: number,
  size: number,
): void {
  const scaled = image.scaleToFit(size, size);
  page.drawImage(image, {
    // Centred in the slot: a trimmed cut-out is rarely square, and a
    // portrait pinned to a corner reads as a layout error.
    x: x + (size - scaled.width) / 2,
    y: y + (size - scaled.height) / 2,
    width: scaled.width,
    height: scaled.height,
  });
}
