import { rgb, type PDFPage, type RGB } from "pdf-lib";
import type { Palette } from "./palette";

// The procedural texture engine.
//
// Rooms used to be flat colour swatches. Real puzzle books give each room
// a surface — the tool shed reads as stone, the stable as plank, the
// pantry as tile — and that is most of what separates a page that looks
// designed from one that looks generated.
//
// Three design decisions drive everything below.
//
// 1. VECTOR, NOT RASTER. Every texture is drawn from lines, rects and
//    circles at render time. A 300 DPI raster tile for a full page is
//    1-5 MB and pushes ink coverage (and therefore print cost) up; the
//    vector equivalent is a few KB and stays sharp at any trim size.
//
// 2. DRAWN PER CELL, COMPUTED IN ROOM SPACE. pdf-lib exposes no clipping
//    path, so a texture that overflowed its room would bleed across the
//    floor plan. Each family therefore emits geometry in the grid's
//    GLOBAL coordinate space and every shape is clipped to the current
//    cell rectangle. Because the geometry is global, a brick bond runs
//    continuously across all the cells of a room instead of restarting in
//    each square — while never escaping the room, since a room is exactly
//    a set of cells.
//
// 3. CONTRAST IS BOUNDED BY CONSTRUCTION. Texture ink is never an
//    absolute colour: it is always the room's own fill nudged by a small,
//    capped luminance delta (see `textureInk` and MAX_DELTA). A texture
//    therefore cannot be dark enough to compete with the clue text, the
//    seat tokens or the room borders, no matter which family or seed is
//    drawn. This is what keeps a decorated grid solvable.

// ---------------------------------------------------------------------
// Deterministic noise
// ---------------------------------------------------------------------

