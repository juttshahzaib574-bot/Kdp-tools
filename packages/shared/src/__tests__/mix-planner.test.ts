import { describe, expect, it } from "vitest";
import {
  DEFAULT_RAMP_WEIGHTS,
  MIX_PRESETS,
  planMix,
  presetById,
  type DifficultyTier,
} from "../index";
import { checkKdpLimits, estimateBookSize } from "../kdp-limits";
import { difficultyRank } from "../difficulty";

/** A plan is only useful if it sums to what was asked for. */
function sum(counts: Record<DifficultyTier, number>): number {
  return Object.values(counts).reduce((a, b) => a + b, 0);
}

/** Ramp order means never stepping back down the ladder. */
function isAscending(order: DifficultyTier[]): boolean {
  for (let i = 1; i < order.length; i++) {
    if (difficultyRank(order[i]!) < difficultyRank(order[i - 1]!)) return false;
  }
  return true;
}

describe("mix planner — acceptance criteria", () => {
  it("criterion 1: [15 easy, 50 medium] over 100 with the default policy gives 15/85, ramp-ordered", () => {
    const plan = planMix({
      total: 100,
      mode: "sequence",
      sequence: [
        { tier: "easy", count: 15 },
        { tier: "medium", count: 50 },
      ],
    });
    // The 35 unallocated puzzles go to the hardest SELECTED tier — medium —
    // not to Extreme, which this plan never asked for.
    expect(plan.counts.easy).toBe(15);
    expect(plan.counts.medium).toBe(85);
    expect(plan.counts.hard).toBe(0);
    expect(plan.counts.expert).toBe(0);
    expect(plan.counts.extreme).toBe(0);
    expect(sum(plan.counts)).toBe(100);
    expect(plan.order).toHaveLength(100);
    expect(isAscending(plan.order)).toBe(true);
    expect(plan.order[0]).toBe("easy");
    expect(plan.order[99]).toBe("medium");
  });

  it("criterion 2: the Classic 100 preset gives exactly 10/25/30/20/15, ordered tier 1 to 5", () => {
    const preset = presetById("classic100");
    expect(preset).toBeDefined();
    const plan = planMix(preset!.build(100));
    expect(plan.counts).toEqual({
      easy: 10,
      medium: 25,
      hard: 30,
      expert: 20,
      extreme: 15,
    });
    expect(sum(plan.counts)).toBe(100);
    expect(isAscending(plan.order)).toBe(true);
    expect(plan.order[0]).toBe("easy");
    expect(plan.order[plan.order.length - 1]).toBe("extreme");
  });
});

