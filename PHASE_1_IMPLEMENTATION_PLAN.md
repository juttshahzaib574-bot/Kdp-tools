# Phase 1 Implementation Plan: Harvest Low-Hanging Fruit

## Overview

**Goal:** Close real customer-facing gaps using work the engine already does. Every item below derives from data we already compute but currently throw away.

**Timeline:** 1-2 weeks
**Risk:** Low — all features use existing computed data
**Impact:** High — matches competitor feature set that customers expect

---

## Item 1.1: Solution Walkthroughs

### What It Is

Step-by-step deduction path showing exactly how to solve the puzzle, with technique names for each step.

**Example output:**
```
Solution Walkthrough — Puzzle #47 (Hard)

Step 1 (Direct): Fenna Doyle was in the 3rd column → Only cell (2,2) possible
Step 2 (Elimination): Row 4 has only one remaining candidate → Priya Marsh must be there
Step 3 (Relational): Fenna is north of Priya → Confirms placement
Step 4 (Cross-Layer): The ledger was in row 3 → Only Fenna can carry it → She's in row 3
...
Final: Grid complete. Culprit: whoever shared victim's room = [Name]
```

### Why Now

- **Competitor ships this:** Shigai claims "step-by-step solution"
- **Murdle ships this:** Their hallmark feature
- **We already compute it:** `technique-solver.ts` derives the full path in `solveByTechnique()`
- **Currently thrown away:** Only `logicProfile.summary` string is kept; full deduction sequence discarded

### Technical Implementation

**Data source:** `technique-solver.ts` needs to return full deduction log, not just summary.

```typescript
// Current TechniqueProfile (technique-solver.ts:52-63)
export interface TechniqueProfile {
  hardest: Technique;
  splits: number;
  longestChain: number;
  solved: boolean;
  used: Technique[];
}

// Need to add:
export interface DeductionStep {
  technique: Technique;
  description: string;  // Human-readable: "Fenna Doyle was in the 3rd column"
  suspectId?: string;
  cell?: Cell;        // If placement made
  eliminated?: Array<{suspectId: string, cell: Cell}>;  // If eliminations made
  clueText?: string;  // Which clue triggered this
}

export interface TechniqueProfile {
  // ... existing fields
  steps: DeductionStep[];  // NEW: Full deduction sequence
}
```

**Modify propagate() to log steps:**

```typescript
// technique-solver.ts:621-692 — propagate() function
interface PropagationResult {
  contradiction: boolean;
  solved: boolean;
  used: Set<Technique>;
  longestChain: number;
  steps: DeductionStep[];  // NEW
}

function propagate(...): PropagationResult {
  const steps: DeductionStep[] = [];
  
  // In each technique application:
  if (applyHiddenSingles(...)) {
    steps.push({
      technique: "elimination",
      description: `${suspect.name} must be in ${ordinal(row+1)} row`,
      suspectId: id,
      cell: placedCell,
    });
  }
  
  return { contradiction, solved, used, longestChain, steps };
}
```

**Store on puzzle:**

```typescript
// types.ts:176-185 — GridMysteryPuzzle.logicProfile
export interface GridMysteryPuzzle {
  // ... other fields
  logicProfile: {
    solvedAt: "direct" | "elimination" | "relational" | "crossLayer";
    chain: number;
    techniques: readonly string[];
    summary: string;
    walkthrough?: DeductionStep[];  // NEW: Optional, included when generated with proof
  };
}
```

**Render in PDF:**

```typescript
// render-pdf.ts — New page type: "walkthrough"
function renderWalkthroughPage(pdfDoc, puzzle, pageIndex) {
  const page = pdfDoc.addPage([dimensions.width, dimensions.height]);
  
  drawHeader(page, `${puzzle.caseTitle} — Solution Walkthrough`);
  
  puzzle.logicProfile.walkthrough?.forEach((step, i) => {
    const y = startY - i * 25;
    page.drawText(`Step ${i+1} (${capitalize(step.technique)}): ${step.description}`, {
      x: margin,
      y,
      size: 10,
      font: fonts.body,
    });
    
    // Optionally show mini-grid state here
  });
}
```

### Files to Modify

| File | Changes |
|------|---------|
| `packages/generators/grid-mystery/src/technique-solver.ts` | Add `DeductionStep` type, modify `propagate()` to log steps, update `TechniqueProfile` |
| `packages/generators/grid-mystery/src/types.ts` | Add `walkthrough` field to `logicProfile` |
| `packages/generators/grid-mystery/src/render-pdf.ts` | Add walkthrough page renderer |
| `apps/web/src/components/page-arranger.tsx` | Add walkthrough to available page types |
| `apps/shared/src/page-types.ts` | Register new built-in page key |

