// Message-shape types for puzzle-sample.worker.js — the worker itself is
// pure JS (see the file's own comment on why). This declaration file is
// what callers import to type-check their postMessage args and message
// handlers, so the wire contract stays honest without shipping TypeScript
// syntax to the browser.
import type { DifficultyTier, KdpTrimSize, MysteryThemeId, InteriorColor } from "@kdp/shared";

/** One puzzle to roll. Difficulty is per-sample so the default showcase can show every tier side by side. */
export interface PuzzleSampleSpec {
  seed: number;
  difficulty: DifficultyTier;
}

export interface PuzzleSampleRequest {
  requestId: number;
  samples: PuzzleSampleSpec[];
  gridSize: number;
  /** Which content pack to draw rooms, names, landmarks and objects from. */
  theme: MysteryThemeId;
  trimSize: KdpTrimSize;
  /** Interior print colour — full colour by default, greyscale for black-and-white books. */
  interiorColor?: InteriorColor;
  bleed?: boolean;
  includeAnswerKey: boolean;
}

export type PuzzleSampleResponse =
  | {
      requestId: number;
      kind: "puzzle";
      index: number;
      total: number;
      pdf: Uint8Array;
      pageCount: number;
      theme: string;
      seed: number;
      difficulty: DifficultyTier;
      /** The puzzle's own case title — each puzzle has a distinct one. */
      caseTitle: string;
    }
  | { requestId: number; kind: "done"; total: number }
  | { requestId: number; kind: "error"; index: number; error: string };
