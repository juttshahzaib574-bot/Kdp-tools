import { describe, expect, it } from "vitest";
import { generateGridMystery } from "../generate";
import { howToSolve, suspectsMatching, victimCardText, verdictExplanation } from "../verdict";
import { caseBriefFor } from "../case-titles";
import { mulberry32 } from "../rng";
import { renderTemplate, resolveNames } from "../text-template";

/**
 * The verdict — how a solved grid names a murderer — used to be one
 * hardcoded rule and one hardcoded sentence, on every puzzle of every
 * book at every tier. That made the last step of an Extreme puzzle the
 * same lookup as an Easy one, and printed the identical line thirty times
 * per interior.
 */
describe("the verdict", () => {
  const input = (p: ReturnType<typeof generateGridMystery>) => ({
    floorPlan: p.floorPlan,
    suspects: p.suspects,
    solution: p.solution,
    objects: p.objects,
    victimSuspectId: p.victimSuspectId,
    murderWeapon: p.murderWeapon,
  });

  it("points at exactly one suspect, and at the culprit — every tier", () => {
    // The property that makes a printed verdict honest. A rule matching
    // two people is not a harder puzzle, it is a wrong one.
    for (const difficulty of ["easy", "medium", "hard", "expert", "extreme"] as const) {
      for (let s = 0; s < 6; s++) {
        const p = generateGridMystery({ gridSize: 7, difficulty, themeId: "manor", seed: 8000 + s * 13 });
        const matches = suspectsMatching(p.verdict.kind, input(p));
        expect(matches, `${difficulty} seed ${s}`).toEqual([p.culpritSuspectId]);
      }
    }
  }, 300_000);

  it("scales with the tier instead of ending every puzzle the same way", () => {
    // Easy stays a one-step reveal on purpose. Everything above it has to
    // reach the evidence layer, which the seating grid cannot answer.
    const kindsFor = (difficulty: "easy" | "medium" | "expert") => {
      const kinds = new Set<string>();
      for (let s = 0; s < 6; s++) {
        kinds.add(
          generateGridMystery({ gridSize: 7, difficulty, themeId: "manor", seed: 8000 + s * 13 })
            .verdict.kind,
        );
      }
      return kinds;
    };
    expect([...kindsFor("easy")]).toEqual(["roomShare"]);
    expect(kindsFor("medium").has("roomShare")).toBe(false);
    // Expert has no fallback: both grids, always.
    expect([...kindsFor("expert")]).toEqual(["roomAndWeapon"]);
  }, 300_000);

  it("names a weapon whenever the rule depends on one", () => {
    for (const difficulty of ["medium", "extreme"] as const) {
      const p = generateGridMystery({ gridSize: 7, difficulty, themeId: "manor", seed: 8123 });
      expect(p.verdict.namedWeapon).toBe(p.murderWeapon);
      // And the printed card has to actually say it, or the reader has
      // no way to use the rule.
      const line = victimCardText(p.verdict, mulberry32(7));
      expect(line).toContain(p.murderWeapon);
    }
  }, 120_000);

  it("does not claim a crowded room when the room holds two", () => {
    // roomAndWeapon tells the reader several guests were present. That
    // has to be true.
    for (let s = 0; s < 8; s++) {
      const p = generateGridMystery({ gridSize: 7, difficulty: "extreme", themeId: "manor", seed: 8000 + s * 13 });
      if (p.verdict.kind !== "roomAndWeapon") continue;
      const inRoom = p.suspects.filter(
        (su) =>
          p.floorPlan.rooms.find((r) => r.cells.some((c) => c.row === p.solution[su.id]!.row && c.col === p.solution[su.id]!.col))
            ?.name === p.crimeRoomName,
      );
      expect(inRoom.length).toBeGreaterThanOrEqual(3);
    }
  }, 300_000);

  it("varies the victim's line across a book", () => {
    // Was one sentence, thirty times. The pool has to be wide enough that
    // a book does not read as a template.
    const lines = new Set<string>();
    for (let s = 0; s < 24; s++) {
      const p = generateGridMystery({ gridSize: 7, difficulty: "hard", themeId: "manor", seed: 8000 + s * 13 });
      lines.add(victimCardText(p.verdict, mulberry32(s * 7919)));
    }
    expect(lines.size).toBeGreaterThanOrEqual(12);
  }, 400_000);

  it("gives a brief that describes the rule actually printed", () => {
    for (const difficulty of ["easy", "expert"] as const) {
      const p = generateGridMystery({ gridSize: 7, difficulty, themeId: "manor", seed: 8039 });
      const brief = renderTemplate(caseBriefFor(p), resolveNames(p.suspects));
      if (p.verdict.kind === "roomShare") {
        expect(brief).toMatch(/exactly one other|one other person|single other/i);
      } else {
        // A weapon-based rule must name the weapon in the brief too.
        expect(brief).toContain(p.murderWeapon);
      }
    }
  }, 200_000);

  it("states the row and column rule in every method variant of every rule", () => {
    // The successor to the assertion that caught five unsolvable briefs.
    // A page whose method block omits this is a page that cannot be
    // solved, and the wording is pooled, so every combination has to be
    // checked rather than one sample of it.
    for (const kind of ["roomShare", "weaponBearer", "roomAndWeapon"] as const) {
      for (let h = 0; h < 64; h++) {
        const [place, trust, accuse] = howToSolve(
          { kind, namedWeapon: kind === "roomShare" ? undefined : "lead pipe" },
          8,
          h,
        );
        expect(place.toLowerCase()).toContain("row");
        expect(place.toLowerCase()).toContain("column");
        expect(place).toContain("8");
        // Step 2 has to say the statements are reliable, or a solver has
        // no ground to reason from at all.
        expect(trust.toLowerCase()).toMatch(/true|word|lies/);
        // Step 3 must describe the rule actually in play: a weapon rule
        // that does not name its weapon sends the reader to the wrong
        // grid.
        if (kind === "roomShare") {
          expect(accuse.toLowerCase()).toContain("room");
        } else {
          expect(accuse).toContain("lead pipe");
        }
      }
    }
  });

  it("uses all of each step pool across seeds", () => {
    // A pool that only ever yields its first entry is a pool in name
    // only — this is what the book-level hash is spending its entropy on.
    const place = new Set<string>();
    const accuse = new Set<string>();
    for (let h = 0; h < 64; h++) {
      const [p1, , p3] = howToSolve({ kind: "roomAndWeapon", namedWeapon: "iron poker" }, 6, h);
      place.add(p1);
      accuse.add(p3);
    }
    expect(place.size).toBe(4);
    expect(accuse.size).toBe(4);
  });

  it("explains itself in the answer key in the rule's own terms", () => {
    const p = generateGridMystery({ gridSize: 7, difficulty: "extreme", themeId: "manor", seed: 8039 });
    const text = verdictExplanation(p.verdict, "X", p.crimeRoomName);
    expect(text).toContain(p.murderWeapon);
  }, 120_000);
});
