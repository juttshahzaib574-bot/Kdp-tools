// Message-shape types for puzzle-preview.worker.js — the worker itself is
// pure JS (see the file's own comment on why). This declaration file is
// what callers import to type-check their postMessage args and message
// handlers, so the wire contract stays honest without shipping TypeScript
// syntax to the browser.
import type { BookMatterOptions, RenderCustomPage } from "@kdp/generator-grid-mystery";
import type { DifficultyTier, KdpTrimSize, MysteryThemeId, PageOverride, InteriorColor } from "@kdp/shared";

/** One of the book's real puzzles, as stored: a seed plus the publisher's own words. */
export interface PreviewPuzzleSpec {
  seed: number;
  gridSize: number;
  difficulty: DifficultyTier;
  overrides?: {
    title?: string;
    subtitle?: string;
    names?: Record<string, string>;
    heights?: Record<string, number>;
  } | null;
}

export interface PuzzlePreviewRequest {
  requestId: number;
  /**
   * The book's actual puzzles.
   *
   * When present the preview renders the WHOLE book — every puzzle, in
   * order, with the publisher's edits — which is the only thing that
   * makes a page count, a spine width or a margin check mean anything.
   * Omitted (or empty) falls back to a single representative puzzle, for
   * the case where no book exists yet.
   */
  puzzles?: PreviewPuzzleSpec[];
  gridSize: number;
  difficulty: DifficultyTier;
  /** Which content pack to draw rooms, names, landmarks and objects from. */
  theme: MysteryThemeId;
  bookTitle: string;
  trimSize: KdpTrimSize;
  /** Interior print colour — full colour by default, greyscale for black-and-white books. */
  interiorColor?: InteriorColor;
  bleed?: boolean;
  includeAnswerKey: boolean;
  matter: BookMatterOptions;
  /** Raw image bytes per assigned gallery (page role or custom-page id), already fetched by the main thread. */
  pageImages: Record<string, ArrayBuffer>;
  /** The user's custom pages, already ordered by section/position — see RenderCustomPage. */
  customPages: RenderCustomPage[];
  /** See the matching fields on RenderGridMysteryPdfOptions. */
  frontMatterOrder?: string[];
  backMatterOrder?: string[];
  disabledPageKeys?: string[];
  pageOverrides?: Record<string, PageOverride>;
  puzzlesPerSpread?: "packed" | "onePerSpread";
}

export type PuzzlePreviewResponse =
  /** Sent as each puzzle is built, so a hundred-puzzle book can show progress rather than a frozen panel. */
  | { requestId: number; kind: "progress"; built: number; total: number }
  | {
      requestId: number;
      ok: true;
      interiorPdf: Uint8Array;
      pageCount: number;
      /** How many of the pages are puzzles, so the UI can say what the rest are. */
      puzzleCount: number;
    }
  | { requestId: number; ok: false; error: string };
