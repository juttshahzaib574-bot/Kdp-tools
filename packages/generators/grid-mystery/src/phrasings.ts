// Phrasing variation pools for clue text.
//
// Every clue archetype in clues.ts routes its final wording through one of
// the pools below, and the pool is picked from by the puzzle's RNG — so
// two books generated at the same difficulty look very different at the
// sentence level, not just at the puzzle level. This is the single biggest
// lever against KDP's duplicate-content flags: n-gram similarity across
// books collapses when the same underlying constraint can appear as any of
// 4-7 different sentences.
//
// New phrasings are cheap to add: append another entry to the array. The
// caller's params object is the only place a new template can reach the
// puzzle data from, so keep param shapes minimal — no puzzle internals
// leak here, just presentation strings.
import { ordinal } from "./geometry";
import { pick, type Rng } from "./rng";

type Template<T> = (params: T) => string;

/**
 * Picks one template from a pool by the puzzle's RNG and applies it. The
 * pool is required to be non-empty at authoring time; `pick` throws if
 * that invariant is ever broken.
 */
export function phrase<T>(rng: Rng, pool: readonly Template<T>[], params: T): string {
  return pick(rng, pool)(params);
}

// ---------- Direct-tier phrasings ----------

export interface ColParams {
  name: string;
  col: number;
}
// The direct pools are the LARGEST, deliberately. Easy and Medium lean on
// direct clues, so a small pool there shows up as repeated sentences
// across a whole book — measured cross-book distinctness fell from 99% to
// 84% when Medium moved onto direct clues with only six phrasings each.
// Every entry added here is a straight win against duplicate-content
// detection.
export const DIRECT_COLUMN: Template<ColParams>[] = [
  ({ name, col }) => `${name} was in the ${ordinal(col)} column.`,
  ({ name, col }) => `${name} sat in column ${col}.`,
  ({ name, col }) => `${name} could be found in the ${ordinal(col)} column.`,
  ({ name, col }) => `The ${ordinal(col)} column held ${name}.`,
  ({ name, col }) => `Column ${col} was ${name}'s.`,
  ({ name, col }) => `${name} took a place in the ${ordinal(col)} column.`,
  ({ name, col }) => `Look to column ${col} for ${name}.`,
  ({ name, col }) => `${name} stood somewhere in the ${ordinal(col)} column.`,
  ({ name, col }) => `Column ${col} is where ${name} spent the evening.`,
  ({ name, col }) => `${name} never left the ${ordinal(col)} column.`,
  ({ name, col }) => `Whoever was in column ${col}, it was ${name}.`,
  ({ name, col }) => `${name} kept to the ${ordinal(col)} column.`,
  ({ name, col }) => `The ${ordinal(col)} column belonged to ${name}.`,
];

export interface RowParams {
  name: string;
  row: number;
}
export const DIRECT_ROW: Template<RowParams>[] = [
  ({ name, row }) => `${name} was in the ${ordinal(row)} row.`,
  ({ name, row }) => `${name} sat in row ${row}.`,
  ({ name, row }) => `The ${ordinal(row)} row held ${name}.`,
  ({ name, row }) => `${name}'s row was the ${ordinal(row)}.`,
  ({ name, row }) => `Row ${row} was where ${name} stood.`,
  ({ name, row }) => `${name} was seated along the ${ordinal(row)} row.`,
  ({ name, row }) => `Look along row ${row} for ${name}.`,
  ({ name, row }) => `${name} stayed on the ${ordinal(row)} row all evening.`,
  ({ name, row }) => `Row ${row} is where ${name} turned up.`,
  ({ name, row }) => `${name} never strayed from the ${ordinal(row)} row.`,
  ({ name, row }) => `Whoever was on row ${row}, it was ${name}.`,
  ({ name, row }) => `The ${ordinal(row)} row belonged to ${name}.`,
  ({ name, row }) => `${name} could be placed on row ${row}.`,
];

export interface RoomParams {
  name: string;
  room: string;
}
export const DIRECT_ROOM: Template<RoomParams>[] = [
  ({ name, room }) => `${name} was in the ${room}.`,
  ({ name, room }) => `${name} spent the evening in the ${room}.`,
  ({ name, room }) => `The ${room} was where ${name} was seen.`,
  ({ name, room }) => `${name} had been in the ${room} all along.`,
  ({ name, room }) => `${name}'s post was the ${room}.`,
  ({ name, room }) => `You'd find ${name} in the ${room}.`,
  ({ name, room }) => `${name} never left the ${room}.`,
  ({ name, room }) => `Ask anyone: ${name} was in the ${room}.`,
  ({ name, room }) => `The ${room} is where ${name} turned up.`,
  ({ name, room }) => `${name} was accounted for in the ${room}.`,
  ({ name, room }) => `Whoever was in the ${room}, it was ${name}.`,
  ({ name, room }) => `${name} kept to the ${room}.`,
  ({ name, room }) => `The ${room} held ${name} that evening.`,
];

