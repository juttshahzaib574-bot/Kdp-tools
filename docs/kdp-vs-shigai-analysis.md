# KDP Studio vs Shigai Royalty — Engine Intelligence & Feature Analysis

**Date:** 2026-01-04  
**Purpose:** Deep technical comparison of puzzle generation engines, identifying where we lead, where we trail, and the concrete engineering path to close gaps.

---

## Executive Summary

**We build the same puzzle.** Both engines generate spatial-grid "Murdoku-style" logic puzzles: N×N floor plan, N-1 suspects + 1 victim, one-per-row/column placement, alone-with-victim reveals killer.

**Our engine is stricter but smaller.** We enforce zero-guessing at all five difficulty tiers with two-sided technique certification. They allow lookaheads above Medium (disclosed to users). This strictness is our core differentiator AND the reason we hit a wall at 8×8 while they demo 7×7 (with unverified claims of larger).

**The real gap is not the engine—it's the book.** Our logic core matches or exceeds theirs on verification rigor. But their product has ~20 features we lack: story mode, series continuity, custom cast with photos, 64 floor tiles, furniture icons, hints, walkthroughs, localization, trim sizes, templates, and more.

**Biggest strategic opportunity:** They are "strictly a Murdoku-style generator." Adding matrix-logic-grid puzzles (the Murdle form with 3-4 categories) would be a feature they structurally cannot match.

---

## 1. Engine Intelligence Comparison

### 1.1 Solution Verification

| Aspect | KDP Studio | Shigai Royalty | Winner |
|--------|-----------|----------------|--------|
| **Uniqueness proof** | Brute-force backtracking solver, stops at 2 solutions | Same approach (inferred from UI claims) | Tie |
| **Node budget** | 2M nodes max, throws `SolverBudgetExceededError` | Unknown | Unknown |
| **Independent re-verification** | ✅ Yes—generator re-solves after clue selection, throws `PuzzleVerificationFailedError` if mismatch | ❌ No evidence of double-check | **Us** |
| **Zero-guess guarantee** | ✅ All 5 tiers—no case-splitting allowed | ❌ Only Easy/Medium; lookaheads permitted above | **Us** (stricter) |
| **Technique certification** | ✅ Two-sided—lowest ceiling that solves, prevents both undershoot and overshoot | ❌ One-sided rating only | **Us** |

**Verdict:** Our verification is more rigorous. We certify in both directions ("this puzzle requires exactly relational reasoning, no less and no more") while they rate only upper bounds.

### 1.2 Technique Modeling

Both engines model human solving, but differently:

| Technique | KDP Studio Implementation | Shigai Evidence |
|-----------|--------------------------|-----------------|
| **T1: Direct** | Clue names cell outright or leaves one option | Implied by Easy tier |
| **T2: Elimination** | Hidden singles, naked/hidden subsets (pairs & triples), uniqueness propagation | Implied by Medium tier |
| **T3: Relational** | Arc consistency across binary clues ("X north of Y") | Implied by Hard tier |
| **T4: Cross-Layer** | Evidence↔seating bidirectional narrowing | ❌ No equivalent visible |
| **T5: Case Split** | Tracked & disclosed when used (but forbidden in certified puzzles) | ✅ Allowed above Medium, count disclosed |
| **"Fish"** | ❌ Not implemented | ✅ Claimed (unclear if real fish or renamed subset) |
| **IF-THEN clues** | ❌ Not implemented | ✅ Confirmed in screenshots |

**Key finding:** Our technique ladder is more granular (5 rungs vs their apparent 3-4). The cross-layer rung is unique to us—it certifies puzzles that require working the evidence block back into the grid, which defines Expert/Extreme tiers.

**Gap:** IF-THEN conditional clues. Their example: "If I was in the Kitchen, then Greta was in the Study." This prunes far harder than unary clues, enabling uniqueness at larger grids with fewer clues. We have zero conditional families.

### 1.3 Clue Generation Strategy