### Acceptance Criteria

- [ ] Every generated puzzle includes full deduction sequence when generated with `generateWithProof()`
- [ ] Walkthrough renders as optional back-matter page in PDF
- [ ] Each step names the technique and shows what was deduced
- [ ] Steps are in solving order (not just techniques used)
- [ ] Works for all difficulty tiers including cross-layer puzzles

---

## Item 1.2: Hint Ladder

### What It Is

Escalating hints: first N steps of the walkthrough, revealed progressively.

**Example UI:**
```
💡 Hint 1/3: Start with Fenna Doyle — she has a direct clue about her column
[Show Hint 1]

💡 Hint 2/3: After placing Fenna, count who can go in row 4...
[Show Hint 2]

💡 Hint 3/3: The evidence block tells you who carries the ledger...
[Show Hint 3]
```

### Why Now

- **Market expects it:** Murdle ships one hint per puzzle; competitors offer escalating hints
- **Same source as walkthrough:** Uses `logicProfile.walkthrough` from 1.1
- **Cheap to implement:** Just slice the walkthrough array
- **Adds perceived value:** Makes puzzles feel supported, not abandoned

### Technical Implementation

**Generate hints from walkthrough:**

```typescript
// New utility function
export function generateHints(walkthrough: DeductionStep[], maxHints = 3): Hint[] {
  if (walkthrough.length === 0) return [];
  
  const hints: Hint[] = [];
  
  // Group steps into hint "chunks"
  const chunkSize = Math.ceil(walkthrough.length / maxHints);
  for (let i = 0; i < maxHints; i++) {
    const start = i * chunkSize;
    const end = Math.min(start + chunkSize, walkthrough.length);
    const chunk = walkthrough.slice(start, end);
    
    if (chunk.length === 0) break;
    
    hints.push({
      level: i + 1,
      total: maxHints,
      text: summarizeChunk(chunk),  // e.g., "Start with direct clues about columns"
      steps: chunk,  // Full steps if user wants to see them
    });
  }
  
  return hints;
}

export interface Hint {
  level: number;
  total: number;
  text: string;
  steps: DeductionStep[];
}
```

**Store on puzzle:**

```typescript
// types.ts
export interface GridMysteryPuzzle {
  // ... other fields
  hints?: Hint[];  // NEW: Optional, derived from walkthrough
}
```

**Render in PDF (answer key):**

```typescript
// render-pdf.ts — Add to answer key page
function drawAnswerKey(pdfDoc, puzzle) {
  // ... existing answer key content
  
  if (puzzle.hints && puzzle.hints.length > 0) {
    page.drawText("Hints (if you get stuck):", {
      x: margin,
      y: hintY,
      size: 11,
      font: fonts.bold,
    });
    
    puzzle.hints.forEach((hint, i) => {
      page.drawText(`${i+1}. ${hint.text}`, {
        x: margin + 10,
        y: hintY - (i+1) * 18,
        size: 9,
        font: fonts.italic,
      });
    });
  }
}
```

### Files to Modify

| File | Changes |
|------|---------|
| `packages/generators/grid-mystery/src/technique-solver.ts` | Export hint generation utility |
| `packages/generators/grid-mystery/src/types.ts` | Add `hints` field to puzzle type |
| `packages/generators/grid-mystery/src/generate.ts` | Generate hints from walkthrough after solving |
| `packages/generators/grid-mystery/src/render-pdf.ts` | Render hints on answer key page |

### Acceptance Criteria

- [ ] Every puzzle with walkthrough has 3 escalating hints
- [ ] Hints appear on answer key page (not spoiler page)
- [ ] First hint gives starting point without solving
- [ ] Last hint approaches full solution
- [ ] Hint text is human-readable, not raw step dump

---

## Item 1.3: Difficulty Badge on Puzzle Page

### What It Is

Print the tier label directly on the puzzle page header.

**Example:**
```
┌─────────────────────────────────────┐
│ CASE #47                    HARD    │
│ The Vanishing at Valerian Manor     │
│                                     │
│ [Grid diagram here]                 │
│                                     │
│ Suspects:                           │
│ 1. Fenna Doyle                      │
│ ...                                 │
└─────────────────────────────────────┘
```

### Why Now

- **Competitor does this:** Their exported PDF shows difficulty badge
- **We compute it:** `puzzle.difficulty` exists but isn't rendered prominently
- **Reader expectation:** Sudoku and logic puzzle magazines always show difficulty
- **Marketing value:** Shows we stand behind our tier certification

