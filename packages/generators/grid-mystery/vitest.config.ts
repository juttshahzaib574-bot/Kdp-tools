import { defineConfig } from "vitest/config";

// This suite's tests are SLOW on purpose, and that has to be declared.
//
// Verifying a puzzle means solving it — repeatedly, at four technique
// ceilings, across dozens of seeds — so single tests here legitimately
// run for a minute or more: the 8x8 Hard seed-independence sweep takes
// 101s, the extreme roster check 77s, the uniqueness stress file 222s.
// That is the cost of testing a solver against real puzzles rather than
// against fixtures, and it is worth paying.
//
// What was NOT declared is that cost. There was no config here at all, so
// every one of those tests inherited the 5000ms default `testTimeout` and
// ran a hundred times past it. Vitest 2 did not enforce the default;
// Vitest 5 does, and 21 tests across 6 files failed the moment the major
// was tried. Nothing about the tests changed — they had simply never been
// inside their budget, and the budget was never real.
//
// So it is set here, once, to a number this suite can actually meet.
// Individual tests still narrow it further where they know their own cost
// (the `}, 900_000)` third argument), and a test that hangs still fails
// rather than running forever.
export default defineConfig({
  test: {
    testTimeout: 300_000,
    hookTimeout: 60_000,
  },
});