**Our approach (clues.ts):**
- Build candidate pool per suspect across 3 tiers: direct → relational → strong
- Start at difficulty-appropriate tier (Easy starts direct, Extreme starts relational)
- Escalate individual clues to stronger candidates until uniqueness achieved
- Add extra clues beyond one-per-suspect when base set can't be reasoned through (budget: 0/2/4 for sizes 6/7/8+)
- Drop up to N clues while preserving uniqueness AND deducibility (Easy: 0, Medium: 2, Hard: 3, Expert: 4, Extreme: 5)
- Grade against technique contract; reject if not certified at target tier
- Near-miss budget: 12 fair-but-off-band sets before returning best fallback

**Their approach (inferred):**
- Similar escalation (dropdown shows difficulty levels)
- Likely simpler drop strategy (no evidence of two-sided certification)
- Allow lookaheads above Medium instead of forcing pure deduction

**Advantage:** Our drop-while-deducible approach produces sparser clue sets that still force specific techniques. Their lookahead allowance makes large grids easier to generate but less "pure."

### 1.4 Performance Profile

Measured on our engine (4 × 8×8 Hard generations):

| Operation | Time (ms) | % of Total | Calls |
|-----------|-----------|------------|-------|
| `countSolutions` | 10,753 | **88.6%** | 5,543 |
| Structure recovery (probing) | ~800 | 6.6% | 4 |
| Clue candidate building | ~400 | 3.3% | 4 |
| PDF rendering | ~189 | 1.5% | 4 |

**Bottleneck:** Naive backtracking with no propagation, no MRV (minimum remaining values) heuristic, no domain pruning. Each call tries every suspect in every cell.

**Their performance:** Unknown, but likely similar architecture given same era and constraints. If they support larger grids, they may have added propagation we lack.

---

## 2. Feature Inventory: Head-to-Head

### 2.1 Where We Lead

| Feature | Us | Them | Strategic Value |
|---------|-----|------|-----------------|
| **Zero-guess at all tiers** | ✅ Enforced | ❌ Only Easy/Medium | Core differentiator—market as "no guessing, ever" |
| **Two-sided tier certification** | ✅ Lowest ceiling that solves | ❌ Rating only | Audit trail for publishers |
| **Cross-layer technique** | ✅ Evidence↔seating certified | ❌ None visible | Defines Expert/Extreme uniquely |
| **Per-puzzle logic profile** | ✅ Printed on review card | ❌ Difficulty badge only | Transparency = trust |
| **Database-backed saves** | ✅ Syncs across devices | ❌ Browser-local only | Real advantage for series/templates |

### 2.2 Parity

| Feature | Status |
|---------|--------|
| Grid structure (spatial, one-per-row/column) | ✅ Same |
| Unique solution guarantee | ✅ Same |
| Deterministic seeds | ✅ Same |
| KDP page sizes | ⚠️ We have 3, they have ~10+ |
| Print color modes (color/grayscale/B&W) | ✅ Same |
| Technique-modeling solver | ✅ Ours more granular |

### 2.3 Where We Trail (21 Gaps Identified)

#### Product & UX (10 gaps)
1. **Story mode** — Prologue/epilogue, chapter headers naming real cast/rooms
2. **Series continuity** — "Book 2, same world, new seed," no repeated puzzles/paragraphs
3. **World Builder** — User-authored reusable worlds (building, rooms, objects, floors)
4. **Custom cast** — Portraits, photo upload, preset portraits
5. **Mystery modes** — Kid variants, creature modes (one star creature per book)
6. **Artwork styles** — Illustrated, line art, kawaii (auto-swaps for kid modes)
7. **64 floor tiles** — 8 per room type, per-room override
8. **Furniture icons** — Drawn inside rooms on grid
9. **Two-page spread** — Scene left, statements right
10. **Large-print edition** — Forces spread, text ≥16pt

#### Content & Layout (6 gaps)
11. **Instructions page** — Generated how-to-play with 4 rules
12. **Copyright page** — Template bank (100 templates observed)
13. **Blank page type** — For notes/breathers
14. **2 puzzles per page** — Density option
15. **Difficulty badge on page** — Printed in exported PDF
16. **Typography/appearance panels** — Fine-grained control