### Technical Implementation

**Current state:** Difficulty is in metadata but not prominently displayed.

**Add to puzzle page header:**

```typescript
// puzzle-page.ts — Modify header drawing
function drawPuzzleHeader(page, puzzle, options) {
  const { difficulty } = puzzle;
  
  // Draw case title
  page.drawText(puzzle.caseTitle || `Case #${puzzleNumber}`, {
    x: margin,
    y: headerY,
    size: 16,
    font: fonts.bold,
  });
  
  // NEW: Draw difficulty badge
  const badgeWidth = 60;
  const badgeHeight = 18;
  const badgeX = pageWidth - margin - badgeWidth;
  const badgeY = headerY + 2;
  
  // Badge background
  page.drawRectangle({
    x: badgeX,
    y: badgeY,
    width: badgeWidth,
    height: badgeHeight,
    borderColor: getDifficultyColor(difficulty),
    borderWidth: 2,
    borderStyle: 'solid',
  });
  
  // Badge text
  page.drawText(difficulty.toUpperCase(), {
    x: badgeX + badgeWidth / 2,
    y: badgeY + badgeHeight / 2,
    size: 10,
    font: fonts.bold,
    color: getDifficultyColor(difficulty),
    align: 'center',
  });
}

function getDifficultyColor(difficulty: Difficulty): RGB {
  switch (difficulty) {
    case 'easy': return rgb(0.2, 0.6, 0.2);    // Green
    case 'medium': return rgb(0.8, 0.8, 0.2);  // Yellow
    case 'hard': return rgb(0.9, 0.5, 0.1);    // Orange
    case 'expert': return rgb(0.9, 0.2, 0.2);  // Red
    case 'extreme': return rgb(0.5, 0.1, 0.5); // Purple
  }
}
```

### Files to Modify

| File | Changes |
|------|---------|
| `packages/generators/grid-mystery/src/puzzle-page.ts` | Add difficulty badge to header |
| `packages/generators/grid-mystery/src/palette.ts` | Add difficulty colors (optional) |

### Acceptance Criteria

- [ ] Difficulty badge appears on every puzzle page top-right
- [ ] Color-coded by tier (green→purple gradient)
- [ ] Text is uppercase, bold, clearly legible
- [ ] Doesn't interfere with case title or grid
- [ ] Prints correctly in B&W (uses patterns or grayscale)

---

## Item 1.4: Logic Profile in Answer Key

### What It Is

Print the full reasoning profile on the answer key page.

**Example:**
```
ANSWER KEY — Case #47

Solution Grid:
[Full solved grid with suspects and objects]

Logic Profile:
• Techniques required: elimination · relational · cross-layer
• Longest deduction chain: 4 steps
• What-if scenarios needed: 0 (purely deductive!)
• Clue count: 8

This puzzle is certified HARD because it requires relational reasoning
(clues played against each other) but cannot be solved by elimination alone.
```

### Why Now

- **Already computed:** `logicProfile.summary`, `chain`, `techniques` all exist
- **Already on review card:** Web UI shows this, but PDF doesn't
- **Makes tier auditable:** Readers can verify the claim, not just trust it
- **Differentiates us:** Nobody else prints the "why" behind difficulty

### Technical Implementation

**Current state:** Logic profile stored on puzzle but not rendered in PDF.

**Add to answer key:**

```typescript
// render-pdf.ts — Modify answer key page
function renderAnswerKey(pdfDoc, puzzle, puzzleNumber) {
  const page = pdfDoc.addPage([dimensions.width, dimensions.height]);
  
  drawHeader(page, `Answer Key — ${puzzle.caseTitle}`);
  drawSolutionGrid(page, puzzle);
  
  // NEW: Logic profile section
  const profileY = gridBottom + 30;
  page.drawText("Logic Profile:", {
    x: margin,
    y: profileY,
    size: 12,
    font: fonts.bold,
  });
  
  const { logicProfile } = puzzle;
  const lines = [
    `• Techniques: ${logicProfile.summary}`,
    `• Longest chain: ${logicProfile.chain} deductions`,
    `• What-ifs: ${logicProfile.splits ?? 0} (this puzzle is purely deductive!)`,
  ];
  
  lines.forEach((line, i) => {
    page.drawText(line, {
      x: margin + 10,
      y: profileY - 18 - (i * 16),
      size: 9,
      font: fonts.body,
      color: rgb(0.3, 0.3, 0.3),
    });
  });
  
  // Optional: One-line explanation of why this tier
  const tierExplanation = getTierExplanation(puzzle.difficulty);
  page.drawText(tierExplanation, {
    x: margin + 10,
    y: profileY - 18 - (lines.length * 16) - 10,
    size: 8,
    font: fonts.italic,
    color: rgb(0.5, 0.5, 0.5),
  });
}

