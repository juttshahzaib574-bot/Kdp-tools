import { rgb, type RGB } from "pdf-lib";
import type { InteriorColor } from "@kdp/shared";

// The interior's colour system.
//
// This exists because `interiorColor` used to stop at the cover: the
// interior renderer never received it, so a book ordered as COLOR printed
// byte-identically to a black-and-white one. Colour is the default here —
// black-and-white is a deliberate cost-saving choice the user opts into,
// not the fallback.
//
// KDP wants black-and-white interiors supplied as greyscale, so the B&W
// palette is not a separate hand-picked set of greys: it is the SAME
// palette pushed through a luminance conversion. That guarantees the two
// modes stay in step — a hue added for colour automatically gets a
// sensible grey, and the contrast relationships the layout depends on
// survive the conversion instead of being re-guessed.

/** Rec. 601 luma — the standard perceptual weighting for RGB -> grey. */
function luminance(r: number, g: number, b: number): number {
  return 0.299 * r + 0.587 * g + 0.114 * b;
}

/**
 * Greyscale conversion with a slight contrast expansion around mid-grey.
 * A straight luma conversion of a mid-saturation palette lands almost
 * everything between 0.45 and 0.65, which prints as an undifferentiated
 * mush at 300 DPI on cream stock. Pushing values away from the midpoint
 * keeps room fills distinguishable in print.
 */
function toGrey(r: number, g: number, b: number): RGB {
  const l = luminance(r, g, b);
  const expanded = Math.min(1, Math.max(0, 0.5 + (l - 0.5) * 1.35));
  return rgb(expanded, expanded, expanded);
}

export interface Palette {
  /** True when this palette is the greyscale variant. */
  readonly greyscale: boolean;
  ink: RGB;
  inkSoft: RGB;
  inkFaint: RGB;
  rule: RGB;
  /** Backing for room-name pills — near-white so a label reads over any floor texture. */
  labelPill: RGB;
  ruleStrong: RGB;
  /** Page background for cards and panels. */
  cardBg: RGB;
  /** Accent used for the difficulty badge and section marks. */
  accent: RGB;
  accentInk: RGB;
  /** The victim's card is marked in a warning hue. */
  victim: RGB;
  victimBg: RGB;
  /** Fill colours cycled across the floor plan's rooms. */
  rooms: RGB[];
  /** Fill for a cell a suspect may occupy. */
  seatFill: RGB;
  /** Fill for a blocked cell holding a prop. */
  propFill: RGB;
}

/**
 * The colour palette, chosen to survive print: mid-saturation, mid-value
 * hues that stay distinct from one another both in CMYK and after the
 * greyscale conversion above. Deliberately not primary/neon — those look
 * cheap in print and blow out on uncoated stock.
 */
const COLOR_PALETTE: Omit<Palette, "greyscale"> = {
  ink: rgb(0.09, 0.1, 0.13),
  inkSoft: rgb(0.34, 0.37, 0.42),
  inkFaint: rgb(0.55, 0.58, 0.63),
  rule: rgb(0.82, 0.84, 0.87),
  labelPill: rgb(0.99, 0.99, 0.995),
  ruleStrong: rgb(0.15, 0.17, 0.21),
  cardBg: rgb(0.975, 0.973, 0.965),
  accent: rgb(0.62, 0.16, 0.13),
  accentInk: rgb(1, 1, 1),
  victim: rgb(0.66, 0.13, 0.11),
  victimBg: rgb(0.98, 0.93, 0.92),
  rooms: [
    rgb(0.84, 0.88, 0.82), // sage
    rgb(0.93, 0.87, 0.76), // wheat
    rgb(0.81, 0.86, 0.91), // slate blue
    rgb(0.93, 0.84, 0.83), // dusty rose
    rgb(0.87, 0.85, 0.91), // lilac
    rgb(0.79, 0.87, 0.87), // teal mist
    rgb(0.94, 0.90, 0.82), // sand
    rgb(0.86, 0.90, 0.85), // pale moss
  ],
  seatFill: rgb(1, 1, 1),
  propFill: rgb(0.99, 0.98, 0.95),
};

/**
 * How far apart the room fills sit in VALUE, as 0..1 of the available
 * band. This is the single control behind "the plan looks flat".
 *
 * Rooms are told apart two ways: by hue, and by how light or dark they
 * are. Only one of those survives a black-ink print, and the palette was
 * leaning almost entirely on the other — measured, the eight colour fills
 * spanned 0.05 luminance end to end (0.853 to 0.903), so with the colour
 * removed they were the same tint of grey. The competitor's fills span
 * roughly 0.50.
 *
 * The greyscale ramp was better but top-heavy: 0.99 down to 0.73 in even
 * steps put FOUR of its eight values above 0.87, so most rooms on a page
 * still landed in one light band and only the last two read as distinct.
 *
 * 0 keeps every room at the same value (hue-only, the old behaviour);
 * 1 spends the whole printable band. The default is deliberately short
 * of 1 — the darkest fills a press can hold without filling in are
 * useful, but a plan where half the rooms are mid-grey stops reading as
 * paper.
 */