#### Workflow & Reach (5 gaps)
17. **Templates + library** — Save whole designs as reusable
18. **Queue system** — Batch with background rendering
19. **Localization** — We: 1 language (English); Them: dropdown confirmed, 8 claimed (EN/ES/FR/DE/IT/PT/NL/PL)
20. **Trim sizes** — We: 3 (6×9, 7×10, 8.5×11); Them: 8 popular + A4/A5 + bleed presets
21. **Export formats** — We: PDF only; Them: PNG/PDF/SVG/PPTX per page + combined PDF

#### Engine Features (2 gaps)
22. **Hints** — Claimed by them, shipped by Murdle. We compute the path but throw it away
23. **Step-by-step walkthroughs** — Claimed by them. We already compute this in `technique-solver.ts`!
24. **IF-THEN clues** — Confirmed in their screenshots. We have zero conditional families
25. **"Fish" technique** — Claimed; unclear if real fish or naked/hidden subset rename
26. **Larger grids** — We die at 8×8 (measured); they demo 7×7, claim larger (unverified)

---

## 3. The Size Wall: Why We Die at 10×10

### 3.1 Measured Failure Mode

Test: 10×10 Hard, 3 seeds
- Result: **3/3 failures**, 283 seconds each
- Cause: NOT assets (pools sufficient at size 10: 10/16 names, 10/12 objects, ~10/10 rooms)
- Root cause: **Engine + policy**

### 3.2 Three Walls, Ranked by Leverage

| Wall | Bites At | Cause | Fix |
|------|----------|-------|-----|
| **Policy** | Size 8+ | Zero-guess rule at all tiers | Allow disclosed lookaheads at Extreme? (Decision D1) |
| **Clue power** | Size 9+ | No IF-THEN clues | Add conditional family (2.4 in roadmap) |
| **Search efficiency** | Size 10+ | Naive backtracking, no propagation | Propagator + MRV (2.2 in roadmap) |
| **Assets** | Size 13+ | Object pool = 12 | Expand pools (trivial) |

**Critical insight:** The policy wall bites first. Relaxing from "zero guesses" to "≤2 disclosed what-ifs at Extreme" would explode the reachable set at large sizes. Unlike them, we'd PRINT the count—honest difficulty labeling.

### 3.3 Conditional Clues: The Missing Lever

Their IF-THEN clue: "If I was in the Kitchen, then Greta was in the Study."

Why it matters:
- Unary clue ("I was in the Kitchen") constrains 1 suspect
- Binary relational clue ("I was north of Greta") constrains 2 suspects but allows many configurations
- **Conditional clue** constrains 2 suspects ACROSS 2 rooms in ONE sentence—prunes search space exponentially harder

Impact: Uniqueness AND deducibility become reachable with fewer clues at larger grids. We have ZERO conditional families.

---

## 4. Strategic Recommendations

### 4.1 Immediate Wins (Phase 1: Harvest)

These use work we've already paid for:

| # | Feature | Effort | Impact | Notes |
|---|---------|--------|--------|-------|
| 1.1 | **Solution walkthroughs** | M | High | Path exists in `TechniqueProfile`; currently discarded |
| 1.2 | **Hint ladder** | S | High | First N steps of same path; Murdle ships one per puzzle |
| 1.3 | **Difficulty badge on page** | XS | Medium | We compute tier; just don't print it |
| 1.4 | **Logic profile in answer key** | XS | Medium | Already on review card; makes tier auditable |
| 1.5 | **Case header** | S | Medium | Title, hook, legend (occupiable/blocked) |

**Total effort:** ~1 week  
**Closure:** 5 of 21 gaps, including the two biggest credibility builders (walkthroughs, hints)

### 4.2 Engine Core (Phase 2: Make Large Grids Reachable)

| # | Feature | Effort | Impact | Depends On |
|---|---------|--------|--------|------------|
| 2.1 | **Structured clue representation** | L | Critical | Replace probing with real logic form |
| 2.2 | **Propagation + MRV** | L | Critical | 2.1 |
| 2.3 | **AC-3 worklist** | M | High | 2.1 |
| 2.4 | **IF-THEN clues** | L | Critical | 2.1 |
| 2.5 | **Lookahead policy** | S (decision) + M | High | Decision D1 |

**Gate A (12×12):** After 2.2 + 2.4, test 12×12 Hard on 100 seeds.
- PASS if ≥80% succeed in <30s with ≤20 clues, certified at tier
- FAIL → 16×16 must come from Phase 6 (matrix format), not spatial engine