export interface WallParams {
  name: string;
}
export const DIRECT_WALL: Template<WallParams>[] = [
  ({ name }) => `${name} was against one of the outer walls.`,
  ({ name }) => `${name} kept to the perimeter of the floor.`,
  ({ name }) => `${name} was seated along an outside wall.`,
  ({ name }) => `${name} never left the outer ring of the plan.`,
  ({ name }) => `${name} stayed against the outer walls the whole night.`,
  ({ name }) => `${name} had a wall at their back.`,
  ({ name }) => `${name} was on the edge of the floor plan.`,
  ({ name }) => `No inner square for ${name} — an outer wall it was.`,
  ({ name }) => `${name} hugged the outside of the plan.`,
  ({ name }) => `${name} took a spot along the outer edge.`,
];

// ---------- Relational-tier phrasings ----------

export interface LandmarkParams {
  name: string;
  landmark: string;
}
export const REL_LANDMARK: Template<LandmarkParams>[] = [
  ({ name, landmark }) => `${name} was beside a ${landmark}.`,
  ({ name, landmark }) => `A ${landmark} stood next to ${name}.`,
  ({ name, landmark }) => `${name} sat within arm's reach of a ${landmark}.`,
  ({ name, landmark }) => `${name} was one square from a ${landmark}.`,
  ({ name, landmark }) => `${name} shared a wall with a ${landmark}.`,
];

export interface DirParams {
  name: string;
  other: string;
  dir: "north" | "south" | "east" | "west";
}
export const REL_CARDINAL: Template<DirParams>[] = [
  ({ name, other, dir }) => `${name} was ${dir} of ${other}.`,
  ({ name, other, dir }) => `${name} sat to the ${dir} of ${other}.`,
  ({ name, other, dir }) => `From ${other}, ${name} was ${dir}.`,
  ({ name, other, dir }) => `${name}'s seat was ${dir} of ${other}'s.`,
  ({ name, other, dir }) => `${name} was somewhere ${dir} of ${other}.`,
];

export interface SameLineParams {
  name: string;
  other: string;
}
export const REL_SAME_ROW: Template<SameLineParams>[] = [
  ({ name, other }) => `${name} and ${other} shared a row.`,
  ({ name, other }) => `${name} was in the same row as ${other}.`,
  ({ name, other }) => `A single row held both ${name} and ${other}.`,
  ({ name, other }) => `${name} sat level with ${other}, row-wise.`,
];
export const REL_SAME_COLUMN: Template<SameLineParams>[] = [
  ({ name, other }) => `${name} and ${other} shared a column.`,
  ({ name, other }) => `${name} was in the same column as ${other}.`,
  ({ name, other }) => `A single column held both ${name} and ${other}.`,
  ({ name, other }) => `${name} lined up with ${other}, column-wise.`,
];

// ---------- Strong-tier phrasings ----------

export interface DiagonalParams {
  name: string;
  other: string;
  ns: "north" | "south";
  ew: "east" | "west";
}
export const STRONG_DIAGONAL: Template<DiagonalParams>[] = [
  ({ name, other, ns, ew }) => `${name} was ${ns} of ${other} — and ${ew} of them, too.`,
  ({ name, other, ns, ew }) => `${name} sat both ${ns} and ${ew} of ${other}.`,
  ({ name, other, ns, ew }) => `From ${other}, ${name} lay to the ${ns}${ew === "east" ? "east" : "west"}.`,
  ({ name, other, ns, ew }) => `${name} was ${ns} of ${other} on one axis and ${ew} on the other.`,
];

export interface CattyParams {
  name: string;
  other: string;
}
export const STRONG_CATTY: Template<CattyParams>[] = [
  ({ name, other }) => `${name} was catty-corner from ${other}.`,
  ({ name, other }) => `${name} sat diagonally next to ${other}.`,
  ({ name, other }) => `${name} and ${other} touched only at a corner.`,
  ({ name, other }) => `A single corner separated ${name} and ${other}.`,
];

export interface HeightRankParams {
  rank: number;
  room: string;
}
export const STRONG_HEIGHT: Template<HeightRankParams>[] = [
  ({ rank, room }) => `The ${ordinal(rank)}-tallest guest was in the ${room}.`,
  ({ rank, room }) => `Among the guests by height, the ${ordinal(rank)}-tallest was in the ${room}.`,
  ({ rank, room }) => `The ${room} held the ${ordinal(rank)}-tallest of the guests.`,
  ({ rank, room }) => `Ranked by height, the ${ordinal(rank)}-tallest was found in the ${room}.`,
];

