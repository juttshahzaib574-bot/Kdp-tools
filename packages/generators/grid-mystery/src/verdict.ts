import type { Assignment, Difficulty, FloorPlan, ObjectAssignment, Suspect } from "./types";
import { roomNameAt } from "./geometry";
import { pick, type Rng } from "./rng";

// How a solved grid names a murderer.
//
// This used to be one rule, hardcoded, on every puzzle of every book at
// every tier: the victim's room holds exactly two people, so the other
// one did it. Two things were wrong with that, and they are different
// problems.
//
// The first is repetition. The victim's card printed the identical
// sentence — "The victim. Whoever shared their room is the murderer." —
// on all thirty pages of a book and in every book the tool has ever
// produced. That is the duplicate-content signal the phrasing pools in
// phrasings.ts exist to defeat, sitting in the one place nothing varied.
//
// The second is worse. The final step of a murder mystery was a lookup.
// Once the seating was solved you read a name off the grid; no deduction
// remained. An Extreme puzzle ended exactly the way an Easy one did, so
// the hardest tier's last move was its easiest. The evidence layer — a
// whole second grid the solver has to work — contributed nothing to the
// answer at all.
//
// So the verdict is now a rule with variants, chosen per puzzle, scaling
// with the tier, and it is CHECKED rather than assumed: generation only
// accepts a rule that exactly one suspect satisfies.

export type VerdictKind = "roomShare" | "weaponBearer" | "roomAndWeapon";

export interface Verdict {
  kind: VerdictKind;
  /**
   * The weapon the rule names on the page, when it names one.
   *
   * Naming it is what moves work into the evidence layer: the reader has
   * to solve which guest was carrying that object, rather than reading a
   * name off the seating grid.
   */
  namedWeapon?: string;
}

/** Everything a rule needs to decide who it points at. */
export interface VerdictInput {
  floorPlan: FloorPlan;
  suspects: readonly Suspect[];
  solution: Assignment;
  objects: ObjectAssignment;
  victimSuspectId: string;
  murderWeapon: string;
}

/**
 * Every suspect the rule points at, given a solved puzzle.
 *
 * Returned as a list rather than a single id so the caller can check the
 * thing that actually matters: that the list has exactly one entry. A
 * rule that points at two people is not a harder puzzle, it is a broken
 * one, and it must be caught at generation rather than in print.
 */
export function suspectsMatching(kind: VerdictKind, input: VerdictInput): string[] {
  const { suspects, solution, objects, victimSuspectId, murderWeapon, floorPlan } = input;
  const others = suspects.filter((s) => s.id !== victimSuspectId);
  const victimRoom = roomNameAt(floorPlan, solution[victimSuspectId]!);
  const inVictimRoom = (id: string) => roomNameAt(floorPlan, solution[id]!) === victimRoom;
  const carries = (id: string) => objects[id] === murderWeapon;

  switch (kind) {
    case "roomShare":
      return others.filter((s) => inVictimRoom(s.id)).map((s) => s.id);
    case "weaponBearer":
      return others.filter((s) => carries(s.id)).map((s) => s.id);
    case "roomAndWeapon":
      return others.filter((s) => inVictimRoom(s.id) && carries(s.id)).map((s) => s.id);
  }
}

/** How many rooms hold the victim plus this many others, in the solution. */
export function victimRoomOccupancy(input: VerdictInput): number {
  const victimRoom = roomNameAt(input.floorPlan, input.solution[input.victimSuspectId]!);
  return input.suspects.filter(
    (s) => roomNameAt(input.floorPlan, input.solution[s.id]!) === victimRoom,
  ).length;
}

/**
 * The rules each tier may use, hardest first.
 *
 * The ladder is about how much of the puzzle has to be solved before the
 * name falls out, not about the wording:
 *
 *   roomShare      the seating grid, and only the victim's room of it.
 *   weaponBearer   the EVIDENCE grid. The page names the weapon found on
 *                  the body; the reader works out who was carrying it.
 *                  The seating grid does not answer this at all.
 *   roomAndWeapon  both. The victim's room holds more than one other
 *                  guest, so the room narrows it and the weapon decides
 *                  it — neither layer is sufficient alone.
 *
 * Easy keeps the one-step rule deliberately: a first puzzle should end
 * with a clean reveal, and the tier exists for readers who want that.
 * Everything above it has to earn its label.
 */
