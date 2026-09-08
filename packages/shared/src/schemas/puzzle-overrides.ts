import { z } from "zod";
import { DIFFICULTY_TIER_IDS, normalizeDifficultyTier } from "../difficulty";

// Per-puzzle publisher edits, validated at the API boundary.
//
// The split that matters: everything in here is PRESENTATIONAL. A title,
// a subtitle and a suspect's name change what the page says without
// changing what the puzzle means — the seating, the clue logic and the
// proved uniqueness are all untouched, so applying them needs no
// re-solve.
//
// Height is the one exception and is called out where it's used: the
// "Nth-tallest guest" clue family reads height ORDER, so an edit that
// reorders the cast can falsify a printed clue. The API re-verifies in
// that case rather than trusting the edit.

/** Suspect ids are engine-generated ("s0".."s7"), never user input. */
const suspectIdSchema = z.string().regex(/^s\d+$/, "not a suspect id");

export const puzzleOverridesSchema = z.object({
  title: z.string().trim().max(120).optional(),
  subtitle: z.string().trim().max(160).optional(),
  /** suspectId -> replacement name. A blank value clears the override. */
  names: z.record(suspectIdSchema, z.string().trim().max(40)).optional(),
  /**
   * suspectId -> height in inches. Bounded to the range the generator
   * itself uses, so an edit can't produce a suspect list the
   * "Nth-tallest" clues would read as nonsense.
   */
  heights: z.record(suspectIdSchema, z.number().int().min(48).max(96)).optional(),
});

export type PuzzleOverridesInput = z.infer<typeof puzzleOverridesSchema>;

/** PATCH body for one puzzle: overrides only, never seed or difficulty. */
export const patchPuzzleSchema = z.object({
  overrides: puzzleOverridesSchema,
});

/**
 * POST body for a reroll.
 *
 * Difficulty is optional — omitted means "same tier, new puzzle". When
 * present the puzzle is regenerated at the new tier and re-verified
 * before it replaces the old one.
 */
export const rerollPuzzleSchema = z.object({
  difficulty: z.preprocess(normalizeDifficultyTier, z.enum(DIFFICULTY_TIER_IDS)).optional(),
});

export type RerollPuzzleInput = z.infer<typeof rerollPuzzleSchema>;

/**
 * POST body for Undo.
 *
 * Undo is a restore, not a stack pop: the client hands back the exact
 * seed and tier the puzzle had before the reroll, and the server
 * regenerates and re-verifies from those. That keeps the server
 * stateless about history — there's no per-session undo buffer to
 * expire, lose on a page reload, or get out of step with the row — and
 * the restored puzzle still goes through the same solver proof as any
 * other, so an Undo can't sneak an unverified puzzle back into a book.
 */
export const restorePuzzleSchema = z.object({
  seed: z.number().int().min(0).max(2 ** 31),
  difficulty: z.preprocess(normalizeDifficultyTier, z.enum(DIFFICULTY_TIER_IDS)),
  requestedDifficulty: z
    .preprocess(normalizeDifficultyTier, z.enum(DIFFICULTY_TIER_IDS))
    .optional(),
});

export type RestorePuzzleInput = z.infer<typeof restorePuzzleSchema>;
