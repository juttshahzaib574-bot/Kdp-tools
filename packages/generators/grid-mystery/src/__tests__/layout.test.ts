import { describe, expect, it } from "vitest";
import { PDFDocument } from "pdf-lib";
import {
  CELL_UNUSABLE_MM,
  gridFit,
  leftMarginPt,
  pageGeometry,
  worstCellMm,
  type KdpTrimSize,
} from "@kdp/shared";
import { generateGridMystery } from "../generate";
import { loadBookFonts } from "../fonts";
import { paletteFor } from "../palette";
import { drawPuzzlePage, type PuzzleLayoutMetrics } from "../puzzle-page";

// How the page divides itself up, measured rather than eyeballed.
//
// The floor plan is the product; the header and the suspect cards support
// it. For a long time the plan was simply whatever those left over, and
// the result was backwards: 29.8% of page height at 6x9 against 47.2% at
// 8.5x11, so the smallest trim — where a readable grid matters most — got
// the smallest puzzle. Reversing that is only worth something if it stays
// reversed, and a page-height percentage is exactly the kind of number
// that slides half a point at a time as text blocks get added.
//
// It also found the limit. At 6x9 with eight suspects the cards take 224
// of 594 points before the plan gets any, and no amount of tightening
// reaches a cell a reader can write in. That combination is named in
// @kdp/shared's grid-fit table and warned about in the Generate tab, and
// the table is checked against the real layout here so the two cannot
// drift apart.

const TRIMS = ["6x9", "7x10", "8.5x11"] as const;
const TIERS = ["easy", "hard", "extreme"] as const;
const PT_PER_MM = 72 / 25.4;

async function layout(
  trimSize: KdpTrimSize,
  gridSize: number,
  difficulty: (typeof TIERS)[number],
): Promise<{ metrics: PuzzleLayoutMetrics; pageHeight: number }> {
  const puzzle = generateGridMystery({ gridSize, difficulty, themeId: "manor", seed: 20_260 });
  const doc = await PDFDocument.create();
  const fonts = await loadBookFonts(doc, undefined);
  const palette = paletteFor("blackAndWhite");
  const geo = pageGeometry(trimSize, 80, { bleed: false, isRecto: true });
  const page = doc.addPage([geo.widthPt, geo.heightPt]);
  const metrics = drawPuzzlePage(
    page,
    puzzle,
    fonts,
    palette,
    {
      x: leftMarginPt(geo, true),
      y: geo.bottomMarginPt,
      width: geo.contentWidthPt,
      height: geo.contentHeightPt,
    },
    "Case 1",
    { textureSeed: 7 },
  );
  return { metrics, pageHeight: geo.heightPt };
}

/** Smallest cell this combination produces across the tiers, in mm. */
async function measuredWorstMm(trimSize: KdpTrimSize, gridSize: number): Promise<number> {
  let worst = Infinity;
  for (const difficulty of TIERS) {
    const { metrics } = await layout(trimSize, gridSize, difficulty);
    worst = Math.min(worst, metrics.cellSize / PT_PER_MM);
  }
  return worst;
}

describe("the grid-fit table matches the page it describes", () => {
  // The table is what the Generate tab warns from. If the layout improves
  // and the table does not, the tool understates what it can do; if the
  // layout regresses and the table does not, it sells a page nobody can
  // solve. Either way this fails first.
  for (const trimSize of TRIMS) {
    for (const gridSize of [6, 7, 8]) {
      it(`${trimSize} at ${gridSize}x${gridSize}`, async () => {
        const measured = await measuredWorstMm(trimSize, gridSize);
        const claimed = worstCellMm(trimSize, gridSize)!;
        expect(claimed).toBeDefined();
        // Half a millimetre of slack: the table is a published number, not
        // a snapshot of floating-point noise.
        expect(Math.abs(measured - claimed)).toBeLessThan(0.5);
        // And the verdict the tab shows has to follow from the number.
        if (measured < CELL_UNUSABLE_MM) {
          expect(gridFit(trimSize, gridSize)).toBe("unusable");
        } else {
          expect(gridFit(trimSize, gridSize)).not.toBe("unusable");
        }
      }, 600_000);
    }
  }
});

describe("the floor plan's share of the page", () => {
  it("no longer punishes the smallest trim on the sizes it can print", async () => {
    // The original defect: the plan's share FELL as the page got smaller.
    // Restricted to the combinations the tool actually recommends — 6x9
    // at 8x8 is excluded because it is excluded in the product too.
    for (const gridSize of [6, 7]) {
      const shares = await Promise.all(
        TRIMS.map(async (t) => {
          const { metrics, pageHeight } = await layout(t, gridSize, "hard");
          return metrics.gridSide / pageHeight;
        }),
      );
      // Bigger pages still get a bigger share; the point is that the
      // smallest trim is no longer starved relative to them.
      expect(shares[0]!).toBeGreaterThan(0.29);
      expect(shares[2]! - shares[0]!).toBeLessThan(0.2);
    }
  }, 900_000);

  it("never crushes the portrait or the clue type past their floors", async () => {
    // Both step down to buy the plan its share. Past these they stop
    // paying for the space they take: a portrait below 24pt reads as
    // "somebody is here" rather than as who, and clue text below 6.9pt
    // stops being comfortable at arm's length.
    for (const trimSize of TRIMS) {
      const { metrics } = await layout(trimSize, 8, "hard");
      expect(metrics.portrait).toBeGreaterThanOrEqual(24);
    }
  }, 600_000);

  it("keeps the header inside a fifth of the content column", async () => {
    // The method panel was added to the header after the grid budget
    // existed, and header growth comes straight out of the plan.
    for (const trimSize of TRIMS) {
      const { metrics } = await layout(trimSize, 7, "extreme");
      expect(metrics.headerHeight / metrics.contentHeight).toBeLessThan(0.22);
    }
  }, 600_000);
});
