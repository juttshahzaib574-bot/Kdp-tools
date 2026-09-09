import type { PDFFont, PDFPage, RGB } from "pdf-lib";
import { rgb } from "pdf-lib";
import { caseBriefFor, caseTitleFor, howToSolveFor } from "./case-titles";
import { renderTemplate, resolveNames } from "./text-template";
import { roomAt } from "./floor-plan";
import { drawPortrait, drawProp, drawRoundedRect, drawSeat, shapeForLandmark } from "./glyphs";
import { roomFill, type Palette } from "./palette";
import { paintTextureCell, surfacesForRooms, type TextureIntensity } from "./textures";
import type { BookFonts } from "./fonts";
import { guardPageBounds } from "./page-bounds";
import type { GridMysteryPuzzle } from "./types";
import { silentCardText, victimCardText } from "./verdict";
import { mulberry32 } from "./rng";
import { drawFloorCell, drawPortraitImage, drawPropImage, type PuzzleArt } from "./art-embed";
import { generateWalkthrough, formatWalkthroughForPrint } from "./walkthrough";
import { generateCertificationBadge, renderCertificationBadge } from "./certification";

// One puzzle, one page.
//
// The previous renderer spent FIVE pages on a single puzzle — grid,
// suspects, evidence, answer, key — by flowing everything through a
// generic top-to-bottom text writer. A reader had to flip back and forth
// between the grid and the clues to solve anything, which is the one
// thing a logic puzzle must never make you do, and the output read like a
// text file rather than a designed book page.
//
// This module lays a complete puzzle out with absolute placement instead:
// header, floor plan, suspect cards and evidence all visible at once. The
// page adapts — the grid takes whatever height is left after the text
// blocks are measured, so a 6x9 and an 8.5x11 both fill properly rather
// than one being padded and the other overflowing.

/**
 * Splits a word that is itself wider than the column.
 *
 * Word wrapping alone cannot save a line like a hyphen-free surname a
 * publisher typed into the rename field — there is no space to break at,
 * so the word runs off the page. Breaking mid-word is ugly, which is why
 * it only ever happens after wrapping has already failed.
 */
function breakLongWord(word: string, font: PDFFont, size: number, maxWidth: number): string[] {
  if (font.widthOfTextAtSize(word, size) <= maxWidth) return [word];
  const pieces: string[] = [];
  let piece = "";
  for (const char of word) {
    const candidate = piece + char;
    if (piece && font.widthOfTextAtSize(candidate, size) > maxWidth) {
      pieces.push(piece);
      piece = char;
    } else {
      piece = candidate;
    }
  }
  if (piece) pieces.push(piece);
  return pieces;
}

/**
 * Wraps text to a column, and guarantees no line exceeds it.
 *
 * The guarantee is the point: this used to let an over-long single word
 * through unbroken (there was nowhere to wrap, so it kept it), which put
 * text past the page margin — invisible in tests that only count pages,
 * and a trimmed-off word in the printed book. See page-bounds.ts for the
 * assertion that now catches this class of bug.
 */
function wrap(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (font.widthOfTextAtSize(candidate, size) <= maxWidth) {
      line = candidate;
      continue;
    }
    if (line) lines.push(line);
    const pieces = breakLongWord(word, font, size, maxWidth);
    // Every piece but the last is already full-width; the last one
    // becomes the line the next word tries to join.
    lines.push(...pieces.slice(0, -1));
    line = pieces[pieces.length - 1] ?? "";
  }
  if (line) lines.push(line);
  return lines;
}

/**
 * The largest size at which `text` fits `maxLines` lines of `maxWidth`.
 *
 * A case title is the one string on the page a publisher writes freely,
 * and a long one should shrink to fit its slot rather than either
 * overflowing or crowding out the floor plan. Shrinking stops at
 * `minSize` — below that a title stops reading as a heading, and
 * wrapping (with a mid-word break if it truly has to) takes over.
 */
/**
 * Trims text to fit a width, ending in an ellipsis.
 *
 * The last resort for a single-line slot that cannot grow and cannot
 * wrap — a suspect card's name line. Shrinking is tried first; this only
 * runs when even the smallest readable size doesn't fit.
 */
function ellipsize(text: string, font: PDFFont, size: number, maxWidth: number): string {
  if (font.widthOfTextAtSize(text, size) <= maxWidth) return text;
  let cut = text;
  while (cut.length > 1 && font.widthOfTextAtSize(`${cut}…`, size) > maxWidth) {
    cut = cut.slice(0, -1);
  }
  return `${cut}…`;
}

function fitTextSize(
  text: string,
  font: PDFFont,
  maxSize: number,
  minSize: number,
  maxWidth: number,
  maxLines: number,
): number {
  for (let size = maxSize; size > minSize; size -= 0.5) {
    if (wrap(text, font, size, maxWidth).length <= maxLines) return size;
  }
  return minSize;
}

function formatHeight(inches: number): string {
  return `${Math.floor(inches / 12)}'${inches % 12}"`;
}

/**
 * Picks where a room's name is printed, and how many cells it may span.
 *
 * Exported because this has now been the source of two visible defects —
 * a name running across the plan border, and a name printing straight
 * through a furniture glyph — and both are far easier to pin as a unit
 * test than to catch by eye in a rendered page.
 *
 * The returned `run` counts cells the label may occupy: it stops at the
 * room boundary AND at the first cell holding a prop.
 */
export function chooseLabelAnchor(
  cells: readonly { row: number; col: number }[],
  hasProp: (row: number, col: number) => boolean,
): { anchor: { row: number; col: number }; run: number } {
  const inRoom = new Set(cells.map((c) => `${c.row},${c.col}`));
  let anchor = cells[0]!;
  let anchorRun = 0;
  let anchorClean = false;
  for (const c of [...cells].sort((a, b) => a.row - b.row || a.col - b.col)) {
    let run = 0;
    while (inRoom.has(`${c.row},${c.col + run}`) && !hasProp(c.row, c.col + run)) run++;
    const clean = !hasProp(c.row, c.col);
    const better = (clean && !anchorClean) || (clean === anchorClean && run > anchorRun);
    if (better) {
      anchor = c;
      anchorRun = run;
      anchorClean = clean;
    }
  }
  return { anchor, run: anchorRun };
}

export interface PuzzlePageBox {
  /** Left edge of the content area, already gutter-aware. */
  x: number;
  /** Bottom edge of the content area. */
  y: number;
  width: number;
  height: number;
}

