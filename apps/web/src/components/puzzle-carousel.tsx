"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  stepPuzzleNumber,
  windowAfterStep,
  windowForJump,
  type DifficultyTier,
  type InteriorColor,
  type KdpTrimSize,
  type MysteryThemeId,
} from "@kdp/shared";
import type {
  PuzzleSampleRequest,
  PuzzleSampleResponse,
  PuzzleSampleSpec,
} from "@/workers/puzzle-sample.worker";
import { PdfPageView } from "@/components/pdf-page-view";
import { PuzzleNav } from "@/components/puzzle-nav";

/** Autoplay dwell. Long enough to actually read a puzzle's title before it moves. */
const AUTOPLAY_MS = 5000;

// The default showcase: one puzzle per difficulty tier, on FIXED seeds.
//
// These are an EMPTY STATE. They exist so the Generate tab shows what the
// engine produces before anyone has a book of their own; the moment a
// publisher does, their puzzles take over and these disappear.
const SHOWCASE: readonly { difficulty: DifficultyTier; seed: number }[] = [
  { difficulty: "easy", seed: 1_010_101 },
  { difficulty: "medium", seed: 2_020_202 },
  { difficulty: "hard", seed: 3_030_303 },
  { difficulty: "expert", seed: 4_040_404 },
  { difficulty: "extreme", seed: 5_050_505 },
];
const SAMPLE_COUNT = SHOWCASE.length;

/** One of the publisher's own puzzles. */
export interface BookPuzzleSpec {
  id: string;
  index: number;
  seed: number;
  gridSize: number;
  difficulty: DifficultyTier;
  /** The publisher's own titles and names, carried so the export preview prints them. */
  overrides?: {
    title?: string;
    subtitle?: string;
    names?: Record<string, string>;
    heights?: Record<string, number>;
  } | null;
}

export interface PuzzleCarouselProps {
  gridSize: number;
  difficulty: DifficultyTier;
  theme: MysteryThemeId;
  interiorColor: InteriorColor;
  bleed: boolean;
  trimSize: KdpTrimSize;
  includeAnswerKey: boolean;
  /** The publisher's own puzzles. Empty until they've built a book. */
  bookPuzzles?: BookPuzzleSpec[];
}

interface Slide {
  /** 1-based puzzle number this slide holds — the only id the UI uses. */
  puzzleNumber: number;
  seed: number;
  difficulty: DifficultyTier;
  caseTitle: string;
  pdf: Uint8Array;
  pageCount: number;
}

/**
 * The Generate tab's preview.
 *
 * ONE numbering system: the puzzle number. The arrows step it, the chips
 * jump to it, the box types it, the caption reads it, and the chip window
 * is derived from it rather than tracked beside it — which is what stops
 * the three of them disagreeing, as they used to.
 *
 * Only the five puzzles in the chip window are ever rendered, so a
 * hundred-puzzle book costs exactly as much to browse as a five-puzzle
 * one.
 */