function getTierExplanation(difficulty: Difficulty): string {
  const explanations = {
    easy: "This puzzle is EASY because every clue can be applied directly without combining information.",
    medium: "This puzzle is MEDIUM because it requires counting arguments (a row only one person can occupy).",
    hard: "This puzzle is HARD because clues must be played against each other — one person's options cut down by another's.",
    expert: "This puzzle is EXPERT because the grid cannot be finished without working the evidence block back into seating.",
    extreme: "This puzzle is EXTREME because it requires sustained cross-layer reasoning with a 4+ step deduction cascade.",
  };
  return explanations[difficulty];
}
```

### Files to Modify

| File | Changes |
|------|---------|
| `packages/generators/grid-mystery/src/render-pdf.ts` | Add logic profile section to answer key |
| `packages/generators/grid-mystery/src/tier-contract.ts` | Export tier explanation helper |

### Acceptance Criteria

- [ ] Logic profile appears on every answer key page
- [ ] Shows techniques, chain length, and what-if count
- [ ] Includes one-line explanation of why this tier
- [ ] Formatted distinctly from solution grid
- [ ] Readable at standard print sizes

---

## Item 1.5: Case Header

### What It Is

Every puzzle gets a title, hook line, and legend explaining occupiable/blocked cells.

**Example:**
```
┌──────────────────────────────────────────────┐
│ CASE #47: The Vanishing at Valerian Manor    │
│                                              │
│ "Lady Valerian disappeared during the dinner │
│ party. Six guests were seated that night.    │
│ Find where each guest sat, then determine    │
│ who shared her room."                        │
│                                              │
│ Legend: █ Occupied seat  ░ Blocked cell     │
│                                              │
│ [Grid begins here...]                        │
└──────────────────────────────────────────────┘
```

### Why Now

- **Competitor has this:** Their pages have scene-setting headers
- **Ours doesn't:** Currently just "Case #47" or bare grid
- **Pure layout:** No engine changes, just rendering
- **Adds polish:** Makes puzzles feel authored, not generated

### Technical Implementation

**Generate case titles:**

```typescript
// case-titles.ts — Already exists! Just needs to be used
export function generateCaseTitle(theme: ThemeContent, rng: Rng): string {
  const templates = [
    `The {event} at {location}`,
    `{adjective} {noun} at {location}`,
    `Who {verb} the {object}?`,
  ];
  // ... template filling logic
}
```

**Add hook/prologue:**

```typescript
// New: Generate one-sentence hook
export function generateHook(theme: ThemeContent, difficulty: Difficulty, rng: Rng): string {
  const hooks = [
    `A {time} gathering turns deadly when {victim} is found {circumstance}.`,
    `In the {setting}, only {count} people could have committed the crime.`,
    `The {object} holds the key — but who had access?`,
  ];
  // Fill template with theme-specific tokens
}
```

**Render in PDF:**

```typescript
// puzzle-page.ts — Add header section
function drawCaseHeader(page, puzzle, puzzleNumber) {
  const title = puzzle.caseTitle || `Case #${puzzleNumber}`;
  const hook = puzzle.hook || generateDefaultHook(puzzle);
  
  // Title
  page.drawText(title, {
    x: margin,
    y: headerY,
    size: 16,
    font: fonts.bold,
    maxWidth: pageWidth - (margin * 2),
    align: 'center',
  });
  
  // Hook (if present)
  if (hook) {
    page.drawText(hook, {
      x: margin,
      y: headerY - 25,
      size: 10,
      font: fonts.italic,
      maxWidth: pageWidth - (margin * 2),
      align: 'center',
      lineHeight: 14,
    });
  }
  
  // Legend
  const legendY = headerY - 55;
  page.drawText("Legend:", {
    x: margin,
    y: legendY,
    size: 9,
    font: fonts.bold,
  });
  
  // Draw swatches
  drawSwatch(page, margin + 50, legendY, rgb(0.2, 0.2, 0.2), "Occupied seat");
  drawSwatch(page, margin + 160, legendY, rgb(0.8, 0.8, 0.8), "Blocked cell");
}

