import type { GridMysteryPuzzle, Suspect } from "./types";

// Generated text is stored as a TEMPLATE, not as finished prose.
//
// Every clue, evidence note and case title refers to suspects by a token
// — `{{s0}}` — rather than by name. Names are substituted at render time
// from a single map.
//
// This exists for one specific requirement: a publisher renaming a
// suspect must see every surface update immediately, with no
// regeneration. If names were baked into the strings, the only honest
// way to rename would be to rebuild the clue set, which means re-running
// the solver to re-verify it — seconds of work, and a new puzzle rather
// than the same puzzle with a different name on it. Tokens make a rename
// a map edit: the seating, the clue logic and the verified uniqueness are
// all untouched, because none of them ever depended on the spelling.
//
// String-replacing names in finished prose would be the obvious shortcut
// and is a trap: "Mara" is a substring of "Maranda", names can repeat
// inside room or object names, and a replace-all silently corrupts text
// it was never meant to touch.

/** The token that stands in for a suspect's name in stored text. */
export function suspectToken(suspectId: string): string {
  return `{{${suspectId}}}`;
}

const TOKEN_PATTERN = /\{\{([a-zA-Z0-9_-]+)\}\}/g;

/**
 * Substitutes suspect names into a stored template.
 *
 * An unknown token resolves to a neutral placeholder rather than being
 * left as raw `{{s3}}` — a book must never print template syntax, even
 * if an override map is somehow stale.
 */
export function renderTemplate(template: string, names: Record<string, string>): string {
  return template.replace(TOKEN_PATTERN, (_match, id: string) => names[id] ?? "the guest");
}

/** Every suspect's effective name, with per-puzzle overrides applied. */
export function resolveNames(
  suspects: readonly Suspect[],
  overrides?: Record<string, string>,
): Record<string, string> {
  const names: Record<string, string> = {};
  for (const suspect of suspects) {
    const override = overrides?.[suspect.id]?.trim();
    names[suspect.id] = override && override.length > 0 ? override : suspect.name;
  }
  return names;
}

/** Per-puzzle edits a publisher can make without touching the puzzle's logic. */
export interface PuzzleOverrides {
  /** Replaces the generated case title. */
  title?: string;
  /** Optional line under the title. Purely presentational. */
  subtitle?: string;
  /** suspectId -> replacement name. */
  names?: Record<string, string>;
  /** suspectId -> replacement height in inches. */
  heights?: Record<string, number>;
}

/**
 * A puzzle with overrides applied, ready to render.
 *
 * Heights are overridable too, but note what that means: height feeds
 * the "Nth-tallest" clue family, so changing one can invalidate a clue
 * that was true of the original cast. Callers that expose height editing
 * must re-verify — see `heightEditInvalidatesClues`.
 */
export function applyOverrides(
  puzzle: GridMysteryPuzzle,
  overrides?: PuzzleOverrides,
): GridMysteryPuzzle {
  if (!overrides) return puzzle;
  const suspects = puzzle.suspects.map((s) => ({
    ...s,
    name: overrides.names?.[s.id]?.trim() || s.name,
    heightIn: overrides.heights?.[s.id] ?? s.heightIn,
  }));
  return { ...puzzle, suspects };
}

/**
 * Whether a height edit could have falsified a clue.
 *
 * Renaming is always safe — no clue depends on spelling. Height is
 * different: the "Nth-tallest guest was in the X" family reads the
 * height ORDER, so a change that reorders the cast can make a printed
 * clue false. This returns true when the edit changes that order, which
 * is the caller's signal to re-verify rather than accept blindly.
 */
export function heightEditInvalidatesClues(
  puzzle: GridMysteryPuzzle,
  heights?: Record<string, number>,
): boolean {
  if (!heights || Object.keys(heights).length === 0) return false;
  const rank = (list: readonly Suspect[]) =>
    [...list]
      .sort((a, b) => b.heightIn - a.heightIn)
      .map((s) => s.id)
      .join(",");
  const edited = puzzle.suspects.map((s) => ({ ...s, heightIn: heights[s.id] ?? s.heightIn }));
  return rank(puzzle.suspects) !== rank(edited);
}
