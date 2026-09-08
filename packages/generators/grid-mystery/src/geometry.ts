import type { Cell, FloorPlan } from "./types";
import { roomAt } from "./floor-plan";

export function isWallAdjacent(cell: Cell, size: number): boolean {
  return cell.row === 0 || cell.row === size - 1 || cell.col === 0 || cell.col === size - 1;
}

export function isOrthogonallyAdjacent(a: Cell, b: Cell): boolean {
  return (
    (a.row === b.row && Math.abs(a.col - b.col) === 1) ||
    (a.col === b.col && Math.abs(a.row - b.row) === 1)
  );
}

export function isCattyCorner(a: Cell, b: Cell): boolean {
  return Math.abs(a.row - b.row) === 1 && Math.abs(a.col - b.col) === 1;
}

export function isSouthOf(a: Cell, b: Cell): boolean {
  return a.row > b.row;
}
export function isNorthOf(a: Cell, b: Cell): boolean {
  return a.row < b.row;
}
export function isEastOf(a: Cell, b: Cell): boolean {
  return a.col > b.col;
}
export function isWestOf(a: Cell, b: Cell): boolean {
  return a.col < b.col;
}

export function roomNameAt(floorPlan: FloorPlan, cell: Cell): string {
  const room = roomAt(floorPlan.rooms, cell);
  if (!room) throw new Error(`Cell (${cell.row},${cell.col}) does not belong to any room`);
  return room.name;
}

export function landmarkAdjacentTo(floorPlan: FloorPlan, cell: Cell): string | undefined {
  return floorPlan.landmarks.find((landmark) => isOrthogonallyAdjacent(cell, landmark.cell))
    ?.name;
}

const ORDINAL_SUFFIXES: Record<number, string> = { 1: "st", 2: "nd", 3: "rd" };

export function ordinal(n: number): string {
  const suffix = n % 100 >= 11 && n % 100 <= 13 ? "th" : (ORDINAL_SUFFIXES[n % 10] ?? "th");
  return `${n}${suffix}`;
}
