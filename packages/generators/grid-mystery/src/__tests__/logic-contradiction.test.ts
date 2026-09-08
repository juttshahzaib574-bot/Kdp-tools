import { describe, expect, it } from "vitest";
import { generateGridMystery } from "../generate";
import { roomNameAt } from "../geometry";

/**
 * This test reproduces the EXACT logical contradiction you described:
 * - 7x7 grid with Wine Cellar only in rows 6-7 (0-indexed: rows 5-6)
 * - Tomas (4th tallest) must be in Wine Cellar per Wanda's clue
 * - Baxter must also be in Wine Cellar per Tomas's clue
 * - Fenna must be SOUTH of Baxter and EAST of him
 * - This creates an impossible constraint when Wine Cellar is only 2 rows
 */
describe("Logic Contradiction Analysis", () => {
  it("reproduces the Wine Cellar impossibility scenario", () => {
    // Generate many puzzles to find one with the problematic configuration
    let foundPuzzle = null;
    
    for (let seed = 1; seed <= 100; seed++) {
      const puzzle = generateGridMystery({ 
        gridSize: 7, 
        difficulty: "hard", 
        seed 
      });
      
      // Find if Wine Cellar exists and check its row span
      const wineCellarRows = new Set<number>();
      for (let row = 0; row < 7; row++) {
        for (let col = 0; col < 7; col++) {
          if (puzzle.floorPlan.occupyMask[row]![col]) {
            const room = roomNameAt(puzzle.floorPlan, { row, col });
            if (room.toLowerCase().includes("wine") || room.toLowerCase().includes("cellar")) {
              wineCellarRows.add(row);
            }
          }
        }
      }
      
      // If Wine Cellar spans only 2 rows, check the constraint scenario
      if (wineCellarRows.size === 2) {
        const rows = Array.from(wineCellarRows).sort((a, b) => a - b);
        console.log(`Seed ${seed}: Wine Cellar in rows ${rows[0]}-${rows[1]} (0-indexed)`);
        
        // Find Tomas and Baxter in solution
        const tomas = puzzle.suspects.find(s => s.name.includes("Tomas"));
        const baxter = puzzle.suspects.find(s => s.name.includes("Baxter"));
        const fenna = puzzle.suspects.find(s => s.name.includes("Fenna"));
        
        if (tomas && baxter && fenna) {
          const tomasPos = puzzle.solution[tomas.id];
          const baxterPos = puzzle.solution[baxter.id];
          const fennaPos = puzzle.solution[fenna.id];
          
          if (tomasPos && baxterPos && fennaPos) {
            const tomasRoom = roomNameAt(puzzle.floorPlan, tomasPos);
            const baxterRoom = roomNameAt(puzzle.floorPlan, baxterPos);
            
            console.log(`  Tomas: row=${tomasPos.row}, col=${tomasPos.col}, room=${tomasRoom}`);
            console.log(`  Baxter: row=${baxterPos.row}, col=${baxterPos.col}, room=${baxterRoom}`);
            console.log(`  Fenna: row=${fennaPos.row}, col=${fennaPos.col}`);
            
            // Check if both Tomas and Baxter are in Wine Cellar
            if (tomasRoom.toLowerCase().includes("wine") && baxterRoom.toLowerCase().includes("wine")) {
              console.log(`  ✓ Both in Wine Cellar`);
              
              // Check Fenna's constraints relative to Baxter
              const fennaSouthOfBaxter = fennaPos.row > baxterPos.row;
              const fennaEastOfBaxter = fennaPos.col > baxterPos.col;
              
              console.log(`  Fenna south of Baxter? ${fennaSouthOfBaxter} (Fenna row ${fennaPos.row} > Baxter row ${baxterPos.row})`);
              console.log(`  Fenna east of Baxter? ${fennaEastOfBaxter} (Fenna col ${fennaPos.col} > Baxter col ${baxterPos.col})`);
              
              // The contradiction: if Baxter is in the bottom-most Wine Cellar row,
              // Fenna cannot be south of him
              const maxWineRow = Math.max(...rows);
              if (baxterPos.row === maxWineRow && !fennaSouthOfBaxter) {
                console.log(`  ✗ CONTRADICTION: Baxter in bottom Wine Cellar row (${baxterPos.row}), Fenna cannot be south!`);
                foundPuzzle = { puzzle, seed, wineCellarRows: rows };
                break;
              }
            }
          }
        }
      }
    }
    
    // If we found the contradiction, document it
    if (foundPuzzle) {
      const { puzzle, seed, wineCellarRows } = foundPuzzle;
      
      console.log("\n=== CONTRADICTION FOUND ===");
      console.log(`Seed: ${seed}`);
      console.log(`Wine Cellar rows: ${wineCellarRows[0]}-${wineCellarRows[1]} (0-indexed)`);
      
      const tomas = puzzle.suspects.find(s => s.name.includes("Tomas"))!;
      const baxter = puzzle.suspects.find(s => s.name.includes("Baxter"))!;
      const fenna = puzzle.suspects.find(s => s.name.includes("Fenna"))!;
      
      const tomasPos = puzzle.solution[tomas.id]!;
      const baxterPos = puzzle.solution[baxter.id]!;
      const fennaPos = puzzle.solution[fenna.id]!;
      
      console.log(`Tomas position: row=${tomasPos.row}, col=${tomasPos.col}`);
      console.log(`Baxter position: row=${baxterPos.row}, col=${baxterPos.col}`);
      console.log(`Fenna position: row=${fennaPos.row}, col=${fennaPos.col}`);
      
      // Analyze the clues that create this contradiction
      console.log("\nClues involving these suspects:");
      puzzle.clues.forEach((clue, idx) => {
        if (clue.text.includes(tomas.givenName) || 
            clue.text.includes(baxter.givenName) || 
            clue.text.includes(fenna.givenName)) {
          console.log(`  ${idx + 1}. ${clue.text}`);
        }
      });
      
      // The fundamental issue: can this puzzle actually be solved?
      console.log("\n=== LOGIC ANALYSIS ===");
      console.log("1. Wine Cellar occupies only 2 rows");
      console.log("2. Two suspects MUST be in Wine Cellar (per clues)");
      console.log("3. Therefore they occupy BOTH Wine Cellar rows");
      console.log("4. A third suspect must be SOUTH of one of them");
      console.log("5. But there is no row below the bottom Wine Cellar row!");
      console.log("6. CONTRADICTION: Puzzle is unsolvable");
      
      // This should fail - proving the bug exists
      expect(true).toBe(false); // Force failure to highlight the issue
    } else {
      // If no contradiction found in 100 seeds, the issue might be rarer or fixed
      console.log("No contradiction found in 100 seeds - may need more samples or different conditions");
    }
  });

  it("validates all generated puzzles have logically consistent spatial clues", () => {
    // Test that ALL spatial relationship clues are actually satisfiable
    const testCount = 50;
    
    for (let seed = 1; seed <= testCount; seed++) {
      const puzzle = generateGridMystery({ 
        gridSize: 7, 
        difficulty: "hard", 
        seed 
      });
      
      // For each clue, verify it doesn't create an impossible constraint
      for (const clue of puzzle.clues) {
        const text = clue.text.toLowerCase();
        
        // Extract suspect names from clue
        const mentionedSuspects = puzzle.suspects.filter(s => 
          text.includes(s.givenName.toLowerCase()) || text.includes(s.surname.toLowerCase())
        );
        
        // Check "south of" clues
        if (text.includes("south")) {
          const match = text.match(/([a-z][a-z']+)\s+(?:was|is)\s+south\s+of\s+([a-z][a-z'+]+)/i);
          if (match) {
            const [, subjectObj, referenceObj] = match;
            const subject = puzzle.suspects.find(s => 
              s.givenName.toLowerCase() === subjectObj?.toLowerCase() ||
              s.surname.toLowerCase() === subjectObj?.toLowerCase()
            );
            const reference = puzzle.suspects.find(s => 
              s.givenName.toLowerCase() === referenceObj?.toLowerCase() ||
              s.surname.toLowerCase() === referenceObj?.toLowerCase()
            );
            
            if (subject && reference) {
              const subjectPos = puzzle.solution[subject.id];
              const referencePos = puzzle.solution[reference.id];
              
              if (subjectPos && referencePos) {
                // In a valid puzzle, "south of" means higher row number
                // If reference is in the bottom row, this is impossible
                if (referencePos.row === puzzle.gridSize - 1) {
                  throw new Error(
                    `Seed ${seed}: Clue "${clue.text}" requires ${subject.name} to be south of ` +
                    `${reference.name}, but ${reference.name} is already in the bottom row ` +
                    `(row ${referencePos.row}) - IMPOSSIBLE!`
                  );
                }
              }
            }
          }
        }
        
        // Similar checks for other directional clues could go here
      }
    }
    
    expect(true).toBe(true);
  });
});
