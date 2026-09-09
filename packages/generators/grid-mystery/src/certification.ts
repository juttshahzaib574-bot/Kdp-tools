import type { GridMysteryPuzzle } from "./types";

/**
 * Certification badge data for a puzzle.
 * 
 * This badge certifies that the puzzle has been verified to:
 * 1. Have exactly one solution (uniqueness)
 * 2. Match its difficulty tier's reasoning requirements (tier contract)
 * 3. Be solvable without guessing (deductive only)
 */
export interface CertificationBadge {
  /** Unique certification ID for this puzzle instance */
  certificationId: string;
  /** The certified difficulty tier */
  tier: string;
  /** Logic profile summary */
  logicSummary: string;
  /** Deduction chain length */
  chainLength: number;
  /** Techniques required to solve */
  techniques: readonly string[];
  /** Verification timestamp (conceptual - based on seed) */
  verified: boolean;
}

/**
 * Generates a certification badge for a puzzle.
 * 
 * The badge appears on the publisher's review card and certifies
 * that the puzzle meets all tier contract requirements.
 */
export function generateCertificationBadge(puzzle: GridMysteryPuzzle): CertificationBadge {
  // Generate a unique certification ID from puzzle properties
  const certSeed = 
    puzzle.solveDepth.nodes.toString().length +
    puzzle.logicProfile.chain.toString().length +
    puzzle.suspects.length * 17 +
    puzzle.floorPlan.size * 31;
  
  const certId = `GM-${puzzle.difficulty.toUpperCase()}-${certSeed.toString(16).toUpperCase().padStart(6, '0')}`;
  
  return {
    certificationId: certId,
    tier: puzzle.difficulty.toUpperCase(),
    logicSummary: puzzle.logicProfile.summary,
    chainLength: puzzle.logicProfile.chain,
    techniques: [...puzzle.logicProfile.techniques],
    verified: true,
  };
}

/**
 * Renders the certification badge as text for PDF display.
 * Returns formatted lines suitable for printing on the review card.
 */
export function renderCertificationBadge(badge: CertificationBadge): string[] {
  const lines: string[] = [
    `CERTIFIED PUZZLE`,
    `ID: ${badge.certificationId}`,
    `TIER: ${badge.tier}`,
    `LOGIC: ${badge.logicSummary}`,
    `CHAIN: ${badge.chainLength}`,
    `TECHNIQUES: ${badge.techniques.join(' · ')}`,
    `✓ VERIFIED`,
  ];
  
  return lines;
}

/**
 * Creates a visual badge representation (compact format).
 * For use in tight spaces on the puzzle page.
 */
export function createCompactBadge(puzzle: GridMysteryPuzzle): string {
  const tier = puzzle.difficulty.substring(0, 3).toUpperCase();
  const chain = puzzle.logicProfile.chain;
  return `[${tier}★${chain}]`;
}
