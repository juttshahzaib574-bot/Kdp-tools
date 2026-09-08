# Engine Gap Analysis: KDP Studio vs Shigai Royalty

**Date:** 2026-01-XX  
**Purpose:** Deep technical comparison of puzzle generation engines, identifying where we stand and what it takes to reach the next level.

---

## Executive Summary

Your statement is **correct**: our engine is logically behind Shigai Royalty at the highest tiers. This is not a product gap or an art gap—it is a core algorithmic gap in three specific areas:

1. **No conditional (IF-THEN) clues** — they have them; we don't
2. **Naive backtracking with zero propagation** — 88.6% of generation time spent here
3. **Zero-guess policy at all tiers** — they allow disclosed lookaheads above Medium; we forbid guessing entirely

These three gaps explain why our engine dies at 10×10 while they can (allegedly) scale higher. The good news: all three are solvable without rewriting the entire engine. The roadmap already identifies this in Phase 2.

---

## 1. What Shigai Royalty Actually Does (Primary Source Evidence)

From `/workspace/docs/competitor-shigai-royalty.md` (404 lines, based on 10 screenshots + exported PDF analysis):

### Confirmed Capabilities
| Feature | Status | Evidence |
|---------|--------|----------|
| **IF-THEN clues** | ✅ Confirmed | Screenshot shows: "If I was in the Kitchen, then Greta was in the Study" |
| **Grid sizes** | ⚠️ Open question | Only 7×7 shown in demo; dropdown may include larger but not visible |
| **Lookaheads allowed** | ✅ Confirmed | "Zero at Easy/Medium only; lookaheads permitted above" |
| **Difficulty disclosure** | ✅ Confirmed | Badge printed on page showing technique level |
| **8 languages** | ⚠️ Claimed, not verified | Dropdown confirmed; language count from affiliate prose |
| **Hints per puzzle** | ⚠️ Claimed, not verified | No screenshot shows hints |
| **Step-by-step walkthroughs** | ⚠️ Claimed, not verified | No screenshot shows derivation |

### Their Architecture Weakness (Our Advantage)
```
"Puzzle content isn't stored — every load generates fresh, unique puzzles 
in your world. Templates live in this browser only (local, not synced)."
```

**Our advantage:** Database-backed templates, cross-device sync, versioned seeds with overrides.

---

## 2. Our Engine: Current State (Measured, Not Assumed)

### The Brutal Numbers
From profiling 4 generations of 8×8 Hard puzzles:

| Metric | Value | Implication |
|--------|-------|-------------|
| Total generation time | 12,142 ms | Baseline |
| Time in `countSolutions` | 10,753 ms (**88.6%**) | **This is the bottleneck** |
| Calls to `countSolutions` | 5,543 | Naive clue selection loop |
| Nodes searched per call | ~2M max | No domain pruning |
| Backtracks | Unbounded | No constraint propagation |

### Where We Die (Measured Failure Points)

```typescript
// From calibration testing:
10×10 Hard: 3/3 seeds failed @ 283 seconds each
Cause: Engine wall (not assets—content pools were sufficient)
```

**Three independent walls:**

| Wall | Bites At | Root Cause |
|------|----------|------------|
| **Engine** | Size 10 | Naive backtracking, no propagation, zero-guess rule |
| **Assets** | Size 13 | Object pool = 12 (expandable) |
| **Deducibility** | Unknown | Zero-split requirement at every tier |

The engine wall comes **first**, three sizes before assets matter.

---

## 3. The Three Core Gaps (Ranked by Impact)

### Gap #1: No Conditional Clues (Highest Leverage)

**What they have:**
```
"If I was in the Kitchen, then Greta was in the Study"
```

**What we have:** Zero conditional families. All our clues are unary or binary relations:
- Direct: "Ada was in column 3"
- Relational: "Babbette was north of Cecil"
- Strong: "Dexter was the same height as the person in the Library"

**Why it matters:** A single IF-THEN clue constrains **two suspects across two rooms** in one sentence. This provides exponentially more pruning power per clue than any unary clue.

**Impact on scaling:**
- At 8×8: 230 of 237 unique clue sets had NO zero-split route
- With IF-THEN: Fewer clues needed for uniqueness + deducibility
- At 10×10+: This is likely the difference between "generatable" and "impossible"

**Implementation status:** Not started. Would require:
1. New clue family in `clues.ts`
2. New technique rung (T6: "conditional")
3. Propagation logic for modus tollens/ponens
4. Phrasing templates for conditionals

