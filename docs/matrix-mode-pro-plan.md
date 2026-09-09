# Matrix Mode — Strategic Implementation Plan

**Date:** 2026-01-04  
**Status:** Proposed (Pro Plan Feature)  
**Codename:** Matrix Mode (NOT "Murdle Mode" — trademark risk)

---

## Executive Summary

**Matrix Mode** is a new puzzle format that will be exclusive to the Pro tier of KDP Studio Library. It generates classic matrix logic-grid puzzles (3-4 categories with X/O elimination grids), a format our direct competitor Shigai Royalty does NOT offer.

This is our **blue ocean strategy**: instead of catching up on their features, we lead with something they structurally cannot match.

---

## 1. What Is Matrix Mode?

### 1.1 The Format (Murdle-Style, Generic Name)

Matrix logic puzzles differ from our current spatial-grid (Murdoku-style) puzzles:

| Aspect | Spatial Grid (Current) | Matrix Grid (New) |
|--------|----------------------|-------------------|
| **Categories** | 2 (row, column) + rooms as visual overlay | 3-4 independent categories (e.g., Suspect, Weapon, Location, Motive) |
| **Grid Size** | 6×6 to 8×8 floor plan | 4×4×4×4 = 13,824 state space (trivial for solver) |
| **Rendering** | Floor plan with room boundaries | X/O triangular matrix or parallel grids |
| **Clue Types** | Spatial relations ("north of", "adjacent") | Conditionals, equivalences, exclusions ("X was not Y", "If A then B") |
| **Solving Experience** | Spatial reasoning + Sudoku-like placement | Cross-category elimination bookkeeping |
| **Max Practical Size** | 8×8 today, 12-16 with engine upgrades | 16×16+ trivial (4 cats × 4 items each) |

### 1.2 Why This Matters

1. **Competitive Moat:** Shigai Royalty is "strictly a Murdoku-style generator" (per their own positioning). They cannot add matrix puzzles without rewriting their entire engine.

2. **Market Validation:** Murdle (G.T. Karber, Hachette) has sold 4M+ copies in 22+ languages. The market exists and is proven.

3. **Technical Advantage:** Our existing infrastructure (tier contract, technique ladder, seed determinism, PDF export, KDP geometry) reuses 80% unchanged.

4. **Pro Tier Justification:** This is a premium feature that justifies upgrading from Free/Basic to Pro.

---

## 2. Trademark Safety

⚠️ **CRITICAL:** Do NOT use these terms anywhere in code, UI, metadata, or marketing:

- ❌ "Murdle" (G.T. Karber / Hachette trademark)
- ❌ "Murdoku" (Manuel Garand / Hachette trademark)
- ❌ "Logic Grid Puzzles" as a standalone brand name (too generic, but safe)

✅ **Safe Terms:**

- "Matrix Mode" (our internal codename, consumer-facing feature name)
- "Matrix Logic Puzzles"
- "Cross-Category Logic Puzzles"
- "Deduction Matrix"
- "Crime Scene Matrix"

**Legal Principle:** Describe the format generically. Never reference competing brands. Our mode is a "matrix logic puzzle generator" — that's a category description, not a brand appropriation.

---

## 3. Technical Architecture

### 3.1 Reuse Unchanged (80%)

The following components require NO modification:

| Component | Reuse Level | Notes |
|-----------|-------------|-------|
| `@kdp/shared` schemas | 90% | Add new puzzle type enum, reuse difficulty tiers, trim sizes, color options |
| Database models (`@kdp/db`) | 100% | `Book`, `Puzzle`, `GenerationJob` are format-agnostic |
| Seed determinism | 100% | Same PRNG, same seed-to-solution pipeline |
| Tier contract system | 100% | Easy/Medium/Hard/Expert/Extreme ladder applies identically |
| Technique solver architecture | 70% | Same structure, new propagation rules for matrix constraints |
| PDF export pipeline | 80% | New renderer for matrix grids, same pagination/cover logic |
| Web dashboard UI | 90% | New puzzle type selector, same project management |
| Worker job queue | 100% | Format-agnostic job processing |

### 3.2 New Work Required (20%)

