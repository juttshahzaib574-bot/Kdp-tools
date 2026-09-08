import { degrees, rgb, type PDFPage, type RGB } from "pdf-lib";
import type { Palette } from "./palette";

// Procedural artwork, drawn from pdf-lib vector primitives.
//
// The grid used to show a bare dot for a seat and a bare NUMBER for a
// prop, with a text legend underneath — which read as a spreadsheet, not
// a puzzle. These draw actual little pictures instead, and because they
// are vector they stay sharp at any print resolution (no 300 DPI raster
// concern at all) and cost almost nothing in file size.
//
// Deliberately built from primitives rather than shipped as an asset
// pack: a commissioned icon set is an art-production project, while this
// closes the visual gap today and is seeded, so instances vary between
// books instead of stamping an identical page every time.

/** Every prop shape the grid can draw. Names map onto theme landmarks. */
export type PropShape =
  | "clock"
  | "chair"
  | "shelf"
  | "fire"
  | "frame"
  | "piano"
  | "globe"
  | "vase"
  | "armor"
  | "desk"
  | "crate"
  | "barrel"
  | "plant"
  | "lamp"
  | "wheel"
  | "sack"
  | "ladder"
  | "box";

/**
 * Maps a landmark's prose name onto a drawable shape by keyword, so a
 * theme pack can add landmarks without touching this file — anything
 * unrecognised falls back to a generic crate rather than disappearing.
 */
export function shapeForLandmark(name: string): PropShape {
  const n = name.toLowerCase();
  if (n.includes("clock")) return "clock";
  // ORDER IS SIGNIFICANT, and this line is why: "table" is a substring of
  // "vegeTABLE patch", so a farm's vegetable patch used to be drawn as a
  // chair. Anything whose keyword is a substring of another belongs ABOVE
  // the rule that would otherwise steal it.
  if (n.includes("vegetable") || n.includes("patch")) return "plant";
  if (n.includes("chair") || n.includes("stool") || n.includes("table")) return "chair";
  if (n.includes("shelf") || n.includes("bookshelf") || n.includes("rack")) return "shelf";
  if (n.includes("fire") || n.includes("stove") || n.includes("kettle")) return "fire";
  if (n.includes("portrait") || n.includes("painting") || n.includes("board")) return "frame";
  if (n.includes("piano") || n.includes("press")) return "piano";
  // "urn" is a substring of "chURN", so this pair is order-sensitive the
  // same way the vegetable patch above is. The vase rule already named
  // "churn" and could never fire — a milk churn is a tall vessel, not a
  // sphere, so it wants the vase glyph and the vase rule goes first.
  if (n.includes("vase") || n.includes("lilies") || n.includes("churn")) return "vase";
  if (n.includes("globe") || n.includes("urn")) return "globe";
  if (n.includes("armor") || n.includes("armour")) return "armor";
  if (n.includes("desk") || n.includes("bench")) return "desk";
  if (n.includes("barrel") || n.includes("trough") || n.includes("bucket")) return "barrel";
  if (n.includes("plant") || n.includes("patch") || n.includes("bale") || n.includes("hay"))
    return "plant";
  if (n.includes("lamp") || n.includes("flare") || n.includes("candle")) return "lamp";
  if (n.includes("sack")) return "sack";
  if (n.includes("crate") || n.includes("ration") || n.includes("chest") || n.includes("box"))
    return "crate";
  // Anything with a wheel or a mast reads best as a wheel/vane.
  if (
    n.includes("wheelbarrow") ||
    n.includes("tractor") ||
    n.includes("vane") ||
    n.includes("canoe") ||
    n.includes("wheel") ||
    n.includes("flagpole") ||
    n.includes("coil") ||
    n.includes("fencing")
  ) {
    return "wheel";
  }
  if (
    n.includes("ladder") ||
    n.includes("line") ||
    n.includes("target") ||
    n.includes("swing") ||
    n.includes("firewood") ||
    n.includes("trays") ||
    n.includes("grease") ||
    n.includes("mop")
  ) {
    return "ladder";
  }
  return "box";
}

interface DrawCtx {
  page: PDFPage;
  /** Centre of the cell. */
  cx: number;
  cy: number;
  /** Full cell edge length; shapes inset themselves from this. */
  size: number;
  ink: RGB;
  fill: RGB;
}