function drawSwatch(page, x, y, color, label) {
  page.drawRectangle({
    x,
    y: y - 8,
    width: 16,
    height: 16,
    fillColor: color,
  });
  page.drawText(label, {
    x: x + 22,
    y,
    size: 9,
    font: fonts.body,
  });
}
```

**Store on puzzle:**

```typescript
// types.ts
export interface GridMysteryPuzzle {
  // ... existing fields
  caseTitle?: string;   // NEW: Generated or custom
  hook?: string;        // NEW: One-sentence prologue
}
```

### Files to Modify

| File | Changes |
|------|---------|
| `packages/generators/grid-mystery/src/case-titles.ts` | Enhance to generate hooks alongside titles |
| `packages/generators/grid-mystery/src/types.ts` | Add `caseTitle` and `hook` fields |
| `packages/generators/grid-mystery/src/generate.ts` | Generate title/hook during puzzle creation |
| `packages/generators/grid-mystery/src/puzzle-page.ts` | Render header with title, hook, legend |
| `apps/web/src/components/customize-tab.tsx` | Allow custom title/hook override |

### Acceptance Criteria

- [ ] Every puzzle has a generated case title (theme-appropriate)
- [ ] Every puzzle has a one-sentence hook/prologue
- [ ] Legend explains occupied vs blocked cells
- [ ] Header is visually distinct from grid
- [ ] Custom overrides possible via web UI
- [ ] Titles don't repeat within a book (seed-based uniqueness)

---

## Integration & Testing

### End-to-End Flow

1. **Generation:**
   ```typescript
   const result = generateWithProof({ gridSize: 7, difficulty: 'hard', seed: 12345 });
   // Returns: puzzle + constraints + walkthrough + hints
   ```

2. **Storage:**
   ```typescript
   await db.book.update({
     where: { id: bookId },
     data: {
       puzzles: {
         update: {
           where: { id: puzzleId },
           data: {
             caseTitle: result.puzzle.caseTitle,
             hook: result.puzzle.hook,
             logicProfile: result.puzzle.logicProfile,  // Includes walkthrough
             hints: result.puzzle.hints,
           }
         }
       }
     }
   });
   ```

3. **Rendering:**
   ```typescript
   const pdfBytes = await renderBookPdf(book, {
     includeWalkthroughs: true,
     includeHints: true,
     includeLogicProfiles: true,
   });
   ```

4. **Download:** User gets PDF with all Phase 1 features

### Test Plan

| Test | Type | Expected Result |
|------|------|-----------------|
| Walkthrough solves puzzle | Unit | Following steps reaches solution |
| Hints escalate properly | Unit | Hint 3 is more revealing than Hint 1 |
| Difficulty badge color | Visual | Each tier has distinct color |
| Logic profile matches grade | Integration | Profile equals `gradePuzzle()` output |
| Case title unique in book | Integration | No duplicate titles in 100-puzzle book |
| PDF renders all features | E2E | Downloaded PDF shows all 5 items |
| Override title persists | E2E | Custom title survives regeneration |

### Rollout Strategy

**Week 1:**
- Implement 1.1 (walkthroughs) — largest technical change
- Implement 1.4 (logic profile) — uses same data
- Test both together

**Week 2:**
- Implement 1.2 (hints) — trivial once walkthroughs exist
- Implement 1.3 (badge) — pure rendering
- Implement 1.5 (case header) — pure rendering + title gen
- Full integration test
- Ship to production

---

## Success Metrics

| Metric | Before | After (Target) |
|--------|--------|----------------|
| Features matching competitor | 2/5 | 5/5 |
| Customer-facing gaps closed | 0% | 100% |
| Time to implement | — | <80 hours |
| Code reuse from existing work | — | 100% (no new solvers) |

---

## Risks & Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Walkthrough too verbose | Medium | UX degradation | Limit to 15 steps, collapse repeats |
| Hints give away too much | Low | Spoiler complaints | Test with beta readers before ship |
| Badge color prints poorly in B&W | Medium | Accessibility issue | Use patterns + colors, test grayscale |
| Case titles feel generic | Medium | Perceived quality drop | Expand template bank, add theme-specific tokens |
| PDF bloat from extra pages | Low | File size concerns | Make walkthrough optional toggle |

---

## Definition of Done

Phase 1 is complete when:

- [ ] All 5 items implemented and tested
- [ ] Generated PDF includes all features by default
- [ ] Web UI allows toggling walkthrough/hint pages
- [ ] Documentation updated (user guide mentions new features)
- [ ] Competitive analysis doc updated to reflect parity
- [ ] Team demo completed and feedback incorporated

**Then:** Begin Sprint 1 (Propagation in Generation) — Gap #1 closure.