export function PuzzleCarousel({
  gridSize,
  difficulty,
  theme,
  interiorColor,
  bleed,
  trimSize,
  includeAnswerKey,
  bookPuzzles,
}: PuzzleCarouselProps) {
  const book = useMemo(() => bookPuzzles ?? [], [bookPuzzles]);
  const inBookMode = book.length > 0;
  const total = inBookMode ? book.length : SAMPLE_COUNT;

  const [selected, setSelected] = useState(1);
  const [chips, setChips] = useState<number[]>(() => windowForJump(1, total));
  const [slides, setSlides] = useState<Record<number, Slide>>({});
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = useState<string | null>(null);
  // Sample mode plays by itself — it's a showcase nobody asked to drive.
  // A publisher's own book does not: they came to look at something
  // specific, and a page that moves under them is an obstacle.
  const [autoplay, setAutoplay] = useState(!inBookMode);
  const [tabVisible, setTabVisible] = useState(true);
  const [rollTick, setRollTick] = useState(0);
  const [mode, setMode] = useState<"showcase" | "random">("showcase");

  const workerRef = useRef<Worker | null>(null);
  const requestIdRef = useRef(0);
  // The window as it was when the in-flight request was posted, so a
  // reply can be filed against the right puzzle numbers even if the
  // reader has moved on since.
  const chipsAtRequest = useRef<number[]>([]);

  /** Every human action stands autoplay down — permanently, not until the next tick. */
  const stopAutoplay = useCallback(() => setAutoplay(false), []);

  // Switching between the samples and a real book resets the selection
  // and the default autoplay state together.
  const [lastMode, setLastMode] = useState(inBookMode);
  if (inBookMode !== lastMode) {
    setLastMode(inBookMode);
    setSelected(1);
    setChips(windowForJump(1, inBookMode ? book.length : SAMPLE_COUNT));
    setAutoplay(!inBookMode);
    setSlides({});
  }

  useEffect(() => {
    const worker = new Worker("/workers/puzzle-sample.worker.js");
    workerRef.current = worker;
    return () => worker.terminate();
  }, []);

  // A hidden tab shouldn't burn through a book unwatched. This pauses
  // rather than switching autoplay off: coming back resumes what was
  // already running, which isn't a decision the reader made.
  useEffect(() => {
    const onVisibility = () => setTabVisible(!document.hidden);
    document.addEventListener("visibilitychange", onVisibility);
    // No synchronous seed here: `tabVisible` starts true, and a tab that
    // was already hidden at mount fires visibilitychange on the way back
    // — which is the only moment the value matters.
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  /** Renders exactly the chip window — never the whole book. */
  const roll = useCallback(() => {
    const worker = workerRef.current;
    if (!worker || chips.length === 0) return;
    const requestId = ++requestIdRef.current;

    const specs: PuzzleSampleSpec[] = chips.map((n) => {
      if (inBookMode) {
        const puzzle = book[n - 1]!;
        return { seed: puzzle.seed, difficulty: puzzle.difficulty };
      }
      if (mode === "random") {
        return { seed: Math.floor(Math.random() * 2 ** 31), difficulty };
      }
      const sample = SHOWCASE[n - 1]!;
      return { seed: sample.seed, difficulty: sample.difficulty };
    });

    setStatus("loading");
    setError(null);
    const request: PuzzleSampleRequest = {
      requestId,
      samples: specs,
      gridSize: inBookMode ? (book[chips[0]! - 1]?.gridSize ?? gridSize) : gridSize,
      theme,
      interiorColor,
      bleed,
      trimSize,
      includeAnswerKey,
    };
    worker.postMessage(request);
  }, [
    chips,
    inBookMode,
    book,
    mode,
    difficulty,
    gridSize,
    theme,
    interiorColor,
    bleed,
    trimSize,
    includeAnswerKey,
  ]);

  useEffect(() => {
    const worker = workerRef.current;
    if (!worker) return;
    const handler = (event: MessageEvent<PuzzleSampleResponse>) => {
      const data = event.data;
      if (data.requestId !== requestIdRef.current) return;
      if (data.kind === "puzzle") {
        // The worker answers by slot; the slot's puzzle number is
        // whatever the window held when the request went out.
        const puzzleNumber = chipsAtRequest.current[data.index];
        if (puzzleNumber === undefined) return;
        setSlides((prev) => ({
          ...prev,
          [puzzleNumber]: {
            puzzleNumber,
            seed: data.seed,
            difficulty: data.difficulty,
            caseTitle: data.caseTitle,
            pdf: data.pdf,
            pageCount: data.pageCount,
          },
        }));
        setStatus("ready");
      } else if (data.kind === "error") {
        setStatus("error");
        setError(data.error);
      }
    };
    worker.addEventListener("message", handler);
    return () => worker.removeEventListener("message", handler);
  }, []);

  useEffect(() => {
    chipsAtRequest.current = chips;
    roll();
  }, [chips, roll, rollTick]);

  const active = slides[selected];
  const isReady = useCallback((n: number) => Boolean(slides[n]), [slides]);

  /** The single entry point for changing which puzzle is shown. */
  const goTo = useCallback(
    (puzzleNumber: number) => {
      setSelected(puzzleNumber);
      // A jump anchors the target at the left of the window; a step
      // slides it minimally. See windowForJump / windowAfterStep.
      setChips(windowForJump(puzzleNumber, total));
    },
    [total],
  );

  /** ±1, wrapping, sliding the window only when the selection leaves it. */
  const step = useCallback(
    (delta: 1 | -1) => {
      setSelected((current) => {
        const next = stepPuzzleNumber(current, delta, total);
        setChips((window) => windowAfterStep(next, window, total));
        return next;
      });
    },
    [total],
  );

  useEffect(() => {
    if (!autoplay || !tabVisible || total < 2) return;
    const timer = setTimeout(() => step(1), AUTOPLAY_MS);
    return () => clearTimeout(timer);
  }, [autoplay, tabVisible, selected, total, step]);

  return (
    <div className="flex flex-col gap-4 rounded-lg border border-border bg-surface p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold tracking-tight">
            {inBookMode ? "Your book" : "Live puzzle previews"}
          </h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {status === "error"
              ? `Couldn't render a puzzle: ${error ?? "unknown error"}`
              : inBookMode
                ? `${total} puzzle${total === 1 ? "" : "s"} — every one verified to have exactly one solution.`
                : mode === "showcase"
                  ? "Five samples, one per difficulty tier — the same every visit."
                  : `Freshly rolled at ${difficulty} — each verified to have exactly one solution.`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setAutoplay((v) => !v)}
            aria-pressed={autoplay}
            className={`rounded-md border px-2.5 py-1 text-xs font-medium ${
              autoplay
                ? "border-accent bg-accent/10 text-foreground"
                : "border-border text-muted-foreground hover:bg-muted"
            }`}
          >
            {autoplay ? "Autoplay on" : "Autoplay off"}
          </button>
          {/* Rolling has no meaning once the book exists — these are the
              publisher's own puzzles, not samples to replace. */}
          {!inBookMode && mode === "random" ? (
            <button
              type="button"
              onClick={() => {
                stopAutoplay();
                setMode("showcase");
                setSlides({});
                setRollTick((t) => t + 1);
              }}
              className="rounded-md border border-border px-2.5 py-1 text-xs font-medium hover:bg-muted"
            >
              Back to samples
            </button>
          ) : null}
          {!inBookMode ? (
            <button
              type="button"
              onClick={() => {
                stopAutoplay();
                setMode("random");
                setSlides({});
                setRollTick((t) => t + 1);
              }}
              className="rounded-md border border-border px-2.5 py-1 text-xs font-medium hover:bg-muted"
            >
              Roll new
            </button>
          ) : null}
        </div>
      </div>

      <div
        className="flex min-w-0 flex-col items-center gap-3 rounded-md border border-border bg-muted/40 p-2"
        onWheel={stopAutoplay}
        onPointerDown={stopAutoplay}
      >
        {active ? (
          <>
            {Array.from({ length: Math.max(1, active.pageCount) }).map((_, i) => (
              <div key={i} className="flex w-full flex-col items-center gap-1">
                {active.pageCount > 1 ? (
                  <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
                    {i === 0 ? "Puzzle page" : "Answer key"}
                  </span>
                ) : null}
                <PdfPageView pdf={active.pdf} pageNumber={i + 1} maxWidth={720} />
              </div>
            ))}
          </>
        ) : (
          <p className="py-10 text-xs text-muted-foreground">
            {status === "error" ? "Preview unavailable" : "Rendering puzzle…"}
          </p>
        )}
      </div>

      <PuzzleNav
        selected={selected}
        total={total}
        chips={chips}
        isReady={isReady}
        onSelect={goTo}
        onStep={step}
        onInteract={stopAutoplay}
      />

      <div className="min-w-0 text-center text-xs text-muted-foreground">
        {active ? (
          <>
            <span className="font-medium text-foreground">
              Puzzle {selected} of {total}
            </span>
            <span className="mx-1.5">·</span>
            <span className="uppercase tracking-wide">{active.difficulty}</span>
            <span className="mx-1.5">·</span>
            <span className="italic">{active.caseTitle}</span>
            <span className="mx-1.5">·</span>
            <span>seed {active.seed}</span>
          </>
        ) : null}
      </div>
    </div>
  );
}
