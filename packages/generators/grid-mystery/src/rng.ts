// Small deterministic PRNG (mulberry32) so a puzzle can be regenerated from
// a seed for testing/debugging, instead of relying on Math.random directly.
export type Rng = () => number;

export function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  return function rng() {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Combines a base seed with a retry counter into a seed that shares no
 * ladder with its neighbours.
 *
 * The obvious `seedBase + attempt` looks harmless and is not: seed S on
 * its i-th retry and seed S+1 on its (i-1)-th retry both land on S+i, so
 * adjacent seeds converge onto the same successful configuration. That
 * stayed invisible at the tier where generation usually succeeds on the
 * first try, and collapsed the output everywhere it does not — 20
 * consecutive seeds at 8x8 Hard produced three distinct victims, because
 * nearly every seed walked the ladder into the same few survivors.
 *
 * Mixing instead of adding makes each (seed, attempt) pair its own point.
 */
export function mixSeed(seed: number, attempt: number): number {
  let h = Math.imul(seed | 0, 0x9e3779b1) ^ Math.imul(attempt + 1, 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 16), 0xc2b2ae35);
  return (h ^ (h >>> 13)) >>> 0;
}

export function randInt(rng: Rng, minInclusive: number, maxInclusive: number): number {
  return minInclusive + Math.floor(rng() * (maxInclusive - minInclusive + 1));
}

export function shuffle<T>(rng: Rng, items: readonly T[]): T[] {
  const arr = items.slice();
  for (let i = arr.length - 1; i > 0; i--) {
    const j = randInt(rng, 0, i);
    const tmp = arr[i]!;
    arr[i] = arr[j]!;
    arr[j] = tmp;
  }
  return arr;
}

export function pick<T>(rng: Rng, items: readonly T[]): T {
  const item = items[randInt(rng, 0, items.length - 1)];
  if (item === undefined) throw new Error("pick() called on an empty array");
  return item;
}
