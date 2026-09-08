"use client";

import { useEffect, useRef, useState } from "react";
import { fitPageIntoBox } from "@kdp/shared";
import { loadPdf, type PdfPageSize } from "@/lib/pdf-render";

// One PDF page, always shown whole.
//
// The bug this exists to make impossible: the carousel measured a
// container that included its own arrow buttons, padding and borders,
// rendered the page at that width, and then dropped the too-wide canvas
// into a box with `overflow: hidden`. The page was ~90px wider than the
// space it had, so roughly 45px was silently cut off each side — enough
// to slice the first letter off the title and the last off the badge.
// Nothing errored; the preview simply lied about what would print.
//
// The rule here is scale-to-fit, never crop:
//
//   The page keeps its own intrinsic coordinate space, read from the
//   file itself (`getPageSize`) rather than from a trim-size prop, so it
//   is right for any trim and correct with bleed on without anything
//   being threaded through.
//
//   THIS element is measured — not an ancestor that also holds chrome —
//   so the number used for scaling is the number of pixels the page
//   actually has.
//
//   The box is sized to the scaled page and centred, so spare space
//   becomes letterboxing around a whole page instead of a crop through
//   it. There is no `overflow: hidden` anywhere in this component.

export interface PdfPageViewProps {
  /** The file to show. A new array re-renders; the same one doesn't. */
  pdf: Uint8Array | undefined;
  /** 1-based. Out-of-range values clamp to the document's last page. */
  pageNumber?: number;
  /** Caps how wide the page may be drawn, for a page that would otherwise dominate the layout. */
  maxWidth?: number;
  /** Shown while the first render is in flight. */
  placeholder?: string;
  className?: string;
}

/** Ceiling on the rendered bitmap, in CSS px. Beyond this the extra pixels cost memory and buy nothing. */
const RENDER_WIDTH_CAP = 1200;

export function PdfPageView({
  pdf,
  pageNumber = 1,
  maxWidth,
  placeholder = "Rendering…",
  className,
}: PdfPageViewProps) {
  // The measured box, the canvas host, and the two pieces of state that
  // decide layout: how wide we may draw, and how tall the page is at
  // that width.
  const frameRef = useRef<HTMLDivElement | null>(null);
  const canvasHostRef = useRef<HTMLDivElement | null>(null);
  const [available, setAvailable] = useState(0);
  const [size, setSize] = useState<PdfPageSize | null>(null);
  const [status, setStatus] = useState<"idle" | "ready" | "error">("idle");

  // Measure this element, not a parent. contentRect already excludes
  // padding and borders, so what comes back is drawable width.
  useEffect(() => {
    const frame = frameRef.current;
    if (!frame) return;
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      setAvailable(Math.max(0, Math.floor(entry.contentRect.width)));
    });
    observer.observe(frame);
    // Seed immediately: the observer's first callback can be a frame
    // late, and a 0-width first paint would render nothing.
    setAvailable(Math.max(0, Math.floor(frame.getBoundingClientRect().width)));
    return () => observer.disconnect();
  }, []);

  // The fitting arithmetic lives in @kdp/shared, where it's tested
  // against every trim (with and without bleed) at every realistic
  // container width. The invariant those tests hold is the one this
  // component exists for: the fitted box is never wider than the space
  // it was given.
  const fit = size
    ? fitPageIntoBox({
        pageWidthPt: size.widthPt,
        pageHeightPt: size.heightPt,
        availableWidth: available,
        maxWidth: Math.min(maxWidth ?? Number.POSITIVE_INFINITY, RENDER_WIDTH_CAP),
      })
    : { scale: 0, width: 0, height: 0 };
  const drawWidth = fit.width;
  const drawHeight = fit.height;

  useEffect(() => {
    let cancelled = false;
    const host = canvasHostRef.current;
    if (!host || !pdf || available <= 0) return;

    void (async () => {
      try {
        const doc = await loadPdf(pdf);
        try {
          const page = Math.max(1, Math.min(pageNumber, doc.numPages));
          const intrinsic = await doc.getPageSize(page);
          if (cancelled) return;
          setSize(intrinsic);

          const target = fitPageIntoBox({
            pageWidthPt: intrinsic.widthPt,
            pageHeightPt: intrinsic.heightPt,
            availableWidth: available,
            maxWidth: Math.min(maxWidth ?? Number.POSITIVE_INFINITY, RENDER_WIDTH_CAP),
          });
          if (target.width <= 0) return;
          const canvas = await doc.renderPage(page, target.width);
          if (cancelled) return;
          // The host holds canvases this effect appends imperatively and
          // React never manages, so clearing it by hand is safe — see
          // the same pattern's note in puzzle-carousel.tsx.
          while (host.firstChild) host.removeChild(host.firstChild);
          host.appendChild(canvas);
          setStatus("ready");
        } finally {
          await doc.destroy();
        }
      } catch (error) {
        if (!cancelled) {
          setStatus("error");
          console.error("PdfPageView render failed", error);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [pdf, pageNumber, available, maxWidth]);

  return (
    <div ref={frameRef} className={`flex w-full justify-center ${className ?? ""}`}>
      {/* The page box: exactly the scaled page, centred. Whatever space
          is left over is padding around it — never a crop through it. */}
      <div
        className="relative flex items-center justify-center"
        style={{
          width: drawWidth || undefined,
          height: drawHeight || undefined,
          minHeight: drawHeight ? undefined : 120,
        }}
      >
        <div ref={canvasHostRef} className="flex items-center justify-center" />
        {status !== "ready" ? (
          <span className="absolute text-[11px] text-muted-foreground">
            {status === "error" ? "Preview unavailable" : placeholder}
          </span>
        ) : null}
      </div>
    </div>
  );
}