/**
 * Draws the floor plan: room fills, room-boundary borders that are heavy
 * only where two different rooms meet, seat tokens and prop glyphs.
 *
 * Room *names* are printed inside the plan (at each room's top-left cell)
 * rather than in a legend, and props are drawn as little pictures rather
 * than numbers keyed to a list underneath — both changes remove a lookup
 * the reader previously had to do on every single clue.
 */
function drawFloorPlan(
  page: PDFPage,
  puzzle: GridMysteryPuzzle,
  fonts: BookFonts,
  palette: Palette,
  originX: number,
  topY: number,
  cell: number,
  textureSeed: number,
  textureIntensity: TextureIntensity,
  /** Embedded artwork for this page. Anything absent stays procedural. */
  art: PuzzleArt | undefined,
  floorStrength: number | undefined,
): void {
  const { size, rooms, occupyMask, landmarks } = puzzle.floorPlan;
  const roomIndexAt = (row: number, col: number) =>
    rooms.findIndex((r) => r.cells.some((c) => c.row === row && c.col === col));
  const cellX = (col: number) => originX + col * cell;
  const cellY = (row: number) => topY - (row + 1) * cell;

  // Axis numerals, in the display face so they read as labels not content.
  const axisSize = Math.max(6, Math.min(9, cell * 0.3));
  for (let i = 0; i < size; i++) {
    const label = String(i + 1);
    const w = fonts.display.widthOfTextAtSize(label, axisSize);
    page.drawText(label, {
      x: cellX(i) + cell / 2 - w / 2,
      y: topY + 4,
      size: axisSize,
      font: fonts.display,
      color: palette.inkFaint,
    });
    page.drawText(label, {
      x: originX - 6 - fonts.display.widthOfTextAtSize(label, axisSize),
      y: cellY(i) + cell / 2 - axisSize * 0.35,
      size: axisSize,
      font: fonts.display,
      color: palette.inkFaint,
    });
  }

  // Room fills first, then that room's SURFACE on top of the fill — both
  // beneath every stroke, seat and prop that follows.
  //
  // The surface is chosen semantically from the room's name (a tool shed
  // gets stone, a pantry gets tile) and seeded from the book, so the same
  // room is the same material in every book but a visibly different
  // instance of it — which is what varies the page's perceptual hash
  // between exports without ever making a room look wrong for its name.
  //
  // Assigned for the whole plan at once, not room by room: no two rooms
  // on a page may share a material, and satisfying that needs to be
  // decided across the set (see surfacesForRooms).
  const surfaces = surfacesForRooms(rooms.map((room) => room.name), textureSeed);
  for (let row = 0; row < size; row++) {
    for (let col = 0; col < size; col++) {
      const idx = roomIndexAt(row, col);
      const safeIdx = idx < 0 ? 0 : idx;
      const fill = roomFill(palette, safeIdx);
      const x = cellX(col);
      const y = cellY(row);
      page.drawRectangle({ x, y, width: cell, height: cell, color: fill });
      const floorImage = art?.floors.get(safeIdx);
      if (floorImage) {
        // Real floor art replaces the procedural surface entirely — the
        // two together would be a photograph with a pattern drawn on it.
        drawFloorCell(
          page,
          floorImage,
          { x, y, w: cell, h: cell },
          { x: originX, y: topY - size * cell },
          cell,
          palette.greyscale,
          fill,
          floorStrength,
        );
      }
      const surface = floorImage ? undefined : surfaces[safeIdx];
      if (surface) {
        // The clip is this cell; the pattern origin is the GRID origin,
        // so a bond or weave runs continuously across the whole room
        // instead of restarting in every square.
        paintTextureCell(
          page,
          { x, y, w: cell, h: cell },
          { x: originX, y: topY - size * cell },
          surface,
          fill,
          palette,
          textureIntensity,
        );
      }
    }
  }

  // Hairline cell grid — enough to count squares by, quiet enough not to
  // compete with the room boundaries.
  for (let i = 0; i <= size; i++) {
    page.drawLine({
      start: { x: originX, y: topY - i * cell },
      end: { x: originX + size * cell, y: topY - i * cell },
      thickness: 0.25,
      color: palette.rule,
    });
    page.drawLine({
      start: { x: cellX(i), y: topY },
      end: { x: cellX(i), y: topY - size * cell },
      thickness: 0.25,
      color: palette.rule,
    });
  }

  // Heavy strokes only where the room changes (or at the plan's edge) —
  // this is what makes the irregular polyomino rooms actually legible as
  // rooms rather than as coloured patches.
  const heavy = 1.6;
  for (let row = 0; row < size; row++) {
    for (let col = 0; col < size; col++) {
      const here = roomIndexAt(row, col);
      const x0 = cellX(col);
      const y0 = cellY(row);
      const edge = (
        ax: number,
        ay: number,
        bx: number,
        by: number,
        otherRow: number,
        otherCol: number,
      ) => {
        const outside =
          otherRow < 0 || otherRow >= size || otherCol < 0 || otherCol >= size;
        if (!outside && roomIndexAt(otherRow, otherCol) === here) return;
        page.drawLine({
          start: { x: ax, y: ay },
          end: { x: bx, y: by },
          thickness: heavy,
          color: palette.ruleStrong,
        });
      };
      edge(x0, y0 + cell, x0 + cell, y0 + cell, row - 1, col); // top
      edge(x0, y0, x0 + cell, y0, row + 1, col); // bottom
      edge(x0, y0, x0, y0 + cell, row, col - 1); // left
      edge(x0 + cell, y0, x0 + cell, y0 + cell, row, col + 1); // right
    }
  }

  // Door gaps — SHIGAI GRAMMAR ADOPTION v1: 1-cell doorway gaps between connected rooms.
  // Doors are placed on shared boundaries where rooms meet (from puzzle.floorPlan.doors).
  if (puzzle.floorPlan.doors && puzzle.floorPlan.doors.length > 0) {
    const doorGapColor = palette.greyscale ? rgb(0.9, 0.9, 0.9) : rgb(1, 0.95, 0.85); // Light cream for door gap
    for (const door of puzzle.floorPlan.doors) {
      const x = cellX(door.col);
      const y = cellY(door.row);
      // Draw a light rectangle to represent the door gap (no wall line through it)
      page.drawRectangle({
        x,
        y,
        width: cell,
        height: cell,
        color: doorGapColor,
      });
      // Optional: add a subtle door arc or threshold line
      page.drawLine({
        start: { x: x + cell * 0.3, y: y + cell },
        end: { x: x + cell * 0.7, y: y + cell },
        thickness: 0.5,
        color: palette.ruleFaint,
      });
    }
  }

  // Room names, placed inside each room.
  //
  // Naive "top-left cell of the room" placement produced two visible
  // defects: a long name anchored near the right edge ran across the plan
  // border, and a name anchored on a prop cell printed straight through
  // the glyph. So the anchor is chosen for the horizontal RUN of room
  // cells it starts (widest run wins, prop cells avoided), the type size
  // is shrunk to fit that run, and a backing plate is painted behind the
  // text so it stays readable over any fill it lands on.
  const landmarkKeys = new Set(landmarks.map((l) => `${l.cell.row},${l.cell.col}`));
  const baseNameSize = Math.max(4.4, Math.min(7.2, cell * 0.24));
  for (const room of rooms) {
    const { anchor, run } = chooseLabelAnchor(room.cells, (r, c) =>
      landmarkKeys.has(`${r},${c}`),
    );
    const anchorRun = run;

    const label = room.name.toUpperCase();
    // A room whose every cell carries a prop would give a zero run; fall
    // back to one cell rather than truncating the name to nothing.
    const runWidth = Math.max(1, anchorRun) * cell - 4;
    let nameSize = baseNameSize;
    while (
      nameSize > 3.9 &&
      fonts.displayBold.widthOfTextAtSize(label, nameSize) > runWidth
    ) {
      nameSize -= 0.2;
    }
    let text = label;
    // Still too wide even at the floor size (a one-cell-wide room with a
    // long name): fall back to the first word, then to an initial.
    if (fonts.displayBold.widthOfTextAtSize(text, nameSize) > runWidth) {
      text = label.split(" ")[0]!;
      if (fonts.displayBold.widthOfTextAtSize(text, nameSize) > runWidth) {
        text = text.slice(0, Math.max(1, Math.floor(runWidth / (nameSize * 0.62))));
      }
    }

    const textW = fonts.displayBold.widthOfTextAtSize(text, nameSize);
    // CENTRED over the run the label was measured against, not pinned to
    // the anchor cell's left edge.
    //
    // Left-pinning is why the pills looked dropped rather than placed: a
    // short name in a wide room sat hard against one wall with a gulf of
    // floor beside it, and the plate never lined up with the room it was
    // naming. Centring costs one subtraction and is most of the
    // difference between a name tag and a sticker.
    const runCentre = cellX(anchor.col) + (runWidth + 4) / 2;
    const x = Math.max(
      originX + 2,
      Math.min(runCentre - textW / 2, originX + size * cell - textW - 2),
    );
    const ty = cellY(anchor.row) + cell - nameSize - 2.5;
    // A pill, not a bare word on the floor.
    //
    // The label used to be text over a patch of room fill, which left it
    // looking like it had been dropped on the plan rather than placed on
    // it. A light plate with a rounded outline reads as a name tag: it
    // separates the label from the texture underneath, survives any fill
    // it lands on, and is most of the difference between a page that
    // looks generated and one that looks designed.
    const padX = 3.2;
    const padY = 1.8;
    drawRoundedRect(page, {
      x: x - padX,
      y: ty - padY,
      width: textW + padX * 2,
      height: nameSize + padY * 2,
      radius: (nameSize + padY * 2) / 2,
      fill: palette.labelPill,
      border: palette.rule,
      borderWidth: 0.5,
      // Slightly translucent so the floor it sits on still reads through.
      // Fully opaque, a pill punches a white hole in the artwork; at 0.88
      // it reads as a plate laid on the floor, which is what it is.
      opacity: 0.88,
    });
    page.drawText(text, {
      x,
      y: ty,
      size: nameSize,
      font: fonts.displayBold,
      color: palette.ink,
    });
  }

  // Props only — SHIGAI GRAMMAR ADOPTION v1: NO seat discs.
  // OPEN-MAJORITY means every cell is open unless blocked by a prop.
  const landmarkAt = new Map(landmarks.map((l) => [`${l.cell.row},${l.cell.col}`, l]));
  for (let row = 0; row < size; row++) {
    for (let col = 0; col < size; col++) {
      const cx = cellX(col) + cell / 2;
      const cy = cellY(row) + cell / 2;
      const landmark = landmarkAt.get(`${row},${col}`);
      if (landmark) {
        // Apply size class scaling: L=90%, M=70%, S=50% of cell size
        const sizeClass = landmark.sizeClass ?? "M";
        const scaleFactor = sizeClass === "L" ? 0.90 : sizeClass === "M" ? 0.70 : 0.50;
        const scaledSize = cell * scaleFactor;
        const propImage = art?.props.get(landmark.name);
        if (propImage) {
          drawPropImage(page, propImage, cx, cy, scaledSize);
        } else {
          drawProp(
            { page, cx, cy, size: scaledSize, ink: palette.ink, fill: palette.propFill },
            shapeForLandmark(landmark.name),
          );
        }
      }
      // No seat discs drawn — OPEN-MAJORITY grammar removes them entirely
    }
  }
}