const rectAt = (
  { page, ink, fill }: DrawCtx,
  x: number,
  y: number,
  w: number,
  h: number,
  lw = 0.6,
) => page.drawRectangle({ x, y, width: w, height: h, borderWidth: lw, borderColor: ink, color: fill });

const lineAt = ({ page, ink }: DrawCtx, x: number, y: number, w: number, thick = 0.5) =>
  page.drawLine({ start: { x, y }, end: { x: x + w, y }, thickness: thick, color: ink });

/**
 * Draws one prop inside a cell. `size` is the cell edge; every shape
 * insets to ~62% of it so props never touch the room borders.
 */
export function drawProp(ctx: DrawCtx, shape: PropShape): void {
  const { page, cx, cy, size, ink, fill } = ctx;
  const s = size * 0.62;
  const half = s / 2;
  const left = cx - half;
  const bottom = cy - half;

  switch (shape) {
    case "clock":
      page.drawCircle({ x: cx, y: cy, size: half, borderWidth: 0.6, borderColor: ink, color: fill });
      page.drawLine({
        start: { x: cx, y: cy },
        end: { x: cx, y: cy + half * 0.55 },
        thickness: 0.6,
        color: ink,
      });
      page.drawLine({
        start: { x: cx, y: cy },
        end: { x: cx + half * 0.4, y: cy },
        thickness: 0.6,
        color: ink,
      });
      break;
    case "chair":
      rectAt(ctx, left + s * 0.12, bottom, s * 0.76, s * 0.42);
      rectAt(ctx, left + s * 0.12, bottom + s * 0.42, s * 0.76, s * 0.46);
      break;
    case "shelf":
      rectAt(ctx, left, bottom, s, s);
      lineAt(ctx, left, bottom + s * 0.33, s);
      lineAt(ctx, left, bottom + s * 0.66, s);
      break;
    case "fire":
      rectAt(ctx, left, bottom, s, s * 0.9);
      page.drawCircle({ x: cx, y: cy - s * 0.1, size: s * 0.2, color: ink });
      break;
    case "frame":
      rectAt(ctx, left, bottom, s, s);
      rectAt(ctx, left + s * 0.18, bottom + s * 0.18, s * 0.64, s * 0.64, 0.4);
      break;
    case "piano":
      rectAt(ctx, left, bottom + s * 0.3, s, s * 0.5);
      for (let i = 1; i < 5; i++) {
        page.drawLine({
          start: { x: left + (s / 5) * i, y: bottom + s * 0.3 },
          end: { x: left + (s / 5) * i, y: bottom + s * 0.55 },
          thickness: 0.4,
          color: ink,
        });
      }
      break;
    case "globe":
      page.drawCircle({ x: cx, y: cy + s * 0.08, size: half * 0.82, borderWidth: 0.6, borderColor: ink, color: fill });
      page.drawLine({
        start: { x: cx, y: cy - half },
        end: { x: cx, y: cy - half * 0.55 },
        thickness: 0.6,
        color: ink,
      });
      break;
    case "vase":
      rectAt(ctx, left + s * 0.28, bottom, s * 0.44, s * 0.55);
      page.drawCircle({ x: cx, y: bottom + s * 0.72, size: s * 0.2, borderWidth: 0.5, borderColor: ink, color: fill });
      break;
    case "armor":
      page.drawCircle({ x: cx, y: bottom + s * 0.78, size: s * 0.17, borderWidth: 0.6, borderColor: ink, color: fill });
      rectAt(ctx, left + s * 0.22, bottom, s * 0.56, s * 0.6);
      break;
    case "desk":
      rectAt(ctx, left, bottom + s * 0.45, s, s * 0.2);
      rectAt(ctx, left + s * 0.08, bottom, s * 0.2, s * 0.45, 0.4);
      rectAt(ctx, left + s * 0.72, bottom, s * 0.2, s * 0.45, 0.4);
      break;
    case "barrel":
      rectAt(ctx, left + s * 0.16, bottom, s * 0.68, s);
      lineAt(ctx, left + s * 0.16, bottom + s * 0.32, s * 0.68);
      lineAt(ctx, left + s * 0.16, bottom + s * 0.66, s * 0.68);
      break;
    case "plant":
      rectAt(ctx, left + s * 0.24, bottom, s * 0.52, s * 0.38);
      page.drawCircle({ x: cx, y: bottom + s * 0.62, size: s * 0.26, borderWidth: 0.6, borderColor: ink, color: fill });
      break;
    case "lamp":
      page.drawRectangle({
        x: left + s * 0.24,
        y: bottom + s * 0.5,
        width: s * 0.52,
        height: s * 0.36,
        borderWidth: 0.6,
        borderColor: ink,
        color: fill,
        rotate: degrees(0),
      });
      rectAt(ctx, left + s * 0.44, bottom, s * 0.12, s * 0.5, 0.4);
      break;
    case "crate":
      rectAt(ctx, left, bottom + s * 0.1, s, s * 0.8);
      page.drawLine({
        start: { x: left, y: bottom + s * 0.1 },
        end: { x: left + s, y: bottom + s * 0.9 },
        thickness: 0.4,
        color: ink,
      });
      break;
    case "wheel":
      page.drawCircle({ x: cx, y: cy, size: half * 0.9, borderWidth: 0.7, borderColor: ink, color: fill });
      page.drawCircle({ x: cx, y: cy, size: half * 0.26, color: ink });
      for (const a of [0, Math.PI / 3, (2 * Math.PI) / 3]) {
        page.drawLine({
          start: { x: cx - Math.cos(a) * half * 0.85, y: cy - Math.sin(a) * half * 0.85 },
          end: { x: cx + Math.cos(a) * half * 0.85, y: cy + Math.sin(a) * half * 0.85 },
          thickness: 0.45,
          color: ink,
        });
      }
      break;
    case "sack":
      // Narrow neck over a full body — reads as a sack at 10pt.
      rectAt(ctx, left + s * 0.34, bottom + s * 0.72, s * 0.32, s * 0.2, 0.5);
      rectAt(ctx, left + s * 0.12, bottom, s * 0.76, s * 0.72);
      break;
    case "ladder":
      page.drawLine({
        start: { x: left + s * 0.26, y: bottom },
        end: { x: left + s * 0.26, y: bottom + s },
        thickness: 0.7,
        color: ink,
      });
      page.drawLine({
        start: { x: left + s * 0.74, y: bottom },
        end: { x: left + s * 0.74, y: bottom + s },
        thickness: 0.7,
        color: ink,
      });
      for (let i = 1; i <= 3; i++) lineAt(ctx, left + s * 0.26, bottom + (s / 4) * i, s * 0.48, 0.5);
      break;
    case "box":
    default:
      rectAt(ctx, left, bottom + s * 0.12, s, s * 0.76);
      lineAt(ctx, left, bottom + s * 0.5, s, 0.4);
      break;
  }
}

