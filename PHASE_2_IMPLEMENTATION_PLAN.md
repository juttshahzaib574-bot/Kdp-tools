# Phase 2 Implementation Plan: Engine Intelligence Upgrade

## Problem Statement

Our engine is logically behind Shigai Royalty at higher tiers due to three gaps:
1. **No propagation during generation** - We have a smart technique-aware solver but it's ONLY used for grading AFTER generation
2. **No IF-THEN conditional clues** - Missing powerful constraints that create elegant logical chains
3. **Fixed variable ordering** - No MRV heuristic or forward checking

## Current Architecture Analysis

### What We Have (Assets)
- ✅ `technique-solver.ts`: Full propagation solver with 5 technique tiers
- ✅ `solveByTechnique()`: Can solve puzzles the way humans do
- ✅ `gradePuzzle()`: Uses technique solver to certify difficulty
- ✅ `isDeducible()`: Validates puzzles have logical routes

### What's Missing (Gaps)
- ❌ Generator (`clues.ts`) uses simple escalation without propagation guidance
- ❌ No conditional clue types (IF-THEN)
- ❌ No MRV (Minimum Remaining Values) heuristic in clue selection
- ❌ No forward checking during clue selection

## Implementation Strategy

### Sprint 2A: Port Propagation to Generator (Core Fix)

**File**: `packages/generators/grid-mystery/src/clues.ts`

**Current Flow**:
```
buildCandidates() → pick one per suspect → check uniqueness → escalate if ambiguous
```

**New Flow**:
```
buildCandidates() → propagate impact of each candidate → score by propagation power → 
pick highest-impact → forward check → verify uniqueness
```

**Key Changes**:

1. **Add propagation scoring to candidates**:
```typescript
interface Candidate extends ClueConstraint {
  tier: Tier;
  fragment?: string;
  // NEW: How much this clue narrows the search space when propagated
  propagationScore?: number;
  // NEW: Which cells/suspects it directly impacts
  affectedSuspects?: string[];
}
```

2. **Modify `generateClueSet()` to use propagation-guided selection**:
```typescript
// Instead of just picking by tier, score candidates by their propagation impact
function scoreCandidatePropagation(
  candidate: Candidate,
  currentCandidates: Candidates,
  puzzle: SolvableInput,
): number {
  // Clone current state
  const testCandidates = copy(currentCandidates);
  
  // Apply this clue's constraint
  applyClueConstraint(candidate, testCandidates);
  
  // Run propagation
  const result = propagate(
    testCandidates,
    // ... structured clues
    ceiling: "relational", // Don't allow case-splitting
    // ...
  );
  
  // Score = how many possibilities eliminated
  const before = sumCandidateCounts(currentCandidates);
  const after = sumCandidateCounts(testCandidates);
  return before - after;
}
```

3. **Implement MRV heuristic for clue ordering**:
```typescript
// When choosing which suspect to assign a clue for next,
// pick the one with fewest remaining options
function selectNextSuspectForClue(
  candidates: Candidates,
  assignedSuspects: Set<string>,
): string | null {
  let minId: string | null = null;
  let minCount = Infinity;
  
  for (const [id, set] of candidates) {
    if (assignedSuspects.has(id)) continue;
    if (set.size < minCount) {
      minCount = set.size;
      minId = id;
    }
  }
  
  return minId;
}
```

### Sprint 2B: Add IF-THEN Conditional Clues

**File**: `packages/generators/grid-mystery/src/clues.ts`

**New clue type in `buildCandidates()`**:

```typescript
// After building single-suspect clues, build conditional clues
function buildConditionalCandidates(
  suspects: readonly Suspect[],
  floorPlan: FloorPlan,
  solution: Assignment,
  rng: Rng,
): Candidate[] {
  const conditionals: Candidate[] = [];
  
  // Generate IF-THEN clues between pairs
  for (let i = 0; i < suspects.length; i++) {
    for (let j = i + 1; j < suspects.length; j++) {
      const suspectA = suspects[i]!;
      const suspectB = suspects[j]!;
      const cellA = solution[suspectA.id]!;
      const cellB = solution[suspectB.id]!;
      
      // Pattern 1: If A was in room X, then B was in row Y
      const roomA = roomNameAt(floorPlan, cellA);
      const rowB = cellB.row + 1;
      
      conditionals.push({
        tier: "strong",
        suspectId: suspectA.id, // Primary subject
        text: `If ${suspectToken(suspectA.id)} was in the ${roomA}, then ${suspectToken(suspectB.id)} was in row ${rowB}`,
        isSatisfied: (a) => {
          const posA = a[suspectA.id];
          const posB = a[suspectB.id];
          // Implication: false → anything is true
          if (!posA || roomNameAt(floorPlan, posA) !== roomA) return true;
          // A is in room, so B must be in row
          return !posB || posB.row === cellB.row;
        },
        isConditional: true, // Flag for rendering
      });
      
      // Pattern 2: If A was north of B, then C was in same column as D
      // (more complex, generates richer logic chains)
    }
  }
  
  return conditionals;
}
```