#### Phase 1: Constraint Model (Core Engine)

**File:** `packages/generators/matrix-logic/src/constraints.ts`

```typescript
// Category bijection: each item in category A maps to exactly one item in category B
interface CategoryConstraint {
  categoryId: string; // e.g., "suspects", "weapons", "locations", "motives"
  items: string[];    // e.g., ["Ashford", "Bancroft", "Cromwell", "Drake"]
}

// The solution is a set of bijections between all category pairs
type MatrixSolution = Record<string, Record<string, string>>;
// e.g., { "suspects": { "Ashford": "Revolver", "Bancroft": "Poison", ... } }
```

**Key Difference from Spatial:**
- Spatial: one bijection (suspects ↔ cells) with room overlay
- Matrix: N bijections (suspects ↔ weapons ↔ locations ↔ motives)

#### Phase 2: Clue Families (Matrix-Native)

**File:** `packages/generators/matrix-logic/src/clues.ts`

New clue types (not available in spatial mode):

| Type | Example | Constraint Form |
|------|---------|-----------------|
| **Exclusion** | "Ashford did not use the Revolver" | `solution.suspects["Ashford"] !== "Revolver"` |
| **Equivalence** | "The person in the Library used Poison" | `solution.locations["Library"] === solution.weapons[person]` |
| **Conditional** | "If Bancroft was in the Study, then Drake had the Candlestick" | `if (loc["Bancroft"] === "Study") → weapon["Drake"] === "Candlestick"` |
| **Negated Conditional** | "The person with the Revolver was NOT in the Kitchen" | `weapon[person] === "Revolver" → loc[person] !== "Kitchen"` |
| **Pairing** | "Cromwell and the person with the Dagger were in adjacent rooms" | Requires ordering category |

**Implementation Strategy:**
- Each clue type has a `generate()` function that creates valid clues from the solution
- Each clue type has a `propagate()` function for the solver
- Clue selection follows same escalation policy as spatial (Easy starts with exclusions, Extreme uses conditionals)

#### Phase 3: Matrix Propagator (Solver Core)

**File:** `packages/generators/matrix-logic/src/propagator.ts`

Adapt our existing `technique-solver.ts`:

```typescript
interface DomainState {
  // For each pair of categories, track possible mappings
  // suspects × weapons: 4×4 boolean matrix
  // suspects × locations: 4×4 boolean matrix
  // etc.
  possibilities: Record<string, Record<string, boolean[]>>;
}

class MatrixPropagator {
  // Mark impossible: Ashford ≠ Revolver
  exclude(categoryA: string, itemA: string, categoryB: string, itemB: string): void;
  
  // Mark certain: Ashford = Library → exclude all other locations for Ashford
  confirm(categoryA: string, itemA: string, categoryB: string, itemB: string): void;
  
  // Run AC-3 across all category pairs
  propagate(): boolean; // returns false if contradiction found
}
```

**Key Optimization:** Matrix puzzles have MUCH smaller state space than spatial grids. A 4×4×4×4 puzzle has only 13,824 possible states vs 8!×8! = 1.6B for spatial 8×8. This means:
- Faster solving (milliseconds, not seconds)
- Larger grids feasible (5×5×5×5 = 144M still tractable)
- More complex clues viable

#### Phase 4: Matrix Renderer (PDF Export)

**File:** `packages/generators/matrix-logic/src/render-pdf.ts`

Two rendering styles:

**Style A: Triangular Matrix (Classic)**
```
        | Ashford | Bancroft | Cromwell | Drake
--------+---------+----------+----------+------
Revolver|    O    |     X    |     X    |   X
Poison  |    X    |     O    |     X    |   X
...
```

**Style B: Parallel Grids (Murdle-Style)**
- One grid per category pair (Suspects×Weapons, Suspects×Locations, etc.)
- Cleaner for larger puzzles
- More pages but clearer solving experience

**Layout Options:**
- Single-page compact (4×4 fits easily)
- Two-page spread (puzzle left, clues right) — matches Shigai's premium layout
- Large-print edition (forces spread, text ≥16pt)

#### Phase 5: Answer Key & Walkthroughs

**File:** `packages/generators/matrix-logic/src/answer-key.ts`

