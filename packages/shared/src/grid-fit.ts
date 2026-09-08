import type { KdpTrimSize } from "./kdp";

// Whether a trim size has room for a grid size — measured, not guessed.
//
// A publisher can pick 6x9, an 8x8 grid and Hard, and until this existed
// the tool printed it: a 13.2pt cell, 4.6mm across, which is smaller than
// the nib of the pen somebody solves it with. Nothing failed. The book
// exported, uploaded and printed, and the defect only showed up in the
// buyer's hands.
//
// The page divides itself between a header, eight suspect cards, an
// evidence panel and the floor plan, and the plan takes what is left
// after the text is measured (see puzzle-page.ts, which now gives the
// plan a floor and steps the portraits and clue type down to meet it).
// At 6x9 with eight suspects there is not enough page: eight cards of
// clue text across a 4.4in column is 224 points of the 594 available
// before the plan gets any. No amount of tightening reaches a usable
// cell, which is a real limit of one page rather than a layout bug.
//
// So the combination is named rather than silently shipped.

/**
 * How much room the plan gets at a given trim and grid size.
 *
 * "tight" is honest, not a warning to ignore: it is a printable, solvable
 * page whose cells are around 9-10mm, which is small for pencil work but
 * within what puzzle books print. "unusable" means the cell falls under
 * 7mm and the page should not be sold.
 */
export type GridFit = "comfortable" | "tight" | "unusable";

/**
 * The smallest cell each combination produces, in millimetres, across
 * every difficulty.
 *
 * Measured by rendering the real page at every trim, grid size and tier
 * and taking the worst — see layout.test.ts, which re-measures and fails
 * if the layout drifts away from this table. Hard is usually the worst
 * case rather than Extreme: Extreme drops clues from cards to make the
 * deduction harder, and a dropped clue is a shorter card.
 */
const WORST_CELL_MM: Record<KdpTrimSize, Record<number, number>> = {
  "6x9": { 6: 13.9, 7: 9.3, 8: 4.6 },
  "7x10": { 6: 19.2, 7: 13.4, 8: 11.0 },
  "8.5x11": { 6: 23.4, 7: 17.5, 8: 14.9 },
};

/** Below this a cell is too small to write a name in. */
export const CELL_UNUSABLE_MM = 7;
/** Above this a cell is roomy enough that nothing needs saying. */
export const CELL_COMFORTABLE_MM = 11;

export function worstCellMm(trimSize: KdpTrimSize, gridSize: number): number | undefined {
  return WORST_CELL_MM[trimSize]?.[gridSize];
}

export function gridFit(trimSize: KdpTrimSize, gridSize: number): GridFit {
  const mm = worstCellMm(trimSize, gridSize);
  // An unmeasured combination is not assumed to be fine. Anything outside
  // the table is a grid size the harness has not proofed, and the honest
  // answer for a page nobody has looked at is the cautious one.
  if (mm === undefined) return "tight";
  if (mm < CELL_UNUSABLE_MM) return "unusable";
  if (mm < CELL_COMFORTABLE_MM) return "tight";
  return "comfortable";
}

/** What to tell a publisher who has chosen this combination, if anything. */
export function gridFitAdvice(trimSize: KdpTrimSize, gridSize: number): string | null {
  const fit = gridFit(trimSize, gridSize);
  if (fit === "comfortable") return null;
  const mm = worstCellMm(trimSize, gridSize);
  const size = `${gridSize} × ${gridSize}`;
  if (fit === "unusable") {
    return `A ${size} plan does not fit a ${trimSize.replace("x", "″ × ")}″ page: the hardest tiers print cells about ${mm}mm across, too small to write in. Choose a larger trim, or a smaller grid.`;
  }
  return `A ${size} plan is tight at ${trimSize.replace("x", "″ × ")}″ — cells get down to about ${mm}mm on the harder tiers. It prints and it solves, but a larger trim gives the solver more room.`;
}