/**
 * The terms a reader navigates a clue by, for emphasis.
 *
 * Room names, object names and ordinals ("5th column", "3rd row") are
 * what someone's eye jumps between while working a puzzle — everything
 * else in the sentence is connective tissue. A flat grey paragraph makes
 * them hunt for those words; bolding them turns the clue into something
 * scannable, which is most of the difference between our card and a
 * published one.
 *
 * Derived at draw time from the puzzle's own vocabulary rather than
 * marked up in the clue templates, so no clue family had to change and
 * a new phrasing gets the treatment for free.
 */
function keyTerms(puzzle: GridMysteryPuzzle): string[] {
  const terms = new Set<string>();
  for (const room of puzzle.floorPlan.rooms) terms.add(room.name);
  for (const landmark of puzzle.floorPlan.landmarks) terms.add(landmark.name);
  for (const object of Object.values(puzzle.objects)) terms.add(object);
  // Longest first, so "Vegetable Garden" wins over "Garden".
  return [...terms].filter((t) => t.length > 2).sort((a, b) => b.length - a.length);
}

interface TextRun {
  text: string;
  bold: boolean;
}

/** Ordinal positions — "5th column", "3rd row", "2nd-tallest". */
const ORDINAL = /\b\d+(?:st|nd|rd|th)\b(?:[-\s](?:column|row|tallest|shortest))?/gi;