Reuse existing walkthrough infrastructure:

```typescript
interface MatrixWalkthroughStep {
  stepNumber: number;
  technique: "exclusion" | "equivalence" | "conditional" | "chain";
  description: string; // "Since Ashford wasn't in Library or Study, and..."
  deduction: { 
    categoryA: string; 
    itemA: string; 
    categoryB: string; 
    itemB: string; 
    certainty: boolean; // true = confirmed, false = excluded
  };
}
```

Print in answer key section (same as spatial mode).

---

## 4. Difficulty Tiers for Matrix Mode

Reuse the SAME five-tier ladder, mapped to matrix-native techniques:

| Tier | Reasoning Required | Clue Types Used | Max Categories |
|------|-------------------|-----------------|----------------|
| **Easy** | Direct exclusions only | "X was not Y" statements | 3 categories |
| **Medium** | Counting arguments | Exclusions + simple equivalences | 3 categories |
| **Hard** | Cross-category chaining | Equivalences + basic conditionals | 3-4 categories |
| **Expert** | Multi-step conditionals | "If A then B" + negated conditionals | 4 categories |
| **Extreme** | Long conditional chains | Nested conditionals, pairing clues | 4 categories |

**Tier Contract Enforcement:** Same two-sided certification as spatial mode:
- Verify puzzle solves at target tier with zero guesses
- Verify puzzle does NOT solve at lower tier
- Record logic profile (techniques used, chain length)

---

## 5. Integration Points

### 5.1 Database Schema (No Changes Required)

Existing models support matrix puzzles out of the box:

```prisma
model Puzzle {
  id          String   @id @default(cuid())
  bookId      String
  book        Book     @relation(fields: [bookId], references: [id])
  seed        Int
  gridSize    Int      // For matrix: encoded as category count (e.g., 4 = 4 categories)
  difficulty  String   // Same 5-tier enum
  puzzleType  String   // NEW: "spatial" | "matrix"
  solution    Json     // Format differs by type, but JSON handles both
  clues       Json     // Array of clue objects, type-specific structure
  verifiedAt  DateTime
  createdAt   DateTime @default(now())
  
  @@unique([bookId, seed])
}
```

### 5.2 Shared Schemas (Minor Updates)

**File:** `packages/shared/src/schemas/grid-mystery.ts`

Add puzzle type discriminator:

```typescript
export const puzzleTypeSchema = z.enum(["spatial", "matrix"]);
export type PuzzleType = z.infer<typeof puzzleTypeSchema>;

export const matrixInputSchema = z.object({
  title: z.string().trim().min(1).max(120),
  // Instead of gridSize, specify categories
  categories: z.number().int().min(3).max(5), // 3-5 categories
  itemsPerCategory: z.number().int().min(3).max(6), // 3-6 items each
  difficulty: z.preprocess(normalizeDifficultyTier, z.enum(DIFFICULTY_TIER_IDS)),
  // ... rest similar to spatial (theme, trimSize, puzzleCount, etc.)
});

// Union type for API
export const puzzleBookInputSchema = z.discriminatedUnion("puzzleType", [
  z.object({ puzzleType: z.literal("spatial"), ...gridMysteryInputSchema.shape }),
  z.object({ puzzleType: z.literal("matrix"), ...matrixInputSchema.shape }),
]);
```

### 5.3 Web UI (New Components)

**File:** `apps/web/src/components/matrix-mode-selector.tsx`

```tsx
// Only visible to Pro users
export function MatrixModeSelector({ userPlan }: { userPlan: UserPlan }) {
  if (userPlan.tier !== "pro") {
    return (
      <LockedFeatureCard
        title="Matrix Mode"
        description="Generate classic matrix logic puzzles with 3-4 categories"
        upgradeRequired="pro"
      />
    );
  }
  
  return (
    <ToggleGroup value={puzzleType} onValueChange={setPuzzleType}>
      <ToggleGroupItem value="spatial">Spatial Grid</ToggleGroupItem>
      <ToggleGroupItem value="matrix">Matrix Mode</ToggleGroupItem>
    </ToggleGroup>
  );
}
```

### 5.4 Worker Job Handler

