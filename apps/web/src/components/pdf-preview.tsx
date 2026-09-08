"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { RenderCustomPage } from "@kdp/generator-grid-mystery";
import {
  checkKdpLimits,
  type ColorTier,
  type DifficultyTier,
  type InteriorColor,
  type KdpTrimSize,
  type MysteryThemeId,
  type PageOverride,
  type PaperType,
} from "@kdp/shared";
import { ShipPanel } from "@/components/ship-panel";
import type { BookPuzzleSpec } from "@/components/puzzle-carousel";
import type {
  PuzzlePreviewRequest,
  PuzzlePreviewResponse,
} from "@/workers/puzzle-preview.worker";
import { loadPdf, type LoadedPdf } from "@/lib/pdf-render";

const DEBOUNCE_MS = 700;
const THUMB_WIDTH = 88;

export interface PdfPreviewProps {
  title: string;
  authorName: string;
  subtitle: string;
  gridSize: number;
  difficulty: DifficultyTier;
  /** Content pack the sampled puzzle draws from. */
  theme: MysteryThemeId;
  /** Interior print colour — full colour by default. */
  interiorColor: InteriorColor;
  bleed: boolean;
  trimSize: KdpTrimSize;
  includeAnswerKey: boolean;
  pageOverrides: Record<string, PageOverride>;
  includeTitlePage: boolean;
  includeCopyrightPage: boolean;
  includeHowToSolvePage: boolean;
  includeReviewRequestPage: boolean;
  pageImages: Record<string, string>;
  customPages: RenderCustomPage[];
  frontMatterOrder: string[];
  backMatterOrder: string[];
  disabledPageKeys: string[];
  /** Book-level settings the ship rail needs; none of them change the preview render. */
  paperType: PaperType;
  colorTier: ColorTier;
  /** Front/back matter pages actually included — this moves the spine, so it can't be assumed. */
  matterPages: number;
  /** The book's own puzzles. The preview renders all of them; empty means no book yet. */
  bookPuzzles: BookPuzzleSpec[];
  puzzleCount: number;
  puzzlesPerSpread: "packed" | "onePerSpread";
  /** Sends the book to the worker — the same export the Customize tab runs. */
  onExport: () => void;
  exporting: boolean;
}

/**
 * A real, gold-standard PDF viewer for the full book export — thumbnails
 * down the left, selected page centered in the main pane, zoom controls,
 * keyboard nav. Rebuilds the PDF on every meaningful input change (same
 * debounced pipeline the earlier preview used) but no longer just shoves
 * the file into an iframe: pdfjs renders each page to a real canvas at
 * whatever size the layout asks for, so what you see is really the file.
 *
 * Thumbnails and main pane both draw from the same loaded pdfjs document,
 * so paging is instant after the doc has been fetched — no extra load per
 * page. On narrow screens (< md) the thumbnails collapse to a horizontal
 * strip above the main pane, so the viewer stays usable on a phone.
 */
