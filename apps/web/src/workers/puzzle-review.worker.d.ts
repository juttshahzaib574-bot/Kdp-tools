// Message shapes for puzzle-review.worker.js — the worker itself is plain
// JavaScript (see its header for why). Importing these keeps the wire
// contract type-checked on the calling side without shipping TypeScript
// syntax to the browser.
import type { DifficultyTier, InteriorColor, KdpTrimSize, MysteryThemeId } from "@kdp/shared";
import type { PuzzleOverrides } from "@kdp/generator-grid-mystery";

/** One row of the book to rebuild, addressed by its database id. */
export interface PuzzleReviewSpec {
  id: string;
  seed: number;
  gridSize: number;
  difficulty: DifficultyTier;
  overrides?: PuzzleOverrides | null;
}

export interface PuzzleReviewRequest {
  requestId: number;
  puzzles: PuzzleReviewSpec[];
  theme: MysteryThemeId;
  trimSize: KdpTrimSize;
  interiorColor?: InteriorColor;
  bleed?: boolean;
  /** Skip the PDF half — used when only one puzzle's text needs refreshing. */
  includeThumbnails?: boolean;
}

/** A suspect as the editor sees them. */
export interface ReviewSuspect {
  id: string;
  name: string;
  heightIn: number;
  isVictim: boolean;
}

export type PuzzleReviewResponse =
  | {
      requestId: number;
      kind: "text";
      id: string;
      seed: number;
      difficulty: DifficultyTier;
      /** Still tokenised — the tab substitutes names itself so a rename costs one render. */
      titleTemplate: string;
      briefTemplate: string;
      clueTemplates: string[];
      evidenceTemplates: string[];
      suspects: ReviewSuspect[];
      crimeRoomName: string;
      solveNodes: number;
      /** Publisher-only. Shown on the review card and in the answer key, never on the puzzle page. */
      culpritSuspectId: string;
      victimSuspectId: string;
      murderWeapon: string;
      /**
       * The measured reasoning the puzzle demands — what the tier badge
       * is a summary of. See tier-contract.ts in the generator.
       */
      logicProfile: {
        solvedAt: "direct" | "elimination" | "relational" | "crossLayer";
        chain: number;
        techniques: string[];
        summary: string;
      };
    }
  | { requestId: number; kind: "page"; id: string; pdf: Uint8Array; pageCount: number }
  | { requestId: number; kind: "error"; id: string; error: string }
  | { requestId: number; kind: "done" };