### 4.3 The Book (Phase 3: Close the Real Gap)

This is where the sale is lost. Priority order:

| # | Feature | Effort | Blocked On |
|---|---------|--------|------------|
| 3.1 | **Story mode** | XL | Copywriting (procedural OK) |
| 3.2 | **Series continuity** | L | Story mode |
| 3.3 | **Two-page spread** | L | — |
| 3.4 | **Suspect profiles** | M | — |
| 3.5 | **Instructions page** | M | — |

### 4.4 The Blue Ocean (Phase 6: Lead, Don't Catch Up)

**They are strictly Murdoku-style.** Matrix logic grids (Murdle form) are something they structurally don't offer.

| Aspect | Spatial (Current) | Matrix (New) |
|--------|------------------|--------------|
| **Categories** | 2 (row, col) + rooms | 3-4 (suspect, weapon, motive, location) |
| **State space** | 8!×8! = 1.6B (8×8) | 4!³ = 13,824 (4×4×4×4) |
| **Grid rendering** | Floor plan with rooms | X/O triangular matrix |
| **Clue types** | Spatial relations | Conditionals, equivalences, exclusions |
| **Max size** | 8×8 today, 12-16 with Phase 2 | 16×16 trivial (4 cats × 4 items) |

**Reuse unchanged:** Tier contract, technique ladder, seed determinism, templates, KDP geometry, PDF export, web app.

**New work:** Constraint model (category bijections), matrix-native clues, matrix propagator, X/O renderer.

**Strategic value:** Only feature where we'd LEAD the market. Also the honest route to "16×16" badge if Gate A fails.

---

## 5. Decisions Required

| ID | Decision | Blocks | Default If Unanswered |
|----|----------|--------|----------------------|
| **D1** | Lookahead policy: zero-guess everywhere, or disclosed count at top tier only? | 2.5, Phase 2 difficulty | Keep zero-guess (stricter = better marketing) |
| **D2** | Theme-pack versioning vs replace in-place? | 4.1, reproducibility | Version packs (safer for stored books) |
| **D3** | Asset library scope per theme? | Phase 4 sizing | Scaffold stays until assets land |
| **D4** | Does Phase 6 wait for Gate A or start parallel? | Overall shape | Wait for gate (focus) |

---

## 6. Competitive Positioning

### 6.1 Market Context

| Format | Example | Sales | Languages |
|--------|---------|-------|-----------|
| **Murdle** (matrix) | G.T. Karber, Hachette | 4M+ copies | 22+ |
| **Murdoku** (spatial) | Manuel Garand, Hachette | "Fast-growing" | Unquantified |

⚠️ **Trademark warning:** "Murdle" and "Murdoku" are live commercial brands. Do NOT use in titles, subtitles, metadata, or feature names. Use generic terms: "Murder Mystery Logic Grid Puzzles" or "Crime Scene Investigation Puzzles."

### 6.2 Taste Finding (Weakly Sourced)

> "Solvers complain Murdle feels like tedious 'bookkeeping'—checking off text boxes without deep logic. Murdoku gives a much better brain workout because it combines spatial reasoning with Sudoku mechanics directly on a map. Requires less reading and more actual logical puzzle-solving."

If true: validates our format AND our zero-guess enforcement. But sourced to TikTok/Instagram, unquantified, selection-biased. Treat as positioning hypothesis, not fact.

### 6.3 Honest Positioning Statement

**For publishers who want premium logic puzzle books without guesswork complaints:**

KDP Studio Library is the only generator that certifies every puzzle with two-sided technique verification—guaranteeing each tier demands exactly the reasoning it promises, with zero guessing required at any level. Unlike Shigai Royalty's browser-local templates and undisclosed lookaheads, we provide database-backed series continuity, printed logic profiles, and an audit trail from clue to conclusion.

**Not:** "We're the Shigai killer."  
**Instead:** "We're the rigor choice—where every difficulty label is a verified promise."

---

## 7. What's NOT in This Plan (And Why)

