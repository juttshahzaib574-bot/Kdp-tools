# Shigai Royalty — competitor reference

Primary source: ten screenshots of the live Shigai Royalty UI and of an
exported 82-page PDF, captured from an affiliate walkthrough video
(mei-review watermark), supplied 2026-09 in two batches.

This is the first PRIMARY-SOURCE evidence in this project. Everything before
it was affiliate prose or LLM-generated summaries. Where this file and an
earlier claim disagree, this file wins.

---

## 1. What the screenshots actually show

### Grid size

> **Grid Size: `7 × 7 (6 suspects)`**

Their convention appears to be an N×N floor plan holding N people, of whom
N-1 are suspects and one is the victim. Their variant text:

> "Classic whodunit — The standard puzzle: place everyone by their true
> clues; whoever ends up alone with the victim is the murderer."
>
> "place everyone using the one-per-row/column rule"

**This is our puzzle.** Same object, same rule, same win condition, same
size. Their 7×7 and our 7×7 are the same shape.

**What the screenshots do NOT show:** any grid larger than 7×7, across four
independent views — the dropdown itself, the exported PDF page 5
("The Last Evening of Mila", coordinates 1-7), the canvas preview
("The Safehouse Mystery", coordinates 1-7), and the hotel-theme preview.

**This is uninformative, and an earlier reading of it here was wrong.**
All ten screenshots come from ONE affiliate walkthrough demonstrating ONE
configuration — Classic whodunit, Medium, 7×7. A demo that never changes the
grid dropdown is not evidence about what the dropdown contains. The
reviewer's account reads "Access: FE + Pro + Elite", so they had the tiers
and simply didn't show them. Seeing 7×7 ten times is one observation, not
ten.

So the 16×16 question is **OPEN**, not "unsupported". It stays open until
someone runs the product at Dragon. Nothing in our own plan should hinge on
the answer: our engine's wall at size 10 is measured on our own code and is
a fact regardless of what they can do.

A separate control reads **"Grid size (auto)"**, sitting above the trim-size
list, which suggests grid size may be derived from page size — which would
also explain a larger grid never appearing in a Letter-sized demo.

## 2. Full observed feature inventory

### Confirmed in batch 2 (previously unverified or unknown)
- **IF-THEN clue toggle**, with the example text quoted above. This was an
  affiliate claim in the earlier analysis and is now primary-source fact.
- **Book language** dropdown (English shown) — "Every clue, room name, prop,
  board label, difficulty badge..." is localised. Full i18n of generated
  content. The trailing "..." means the on-screen list was cut off.

  A later unsourced claim extends this to **8 languages** — English,
  Spanish, French, German, Italian, Portuguese, Dutch, Polish — with the
  translated text baked into the exported PDF, no external tooling.
  RELIABILITY: unsourced prose, same class as the affiliate/LLM material
  that was half wrong earlier in this file. The dropdown is primary-source;
  the count and the list are not.

  The same claim names two things that are NOT translation and would be
  features in their own right: **hints** and **step-by-step solution
  walkthroughs**. No screenshot shows either. If true they are a content
  gap, not a localisation gap — see below.
- **Pre-flight** button — a KDP validation pass before export.
- **Export formats: PNG / PDF / SVG / PPTX** per page, plus Export All to a
  combined PDF (82 pages observed).
- **How to Play instructions page**, generated with four numbered rules:
  PLACE EVERYONE / ONE PER ROW & COLUMN / READ "BESIDE" CAREFULLY / CATCH
  THE MURDERER, ending "Every Shigai Royalty puzzle has one unique solution."
- **Copyright page generator** — author-name modal, "picked at random from
  **100 templates**", swappable afterwards via "New Copyright Text".
- **Sort by difficulty** — reorders pages in the book.
- **Full KDP trim list**: 8 popular sizes, 2 international (A4, A5), plus
  explicit **"KDP Trim + Bleed (full-bleed interiors)"** variants with the
  bled dimensions spelled out (6×9 + bleed = 6.125 × 9.25).
- **Draggable legend strip** — "Drag the green box on the page to move it",
  with a legend-size slider.
- Legend has **three** categories on the page: CAN OCCUPY / NAMED IN CLUES /
  BLOCKED.
