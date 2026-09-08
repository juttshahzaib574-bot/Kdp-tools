import { describe, expect, it } from "vitest";
import { countSolutions, type ClueConstraint } from "../solve";
import type { Assignment } from "../types";

const suspectIds = ["a", "b", "c"];
const openMask = [
  [true, true, true],
  [true, true, true],
  [true, true, true],
];

function fixedCell(suspectId: string, row: number, col: number): ClueConstraint[] {
  return [
    {
      suspectId,
      text: `${suspectId} row`,
      isSatisfied: (a: Partial<Assignment>) => !a[suspectId] || a[suspectId]!.row === row,
    },
    {
      suspectId,
      text: `${suspectId} col`,
      isSatisfied: (a: Partial<Assignment>) => !a[suspectId] || a[suspectId]!.col === col,
    },
  ];
}

describe("countSolutions", () => {
  it("finds exactly one solution when clues fully pin two of three suspects", () => {
    const constraints = [...fixedCell("a", 0, 0), ...fixedCell("b", 1, 1)];
    expect(countSolutions(3, openMask, suspectIds, constraints, 2)).toBe(1);
  });

  it("finds zero solutions when two suspects are forced into the same row", () => {
    const constraints = [
      ...fixedCell("a", 0, 0),
      ...fixedCell("b", 1, 1),
      {
        suspectId: "c",
        text: "c row",
        isSatisfied: (a: Partial<Assignment>) => !a.c || a.c.row === 0,
      },
    ];
    expect(countSolutions(3, openMask, suspectIds, constraints, 2)).toBe(0);
  });

  it("finds multiple (capped) solutions when clues under-constrain the puzzle", () => {
    const constraints: ClueConstraint[] = [
      {
        suspectId: "a",
        text: "a col",
        isSatisfied: (assignment: Partial<Assignment>) => !assignment.a || assignment.a.col === 0,
      },
    ];
    expect(countSolutions(3, openMask, suspectIds, constraints, 2)).toBe(2);
  });

  it("respects occupyMask — a blocked cell can never be used", () => {
    const mask = [
      [false, true, true],
      [true, true, true],
      [true, true, true],
    ];
    const constraints = fixedCell("a", 0, 0); // (0,0) is blocked
    expect(countSolutions(3, mask, suspectIds, constraints, 2)).toBe(0);
  });
});