**File:** `apps/worker/src/jobs/generate-matrix-book.ts`

Mirror existing spatial handler:

```typescript
export async function generateMatrixBook(job: GenerationJob) {
  const input = matrixInputSchema.parse(job.inputParams);
  
  const puzzles: MatrixPuzzle[] = [];
  for (let i = 0; i < input.puzzleCount; i++) {
    const seed = job.seed + i;
    const puzzle = await generateMatrixPuzzle(input, seed);
    puzzles.push(puzzle);
  }
  
  const pdf = await renderMatrixPdf(puzzles, input);
  await uploadToS3(pdf, job.bookId);
  
  await db.generationJob.update({
    where: { id: job.id },
    data: { status: "completed", pdfUrl: pdf.url },
  });
}
```

---

## 6. Pro Tier Gating Strategy

### 6.1 Feature Matrix

| Feature | Free | Basic ($9/mo) | Pro ($29/mo) |
|---------|------|---------------|--------------|
| Spatial puzzles (6×6-8×8) | ✅ 1 book/mo | ✅ 10 books/mo | ✅ Unlimited |
| Matrix puzzles (3-4 cats) | ❌ | ❌ | ✅ Unlimited |
| Story mode | ❌ | ❌ | ✅ |
| Series continuity | ❌ | ❌ | ✅ |
| Custom cast upload | ❌ | ✅ | ✅ |
| Templates library | ❌ | ✅ | ✅ |
| Priority generation queue | ❌ | ❌ | ✅ |
| Walkthroughs & hints | ❌ | ✅ | ✅ |

**Rationale:** Matrix Mode is a Pro-exclusive because:
1. It's a fundamentally different puzzle format (not just an upgrade)
2. It requires significant R&D investment (this plan)
3. It's our competitive moat (Shigai doesn't have it)
4. It justifies the Pro tier price point

### 6.2 Upgrade Funnel UX

When Free/Basic users try to access Matrix Mode:

```tsx
<Modal
  title="Matrix Mode — Pro Feature"
  description="Generate classic matrix logic puzzles with 3-4 categories, 
               conditionals, and cross-category chaining."
  benefits={[
    "3-4 independent categories (Suspects, Weapons, Locations, Motives)",
    "Classic X/O elimination grid format",
    "Conditional clues ('If A then B')",
    "Larger puzzles (up to 5×5×5×5)",
    "Same zero-guess guarantee as spatial mode"
  ]}
  cta="Upgrade to Pro — $29/mo"
/>
```

---

## 7. Development Roadmap

### Phase 1: Foundation (Weeks 1-2)
- [ ] Create `packages/generators/matrix-logic/` directory structure
- [ ] Implement constraint model (`constraints.ts`)
- [ ] Build basic propagator (`propagator.ts`)
- [ ] Write unit tests for constraint propagation

### Phase 2: Clue System (Weeks 3-4)
- [ ] Implement clue families (`clues.ts`): exclusion, equivalence, conditional
- [ ] Build clue generator (solution → valid clues)
- [ ] Integrate with tier contract system
- [ ] Test deducibility grading

### Phase 3: Solver Integration (Weeks 5-6)
- [ ] Adapt `technique-solver.ts` for matrix constraints
- [ ] Implement AC-3 worklist for matrix domains
- [ ] Add MRV heuristic for matrix solving
- [ ] Benchmark solve times (target: <100ms for 4×4×4×4)

### Phase 4: PDF Renderer (Weeks 7-8)
- [ ] Create matrix grid renderer (`render-pdf.ts`)
- [ ] Implement triangular matrix layout
- [ ] Implement parallel grids layout
- [ ] Add answer key with walkthroughs
- [ ] Test KDP print specs (margins, bleed, spine)

### Phase 5: UI Integration (Weeks 9-10)
- [ ] Add puzzle type selector to Generate tab
- [ ] Build Pro gating modal
- [ ] Update dashboard to show puzzle type badges
- [ ] Add matrix-specific customization options

### Phase 6: Testing & Calibration (Weeks 11-12)
- [ ] Generate 100 puzzles per tier (3-4 categories)
- [ ] Verify uniqueness (100% pass rate required)
- [ ] Verify deducibility (≥90% at target tier)
- [ ] Human playtesting (recruit 5-10 beta testers)
- [ ] Calibrate tier boundaries based on feedback