const LADDER: Record<Difficulty, readonly VerdictKind[]> = {
  easy: ["roomShare"],
  medium: ["weaponBearer", "roomShare"],
  hard: ["roomAndWeapon", "weaponBearer"],
  // Expert and Extreme have no fallback: they are the tiers whose whole
  // claim is that both grids have to be worked, so a puzzle that cannot
  // offer the two-layer verdict is retried rather than quietly printed
  // with an easier ending. Measured on 20 seeds at 7x7, that costs about
  // 5x the generation time at Expert (1.07s to 5.48s) and 3x at Extreme,
  // with the same 20/20 success rate — a background job spending four
  // extra seconds per puzzle, against a tier that otherwise ends the same
  // way Easy does.
  expert: ["roomAndWeapon"],
  extreme: ["roomAndWeapon"],
};

/**
 * The hardest rule this tier allows that exactly one suspect satisfies —
 * and that points at the culprit the puzzle already chose.
 *
 * Returns null when none does, which is the caller's cue to try another
 * seed rather than print a verdict that does not follow. Easy always has
 * roomShare available by construction, so only the upper tiers can fail
 * here, and they fail into a reroll.
 */
export function chooseVerdict(
  difficulty: Difficulty,
  culpritSuspectId: string,
  input: VerdictInput,
): Verdict | null {
  const occupancy = victimRoomOccupancy(input);
  for (const kind of LADDER[difficulty]) {
    // roomAndWeapon tells the reader the room held more than one
    // suspect. With only the victim and the culprit in it that sentence
    // is false, and the rule collapses into roomShare wearing a longer
    // description — so it is only offered when the room genuinely needs
    // the weapon to resolve.
    if (kind === "roomAndWeapon" && occupancy < 3) continue;
    const matches = suspectsMatching(kind, input);
    if (matches.length !== 1 || matches[0] !== culpritSuspectId) continue;
    return {
      kind,
      namedWeapon: kind === "roomShare" ? undefined : input.murderWeapon,
    };
  }
  return null;
}

// ---------------------------------------------------------------------
// Wording
// ---------------------------------------------------------------------

/**
 * The victim's card, phrased per puzzle.
 *
 * Pools rather than one string, for the same reason every clue archetype
 * routes through phrasings.ts: this line prints once per puzzle and a
 * book is thirty puzzles, so a single wording is thirty identical
 * sentences in one interior and the same thirty in the next book out.
 */
const VICTIM_CARD: Record<VerdictKind, readonly ((weapon: string) => string)[]> = {
  roomShare: [
    () => "The victim. They were not alone.",
    () => "Found dead — with company.",
    () => "The body. Someone else stood here.",
    () => "Killed in this room, and not by themselves.",
    () => "The victim. One other guest was present.",
    () => "Dead. This room was not empty.",
    () => "The victim, and a witness who is no witness.",
    () => "Found here. Somebody shared the room.",
    () => "The body. One companion, at the end.",
    () => "Murdered, with one other guest at hand.",
  ],
  weaponBearer: [
    (w) => `The victim, killed with the ${w}.`,
    (w) => `Found dead beside the ${w}.`,
    (w) => `The body. The ${w} did this.`,
    (w) => `Killed with the ${w}, and left where they fell.`,
    (w) => `The victim. The ${w} was the weapon.`,
    (w) => `Dead by the ${w}.`,
    (w) => `The ${w} was left with the body.`,
    (w) => `Struck down with the ${w}.`,
    (w) => `The body, and the ${w} beside it.`,
    (w) => `Killed by the ${w}, at close quarters.`,
  ],
  roomAndWeapon: [
    (w) => `The victim. A crowded room, and the ${w} in it.`,
    (w) => `Found dead among company, with the ${w}.`,
    (w) => `The body. Several guests, and one ${w}.`,
    (w) => `Killed here with the ${w}, in a full room.`,
    (w) => `The victim. This room held more than one suspect.`,
    (w) => `Dead in a crowded room, by the ${w}.`,
    (w) => `The victim, the ${w}, and too many witnesses.`,
    (w) => `Killed among company. The ${w} was to hand.`,
    (w) => `The body. Several stood here; one held the ${w}.`,
    (w) => `Murdered in a full room, with the ${w}.`,
  ],
};

