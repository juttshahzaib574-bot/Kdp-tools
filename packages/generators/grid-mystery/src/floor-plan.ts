import type { Cell, FloorPlan, Landmark, Room } from "./types";
import { type Rng, randInt, shuffle } from "./rng";

/**
 * Smallest room we'll accept. Rooms below this get absorbed into a
 * neighbour, so no room is ever a one-cell closet that a room clue
 * would trivially give away.
 */
const MIN_ROOM_CELLS = 3;

function roomCountFor(size: number): number {
  // Roughly one room per 7-8 cells, bounded so a 6x6 doesn't end up with
  // two enormous rooms and a 8x8 doesn't shatter into slivers.
  if (size <= 6) return 4;
  if (size <= 7) return 5;
  return 6;
}

const NEIGHBOUR_DELTAS: readonly [number, number][] = [
  [-1, 0],
  [1, 0],
  [0, -1],
  [0, 1],
];

/**
 * Partitions a size x size grid into irregular, contiguous rooms by
 * seeding one cell per room and flood-growing them simultaneously until
 * every cell is claimed.
 *
 * The previous implementation recursively split the grid into rectangles,
 * which meant every floor plan was visibly a grid of boxes — both less
 * interesting to look at and a much smaller space of distinct plans.
 * Simultaneous growth produces L-shapes, T-shapes and staircases while
 * still guaranteeing each room is a single connected blob (growth only
 * ever adds a cell orthogonally adjacent to that room's existing cells),
 * which is what the room-based clues depend on to be meaningful.
 */
export function generateRooms(size: number, roomNames: readonly string[], rng: Rng): Room[] {
  const target = Math.min(roomCountFor(size), roomNames.length);
  const owner: number[][] = Array.from({ length: size }, () => Array<number>(size).fill(-1));

  // Seed each room on a distinct cell, preferring seeds that are spread
  // out — a rejection sample against already-claimed cells is enough at
  // these grid sizes and keeps seeds from clustering in one corner.
  const frontiers: Cell[][] = [];
  for (let roomIndex = 0; roomIndex < target; roomIndex++) {
    let seed: Cell | null = null;
    for (let tries = 0; tries < 100 && !seed; tries++) {
      const cell = { row: randInt(rng, 0, size - 1), col: randInt(rng, 0, size - 1) };
      if (owner[cell.row]![cell.col] === -1) seed = cell;
    }
    if (!seed) break;
    owner[seed.row]![seed.col] = roomIndex;
    frontiers.push([seed]);
  }

  // Grow all rooms in round-robin so they end up comparably sized rather
  // than one room swallowing the board.
  let remaining = size * size - frontiers.length;
  while (remaining > 0) {
    let grewThisPass = false;
    for (let roomIndex = 0; roomIndex < frontiers.length && remaining > 0; roomIndex++) {
      const frontier = frontiers[roomIndex]!;
      // Pull a random frontier cell and try to claim one of its unclaimed
      // neighbours; random choice is what makes the edges ragged rather
      // than growing as neat diamonds.
      let claimed: Cell | null = null;
      while (frontier.length > 0 && !claimed) {
        const pickIndex = randInt(rng, 0, frontier.length - 1);
        const from = frontier[pickIndex]!;
        const options = shuffle(rng, NEIGHBOUR_DELTAS).filter(([dr, dc]) => {
          const row = from.row + dr;
          const col = from.col + dc;
          return row >= 0 && row < size && col >= 0 && col < size && owner[row]![col] === -1;
        });
        if (options.length === 0) {
          // Exhausted: this cell can never contribute again.
          frontier.splice(pickIndex, 1);
          continue;
        }
        const [dr, dc] = options[0]!;
        claimed = { row: from.row + dr, col: from.col + dc };
      }
      if (!claimed) continue;
      owner[claimed.row]![claimed.col] = roomIndex;
      frontier.push(claimed);
      remaining--;
      grewThisPass = true;
    }
    if (!grewThisPass) break; // every frontier is boxed in; assign leftovers below
  }

  // Any cell still unclaimed (possible when every frontier boxed itself
  // in) joins whichever room already owns an orthogonal neighbour, so
  // rooms stay contiguous. Repeated until nothing more can be attached.
  let progressed = true;
  while (progressed) {
    progressed = false;
    for (let row = 0; row < size; row++) {
      for (let col = 0; col < size; col++) {
        if (owner[row]![col] !== -1) continue;
        for (const [dr, dc] of shuffle(rng, NEIGHBOUR_DELTAS)) {
          const r = row + dr;
          const c = col + dc;
          if (r < 0 || r >= size || c < 0 || c >= size) continue;
          const neighbourOwner = owner[r]![c]!;
          if (neighbourOwner === -1) continue;
          owner[row]![col] = neighbourOwner;
          progressed = true;
          break;
        }
      }
    }
  }

  const cellsByRoom: Cell[][] = Array.from({ length: frontiers.length }, () => []);
  for (let row = 0; row < size; row++) {
    for (let col = 0; col < size; col++) {
      const index = owner[row]![col]!;
      // A fully-unreachable cell can't happen once the grid is connected,
      // but default it into room 0 rather than dropping it — every cell
      // must belong to a room for roomNameAt() to be total.
      cellsByRoom[index === -1 ? 0 : index]!.push({ row, col });
    }
  }

  // Absorb undersized rooms so no room is a one-cell closet a room clue
  // would trivially give away. The host must be ORTHOGONALLY ADJACENT to
  // the absorbed blob, otherwise the merged room would be disconnected —
  // which would silently break every room-based clue, since those assume
  // "same room" means "same contiguous space".
  const isAdjacentTo = (blob: readonly Cell[], host: readonly Cell[]): boolean =>
    blob.some((a) =>
      host.some((b) => Math.abs(a.row - b.row) + Math.abs(a.col - b.col) === 1),
    );

  const kept = cellsByRoom.filter((cells) => cells.length > 0);
  const survivors: Cell[][] = [];
  const pending: Cell[][] = [];
  for (const cells of kept) {
    if (cells.length >= MIN_ROOM_CELLS) survivors.push(cells);
    else pending.push(cells);
  }
  // If every room came out undersized (only possible on a pathological
  // tiny grid), keep them all rather than merging everything into one.
  if (survivors.length === 0) {
    survivors.push(...pending.splice(0, pending.length));
  }
  for (const blob of pending) {
    const host = survivors.find((candidate) => isAdjacentTo(blob, candidate));
    // No adjacent survivor can only happen if the blob is disconnected
    // from every kept room, which the growth pass makes impossible — but
    // promote it to its own room rather than dropping cells if it ever does.
    if (host) host.push(...blob);
    else survivors.push(blob);
  }

  const names = shuffle(rng, roomNames);
  return survivors.map((cells, index) => ({
    name: names[index % names.length]!,
    cells,
  }));
}

