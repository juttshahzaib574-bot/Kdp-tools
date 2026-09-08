"use client";

import { useMemo, useState } from "react";
import {
  computeCoverDimensions,
  coverBarcodeZone,
  coverPixelSize,
  formatInches,
  KDP_COVER_DPI,
  KDP_MIN_PAGES_FOR_SPINE_TEXT,
  type ColorTier,
  type InteriorColor,
  type KdpTrimSize,
  type PaperType,
} from "@kdp/shared";

// The cover, as a spec rather than as artwork.
//
// We don't design covers here and shouldn't: cover art is the biggest
// single driver of clicks on a KDP listing, and a procedurally drawn one
// would be the worst-looking thing we ship. What a publisher can't get
// from Canva is the arithmetic — the wrap size depends on the spine, the
// spine depends on the interior's page count, and getting it wrong means
// a rejected upload or spine text printed on the front cover.
//
// So this panel hands over the numbers and a blank guide to design on
// top of, and stays out of the way of the design itself.

export interface CoverSpecProps {
  trimSize: KdpTrimSize;
  interiorColor: InteriorColor;
  paperType: PaperType;
  /** Which colour tier will be ordered — the two use different paper stock, so the spine differs. */
  colorTier: ColorTier;
  /** Interior length the spine is computed from. */
  pageCount: number;
  /** False while that page count is still an estimate rather than a rendered interior. */
  pageCountIsFinal?: boolean;
  title: string;
}

/** How the wrap diagram is drawn. One inch of paper, this many SVG units. */
const SVG_UNITS_PER_IN = 40;

