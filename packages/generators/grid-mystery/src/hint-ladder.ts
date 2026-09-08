import type { PuzzleSolution, Clue } from './types';
import type { DeductionStep } from './walkthrough';

export interface PuzzleHintLadder {
  puzzleId: string;
  hints: {
    general: string;      // Broad strategy hint
    specific: string;     // Points to specific suspect/room
    spoiler: string;      // Nearly gives away the deduction
  }[];
}

export interface BookHintLadder {
  bookId: string;
  puzzles: PuzzleHintLadder[];
}

/**
 * Generates a tiered hint ladder for a puzzle based on its solution path.
 * Hints escalate from general strategy → specific location → near-spoiler.
 */
export function generateHintLadder(
  puzzleId: string,
  clues: Clue[],
  walkthrough: DeductionStep[]
): PuzzleHintLadder {
  const hints: PuzzleHintLadder['hints'] = [];

  // Generate hints for each deduction step in the walkthrough
  for (let i = 0; i < Math.min(walkthrough.length, 5); i++) {
    const step = walkthrough[i];
    
    // Skip steps that aren't direct deductions (e.g., initial setup)
    if (!step.conclusion || !step.clueUsed) {
      continue;
    }

    const general = generateGeneralHint(step, i);
    const specific = generateSpecificHint(step);
    const spoiler = generateSpoilerHint(step);

    hints.push({ general, specific, spoiler });
  }

  // Ensure we have at least 3 hints for solvability
  while (hints.length < 3) {
    hints.push({
      general: 'Review all clues carefully and look for connections between suspects.',
      specific: 'Focus on the suspects mentioned most frequently in the clues.',
      spoiler: 'Try placing the suspect with the most constraints first.',
    });
  }

  return {
    puzzleId,
    hints,
  };
}

function generateGeneralHint(step: DeductionStep, index: number): string {
  const techniqueHints: Record<string, string> = {
    'direct': 'Start with clues that directly state a suspect\'s location.',
    'elimination': 'Use process of elimination to narrow down possibilities.',
    'relational': 'Look for clues that relate two suspects to each other.',
    'conditional': 'Consider the implications of "if-then" style clues.',
    'chain': 'Follow the logical chain from one deduction to the next.',
  };

  const techniqueKey = step.technique?.toLowerCase() || 'elimination';
  const baseHint = techniqueHints[techniqueKey] || 'Analyze the relationships between suspects and rooms.';
  
  if (index === 0) {
    return 'Begin by identifying the most constrained suspect or room.';
  }
  
  return baseHint;
}

function generateSpecificHint(step: DeductionStep): string {
  const conclusion = step.conclusion;
  if (!conclusion) {
    return 'Focus on the suspect with the fewest remaining options.';
  }

  const { suspect, room, row, column } = conclusion;
  
  if (room) {
    return `Consider where ${suspect} could be placed based on the room constraints.`;
  }
  
  if (row !== undefined || column !== undefined) {
    const position = row !== undefined ? `row ${row + 1}` : `column ${column! + 1}`;
    return `Think about which suspect belongs in ${position}.`;
  }

  return `Narrow down the possible locations for ${suspect}.`;
}

function generateSpoilerHint(step: DeductionStep): string {
  const conclusion = step.conclusion;
  if (!conclusion) {
    return 'The next deduction involves eliminating all but one possibility.';
  }

  const { suspect, room, row, column } = conclusion;
  
  if (room && row !== undefined && column !== undefined) {
    return `${suspect} is located in the ${room} at row ${row + 1}, column ${column + 1}.`;
  }
  
  if (room) {
    return `${suspect} must be in the ${room}. Check which cell is still available.`;
  }
  
  if (row !== undefined) {
    return `Look for the only valid cell in row ${row + 1} for ${suspect}.`;
  }
  
  if (column !== undefined) {
    return `Look for the only valid cell in column ${column + 1} for ${suspect}.`;
  }

  return `Place ${suspect} in the only remaining valid position.`;
}

/**
 * Generates hint ladders for all puzzles in a book.
 */
export function generateBookHintLadder(
  bookId: string,
  puzzles: Array<{
    puzzleId: string;
    clues: Clue[];
    walkthrough: DeductionStep[];
  }>
): BookHintLadder {
  const puzzleHints = puzzles.map(p => 
    generateHintLadder(p.puzzleId, p.clues, p.walkthrough)
  );

  return {
    bookId,
    puzzles: puzzleHints,
  };
}
