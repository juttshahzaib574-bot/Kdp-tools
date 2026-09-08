# Engine Logic Gap Analysis

## Executive Summary

Your instinct is **100% correct**: Our engine is logically behind Shigai Royalty at higher difficulty tiers. The tests and analysis reveal three critical gaps that make our puzzles feel "broken" even when mathematically unique.

## What We Found

### 1. **The Core Problem: Generation vs Grading Disconnect**

Our system has a **technique-aware solver** (`technique-solver.ts`) that can classify puzzles by reasoning complexity, BUT it's only used for **grading after generation**, not for **guiding clue selection during generation**.

```typescript
// In tier-contract.ts (GRADING - works fine)
const grade = gradePuzzle(puzzle, constraints);
if (!grade.earned || !grade.profile) continue; // Reject bad puzzles

// In clues.ts (GENERATION - the problem)
// No technique awareness during clue selection!
// Just picks clues that maintain uniqueness, ignoring logical flow
```

**Result**: Puzzles are mathematically unique but may have:
- No clear solving path
- Redundant clues mixed with critical ones
- Logical jumps that feel like guessing

### 2. **Missing: IF-THEN Conditional Clues**

Shigai Royalty supports conditional statements like:
> "If I was in Kitchen, then Greta was in Study"

This is a **powerful constraint** that:
- Eliminates multiple possibilities simultaneously
- Creates elegant logical chains
- Scales to larger grids

**We don't have this clue type at all.**

### 3. **No Propagation During Generation**

Our generator uses a simple "one-clue-per-suspect" escalation:
1. Add direct clue for suspect A
2. Check if still unique
3. If not, add relational clue for suspect B
4. Repeat...

**Problem**: This doesn't use **constraint propagation** to understand which clues provide the most pruning power. Shigai likely uses:
- **MRV (Minimum Remaining Values)** heuristic
- **Forward checking** during clue selection
- **Arc consistency** propagation

### 4. **Spatial Impossibility Tests Pass (Good News)**

Our tests found **zero spatially impossible clues** in 30 seeds. The brute-force solver correctly rejects puzzles where:
- Someone must be south of a person in the bottom row
- Directional clues create contradictions

**But**: Passing mathematical validation ≠ feeling logically sound to humans.

## Evidence from Tests

### Test Output Analysis

```
=== TECHNIQUE PROFILE ANALYSIS ===
Puzzle 1: Hardest technique: relational
  Techniques used: direct, elimination, relational
  Chain length: 2
  
Puzzle 2-10: Same pattern...
```

**Observation**: All 10 "hard" puzzles max out at T3 (relational), never reaching T4 (crossLayer) or T5 (caseSplit). This suggests:
- Either our "hard" tier isn't actually hard
- Or the technique profiler isn't detecting advanced reasoning
- Or we're not generating puzzles that require advanced techniques

### Critical Architecture Flaw

```typescript
// Current clue storage (from types.ts)
interface Clue {
  suspectId: string;
  text: string;  // Human-readable
  // That's it! No structure, no metadata
}

// Constraint during generation (opaque closure)
interface ClueConstraint {
  suspectId: string;
  text: string;
  isSatisfied: (assignment: Partial<Assignment>) => boolean;  // BLACK BOX
}
```

**Problem**: Once a puzzle is generated and serialized:
- We lose the constraint predicates
- Cannot re-analyze clue necessity
- Cannot reconstruct the solving path
- Cannot verify which clues are redundant

## Comparison: Us vs Shigai Royalty

| Feature | Our Engine | Shigai Royalty | Gap |
|---------|-----------|----------------|-----|
| Uniqueness verification | ✅ Brute-force | ✅ Presumably | None |
| Tier certification | ✅ Two-sided | ⚠️ One-sided? | We're stricter |
| IF-THEN clues | ❌ No | ✅ Yes | **Major** |
| Propagation in generator | ❌ No | ✅ Likely | **Major** |
| MRV heuristic | ❌ No | ✅ Likely | Moderate |
| Cross-layer reasoning | ✅ Yes | ⚠️ Unknown | Advantage |
| Spatial validation | ✅ Yes | ✅ Presumably | None |
| Solving path tracking | ❌ No | ✅ Likely | **Moderate** |
| Grid size support | 6×6 to 8×8 | Claims 10×10+ | **Major** |