---

### Gap #2: Naive Backtracking (88.6% of Generation Time)

**Current implementation** (`solve.ts:72-97`):

```typescript
function backtrack(row: number): boolean {
  if (row === size) {
    count++;
    return count >= cap;
  }
  for (let col = 0; col < size; col++) {
    if (!occupyMask[row]![col] || usedCols.has(col)) continue;
    for (const suspectId of suspectIds) {
      if (usedSuspects.has(suspectId)) continue;
      if (++nodes > maxNodes) throw new SolverBudgetExceededError();
      
      assignment[suspectId] = cell;
      usedCols.add(col);
      usedSuspects.add(suspectId);
      
      if (satisfiesAll() && backtrack(row + 1)) return true;
      
      backtracks++;
      // ... undo ...
    }
  }
}
```

**What's missing:**
1. **No domain pruning** — candidates aren't narrowed before search
2. **No variable ordering** — doesn't pick most-constrained suspect first (MRV)
3. **No forward checking** — doesn't detect dead ends early
4. **No arc consistency** — doesn't run AC-3 before branching

**Compare to our technique solver** (`technique-solver.ts`), which HAS all of these:
- Arc consistency via `applyRelational()`
- Hidden singles/naked subsets via `applyHiddenSingles()`, `applyNakedSubsets()`
- Cross-layer propagation via `applyCrossLayer()`

**The irony:** We already built a smart solver for grading, but use a dumb solver for generation.

**Fix priority:** HIGH. This is the 88.6% opportunity.

---

### Gap #3: Zero-Guess Policy at All Tiers

**Our policy:**
```typescript
// From technique-solver.ts:MAX_SPLIT_DEPTH = 3
// But tier contract forbids caseSplit below Extreme
```

**Their policy:**
- Easy/Medium: Zero guesses (same as us)
- Hard+: Allow lookaheads, disclose count on badge

**The math:**
At 8 suspects, requiring ZERO case splits eliminates 97% of possible clue combinations. Relaxing to "≤2 disclosed lookaheads" would explode the reachable set.

**Strategic choice:**
We can EITHER:
A. Keep zero-guess everywhere (our current strictness = marketing advantage)
B. Allow disclosed lookaheads at Expert/Extreme only (enables larger grids)

**Recommendation:** Option B, but PRINT the lookahead count. This is honest ("requires 2 what-ifs") and beats their undisclosed approach.

---

## 4. Technique Ladder Comparison

### Our Techniques (5 rungs)
```typescript
export const TECHNIQUES = [
  "direct",       // T1: Clue names cell outright
  "elimination",  // T2: Only one suspect fits here
  "relational",   // T3: Arc consistency between suspects
  "crossLayer",   // T4: Evidence ↔ seating interaction
  "caseSplit",    // T5: Assume-and-test
];
```

### Their Techniques (Inferred from badges + screenshots)
| Level | Name | Allowed Techniques |
|-------|------|-------------------|
| Easy | ★☆☆ | Direct only |
| Medium | ★★☆ | Direct + Elimination |
| Hard | ★★★ | + Relational + **1-2 lookaheads** |
| Expert | ★★★★ | + **IF-THEN** + 3-5 lookaheads |
| Dragon | ★★★★★ | + **Fish?** + unlimited lookaheads (disclosed) |