export const DEFAULT_ROOM_CONTRAST = 0.55;

/**
 * The lightest and darkest a room fill may go.
 *
 * The top is short of white so a fill is still visibly a fill on cheap
 * uncoated stock; the bottom is where near-black ink (0.09) and the white
 * seat rings both still read cleanly over it, with room to spare before
 * the press starts filling in.
 */
const ROOM_VALUE_BAND = { light: 0.96, dark: 0.6 } as const;

/** Where the i-th of n rooms sits in the band, at a given contrast. */
function ladderValue(i: number, n: number, contrast: number): number {
  const t = n <= 1 ? 0 : i / (n - 1);
  const span = (ROOM_VALUE_BAND.light - ROOM_VALUE_BAND.dark) * clamp01(contrast);
  // Centred on the band's own midpoint, so raising contrast opens the
  // ladder outwards instead of dragging every room darker.
  const mid = (ROOM_VALUE_BAND.light + ROOM_VALUE_BAND.dark) / 2;
  return mid + span / 2 - t * span;
}

/**
 * Clamps to 0..1, treating anything non-finite as the default.
 *
 * A caller computing `undefined / 100` gets NaN, and NaN survives
 * Math.min/Math.max unchanged — it would have propagated all the way to a
 * room fill and produced a page with no fills at all, with nothing
 * throwing anywhere along the way.
 */
function clamp01(n: number): number {
  if (!Number.isFinite(n)) return DEFAULT_ROOM_CONTRAST;
  return Math.max(0, Math.min(1, n));
}

/** Evenly spaced greys for a black-ink interior. */
function greyLadder(n: number, contrast: number): RGB[] {
  return Array.from({ length: n }, (_, i) => {
    const v = ladderValue(i, n, contrast);
    return rgb(v, v, v);
  });
}

/**
 * Re-targets each hue's luminance onto the ladder while keeping its hue.
 *
 * The colour palette's job does not change — sage still reads as sage —
 * but sage now also sits at a different value from wheat, so the two are
 * told apart by a reader with the book in colour AND by the same reader
 * holding the black-ink edition.
 *
 * Scaling the channels together preserves the ratio between them, which
 * is what keeps the hue; clamping afterwards is what stops a very light
 * hue from blowing a channel out when it is pushed lighter.
 */
function valueLadder(hues: readonly RGB[], contrast: number): RGB[] {
  return hues.map((hue, i) => {
    const current = toGrey(hue.red, hue.green, hue.blue).red;
    const target = ladderValue(i, hues.length, contrast);
    if (current <= 0.001) return hue;
    const k = target / current;
    return rgb(
      Math.max(0, Math.min(1, hue.red * k)),
      Math.max(0, Math.min(1, hue.green * k)),
      Math.max(0, Math.min(1, hue.blue * k)),
    );
  });
}

function greyscaleOf(
  source: Omit<Palette, "greyscale">,
  contrast: number,
): Omit<Palette, "greyscale"> {
  const g = (c: RGB) => toGrey(c.red, c.green, c.blue);
  return {
    ink: g(source.ink),
    inkSoft: g(source.inkSoft),
    inkFaint: g(source.inkFaint),
    rule: g(source.rule),
    labelPill: g(source.labelPill),
    ruleStrong: g(source.ruleStrong),
    cardBg: g(source.cardBg),
    // The badge stays legible by going near-black with white type rather
    // than a mid-grey that would swallow the text.
    accent: rgb(0.16, 0.16, 0.16),
    accentInk: rgb(1, 1, 1),
    victim: rgb(0.2, 0.2, 0.2),
    victimBg: rgb(0.93, 0.93, 0.93),
    // Room greys are spread across a printable band instead of being
    // converted from the hues, because several palette hues share a
    // luminance and would collapse onto the same grey. See valueLadder
    // for why the band is what it is.
    rooms: greyLadder(source.rooms.length, contrast),
    seatFill: rgb(1, 1, 1),
    propFill: rgb(0.97, 0.97, 0.97),
  };
}

/**
 * Resolves the palette for an interior. Defaults to full colour — a book
 * is only greyscale when the publisher explicitly chose a black-and-white
 * interior to cut print cost.
 *
 * `roomContrast` is how far apart the room fills sit in value; see
 * DEFAULT_ROOM_CONTRAST. It is a parameter rather than a constant because
 * the right amount is a taste call about a printed page, and the person
 * holding the proof is better placed to make it than this file is.
 */
export function paletteFor(
  interiorColor: InteriorColor | undefined,
  roomContrast: number = DEFAULT_ROOM_CONTRAST,
): Palette {
  const greyscale = interiorColor === "blackAndWhite";
  const base = greyscale
    ? greyscaleOf(COLOR_PALETTE, roomContrast)
    : { ...COLOR_PALETTE, rooms: valueLadder(COLOR_PALETTE.rooms, roomContrast) };
  return { greyscale, ...base };
}

/** Room fill for room index `i`, cycling the palette. */
export function roomFill(palette: Palette, index: number): RGB {
  return palette.rooms[index % palette.rooms.length]!;
}