export function PdfPreview(props: PdfPreviewProps) {
  const {
    title,
    authorName,
    subtitle,
    gridSize,
    difficulty,
    theme,
    interiorColor,
    bleed,
    trimSize,
    includeAnswerKey,
    pageOverrides,
    includeTitlePage,
    includeCopyrightPage,
    includeHowToSolvePage,
    includeReviewRequestPage,
    pageImages,
    customPages,
    frontMatterOrder,
    backMatterOrder,
    disabledPageKeys,
    paperType,
    colorTier,
    matterPages,
    bookPuzzles,
    puzzleCount,
    puzzlesPerSpread,
    onExport,
    exporting,
  } = props;

  const hasRequiredFields = title.trim().length > 0 && authorName.trim().length > 0;

  /**
   * What the book's puzzles actually ARE, as one string.
   *
   * The preview rebuilds when this changes and not when the array's
   * identity does. Every reload of the puzzle list produces a new array
   * for the same book, and rebuilding a hundred puzzles because a fetch
   * returned is exactly the kind of work that makes a tab feel broken.
   * Seeds and overrides are the whole input: same signature, same PDF.
   */
  const bookSignature = useMemo(
    () =>
      bookPuzzles
        .map(
          (p) =>
            `${p.seed}:${p.gridSize}:${p.difficulty}:${p.overrides ? JSON.stringify(p.overrides) : ""}`,
        )
        .join("|"),
    [bookPuzzles],
  );

  const workerRef = useRef<Worker | null>(null);
  const requestIdRef = useRef(0);
  const docRef = useRef<LoadedPdf | null>(null);
  const imageBytesCache = useRef<Map<string, ArrayBuffer>>(new Map());

  const [status, setStatus] = useState<"idle" | "generating" | "ready" | "error">(
    hasRequiredFields ? "generating" : "idle",
  );
  const [error, setError] = useState<string | null>(null);
  const [numPages, setNumPages] = useState(0);
  const [pageNum, setPageNum] = useState(1);
  const [zoom, setZoom] = useState(1);
  // Bumped whenever a fresh PDF has finished loading — child renderers
  // (thumbnails, main page) key off it to know they should re-render.
  const [docTick, setDocTick] = useState(0);
  /** Puzzles built so far, while the whole book is being assembled. */
  const [progress, setProgress] = useState<{ built: number; total: number } | null>(null);
  /** Puzzles in the document currently on screen — the real count, not an estimate. */
  const [builtPuzzles, setBuiltPuzzles] = useState(0);

  useEffect(() => {
    // Loaded from /public/workers/ — pre-bundled by scripts/build-workers.mjs
    // rather than the Turbopack `new URL('./worker', import.meta.url)`
    // pattern (see the script's own header for why).
    const worker = new Worker("/workers/puzzle-preview.worker.js");
    workerRef.current = worker;

    worker.onmessage = async (event: MessageEvent<PuzzlePreviewResponse>) => {
      const data = event.data;
      if (data.requestId !== requestIdRef.current) return;
      // A hundred-puzzle book takes real time to build. Reporting it as
      // it goes is the difference between a slow operation and an app
      // that looks hung.
      if ("kind" in data) {
        setProgress({ built: data.built, total: data.total });
        return;
      }
      if (!data.ok) {
        setStatus("error");
        setError(data.error);
        setProgress(null);
        return;
      }
      try {
        const old = docRef.current;
        docRef.current = await loadPdf(data.interiorPdf);
        if (old) old.destroy().catch(() => {});
        setNumPages(docRef.current.numPages);
        setPageNum((prev) => Math.min(prev, docRef.current!.numPages));
        setDocTick((t) => t + 1);
        setBuiltPuzzles(data.puzzleCount);
        setProgress(null);
        setStatus("ready");
        setError(null);
      } catch (err) {
        setStatus("error");
        setError(err instanceof Error ? err.message : String(err));
      }
    };

    return () => {
      worker.terminate();
      docRef.current?.destroy().catch(() => {});
      docRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!hasRequiredFields) return;
    const requestId = ++requestIdRef.current;
    const timer = setTimeout(async () => {
      setStatus("generating");
      const entries = Object.entries(pageImages).filter(
        (e): e is [string, string] => Boolean(e[1]),
      );
      const resolvedImages: Record<string, ArrayBuffer> = {};
      for (const [key, assetId] of entries) {
        let bytes = imageBytesCache.current.get(assetId);
        if (!bytes) {
          const response = await fetch(`/api/assets/${assetId}/raw`);
          if (!response.ok) continue;
          bytes = await response.arrayBuffer();
          imageBytesCache.current.set(assetId, bytes);
        }
        resolvedImages[key] = bytes;
      }
      if (requestId !== requestIdRef.current) return;
      const request: PuzzlePreviewRequest = {
        requestId,
        // The book's real puzzles, in order, with the publisher's edits.
        // Empty before a book exists, which falls back to one
        // representative puzzle so the matter pages can still be checked.
        puzzles: bookPuzzles.map((puzzle) => ({
          seed: puzzle.seed,
          gridSize: puzzle.gridSize,
          difficulty: puzzle.difficulty,
          overrides: puzzle.overrides ?? null,
        })),
        gridSize,
        difficulty,
        theme,
        interiorColor,
        bleed,
        bookTitle: title,
        trimSize,
        includeAnswerKey,
        matter: {
          authorName,
          subtitle: subtitle || undefined,
          includeTitlePage,
          includeCopyrightPage,
          includeHowToSolvePage,
          includeReviewRequestPage,
        },
        pageImages: resolvedImages,
        customPages,
        frontMatterOrder,
        backMatterOrder,
        disabledPageKeys,
        pageOverrides,
      };
      workerRef.current?.postMessage(request);
    }, DEBOUNCE_MS);
    return () => clearTimeout(timer);
    // bookPuzzles is deliberately absent: bookSignature stands in for it,
    // so a refetch that returns the same book doesn't rebuild it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    hasRequiredFields,
    bookSignature,
    title,
    authorName,
    subtitle,
    gridSize,
    difficulty,
    theme,
    interiorColor,
    bleed,
    trimSize,
    includeAnswerKey,
    pageOverrides,
    includeTitlePage,
    includeCopyrightPage,
    includeHowToSolvePage,
    includeReviewRequestPage,
    pageImages,
    customPages,
    frontMatterOrder,
    backMatterOrder,
    disabledPageKeys,
  ]);

  // Keyboard nav — arrow keys jump pages while the viewer is focused.
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return;
      if (event.key === "ArrowRight" || event.key === "j" || event.key === "PageDown") {
        event.preventDefault();
        setPageNum((n) => Math.min(n + 1, numPages));
      } else if (event.key === "ArrowLeft" || event.key === "k" || event.key === "PageUp") {
        event.preventDefault();
        setPageNum((n) => Math.max(n - 1, 1));
      } else if (event.key === "Home") {
        setPageNum(1);
      } else if (event.key === "End") {
        setPageNum(numPages);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [numPages]);

  const pageNumbers = useMemo(
    () => Array.from({ length: numPages }, (_, i) => i + 1),
    [numPages],
  );

  if (!hasRequiredFields) {
    return (
      <p className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
        Enter a title and author name to see the live PDF preview.
      </p>
    );
  }

  // The whole finished book, from settings alone. The preview beside it
  // renders ONE puzzle — enough to check the layout and the matter pages,
  // far too little to size a spine or price a copy from — so the ship
  // rail takes its page count from the estimator instead, which is the
  // same one the Customize summary and the KDP limits guard use.
  const limits = checkKdpLimits({ puzzleCount, includeAnswerKey, puzzlesPerSpread, matterPages });

  /**
   * The page count the cover spine is cut to.
   *
   * Once the preview has rendered, `numPages` is the REAL length of the
   * document — the same pages the export produces, from the same seeds
   * through the same renderer — so it beats any estimate. Measuring a
   * real 100-puzzle book showed the estimator 16 pages short, which at
   * 0.002252" per page is a spine off by more than a thirtieth of an
   * inch. Falling back to the estimate only while nothing is rendered
   * yet.
   */
  const renderedPages = status === "ready" && numPages > 0 ? numPages : null;

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
      <div className="flex min-w-0 flex-col gap-3 rounded-lg border border-border bg-surface p-3 sm:p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0 text-xs text-muted-foreground">
          {status === "generating"
            ? progress
              ? `Building the interior — ${progress.built} of ${progress.total} puzzles…`
              : "Building the interior…"
            : status === "error"
              ? `Couldn't render the preview: ${error}`
              : /* The real document, and the real count. This used to
                   render ONE puzzle and call itself a sample, which meant
                   the page count was fiction and the spine derived from
                   it was wrong. */
                `Interior PDF — ${numPages} pages, ${builtPuzzles} puzzle${
                  builtPuzzles === 1 ? "" : "s"
                }, viewing page ${pageNum}`}
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setPageNum((n) => Math.max(1, n - 1))}
            disabled={pageNum <= 1}
            aria-label="Previous page"
            className="flex h-7 w-7 items-center justify-center rounded-md border border-border text-sm hover:bg-muted disabled:opacity-30"
          >
            ‹
          </button>
          <span className="px-1 text-xs tabular-nums text-muted-foreground">
            {pageNum} / {numPages || "—"}
          </span>
          <button
            type="button"
            onClick={() => setPageNum((n) => Math.min(numPages, n + 1))}
            disabled={pageNum >= numPages}
            aria-label="Next page"
            className="flex h-7 w-7 items-center justify-center rounded-md border border-border text-sm hover:bg-muted disabled:opacity-30"
          >
            ›
          </button>
          <div className="mx-1 h-4 w-px bg-border" />
          <button
            type="button"
            onClick={() => setZoom((z) => Math.max(0.5, +(z - 0.25).toFixed(2)))}
            disabled={zoom <= 0.5}
            aria-label="Zoom out"
            className="flex h-7 w-7 items-center justify-center rounded-md border border-border text-sm hover:bg-muted disabled:opacity-30"
          >
            −
          </button>
          <span className="px-1 text-xs tabular-nums text-muted-foreground">
            {Math.round(zoom * 100)}%
          </span>
          <button
            type="button"
            onClick={() => setZoom((z) => Math.min(2.5, +(z + 0.25).toFixed(2)))}
            disabled={zoom >= 2.5}
            aria-label="Zoom in"
            className="flex h-7 w-7 items-center justify-center rounded-md border border-border text-sm hover:bg-muted disabled:opacity-30"
          >
            +
          </button>
        </div>
      </div>

      <div className="flex min-h-0 gap-3">
        {/* Thumbnails — vertical on md+, horizontal strip on narrow screens. */}
        <div
          className="flex max-h-[70vh] shrink-0 gap-2 overflow-auto rounded-md border border-border bg-muted/30 p-2 md:flex-col"
          style={{ scrollbarWidth: "thin" }}
        >
          {pageNumbers.map((n) => (
            <ThumbButton
              key={n}
              pageNumber={n}
              active={n === pageNum}
              onClick={() => setPageNum(n)}
              docTick={docTick}
              docRef={docRef}
            />
          ))}
          {numPages === 0 ? (
            <div className="p-3 text-[11px] text-muted-foreground">Waiting for pages…</div>
          ) : null}
        </div>

        <div className="min-h-0 min-w-0 flex-1 overflow-auto rounded-md border border-border bg-muted/30 p-3">
          <MainPage docTick={docTick} docRef={docRef} pageNumber={pageNum} zoom={zoom} />
        </div>
      </div>
      </div>

      <ShipPanel
        title={title}
        trimSize={trimSize}
        interiorColor={interiorColor}
        paperType={paperType}
        colorTier={colorTier}
        pageCount={renderedPages ?? limits.estimate.pageCount}
        pageCountIsFinal={renderedPages !== null}
        onExport={onExport}
        exporting={exporting}
        blockedReason={limits.severity === "block" ? limits.message : null}
      />
    </div>
  );
}