**Total Timeline:** 12 weeks (3 months) to MVP  
**Team:** 1-2 engineers full-time

---

## 8. Success Metrics

### 8.1 Technical KPIs

| Metric | Target | Measurement |
|--------|--------|-------------|
| Uniqueness proof rate | 100% | Solver verifies exactly 1 solution |
| Deducibility at tier | ≥90% | Puzzle solvable with zero guesses at target tier |
| Solve time (4×4×4×4) | <100ms | Generator verification step |
| PDF render time | <2s per puzzle | Worker job duration |
| Crash rate | 0% | No unhandled exceptions in 1000 runs |

### 8.2 Product KPIs

| Metric | Target (First 90 Days) |
|--------|------------------------|
| Pro tier conversions | +15% of active Free users |
| Matrix puzzle usage | 40% of Pro user projects |
| Customer satisfaction | ≥4.5/5 stars (reviews mentioning "matrix") |
| Refund requests | <2% of Pro subscriptions |

### 8.3 Competitive KPIs

| Metric | Current vs Shigai | Post-Launch Target |
|--------|------------------|---------------------|
| Feature parity | 1/3 their features | Lead in 1 category (matrix) |
| Differentiation | "Stricter engine" | "Only platform with both formats" |
| Market positioning | "Rigor choice" | "Rigor + versatility choice" |

---

## 9. Risks & Mitigations

### Risk 1: Trademark Infringement
**Scenario:** Hachette (Murdle owner) sends C&D over "Matrix Mode"  
**Probability:** Low (generic term)  
**Mitigation:**
- Use only generic descriptors in marketing
- Never mention "Murdle" or "Murdoku" in code/docs
- Legal review before launch
- Prepare rebrand contingency ("Deduction Matrix" as backup name)

### Risk 2: Engine Performance Issues
**Scenario:** Matrix solver slower than expected at 5×5×5×5  
**Probability:** Medium  
**Mitigation:**
- Cap initial release at 4 categories × 4 items
- Profile and optimize propagator before launch
- Fallback to DLX (Algorithm X) if propagation fails
- Set node budget (10K nodes max) with graceful degradation

### Risk 3: Low Pro Conversion
**Scenario:** Users don't upgrade for Matrix Mode  
**Probability:** Medium  
**Mitigation:**
- Bundle Matrix + Story Mode as "Pro Pack"
- Offer 7-day Pro trial with Matrix access
- Create sample matrix puzzle books (free downloads)
- Marketing campaign: "The puzzle format Shigai can't match"

### Risk 4: Quality Issues (Non-Unique Solutions)
**Scenario:** Bugs cause puzzles with multiple solutions  
**Probability:** Low (we have verification)  
**Mitigation:**
- Double-verification: generator + independent checker
- Log all failures to Sentry with full puzzle state
- Beta test with 50 users before public launch
- Money-back guarantee for defective puzzles

---

## 10. Go-to-Market Strategy

### 10.1 Launch Messaging

**Headline:** "The Logic Puzzle Format Your Competitors Don't Have"

**Body:**
> KDP Studio Library now supports Matrix Mode — the classic deduction puzzle format made famous by bestsellers like Murdle. Generate 3-4 category logic puzzles with conditional clues, cross-category chaining, and the same zero-guess guarantee our spatial puzzles are known for.
>
> Available exclusively in Pro tier.

**Social Proof:**
- "Finally, a generator that does BOTH spatial AND matrix puzzles!" — Beta tester
- "The conditional clues make Extreme tier genuinely challenging" — Beta tester

### 10.2 Content Marketing

1. **Blog Post:** "Spatial vs Matrix: Which Logic Puzzle Format Is Right for Your Book?"
2. **YouTube Tutorial:** "Creating Your First Matrix Logic Puzzle Book (10 min)"
3. **Sample Book:** Free download: "10 Matrix Puzzles — Easy to Extreme" (lead magnet)
4. **Comparison Page:** "KDP Studio vs Shigai Royalty vs Murdle" (honest feature matrix)