/** Integer hash -> [0,1). Cheap, stable across platforms, good enough for texture jitter. */
function hash2(x: number, y: number, seed: number): number {
  let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(seed | 0, 2246822519);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** Smooth value noise — used where a texture needs gradual variation (marble, parchment). */
function valueNoise(x: number, y: number, seed: number): number {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = x - xi;
  const yf = y - yi;
  const smooth = (t: number) => t * t * (3 - 2 * t);
  const sx = smooth(xf);
  const sy = smooth(yf);
  const a = hash2(xi, yi, seed);
  const b = hash2(xi + 1, yi, seed);
  const c = hash2(xi, yi + 1, seed);
  const d = hash2(xi + 1, yi + 1, seed);
  return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
}

// ---------------------------------------------------------------------
// Clipping
// ---------------------------------------------------------------------

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

function clipRect(r: Rect, clip: Rect): Rect | null {
  const x0 = Math.max(r.x, clip.x);
  const y0 = Math.max(r.y, clip.y);
  const x1 = Math.min(r.x + r.w, clip.x + clip.w);
  const y1 = Math.min(r.y + r.h, clip.y + clip.h);
  if (x1 <= x0 || y1 <= y0) return null;
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

/** Liang-Barsky segment clipping — lets angled families (hatch, grain, straw) stay inside the cell. */
function clipLine(
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  c: Rect,
): [number, number, number, number] | null {
  let t0 = 0;
  let t1 = 1;
  const dx = x1 - x0;
  const dy = y1 - y0;
  const p = [-dx, dx, -dy, dy];
  const q = [x0 - c.x, c.x + c.w - x0, y0 - c.y, c.y + c.h - y0];
  for (let i = 0; i < 4; i++) {
    const pi = p[i]!;
    const qi = q[i]!;
    if (pi === 0) {
      if (qi < 0) return null;
      continue;
    }
    const t = qi / pi;
    if (pi < 0) {
      if (t > t1) return null;
      if (t > t0) t0 = t;
    } else {
      if (t < t0) return null;
      if (t < t1) t1 = t;
    }
  }
  return [x0 + t0 * dx, y0 + t0 * dy, x0 + t1 * dx, y0 + t1 * dy];
}

// ---------------------------------------------------------------------
// Colour
// ---------------------------------------------------------------------

/**
 * The hard legibility ceiling. A texture may shift the room fill by at
 * most this much luminance either way — enough to read as a surface,
 * never enough to compete with the grid's own ink. Greyscale gets a
 * tighter cap because the room greys are already close together and the
 * whole plan is carried by value alone.
 */
export const MAX_DELTA = { color: 0.16, grey: 0.1 } as const;

export type TextureIntensity = "off" | "subtle" | "normal" | "bold";

const INTENSITY_SCALE: Record<TextureIntensity, number> = {
  off: 0,
  subtle: 0.55,
  normal: 1,
  // "bold" is for covers and dividers, never a puzzle grid — even here
  // the MAX_DELTA cap still applies, it just spends all of it.
  bold: 1.45,
};

/**
 * Nudges a colour's luminance by `delta`, clamped to the legibility
 * ceiling. Exported because the clamp IS the guarantee that a decorated
 * grid stays solvable — it is worth asserting directly rather than
 * inferring from a rendered page.
 */
export function textureInk(base: RGB, delta: number, greyscale: boolean, intensity: number): RGB {
  const cap = greyscale ? MAX_DELTA.grey : MAX_DELTA.color;
  const d = Math.max(-cap, Math.min(cap, delta * intensity));
  return rgb(
    Math.max(0, Math.min(1, base.red + d)),
    Math.max(0, Math.min(1, base.green + d)),
    Math.max(0, Math.min(1, base.blue + d)),
  );
}

// ---------------------------------------------------------------------
// Families
// ---------------------------------------------------------------------

export const TEXTURE_FAMILIES = [
  // wood
  "woodPlank",
  "woodHerringbone",
  "woodGrain",
  "parquet",
  // masonry
  "brickRunning",
  "brickStack",
  "brickHerringbone",
  "stoneBlock",
  "cobble",
  "rubble",
  // tile
  "tileSquare",
  "tileHex",
  "subwayTile",
  "terrazzo",
  "checker",
  // mineral
  "marble",
  "concrete",
  "gravel",
  // soft goods
  "carpet",
  "linenWeave",
  "burlap",
  "parchment",
  // organic
  "straw",
  "grass",
  "soilRows",
  "water",
  // manufactured
  "metalBrushed",
  "tinCeiling",
  "diamondPlate",
  // ornamental
  "damask",
  "hatch",
  "crosshatch",
  "stipple",
  // none
  "plain",
] as const;

export type TextureFamily = (typeof TEXTURE_FAMILIES)[number];

export interface TextureParams {
  family: TextureFamily;
  /** Feature size in points — brick height, plank width, tile pitch. */
  scale: number;
  /** Radians, for directional families. */
  angle: number;
  /** 0..1 irregularity. */
  jitter: number;
  /** 0..1, scaled again by intensity and then capped. */
  contrast: number;
  seed: number;
}

interface Ctx {
  page: PDFPage;
  clip: Rect;
  /** Grid origin, so geometry is continuous across cells of a room. */
  ox: number;
  oy: number;
  base: RGB;
  greyscale: boolean;
  intensity: number;
  p: TextureParams;
}

const rectFill = (c: Ctx, r: Rect, delta: number) => {
  const clipped = clipRect(r, c.clip);
  if (!clipped) return;
  c.page.drawRectangle({
    x: clipped.x,
    y: clipped.y,
    width: clipped.w,
    height: clipped.h,
    color: textureInk(c.base, delta, c.greyscale, c.intensity * c.p.contrast),
  });
};

const seg = (c: Ctx, x0: number, y0: number, x1: number, y1: number, delta: number, w = 0.4) => {
  const s = clipLine(x0, y0, x1, y1, c.clip);
  if (!s) return;
  c.page.drawLine({
    start: { x: s[0], y: s[1] },
    end: { x: s[2], y: s[3] },
    thickness: w,
    color: textureInk(c.base, delta, c.greyscale, c.intensity * c.p.contrast),
  });
};

const dot = (c: Ctx, x: number, y: number, r: number, delta: number) => {
  // Only drawn when fully inside, so a speckle never bleeds into the
  // neighbouring room. At these radii the lost edge coverage is invisible.
  if (x - r < c.clip.x || x + r > c.clip.x + c.clip.w) return;
  if (y - r < c.clip.y || y + r > c.clip.y + c.clip.h) return;
  c.page.drawCircle({
    x,
    y,
    size: r,
    color: textureInk(c.base, delta, c.greyscale, c.intensity * c.p.contrast),
  });
};

/** Iterates the lattice cells overlapping the clip rect, in global space. */
function lattice(
  c: Ctx,
  cellW: number,
  cellH: number,
  fn: (col: number, row: number, x: number, y: number) => void,
): void {
  const c0 = Math.floor((c.clip.x - c.ox) / cellW) - 1;
  const c1 = Math.ceil((c.clip.x + c.clip.w - c.ox) / cellW) + 1;
  const r0 = Math.floor((c.clip.y - c.oy) / cellH) - 1;
  const r1 = Math.ceil((c.clip.y + c.clip.h - c.oy) / cellH) + 1;
  for (let row = r0; row <= r1; row++) {
    for (let col = c0; col <= c1; col++) {
      fn(col, row, c.ox + col * cellW, c.oy + row * cellH);
    }
  }
}

/** Parallel lines at an arbitrary angle covering the clip rect. */
function parallelLines(c: Ctx, spacing: number, angle: number, delta: number, width: number): void {
  const { clip } = c;
  const cx = clip.x + clip.w / 2;
  const cy = clip.y + clip.h / 2;
  const dx = Math.cos(angle);
  const dy = Math.sin(angle);
  // Normal direction; step along it and draw a long line through each offset.
  const nx = -dy;
  const ny = dx;
  const reach = (Math.abs(clip.w) + Math.abs(clip.h)) * 0.75;
  const steps = Math.ceil((reach * 2) / spacing);
  // Anchor to global space so the lines line up across cells.
  const anchor = (c.ox * nx + c.oy * ny) % spacing;
  for (let i = -steps; i <= steps; i++) {
    const off = i * spacing - anchor;
    const px = cx + nx * off;
    const py = cy + ny * off;
    seg(c, px - dx * reach, py - dy * reach, px + dx * reach, py + dy * reach, delta, width);
  }
}

/* eslint-disable complexity */
function drawFamily(c: Ctx): void {
  const { p } = c;
  const s = p.scale;
  const j = p.jitter;
  const seed = p.seed;

  switch (p.family) {
    // ---------------- wood ----------------
    case "woodPlank": {
      // Boards run long in x. What separates this from plain striping is
      // the STAGGERED BUTT JOINT: each board row breaks at a different
      // place, the way a real floor is laid. Without it the family reads
      // as horizontal lines, not planks.
      const boardH = s;
      const boardL = s * 7;
      lattice(c, boardL, boardH, (col, row, _x, y) => {
        // Per-row stagger, so joints never line up column to column.
        const stagger = hash2(row, 31, seed) * boardL;
        const x = c.ox + col * boardL + stagger;
        const tone = (hash2(col * 7, row, seed) - 0.5) * 0.1;
        rectFill(c, { x, y, w: boardL, h: boardH }, tone);
        // Board edge (long) and butt joint (short) — the joint is the
        // heavier of the two, that's what makes the plank read.
        seg(c, x, y, x + boardL, y, -0.1, 0.35);
        seg(c, x, y, x, y + boardH, -0.15, 0.6);
        for (let g = 0; g < 2; g++) {
          const gy = y + boardH * (0.3 + 0.4 * hash2(col, row * 3 + g, seed));
          seg(c, x, gy, x + boardL, gy, -0.045, 0.2);
        }
      });
      break;
    }
    case "woodHerringbone": {
      // Drawn as an interlocking chevron field rather than as rotated
      // rectangles: a true herringbone tiling has a sheared unit cell
      // that is fiddly to clip, while a chevron reads as exactly the same
      // floor at print size and tiles trivially. Each lattice cell holds
      // one full V, and alternate rows shift by half a cell so the Vs
      // interlock instead of stacking into columns.
      const u = Math.max(2.2, s * 1.5);
      lattice(c, u * 2, u, (col, row, _x, y) => {
        const shift = Math.abs(row % 2) === 1 ? u : 0;
        const x = c.ox + col * u * 2 + shift;
        // Two plank tones per V so the limbs read as separate boards.
        rectFill(c, { x, y, w: u, h: u }, (hash2(col, row, seed) - 0.5) * 0.075);
        rectFill(c, { x: x + u, y, w: u, h: u }, (hash2(col, row, seed + 5) - 0.5) * 0.075);
        seg(c, x, y, x + u, y + u, -0.12, 0.5);
        seg(c, x + u, y + u, x + u * 2, y, -0.12, 0.5);
        // A lighter inner stroke gives each limb visible thickness.
        seg(c, x, y - u * 0.34, x + u, y + u * 0.66, -0.05, 0.28);
        seg(c, x + u, y + u * 0.66, x + u * 2, y - u * 0.34, -0.05, 0.28);
        seg(c, x, y, x + u * 2, y, -0.06, 0.25);
      });
      break;
    }
    case "woodGrain": {
      const spacing = Math.max(1.1, s * 0.32);
      const reach = c.clip.w + c.clip.h;
      for (let i = -2; i < reach / spacing + 2; i++) {
        const yy = c.oy + Math.round((c.clip.y - c.oy) / spacing + i) * spacing;
        // A wavy streak: several short segments following value noise.
        let px = c.clip.x - 2;
        let py = yy;
        const stepX = Math.max(2, s * 0.5);
        for (let x = c.clip.x - 2; x < c.clip.x + c.clip.w + 2; x += stepX) {
          const ny = yy + (valueNoise(x / (s * 4), yy / (s * 2), seed) - 0.5) * s * 0.5 * (0.4 + j);
          seg(c, px, py, x + stepX, ny, -0.07, 0.25);
          px = x + stepX;
          py = ny;
        }
      }
      break;
    }
    case "parquet": {
      const block = s * 3;
      lattice(c, block, block, (col, row, x, y) => {
        const horizontal = (col + row) % 2 === 0;
        rectFill(c, { x, y, w: block, h: block }, (hash2(col, row, seed) - 0.5) * 0.07);
        const strips = 4;
        for (let k = 1; k < strips; k++) {
          const t = (block / strips) * k;
          if (horizontal) seg(c, x, y + t, x + block, y + t, -0.08, 0.28);
          else seg(c, x + t, y, x + t, y + block, -0.08, 0.28);
        }
        seg(c, x, y, x + block, y, -0.12, 0.4);
        seg(c, x, y, x, y + block, -0.12, 0.4);
      });
      break;
    }

    // ---------------- masonry ----------------
    case "brickRunning":
    case "brickStack":
    case "subwayTile": {
      const h = s;
      const w = p.family === "subwayTile" ? s * 2 : s * 2.4;
      const offsetRows = p.family !== "brickStack";
      lattice(c, w, h, (col, row, _x, y) => {
        const shift = offsetRows && Math.abs(row % 2) === 1 ? w / 2 : 0;
        const x = c.ox + col * w + shift;
        const tone = (hash2(col, row, seed) - 0.5) * (p.family === "subwayTile" ? 0.05 : 0.11);
        const mortar = 0.7;
        rectFill(c, { x: x + mortar, y: y + mortar, w: w - mortar * 2, h: h - mortar * 2 }, tone);
        // Mortar reads as the recess between units, so it goes darker.
        seg(c, x, y, x + w, y, -0.1, 0.5);
        seg(c, x, y, x, y + h, -0.1, 0.5);
      });
      break;
    }
    case "brickHerringbone": {
      // Same chevron construction as the wood version (see there for why),
      // but chunkier and with heavier mortar so it reads as paving.
      const u = Math.max(2.8, s * 1.9);
      lattice(c, u * 2, u, (col, row, _x, y) => {
        const shift = Math.abs(row % 2) === 1 ? u : 0;
        const x = c.ox + col * u * 2 + shift;
        rectFill(c, { x, y, w: u, h: u }, (hash2(col, row, seed) - 0.5) * 0.11);
        rectFill(c, { x: x + u, y, w: u, h: u }, (hash2(col, row, seed + 5) - 0.5) * 0.11);
        seg(c, x, y, x + u, y + u, -0.14, 0.65);
        seg(c, x + u, y + u, x + u * 2, y, -0.14, 0.65);
        seg(c, x, y, x + u * 2, y, -0.11, 0.5);
      });
      break;
    }
    case "stoneBlock": {
      const h = s * 1.4;
      const w = s * 2.6;
      lattice(c, w, h, (col, row, _x, y) => {
        // Jittered course offsets so joints don't line up like brick.
        const shift = (hash2(row, 91, seed) - 0.5) * w * (0.3 + j);
        const x = c.ox + col * w + shift;
        const inset = 0.8;
        rectFill(
          c,
          { x: x + inset, y: y + inset, w: w - inset * 2, h: h - inset * 2 },
          (hash2(col, row, seed) - 0.5) * 0.13,
        );
        seg(c, x, y, x + w, y, -0.12, 0.55);
        seg(c, x, y, x, y + h, -0.12, 0.55);
      });
      break;
    }
    case "cobble": {
      const pitch = s * 1.2;
      lattice(c, pitch, pitch, (col, row, x, y) => {
        const jx = (hash2(col, row, seed) - 0.5) * pitch * 0.35 * (0.5 + j);
        const jy = (hash2(col, row, seed + 7) - 0.5) * pitch * 0.35 * (0.5 + j);
        const r = pitch * (0.3 + 0.14 * hash2(col, row, seed + 3));
        dot(c, x + pitch / 2 + jx, y + pitch / 2 + jy, r, (hash2(col, row, seed + 5) - 0.5) * 0.14);
      });
      break;
    }
    case "rubble": {
      const pitch = s * 1.5;
      lattice(c, pitch, pitch, (col, row, x, y) => {
        const w = pitch * (0.45 + 0.4 * hash2(col, row, seed));
        const h = pitch * (0.4 + 0.4 * hash2(col, row, seed + 11));
        const jx = (hash2(col, row, seed + 2) - 0.5) * pitch * 0.3;
        const jy = (hash2(col, row, seed + 4) - 0.5) * pitch * 0.3;
        rectFill(
          c,
          { x: x + jx, y: y + jy, w, h },
          (hash2(col, row, seed + 6) - 0.5) * 0.14,
        );
        seg(c, x + jx, y + jy, x + jx + w, y + jy, -0.09, 0.35);
      });
      break;
    }

    // ---------------- tile ----------------
    case "tileSquare": {
      lattice(c, s * 1.6, s * 1.6, (col, row, x, y) => {
        const t = s * 1.6;
        rectFill(c, { x: x + 0.6, y: y + 0.6, w: t - 1.2, h: t - 1.2 }, (hash2(col, row, seed) - 0.5) * 0.06);
        seg(c, x, y, x + t, y, -0.1, 0.45);
        seg(c, x, y, x, y + t, -0.1, 0.45);
      });
      break;
    }
    case "tileHex": {
      // Pointy-top hexagons on a staggered lattice — the pantry look.
      const R = s * 0.95;
      const hw = Math.sqrt(3) * R;
      const vs = R * 1.5;
      lattice(c, hw, vs, (col, row, _x, y) => {
        const shift = Math.abs(row % 2) === 1 ? hw / 2 : 0;
        const cx = c.ox + col * hw + shift + hw / 2;
        const cy = y + vs / 2;
        let prevX = cx;
        let prevY = cy + R;
        for (let k = 1; k <= 6; k++) {
          const a = Math.PI / 2 + (k * Math.PI) / 3;
          const nx = cx + Math.cos(a) * R;
          const ny = cy + Math.sin(a) * R;
          seg(c, prevX, prevY, nx, ny, -0.1, 0.4);
          prevX = nx;
          prevY = ny;
        }
      });
      break;
    }
    case "terrazzo": {
      const pitch = Math.max(3, s * 0.7);
      lattice(c, pitch, pitch, (col, row, x, y) => {
        const n = 1 + Math.floor(hash2(col, row, seed) * 2);
        for (let k = 0; k < n; k++) {
          const jx = hash2(col * 3 + k, row, seed + 1) * pitch;
          const jy = hash2(col, row * 3 + k, seed + 2) * pitch;
          const r = pitch * (0.09 + 0.13 * hash2(col + k, row, seed + 3));
          const tone = (hash2(col, row + k, seed + 4) - 0.5) * 0.3;
          dot(c, x + jx, y + jy, r, tone);
        }
      });
      break;
    }
    case "checker": {
      const t = s * 1.8;
      lattice(c, t, t, (col, row, x, y) => {
        if ((col + row) % 2 !== 0) return;
        rectFill(c, { x, y, w: t, h: t }, -0.1);
      });
      break;
    }

    // ---------------- mineral ----------------
    case "marble": {
      // Veins are anchored to GLOBAL space, not to the clip rect, so a
      // vein runs unbroken across every cell of the room instead of
      // restarting per square. Each major vein carries finer tributaries,
      // which is what stops it reading as a few stray pencil lines.
      const band = Math.max(6, s * 2.6);
      const first = Math.floor((c.clip.y - c.oy) / band) - 1;
      const last = Math.ceil((c.clip.y + c.clip.h - c.oy) / band) + 1;
      const step = Math.max(2.5, s * 0.6);
      for (let v = first; v <= last; v++) {
        const y0 = c.oy + v * band + (hash2(v, 3, seed) - 0.5) * band * 0.5;
        let px = c.clip.x - step;
        let py = y0;
        for (let x = c.clip.x - step; x < c.clip.x + c.clip.w + step; x += step) {
          const ny =
            y0 + (valueNoise(x / (s * 4), v * 3.7, seed) - 0.5) * band * (0.7 + j);
          seg(c, px, py, x + step, ny, -0.12, 0.55);
          // Tributary, offset and lighter.
          seg(c, px, py + band * 0.22, x + step, ny + band * 0.26, -0.05, 0.25);
          seg(c, px, py - band * 0.3, x + step, ny - band * 0.24, -0.035, 0.2);
          px = x + step;
          py = ny;
        }
      }
      break;
    }
    case "concrete": {
      const pitch = Math.max(2.2, s * 0.42);
      lattice(c, pitch, pitch, (col, row, x, y) => {
        const n = hash2(col, row, seed);
        if (n < 0.55) return;
        dot(c, x + hash2(col, row, seed + 1) * pitch, y + hash2(col, row, seed + 2) * pitch, pitch * 0.13, -0.1);
      });
      break;
    }
    case "gravel": {
      const pitch = Math.max(3, s * 0.8);
      lattice(c, pitch, pitch, (col, row, x, y) => {
        const r = pitch * (0.14 + 0.2 * hash2(col, row, seed));
        dot(
          c,
          x + hash2(col, row, seed + 1) * pitch,
          y + hash2(col, row, seed + 2) * pitch,
          r,
          (hash2(col, row, seed + 3) - 0.5) * 0.22,
        );
      });
      break;
    }

    // ---------------- soft goods ----------------
    case "carpet": {
      const pitch = Math.max(1.6, s * 0.3);
      lattice(c, pitch, pitch * 1.6, (col, row, x, y) => {
        const jx = (hash2(col, row, seed) - 0.5) * pitch * 0.6;
        seg(c, x + jx, y, x + jx, y + pitch * 1.2, -0.07, 0.22);
      });
      break;
    }
    case "linenWeave":
    case "burlap": {
      const pitch = p.family === "burlap" ? Math.max(2.4, s * 0.5) : Math.max(1.6, s * 0.32);
      const wgt = p.family === "burlap" ? 0.42 : 0.26;
      parallelLines(c, pitch, 0, -0.07, wgt);
      parallelLines(c, pitch, Math.PI / 2, -0.07, wgt);
      break;
    }
    case "parchment": {
      // Broad soft mottling plus a fine speckle.
      const pitch = Math.max(6, s * 2);
      lattice(c, pitch, pitch, (col, row, x, y) => {
        const n = valueNoise(col * 0.7, row * 0.7, seed);
        dot(c, x + pitch / 2, y + pitch / 2, pitch * 0.42, (n - 0.5) * 0.14);
      });
      const fine = Math.max(2.5, s * 0.5);
      lattice(c, fine, fine, (col, row, x, y) => {
        if (hash2(col, row, seed + 9) < 0.72) return;
        dot(c, x + fine * 0.5, y + fine * 0.5, fine * 0.1, -0.07);
      });
      break;
    }

    // ---------------- organic ----------------
    case "straw": {
      const pitch = Math.max(3, s * 0.75);
      lattice(c, pitch, pitch, (col, row, x, y) => {
        const a = hash2(col, row, seed) * Math.PI;
        const len = pitch * (0.7 + 0.6 * hash2(col, row, seed + 1));
        const cx = x + hash2(col, row, seed + 2) * pitch;
        const cy = y + hash2(col, row, seed + 3) * pitch;
        seg(
          c,
          cx - (Math.cos(a) * len) / 2,
          cy - (Math.sin(a) * len) / 2,
          cx + (Math.cos(a) * len) / 2,
          cy + (Math.sin(a) * len) / 2,
          -0.09,
          0.3,
        );
      });
      break;
    }
    case "grass": {
      const pitch = Math.max(2.6, s * 0.55);
      lattice(c, pitch, pitch, (col, row, x, y) => {
        const cx = x + hash2(col, row, seed) * pitch;
        const cy = y + hash2(col, row, seed + 1) * pitch;
        const h = pitch * (0.5 + 0.5 * hash2(col, row, seed + 2));
        const lean = (hash2(col, row, seed + 3) - 0.5) * pitch * 0.45;
        seg(c, cx, cy, cx + lean, cy + h, -0.1, 0.28);
      });
      break;
    }
    case "soilRows": {
      // A tilled bed, not a set of ruled lines: each furrow is a dark
      // trench with a lit ridge beside it, the row wanders slightly, and
      // clods of earth sit between. The paired dark/light stroke is what
      // gives it depth — a single stroke reads as wood grain.
      const pitch = Math.max(4, s * 1.1);
      const vertical = Math.abs(Math.sin(p.angle)) > 0.5;
      const along = vertical ? c.clip.h : c.clip.w;
      const across = vertical ? c.clip.w : c.clip.h;
      const originAcross = vertical ? c.ox : c.oy;
      const clipAcross = vertical ? c.clip.x : c.clip.y;
      const first = Math.floor((clipAcross - originAcross) / pitch) - 1;
      const last = Math.ceil((clipAcross + across - originAcross) / pitch) + 1;
      const step = Math.max(3, s * 0.9);
      for (let i = first; i <= last; i++) {
        const base = originAcross + i * pitch;
        const startAlong = (vertical ? c.clip.y : c.clip.x) - step;
        const endAlong = startAlong + along + step * 2;
        let prev = startAlong;
        let prevOff = 0;
        for (let t = startAlong; t < endAlong; t += step) {
          const off = (valueNoise(t / (s * 6), i * 2.3, seed) - 0.5) * pitch * 0.28 * (0.5 + j);
          if (vertical) {
            seg(c, base + prevOff, prev, base + off, t + step, -0.13, 0.6);
            seg(c, base + prevOff + pitch * 0.34, prev, base + off + pitch * 0.34, t + step, 0.07, 0.4);
          } else {
            seg(c, prev, base + prevOff, t + step, base + off, -0.13, 0.6);
            seg(c, prev, base + prevOff + pitch * 0.34, t + step, base + off + pitch * 0.34, 0.07, 0.4);
          }
          prev = t + step;
          prevOff = off;
        }
      }
      // Clods.
      const fine = Math.max(2.6, s * 0.55);
      lattice(c, fine, fine, (col, row, x, y) => {
        if (hash2(col, row, seed + 4) < 0.68) return;
        dot(
          c,
          x + hash2(col, row, seed + 5) * fine,
          y + hash2(col, row, seed + 6) * fine,
          fine * (0.1 + 0.09 * hash2(col, row, seed + 7)),
          -0.1,
        );
      });
      break;
    }
    case "water": {
      const pitch = Math.max(3, s * 0.8);
      const rows = Math.ceil(c.clip.h / pitch) + 2;
      for (let i = -1; i < rows; i++) {
        const yy = c.oy + Math.round((c.clip.y - c.oy) / pitch + i) * pitch;
        let px = c.clip.x - 2;
        let py = yy;
        const step = Math.max(3, s * 0.7);
        for (let x = c.clip.x - 2; x < c.clip.x + c.clip.w + 2; x += step) {
          const ny = yy + Math.sin((x / (s * 2)) + i) * pitch * 0.22;
          seg(c, px, py, x + step, ny, -0.09, 0.35);
          px = x + step;
          py = ny;
        }
      }
      break;
    }

    // ---------------- manufactured ----------------
    case "metalBrushed": {
      const pitch = Math.max(1.1, s * 0.22);
      const a = p.angle;
      // Varying weight per line is what makes it read as brushed rather
      // than as plain hatching.
      const steps = Math.ceil(((c.clip.w + c.clip.h) * 1.5) / pitch);
      for (let i = -steps; i <= steps; i++) {
        const t = hash2(i, 0, seed);
        if (t < 0.35) continue;
        parallelLinesSingle(c, pitch, a, i, -0.05 - t * 0.05, 0.18 + t * 0.2);
      }
      break;
    }
    case "tinCeiling": {
      const t = s * 2.6;
      lattice(c, t, t, (col, row, x, y) => {
        seg(c, x, y, x + t, y, -0.11, 0.5);
        seg(c, x, y, x, y + t, -0.11, 0.5);
        const inset = t * 0.22;
        const r: Rect = { x: x + inset, y: y + inset, w: t - inset * 2, h: t - inset * 2 };
        seg(c, r.x, r.y, r.x + r.w, r.y, -0.08, 0.35);
        seg(c, r.x, r.y + r.h, r.x + r.w, r.y + r.h, -0.08, 0.35);
        seg(c, r.x, r.y, r.x, r.y + r.h, -0.08, 0.35);
        seg(c, r.x + r.w, r.y, r.x + r.w, r.y + r.h, -0.08, 0.35);
        dot(c, x + t / 2, y + t / 2, t * 0.09, -0.1);
      });
      break;
    }
    case "diamondPlate": {
      const t = s * 1.5;
      lattice(c, t, t, (col, row, x, y) => {
        const up = (col + row) % 2 === 0;
        const a = up ? Math.PI / 4 : -Math.PI / 4;
        const len = t * 0.62;
        const cx = x + t / 2;
        const cy = y + t / 2;
        seg(
          c,
          cx - (Math.cos(a) * len) / 2,
          cy - (Math.sin(a) * len) / 2,
          cx + (Math.cos(a) * len) / 2,
          cy + (Math.sin(a) * len) / 2,
          -0.13,
          0.8,
        );
      });
      break;
    }

    // ---------------- ornamental ----------------
    case "damask": {
      const t = s * 3;
      lattice(c, t, t, (col, row, x, y) => {
        const cx = x + t / 2;
        const cy = y + t / 2;
        // A lozenge with a small rosette — enough to read as figured
        // wallpaper at print size without any of it competing with text.
        seg(c, cx, cy - t * 0.4, cx + t * 0.32, cy, -0.09, 0.35);
        seg(c, cx + t * 0.32, cy, cx, cy + t * 0.4, -0.09, 0.35);
        seg(c, cx, cy + t * 0.4, cx - t * 0.32, cy, -0.09, 0.35);
        seg(c, cx - t * 0.32, cy, cx, cy - t * 0.4, -0.09, 0.35);
        dot(c, cx, cy, t * 0.1, -0.08);
        dot(c, cx, cy - t * 0.26, t * 0.05, -0.07);
        dot(c, cx, cy + t * 0.26, t * 0.05, -0.07);
      });
      break;
    }
    case "hatch":
      parallelLines(c, Math.max(1.6, s * 0.45), p.angle, -0.08, 0.28);
      break;
    case "crosshatch":
      parallelLines(c, Math.max(1.8, s * 0.5), p.angle, -0.07, 0.26);
      parallelLines(c, Math.max(1.8, s * 0.5), p.angle + Math.PI / 2, -0.07, 0.26);
      break;
    case "stipple": {
      const pitch = Math.max(2.2, s * 0.45);
      lattice(c, pitch, pitch, (col, row, x, y) => {
        if (hash2(col, row, seed) < 0.5) return;
        dot(c, x + hash2(col, row, seed + 1) * pitch, y + hash2(col, row, seed + 2) * pitch, pitch * 0.12, -0.09);
      });
      break;
    }
    case "plain":
    default:
      break;
  }
}
/* eslint-enable complexity */

/** One line of a parallel family, indexed — used by brushed metal for per-line weight. */
function parallelLinesSingle(
  c: Ctx,
  spacing: number,
  angle: number,
  index: number,
  delta: number,
  width: number,
): void {
  const { clip } = c;
  const cx = clip.x + clip.w / 2;
  const cy = clip.y + clip.h / 2;
  const dx = Math.cos(angle);
  const dy = Math.sin(angle);
  const nx = -dy;
  const ny = dx;
  const reach = (Math.abs(clip.w) + Math.abs(clip.h)) * 0.75;
  const anchor = (c.ox * nx + c.oy * ny) % spacing;
  const off = index * spacing - anchor;
  const px = cx + nx * off;
  const py = cy + ny * off;
  seg(c, px - dx * reach, py - dy * reach, px + dx * reach, py + dy * reach, delta, width);
}

/**
 * Paints one cell's worth of a texture.
 *
 * `origin` is the GRID origin, not the cell's — that's what makes a bond
 * or weave continue across every cell of a room instead of restarting.
 */
export function paintTextureCell(
  page: PDFPage,
  cell: Rect,
  origin: { x: number; y: number },
  params: TextureParams,
  baseFill: RGB,
  palette: Palette,
  intensity: TextureIntensity = "normal",
): void {
  const scale = INTENSITY_SCALE[intensity];
  if (scale === 0 || params.family === "plain") return;
  drawFamily({
    page,
    clip: cell,
    ox: origin.x,
    oy: origin.y,
    base: baseFill,
    greyscale: palette.greyscale,
    intensity: scale,
    p: params,
  });
}

// ---------------------------------------------------------------------
// Semantic mapping: which surface belongs in which room
// ---------------------------------------------------------------------

/**
 * Keyword-driven room -> candidate surfaces. This is the part that makes
 * the engine feel authored rather than random: a Tool Shed comes out
 * stone or brick, a Stable comes out plank or straw, a Pantry comes out
 * tile. A theme pack can add rooms without touching this file — anything
 * unmatched falls through to a neutral set rather than picking something
 * absurd.
 *
 * ORDER IS SIGNIFICANT — the first entry with a matching keyword wins,
 * so the table runs most-specific to least. This is not a stylistic
 * preference: "Mess Hall" contains "hall", so a generic "hall" rule
 * placed above the mess-hall rule silently gave army canteens polished
 * marble floors. Any new keyword that is a substring of an existing one
 * belongs ABOVE it, and roomSurfaceMapping tests pin the cases that
 * actually collide.
 */
const ROOM_SURFACES: readonly { keywords: readonly string[]; families: readonly TextureFamily[] }[] = [
  // --- compound names first: each contains a word a later rule also uses ---
  { keywords: ["mess hall", "mess tent", "canteen", "dining", "galley"], families: ["checker", "tileSquare", "linenWeave"] },
  { keywords: ["servants' hall", "servant", "quarters", "barracks", "bunk", "cabin"], families: ["woodPlank", "linenWeave", "stoneBlock"] },
  { keywords: ["hallway", "corridor", "passage", "stair", "landing"], families: ["tileSquare", "parquet", "marble"] },
  { keywords: ["tool shed", "potting shed", "shed"], families: ["stoneBlock", "brickRunning", "cobble"] },
  { keywords: ["cold store", "storeroom", "store"], families: ["tileHex", "concrete", "tileSquare"] },
  { keywords: ["drawing room", "sitting room", "living room", "lounge"], families: ["damask", "carpet", "parquet"] },

  // --- wet / tiled service rooms ---
  { keywords: ["pantry", "scullery", "larder", "washroom"], families: ["tileHex", "tileSquare", "subwayTile"] },
  { keywords: ["kitchen", "bath", "infirmary", "surgery"], families: ["subwayTile", "tileSquare", "checker"] },

  // --- stone / utility ---
  { keywords: ["cellar", "basement", "boiler", "dungeon", "crypt", "vault"], families: ["stoneBlock", "brickRunning", "cobble"] },
  { keywords: ["silo", "supply", "loading", "quartermaster", "depot"], families: ["concrete", "diamondPlate", "metalBrushed"] },
  { keywords: ["forge", "workshop", "engine", "boiler room"], families: ["diamondPlate", "metalBrushed", "rubble"] },

  // --- agricultural ---
  //
  // These five bands are deliberately WIDER than they look like they
  // need to be. Farm themes put Barn, Hayloft, Stable, Milking Parlor
  // and Chicken Coop in one puzzle, and every one of them is
  // agricultural — with the narrow two-family bands these used to have,
  // 86 of the 2,688 possible room combinations could not be given a
  // distinct floor each (see the distinct-surfaces test). Every addition
  // below is a real floor for the room, not padding: barns and stables
  // genuinely run to packed earth and poured concrete, garden paths to
  // gravel and flagstone, working yards to hardpack and setts.
  { keywords: ["hayloft", "loft", "coop", "chicken"], families: ["straw", "woodPlank", "burlap", "soilRows"] },
  { keywords: ["stable", "barn", "milking", "parlor", "parlour"], families: ["woodPlank", "straw", "cobble", "soilRows", "concrete"] },
  { keywords: ["garden", "patch", "orchard", "field", "vegetable"], families: ["soilRows", "grass", "gravel", "stoneBlock"] },
  { keywords: ["yard", "range", "campfire", "ring", "lawn", "paddock"], families: ["grass", "gravel", "cobble", "soilRows"] },

  // --- water ---
  { keywords: ["dock", "boathouse", "pier", "lake", "pool", "jetty"], families: ["water", "woodPlank", "concrete", "metalBrushed"] },

  // --- grand interiors (generic "hall" lives here, deliberately last of its kind) ---
  { keywords: ["ballroom", "gallery", "foyer", "atrium", "great hall", "hall"], families: ["parquet", "marble", "checker"] },
  { keywords: ["library", "study", "office", "den"], families: ["parquet", "carpet", "woodPlank"] },
  { keywords: ["conservatory", "greenhouse", "solarium"], families: ["tileSquare", "grass", "terrazzo"] },
  { keywords: ["billiard", "games", "smoking"], families: ["carpet", "parquet", "damask"] },
  { keywords: ["wine", "press", "cider", "brewery"], families: ["stoneBlock", "cobble", "brickRunning"] },
  { keywords: ["craft", "lodge", "nature", "center", "centre"], families: ["woodPlank", "burlap", "parquet"] },
  { keywords: ["tower", "lookout", "attic", "belfry"], families: ["woodPlank", "stoneBlock", "tinCeiling"] },
];

/** Neutral surfaces for a room whose name matched nothing. */
const FALLBACK_SURFACES: readonly TextureFamily[] = [
  "parquet",
  "tileSquare",
  "linenWeave",
  "concrete",
  "woodPlank",
  "stoneBlock",
];

/**
 * The band slug a room belongs to — "barn-stable", "pantry", "generic".
 *
 * Exported because the art pack files its floors by band: the folders
 * under assets/packs/<pack>/floors/ are these slugs. Deriving the slug
 * here rather than repeating the keyword table in art.ts keeps one
 * definition of which rooms are the same kind of room.
 */
export function roomTypeSlug(roomName: string): string {
  const n = roomName.toLowerCase();
  const index = ROOM_SURFACES.findIndex((e) => e.keywords.some((k) => n.includes(k)));
  if (index < 0) return "generic";
  return BAND_SLUGS[index]!;
}

/**
 * One slug per ROOM_SURFACES band, in the same order. Kept as a list
 * beside the table rather than derived from the first keyword, because a
 * folder name is a published path — renaming a keyword must not silently
 * rename a directory full of artwork.
 */
const BAND_SLUGS: readonly string[] = [
  "mess-hall",
  "servants-quarters",
  "hallway",
  "shed",
  "storeroom",
  "drawing-room",
  "pantry",
  "kitchen",
  "cellar",
  "silo-depot",
  "forge-workshop",
  "hayloft-coop",
  "barn-stable",
  "garden",
  "yard",
  "dock",
  "ballroom-hall",
  "library-study",
  "conservatory",
  "billiard-games",
  "winery",
  "lodge",
  "tower-attic",
];

/**
 * The candidate surfaces a room's NAME admits — the semantic band it
 * belongs to. Exported because it is the contract the distinct-surface
 * assignment is checked against: a Barn may be plank, straw, cobble,
 * packed earth or concrete, and must never be marble, whatever else the
 * puzzle needs.
 */
export function candidateFamilies(roomName: string): readonly TextureFamily[] {
  const n = roomName.toLowerCase();
  const entry = ROOM_SURFACES.find((e) => e.keywords.some((k) => n.includes(k)));
  return entry ? entry.families : FALLBACK_SURFACES;
}

/** The seeded parameter set for one (room, family) pair. */
function paramsFor(family: TextureFamily, roomName: string, seed: number): TextureParams {
  const r = (salt: number) => hash2(seed, salt, roomName.charCodeAt(0) || 1);
  return {
    family,
    scale: 3.4 + r(1) * 3.6,
    // Most surfaces read best axis-aligned; the ones that don't get a
    // gentle tilt rather than an arbitrary one.
    angle:
      family === "hatch" || family === "crosshatch" || family === "metalBrushed"
        ? (Math.PI / 4) * (0.6 + r(2) * 0.8)
        : family === "soilRows"
          ? (r(2) < 0.5 ? 0 : Math.PI / 2)
          : 0,
    jitter: 0.3 + r(3) * 0.6,
    contrast: 0.75 + r(4) * 0.5,
    seed: Math.floor(r(5) * 1e9),
  };
}

/**
 * Picks a surface for a room, and a full seeded parameter set for it.
 *
 * The family is chosen from the room's semantic candidates, and *which*
 * candidate, at what scale/angle/jitter, is driven by the seed — so the
 * same Tool Shed is stone in every book but a visibly different stone,
 * which is what varies the page-level perceptual hash between exports
 * without ever making a room look wrong for its name.
 *
 * Use this for a room considered alone. For the rooms of one puzzle use
 * `surfacesForRooms`, which adds the distinctness guarantee.
 */
export function surfaceForRoom(roomName: string, seed: number): TextureParams {
  const families = candidateFamilies(roomName);
  const pick = families[Math.floor(hash2(seed, roomName.length, 17) * families.length) % families.length]!;
  return paramsFor(pick, roomName, seed);
}

/**
 * Picks a surface for every room of ONE puzzle, with no two rooms
 * sharing a material.
 *
 * Two rules are in tension here and both have to hold. Every room must
 * stay inside its own semantic band — a barn floor belongs in barns —
 * and no two rooms on a page may share a floor, because a repeated
 * material reads as one room split in half and undoes the whole point of
 * drawing surfaces at all. Picking greedily satisfies neither reliably:
 * with narrow bands an early room can take the only material a later one
 * had, when a different early pick would have left everyone served.
 *
 * So this is a bipartite matching (rooms to materials) solved by
 * augmenting paths, which finds a distinct assignment whenever one
 * exists. Rooms are offered in ascending order of band width so the
 * tightest rooms are served first, and each room's candidates are
 * rotated by its own seed so the assignment still varies book to book.
 *
 * If a set genuinely cannot be satisfied — no theme's rooms do, and the
 * distinct-surfaces test holds that line across all 2,688 combinations —
 * the leftover rooms fall back to their solo pick rather than throwing.
 * A duplicated floor is a blemish; a failed render is a lost book.
 */
export function surfacesForRooms(roomNames: readonly string[], seed: number): TextureParams[] {
  const bands = roomNames.map((name, i) => {
    const families = candidateFamilies(name);
    // Rotate each room's candidate order by its own seed: the matching
    // takes the first workable option, so the rotation is what makes the
    // same floor plan come out differently in the next book.
    const off = Math.floor(hash2(seed, name.length, 17 + i) * families.length) % families.length;
    return {
      i,
      order: families.map((_, k) => families[(off + k) % families.length]!),
    };
  });

  // Serve the narrowest bands first — a Hayloft with four candidates has
  // to be placed before a Library that could take any of six.
  const order = [...bands].sort((a, b) => a.order.length - b.order.length || a.i - b.i);

  const takenBy = new Map<TextureFamily, number>();
  const assigned = new Array<TextureFamily | null>(roomNames.length).fill(null);

  const tryAssign = (roomIdx: number, seen: Set<TextureFamily>): boolean => {
    const band = bands[roomIdx]!;
    for (const family of band.order) {
      if (seen.has(family)) continue;
      seen.add(family);
      const holder = takenBy.get(family);
      // Free, or its current holder can be re-seated somewhere else.
      if (holder === undefined || tryAssign(holder, seen)) {
        takenBy.set(family, roomIdx);
        assigned[roomIdx] = family;
        return true;
      }
    }
    return false;
  };

  for (const band of order) tryAssign(band.i, new Set());

  return roomNames.map((name, i) => {
    const family = assigned[i];
    return family ? paramsFor(family, name, seed) : surfaceForRoom(name, seed);
  });
}
