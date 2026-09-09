import type { GridMysteryPuzzle } from "./types";
import { roomAt } from "./floor-plan";
import { renderTemplate, resolveNames } from "./text-template";

/**
 * A single step in the puzzle walkthrough.
 * Each step explains one deduction the solver can make.
 */
export interface WalkthroughStep {
  /** Short title for the step, e.g., "Step 1: Place the Victim" */
  title: string;
  /** The actual explanation of the deduction */
  explanation: string;
  /** Which suspect(s) this step concerns */
  suspectIds?: string[];
  /** Optional: which room or cell this step places someone */
  placement?: {
    suspectId: string;
    row: number;
    col: number;
    roomName: string;
  };
}

/**
 * Complete walkthrough for solving the puzzle.
 */
export interface PuzzleWalkthrough {
  /** Introduction explaining the overall approach */
  introduction: string;
  /** Ordered list of deduction steps */
  steps: WalkthroughStep[];
  /** Final conclusion revealing the culprit */
  conclusion: string;
}

/**
 * Generates a complete step-by-step walkthrough for solving the puzzle.
 * 
 * The walkthrough follows the logic profile's technique hierarchy:
 * - Direct clues first (T1)
 * - Elimination arguments (T2)
 * - Relational deductions (T3)
 * - Cross-layer reasoning (T4)
 * 
 * This is printed on the publisher's review card so they can verify
 * the puzzle flows as intended.
 */
export function generateWalkthrough(puzzle: GridMysteryPuzzle): PuzzleWalkthrough {
  const names = resolveNames(puzzle.suspects);
  
  const victim = puzzle.suspects.find((s) => s.id === puzzle.victimSuspectId)!;
  const culprit = puzzle.suspects.find((s) => s.id === puzzle.culpritSuspectId)!;
  const victimCell = puzzle.solution[puzzle.victimSuspectId]!;
  const victimRoom = roomAt(puzzle.floorPlan.rooms, victimCell)!;
  
  // Build introduction
  const introduction = `To solve this ${puzzle.difficulty} case, follow these deductions in order. Each step uses only the clues provided — no guessing required.`;
  
  const steps: WalkthroughStep[] = [];
  let stepNumber = 1;
  
  // Track what we've placed
  const placed = new Set<string>();
  
  // STEP 1: Start with the most direct clue (usually about the victim or a specific placement)
  const directClue = puzzle.clues.find((c) => {
    const text = c.text.toLowerCase();
    return text.includes("found") || text.includes("discovered") || text.includes("body");
  });
  
  if (directClue) {
    steps.push({
      title: `Step ${stepNumber}: Locate ${victim.name}`,
      explanation: `${renderTemplate(directClue.text, names)} This tells us ${victim.name} was seated in the ${victimRoom.name}. Mark this cell.`,
      suspectIds: [victim.id],
      placement: {
        suspectId: victim.id,
        row: victimCell.row,
        col: victimCell.col,
        roomName: victimRoom.name,
      },
    });
    placed.add(victim.id);
    stepNumber++;
  }
  
  // STEP 2: Use evidence clues to pin objects to suspects
  const evidenceSteps = puzzle.evidenceClues.slice(0, 2).map((clue, idx) => {
    const fact = clue.fact;
    let explanation = renderTemplate(clue.text, names);
    let suspectId: string | undefined;
    
    switch (fact.kind) {
      case "personHas":
        suspectId = fact.suspectId;
        break;
      case "objectInRoom":
        // Find who has this object
        const holder = puzzle.suspects.find((s) => puzzle.objects[s.id] === fact.object);
        suspectId = holder?.id;
        break;
      case "objectInRow":
        // Find who is in this row with this object
        const rowHolder = puzzle.suspects.find(
          (s) => puzzle.objects[s.id] === fact.object && puzzle.solution[s.id]?.row === fact.row
        );
        suspectId = rowHolder?.id;
        break;
    }
    
    return {
      title: `Step ${stepNumber + idx}: ${fact.kind === "personHas" ? "Identify an Object" : "Cross-Reference Evidence"}`,
      explanation: `${explanation} ${suspectId ? `This pins the ${fact.object} to ${names.get(suspectId)}.` : ""}`,
      suspectIds: suspectId ? [suspectId] : undefined,
    } as WalkthroughStep;
  });
  
  steps.push(...evidenceSteps);
  stepNumber += evidenceSteps.length;
  
  // Mark any suspects placed by evidence
  evidenceSteps.forEach((step) => {
    if (step.suspectIds) {
      step.suspectIds.forEach((id) => placed.add(id));
    }
  });
  
  // STEP 3: Use elimination/relational clues for remaining suspects
  const remainingSuspects = puzzle.suspects.filter((s) => !placed.has(s.id));
  
  // Group by clues
  for (const suspect of remainingSuspects.slice(0, 3)) {
    const suspectClues = puzzle.clues.filter((c) => c.suspectId === suspect.id);
    if (suspectClues.length > 0) {
      const clueText = renderTemplate(suspectClues[0]!.text, names);
      const solutionCell = puzzle.solution[suspect.id]!;
      const solutionRoom = roomAt(puzzle.floorPlan.rooms, solutionCell)!;
      
      steps.push({
        title: `Step ${stepNumber}: Place ${suspect.name}`,
        explanation: `${clueText} By elimination, ${suspect.name} must be in the ${solutionRoom.name}.`,
        suspectIds: [suspect.id],
        placement: {
          suspectId: suspect.id,
          row: solutionCell.row,
          col: solutionCell.col,
          roomName: solutionRoom.name,
        },
      });
      placed.add(suspect.id);
      stepNumber++;
    }
  }
  
  // FINAL STEP: Identify the culprit
  steps.push({
    title: `Step ${stepNumber}: Identify the Murderer`,
    explanation: `The killer is whoever shared the ${victimRoom.name} with ${victim.name}. Since ${culprit.name} was the only other person in that room, ${culprit.name} is the murderer. The ${puzzle.murderWeapon} (which ${culprit.name} carried) confirms this.`,
    suspectIds: [culprit.id, victim.id],
  });
  
  // Build conclusion
  const conclusion = `Solution: ${culprit.name} murdered ${victim.name} in the ${victimRoom.name} using the ${puzzle.murderWeapon}. All clues are satisfied by this arrangement.`;
  
  return {
    introduction,
    steps,
    conclusion,
  };
}

/**
 * Formats a walkthrough for printing on the review card.
 * Returns plain text suitable for PDF rendering.
 */
export function formatWalkthroughForPrint(walkthrough: PuzzleWalkthrough, maxWidth: number): string[] {
  const lines: string[] = [];
  
  // Introduction
  lines.push(walkthrough.introduction);
  lines.push("");
  
  // Steps
  for (const step of walkthrough.steps) {
    lines.push(step.title);
    lines.push(`  ${step.explanation}`);
    lines.push("");
  }
  
  // Conclusion
  lines.push(walkthrough.conclusion);
  
  return lines;
}