describe("mix planner", () => {
  it("always sums to the requested total, for every mode and awkward size", () => {
    // Rounding is where planners quietly lose or invent puzzles, so this
    // sweeps sizes that divide badly against every mode.
    for (const total of [1, 7, 13, 29, 30, 33, 97, 100, 101, 250]) {
      for (const preset of MIX_PRESETS) {
        const plan = planMix(preset.build(total));
        expect(sum(plan.counts), `${preset.id} @ ${total}`).toBe(total);
        expect(plan.order).toHaveLength(total);
      }
      const ramp = planMix({ total, mode: "ramp" });
      expect(sum(ramp.counts), `ramp @ ${total}`).toBe(total);
      expect(ramp.order).toHaveLength(total);
    }
  });

  it("keeps the remainder inside the tiers the plan selected", () => {
    // A cozy plan must never sprout an Extreme puzzle just because the
    // arithmetic didn't come out even.
    for (const total of [7, 13, 29, 97]) {
      const plan = planMix(presetById("cozy")!.build(total));
      expect(plan.counts.expert).toBe(0);
      expect(plan.counts.extreme).toBe(0);
      expect(sum(plan.counts)).toBe(total);
    }
  });

  it("honours each remainder policy", () => {
    const base = {
      total: 10,
      mode: "sequence" as const,
      sequence: [
        { tier: "easy" as const, count: 2 },
        { tier: "hard" as const, count: 3 },
      ],
    };
    const hardest = planMix({ ...base, remainderPolicy: "add_to_hardest_selected" });
    expect(hardest.counts).toMatchObject({ easy: 2, hard: 8 });

    const easiest = planMix({ ...base, remainderPolicy: "add_to_easiest_selected" });
    expect(easiest.counts).toMatchObject({ easy: 7, hard: 3 });

    const spread = planMix({ ...base, remainderPolicy: "distribute_evenly" });
    expect(sum(spread.counts)).toBe(10);
    // Evenly means both selected tiers grow, neither is left untouched.
    expect(spread.counts.easy).toBeGreaterThan(2);
    expect(spread.counts.hard).toBeGreaterThan(3);
  });

  it("clamps a sequence that overshoots the book", () => {
    const plan = planMix({
      total: 10,
      mode: "sequence",
      sequence: [
        { tier: "easy", count: 8 },
        { tier: "hard", count: 999 },
      ],
    });
    expect(sum(plan.counts)).toBe(10);
    expect(plan.counts.easy).toBe(8);
    expect(plan.counts.hard).toBe(2);
  });

  it("falls back to the default ramp rather than returning an empty book", () => {
    const plan = planMix({ total: 20, mode: "percent", weights: {} });
    expect(sum(plan.counts)).toBe(20);
    expect(plan.order).toHaveLength(20);
  });

  it("returns an empty plan for a zero-length book without throwing", () => {
    const plan = planMix({ total: 0, mode: "ramp" });
    expect(sum(plan.counts)).toBe(0);
    expect(plan.order).toEqual([]);
  });

  it("estimates more generation time for a harder mix", () => {
    const cozy = planMix(presetById("cozy")!.build(100));
    const gauntlet = planMix(presetById("gauntlet")!.build(100));
    expect(gauntlet.estimatedSeconds).toBeGreaterThan(cozy.estimatedSeconds);
  });

  it("uses the documented default ramp weights", () => {
    const plan = planMix({ total: 100, mode: "ramp" });
    expect(plan.counts.easy).toBe(DEFAULT_RAMP_WEIGHTS.easy);
    expect(plan.counts.extreme).toBe(DEFAULT_RAMP_WEIGHTS.extreme);
  });
});

describe("KDP limits guard — criterion 5", () => {
  it("passes a normal book", () => {
    const check = checkKdpLimits({
      puzzleCount: 100,
      includeAnswerKey: true,
      puzzlesPerSpread: "packed",
    });
    expect(check.severity).toBe("ok");
    expect(check.estimate.pageCount).toBeLessThan(828);
  });

  it("blocks a book that would exceed KDP's 828-page paperback limit", () => {
    const check = checkKdpLimits({
      puzzleCount: 900,
      includeAnswerKey: true,
      puzzlesPerSpread: "packed",
    });
    expect(check.severity).toBe("block");
    expect(check.message).toContain("828");
    // The message must say what to do, not only what is wrong.
    expect(check.maxPuzzleCount).toBeDefined();
    const fixed = checkKdpLimits({
      puzzleCount: check.maxPuzzleCount!,
      includeAnswerKey: true,
      puzzlesPerSpread: "packed",
    });
    expect(fixed.severity).not.toBe("block");
  });

  it("catches spread mode doubling the page count", () => {
    const packed = checkKdpLimits({
      puzzleCount: 400,
      includeAnswerKey: true,
      puzzlesPerSpread: "packed",
    });
    const spread = checkKdpLimits({
      puzzleCount: 400,
      includeAnswerKey: true,
      puzzlesPerSpread: "onePerSpread",
    });
    expect(packed.severity).not.toBe("block");
    expect(spread.severity).toBe("block");
  });

  it("never estimates below KDP's minimum page count", () => {
    const tiny = estimateBookSize({
      puzzleCount: 1,
      includeAnswerKey: false,
      puzzlesPerSpread: "packed",
    });
    expect(tiny.pageCount).toBeGreaterThanOrEqual(24);
  });

  it("keeps a maximum-length book comfortably inside the 650 MB cap", () => {
    // Vector pages are why file size is not the binding constraint here;
    // if that ever stops being true this test is the early warning.
    const biggest = estimateBookSize({
      puzzleCount: 800,
      includeAnswerKey: true,
      puzzlesPerSpread: "packed",
    });
    expect(biggest.bytes).toBeLessThan(650 * 1024 * 1024);
  });
});