export function CoverSpec({
  trimSize,
  interiorColor,
  paperType,
  colorTier,
  pageCount,
  pageCountIsFinal = false,
  title,
}: CoverSpecProps) {
  const [copied, setCopied] = useState(false);
  const [building, setBuilding] = useState(false);

  const dims = useMemo(
    // A book must have at least one page for the spine maths to mean
    // anything; the estimator floors at KDP's 24-page minimum anyway.
    () =>
      computeCoverDimensions(trimSize, Math.max(1, pageCount), interiorColor, paperType, colorTier),
    [trimSize, pageCount, interiorColor, paperType, colorTier],
  );
  const barcode = useMemo(() => coverBarcodeZone(dims), [dims]);
  const pixels = useMemo(() => coverPixelSize(dims), [dims]);

  const sizeText = `${dims.fullWidthIn.toFixed(2)} x ${dims.fullHeightIn.toFixed(2)} in`;

  async function copySize() {
    try {
      await navigator.clipboard.writeText(
        `${dims.fullWidthIn.toFixed(2)} x ${dims.fullHeightIn.toFixed(2)} inches (${pixels.width} x ${pixels.height} px at ${pixels.dpi} DPI)`,
      );
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // Clipboard access can be denied outright; the numbers are on
      // screen either way, so this is not worth an error state.
      setCopied(false);
    }
  }

  /**
   * Builds the guide as a PNG at KDP's required 300 DPI and hands it to
   * the browser.
   *
   * A full-size canvas — 3759 x 2775 px for a 6x9 — is drawn once, on
   * demand, rather than kept in memory: this is a button people press
   * occasionally, and the bitmap is large.
   */
  async function downloadGuide() {
    setBuilding(true);
    try {
      const canvas = document.createElement("canvas");
      canvas.width = pixels.width;
      canvas.height = pixels.height;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      drawGuide(ctx, dims, barcode, pixels.dpi);

      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, "image/png"),
      );
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      const slug = title.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
      link.download = `${slug || "book"}-cover-guide-${trimSize}-${pageCount}pp.png`;
      link.click();
      // Revoke on the next tick — revoking synchronously can beat the
      // browser to starting the download.
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
    } finally {
      setBuilding(false);
    }
  }

  const w = dims.fullWidthIn * SVG_UNITS_PER_IN;
  const h = dims.fullHeightIn * SVG_UNITS_PER_IN;
  const u = (inches: number) => inches * SVG_UNITS_PER_IN;

  return (
    <section className="flex flex-col gap-3">
      <div>
        <h3 className="text-sm font-semibold tracking-tight">Cover</h3>
        <p className="mt-0.5 text-xs text-muted-foreground">
          KDP takes the cover as its own upload. Design it wherever you like — these are the
          numbers it has to be built to.
        </p>
      </div>

      {/* Drawn to scale from this book's real dimensions, so the spine
          visibly widens as the page count grows. */}
      <svg
        viewBox={`0 0 ${w} ${h}`}
        className="w-full rounded-md border border-border bg-white"
        role="img"
        aria-label={`Cover wrap: back cover, ${formatInches(dims.spineWidthIn)} spine, front cover, ${sizeText} overall`}
      >
        <rect x={0} y={0} width={w} height={h} fill="#ffffff" />

        {/* Bleed: trimmed off in production, so anything here is lost. */}
        <rect
          x={0}
          y={0}
          width={w}
          height={h}
          fill="none"
          stroke="#dc2626"
          strokeWidth={1}
          strokeDasharray="4 3"
        />

        {/* Back cover and front cover panels. */}
        <rect
          x={u(dims.bleedIn)}
          y={u(dims.bleedIn)}
          width={u(dims.trimWidthIn)}
          height={u(dims.trimHeightIn)}
          fill="#f8fafc"
          stroke="#94a3b8"
          strokeWidth={0.8}
        />
        <rect
          x={u(dims.spineEndXIn)}
          y={u(dims.bleedIn)}
          width={u(dims.trimWidthIn)}
          height={u(dims.trimHeightIn)}
          fill="#f8fafc"
          stroke="#94a3b8"
          strokeWidth={0.8}
        />

        {/* The spine, hatched so its real width reads at a glance. */}
        <defs>
          <pattern id="spine-hatch" width={6} height={6} patternUnits="userSpaceOnUse">
            <rect width={6} height={6} fill="#e2e8f0" />
            <path d="M0 6 L6 0" stroke="#94a3b8" strokeWidth={1} />
          </pattern>
        </defs>
        <rect
          x={u(dims.spineStartXIn)}
          y={u(dims.bleedIn)}
          width={u(dims.spineWidthIn)}
          height={u(dims.trimHeightIn)}
          fill="url(#spine-hatch)"
          stroke="#94a3b8"
          strokeWidth={0.8}
        />

        {/* Amazon prints its barcode here; artwork underneath is covered. */}
        <rect
          x={u(barcode.xIn)}
          y={u(barcode.yIn)}
          width={u(barcode.widthIn)}
          height={u(barcode.heightIn)}
          fill="#ffffff"
          stroke="#dc2626"
          strokeWidth={0.8}
          strokeDasharray="3 2"
        />
        <text
          x={u(barcode.xIn + barcode.widthIn / 2)}
          y={u(barcode.yIn + barcode.heightIn / 2) + 3}
          textAnchor="middle"
          fontSize={9}
          fill="#dc2626"
        >
          barcode
        </text>

        <text
          x={u(dims.bleedIn + dims.trimWidthIn / 2)}
          y={u(dims.bleedIn + dims.trimHeightIn / 2)}
          textAnchor="middle"
          fontSize={13}
          fill="#64748b"
          letterSpacing={1}
        >
          BACK
        </text>
        <text
          x={u(dims.spineEndXIn + dims.trimWidthIn / 2)}
          y={u(dims.bleedIn + dims.trimHeightIn / 2)}
          textAnchor="middle"
          fontSize={13}
          fill="#64748b"
          letterSpacing={1}
        >
          FRONT
        </text>
      </svg>

      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
        <dt className="text-muted-foreground">Full wrap</dt>
        <dd className="font-medium tabular-nums text-foreground">
          {sizeText}
          <span className="ml-1.5 font-normal text-muted-foreground">
            ({pixels.width} × {pixels.height} px @ {KDP_COVER_DPI} DPI)
          </span>
        </dd>

        <dt className="text-muted-foreground">Spine</dt>
        <dd className="font-medium tabular-nums text-foreground">
          {formatInches(dims.spineWidthIn)}
          <span className="ml-1.5 font-normal text-muted-foreground">
            {dims.showSpineText
              ? "· long enough for spine text"
              : `· KDP prints spine text only from ${KDP_MIN_PAGES_FOR_SPINE_TEXT} pages — leave it blank`}
          </span>
        </dd>

        <dt className="text-muted-foreground">From</dt>
        <dd className="tabular-nums text-muted-foreground">
          {pageCount} pages
          {pageCountIsFinal ? "" : " (estimated — the spine is recut from the finished interior)"}
        </dd>
      </dl>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => void copySize()}
          className="rounded-md border border-border px-2.5 py-1.5 text-xs font-medium hover:bg-muted"
        >
          {copied ? "Copied" : "Copy size"}
        </button>
        <button
          type="button"
          onClick={() => void downloadGuide()}
          disabled={building}
          className="rounded-md border border-border px-2.5 py-1.5 text-xs font-medium hover:bg-muted disabled:opacity-50"
        >
          {building ? "Building…" : "Download guide template"}
        </button>
      </div>
    </section>
  );
}

