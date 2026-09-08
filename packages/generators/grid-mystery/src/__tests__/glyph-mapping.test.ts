import { describe, expect, it } from "vitest";
import { THEMES } from "../content";
import { shapeForLandmark } from "../glyphs";

/**
 * shapeForLandmark matches keywords in order, so a keyword that is a
 * substring of a landmark's name silently steals it. "vegetable patch"
 * contains "table" and was drawn as a chair for as long as the farm
 * theme has existed.
 *
 * This walks every landmark in every theme rather than pinning a handful,
 * because the failure mode is invisible: the wrong glyph still renders, so
 * nothing errors and no proof page looks broken — a reader just sees a
 * chair in the vegetable garden.
 */
describe("landmark -> glyph mapping", () => {
  const EXPECTED: Record<string, string> = {
    "vegetable patch": "plant",
    "hay bale": "plant",
    "grandfather clock": "clock",
    "chess table": "chair",
    bookshelf: "shelf",
    fireplace: "fire",
    wheelbarrow: "wheel",
    tractor: "wheel",
    "milk churn": "vase",
    "feed sack": "sack",
    "apple crate": "crate",
    "suit of armor": "armor",
    "writing desk": "desk",
    "water trough": "barrel",
    "bonfire pit": "fire",
    "bug-zapper lamp": "lamp",
  };

  for (const [name, shape] of Object.entries(EXPECTED)) {
    it(`"${name}" is drawn as ${shape}`, () => {
      expect(shapeForLandmark(name)).toBe(shape);
    });
  }

  it("gives every landmark in every theme a shape, and never the fallback for all of one theme", () => {
    for (const theme of THEMES) {
      const shapes = theme.landmarkNames.map((n) => shapeForLandmark(n));
      for (const s of shapes) expect(s, `${theme.id} produced an empty shape`).toBeTruthy();
      // A theme whose props all collapse to one glyph is indistinguishable
      // on the page — six identical icons in six rooms.
      expect(new Set(shapes).size, `${theme.id}: ${shapes.join(",")}`).toBeGreaterThanOrEqual(4);
    }
  });
});
