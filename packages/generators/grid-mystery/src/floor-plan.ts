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
 * SHIGAI GRAMMAR ADOPTION v1: OPEN-MAJORITY floor plan.
 *
 * Every floor cell is open by default (occupiable). Only prop/landmark
 * cells are blocked. Solution cells are guaranteed occupiable (they must
 * have suspects seated there). No decoy cells — the old "seat disc"
 * approach is deleted entirely.
 *
 * Landmarks (props) are placed on blocked cells, one per room where
 * possible, matching the "CAN OCCUPY ✅ / BLOCKED ❌" convention.
 */
export function buildOccupyMaskAndLandmarks(
  size: number,
  rooms: Room[],
  solutionCells: readonly Cell[],
  landmarkNames: readonly string[],
  rng: Rng,
): { occupyMask: boolean[][]; landmarks: Landmark[] } {
  // OPEN-MAJORITY: Start with ALL cells occupiable (true)
  const occupyMask: boolean[][] = Array.from({ length: size }, () => Array(size).fill(true));

  // Place landmarks (props) first — these will block cells
  const shuffledNames = shuffle(rng, landmarkNames);
  const landmarks: Landmark[] = [];
  
  // One landmark per room where possible, placed on a random cell in that room
  rooms.forEach((room, index) => {
    if (room.cells.length === 0) return;
    const cell = room.cells[randInt(rng, 0, room.cells.length - 1)]!;
    // Mark this cell as blocked (not occupiable)
    occupyMask[cell.row]![cell.col] = false;
    // Assign size class based on room size: L for large rooms (8+ cells), M for medium (5-7), S for small (<5)
    const sizeClass: "L" | "M" | "S" = room.cells.length >= 8 ? "L" : room.cells.length >= 5 ? "M" : "S";
    landmarks.push({ cell, name: shuffledNames[index % shuffledNames.length]!, sizeClass });
  });

  // Ensure all solution cells are occupiable (they must have seats)
  // If a solution cell landed on a prop, relocate the prop
  for (const cell of solutionCells) {
    if (!occupyMask[cell.row]![cell.col]) {
      // This solution cell is blocked by a prop — find a new spot for that prop
      const landmarkIndex = landmarks.findIndex((l) => l.cell.row === cell.row && l.cell.col === cell.col);
      if (landmarkIndex !== -1) {
        const landmark = landmarks[landmarkIndex]!;
        // Find an alternative cell in the same room that's not a solution cell
        const room = roomAt(rooms, cell);
        if (room) {
          const alternativeCells = room.cells.filter((c) => 
            occupyMask[c.row]![c.col] && 
            !solutionCells.some((sc) => sc.row === c.row && sc.col === c.col)
          );
          if (alternativeCells.length > 0) {
            const newCell = alternativeCells[randInt(rng, 0, alternativeCells.length - 1)]!;
            occupyMask[newCell.row]![newCell.col] = false;
            landmarks[landmarkIndex] = { cell: newCell, name: landmark.name };
          }
        }
      }
      // Ensure the solution cell is marked occupiable
      occupyMask[cell.row]![cell.col] = true;
    }
  }

  return { occupyMask, landmarks };
}

/**
 * Identifies door positions between connected rooms.
 * 
 * A door is a 1-cell gap in the wall between two orthogonally adjacent rooms.
 * Doors are placed on shared boundaries where rooms meet.
 */
export function identifyDoors(rooms: Room[], size: number, rng: Rng): Cell[] {
  const doors: Cell[] = [];
  const roomIndexAt = (row: number, col: number): number => {
    return rooms.findIndex((r) => r.cells.some((c) => c.row === row && c.col === col));
  };

  // Track which room pairs already have a door
  const doorPairs = new Set<string>();

  // For each pair of adjacent rooms, place one door on their shared boundary
  for (let i = 0; i < rooms.length; i++) {
    for (let j = i + 1; j < rooms.length; j++) {
      const roomA = rooms[i]!;
      const roomB = rooms[j]!;
      
      // Find all shared boundary cells
      const sharedBoundaries: Cell[] = [];
      for (const cellA of roomA.cells) {
        for (const [dr, dc] of NEIGHBOUR_DELTAS) {
          const neighborRow = cellA.row + dr;
          const neighborCol = cellA.col + dc;
          if (neighborRow >= 0 && neighborRow < size && neighborCol >= 0 && neighborCol < size) {
            if (roomIndexAt(neighborRow, neighborCol) === j) {
              // This is a boundary cell between room A and room B
              // Place door at the midpoint (on the edge)
              sharedBoundaries.push({ row: cellA.row, col: cellA.col });
            }
          }
        }
      }

      // If rooms share a boundary and don't already have a door, place one
      if (sharedBoundaries.length > 0) {
        const pairKey = `${i}-${j}`;
        if (!doorPairs.has(pairKey)) {
          const doorCell = sharedBoundaries[randInt(rng, 0, sharedBoundaries.length - 1)]!;
          doors.push(doorCell);
          doorPairs.add(pairKey);
        }
      }
    }
  }

  return doors;
}

export function toFloorPlan(
  size: number,
  rooms: Room[],
  occupyMask: boolean[][],
  landmarks: Landmark[],
  doors?: Cell[],
): FloorPlan {
  return { size, rooms, occupyMask, landmarks, doors };
}
