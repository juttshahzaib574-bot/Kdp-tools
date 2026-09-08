import type { PDFPage } from "pdf-lib";

// A development-time assertion that nothing is drawn outside the page's
// safe area.
//
// Print layout fails silently. A room label that runs 3pt past the
// margin, an axis numeral sitting in the gutter, a title that overflows
// at one trim size and not another — none of it throws, none of it shows
// up in a unit test that only checks page counts, and all of it reaches
// the reader as a page that looks subtly wrong or, at KDP's trimming
// tolerance, gets cut off.
//
// So every draw call is checked against the content box while
// NODE_ENV isn't "production": the page object handed to the layout code
// is wrapped, each call's rectangle is computed, and anything crossing
// the boundary throws with the element named. The wrapper is transparent
// otherwise — unknown methods and properties pass straight through — and
// it is never installed in a production build, so the shipping renderer
// pays nothing for it.

export interface BoundsRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Slack, in points, before a violation is reported.
 *
 * Glyph metrics are approximations — a font's advance width is not its
 * inked width, and descenders reach below the baseline by an amount only
 * the outline knows — so a hairline of tolerance keeps the guard
 * reporting real layout mistakes rather than rounding.
 */
const TOLERANCE_PT = 0.75;

export class PageBoundsError extends Error {
  constructor(
    message: string,
    readonly element: string,
    readonly rect: BoundsRect,
    readonly safe: BoundsRect,
  ) {
    super(message);
    this.name = "PageBoundsError";
  }
}

/** Whether the guard should be installed at all. Off in production builds. */
export function boundsGuardEnabled(): boolean {
  return typeof process !== "undefined" && process.env?.NODE_ENV !== "production";
}

function describe(rect: BoundsRect, safe: BoundsRect): string {
  const overflow: string[] = [];
  if (rect.x < safe.x - TOLERANCE_PT) overflow.push(`${(safe.x - rect.x).toFixed(2)}pt past the left`);
  if (rect.x + rect.width > safe.x + safe.width + TOLERANCE_PT) {
    overflow.push(`${(rect.x + rect.width - safe.x - safe.width).toFixed(2)}pt past the right`);
  }
  if (rect.y < safe.y - TOLERANCE_PT) overflow.push(`${(safe.y - rect.y).toFixed(2)}pt below the bottom`);
  if (rect.y + rect.height > safe.y + safe.height + TOLERANCE_PT) {
    overflow.push(`${(rect.y + rect.height - safe.y - safe.height).toFixed(2)}pt above the top`);
  }
  return overflow.join(", ");
}

/** Normalises a rect that may have been given with negative width/height. */
function normalize(x: number, y: number, width: number, height: number): BoundsRect {
  return {
    x: width < 0 ? x + width : x,
    y: height < 0 ? y + height : y,
    width: Math.abs(width),
    height: Math.abs(height),
  };
}

type DrawOptions = Record<string, unknown>;

function num(value: unknown, fallback = 0): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

/**
 * The rectangle a draw call covers, or null when the call carries no
 * geometry the guard can judge.
 */
function rectFor(method: string, args: unknown[]): { rect: BoundsRect; label: string } | null {
  if (method === "drawText") {
    const text = String(args[0] ?? "");
    const options = (args[1] ?? {}) as DrawOptions;
    const size = num(options.size, 12);
    const font = options.font as { widthOfTextAtSize?: (t: string, s: number) => number } | undefined;
    const width = font?.widthOfTextAtSize ? font.widthOfTextAtSize(text, size) : text.length * size * 0.5;
    const x = num(options.x);
    const y = num(options.y);
    // pdf-lib places text on its BASELINE. Ascenders rise above it and
    // descenders fall below, so the inked box is taller than `size` and
    // starts below y.
    return {
      rect: normalize(x, y - size * 0.25, width, size * 1.05),
      label: `text ${JSON.stringify(text.length > 40 ? `${text.slice(0, 40)}…` : text)}`,
    };
  }

  if (method === "drawRectangle") {
    const options = (args[0] ?? {}) as DrawOptions;
    return {
      rect: normalize(num(options.x), num(options.y), num(options.width), num(options.height)),
      label: "rectangle",
    };
  }

  if (method === "drawLine") {
    const options = (args[0] ?? {}) as DrawOptions;
    const start = (options.start ?? {}) as DrawOptions;
    const end = (options.end ?? {}) as DrawOptions;
    const x1 = num(start.x);
    const y1 = num(start.y);
    const x2 = num(end.x);
    const y2 = num(end.y);
    // A stroke straddles its path, so half the thickness sits either side.
    const half = num(options.thickness, 1) / 2;
    return {
      rect: normalize(
        Math.min(x1, x2) - half,
        Math.min(y1, y2) - half,
        Math.abs(x2 - x1) + half * 2,
        Math.abs(y2 - y1) + half * 2,
      ),
      label: "line",
    };
  }

  if (method === "drawCircle" || method === "drawEllipse") {
    const options = (args[0] ?? {}) as DrawOptions;
    const rx = num(options.xScale, num(options.size, 0));
    const ry = num(options.yScale, num(options.size, 0));
    return {
      rect: normalize(num(options.x) - rx, num(options.y) - ry, rx * 2, ry * 2),
      label: method === "drawCircle" ? "circle" : "ellipse",
    };
  }

  // drawSvgPath and drawImage carry geometry this can't cheaply bound;
  // they're drawn inside already-checked rectangles here.
  return null;
}

/**
 * Wraps a page so every draw call is checked against `safe`.
 *
 * Returns the page unchanged when the guard is disabled, so the caller
 * can install it unconditionally.
 */
export function guardPageBounds(page: PDFPage, safe: BoundsRect, context: string): PDFPage {
  if (!boundsGuardEnabled()) return page;

  return new Proxy(page, {
    get(target, property, receiver) {
      const value = Reflect.get(target, property, receiver);
      if (typeof value !== "function" || typeof property !== "string") return value;
      if (!property.startsWith("draw")) return value.bind(target);

      return (...args: unknown[]) => {
        const measured = rectFor(property, args);
        if (measured) {
          const overflow = describe(measured.rect, safe);
          if (overflow) {
            throw new PageBoundsError(
              `${context}: ${measured.label} is outside the page safe area — ${overflow}. ` +
                `Element at (${measured.rect.x.toFixed(1)}, ${measured.rect.y.toFixed(1)}) ` +
                `${measured.rect.width.toFixed(1)}x${measured.rect.height.toFixed(1)}pt; ` +
                `safe area is (${safe.x.toFixed(1)}, ${safe.y.toFixed(1)}) ` +
                `${safe.width.toFixed(1)}x${safe.height.toFixed(1)}pt.`,
              measured.label,
              measured.rect,
              safe,
            );
          }
        }
        return (value as (...a: unknown[]) => unknown).apply(target, args);
      };
    },
  });
}