/** Splits a sentence into plain and emphasised runs. */
function splitRuns(text: string, terms: readonly string[]): TextRun[] {
  const marks: { start: number; end: number }[] = [];
  const claim = (start: number, end: number) => {
    if (marks.some((m) => start < m.end && end > m.start)) return;
    marks.push({ start, end });
  };
  for (const term of terms) {
    let from = 0;
    for (;;) {
      const at = text.indexOf(term, from);
      if (at === -1) break;
      claim(at, at + term.length);
      from = at + term.length;
    }
  }
  for (const match of text.matchAll(ORDINAL)) {
    if (match.index === undefined) continue;
    claim(match.index, match.index + match[0].length);
  }
  marks.sort((a, b) => a.start - b.start);

  const runs: TextRun[] = [];
  let cursor = 0;
  for (const mark of marks) {
    if (mark.start > cursor) runs.push({ text: text.slice(cursor, mark.start), bold: false });
    runs.push({ text: text.slice(mark.start, mark.end), bold: true });
    cursor = mark.end;
  }
  if (cursor < text.length) runs.push({ text: text.slice(cursor), bold: false });
  return runs;
}

/** Wraps runs to a column, keeping each fragment's weight. */
function wrapRuns(
  runs: readonly TextRun[],
  regular: PDFFont,
  bold: PDFFont,
  size: number,
  maxWidth: number,
): TextRun[][] {
  const lines: TextRun[][] = [];
  let line: TextRun[] = [];
  let width = 0;
  // A line may only break where a WORD starts. Runs split at formatting
  // boundaries, not at spaces, so the full stop after a bold phrase is
  // its own piece with no whitespace before it — and breaking there put a
  // lone "." on the next line under "...had the riding crop". Whether a
  // piece may start a line is a property of the text, not of the run it
  // happens to sit in.
  let atWordStart = true;
  for (const run of runs) {
    const font = run.bold ? bold : regular;
    for (const piece of run.text.split(/(\s+)/)) {
      if (!piece) continue;
      const isSpace = !piece.trim();
      const pieceWidth = font.widthOfTextAtSize(piece, size);
      if (width + pieceWidth > maxWidth && line.length > 0 && !isSpace && atWordStart) {
        lines.push(line);
        line = [];
        width = 0;
      }
      if (isSpace && line.length === 0) {
        atWordStart = true;
        continue;
      }
      line.push({ text: piece, bold: run.bold });
      width += pieceWidth;
      atWordStart = isSpace;
    }
  }
  if (line.length > 0) lines.push(line);
  return lines;
}

/** Draws one wrapped line of runs, returning nothing — the caller owns the cursor. */
function drawRuns(
  page: PDFPage,
  line: readonly TextRun[],
  x: number,
  y: number,
  size: number,
  regular: PDFFont,
  bold: PDFFont,
  color: RGB,
): void {
  let cursor = x;
  for (const run of line) {
    const font = run.bold ? bold : regular;
    page.drawText(run.text, { x: cursor, y, size, font, color });
    cursor += font.widthOfTextAtSize(run.text, size);
  }
}

/**
 * The suspect portrait's print size, in points, and how far it may shrink.
 *
 * 32pt is 0.45in — set after proofing real artwork at true size, where
 * 0.29in read as "somebody is here" rather than as who, and the measured
 * competitor prints between 0.38in and 0.45in.
 *
 * 24pt (0.33in) is the floor. Below that the artwork stops paying for the
 * space it takes, so a page that still cannot fit its cards gives the
 * grid whatever is left instead of shrinking the faces into uselessness.
 */
const MAX_PORTRAIT = 32;
const MIN_PORTRAIT = 24;

/**
 * Clue type, and how far it may shrink.
 *
 * 6.9pt is the floor: below that a printed clue stops being comfortable
 * at arm's length, and the point of winning grid area is a page somebody
 * can actually work. It is only reached on the hardest combination the
 * tool offers — the smallest trim, the largest grid, eight cards each
 * carrying a clue — and it is what stops that page printing a 5mm cell.
 */
const MAX_BODY = 7.6;
const MIN_BODY = 6.9;

/**
 * The share of the content column the floor plan is entitled to before
 * the cards get any.
 *
 * Measured before this existed: 29.8% of page height at 6x9, 41.9% at
 * 7x10, 47.2% at 8.5x11 — the grid was the residual, so the smallest trim
 * got the smallest puzzle. 0.44 of the content column brings 6x9 up
 * without starving the cards at the larger trims, where they already fit
 * inside their share.
 */
const MIN_GRID_SHARE = 0.44;

/**
 * Card chrome: the corner radius when rounded corners are chosen, the gap
 * between rows, and the padding above and below the clue text.
 *
 * Charged eight times on a page and again on every page of the book, so a
 * point of slack here is most of an inch of floor plan at 6x9. It was
 * 15pt above the clue text and 7pt below, with the portrait sitting in a
 * `portrait + 10` well; those are tightened to what the type actually
 * needs, which is what stops the cards reading as oversized boxes with a
 * lot of air in them.
 */
const CARD_RADIUS = 4;
const CARD_ROW_GAP = 3.5;
const CARD_HEAD = 13;
const CARD_FOOT = 5;
const CARD_PORTRAIT_WELL = 6;

/** Measured height of one suspect card at a given width. */
function suspectCardHeight(
  clueLines: number,
  bodySize: number,
  lineHeight: number,
  minHeight: number,
): number {
  return Math.max(minHeight, CARD_HEAD + clueLines * lineHeight + CARD_FOOT);
}

/**
 * What one page actually gave each of its parts, in points.
 *
 * Returned so the split can be ASSERTED rather than eyeballed. The floor
 * plan is the product and everything else on the page supports it, but
 * for a long time the plan was whatever the text blocks left over — 29.8%
 * of page height at 6x9 against 47.2% at 8.5x11, so the smallest trim,
 * where a readable grid matters most, got the smallest puzzle. A number
 * nobody measures is a number that drifts, so layout.test.ts holds every
 * trim to a floor using these.
 */
export interface PuzzleLayoutMetrics {
  /** Side of the square floor plan. */
  gridSide: number;
  /** One cell of it — the size a solver actually writes in. */
  cellSize: number;
  /** Portrait size the cards settled on after stepping down for the grid. */
  portrait: number;
  /** Height of the content column the page had to divide up. */
  contentHeight: number;
  /** Title through method panel: everything above the plan. */
  headerHeight: number;
  /** All suspect card rows, including the gaps between them. */
  cardsHeight: number;
}

/**
 * Renders one complete puzzle onto one page.
 *
 * The caller owns page creation, so this can be used by the book compiler
 * and the single-puzzle preview alike; it returns how the page divided
 * itself up so the division can be tested.
 */