export function victimCardText(verdict: Verdict, rng: Rng): string {
  const weapon = verdict.namedWeapon ?? "";
  return pick(rng, VICTIM_CARD[verdict.kind])(weapon);
}

/**
 * A suspect with no clue of their own.
 *
 * Only happens at the upper tiers, where clue-dropping is what makes them
 * hard — about 3% of cards, measured. "No statement on record" printed on
 * every one of them, which reads like missing data rather than a
 * deliberately silent witness. These say the same thing in the voice of
 * the book.
 */
const SILENT_CARD: readonly string[] = [
  "No statement on record.",
  "Gave no account of themselves.",
  "Said nothing the inspector could use.",
  "Declined to say where they had been.",
  "No statement — you will have to place them by elimination.",
  "Offered nothing. Their seat must be deduced from the others.",
];

export function silentCardText(rng: Rng): string {
  return pick(rng, SILENT_CARD);
}

/**
 * The opening hook, matched to the rule in play.
 *
 * This used to be the whole brief: one italic paragraph carrying both the
 * story ("Ashford was found dead...") and the mechanics ("every statement
 * is true, one suspect per row and per column"). Running the two together
 * meant the rules were prose a reader skims past on page one and cannot
 * find again on page nineteen — which is exactly the complaint against
 * our page and exactly what the competitor does differently: heading,
 * then the method, set apart and identical in shape on every page.
 *
 * So the mechanics moved to HOW_TO_SOLVE below and this kept the story.
 * Splitting them is not cosmetic — printing both would have said the same
 * sentence twice, an inch apart, on every page of every book.
 *
 * What each variant must still carry, because generation and the answer
 * depend on it: the victim's name, and — when the rule turns on the
 * weapon — the weapon. A hook that describes a different puzzle from the
 * one printed is worse than no hook at all.
 */
const HOOK: Record<VerdictKind, readonly ((victim: string, weapon: string) => string)[]> = {
  roomShare: [
    (v) => `${v} died with exactly one other person in the room.`,
    (v) => `Exactly one other guest was in the room when ${v} died.`,
    (v) => `${v} was found dead. Exactly one other person had been there.`,
    (v) => `Not alone: exactly one other guest shared the room where ${v} fell.`,
    (v) => `${v} is dead, and exactly one other person stood in that room.`,
    (v) => `The room where ${v} was found held exactly one other guest.`,
  ],
  weaponBearer: [
    (v, w) => `${v} was killed with the ${w}. Everyone denies touching it.`,
    (v, w) => `The ${w} was left where ${v} fell. Somebody carried it there.`,
    (v, w) => `${v} is dead by the ${w} — and one guest had it all evening.`,
    (v, w) => `They found ${v} beside the ${w}. Someone had been carrying it.`,
    (v, w) => `The ${w} that killed ${v} did not walk in by itself.`,
    (v, w) => `${v} was struck down with the ${w}. One pair of hands held it.`,
  ],
  roomAndWeapon: [
    (v, w) => `${v} was killed in a crowded room, with the ${w}.`,
    (v, w) => `More than one guest stood over ${v}. One of them held the ${w}.`,
    (v, w) => `${v} died with the ${w}, and with witnesses — one of them lying.`,
    (v, w) => `The room where ${v} fell was full. The ${w} was in one hand.`,
    (v, w) => `${v} is dead. The room narrows it; the ${w} finishes it.`,
    (v, w) => `No shortage of company when ${v} died. The ${w} cannot lie.`,
  ],
};

export function briefFor(verdict: Verdict, victim: string, hash: number): string {
  const pool = HOOK[verdict.kind];
  return pool[hash % pool.length]!(victim, verdict.namedWeapon ?? "");
}

// ---------------------------------------------------------------------
// How to solve
// ---------------------------------------------------------------------

/**
 * The method, in three steps, printed under the heading on every page.
 *
 * Three steps because the puzzle genuinely has three, and they are the
 * three the reader has to do IN ORDER: place the guests, trust the
 * statements, then apply the rule that names the murderer. Step 3 is the
 * one that changes with the tier — an Easy page ends at the seating grid,
 * an Extreme page cannot be answered from the seating grid at all — and
 * printing a step 3 that does not match the verdict in play would be the
 * same bug the briefs had before the pools moved next to the rules.
 *
 * Step 1 must name the row-and-column constraint. That is not flavour: it
 * is the constraint the whole grid rests on, and a page that omits it is
 * an unsolvable page. `verdict.test.ts` asserts it on every variant of
 * every rule, which is the successor to the assertion that caught five
 * unsolvable briefs when this text lived in one paragraph.
 */
