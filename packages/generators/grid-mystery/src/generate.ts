import { buildOccupyMaskAndLandmarks, generateRooms, identifyDoors, toFloorPlan } from "./floor-plan";
import { generateClueSet } from "./clues";
import type { ClueConstraint } from "./solve";
import { roomNameAt } from "./geometry";
import { themeById, type ThemeContent } from "./content";
import { generateEvidence } from "./objects";
import { mixSeed, mulberry32, randInt, type Rng, shuffle } from "./rng";
import { countSolutions, type SolveStats } from "./solve";
import { gradePuzzle } from "./tier-contract";
import { chooseVerdict, type Verdict } from "./verdict";
import { describeProfile } from "./technique-solver";
import type {
  Assignment,
  Difficulty,
  FloorPlan,
  GridMysteryPuzzle,
  Suspect,
} from "./types";

/**
 * Thrown if a puzzle ever reaches the point of being returned without an
 * independently re-confirmed unique solution. This should be unreachable in
 * practice (generateClueSet already gates on solutions === 1) — it exists
 * as a hard failure mode so a future refactor of clues.ts can never
 * silently ship an unverified book, rather than a soft warning that's easy
 * to miss.
 */
export class PuzzleVerificationFailedError extends Error {
  constructor(actualSolutionCount: number) {
    super(
      `Generated puzzle failed independent re-verification: solver found ${actualSolutionCount} solution(s), expected exactly 1`,
    );
    this.name = "PuzzleVerificationFailedError";
  }
}

export interface GenerateGridMysteryOptions {
  /** Grid size and suspect count — one suspect per row and per column. */
  gridSize: number;
  difficulty: Difficulty;
  /** A content pack directly. Takes precedence over `themeId`. */
  theme?: ThemeContent;
  /**
   * A theme id from MYSTERY_THEMES in @kdp/shared ("manor", "farm",
   * "camp", "messHall"). Unknown ids fall back to the manor pack rather
   * than throwing, so a stale id stored on an old book still generates.
   */
  themeId?: string;
  seed?: number;
}


// v1 range: benchmarked at 90/90 successful generations across every
// size/difficulty combination from 6-8 with 10 seeds each (worst case ~16s,
// typical case under 1s). Sizes above 8 fail intermittently, sometimes
// taking 30+ seconds even when they do converge, because the current
// one-clue-per-suspect escalation search doesn't always have enough
// candidate clues to reach uniqueness at higher suspect counts — that needs
// a smarter (e.g. multi-clue) selection algorithm, not just a bigger
// attempt budget. Extend this range only after equivalent benchmarking.
const MIN_GRID_SIZE = 6;
const MAX_GRID_SIZE = 8;
// Raised from 12: a puzzle now has to clear three gates rather than one
// (unique seating, a room holding exactly two people so the culprit is
// derivable, and a uniquely-pinned evidence layer). Each gate rejects
// some fraction of otherwise-fine floor plans, so the attempt budget
// needs headroom to keep end-to-end success at 100%.
//
// Raised again from 40 when the retry seeds stopped being consecutive.
// The old ladder walked seedBase..seedBase+39, so neighbouring base seeds
// searched an overlapping corridor; independent seeds lose that and 8x8
// Hard measured 5/100 generation failures at 40 attempts against 0/100
// before. Measured back down the same 100 seeds: 1/100 at 80, 0/100 at
// 160. Costs nothing on the paths that succeed — only a puzzle heading
// for failure ever spends the extra attempts — and the honest fix for
// 8x8's fragility is still the clue-selection algorithm noted above, not
// the budget.
const MAX_PUZZLE_ATTEMPTS = 160;
const MIN_HEIGHT_IN = 60; // 5'0"
const MAX_HEIGHT_IN = 76; // 6'4"

/**
 * Picks the victim/culprit pair: a room holding EXACTLY two suspects in
 * the solution, one of whom becomes the victim and the other the
 * culprit.
 *
 * This is what makes "who did it?" answerable. Previously the culprit was
 * chosen at random, which meant the printed question had no derivation
 * from the clues at all — a reader could solve the entire grid correctly
 * and still have no way to name the murderer. Now the victim is
 * identified on the page and the rule is stated ("whoever shared her room
 * is the killer"), so the final answer follows from the solved grid by
 * one more deduction step.
 *
 * Returns null when no room holds exactly two people — the caller
 * regenerates rather than falling back to an underivable culprit.
 */