### 10.3 Pricing Psychology

**Current Pro Tier:** $29/mo (assumed)  
**Value Anchor:** "Less than one hour of freelance puzzle writing ($50-100/puzzle)"  
**ROI Frame:** "Generate 30 puzzles in 5 minutes vs 30 hours manually"

**Upsell Script:**
> "You're generating 8 spatial books/month. With Matrix Mode, you could publish 4 spatial + 4 matrix books, doubling your catalog without doubling your work. That's $X additional monthly royalty potential for $29."

---

## 11. Post-Launch Roadmap

### Phase 7: Advanced Features (Months 4-6)
- [ ] 5-category puzzles (5×5×5×5×5)
- [ ] Custom category names (not just suspects/weapons/locations)
- [ ] Themed clue templates (noir, cozy mystery, sci-fi)
- [ ] Variable items per category (e.g., 4 suspects × 5 weapons × 4 locations)

### Phase 8: Hybrid Modes (Months 7-9)
- [ ] "Spatial + Matrix" hybrid books (both formats in one volume)
- [ ] Progressive difficulty within single puzzle (start 3-cat, escalate to 4-cat)
- [ ] Story mode integration (matrix puzzles with narrative framing)

### Phase 9: Platform Expansion (Months 10-12)
- [ ] Interactive web solver (readers solve online, check answers instantly)
- [ ] Mobile app (iOS/Android) for on-the-go puzzle creation
- [ ] API access (third-party tools can generate matrix puzzles programmatically)

---

## 12. Decisions Required

| ID | Decision | Owner | Deadline | Default If Unanswered |
|----|----------|-------|----------|----------------------|
| **D1** | Approve "Matrix Mode" as consumer-facing name? | Product | Week 1 | Proceed with name, legal review parallel |
| **D2** | Pro tier pricing confirmation ($29/mo assumed)? | Business | Week 1 | Keep $29/mo |
| **D3** | Max categories at launch (4 or 5)? | Engineering | Week 2 | Cap at 4 (safer) |
| **D4** | Beta tester recruitment strategy? | Marketing | Week 3 | Recruit from existing power users |
| **D5** | Launch date target? | Product | Week 1 | 12 weeks from kickoff |

---

## 13. Appendix: Example Matrix Puzzle

### 13.1 Setup

**Categories (4):**
- Suspects: Ashford, Bancroft, Cromwell, Drake
- Weapons: Revolver, Poison, Dagger, Candlestick
- Locations: Library, Study, Kitchen, Conservatory
- Motives: Revenge, Greed, Jealousy, Blackmail

### 13.2 Clues (Extreme Tier)

1. "Ashford did not use the Revolver." (Exclusion)
2. "The person in the Library used Poison." (Equivalence)
3. "If Bancroft was in the Study, then Drake had the Candlestick." (Conditional)
4. "The person motivated by Greed was NOT in the Kitchen." (Negated Conditional)
5. "Cromwell and the person with the Dagger were in adjacent rooms." (Pairing — requires room ordering)

### 13.3 Solution (Hidden Until Solved)

```
Ashford    → Poison    → Library     → Revenge
Bancroft   → Dagger    → Study       → Greed
Cromwell   → Revolver  → Conservatory→ Jealousy
Drake      → Candlestick→ Kitchen    → Blackmail
```

### 13.4 Killer Deduction

"The victim was found in the Library. Whoever shared that room with the victim is the murderer. Ashford was in the Library. **Ashford is the killer.**"

---

## 14. Conclusion

Matrix Mode is our strategic wedge into the premium puzzle book market. It:

✅ Differentiates us from Shigai Royalty (they don't have it)  
✅ Validates against proven market demand (Murdle: 4M+ sales)  
✅ Leverages existing infrastructure (80% reuse)  
✅ Justifies Pro tier pricing ($29/mo)  
✅ Opens new revenue streams (hybrid books, story mode integration)  

**Recommendation:** Proceed with Phase 1 immediately. Target launch: 12 weeks from kickoff.

---

**Document History:**
- v1.0 (2026-01-04): Initial draft
- Reviewers: [Pending]
- Approved: [Pending]