- **Difficulty badge printed in the exported PDF** (MEDIUM, top-right).
- Background rendering with progress ("Rendering page 16 of 40 —
  Continue in background").
- Themes observed beyond manor: **hotel** (SPA/RECEPTION/SUITE/BAR/ROOFTOP),
  **office** (SERVER ROOM/ARCHIVE/CORNER OFFICE/BOARDROOM/COPY ROOM),
  **house** (GARAGE/STUDY/HALLWAY/PANTRY/KITCHEN/BATHROOM).
- Clue styles observed: *"Alphard was in the Garage: inside the car."*
  (room + furniture) and *"Babbette was the 4th person from the north."*
  (ordinal directional).

### A confirmed weakness of theirs
> "Puzzle content isn't stored — every load generates fresh, unique puzzles
> in your world. **Templates live in this browser only (local, not synced).**"

Their saved worlds/templates do not sync across devices or survive a cleared
browser. Ours are database-backed and do. This is the one place their
architecture is behind ours.

### Generation & content
- Variant selector ("Classic whodunit"; implies others)
- Mystery mode ("Murder Mystery (classic)"; kid modes; creature modes that
  keep one star creature for a whole book)
- Location selector, "Surprise me (rotate locations)" — controls room names
  and eligible objects
- "Surprise me — roll a whole theme"
- **Customize cast** — own names, preset portraits, **photo upload**
- **World Builder** — user-authored reusable worlds (building, rooms,
  objects, floors), selectable under Location or the story wizard
- **My Templates (worlds)** + **My Library**. Full scope, their words:
  "Save the whole design as a reusable template — mystery mode, custom
  scenario, cast, location, art pack, floors (including **Floor Studio**
  tiles), colors, fonts, page setup, and story options. Perfect for book
  series, matching branding, seasonal collections, or **difficulty
  editions**."
- **Floor Studio** — a tile editor for authoring custom floor artwork,
  distinct from the 64 supplied tiles.

### Story / series
- **Story is one of three top-level MODES**, not a checkbox: the mode
  switcher reads `Pages | Bulk | ⭐ Story`. The star marks it as a premium
  tier feature.
- **Story mode** — "Adds an editable prologue and epilogue page and turns
  every puzzle-case header into a story chapter that references the puzzle's
  real names and rooms. Fully deterministic — no two books tell the same
  story." Best with 1 puzzle per page.
- **Next in series — create Book 2** — "Same world and cast ... new seed —
  no two books in a series ever repeat a puzzle or a paragraph."

### Art & print
- Artwork style ("Illustrated"; "Every listed style has complete asset
  coverage"; kid modes auto-swap to Kawaii)
- **Floor treatment** — "Elite provides **64 authored tiles**. Every room
  type automatically rotates through **eight** appropriate visual styles;
  each room can also be overridden."
- **Furniture icons drawn inside rooms** on the grid
- Print color: Color / Grayscale / B&W, applied on screen and in export
- Page size (8.5 × 11 Letter shown)

### Page & layout
- Case header (title, hook, **furniture legend**)
- **Difficulty badge printed on the page**
- Coordinate number size (11.25 pt shown)
- **Two-page spread (scene / statements)**
- **Large print edition** (forces the spread, text ≥ 16 pt)
- Puzzles per page: 1 or 2
- Number of pages (40 shown)
- Page types: Puzzle / Instructions / Blank / Copyright
- Panels: Layout & Margins, Typography, Page Numbers, Appearance,
  Solution & Display
- "Include number after puzzle title"
- Show margins (preview only, never exported)

### Workflow
- Pages vs Bulk mode toggle
- **Add to Queue** (batch)
- Solutions view
- Undo / redo
- **Export All**
- Access tiers: FE + Pro + Elite (Elite gates the 64 floor tiles)

---

## 3. Where we stand

### We are ahead
| | Us | Shigai |
|---|---|---|
| Guess-free guarantee | **Zero what-ifs at all five tiers**, enforced | Zero at Easy/Medium only; lookaheads permitted above |
| Tier certification | **Two-sided** — lowest ceiling that solves, so a tier cannot be undershot either | Rating only, one-sided |
| Cross-layer rung | Evidence↔seating certified as a technique band | No equivalent visible |
| Publisher audit trail | Per-puzzle logic profile on the review card | Difficulty badge only |

### Parity
Grid structure, grid size, one-per-row/column rule, alone-with-victim
solution, unique-solution guarantee, technique-modelling solver,
deterministic seeds, KDP page sizes, print-colour modes.

### Localisation and trim, measured on our side
| | Us | Shigai |
|---|---|---|
| Languages | **1** (English; clue text is English templates in `phrasings.ts`, no locale plumbing anywhere) | Dropdown confirmed; 8 claimed |
| Trim sizes | **3** — 6×9, 7×10, 8.5×11 (`KDP_TRIM_SIZES` in `packages/shared/src/kdp.ts:6`) | 8 popular + A4 + A5 + explicit bleed variants, all observed |
| Bleed | Boolean flag on our 3 sizes | Bled dimensions offered as their own presets |
| Hints | **none** | claimed, unverified |
| Solution walkthroughs | **none** — we print an answer key, not a derivation | claimed, unverified |

### We are behind — the real gap list
1. Story mode (prologue/epilogue, chapter headers naming real cast/rooms)
2. Series continuity (Book 2 in same world, no repeated puzzle or paragraph)
3. World Builder (user-authored reusable worlds)
4. Custom cast with portraits and photo upload
5. Mystery modes (kid / creature variants)
6. Artwork styles with full asset coverage
7. 64 authored floor tiles, 8 per room type, per-room override
8. Furniture icons + furniture legend
9. Two-page spread layout
10. Large-print edition mode
11. 2 puzzles per page
12. Instructions / Blank / Copyright page types
13. Difficulty badge printed on the puzzle page
14. Typography / page-number / appearance panels
15. Templates + library + queue
16. "fish" technique in the solver
17. Larger grids (open question for them; 8×8 ceiling for us)
18. Localisation — 1 language vs a confirmed dropdown, 8 claimed
19. Trim sizes — 3 vs ~10 plus bleed presets
20. Hints (claimed, unverified) — Murdle ships one per puzzle, so the
    market expects them regardless of what Shigai does
21. Step-by-step solution walkthroughs (claimed, unverified) — we print the
    answer, never the reasoning that reaches it. Note we ALREADY compute
    that reasoning in `technique-solver.ts`; it is thrown away after
    grading. Cheapest large win on this list.

---

## 3b. Is our size wall an ASSET problem? No — measured.

At 10×10 every content pool was already sufficient: 10 names needed of 16
available, 10 objects of 12, ~10 rooms of 10, 10 heights of 17. The result
was still 3/3 seed failures at 283 s each.

Three independent walls, with the size each one bites at:

| Wall | Bites at | Cause |
|---|---|---|
| **Engine** | **size 10** | naive backtracking (88.6% of generation time), no propagation, plus our zero-guess rule |
| Assets | size 13 | objects pool = 12 |
| Deducibility | unknown | zero-split requirement at every tier |

The engine wall comes first, three sizes before assets matter. Expanding
content pools alone moves nothing.

## 4. The finding that resolves "why does it sound impossible for us"

Our engine dies at 10×10 Hard (measured: 3/3 seeds fail, 283 s each) while
they advertise larger grids. The reason is now visible, and it is a rule
difference, not a capability difference:

**We forbid guessing at every tier. They allow it above Medium.**

A zero-split requirement is enormously more constraining than a
"few-lookaheads-and-we-tell-you-how-many" requirement. At 8 suspects, 230 of
237 unique clue sets already had no zero-split route. Relax to "≤ 2 disclosed
lookaheads at Dragon" and the reachable set explodes.

That is a policy choice we can make honestly — because unlike them we would
be printing the number — and it is the single biggest lever on whether large
grids are reachable at all.

Batch 2 adds a second reason, and it is not a policy choice: **IF-THEN
clues**, now confirmed. A conditional clue prunes far harder than any unary
clue we own — "If I was in the Kitchen, then Greta was in the Study"
constrains two suspects across two rooms in one sentence. More pruning power
per clue means uniqueness AND deducibility are reachable with fewer clues at
larger sizes. We have no conditional family at all.

So the gap at 10×10+ is three things, ranked by leverage:
1. Our zero-guess rule at every tier, where they allow disclosed lookaheads
2. No IF-THEN clue family (they have one; confirmed)
3. Naive backtracking with no propagation (88.6% of generation time)

Assets are fourth, and only bite at 13.

---

## 5. Open questions this reference cannot answer
- Does their grid dropdown actually offer 12×12 / 16×16? Not visible.
- How many lookaheads does a Dragon puzzle need? Not visible.
- Is their "fish" a real fish or a naked/hidden subset renamed? Not visible.
- Would a real solver finish their Dragon tier? Untested by anyone.
- Does "Grid size (auto)" mean grid size is derived from trim size?
- How many of the 82 exported pages are puzzles vs matter?

One exported Dragon PDF would settle most of these.

---

## 6. Genre confirmation, market sizes, and the trademark trap

Source: Google AI Mode results, batch 3. Reliability is mixed and graded
per claim below — the sales figures cite trade press, the taste claims cite
TikTok and Instagram.

### The genre question is settled

> "**Shigai Royalty is strictly a Murdoku-style puzzle generator.**"
> — attributed to Ike Paz (the reviewer whose account appears in the batch-1
> screenshots, "Welcome back, ikepaz")

And the definition given for Murdoku (Manuel Garand, published by Hachette /
Michael O'Mara):

> "A visual layout of a crime scene (like a mansion map or grid of rooms).
> You have to place suspects into specific rooms or spaces... Once a suspect
> is placed in a row or column, no other suspect can be in that same row or
> column... The final empty space left over with the victim reveals who the
> killer is. **This is exactly how Shigai Royalty's engine logic works.**"

**That is our engine, described exactly.** Spatial grid, one per row and
column, alone-with-victim is the killer. Confirms the batch-1 reading from
their `7 × 7 (6 suspects)` control. We and Shigai build the same object.

Murdle (G.T. Karber, Sunday Times #1 bestseller) is the OTHER genre: a
classic matrix logic grid, X and O marks, 3-4 categories tracked at once
(suspect x weapon x motive x location), leaning on narrative and conditional
clues.

### Two different market sizes
| | Murdle | Murdoku |
|---|---|---|
| Sales | **4M+ copies**, Book of the Year (British Book Awards), #1 Christmas bestseller, **22+ languages** | "fast-growing bestseller", BookTok-driven |
| Form | matrix logic grid | spatial map grid |
| Reliability | trade press, verifiable | unquantified |

Verified independently: both are real series from real publishers —
[Murdle (Karber)](https://en.wikipedia.org/wiki/G._T._Karber),
[Murdoku (Garand, Hachette)](https://www.hachettebookgroup.com/titles/manuel-garand/murdoku/9781454961796/).

### The taste finding — useful, but weakly sourced
> "Solvers complain that Murdle can feel like tedious **'bookkeeping'** or
> checking off text boxes without a lot of deep logic. Murdoku gives a
> **much better brain workout** because it combines spatial reasoning with
> Sudoku mechanics directly on a map. It requires **less reading and more
> actual logical puzzle-solving**."

If true this is direct validation of our format AND of the zero-guess
technique contract — "deep logic" is precisely what we enforce and Shigai
relaxes above Medium. But: sourced to TikTok/Instagram, unquantified, and
selection-biased (people posting "I prefer Murdoku" are the Murdoku niche).
Treat as a positioning hypothesis, not a fact.

### ⚠️ TRADEMARK — the actionable item
> "Do not use the word **'Murdoku' or 'Murdle'** anywhere in your book title,
> subtitle, or metadata. **Both terms are trademarked.** Instead market
> using generic terms like 'Crime Scene Investigation Puzzle Book' or
> 'Murder Mystery Logic Grid Puzzles.'"

Registration not confirmed in a registry search, but both are active
commercial brands from major publishers, so the risk is real regardless.

**This applies to OUR product, not just to books made with it** — and more
strongly, because a feature name sits in our UI, our pricing page and our
marketing. A mode called "Murdle mode" would put a competitor's brand on
our own product surface. Use a neutral internal name and the generic
market-facing term above.

---

## 7. The dual-format idea (user proposal, not yet decided)

Proposal: a mode switch that reconfigures the whole generator to produce
matrix-logic-grid puzzles (the Murdle form) alongside the existing spatial
form, sold as a premium feature.

### Why it is strategically strong
- **Shigai cannot do it.** "Strictly a Murdoku-style generator." Every other
  item on the gap list in section 3 is catch-up; this is the only one where
  we would LEAD.
- **It is the only honest route to a "16x16" badge we have found.** The
  market's 16x16 IS 4 categories x 4 items = 256 intersections. Our spatial
  engine dies at size 10 (measured). The matrix form gives 16x16 trivially.
- **The bigger market.** 4M copies vs "fast-growing".
- Adds the **motive** category we lack, and conditional/IF-THEN clues are
  native to the form.

### The engineering reality, honestly
The search space is SMALLER than what we already ship, by a wide margin:

| | states |
|---|---|
| Murdle-style 4x4x4x4 | 4!^3 = **13,824** |
| Our current 8x8 spatial | 8! x 8! = **1.6 billion** |

So none of the scaling pain applies. No propagation crisis, no 283-second
failures, no DLX question.

**Reused as-is:** tier-contract concept and two-sided certification, the
technique-ladder architecture, seed determinism, `{{sN}}` text templates,
KDP geometry and trim handling, page-bounds guard, PDF export and font
embedding, mix planner, and the entire web app — Customize tab, review
cards, paginators, apply-changes, thumbnails, answer key plumbing.

**Genuinely new:** the constraint model (category bijections rather than
grid placement), matrix-native clue families, a matrix propagator for the
technique ladder, and the X/O triangular grid renderer — which is the
largest single piece.

### The honest caveat
Calling it a "mode toggle" understates it. A phone's game mode coordinates
subsystems that already exist; here the subsystem does not. It is a second
puzzle type sharing the book and export layers — closer to 60% new domain
logic over 40% reused infrastructure. Naming it accurately up front is how
it avoids becoming a half-built second engine.

Risk: the spatial side still lacks story mode, series continuity, art
assets, hints and walkthroughs. Building format two while format one is
roughly a third of the competitor's product is a real focus risk.