## Root Causes Identified

### 1. **Closure-Based Constraints**
Storing constraints as opaque predicates makes post-hoc analysis impossible.

### 2. **Generator-Grader Split**
The smart solver exists but isn't consulted during generation.

### 3. **Simple Clue Selection Algorithm**
One-clue-at-a-time escalation without lookahead or propagation.

### 4. **Limited Clue Vocabulary**
Missing conditional (IF-THEN) and compound clue types.

## Recommended Fixes (Priority Order)

### Phase 1: Immediate Wins (1-2 weeks)

#### 1A. Add Constraint Metadata
```typescript
interface ClueConstraint {
  suspectId: string;
  text: string;
  isSatisfied: (a: Partial<Assignment>) => boolean;
  
  // NEW: Structured metadata for analysis
  metadata?: {
    type: 'direct' | 'relational' | 'directional' | 'height';
    referencesSuspects: string[];  // Which suspects this constrains
    pruningPower?: number;  // How many possibilities it eliminates
  };
}
```

#### 1B. Track Deduction Order
During generation, record which clue enabled which deduction:
```typescript
interface GenerationLog {
  step: number;
  addedClue: Clue;
  eliminatedPossibilities: number;
  newlyDeducibleFacts: string[];
}
```

### Phase 2: Core Engine Upgrade (2-4 weeks)

#### 2A. Port Propagation to Generator
Move the arc-consistency logic from `technique-solver.ts` into `clues.ts`:
```typescript
// New function in clues.ts
function selectNextClueWithPropagation(
  currentClues: ClueConstraint[],
  candidates: ClueConstraint[],
  floorPlan: FloorPlan,
  solution: Assignment
): ClueConstraint {
  // For each candidate, simulate adding it
  // Run constraint propagation
  // Measure how many possibilities get eliminated
  // Pick the one with highest pruning power
}
```

#### 2B. Add IF-THEN Clue Type
```typescript
// New clue archetype in clues.ts
function buildConditionalCandidates(...): Candidate[] {
  // "If X was in room R, then Y was in column C"
  // Constrains TWO suspects simultaneously
  // Provides exponential pruning when combined with other clues
}
```

### Phase 3: Scaling Enablement (4-8 weeks)

#### 3A. MRV Heuristic in Generator
```typescript
// Before selecting next clue, find the suspect with fewest remaining options
const suspectWithMinOptions = findMRVSuspect(currentConstraints, floorPlan);
// Prioritize clues about THIS suspect
```

#### 3B. Multi-Clue Selection
Instead of one-clue-at-a-time, consider pairs/triples:
```typescript
// Evaluate clue combinations for synergistic pruning
const bestPair = findBestCluePair(candidates, budget);
```

## Verification Strategy

After implementing fixes, run these tests:

1. **Uniqueness Stress Test**: 1000 seeds, verify 100% success rate
2. **Human Solvability Test**: Real humans solve puzzles, measure time/frustration
3. **Logical Flow Audit**: Verify each puzzle has at least one clean deduction chain
4. **Tier Calibration**: Ensure "hard" puzzles actually require T4/T5 techniques
5. **Grid Scaling**: Test 9×9, 10×10 with new propagation

## Conclusion

The engine is **not trash** — it correctly generates unique puzzles and passes all mathematical validations. However, it's **logically behind** because:

1. It optimizes for **uniqueness** but not **elegance**
2. It has a **smart grader** but a **dumb generator**
3. It lacks **advanced clue types** that enable elegant logic chains

**Fixing this requires**: Porting propagation logic to generation, adding IF-THEN clues, and tracking deduction order. Estimated timeline: 4-8 weeks for full upgrade.

The good news: All the pieces exist in the codebase. We just need to connect them properly.
