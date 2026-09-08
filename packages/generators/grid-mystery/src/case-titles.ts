import { suspectToken } from "./text-template";
import type { GridMysteryPuzzle } from "./types";
import { briefFor, howToSolve } from "./verdict";

// Per-puzzle case titles.
//
// Every puzzle in a book used to carry the theme's name — thirty pages of
// "The Blackwood Manor Mystery". That is a duplicate-content signal on
// its own (thirty identical headings, thirty identical opening
// sentences), and it reads as machine output rather than as a book
// somebody edited.
//
// A title is derived from what actually happened in THAT puzzle: who
// died, in which room, with which object. So the titles vary because the
// puzzles vary, not because a random word was bolted on — and a reader
// can tell two cases apart at a glance.

/** "brass candlestick" -> "Brass Candlestick", for use inside a title. */
function titleCase(text: string): string {
  const minor = new Set(["of", "the", "a", "an", "and", "in", "on", "with"]);
  return text
    .split(" ")
    .map((word, i) =>
      i > 0 && minor.has(word.toLowerCase())
        ? word.toLowerCase()
        : word.charAt(0).toUpperCase() + word.slice(1),
    )
    .join(" ");
}

/** Small stable hash so a puzzle's title ordering is reproducible. */
function hash(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

interface CaseFacts {
  victim: string;
  room: string;
  weapon: string;
  theme: string;
}

/**
 * Title shapes. Kept deliberately varied in GRAMMAR, not just in the
 * words plugged into them — a pool of fifteen "The X Mystery" variants
 * would still leave every heading n-gram-similar, which is the thing
 * this exists to avoid.
 */
const TEMPLATES: readonly ((f: CaseFacts) => string)[] = [
  (f) => `Murder in the ${f.room}`,
  (f) => `A Death in the ${f.room}`,
  (f) => `The ${titleCase(f.weapon)} Killing`,
  (f) => `The Case of the ${titleCase(f.weapon)}`,
  (f) => `Who Killed ${f.victim}?`,
  (f) => `The ${f.victim} Affair`,
  (f) => `Last Seen in the ${f.room}`,
  (f) => `Death Comes to the ${f.room}`,
  (f) => `The ${f.room} Affair`,
  (f) => `${f.victim} Never Left the ${f.room}`,
  (f) => `An Evening in the ${f.room}`,
  (f) => `The Trouble with the ${titleCase(f.weapon)}`,
  (f) => `Silence in the ${f.room}`,
  (f) => `The Last Hours of ${f.victim}`,
  (f) => `What Happened in the ${f.room}`,
  (f) => `The ${titleCase(f.weapon)} Inquiry`,
  (f) => `No Witnesses in the ${f.room}`,
  (f) => `The Matter of ${f.victim}`,
];

function factsFor(puzzle: GridMysteryPuzzle): CaseFacts {
  // Tokenised like clue text, so renaming the victim retitles the case
  // without regenerating anything. See text-template.ts.
  const victim = puzzle.suspects.find((s) => s.id === puzzle.victimSuspectId);
  return {
    victim: victim ? suspectToken(victim.id) : "the victim",
    room: puzzle.crimeRoomName,
    weapon: puzzle.murderWeapon,
    theme: puzzle.theme,
  };
}

/**
 * Every title this puzzle could carry, in a stable seeded order.
 *
 * Returned as a LIST rather than a single string so the book compiler can
 * resolve collisions: two puzzles that happen to share a victim, room and
 * weapon would otherwise land on the same heading, which is exactly the
 * repetition this module exists to prevent. The compiler walks the list
 * and takes the first title not already used in that book.
 */
export function caseTitleVariants(puzzle: GridMysteryPuzzle): string[] {
  const facts = factsFor(puzzle);
  const h = hash(`${facts.victim}|${facts.room}|${facts.weapon}|${puzzle.theme}`);
  // Rotate the template list by the hash so different puzzles start at
  // different shapes, then keep the rest as fallbacks.
  const start = h % TEMPLATES.length;
  const ordered: string[] = [];
  for (let i = 0; i < TEMPLATES.length; i++) {
    ordered.push(TEMPLATES[(start + i) % TEMPLATES.length]!(facts));
  }
  // Dedupe in case two templates collapse to the same string.
  return [...new Set(ordered)];
}

/** The puzzle's own preferred title, ignoring book-level collisions. */
export function caseTitleFor(puzzle: GridMysteryPuzzle): string {
  return caseTitleVariants(puzzle)[0]!;
}

/**
 * One distinct title per puzzle for a whole book.
 *
 * Each puzzle takes the first of its own candidates that no earlier
 * puzzle claimed, so a thirty-puzzle book prints thirty different
 * headings even when two cases share a victim, a room and a weapon.
 * Lives here rather than inline in the renderer so the guarantee is
 * testable on its own.
 */
export function resolveCaseTitles(puzzles: readonly GridMysteryPuzzle[]): string[] {
  const used = new Set<string>();
  return puzzles.map((puzzle) => {
    const variants = caseTitleVariants(puzzle);
    // Falling back to variants[0] on total exhaustion is deliberate: a
    // duplicate heading is better than a crash or a blank title, and it
    // needs ~18 puzzles to agree on victim+room+weapon to happen at all.
    const fresh = variants.find((t) => !used.has(t)) ?? variants[0]!;
    used.add(fresh);
    return fresh;
  });
}

/**
 * Opening lines. The rule the reader needs is identical every time — one
 * suspect per row and column, the victim's roommate is the killer — but
 * stating it in the same words on all thirty pages is the same
 * duplicate-content problem as the titles, so the framing rotates.
 */
/**
 * The opening brief for a puzzle, varied per case AND matched to the
 * verdict rule actually in play.
 *
 * The pool used to live here and describe the room-share rule regardless,
 * because that was the only rule there was. A brief explaining a
 * different puzzle from the one printed is worse than no brief at all, so
 * the pools moved next to the rules in verdict.ts.
 */
export function caseBriefFor(puzzle: GridMysteryPuzzle): string {
  const facts = factsFor(puzzle);
  const h = hash(`brief|${facts.victim}|${facts.room}|${facts.weapon}`);
  return briefFor(puzzle.verdict, facts.victim, h);
}

/**
 * The three-step method printed under the heading, for this puzzle.
 *
 * Seeded from the BOOK, not the puzzle. Every other pool in this file
 * varies per page on purpose; this one must not. A method block that
 * rewords itself every page reads as noise to somebody who has already
 * learned the rules and as a different game to somebody who has not —
 * and the reader flipping back to check the rule needs to find the same
 * sentence in the same place. Across books it still varies, which is
 * where the duplicate-content risk actually lives.
 */
export function howToSolveFor(
  puzzle: GridMysteryPuzzle,
  bookSeed: number,
): [string, string, string] {
  return howToSolve(puzzle.verdict, puzzle.suspects.length, hash(`method|${bookSeed}`));
}