function pickVictimAndCulprit(
  floorPlan: FloorPlan,
  suspects: readonly Suspect[],
  solution: Assignment,
  rng: Rng,
  /**
   * Rooms holding this many suspects are acceptable as the crime scene.
   *
   * Two was the only option while the verdict was always "the other
   * occupant did it". The upper tiers now use a rule that needs the
   * evidence layer to pick between several guests in the room, and that
   * rule is only honest when the room actually holds several — so those
   * tiers ask for three and fall back to two when the plan cannot give
   * them one. See verdict.ts.
   */
  wantedOccupancy: readonly number[],
): { victim: Suspect; culprit: Suspect; room: string } | null {
  const byRoom = new Map<string, Suspect[]>();
  for (const suspect of suspects) {
    const room = roomNameAt(floorPlan, solution[suspect.id]!);
    const bucket = byRoom.get(room);
    if (bucket) bucket.push(suspect);
    else byRoom.set(room, [suspect]);
  }

  // Tried in the order the caller asked for, so a tier that prefers a
  // crowded room gets one where the floor plan allows and degrades
  // quietly where it does not.
  for (const wanted of wantedOccupancy) {
    const rooms = [...byRoom.entries()].filter(([, occupants]) => occupants.length === wanted);
    if (rooms.length === 0) continue;
    const [room, occupants] = rooms[randInt(rng, 0, rooms.length - 1)]!;
    const order = shuffle(rng, occupants);
    return { victim: order[0]!, culprit: order[1]!, room };
  }
  return null;
}

function buildSuspects(size: number, theme: ThemeContent, rng: Rng): Suspect[] {
  if (theme.suspectFirstNames.length < size) {
    throw new Error(
      `Theme "${theme.name}" only has ${theme.suspectFirstNames.length} suspect names, need ${size}`,
    );
  }
  if (theme.suspectLastNames.length < size) {
    throw new Error(
      `Theme "${theme.name}" only has ${theme.suspectLastNames.length} surnames, need ${size}`,
    );
  }
  // Cast on BOTH halves of the name, not just the given name.
  //
  // The pool a reader perceives is first x last, so drawing 8 of 16 given
  // names left any two puzzles in a book sharing four of their eight
  // suspects (measured; see docs/story-and-series-plan.md). Drawing the
  // surname too takes the same 16 given names and 10 surnames from a pool
  // of 16 to a pool of 160, and at 16x16 — where 16 suspects out of 16
  // given names meant every puzzle had the identical cast — from an
  // overlap of 16.0 to 1.6.
  //
  // Surnames are also what makes the text read like a mystery rather than
  // a worksheet: "Miss Ashford was in the third column" against "Ursula
  // was in the third column".
  const given = shuffle(rng, theme.suspectFirstNames).slice(0, size);
  const family = shuffle(rng, theme.suspectLastNames).slice(0, size);

  const heightPool = Array.from(
    { length: MAX_HEIGHT_IN - MIN_HEIGHT_IN + 1 },
    (_, i) => MIN_HEIGHT_IN + i,
  );
  if (heightPool.length < size) {
    throw new Error(`Height range too small for ${size} distinct suspects`);
  }
  const heights = shuffle(rng, heightPool).slice(0, size);

  return given.map((givenName, i) => {
    const surname = family[i]!;
    return {
      id: `s${i}`,
      name: `${givenName} ${surname}`,
      givenName,
      surname,
      heightIn: heights[i]!,
    };
  });
}

/**
 * Generates one complete, mathematically-verified murder-mystery grid
 * puzzle: no LLM involved anywhere — the floor plan, suspect placement, and
 * clue wording are all deterministic, and the clue set is only accepted
 * once a brute-force solver confirms it has exactly one solution.
 */
/**
 * A puzzle together with the constraint predicates that prove it.
 *
 * The predicates are closures, so they can't cross a worker boundary or
 * a database — which is why the puzzle itself doesn't carry them. What
 * needs them (difficulty certification, hint derivation) runs in the
 * same process that generated the puzzle, and asks for them here.
 */