// ---- Largest-remainder allocation ----------------------------------
//
// A weighting is a shape. Rounding it to whole puzzles should stay as
// close to that shape as integers allow — which flooring every tier and
// dumping the leftover on one of them does not.

describe("the progressive ramp at real book lengths", () => {
  const ramp = (total: number) => planMix({ total, mode: "ramp" }).counts;

  it("gives the specified 3/8/9/6/4 at 30 puzzles", () => {
    // Exact shares are 3 / 7.5 / 9 / 6 / 4.5. Both halves round up to
    // the tier that was cut most, and the medium/extreme tie goes to the
    // easier one.
    expect(ramp(30)).toEqual({ easy: 3, medium: 8, hard: 9, expert: 6, extreme: 4 });
  });

  it("reproduces the weights exactly when they divide evenly", () => {
    expect(ramp(100)).toEqual({ easy: 10, medium: 25, hard: 30, expert: 20, extreme: 15 });
    expect(ramp(20)).toEqual({ easy: 2, medium: 5, hard: 6, expert: 4, extreme: 3 });
  });

  it("scales to any count without losing or inventing a puzzle", () => {
    for (let total = 1; total <= 100; total++) {
      const counts = ramp(total);
      const sum = Object.values(counts).reduce((a, b) => a + b, 0);
      expect(sum, `total ${total}`).toBe(total);
      for (const value of Object.values(counts)) expect(value).toBeGreaterThanOrEqual(0);
    }
  });

  it("never drifts more than one puzzle from the exact share", () => {
    // The property that makes the shape trustworthy at every length.
    const weights = { easy: 10, medium: 25, hard: 30, expert: 20, extreme: 15 };
    for (const total of [7, 13, 30, 47, 50, 63, 100]) {
      const counts = ramp(total);
      for (const [tier, weight] of Object.entries(weights) as [DifficultyTier, number][]) {
        const exact = (total * weight) / 100;
        expect(Math.abs(counts[tier] - exact), `${total} @ ${tier}`).toBeLessThan(1);
      }
    }
  });

  it("breaks a rounding tie toward the easier tier", () => {
    // A coin-flip in the arithmetic must never quietly make a book
    // harder than the publisher asked for.
    const counts = ramp(30);
    expect(counts.medium).toBeGreaterThan(counts.extreme);
  });

  it("does not dump the leftover on the hardest tier any more", () => {
    // The old behaviour produced 3/7/9/6/5 here — one puzzle short at
    // medium and one long at the top of the ladder.
    expect(ramp(30).extreme).toBe(4);
    expect(ramp(30).medium).toBe(8);
  });
});

describe("custom sequences still honour their remainder policy", () => {
  it("sends a shortfall to the hardest selected tier by default", () => {
    const plan = planMix({
      total: 30,
      mode: "sequence",
      sequence: [
        { tier: "easy", count: 10 },
        { tier: "hard", count: 18 },
      ],
    });
    expect(plan.counts.easy).toBe(10);
    expect(plan.counts.hard).toBe(20);
    expect(plan.counts.extreme).toBe(0);
  });

  it("can send it to the easiest selected tier instead", () => {
    const plan = planMix({
      total: 30,
      mode: "sequence",
      sequence: [
        { tier: "easy", count: 10 },
        { tier: "hard", count: 18 },
      ],
      remainderPolicy: "add_to_easiest_selected",
    });
    expect(plan.counts.easy).toBe(12);
    expect(plan.counts.hard).toBe(18);
  });
});