/**
 * Draws a seat marker — the "a suspect can stand here" affordance. A
 * ringed dot rather than a bare dot so it reads as a deliberate token
 * next to the props, and stays visible on every room fill.
 */
export function drawSeat(page: PDFPage, cx: number, cy: number, size: number, palette: Palette): void {
  // A quiet ring, not a filled token.
  //
  // Forty of these on a 7x7 plan is most of what the page shows, so the
  // weight of one marker sets the weight of the whole grid. Filled
  // circles with a solid centre dot read as counters already placed —
  // busy, and misleading on a page whose whole job is an empty board
  // waiting to be filled in. An open ring says "a guest could stand
  // here" and lets the floor plan carry the page.
  const r = Math.max(2, size * 0.16);
  page.drawCircle({ x: cx, y: cy, size: r, borderWidth: 0.55, borderColor: palette.inkFaint });
}

/**
 * A portrait avatar for a suspect card: head, shoulders, and a few
 * seeded features so the eight faces on a page are visibly different
 * people rather than one repeated silhouette. Derived from the suspect's
 * id + name, so a given suspect looks the same everywhere in the book.
 */
export function drawPortrait(
  page: PDFPage,
  x: number,
  y: number,
  size: number,
  seedText: string,
  palette: Palette,
): void {
  // Small deterministic hash of the name — same person, same face.
  let h = 2166136261;
  for (let i = 0; i < seedText.length; i++) {
    h ^= seedText.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  const pick = (n: number, salt: number) => Math.abs((h >>> (salt % 24)) % n);

  const cx = x + size / 2;
  const headR = size * 0.23;
  const headY = y + size * 0.63;

  // Tinted disc behind the figure; in greyscale these become light greys
  // that still separate one card from the next.
  const tint = palette.rooms[pick(palette.rooms.length, 3)]!;
  page.drawCircle({ x: cx, y: y + size / 2, size: size * 0.47, color: tint });

  // Shoulders — a rounded slab clipped by the disc's lower half.
  const shoulderW = size * 0.56;
  page.drawRectangle({
    x: cx - shoulderW / 2,
    y: y + size * 0.13,
    width: shoulderW,
    height: size * 0.27,
    color: palette.cardBg,
    borderWidth: 0.7,
    borderColor: palette.ink,
  });
  // Head.
  page.drawCircle({
    x: cx,
    y: headY,
    size: headR,
    color: palette.cardBg,
    borderWidth: 0.7,
    borderColor: palette.ink,
  });

  // Seeded hair: one of four silhouettes.
  const hair = pick(4, 7);
  const ink = palette.ink;
  if (hair === 0) {
    page.drawCircle({ x: cx, y: headY + headR * 0.42, size: headR * 0.92, color: ink });
    page.drawCircle({ x: cx, y: headY + headR * 0.1, size: headR * 0.86, color: palette.cardBg });
  } else if (hair === 1) {
    page.drawRectangle({
      x: cx - headR,
      y: headY + headR * 0.25,
      width: headR * 2,
      height: headR * 0.55,
      color: ink,
    });
  } else if (hair === 2) {
    page.drawCircle({ x: cx - headR * 0.75, y: headY - headR * 0.1, size: headR * 0.42, color: ink });
    page.drawCircle({ x: cx + headR * 0.75, y: headY - headR * 0.1, size: headR * 0.42, color: ink });
    page.drawRectangle({
      x: cx - headR,
      y: headY + headR * 0.3,
      width: headR * 2,
      height: headR * 0.5,
      color: ink,
    });
  }
  // Eyes — always drawn, so every face reads as a face.
  const eyeY = headY + headR * 0.05;
  const eyeDx = headR * 0.36;
  page.drawCircle({ x: cx - eyeDx, y: eyeY, size: Math.max(0.5, headR * 0.1), color: ink });
  page.drawCircle({ x: cx + eyeDx, y: eyeY, size: Math.max(0.5, headR * 0.1), color: ink });
}

/**
 * A rounded rectangle, drawn as an SVG path.
 *
 * pdf-lib has no corner radius on drawRectangle, and squared-off labels
 * are exactly what makes a page look like a wireframe. An SVG path costs
 * nothing extra in the file and gives real rounded corners.
 *
 * Note the Y flip: pdf-lib measures from the bottom of the page, SVG
 * from the top, so the path is built downward from (x, y + height).
 */
export function drawRoundedRect(
  page: PDFPage,
  opts: {
    x: number;
    y: number;
    width: number;
    height: number;
    radius: number;
    fill?: RGB;
    border?: RGB;
    borderWidth?: number;
    /** 0..1. Lets a plate sit ON the floor art rather than hiding it. */
    opacity?: number;
  },
): void {
  const { x, y, width: w, height: h } = opts;
  const r = Math.max(0, Math.min(opts.radius, Math.min(w, h) / 2));
  const path = [
    `M ${r} 0`,
    `H ${w - r}`,
    `A ${r} ${r} 0 0 1 ${w} ${r}`,
    `V ${h - r}`,
    `A ${r} ${r} 0 0 1 ${w - r} ${h}`,
    `H ${r}`,
    `A ${r} ${r} 0 0 1 0 ${h - r}`,
    `V ${r}`,
    `A ${r} ${r} 0 0 1 ${r} 0`,
    "Z",
  ].join(" ");
  page.drawSvgPath(path, {
    x,
    y: y + h,
    color: opts.fill,
    borderColor: opts.border,
    borderWidth: opts.borderWidth ?? 0,
    opacity: opts.opacity,
    borderOpacity: opts.opacity,
  });
}