export function roomAt(rooms: Room[], cell: Cell): Room | undefined {
  return rooms.find((room) => room.cells.some((c) => c.row === cell.row && c.col === cell.col));
}

/**
 * Marks the solution cells (guaranteed occupiable) plus a handful of decoy
 * cells as seatable, and scatters landmark props on the remaining blocked
 * cells — one per room where possible — matching the "CAN OCCUPY / BLOCKED"
 * convention this puzzle format uses.
 */
export function buildOccupyMaskAndLandmarks(
  size: number,
  rooms: Room[],
  solutionCells: readonly Cell[],
  landmarkNames: readonly string[],
  rng: Rng,
): { occupyMask: boolean[][]; landmarks: Landmark[] } {
  const occupyMask: boolean[][] = Array.from({ length: size }, () => Array(size).fill(false));
  for (const cell of solutionCells) {
    occupyMask[cell.row]![cell.col] = true;
  }

  const decoyTarget = size;
  for (let attempts = 0; attempts < decoyTarget * 10 && attempts < size * size; attempts++) {
    const row = randInt(rng, 0, size - 1);
    const col = randInt(rng, 0, size - 1);
    if (!occupyMask[row]![col]) {
      occupyMask[row]![col] = true;
      const decoysPlaced = occupyMask.flat().filter(Boolean).length - solutionCells.length;
      if (decoysPlaced >= decoyTarget) break;
    }
  }

  const shuffledNames = shuffle(rng, landmarkNames);
  const landmarks: Landmark[] = [];
  rooms.forEach((room, index) => {
    const blockedCells = room.cells.filter((cell) => !occupyMask[cell.row]![cell.col]);
    if (blockedCells.length === 0) return;
    const cell = blockedCells[randInt(rng, 0, blockedCells.length - 1)]!;
    landmarks.push({ cell, name: shuffledNames[index % shuffledNames.length]! });
  });

  return { occupyMask, landmarks };
}

export function toFloorPlan(
  size: number,
  rooms: Room[],
  occupyMask: boolean[][],
  landmarks: Landmark[],
): FloorPlan {
  return { size, rooms, occupyMask, landmarks };
}
