import { describe, expect, it } from "vitest";
import { generateGridMystery } from "../generate";
import { countObjectAssignments } from "../objects";
import { roomNameAt } from "../geometry";
import { suspectsMatching } from "../verdict";
import type { Difficulty } from "../types";

/**
 * Regression guards for the two things that make this puzzle honest:
 *
 * The culprit used to be picked at RANDOM, which meant the question
 * printed on every puzzle page ("THE CULPRIT IS: ____") had no derivation
 * from the clues — a reader could solve the grid perfectly and still be
 * unable to answer. These tests assert the property that fixes it.
 *
 * That property used to be "the victim's room holds exactly two people",
 * because the verdict was always "the other occupant did it". It is now
 * the more general thing that rule was a special case of: whatever rule
 * this puzzle prints, exactly one suspect satisfies it and that suspect
 * is the culprit. The upper tiers deliberately use a crowded crime scene
 * (see verdict.ts), so the old assertion would now reject the puzzles it
 * was written to protect.
 *
 * The evidence layer makes the same kind of promise (a unique
 * suspect -> object mapping), and gets the same kind of check.
 */
describe("victim, culprit and evidence are genuinely derivable", () => {
  const difficulties: Difficulty[] = ["easy", "medium", "hard", "expert", "extreme"];

  for (const difficulty of difficulties) {
    it(`${difficulty}: the printed verdict names exactly one suspect, the culprit`, () => {
      for (let seed = 0; seed < 10; seed++) {
        const puzzle = generateGridMystery({ gridSize: 7, difficulty, seed: 31_000 + seed });

        const victim = puzzle.suspects.find((s) => s.id === puzzle.victimSuspectId);
        const culprit = puzzle.suspects.find((s) => s.id === puzzle.culpritSuspectId);
        expect(victim, "victim must be a real suspect").toBeDefined();
        expect(culprit, "culprit must be a real suspect").toBeDefined();
        expect(puzzle.culpritSuspectId).not.toBe(puzzle.victimSuspectId);

        const crimeRoom = roomNameAt(puzzle.floorPlan, puzzle.solution[puzzle.victimSuspectId]!);
        expect(crimeRoom).toBe(puzzle.crimeRoomName);

        // The load-bearing property, stated against the rule this puzzle
        // actually prints rather than against one particular rule.
        expect(
          suspectsMatching(puzzle.verdict.kind, {
            floorPlan: puzzle.floorPlan,
            suspects: puzzle.suspects,
            solution: puzzle.solution,
            objects: puzzle.objects,
            victimSuspectId: puzzle.victimSuspectId,
            murderWeapon: puzzle.murderWeapon,
          }),
          `${difficulty} seed ${seed}: verdict must name one suspect`,
        ).toEqual([puzzle.culpritSuspectId]);

        const occupants = puzzle.suspects.filter(
          (s) => roomNameAt(puzzle.floorPlan, puzzle.solution[s.id]!) === crimeRoom,
        );
        // Both room-based rules put the culprit at the scene; what
        // differs is whether the room alone is enough to name them.
        if (puzzle.verdict.kind !== "weaponBearer") {
          expect(occupants.map((s) => s.id)).toContain(puzzle.culpritSuspectId);
        }
        if (puzzle.verdict.kind === "roomShare") {
          expect(occupants).toHaveLength(2);
        }
        if (puzzle.verdict.kind === "roomAndWeapon") {
          // The rule tells the reader the room held several suspects. If
          // it did not, the sentence on the page is a lie.
          expect(occupants.length).toBeGreaterThanOrEqual(3);
        }
      }
    });
  }

  it("every suspect carries exactly one distinct object", () => {
    for (let seed = 0; seed < 10; seed++) {
      const puzzle = generateGridMystery({ gridSize: 7, difficulty: "medium", seed: 55_000 + seed });
      const carried = puzzle.suspects.map((s) => puzzle.objects[s.id]);
      for (const object of carried) expect(object).toBeTruthy();
      expect(new Set(carried).size).toBe(puzzle.suspects.length);
    }
  });

  it("the murder weapon is the culprit's own object", () => {
    for (let seed = 0; seed < 10; seed++) {
      const puzzle = generateGridMystery({ gridSize: 7, difficulty: "hard", seed: 66_000 + seed });
      expect(puzzle.murderWeapon).toBe(puzzle.objects[puzzle.culpritSuspectId]);
    }
  });

  it("the evidence layer admits exactly one mapping under its own solution", () => {
    // Re-checks the object solver from outside the generator: an
    // unconstrained pool must admit many mappings (otherwise a
    // uniqueness check would pass vacuously), and the recorded solution
    // must be exactly one of them.
    for (let seed = 0; seed < 6; seed++) {
      const puzzle = generateGridMystery({ gridSize: 6, difficulty: "medium", seed: 77_000 + seed });
      const suspectIds = puzzle.suspects.map((s) => s.id);
      const pool = suspectIds.map((id) => puzzle.objects[id]!);

      const unconstrained = countObjectAssignments(suspectIds, pool, [], 2);
      expect(unconstrained).toBeGreaterThan(1);

      const matchesSolution = countObjectAssignments(
        suspectIds,
        pool,
        [
          {
            isSatisfied: (a) => suspectIds.every((id) => !a[id] || a[id] === puzzle.objects[id]),
          },
        ],
        2,
      );
      expect(matchesSolution).toBe(1);
    }
  });

  it("every printed evidence clue is non-empty and the block is never empty", () => {
    for (let seed = 0; seed < 8; seed++) {
      const puzzle = generateGridMystery({ gridSize: 7, difficulty: "medium", seed: 99_000 + seed });
      expect(puzzle.evidenceClues.length).toBeGreaterThan(0);
      for (const clue of puzzle.evidenceClues) expect(clue.text.trim().length).toBeGreaterThan(0);
    }
  });

  it("no clue ever references a suspect who isn't on the roster", () => {
    // Extreme drops two verified clues, so some suspects legitimately have
    // no clue of their own. The renderer walks the suspect list rather
    // than the clue list precisely so those people still appear — this
    // asserts the data supports that.
    for (let seed = 0; seed < 8; seed++) {
      const puzzle = generateGridMystery({ gridSize: 7, difficulty: "extreme", seed: 88_000 + seed });
      const ids = new Set(puzzle.suspects.map((s) => s.id));
      for (const clue of puzzle.clues) expect(ids.has(clue.suspectId)).toBe(true);
    }
  });
});