export interface SameRoomParams {
  name: string;
  other: string;
  room: string;
}
export const STRONG_SAME_ROOM: Template<SameRoomParams>[] = [
  ({ name, other, room }) => `${name} shared the ${room} with ${other}.`,
  ({ name, other, room }) => `${name} and ${other} were together in the ${room}.`,
  ({ name, other, room }) => `The ${room} held both ${name} and ${other}.`,
  ({ name, other, room }) => `Both ${name} and ${other} were seen in the ${room}.`,
];

export interface DistanceParams {
  name: string;
  other: string;
  axis: "columns" | "rows";
  dir: "north" | "south" | "east" | "west";
  n: number;
}
export const STRONG_DISTANCE: Template<DistanceParams>[] = [
  ({ name, other, axis, dir, n }) =>
    `${name} was exactly ${n} ${axis === "columns" ? "column" : "row"}${n === 1 ? "" : "s"} ${dir} of ${other}.`,
  ({ name, other, dir, n }) =>
    `${name} sat ${n} step${n === 1 ? "" : "s"} ${dir} of ${other}.`,
  ({ name, other, axis, dir, n }) =>
    `Counting ${axis}, ${name} was ${n} ${dir} of ${other}.`,
];

// ---------- Negative (expert/extreme only) ----------

export const NEG_ROOM: Template<RoomParams>[] = [
  ({ name, room }) => `${name} was not in the ${room}.`,
  ({ name, room }) => `${name} never set foot in the ${room}.`,
  ({ name, room }) => `The ${room} was one place ${name} was not.`,
  ({ name, room }) => `${name} avoided the ${room} entirely.`,
  ({ name, room }) => `Nobody saw ${name} in the ${room}.`,
];

export const NEG_COLUMN: Template<ColParams>[] = [
  ({ name, col }) => `${name} was not in the ${ordinal(col)} column.`,
  ({ name, col }) => `${name} avoided column ${col}.`,
  ({ name, col }) => `Column ${col} was not ${name}'s.`,
  ({ name, col }) => `${name} was somewhere other than the ${ordinal(col)} column.`,
];

export const NEG_ROW: Template<RowParams>[] = [
  ({ name, row }) => `${name} was not in the ${ordinal(row)} row.`,
  ({ name, row }) => `${name} avoided row ${row}.`,
  ({ name, row }) => `Row ${row} was not ${name}'s.`,
  ({ name, row }) => `${name} was somewhere other than the ${ordinal(row)} row.`,
];

// ---------- Compound clues ----------
//
// Compound cards join two constraints about the same suspect into one
// sentence ("She was in the Vegetable Garden and in the 5th column").
// They're built from FRAGMENTS rather than by splicing two finished
// sentences together, so the grammar always lands — see the `fragment`
// field on Candidate in clues.ts.

export interface CompoundParams {
  name: string;
  first: string;
  second: string;
}
export const COMPOUND: Template<CompoundParams>[] = [
  ({ name, first, second }) => `${name} was ${first} and ${second}.`,
  ({ name, first, second }) => `${name} was ${first} — and ${second}, too.`,
  ({ name, first, second }) => `${name} was both ${first} and ${second}.`,
  ({ name, first, second }) => `${name} was ${first}, ${second}.`,
  ({ name, first, second }) => `Found ${first} and ${second}: ${name}.`,
];

// ---------- Evidence layer ----------
//
// Weighted toward location-based wording on purpose: those clues only
// become usable once the seating grid is solved, which is what chains
// the two deduction layers together.

export interface EvPersonParams {
  name: string;
  object: string;
}
export const EV_OBJECT_PERSON: Template<EvPersonParams>[] = [
  ({ name, object }) => `${name} carried the ${object}.`,
  ({ name, object }) => `The ${object} belonged to ${name}.`,
  ({ name, object }) => `${name} had the ${object} on them.`,
  ({ name, object }) => `Found on ${name}: the ${object}.`,
  ({ name, object }) => `The ${object} was ${name}'s.`,
];

export const EV_OBJECT_NOT_PERSON: Template<EvPersonParams>[] = [
  ({ name, object }) => `${name} did not carry the ${object}.`,
  ({ name, object }) => `The ${object} was not ${name}'s.`,
  ({ name, object }) => `Whoever had the ${object}, it wasn't ${name}.`,
  ({ name, object }) => `${name} can be ruled out for the ${object}.`,
];

export interface EvRoomParams {
  object: string;
  room: string;
}
export const EV_OBJECT_ROOM: Template<EvRoomParams>[] = [
  ({ object, room }) => `The ${object} was in the ${room}.`,
  ({ object, room }) => `Whoever was in the ${room} carried the ${object}.`,
  ({ object, room }) => `The ${room} is where the ${object} turned up.`,
  ({ object, room }) => `The ${object} never left the ${room}.`,
];