**Key differences:**
1. They have IF-THEN as explicit technique rung (we don't)
2. They allow lookaheads above Medium (we don't)
3. They may have "fish" technique (naked/hidden subsets renamed?) — unverified
4. Their top tier is defined by lookahead count, not technique complexity

**Our advantage:** Two-sided certification
- We certify BOTH "solves at tier X" AND "fails at tier X-1"
- They only certify one direction (can solve at tier)
- This prevents undershooting (Medium puzzle labeled Hard)

---

## 5. Scaling Comparison: Where We Actually Stand

### Grid Size Capability

| Size | Us (Measured) | Them (Claimed) | Gap |
|------|---------------|----------------|-----|
| 6×6 | ✅ 100% Easy-Hard | ✅ Supported | Parity |
| 7×7 | ✅ 100% Easy-Hard | ✅ Demo shows this | Parity |
| 8×8 | ✅ 90/90 success @ Hard | ✅ Likely supported | Parity |
| 9×9 | ⚠️ Untested | ⚠️ Not shown | Unknown |
| 10×10 | ❌ 0/3 seeds @ Hard (283s each) | ⚠️ Possibly supported | **THEY WIN** |
| 12×12 | ❌ Cannot test (engine dies) | ⚠️ Dropdown may include | **THEY WIN** |
| 16×16 | ❌ Impossible currently | ⚠️ Claimed via "auto" sizing | **THEY WIN** |

**Honest assessment:** We lose at 10×10+ due to the three gaps above.

### The 16×16 Question

**Their approach** (likely):
- "Grid size (auto)" control suggests trim-size-derived grids
- May be using matrix format (4 categories × 4 items = 256 cells) for large sizes
- Spatial 16×16 would be 16! × 16! = 10²⁶ states — impossible without major optimization

**Our path to 16×16:**
Two options (from roadmap Phase 6):

**Option A: Matrix Logic Grid (Murdle-style)**
- Search space: 4!³ = 13,824 states (vs our 8×8's 1.6 billion)
- Native support for conditional clues
- 4 categories (suspect, weapon, motive, location)
- **This is the ONLY honest route to 16×16 we have found**

**Option B: Optimized Spatial Engine**
- Requires: propagation + MRV + IF-THEN + relaxed lookahead policy
- May still fail at 14×14+ without exponential engineering
- Gate A in roadmap tests this at 12×12

---

## 6. Feature-by-Feature Engine Comparison

| Capability | Us | Shigai | Winner |
|------------|----|--------|--------|
| **Unique solution guarantee** | ✅ Brute-force verified | ✅ Claimed | Tie |
| **Deducibility guarantee** | ✅ Technique-certified | ⚠️ Lookaheads allowed | **US** |
| **Two-sided tier certification** | ✅ Yes | ❌ One-sided | **US** |
| **IF-THEN clues** | ❌ No | ✅ Yes | **THEM** |
| **Conditional propagation** | ❌ N/A | ✅ Presumed | **THEM** |
| **Constraint propagation** | ✅ In technique solver only | ✅ Presumed in generator | **THEM** |
| **MRV / variable ordering** | ❌ No | ⚠️ Unknown | Likely THEM |
| **Arc consistency (AC-3)** | ❌ Fixpoint loop | ⚠️ Unknown | Unknown |
| **Cross-layer reasoning** | ✅ Evidence ↔ seating | ⚠️ Furniture legend exists | **US** (verified) |
| **"Fish" technique** | ❌ No | ⚠️ Claimed | Likely THEM |
| **Lookahead disclosure** | ✅ Printed on badge | ✅ Printed on badge | Tie |
| **Zero-guess at Easy/Medium** | ✅ Yes | ✅ Yes | Tie |
| **Zero-guess at Hard+** | ✅ Yes | ❌ No | **US** (stricter) |

**Net score:** 
- Engine smarts: **THEM** (IF-THEN + propagation in generator)
- Logical rigor: **US** (two-sided cert + zero-guess stricter policy)
- Scaling: **THEM** (can allegedly go larger)

---

## 7. What "Next Level" Actually Requires

### Minimum Viable Engine Upgrades (Phase 2)

To reach parity at 10×10-12×12:

1. **Structured clue representation** (Roadmap 2.1)
   - Replace probe-based structure with real logic forms
   - Enables propagation without re-probing every step
   - **Size: Large** — refactors `clues.ts` fundamentally

2. **Propagation + MRV in `countSolutions`** (Roadmap 2.2)
   - Port techniques from `technique-solver.ts` to `solve.ts`
   - Add minimum remaining values heuristic
   - Add forward checking
   - **Size: Large** — but reuses existing technique logic

3. **IF-THEN clue family** (Roadmap 2.4)
   - New archetype: `ConditionalClue`
   - Syntax: `if (suspectA in roomX) => (suspectB in roomY)`
   - Propagation: modus tollens elimination
   - New technique rung: T6 "conditional"
   - **Size: Large** — new domain entirely

4. **Lookahead policy decision** (Roadmap 2.5)
   - Decision: Keep zero-guess everywhere? Or allow at Expert+?
   - If allowing: print count on badge ("requires 2 what-ifs")
   - **Size: Small (decision) + Medium (implementation)**

### Stretch Goals (True Leadership)

To beat them at their own game:

5. **Lying suspect mechanic** (Roadmap 2.7)
   - Some statements are false
   - Deduce the liar first, then solve
   - Murdle's canonical escalation
   - **Size: Extra Large** — requires truth-value tracking

6. **AC-3 worklist algorithm** (Roadmap 2.3)
   - Replace fixpoint loop with proper worklist
   - Faster convergence on large grids
   - **Size: Medium**

7. **"Fish" technique** (Roadmap 2.8)
   - Only if measurement shows stalling at 12×12
   - Naked/hidden quads+ beyond current pairs/triples
   - **Size: Medium** — but measure first

---

## 8. Strategic Recommendations

### Immediate Priorities (Next 2-4 Weeks)

1. **Instrument scaling first** (Phase 0)
   - Expand content pools to 32 names, 24 rooms, 24 objects
   - Raise `MAX_GRID_SIZE` to 16
   - Build scaling harness to measure 10×10, 12×12, 14×14, 16×16
   - **Why:** Can't optimize what you can't measure

2. **Harvest low-hanging fruit** (Phase 1)
   - Solution walkthroughs (data already exists in `TechniqueProfile`)
   - Hint ladder (first N steps of walkthrough)
   - Difficulty badge on page
   - **Why:** Closes real gaps with zero engine changes

3. **Decision: Lookahead policy**
   - Recommend: Allow ≤2 lookaheads at Expert, ≤4 at Extreme
   - Print count on badge
   - **Why:** Unlocks 10×10+ without massive engineering

### Medium-Term (1-3 Months)

4. **Attack the 88.6%** (Phase 2.1-2.3)
   - Port propagation from technique solver to `countSolutions`
   - Add MRV heuristic
   - Measure improvement at 8×8, 10×10
   - **Expected win:** 10-50x speedup on Hard+

5. **Add IF-THEN clues** (Phase 2.4)
   - Start with simple conditionals (single antecedent/consequent)
   - Add phrasings: "If X was in [room], then Y was [relation]"
   - Certify as T6 technique
   - **Expected win:** Enables uniqueness with fewer clues at large sizes

### Long-Term (3-6 Months)

6. **Gate A: Test 12×12**
   - If PASS (≥80% success @ Hard, <30s): Continue scaling to 14×16
   - If FAIL: Pivot to matrix format (Phase 6) as 16×16 solution

7. **Matrix logic grid** (Phase 6)
   - This is the **only differentiator** where we lead
   - Shigai is "strictly Murdoku-style" (spatial only)
   - Matrix format naturally supports 16×16 (4×4 categories)
   - **Strategic value:** Market leadership, not catch-up

---

## 9. Honest Assessment: Where We Stand

### Engine Intelligence
**Verdict: Behind at high tiers, ahead at low tiers**

- Easy/Medium: **We win** (stricter zero-guess policy)
- Hard: **Tie** (they allow 1-2 lookaheads; we don't)
- Expert+: **They win** (IF-THEN + more lookaheads)

### Product Completeness
**Verdict: Roughly 1/3 of their feature set**

From competitor analysis, 21-item gap list:
- We're ahead on: 4 items (guess-free guarantee, two-sided cert, cross-layer rung, audit trail)
- Parity on: 10 items (grid structure, uniqueness, determinism, etc.)
- Behind on: 21 items (story mode, series continuity, art assets, hints, walkthroughs, localization, trim sizes, etc.)

**The book is the gap, not the engine.**

### Path to Leadership
**Verdict: Achievable in 6 months with focused execution**

Critical path:
1. Phase 0-1: Instrument + harvest (1 month)
2. Phase 2: Engine core upgrades (2-3 months)
3. Phase 3: Book presentation (2 months)
4. Phase 6: Matrix format (differentiator) (2-3 months)

**Total: 6-9 months to full parity + differentiation**

---

## 10. Technical Debt That Blocks Progress

### Critical Debts

1. **Dual solver architecture**
   - `solve.ts`: Dumb backtracker for generation
   - `technique-solver.ts`: Smart propagator for grading
   - **Problem:** Maintaining two solvers; smart one not used for generation
   - **Fix:** Merge into unified solver with mode flags

2. **Probe-based clue structure**
   - Currently probes every clue against every cell (O(n²))
   - Done repeatedly for each tier grade (4x waste)
   - **Problem:** Most expensive part of grading
   - **Fix:** Structured representation (Phase 2.1)

3. **No caching across solves**
   - Same clue set solved 4x for tier grading
   - No memoization of intermediate states
   - **Problem:** Wasted computation
   - **Fix:** Cache propagation results between ceiling attempts

### Non-Critical (Can Wait)

- DLX/Algorithm X adoption (would break relational clues)
- Real-solver validation (needs human testing pipeline)
- Grid size as difficulty lever (rejected by design)

---

## 11. Conclusion: The Road to Next Level

### Summary of Gaps

| Gap | Severity | Effort to Fix | Impact |
|-----|----------|---------------|--------|
| No IF-THEN clues | 🔴 Critical | Large | Enables 10×10+ |
| Naive backtracking | 🔴 Critical | Large | 88.6% of runtime |
| Zero-guess everywhere | 🟡 Strategic | Decision only | Policy change unlocks scaling |
| No propagation in generator | 🔴 Critical | Large | Early dead-end detection |
| No MRV heuristic | 🟡 High | Medium | Better variable ordering |

### The Win Condition

**To reach "next level":**
1. ✅ Add IF-THEN clues (new technique family)
2. ✅ Port propagation to `countSolutions` (reuse technique solver logic)
3. ✅ Add MRV + forward checking
4. ✅ Relax zero-guess policy at Expert+ (with disclosure)
5. ✅ Measure at 12×12 (Gate A)

**Expected outcome:**
- 10×10 Hard: From 0% success @ 283s → 80%+ success @ <30s
- 12×12 Hard: From impossible → 80%+ success
- 14×16: Possible with further tuning
- 16×16: Requires matrix format (Phase 6)

### Final Verdict

Your instinct is correct: **the engine is behind at high tiers**. But this is not a fundamental architectural flaw—it's three specific, fixable gaps:

1. Missing clue family (IF-THEN)
2. Unused smart solver (propagation not in generator)
3. Overly strict policy (zero-guess everywhere)

The roadmap already captures this in Phase 2. The question is not "can we do it?" but "when do we prioritize it over book features?"

**Recommendation:** Execute Phase 0-1 first (cheap wins), then attack Phase 2 aggressively. Gate A at 12×12 will tell you whether to continue scaling spatial or pivot to matrix format for 16×16.

The engine can reach the next level. It's a 2-3 month focused sprint away from parity at 10×10-12×12.

---

## Appendix A: Code Locations for Engine Upgrades

| Component | File | Lines | Notes |
|-----------|------|-------|-------|
| Current backtracker | `solve.ts` | 51-110 | Needs propagation |
| Technique solver | `technique-solver.ts` | 1-886 | Has propagation logic |
| Clue generation | `clues.ts` | 1-744 | Add IF-THEN archetypes |
| Tier contract | `tier-contract.ts` | — | Defines technique ceilings |
| Phrasings | `phrasings.ts` | — | Add conditional templates |
| Types | `types.ts` | — | Add `ConditionalClue` type |

## Appendix B: Measurement Harness Requirements

To properly benchmark improvements:

```typescript
interface ScalingMetrics {
  gridSize: number;
  tier: Difficulty;
  seedCount: number;
  successRate: number;      // % seeds that generate
  avgGenerationTime: number; // ms
  avgClueCount: number;     // clues per puzzle
  techniqueGrade: Technique; // hardest technique required
  nodesSearched: number;    // search effort
  backtracks: number;       // dead ends hit
}
```

Run at: 6×6, 7×7, 8×8, 9×9, 10×10, 11×11, 12×12, 14×14, 16×16  
Across tiers: Easy, Medium, Hard, Expert, Extreme  
Sample size: ≥30 seeds per configuration

## Appendix C: IF-THEN Clue Implementation Sketch

```typescript
interface ConditionalClue extends ClueConstraint {
  kind: 'conditional';
  antecedent: { suspectId: string; cell: Cell };  // If X is here
  consequent: { suspectId: string; cell: Cell };  // Then Y must be there
  isSatisfied: (assignment: Partial<Assignment>) => boolean;
}

// Propagation rule (modus tollens):
// If consequent is impossible, antecedent must be false
function propagateConditional(
  candidates: Candidates,
  clue: ConditionalClue,
): boolean {
  const { antecedent, consequent } = clue;
  let changed = false;
  
  // If consequent.suspectId cannot be in consequent.cell,
  // then antecedent.suspectId cannot be in antecedent.cell
  const consequentImpossible = !candidates.get(consequent.suspectId)
    .has(cellIndex(consequent.cell));
    
  if (consequentImpossible) {
    const removed = candidates.get(antecedent.suspectId)
      .delete(cellIndex(antecedent.cell));
    changed ||= removed;
  }
  
  return changed;
}
```

---

**Document Status:** Complete  
**Next Action:** Review with team, prioritize Phase 0-1, schedule Phase 2 sprint