export function drawPuzzlePage(
  rawPage: PDFPage,
  puzzle: GridMysteryPuzzle,
  fonts: BookFonts,
  palette: Palette,
  box: PuzzlePageBox,
  label?: string,
  options: {
    /** Varies which surface instance each room gets. Same book, same look. */
    textureSeed?: number;
    textureIntensity?: TextureIntensity;
    /** Overrides the puzzle's own case title — used to break ties within a book. */
    caseTitle?: string;
    /**
     * An optional line under the title. Purely presentational — the
     * publisher's own subtitle for this case, drawn only when set, so a
     * book that never touches it lays out exactly as it always has.
     */
    caseSubtitle?: string;
    /**
     * Real artwork for this page, already embedded. Every slot is
     * optional: anything absent falls back to the procedural drawing, so
     * a half-filled art pack improves the pages it can rather than
     * blocking the book.
     */
    art?: PuzzleArt;
    /**
     * How strongly floor artwork is drawn, 0..1. Omitted uses the
     * default measured in art-embed.ts.
     */
    floorStrength?: number;
    /** Suspect-card corner style. Defaults to rounded. */
    cardCorners?: "rounded" | "square";
    /**
     * Whether to include walkthrough and certification badge on the page.
     * For publisher review cards and answer key pages. Defaults to false.
     */
    includeReviewMaterials?: boolean;
  } = {},
): PuzzleLayoutMetrics {
  const textureSeed = options.textureSeed ?? 1;
  const cardCorners = options.cardCorners ?? "rounded";
  const textureIntensity = options.textureIntensity ?? "normal";
  const includeReviewMaterials = options.includeReviewMaterials ?? false;
  // Outside production, every draw below is checked against the content
  // box and throws if it crosses it. Print layout fails silently
  // otherwise — see page-bounds.ts.
  const page = guardPageBounds(rawPage, box, "puzzle page");
  const right = box.x + box.width;
  const top = box.y + box.height;
  let y = top;

  const victim = puzzle.suspects.find((s) => s.id === puzzle.victimSuspectId);

  // ---- Header: title left, difficulty badge right ----
  const titleMaxSize = Math.min(17, box.width * 0.045);
  // Each puzzle carries its OWN case title, derived from its victim,
  // room and weapon — see case-titles.ts for why thirty identical
  // headings were a problem. `caseTitle` lets the book compiler override
  // it to resolve a collision within one book.
  // Suspect names live in ONE map and are substituted into every stored
  // template here — clue text, evidence notes and the case title all go
  // through it, so a rename is a single map edit with no regeneration.
  const names = resolveNames(puzzle.suspects);
  const terms = keyTerms(puzzle);
  const heading = renderTemplate(options.caseTitle ?? caseTitleFor(puzzle), names);
  const title = label ? `${label} · ${heading}` : heading;

  const badgeText = puzzle.difficulty.toUpperCase();
  const badgeSize = 7.5;
  const badgeW = fonts.displayBold.widthOfTextAtSize(badgeText, badgeSize) + 14;
  const badgeH = 15;
  page.drawRectangle({
    x: right - badgeW,
    y: y - badgeH,
    width: badgeW,
    height: badgeH,
    color: palette.accent,
  });
  page.drawText(badgeText, {
    x: right - badgeW + 7,
    y: y - badgeH + 4.8,
    size: badgeSize,
    font: fonts.displayBold,
    color: palette.accentInk,
  });

  // The title shrinks before it wraps, and wraps before it overflows.
  // It is the one string on this page a publisher writes freely (see the
  // Customize tab), so it has to survive anything they type — including
  // a name with no spaces in it — at every trim size.
  const titleWidth = box.width - badgeW - 12;
  const titleSize = fitTextSize(title, fonts.displayBold, titleMaxSize, 9, titleWidth, 2);
  for (const line of wrap(title, fonts.displayBold, titleSize, titleWidth)) {
    page.drawText(line, {
      x: box.x,
      y: y - titleSize,
      size: titleSize,
      font: fonts.displayBold,
      color: palette.ink,
    });
    y -= titleSize * 1.18;
  }
  y -= 5;

  // ---- Publisher's subtitle, when they've set one ----
  // Tokens are resolved here too: a subtitle may name a suspect, and a
  // rename has to reach it like every other surface.
  const subtitle = options.caseSubtitle?.trim();
  if (subtitle) {
    const subSize = 8.6;
    for (const line of wrap(renderTemplate(subtitle, names), fonts.bodyItalic, subSize, box.width)) {
      page.drawText(line, {
        x: box.x,
        y: y - subSize,
        size: subSize,
        font: fonts.bodyItalic,
        color: palette.inkSoft,
      });
      y -= subSize * 1.25;
    }
    y -= 4;
  }

  // ---- The hook: what happened, in one line ----
  //
  // This used to be the "case brief" — one italic paragraph carrying the
  // story AND the rules together. Nobody reads rules set as prose: they
  // are skimmed on page one and unfindable on page nineteen, which is
  // exactly the gap against the competitor, whose page puts the method in
  // its own labelled block directly under the heading. So the mechanics
  // moved into the panel below and this line kept the story.
  const briefSize = 8.2;
  const briefLead = briefSize * 1.34;
  const brief = renderTemplate(caseBriefFor(puzzle), names);
  for (const line of wrap(brief, fonts.bodyItalic, briefSize, box.width)) {
    page.drawText(line, {
      x: box.x,
      y: y - briefSize,
      size: briefSize,
      font: fonts.bodyItalic,
      color: palette.inkSoft,
    });
    y -= briefLead;
  }
  y -= 5;

  // ---- The method panel: how to solve, and what the board means ----
  //
  // One block, in the same place on every page, carrying the three things
  // a solver needs before they can start: the rules of the grid, the rule
  // that names the murderer, and the key to the two kinds of square.
  //
  // The board key used to sit on its own line above the plan and the
  // rules were buried in the italic paragraph above. Folding both into
  // one panel is what pays for the panel: measured against the old
  // brief-plus-legend it costs about six points of page height, not the
  // thirty a separate rules block would have.
  //
  // The label sits on the left of the top row and the key on the right of
  // it, so the row that names the section also carries the legend rather
  // than spending a whole line on two words.
  const methodSize = 6.9;
  const methodLead = methodSize * 1.3;
  const methodPadX = 7;
  const methodPadY = 6;
  const numberW = 9;
  const steps = howToSolveFor(puzzle, textureSeed).map((s) => renderTemplate(s, names));
  const stepLines = steps.map((s) =>
    wrap(s, fonts.body, methodSize, box.width - methodPadX * 2 - numberW),
  );
  const stepCount = stepLines.reduce((n, l) => n + l.length, 0);

  // The key's icons are sized from the panel's OWN type, not from a grid
  // cell. Sizing them from the cell is what once painted a 42pt circle
  // over the 6pt word it was labelling at 8.5x11.
  const keySize = 6.2;
  const keyIcon = keySize * 1.9;
  const keyGap = 3;
  const headRowH = Math.max(keyIcon, 9);

  const methodH = methodPadY * 2 + headRowH + 4 + stepCount * methodLead;
  const methodY = y - methodH;
  if (cardCorners === "rounded") {
    drawRoundedRect(page, {
      x: box.x,
      y: methodY,
      width: box.width,
      height: methodH,
      radius: CARD_RADIUS,
      fill: palette.cardBg,
      border: palette.rule,
      borderWidth: 0.6,
    });
  } else {
    page.drawRectangle({
      x: box.x,
      y: methodY,
      width: box.width,
      height: methodH,
      color: palette.cardBg,
      borderWidth: 0.6,
      borderColor: palette.rule,
    });
  }
  // A rail rather than a heavier border: it marks the block as apparatus
  // without giving it the visual weight of the suspect cards, which are
  // the things on this page a reader actually works with.
  page.drawRectangle({
    x: box.x,
    y: methodY,
    width: 2,
    height: methodH,
    color: palette.accent,
  });

  const headMid = y - methodPadY - headRowH / 2;
  page.drawText("HOW TO SOLVE", {
    x: box.x + methodPadX,
    y: headMid - keySize * 0.36,
    size: keySize,
    font: fonts.displayBold,
    color: palette.accent,
  });

  // ---- The board key (COMPLETE LEGEND) — right-aligned on the label's row ----
  //
  // SHIGAI GRAMMAR ADOPTION v1: COMPLETE legend listing EVERY prop on the board.
  // CAN OCCUPY ✅ = floor cells (no seat disc icon needed — all cells are open by default)
  // BLOCKED ❌ = every prop/landmark name listed explicitly with size class indicator
  const allPropNames = [...new Set(puzzle.floorPlan.landmarks.map((l) => l.name))];
  const openLabel = "CAN OCCUPY ✅";
  const blockedLabel = "BLOCKED ❌";
  
  // Calculate width needed for complete legend
  const keyIcon = 9;
  const keyGap = 4;
  const openWidth = fonts.displayBold.widthOfTextAtSize(openLabel, keySize);
  const blockedWidth = fonts.displayBold.widthOfTextAtSize(blockedLabel, keySize);
  const propsWidth = allPropNames.length * (keyIcon + 8); // Extra space for size indicator
  const keyWidth = openWidth + keyGap + propsWidth + keyGap + blockedWidth;
  
  const labelRight =
    box.x + methodPadX + fonts.displayBold.widthOfTextAtSize("HOW TO SOLVE", keySize) + 12;
  let keyX = right - methodPadX - keyWidth;
  
  // CAN OCCUPY ✅ label (no icon — all floor cells are open by default in OPEN-MAJORITY)
  page.drawText(openLabel, {
    x: keyX,
    y: headMid - keySize * 0.36,
    size: keySize,
    font: fonts.displayBold,
    color: palette.inkSoft,
  });
  keyX += openWidth + keyGap;
  
  // List EVERY prop name under BLOCKED ❌ with size class indicator
  for (const landmark of puzzle.floorPlan.landmarks) {
    const propImage = options.art?.props.get(landmark.name);
    if (propImage) {
      drawPropImage(page, propImage, keyX + keyIcon / 2, headMid, keyIcon / 0.78);
    } else {
      drawProp(
        {
          page,
          cx: keyX + keyIcon / 2,
          cy: headMid,
          size: keyIcon,
          ink: palette.ink,
          fill: palette.propFill,
        },
        shapeForLandmark(landmark.name),
      );
    }
    keyX += keyIcon + 2;
    // Add size class indicator: L/M/S subscript
    const sizeClass = landmark.sizeClass ?? "M";
    page.drawText(sizeClass, {
      x: keyX,
      y: headMid - keySize * 0.2,
      size: keySize * 0.7,
      font: fonts.displayBold,
      color: palette.inkSoft,
    });
    keyX += 6;
  }
  
  page.drawText(blockedLabel, {
    x: keyX,
    y: headMid - keySize * 0.36,
    size: keySize,
    font: fonts.displayBold,
    color: palette.inkSoft,
  });

  let stepY = y - methodPadY - headRowH - 4 - methodSize;
  stepLines.forEach((lines, i) => {
    page.drawText(`${i + 1}`, {
      x: box.x + methodPadX,
      y: stepY,
      size: methodSize,
      font: fonts.displayBold,
      color: palette.accent,
    });
    for (const line of lines) {
      page.drawText(line, {
        x: box.x + methodPadX + numberW,
        y: stepY,
        size: methodSize,
        font: fonts.body,
        color: palette.ink,
      });
      stepY -= methodLead;
    }
  });
  y = methodY - 7;
  const headerHeight = top - y;
  // ---- Measure the text blocks, so the grid can claim the remainder ----
  // Clue type steps down too, after the portrait has given all it can.
  //
  // This was "not a lever" on the grounds that shrinking clue text trades
  // a readable puzzle for a bigger one. Measured, that principle produced
  // a 14.9pt cell at 6x9 on an 8x8 Extreme — under 5.3mm, which is not a
  // square a reader can put a pencil mark in. The clue column at that
  // trim is about 33 characters wide, so every clue wraps to three lines
  // and eight cards eat 199 of 594 points before the plan gets any.
  //
  // 7.6pt to 6.9pt is a narrow band on purpose: it buys back roughly a
  // line per card without going below what a puzzle book prints. The
  // portrait still gives ground first, because it is decoration standing
  // next to information.
  let bodySize = MAX_BODY;
  let lineHeight = bodySize * 1.28;
  const colGap = 9;
  const cardW = (box.width - colGap) / 2;

  const cardPadX = 6;
  // 32pt = 0.45in at print. Raised from 21pt (0.29in) after proofing the
  // real artwork at true size: at 0.29in a portrait reads as "somebody is
  // here" and not as who, which wastes the one thing artwork is for. The
  // measured competitor prints between 0.38in and 0.45in, so this sits at
  // the top of the range rather than below the bottom of it.
  //
  // It is not free — a wider portrait narrows the clue column beside it,
  // which wraps more lines and makes every card taller. The page-bounds
  // guard covers that at every trim size; see page-bounds.test.ts.
  //
  // Sizing is now a RESULT of the grid's budget rather than an input to
  // it. The page used to measure cards at a fixed 32pt portrait and hand
  // the floor plan whatever was left; measured, that gave the grid 29.8%
  // of the page height at 6x9 against 47.2% at 8.5x11, so the smallest
  // trim — where a solver most needs a readable grid — got the worst one.
  // The grid is the product and the cards support it, so the grid claims
  // its share first and the cards step down to fit.
  let portrait = MAX_PORTRAIT;
  let clueW = cardW - cardPadX * 2 - portrait - 5;

  // Wording for the two cards that are not clues. Seeded from the
  // puzzle's own facts rather than the render call, so the same puzzle
  // prints the same words on a re-render but two puzzles in one book do
  // not print the same sentence — which is exactly what the single
  // hardcoded victim line used to do, thirty times per interior.
  const cardRng = mulberry32(
    (puzzle.victimSuspectId.length * 2654435761 +
      puzzle.crimeRoomName.length * 40503 +
      puzzle.murderWeapon.length * 977) >>>
      0,
  );
  const victimLine = victimCardText(puzzle.verdict, cardRng);

  const measureCards = () =>
    puzzle.suspects.map((s) => {
      const isVictim = s.id === puzzle.victimSuspectId;
      const texts = isVictim
        ? [victimLine]
        : puzzle.clues.filter((c) => c.suspectId === s.id).map((c) => c.text);
      const lines = (texts.length ? texts : [silentCardText(cardRng)]).flatMap((t) =>
        wrapRuns(
          splitRuns(renderTemplate(t, names), terms),
          fonts.body,
          fonts.bodyBold,
          bodySize,
          clueW,
        ),
      );
      return { suspect: s, isVictim, lines };
    });

  const rowCount = Math.ceil(puzzle.suspects.length / 2);
  const heightsFor = (metrics: ReturnType<typeof measureCards>) => {
    const rows: number[] = [];
    for (let r = 0; r < rowCount; r++) {
      const a = metrics[r * 2];
      const b = metrics[r * 2 + 1];
      rows.push(
        Math.max(
          a ? suspectCardHeight(a.lines.length, bodySize, lineHeight, portrait + CARD_PORTRAIT_WELL) : 0,
          b ? suspectCardHeight(b.lines.length, bodySize, lineHeight, portrait + CARD_PORTRAIT_WELL) : 0,
        ),
      );
    }
    return rows;
  };

  let cardMetrics = measureCards();
  let rowHeights = heightsFor(cardMetrics);
  let cardsHeight = rowHeights.reduce((sum, h) => sum + h, 0) + (rowCount - 1) * CARD_ROW_GAP;

  // Evidence panel measurement.
  const evSize = 7.2;
  const evLead = evSize * 1.3;
  const objects = puzzle.suspects
    .map((s) => puzzle.objects[s.id])
    .filter((o): o is string => Boolean(o))
    .sort((a, b) => a.localeCompare(b));
  const evHeaderH = 13;
  const evObjectLines = wrap(objects.join("  ·  "), fonts.bodyBold, evSize, box.width - 14);
  // Two columns, split by CLUE — not by wrapped line.
  //
  // Distributing the flat list of wrapped lines round-robin put the
  // continuation of a two-line clue in the opposite column, so a clue
  // ending "...along the 6th" had its "row." orphaned under a different
  // clue entirely. Each column is its own vertical flow now.
  const evColW = (box.width - 20) / 2;
  const evSplit = Math.ceil(puzzle.evidenceClues.length / 2);
  const evidenceRuns = (from: number, to: number) =>
    puzzle.evidenceClues
      .slice(from, to)
      .flatMap((c) =>
        wrapRuns(
          splitRuns(`• ${renderTemplate(c.text, names)}`, terms),
          fonts.body,
          fonts.bodyBold,
          evSize,
          evColW,
        ),
      );
  const evColumns: TextRun[][][] = [
    evidenceRuns(0, evSplit),
    evidenceRuns(evSplit, puzzle.evidenceClues.length),
  ];
  const evClueRows = Math.max(evColumns[0]!.length, evColumns[1]!.length);
  const evidenceHeight =
    puzzle.evidenceClues.length === 0
      ? 0
      : evHeaderH + evObjectLines.length * evLead + evClueRows * evLead + 14;

  // The axis numerals live OUTSIDE the plan — row numbers to its left,
  // column numbers above it — so their space is reserved before the plan
  // is sized. Letting the plan claim the full content width pushed those
  // numerals into the gutter: still on the paper, so nothing looked
  // broken in a preview, but inside KDP's binding margin where a thick
  // book swallows them.
  const AXIS_GUTTER = 14;
  const AXIS_HEADROOM = 10;
  const answerH = 17;
  const gaps = 8 + (evidenceHeight ? 8 : 0) + 8;
  const fixed = evidenceHeight + answerH + gaps;

  // Step the portrait down until the grid clears its floor.
  //
  // Only the portrait moves. Body size is not a lever — shrinking the
  // clue text to win grid area trades a readable puzzle for a bigger
  // one — and the evidence block is not a lever either, since it is the
  // second half of the deduction on the upper tiers. The portrait is the
  // one thing on the card that can give ground without costing the
  // reader anything: it is decoration standing next to information.
  //
  // Bounded by MIN_PORTRAIT so a 6x9 does not walk back to the 0.29in
  // slot that the artwork proofing rejected in the first place. If the
  // cards still will not fit, the grid simply takes what is left, which
  // is exactly the old behaviour and the honest floor for a page with
  // eight long clues on it.
  const gridFloor = (y - box.y) * MIN_GRID_SHARE;
  const starved = () => y - box.y - cardsHeight - fixed - AXIS_HEADROOM < gridFloor;
  const remeasure = () => {
    clueW = cardW - cardPadX * 2 - portrait - 5;
    lineHeight = bodySize * 1.28;
    cardMetrics = measureCards();
    rowHeights = heightsFor(cardMetrics);
    cardsHeight = rowHeights.reduce((sum, h) => sum + h, 0) + (rowCount - 1) * CARD_ROW_GAP;
  };
  while (starved() && (portrait > MIN_PORTRAIT || bodySize > MIN_BODY)) {
    // Decoration before information: the portrait gives all it can, and
    // only then does the clue type move.
    if (portrait > MIN_PORTRAIT) portrait -= 1;
    else bodySize = Math.max(MIN_BODY, bodySize - 0.1);
    remeasure();
  }

  const available = y - box.y - cardsHeight - fixed;

  // ---- Floor plan, sized to the space that's left ----
  //
  // The axis numerals live OUTSIDE the plan — row numbers to its left,
  // column numbers above it — so the space they need is reserved before
  // the plan is sized. Letting the plan claim the full content width
  // pushed those numerals into the gutter: they still landed on the
  // paper, so nothing looked broken in a preview, but they sat inside
  // KDP's binding margin where a thick book swallows them.
  const gridSide = Math.max(
    60,
    Math.min(box.width - AXIS_GUTTER, available - AXIS_HEADROOM),
  );
  const cellSize = gridSide / puzzle.floorPlan.size;
  const gridOriginX = box.x + AXIS_GUTTER + (box.width - AXIS_GUTTER - gridSide) / 2;

  drawFloorPlan(
    page,
    puzzle,
    fonts,
    palette,
    gridOriginX,
    y - AXIS_HEADROOM,
    cellSize,
    textureSeed,
    textureIntensity,
    options.art,
    options.floorStrength,
  );
  y -= gridSide + AXIS_HEADROOM + 8;

  // ---- Suspect cards ----
  let cardY = y;
  for (let r = 0; r < rowCount; r++) {
    const h = rowHeights[r]!;
    for (let c = 0; c < 2; c++) {
      const item = cardMetrics[r * 2 + c];
      if (!item) continue;
      const cx = box.x + c * (cardW + colGap);
      const cy = cardY - h;
      // Rounded or square, at the publisher's choice. A soft corner reads
      // as a modern card and a hard one as a case file; both are right for
      // some books, so neither is hardcoded.
      const cardFill = item.isVictim ? palette.victimBg : palette.cardBg;
      const cardBorder = item.isVictim ? palette.victim : palette.rule;
      const cardBorderW = item.isVictim ? 1 : 0.6;
      if (cardCorners === "rounded") {
        drawRoundedRect(page, {
          x: cx,
          y: cy,
          width: cardW,
          height: h,
          radius: CARD_RADIUS,
          fill: cardFill,
          border: cardBorder,
          borderWidth: cardBorderW,
        });
      } else {
        page.drawRectangle({
          x: cx,
          y: cy,
          width: cardW,
          height: h,
          color: cardFill,
          borderWidth: cardBorderW,
          borderColor: cardBorder,
        });
      }
      const portraitImage = options.art?.portraits.get(item.suspect.id);
      if (portraitImage) {
        drawPortraitImage(page, portraitImage, cx + cardPadX, cy + h - portrait - 5, portrait);
      } else {
        drawPortrait(
          page,
          cx + cardPadX,
          cy + h - portrait - 5,
          portrait,
          `${item.suspect.id}:${item.suspect.name}`,
          palette,
        );
      }
      const textX = cx + cardPadX + portrait + 5;
      // The name line can't wrap — it shares one line with the height —
      // and the name is publisher-editable, so it shrinks to fit and
      // then truncates. Before this it was drawn at a fixed size with no
      // width limit at all, and a long rename ran clean off the page.
      const heightLabel = formatHeight(item.suspect.heightIn);
      const heightSize = 6.6;
      const heightW = fonts.display.widthOfTextAtSize(heightLabel, heightSize);
      const nameMaxW = Math.max(12, clueW - heightW - 5);
      const nameSize = fitTextSize(item.suspect.name, fonts.displayBold, 8.4, 6, nameMaxW, 1);
      const nameText = ellipsize(item.suspect.name, fonts.displayBold, nameSize, nameMaxW);
      page.drawText(nameText, {
        x: textX,
        y: cardY - 12,
        size: nameSize,
        font: fonts.displayBold,
        color: item.isVictim ? palette.victim : palette.ink,
      });
      const nameW = fonts.displayBold.widthOfTextAtSize(nameText, nameSize);
      page.drawText(heightLabel, {
        x: textX + nameW + 5,
        y: cardY - 11.5,
        size: heightSize,
        font: fonts.display,
        color: palette.inkFaint,
      });
      let ly = cardY - 12 - lineHeight - 1.5;
      for (const line of item.lines) {
        drawRuns(
          page,
          line,
          textX,
          ly,
          bodySize,
          fonts.body,
          fonts.bodyBold,
          item.isVictim ? palette.victim : palette.ink,
        );
        ly -= lineHeight;
      }
    }
    cardY -= h + CARD_ROW_GAP;
  }
  y = cardY - 3;

  // ---- Evidence panel ----
  if (evidenceHeight > 0) {
    const panelY = y - evidenceHeight;
    page.drawRectangle({
      x: box.x,
      y: panelY,
      width: box.width,
      height: evidenceHeight,
      color: palette.cardBg,
      borderWidth: 0.6,
      borderColor: palette.rule,
    });
    let ey = y - 10;
    page.drawText("EVIDENCE — WHO CARRIED WHAT", {
      x: box.x + 7,
      y: ey,
      size: 7,
      font: fonts.displayBold,
      color: palette.accent,
    });
    ey -= evLead + 1;
    for (const line of evObjectLines) {
      page.drawText(line, {
        x: box.x + 7,
        y: ey,
        size: evSize,
        font: fonts.bodyBold,
        color: palette.inkSoft,
      });
      ey -= evLead;
    }
    ey -= 1;
    // Each column flows independently, so a wrapped clue keeps its own
    // continuation line directly beneath it.
    evColumns.forEach((lines, col) => {
      lines.forEach((line, rowIdx) => {
        drawRuns(
          page,
          line,
          box.x + 7 + col * (evColW + 6),
          ey - rowIdx * evLead,
          evSize,
          fonts.body,
          fonts.bodyBold,
          palette.ink,
        );
      });
    });
    y = panelY - 8;
  }

  // ---- Answer line ----
  const answerLabel = "THE MURDERER IS";
  const alSize = 8;
  page.drawText(answerLabel, {
    x: box.x,
    y: box.y + 4,
    size: alSize,
    font: fonts.displayBold,
    color: palette.ink,
  });
  const alW = fonts.displayBold.widthOfTextAtSize(answerLabel, alSize);
  page.drawLine({
    start: { x: box.x + alW + 8, y: box.y + 3 },
    end: { x: right, y: box.y + 3 },
    thickness: 0.7,
    color: palette.ruleStrong,
  });

  return {
    gridSide,
    cellSize,
    portrait,
    contentHeight: box.height,
    headerHeight,
    cardsHeight,
  };
}