const STEP_PLACE: readonly ((count: number) => string)[] = [
  (n) => `Seat all ${n} guests — one per row, one per column, on open squares.`,
  (n) => `Place the ${n} guests: no two share a row or a column, never on furniture.`,
  (n) => `All ${n} guests stand on open squares — one per row, one per column.`,
  (n) => `Fill the plan: ${n} guests, one to each row and column, off the furniture.`,
];

const STEP_TRUST: readonly string[] = [
  "Every statement on a card is true. A silent guest is placed by elimination.",
  "Take each card at its word. Where a card says nothing, the rest decide.",
  "Nobody lies here. A blank card is a gap to close, not a contradiction.",
  "All statements are true as written. Silence is placed by what is left.",
];

const STEP_ACCUSE: Record<VerdictKind, readonly ((weapon: string) => string)[]> = {
  roomShare: [
    () => "Then name the one other guest in the victim's room.",
    () => "Then look at the victim's room: its single other occupant did it.",
    () => "Finally, name whoever shares the victim's room. There is exactly one.",
    () => "Then read off the guest who ended up in the room with the victim.",
  ],
  weaponBearer: [
    (w) => `Then work the evidence: the guest carrying the ${w} is the murderer.`,
    (w) => `Then settle who held the ${w}. The seating grid will not tell you.`,
    (w) => `Finally, deduce which guest was carrying the ${w}.`,
    (w) => `Then use the objects: whoever had the ${w} did it.`,
  ],
  roomAndWeapon: [
    (w) => `Then cross both: in the victim's room, the one holding the ${w}.`,
    (w) => `Then narrow to the victim's room and find who carried the ${w}.`,
    (w) => `Finally, of those in the victim's room, name the one with the ${w}.`,
    (w) => `Then combine the grids: same room as the victim, holding the ${w}.`,
  ],
};

/**
 * The three steps for one puzzle.
 *
 * `hash` should be BOOK-level, not per-puzzle. The wording of a method
 * block is the one text on the page that should NOT vary from page to
 * page — a reader who has read it once skips it, and a reader who has
 * not needs to find the same shape in the same place. Varying it across
 * books is still worth having, because thirty identical pages in two
 * different interiors is the duplicate-content signal the phrasing pools
 * exist to defeat; varying it within one book just looks careless.
 */
export function howToSolve(
  verdict: Verdict,
  suspectCount: number,
  hash: number,
): [string, string, string] {
  const accuse = STEP_ACCUSE[verdict.kind];
  // Three independent draws from one number, by remixing rather than by
  // shifting. `hash >>> 6` looked like three independent indices and is
  // zero for every hash below 64 — so on a small book seed all three
  // steps collapsed onto pool entry 0 and the "pool" was one string.
  // verdict.test.ts sweeps h=0..63 for exactly this.
  const mix = (salt: number) => {
    let h = Math.imul(hash ^ salt, 0x9e3779b1) >>> 0;
    h ^= h >>> 15;
    return h >>> 0;
  };
  return [
    STEP_PLACE[mix(0x11) % STEP_PLACE.length]!(suspectCount),
    STEP_TRUST[mix(0x22) % STEP_TRUST.length]!,
    accuse[mix(0x33) % accuse.length]!(verdict.namedWeapon ?? ""),
  ];
}

/**
 * How the answer key explains the verdict.
 *
 * A reader who got it wrong needs to see WHY, and "they shared the room"
 * is only the reasoning for one of three rules.
 */
export function verdictExplanation(verdict: Verdict, culprit: string, room: string): string {
  switch (verdict.kind) {
    case "roomShare":
      return `${culprit} was the only other guest in the ${room}.`;
    case "weaponBearer":
      return `${culprit} was carrying the ${verdict.namedWeapon}.`;
    case "roomAndWeapon":
      return `${culprit} was in the ${room} and was the one there carrying the ${verdict.namedWeapon}.`;
  }
}
