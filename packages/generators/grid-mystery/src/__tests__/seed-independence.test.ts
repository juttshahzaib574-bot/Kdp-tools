import { describe, expect, it } from "vitest";
import { generateGridMystery } from "../generate";
import { mixSeed } from "../rng";

/**
 * Adjacent seeds must produce unrelated puzzles.
 *
 * They did not. Generation retries as `mulberry32(seedBase + attempt)`,
 * so seed S on its i-th retry and seed S+1 on its (i-1)-th retry both
 * landed on S+i. Where generation usually succeeds immediately that never
 * showed; where it does not, consecutive seeds walked the same ladder into
 * the same few survivors. Measured at 8x8 Hard: twenty consecutive seeds
 * produced THREE distinct victims and three distinct crime rooms, so a
 * thirty-puzzle Hard book had three victims in it.
 *
 * Case titles are derived from victim, room and weapon, so this also
 * quietly capped how many distinct headings such a run could carry.
 *
 * SCOPE, measured rather than assumed. The web app draws each row's seed
 * as an independent Math.random() * 2**31 (apps/web/src/lib/puzzle-set.ts
 * randomSeed), and two random 31-bit seeds land within one ladder of each
 * other about once in 60,000 pairs — so a real book was never affected.
 * A 30-puzzle 8x8 Hard book built from independent random seeds measured
 * 30/30 distinct case facts BEFORE this fix. What was broken is every
 * caller that derives puzzle seeds from a base — tests, reproducible
 * fixtures, and the obvious `bookSeed + index` a story mode would reach
 * for first. Fixing it is what makes that scheme safe to use.
 *
 * These tests pin the property rather than the fix, so a future change to
 * the retry strategy is free as long as seeds stay independent.
 */
describe("adjacent seeds generate independent puzzles", () => {
  const CASES = [
    { size: 6, difficulty: "easy" },
    { size: 6, difficulty: "hard" },
    { size: 8, difficulty: "easy" },
    { size: 8, difficulty: "hard" },
  ] as const;

  for (const { size, difficulty } of CASES) {
    it(`${size}x${size} ${difficulty}: 20 consecutive seeds give distinct case facts`, () => {
      const facts = new Set<string>();
      for (let s = 0; s < 20; s++) {
        const p = generateGridMystery({ gridSize: size, difficulty, themeId: "manor", seed: 4000 + s });
        const victim = p.suspects.find((x) => x.id === p.victimSuspectId)?.name;
        facts.add(`${victim}|${p.crimeRoomName}|${p.murderWeapon}`);
      }
      // Was 3/20 before the retry seeds were mixed rather than added.
      expect(facts.size).toBeGreaterThanOrEqual(18);
    }, 120_000);
  }

  it("mixSeed never lets one seed's ladder land on another's", () => {
    // The exact failure: seedBase + attempt collides across neighbours.
    const seen = new Map<number, string>();
    for (let seed = 0; seed < 200; seed++) {
      for (let attempt = 0; attempt < 40; attempt++) {
        const mixed = mixSeed(seed, attempt);
        const owner = `${seed}/${attempt}`;
        const prev = seen.get(mixed);
        expect(prev, `${owner} collides with ${prev}`).toBeUndefined();
        seen.set(mixed, owner);
      }
    }
    expect(seen.size).toBe(200 * 40);
  });

  it("is still deterministic — the same seed gives the same puzzle", () => {
    const a = generateGridMystery({ gridSize: 7, difficulty: "hard", themeId: "manor", seed: 12345 });
    const b = generateGridMystery({ gridSize: 7, difficulty: "hard", themeId: "manor", seed: 12345 });
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  }, 60_000);
});