export interface EvColParams {
  object: string;
  col: number;
}
export const EV_OBJECT_COLUMN: Template<EvColParams>[] = [
  ({ object, col }) => `The ${object} was in the ${ordinal(col)} column.`,
  ({ object, col }) => `Whoever stood in column ${col} carried the ${object}.`,
  ({ object, col }) => `Column ${col} is where the ${object} was found.`,
  ({ object, col }) => `The ${object} sat somewhere in the ${ordinal(col)} column.`,
];

export interface EvRowParams {
  object: string;
  row: number;
}
export const EV_OBJECT_ROW: Template<EvRowParams>[] = [
  ({ object, row }) => `The ${object} was in the ${ordinal(row)} row.`,
  ({ object, row }) => `Whoever stood in row ${row} carried the ${object}.`,
  ({ object, row }) => `Row ${row} is where the ${object} was found.`,
  ({ object, row }) => `The ${object} sat somewhere along the ${ordinal(row)} row.`,
];

export interface EvTallestParams {
  rank: number;
  object: string;
}
export const EV_OBJECT_TALLEST: Template<EvTallestParams>[] = [
  ({ rank, object }) => `The ${ordinal(rank)}-tallest guest carried the ${object}.`,
  ({ rank, object }) => `The ${object} was held by the ${ordinal(rank)}-tallest of them.`,
  ({ rank, object }) => `Ranked by height, the ${ordinal(rank)}-tallest had the ${object}.`,
];

// ---------- Conditional (IF-THEN) tier phrasings ----------
// These clues create powerful logical chains by linking two conditions.
// They appear primarily in Hard+ puzzles where elegant deduction paths matter.

export interface ConditionalRoomRowParams {
  nameA: string;
  room: string;
  nameB: string;
  row: number;
}
export const CONDITIONAL_IF_ROOM_THEN_ROW: Template<ConditionalRoomRowParams>[] = [
  ({ nameA, room, nameB, row }) => `If ${nameA} was in the ${room}, then ${nameB} was in row ${row}.`,
  ({ nameA, room, nameB, row }) => `Were ${nameA} in the ${room}, ${nameB} would stand in row ${row}.`,
  ({ nameA, room, nameB, row }) => `${nameB} occupied row ${row} if ${nameA} was in the ${room}.`,
  ({ nameA, room, nameB, row }) => `Assuming ${nameA} was in the ${room}, ${nameB} must have been in row ${row}.`,
  ({ nameA, room, nameB, row }) => `In the scenario where ${nameA} was in the ${room}, ${nameB} was in row ${row}.`,
];

export interface ConditionalAdjacentThenColumnParams {
  nameA: string;
  nameB: string;
  nameC: string;
  col: number;
}
export const CONDITIONAL_IF_ADJACENT_THEN_COLUMN: Template<ConditionalAdjacentThenColumnParams>[] = [
  ({ nameA, nameB, nameC, col }) => `If ${nameA} stood adjacent to ${nameB}, then ${nameC} was in column ${col}.`,
  ({ nameA, nameB, nameC, col }) => `Should ${nameA} and ${nameB} have been neighbors, ${nameC} occupied column ${col}.`,
  ({ nameA, nameB, nameC, col }) => `${nameC} was in column ${col} if ${nameA} was next to ${nameB}.`,
];

export interface ConditionalSameRoomThenDirectionParams {
  nameA: string;
  nameB: string;
  room: string;
  nameC: string;
  direction: string;
}
export const CONDITIONAL_IF_SAME_ROOM_THEN_DIRECTION: Template<ConditionalSameRoomThenDirectionParams>[] = [
  ({ nameA, nameB, room, nameC, direction }) => `If ${nameA} shared the ${room} with ${nameB}, then ${nameC} was ${direction} of them.`,
  ({ nameA, nameB, room, nameC, direction }) => `Were ${nameA} and ${nameB} both in the ${room}, ${nameC} would be ${direction}.`,
];

export interface ConditionalHeightThenPositionParams {
  rank: number;
  name: string;
  position: string;
}
export const CONDITIONAL_IF_HEIGHT_THEN_POSITION: Template<ConditionalHeightThenPositionParams>[] = [
  ({ rank, name, position }) => `If the ${ordinal(rank)}-tallest was ${position}, then it was ${name}.`,
  ({ rank, name, position }) => `The ${ordinal(rank)}-tallest stood ${position} only if it was ${name}.`,
  ({ rank, name, position }) => `${name} was ${position} if they were the ${ordinal(rank)}-tallest.`,
];