export interface GeneratedWithProof {
  puzzle: GridMysteryPuzzle;
  constraints: ClueConstraint[];
}

/**
 * Generates a puzzle and hands back its proof obligations alongside it.
 *
 * Same work as generateGridMystery — that function is this one with the
 * constraints dropped — so there is exactly one generation path and no
 * chance of the two diverging.
 */
export function generateWithProof(options: GenerateGridMysteryOptions): GeneratedWithProof {
  const result = generateInternal(options);
  return result;
}

export function generateGridMystery(options: GenerateGridMysteryOptions): GridMysteryPuzzle {
  return generateInternal(options).puzzle;
}

function generateInternal(options: GenerateGridMysteryOptions): GeneratedWithProof {
  const size = options.gridSize;
  if (size < MIN_GRID_SIZE || size > MAX_GRID_SIZE) {
    throw new Error(`gridSize must be between ${MIN_GRID_SIZE} and ${MAX_GRID_SIZE}`);
  }
  const theme = options.theme ?? themeById(options.themeId);
  const seedBase = options.seed ?? Date.now();
  const requestedDifficulty = options.difficulty;
  // Best out-of-band candidate seen so far. If every attempt misses the
  // requested tier we ship this one RE-TIERED to the label it actually
  // earned, rather than either failing outright or lying about it.
  let fallback: GeneratedWithProof | null = null;

  for (let attempt = 0; attempt < MAX_PUZZLE_ATTEMPTS; attempt++) {
    const rng = mulberry32(mixSeed(seedBase, attempt));

    const rooms = generateRooms(size, theme.roomNames, rng);
    const suspects = buildSuspects(size, theme, rng);

    const columns = shuffle(
      rng,
      Array.from({ length: size }, (_, i) => i),
    );
    const solution: Assignment = {};
    suspects.forEach((suspect, row) => {
      solution[suspect.id] = { row, col: columns[row]! };
    });

    const { occupyMask, landmarks } = buildOccupyMaskAndLandmarks(
      size,
      rooms,
      Object.values(solution),
      theme.landmarkNames,
      rng,
    );
    const doors = identifyDoors(rooms, size, rng);
    const floorPlan = toFloorPlan(size, rooms, occupyMask, landmarks, doors);

    // The culprit must be DERIVABLE, not drawn from a hat — see
    // pickVictimAndCulprit. If this floor plan/solution has no room with
    // exactly two occupants there's no honest way to pose the question,
    // so start over.
    //
    // Checked HERE, before the clue search, precisely because it's cheap
    // and the clue search isn't: this gate depends only on the floor plan
    // and the seating, both of which already exist at this point, so a
    // rejection costs a few map lookups instead of throwing away a
    // completed backtracking solve.
    // Upper tiers ask for a crowded crime scene first: their verdict
    // rule needs the evidence layer to pick between the guests in the
    // room, and a room holding only the victim and one other makes that
    // rule a longer way of saying "the other one did it".
    const wantedOccupancy =
      requestedDifficulty === "easy" || requestedDifficulty === "medium" ? [2] : [3, 2];
    const cast = pickVictimAndCulprit(floorPlan, suspects, solution, rng, wantedOccupancy);
    if (!cast) continue;

    // The evidence layer is built BEFORE the clues now, and the order is
    // load-bearing rather than tidy. Expert and Extreme are defined as
    // the tiers whose grids cannot be finished without carrying the
    // evidence block back into the seating (see tier-contract.ts), so
    // the clue search has to be able to grade a candidate set against
    // the evidence it will actually be printed with. It can't do that if
    // the evidence doesn't exist yet.
    //
    // Nothing about the evidence depends on the clues — it is a function
    // of the floor plan and the seating, both of which are already
    // fixed here — so moving it earlier costs nothing and rejects a bad
    // floor plan before the expensive clue search rather than after.
    const evidence = generateEvidence(suspects, floorPlan, solution, theme.objectNames, rng);
    if (!evidence) continue;

    const evidenceForSolver = {
      objectPool: Object.values(evidence.objects),
      facts: evidence.clues.map((clue) => clue.fact),
    };

    const verifiedClueSet = generateClueSet(
      floorPlan,
      suspects,
      solution,
      options.difficulty,
      rng,
      cast.victim.id,
      evidenceForSolver,
    );
    if (!verifiedClueSet) continue;

    // Independent re-check, deliberately redundant with the one inside
    // generateClueSet: re-solve the exact constraint set it verified,
    // using a fresh call at the top level rather than trusting its
    // internal accept path. This is the generator's own gate, not just
    // the clue-selection loop's — a puzzle can only leave this function
    // once *this* call, made here, confirms exactly one solution.
    // The same solve that proves uniqueness also measures the effort it
    // took — that number is the puzzle's calibrated difficulty signal.
    const solveDepth: SolveStats = { nodes: 0, backtracks: 0 };
    const independentSolutionCount = countSolutions(
      size,
      occupyMask,
      suspects.map((s) => s.id),
      verifiedClueSet.constraints,
      2,
      undefined,
      solveDepth,
    );
    if (independentSolutionCount !== 1) {
      throw new PuzzleVerificationFailedError(independentSolutionCount);
    }

    // Unique seating (proved above) plus unique objects-given-seating
    // (proved by generateEvidence) means the puzzle as a whole has
    // exactly one solution across both layers.
    //
    // The technique grade is taken here, once, against the same
    // constraints the uniqueness proof used. It answers the question a
    // solution count cannot: not "is there one answer" but "what does a
    // reader have to KNOW HOW TO DO to find it".
    const grade = gradePuzzle(
      { floorPlan, suspects, victimSuspectId: cast.victim.id, evidence: evidenceForSolver },
      verifiedClueSet.constraints,
    );
    // No route by reasoning at any ceiling. Unique, verifiable, and
    // miserable — the exact thing the tier contract exists to keep out
    // of a book, so it is not even kept as a fallback.
    if (!grade.earned || !grade.profile) continue;

    // How the solved grid names the murderer. Checked, not assumed: a
    // rule that points at nobody or at two people is rejected here and
    // the seed is retried, so a printed verdict always follows from the
    // puzzle it is printed on.
    const verdict: Verdict | null = chooseVerdict(requestedDifficulty, cast.culprit.id, {
      floorPlan,
      suspects,
      solution,
      objects: evidence.objects,
      victimSuspectId: cast.victim.id,
      murderWeapon: evidence.objects[cast.culprit.id]!,
    });
    if (!verdict) continue;

    const puzzle: GridMysteryPuzzle = {
      verdict,
      theme: theme.name,
      themeId: theme.id,
      difficulty: requestedDifficulty,
      floorPlan,
      suspects,
      solution,
      clues: verifiedClueSet.clues,
      victimSuspectId: cast.victim.id,
      culpritSuspectId: cast.culprit.id,
      crimeRoomName: cast.room,
      objects: evidence.objects,
      evidenceClues: evidence.clues,
      murderWeapon: evidence.objects[cast.culprit.id]!,
      solveDepth,
      requestedDifficulty,
      logicProfile: {
        solvedAt: grade.solvedAt!,
        chain: grade.chain,
        techniques: grade.profile.used,
        summary: describeProfile(grade.profile),
      },
    };

    // The tier gate. A tier is a promise about the REASONING the puzzle
    // demands, so the grade decides — the measured search effort is kept
    // on the puzzle as a secondary signal (the ledger reports it) but it
    // no longer decides the label. Search nodes measure how hard a
    // machine has to grind; they do not measure whether a person needs
    // arc consistency or can read the answer off the cards.
    if (grade.earned === requestedDifficulty) {
      return { puzzle, constraints: verifiedClueSet.constraints };
    }
    // Out of band. Keep the first near-miss RE-TIERED to what it earned,
    // and try another seed; a later attempt usually lands in band, and
    // this costs nothing if one does.
    fallback ??= {
      puzzle: { ...puzzle, difficulty: grade.earned },
      constraints: verifiedClueSet.constraints,
    };
  }

  // Every attempt missed. Ship the best candidate under the label it
  // genuinely earned — never under the one that was asked for. It was
  // already re-tiered when it was kept, from its technique grade rather
  // than from search effort.
  if (fallback) return fallback;

  throw new Error(
    `Failed to generate a verified grid-mystery puzzle for size ${size} after ${MAX_PUZZLE_ATTEMPTS} attempts`,
  );
}