**Phrasing templates** (add to `phrasings.ts`):
```typescript
export const CONDITIONAL_IF_ROOM_THEN_ROW = [
  "If {nameA} was in the {room}, then {nameB} was in row {row}",
  "Were {nameA} in the {room}, {nameB} would stand in row {row}",
];

export const CONDITIONAL_IF_ADJACENT_THEN_COLUMN = [
  "If {nameA} stood adjacent to {nameB}, then {nameC} occupied column {col}",
];
```

### Sprint 2C: Forward Checking Integration

**Modify escalation loop** to reject clues that create dead ends early:

```typescript
for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
  // Pick clue using MRV
  const suspectId = selectNextSuspectForClue(currentCandidates, assigned);
  if (!suspectId) break;
  
  // Score all candidates for this suspect by propagation
  const scored = candidatesForSuspect.map(c => ({
    candidate: c,
    score: scoreCandidatePropagation(c, currentCandidates, solvable),
  }));
  
  // Pick highest-scoring that passes forward check
  for (const {candidate, score} of scored.sort((a,b) => b.score - a.score)) {
    const trial = [...active, candidate];
    
    // Forward check: can this still lead to solution?
    if (!forwardCheck(trial, solvable)) continue;
    
    active.push(candidate);
    break;
  }
  
  // Verify uniqueness as before
  // ...
}
```

## Testing Strategy

### New Test File: `propagation-integration.test.ts`

```typescript
describe("Propagation-guided generation", () => {
  test("Generator prefers high-propagation clues", () => {
    // Generate puzzle with seed X
    // Extract which clues were selected
    // Verify they rank high on propagation score
  });
  
  test("MRV heuristic reduces backtracking", () => {
    // Compare node counts with/without MRV
    // Should see 30-50% reduction
  });
  
  test("IF-THEN clues appear in Hard+ puzzles", () => {
    // Generate 100 Hard puzzles
    // At least 60% should contain conditional clues
  });
  
  test("Forward checking rejects dead-end paths earlier", () => {
    // Measure average attempt count
    // Should decrease by 20-30%
  });
});
```

## Expected Outcomes

### Metrics Improvements
- **Generation speed**: 40-60% faster (fewer attempts needed)
- **8×8 success rate**: From 90% to 98%+
- **Logical elegance**: Puzzles show clearer deduction chains
- **Scaling**: Enable 9×9 and 10×10 grids reliably

### Competitive Positioning
| Feature | Before | After | Shigai |
|---------|--------|-------|--------|
| Propagation in gen | ❌ | ✅ | ✅ |
| IF-THEN clues | ❌ | ✅ | ✅ |
| MRV heuristic | ❌ | ✅ | Likely |
| Two-sided cert | ✅ | ✅ | ❌ |
| Zero-guess guarantee | ✅ | ✅ | ❌ |

## Timeline

- **Week 1**: Sprint 2A (propagation integration)
- **Week 2**: Sprint 2B (IF-THEN clues)
- **Week 3**: Sprint 2C (forward checking) + testing
- **Week 4**: Benchmarking, tuning, documentation

## Risk Mitigation

1. **Performance regression**: Profile propagation calls, add caching
2. **Over-constraining**: Keep deducibility checks, ensure puzzles remain solvable
3. **Clue quality**: Human review of IF-THEN phrasings for naturalness

## Files to Modify

1. `/workspace/packages/generators/grid-mystery/src/clues.ts` - Core generation logic
2. `/workspace/packages/generators/grid-mystery/src/phrasings.ts` - Add conditional templates
3. `/workspace/packages/generators/grid-mystery/src/technique-solver.ts` - Export helper functions
4. `/workspace/packages/generators/grid-mystery/src/__tests__/propagation-integration.test.ts` - New tests

## Success Criteria

✅ All existing tests pass
✅ New propagation tests pass
✅ 8×8 Hard generation success rate ≥98%
✅ Average generation time <2s for 8×8
✅ IF-THEN clues appear naturally in 60%+ of Hard+ puzzles
✅ Logic profile shows improved chain lengths