/**
 * Paints the guide: white wrap, the three panels, the spine, the bleed
 * line and the barcode reserve, all at real size.
 *
 * Drawn as guides only — no artwork, nothing a designer has to delete.
 * Dropped into Canva as a background layer, it puts the fold lines and
 * the barcode exclusion exactly where the printer will.
 */
function drawGuide(
  ctx: CanvasRenderingContext2D,
  dims: ReturnType<typeof computeCoverDimensions>,
  barcode: ReturnType<typeof coverBarcodeZone>,
  dpi: number,
) {
  const px = (inches: number) => inches * dpi;
  const width = px(dims.fullWidthIn);
  const height = px(dims.fullHeightIn);

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, height);

  // Trim line: everything outside is cut off.
  ctx.strokeStyle = "#dc2626";
  ctx.lineWidth = Math.max(2, dpi / 100);
  ctx.setLineDash([dpi / 12, dpi / 18]);
  ctx.strokeRect(px(dims.bleedIn), px(dims.bleedIn), px(dims.fullWidthIn - dims.bleedIn * 2), px(dims.trimHeightIn));

  // Spine folds.
  ctx.setLineDash([]);
  ctx.strokeStyle = "#2563eb";
  ctx.beginPath();
  ctx.moveTo(px(dims.spineStartXIn), 0);
  ctx.lineTo(px(dims.spineStartXIn), height);
  ctx.moveTo(px(dims.spineEndXIn), 0);
  ctx.lineTo(px(dims.spineEndXIn), height);
  ctx.stroke();

  // Barcode reserve.
  ctx.strokeStyle = "#dc2626";
  ctx.setLineDash([dpi / 16, dpi / 24]);
  ctx.strokeRect(px(barcode.xIn), px(barcode.yIn), px(barcode.widthIn), px(barcode.heightIn));
  ctx.setLineDash([]);

  ctx.fillStyle = "#94a3b8";
  ctx.font = `${Math.round(dpi / 4)}px sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("BACK COVER", px(dims.bleedIn + dims.trimWidthIn / 2), height / 2);
  ctx.fillText("FRONT COVER", px(dims.spineEndXIn + dims.trimWidthIn / 2), height / 2);
  ctx.font = `${Math.round(dpi / 6)}px sans-serif`;
  ctx.fillStyle = "#dc2626";
  ctx.fillText(
    "barcode area — keep clear",
    px(barcode.xIn + barcode.widthIn / 2),
    px(barcode.yIn + barcode.heightIn / 2),
  );
}