function ThumbButton({
  pageNumber,
  active,
  onClick,
  docTick,
  docRef,
}: {
  pageNumber: number;
  active: boolean;
  onClick: () => void;
  docTick: number;
  docRef: React.MutableRefObject<LoadedPdf | null>;
}) {
  const holderRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    const holder = holderRef.current;
    const doc = docRef.current;
    if (!holder || !doc) return;
    holder.innerHTML = "";
    (async () => {
      try {
        const canvas = await doc.renderPage(pageNumber, THUMB_WIDTH);
        if (cancelled) return;
        holder.appendChild(canvas);
      } catch {
        // Skip a page that can't render — the thumb just stays blank rather than crashing the whole strip.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [docTick, pageNumber, docRef]);

  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active}
      className={`flex shrink-0 flex-col items-center gap-0.5 rounded border-2 p-1 transition-colors ${
        active
          ? "border-accent bg-accent/5"
          : "border-transparent hover:border-border"
      }`}
      style={{ width: THUMB_WIDTH + 8 }}
    >
      <div
        ref={holderRef}
        className="bg-white"
        style={{ width: THUMB_WIDTH, minHeight: THUMB_WIDTH * 1.25 }}
      />
      <span className="text-[10px] tabular-nums text-muted-foreground">{pageNumber}</span>
    </button>
  );
}

function MainPage({
  docTick,
  docRef,
  pageNumber,
  zoom,
}: {
  docTick: number;
  docRef: React.MutableRefObject<LoadedPdf | null>;
  pageNumber: number;
  zoom: number;
}) {
  const holderRef = useRef<HTMLDivElement | null>(null);
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const [wrapWidth, setWrapWidth] = useState(600);

  useEffect(() => {
    if (!wrapperRef.current) return;
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) setWrapWidth(Math.max(200, Math.floor(entry.contentRect.width)));
    });
    observer.observe(wrapperRef.current);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    let cancelled = false;
    const holder = holderRef.current;
    const doc = docRef.current;
    if (!holder || !doc || pageNumber < 1) return;
    holder.innerHTML = "";
    (async () => {
      try {
        const targetWidth = Math.max(200, Math.floor(wrapWidth * zoom));
        const canvas = await doc.renderPage(pageNumber, targetWidth);
        if (cancelled) return;
        holder.appendChild(canvas);
      } catch (err) {
        if (!cancelled) {
          console.error("Main page render failed", err);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [docTick, pageNumber, zoom, wrapWidth, docRef]);

  return (
    <div ref={wrapperRef} className="flex w-full justify-center">
      <div ref={holderRef} className="shadow-lg shadow-black/10" />
    </div>
  );
}