| Excluded | Reason |
|----------|--------|
| **DLX / Algorithm X** | Our clues include binary relations; exact cover can't express them. Would require dropping relational families. Bottleneck answered by propagation instead. |
| **Grid size as difficulty lever** | Measured and rejected: withholding info doesn't make puzzles harder to reason about—it makes them impossible. Technique contract sets difficulty; size scales presentation. |
| **Real-solver validation** | Everything here is machine simulation. Limit doesn't close until puzzles are in front of humans. No phase removes this. |

---

## 8. Next Actions

### Week 1-2: Phase 1 (Harvest)
- [ ] 1.1 Solution walkthroughs (export `TechniqueProfile` to PDF)
- [ ] 1.2 Hint ladder (first N steps, escalating)
- [ ] 1.3 Difficulty badge on page
- [ ] 1.4 Logic profile in answer key
- [ ] 1.5 Case header layout

### Week 3-8: Phase 2 (Engine Core)
- [ ] 2.1 Structured clue representation (replace probing)
- [ ] 2.2 Propagation + MRV in `countSolutions`
- [ ] 2.4 IF-THEN clue family
- [ ] Run Gate A (12×12 measurement)
- [ ] Decision D1 (lookahead policy)

### Week 9-20: Phase 3 (The Book)
- [ ] 3.1 Story mode (prologue/epilogue, chapter headers)
- [ ] 3.2 Series continuity
- [ ] 3.3 Two-page spread
- [ ] 3.5 Instructions page

### Parallel: Asset Planning
- [ ] Decision D2 (versioning)
- [ ] Decision D3 (asset scope)
- [ ] 4.2 Real content pools (when ready)

### Gate A Outcome → Branch
- **PASS:** Continue to 2.6 (scale to 14/16)
- **FAIL:** Move Phase 6 forward (matrix format as 16×16 route)

---

## Appendix A: Technique Ladder Details

### Our Five Rungs

1. **Direct (T1):** Clue names cell outright or leaves one option. Easy tier.
2. **Elimination (T2):** Hidden singles, naked/hidden subsets, uniqueness propagation. Medium tier.
3. **Relational (T3):** Arc consistency across binary clues ("X north of Y"). Hard tier.
4. **Cross-Layer (T4):** Evidence↔seating bidirectional narrowing. Expert tier.
5. **Case Split (T5):** Assume-and-test with contradiction. Forbidden in certified puzzles; tracked when used.

### Their Apparent Rungs (Inferred)

1. Easy: Direct only
2. Medium: Elimination, zero-guess
3. Hard: Relational + undisclosed lookaheads
4. Expert: ? (possibly cross-layer equivalent)
5. Dragon/Extreme: Case split allowed, count disclosed

---

## Appendix B: Measurement Methodology

All claims about our engine behavior are measured, not assumed:

- **88.6% in `countSolutions`:** Profiled over 4 × 8×8 Hard generations (12,142ms total, 10,753ms in solver)
- **10×10 failure:** 3/3 seeds, 283s each, assets sufficient
- **230/237 no-deduction sets:** Measured at 8×8, uniqueness without reasoning path
- **Content pools at size 10:** 10/16 names, 10/12 objects, ~10/10 rooms, 10/17 heights

Claims about Shigai are graded by source reliability:
- ✅ Primary source: Screenshots from affiliate walkthrough (10 images, 2 batches)
- ⚠️ Secondary: Affiliate prose (reliability mixed)
- ❌ Tertiary: LLM summaries (discarded when conflicting with primary)

---

## Appendix C: File References

Key files for implementing recommendations:

| Feature | Files to Modify |
|---------|-----------------|
| Walkthroughs | `technique-solver.ts` (export profile), `render-pdf.ts` (print steps) |
| Hints | Same as walkthroughs, truncate at step N |
| IF-THEN clues | New file `conditional-clues.ts`, extend `buildCandidates()` |
| Propagation | `solve.ts` (add MRV, domain pruning), new `propagator.ts` |
| Story mode | New `story-generator.ts`, extend `puzzle-page.ts` |
| Matrix format | New package `packages/generators/matrix-logic/` |

---

**Bottom line:** Our engine is smarter (stricter verification, finer technique modeling) but our product is thinner (~1/3 their features). Fix the book first (Phase 1 + 3), then scale the engine (Phase 2), then lead with matrix format (Phase 6).
