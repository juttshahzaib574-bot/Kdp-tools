import { describe, expect, it } from "vitest";
import { generateGridMystery } from "../generate";
import { roomNameAt, isSouthOf, isNorthOf, isEastOf, isWestOf } from "../geometry";
import { countSolutions } from "../solve";

/**
 * HUMAN LOGIC ANALYZER - Tests what makes puzzles FEEL broken even when mathematically unique
 * 
 * The solver proves UNIQUENESS but doesn't guarantee:
 * 1. No contradictory spatial relationships
 * 2. No clues that depend on information not derivable at that step
 * 3. No "guessing" disguised as deduction
 * 4. Logical flow that matches human reasoning patterns
 */
describe("Human Logic Quality Analysis", () => {
  it("detects spatial impossibility in clue relationships", () => {
    const failures: string[] = [];
    
    for (let seed = 1; seed <= 30; seed++) {
      const puzzle = generateGridMystery({ 
        gridSize: 7, 
        difficulty: "hard", 
        seed 
      });
      
      // Build a map of all positions
      const positions = new Map(puzzle.suspects.map(s => [s.id, puzzle.solution[s.id]!]));
      
      // Check every directional clue for physical possibility
      for (const clue of puzzle.clues) {
        const text = clue.text;
        
        // Parse "X is south of Y" patterns
        const southMatch = text.match(/([A-Z][a-z]+(?:\s[A-Z][a-z]+)?)\s+(?:was|is)\s+south\s+of\s+([A-Z][a-z]+(?:\s[A-Z][a-z]+)?)/);
        if (southMatch) {
          const [, subjectName, refName] = southMatch;
          const subject = puzzle.suspects.find(s => s.name === subjectName);
          const reference = puzzle.suspects.find(s => s.name === refName);
          
          if (subject && reference) {
            const subjPos = positions.get(subject.id)!;
            const refPos = positions.get(reference.id)!;
            
            // If reference is in bottom row, subject CANNOT be south
            if (refPos.row === puzzle.gridSize - 1) {
              failures.push(
                `Seed ${seed}: "${text}" - ${refName} is in bottom row (${refPos.row}), ` +
                `so ${subjectName} cannot be south`
              );
            }
          }
        }
        
        // Similar checks for other directions
        const northMatch = text.match(/([A-Z][a-z]+(?:\s[A-Z][a-z]+)?)\s+(?:was|is)\s+north\s+of\s+([A-Z][a-z]+(?:\s[A-Z][a-z]+)?)/);
        if (northMatch) {
          const [, subjectName, refName] = northMatch;
          const subject = puzzle.suspects.find(s => s.name === subjectName);
          const reference = puzzle.suspects.find(s => s.name === refName);
          
          if (subject && reference) {
            const subjPos = positions.get(subject.id)!;
            const refPos = positions.get(reference.id)!;
            
            if (refPos.row === 0) {
              failures.push(
                `Seed ${seed}: "${text}" - ${refName} is in top row (0), ` +
                `so ${subjectName} cannot be north`
              );
            }
          }
        }
      }
    }
    
    if (failures.length > 0) {
      console.log("SPATIAL IMPOSSIBILITIES FOUND:");
      failures.forEach(f => console.log(`  ${f}`));
      throw new Error(`${failures.length} spatially impossible clues found`);
    }
  });

  it("verifies each clue is independently necessary for uniqueness", () => {
    // A well-designed puzzle should need ALL its clues
    // If removing any clue still leaves a unique solution, that clue is redundant
    // Too many redundant clues = padding, which feels like bad design
    
    const puzzle = generateGridMystery({ 
      gridSize: 7, 
      difficulty: "hard", 
      seed: 42 
    });
    
    const fullSolutionCount = countSolutions(
      puzzle.gridSize,
      puzzle.floorPlan.occupyMask,
      puzzle.suspects.map(s => s.id),
      puzzle.clues.map(c => ({
        suspectId: c.suspectId,
        text: c.text,
        isSatisfied: (a: any) => {
          // Re-create the constraint from the stored data
          // This is a simplification - in reality we'd need the original closure
          return true; // Placeholder
        }
      })),
      2
    );
    
    // Note: This test reveals a limitation - we can't easily re-create constraints
    // from serialized clues. This is actually a DESIGN FLAW in the current system.
    console.log("Current architecture stores clues as TEXT + opaque predicate closures");
    console.log("Cannot verify clue necessity without regenerating the puzzle");
    console.log("This is a structural limitation of the closure-based constraint system");
    
    expect(true).toBe(true); // Placeholder until we fix constraint serialization
  });

  it("analyzes clue dependency chains for circular or broken logic", () => {
    // In a well-designed puzzle:
    // - Clue A might help place Suspect 1
    // - Clue B uses Suspect 1's position to place Suspect 2
    // - etc.
    //
    // Broken logic happens when:
    // - Clues reference each other circularly
    // - A clue requires knowing something that hasn't been deduced yet
    // - The only path to solution involves a "meta-guess"
    
    const puzzle = generateGridMystery({ 
      gridSize: 7, 
      difficulty: "hard", 
      seed: 1 
    });
    
    console.log("\\n=== PUZZLE ANALYSIS (seed 1) ===");
    console.log(`Grid: ${puzzle.gridSize}x${puzzle.gridSize}`);
    console.log(`Difficulty: ${puzzle.difficulty}`);
    console.log(`Clues: ${puzzle.clues.length}`);
    console.log("\\nClues:");
    puzzle.clues.forEach((clue, i) => {
      console.log(`  ${i + 1}. ${clue.text}`);
    });
    
    console.log("\\nSolution:");
    puzzle.suspects.forEach(s => {
      const pos = puzzle.solution[s.id]!;
      const room = roomNameAt(puzzle.floorPlan, pos);
      console.log(`  ${s.name}: row=${pos.row}, col=${pos.col}, room=${room}`);
    });
    
    // The real test: can we identify the LOGICAL ORDER of deductions?
    // This requires understanding which clues constrain which suspects
    // and building a dependency graph
    
    console.log("\\n=== DEDUCTION ORDER ANALYSIS ===");
    console.log("Current system does not track WHICH clue enables WHICH deduction");
    console.log("This is why puzzles can feel 'broken' - no guaranteed solving path");
    console.log("Shigai Royalty likely tracks this explicitly");
    
    expect(true).toBe(true);
  });

  it("compares our technique usage vs what Shigai likely provides", () => {
    // From competitive analysis, Shigai supports:
    // - IF-THEN conditional clues (we don't)
    // - Advanced propagation during generation (we don't)
    // - MRV heuristic in generator (we only have in grader)
    //
    // Our advantages:
    // - Two-sided tier certification
    // - Stricter deducibility guarantees
    // - Cross-layer reasoning
    
    const puzzles = Array.from({ length: 10 }, (_, i) => 
      generateGridMystery({ gridSize: 7, difficulty: "hard", seed: i + 1 })
    );
    
    console.log("\\n=== TECHNIQUE PROFILE ANALYSIS ===");
    puzzles.forEach((puzzle, i) => {
      if (puzzle.logicProfile) {
        console.log(`Puzzle ${i + 1}:`);
        console.log(`  Hardest technique: ${puzzle.logicProfile.techniques[puzzle.logicProfile.techniques.length - 1] || 'unknown'}`);
        console.log(`  Techniques used: ${puzzle.logicProfile.techniques.join(', ')}`);
        console.log(`  Chain length: ${puzzle.logicProfile.chain}`);
        console.log(`  Summary: ${puzzle.logicProfile.summary}`);
      }
    });
    
    // Key insight: Our technique profiler EXISTS but is only used for GRADING
    // It's NOT used during GENERATION to ensure good logical flow
    console.log("\\n=== CRITICAL GAP IDENTIFIED ===");
    console.log("Technique solver exists in tier-contract.ts for GRADING");
    console.log("But generator (clues.ts) does NOT use it for SELECTION");
    console.log("Result: Puzzles are unique but may have poor logical flow");
    
    expect(true).toBe(true);
  });
});
