# KDP Studio Library — build blueprint

Derived from the competitive analysis in `competitor-shigai-royalty.md` and
from measurements taken on our own engine. Every claim about our behaviour
here was measured, not assumed; the measurements are cited inline.

Nothing in this file is committed to as a schedule. It is an ordering
argument: what to build, in what sequence, and why that sequence.

---

## The five facts this plan is built on

1. **We and Shigai build the same puzzle.** Their control reads
   `7 × 7 (6 suspects)`; their variant text describes one-per-row/column
   placement with the victim's roommate as the killer. Same object as ours.
2. **Our engine dies at grid size 10.** Measured: 10×10 Hard, 3/3 seeds
   failed, 283 s each. Assets were sufficient at that size — the engine wall
   bites at 10, the asset wall at 13.
3. **88.6% of generation time is `countSolutions`**, naive backtracking with
   no propagation, no domain pruning, no variable ordering. Profiled over
   four 8×8 Hard generations: 10,753 ms of 12,142 ms across 5,543 calls.
4. **We already compute the full deduction path and throw it away.**
   `technique-solver.ts` derives every elimination in order, with the
   technique justifying each, purely to grade the puzzle. Hints and
   walkthroughs are recovery of work already paid for.
5. **We are stricter than the market leader.** They permit lookaheads above
   Medium and disclose the count; we forbid guessing at all five tiers. That
   strictness is a selling point AND the main reason large grids are hard
   for us.

## Ordering principles

- **Harvest before building.** Anything derivable from work already done
  goes first — it is the cheapest closure of a real gap.
- **Instrument before committing.** Where we do not know the answer, build
  the measurement, then decide. Two gates below exist for this.
- **The book is the gap, not the engine.** Our logic core is at parity or
  better. Our product is roughly a third of theirs. Weight accordingly.
- **One format finished beats two half-built.** The second puzzle format is
  the biggest strategic prize and it comes after format one has a book
  around it.

---

# PHASE 0 — Instrument
**Goal: be able to measure past size 12 at all.** Today we cannot: the
object pool stops us at 13 before the engine's real behaviour is visible.

| # | Item | Size | Notes |
|---|---|---|---|
| 0.1 | Scaffold content pools — ~32 names, ~24 rooms, ~24 objects, ~20 landmarks, widened height range | S | Strings only, no artwork. Own file, NOT registered in `themeById()`, so unreachable from the product. One labelled commit, removed by `git revert` |
| 0.2 | Raise `MAX_GRID_SIZE` behind the same commit | XS | |
| 0.3 | Scaling harness — generation rate, time, clue count, technique grade, per size × tier | S | Reusable for every gate below |

**Exit:** we can state, with numbers, what happens at 10, 12, 14, 16.
**Blocked on you:** nothing.

---

# PHASE 1 — Harvest
**Goal: close real gaps using work the engine already does.** Highest
value per unit of effort in the whole plan, and every item benefits both
puzzle formats.

| # | Item | Size | Why now |
|---|---|---|---|
| 1.1 | **Solution walkthroughs** — print the deduction path, step by step, with the technique naming each step | M | The path already exists in `TechniqueProfile`; today it is discarded after grading. Competitor claims this; Murdle ships a version of it |
| 1.2 | **Hint ladder** — first *n* steps of the same path, escalating | S | Same source as 1.1. Murdle ships one hint per puzzle, so the market expects it regardless |
| 1.3 | **Difficulty badge printed on the page** | XS | We compute the tier; we just do not print it. Theirs appears in the exported PDF |
| 1.4 | **Logic profile in the exported answer key** | XS | Already on the review card. Makes the tier claim auditable to the reader, which nobody else does |
| 1.5 | **Case header** — title, hook line, occupiable/blocked legend | S | Their page has one; ours does not. Pure layout |

**Exit:** a puzzle page and answer key that stand next to theirs.
**Blocked on you:** nothing.

---

# PHASE 2 — Engine core
**Goal: make large grids reachable, and add the clue family we lack.**
This is where the measured 88.6% lives.

| # | Item | Size | Depends on |
|---|---|---|---|
| 2.1 | **Structured clue representation** — replace structure-by-probing with a real logic form | L | — |
| 2.2 | **Propagation + MRV inside `countSolutions`** | L | 2.1 |
| 2.3 | **AC-3 worklist** replacing the fixpoint loop in the technique solver | M | 2.1 |
| 2.4 | **IF-THEN / conditional clue family**, certified as its own technique rung | L | 2.1 |
| 2.5 | **Lookahead policy decision** — keep zero-guess everywhere, or permit a disclosed, printed count at the top tier only | S (decision) + M (impl) | — |

### 🚦 GATE A — 12×12
Run the Phase 0 harness at 12×12 after 2.2 and 2.4.
- **PASS** if 12×12 Hard generates on ≥80% of seeds, in seconds not minutes,
  needing ≤20 clues, still certified at its technique band.
- **PASS →** 14 and 16 on the spatial engine are an engineering problem.
  Continue to 2.6.
- **FAIL →** 16×16 does not come from the spatial engine. It comes from the
  second format in Phase 6, which is moved forward.

| # | Item | Size | Depends on |
|---|---|---|---|
| 2.6 | Scale to 14 and 16, re-tune tier bands per size | L | GATE A pass |
| 2.7 | **Lying-suspect mechanic** — some statements false, deduce the liar first | XL | 2.1, 2.4. Murdle's canonical escalation; Shigai claims it |
| 2.8 | "Fish" technique, if 12×12 measurement shows the propagator stalling without it | M | measurement first, not on faith |

**Exit:** a measured, honest answer to "how big can our grid go".
**Blocked on you:** the 2.5 policy decision.

---

# PHASE 3 — The book
**Goal: close the gap that actually loses the sale.** Our logic is at
parity; our book is not. This is the largest cluster on the gap list.

| # | Item | Size |
|---|---|---|
| 3.1 | **Story mode** — editable prologue and epilogue, every case header becomes a chapter naming the puzzle's real cast and rooms, fully deterministic | XL |
| 3.2 | **Series continuity** — "next book, same world and cast, new seed", with a guarantee that no two books in a series repeat a puzzle or a paragraph | L |
| 3.3 | **Two-page dossier spread** — scene left, statements right | L |
| 3.4 | **Suspect profiles** — one-line character descriptions, not bare names | M |
| 3.5 | **How-to-Play / instructions page**, generated | M |
| 3.6 | **Copyright page generator** with a template bank | M |
| 3.7 | Blank page type; 2 puzzles per page; large-print mode (forces the spread, ≥16 pt) | M |
| 3.8 | Page numbers, table of contents | M |
| 3.9 | Typography, appearance and page-number panels | M |
| 3.10 | Sort by difficulty | S |

**Exit:** a book a buyer would call premium.
**Blocked on you:** nothing. Story copy can be authored procedurally.

---

# PHASE 4 — Art and content
**Goal: the premium look.** This is the phase your asset library feeds.

| # | Item | Size | Blocked on you |
|---|---|---|---|
| 4.1 | **Theme-pack versioning** (`manor-v1`, `manor-v2`) so expanding content does not silently change books already generated from stored seeds | M | decision: version, or replace in place |
| 4.2 | Real content pools replacing the Phase 0 scaffold — per theme | S | **yes** |
| 4.3 | Furniture icons per room type, drawn in-cell | L | **yes**, or procedural |
| 4.4 | Floor tiles / textures, several per room type, per-room override | L | **yes** |
| 4.5 | Suspect portraits as art rather than procedural glyphs | L | **yes** |
| 4.6 | Artwork styles (illustrated / line / other), full coverage per style | XL | **yes** |
| 4.7 | Additional themes — hotel, office, house observed in their output | M | partly |
| 4.8 | Custom cast — publisher's own names, portrait picker, photo upload | L | the upload system already exists (`Asset` model) |

**Exit:** pages that read as authored, not generated.

---

# PHASE 5 — Reach and workflow
**Goal: sell into more markets and more formats.**

| # | Item | Size |
|---|---|---|
| 5.1 | **Trim sizes** — 3 today → the full KDP list plus explicit bleed presets | M |
| 5.2 | **Localisation** — every generated string through a locale layer; one language today | XL |
| 5.3 | **Pre-flight** — KDP validation pass before export | M |
| 5.4 | Export formats beyond PDF — PNG, SVG, PPTX | M |
| 5.5 | Templates / saved worlds — ours DB-backed, theirs browser-local, so this is a place to beat them | M |
| 5.6 | World Builder — publisher-authored reusable worlds | XL |
| 5.7 | Batch queue with background rendering and progress | M |

---

# PHASE 6 — The second format
**Goal: the one item where we would lead rather than catch up.**

Shigai is *strictly* a spatial-grid generator. A matrix logic grid — the
Murdle form, 3–4 categories tracked at once — is something they structurally
do not offer.

| # | Item | Size |
|---|---|---|
| 6.1 | Category-bijection constraint model | L |
| 6.2 | Matrix-native clue families, conditional clues included | L |
| 6.3 | Matrix propagator for the existing technique ladder | L |
| 6.4 | X/O triangular grid renderer — the largest single piece | XL |
| 6.5 | Motive category | M |
| 6.6 | Format switch in the UI and the book pipeline | M |

**Reused unchanged:** tier contract and two-sided certification, technique
ladder architecture, seed determinism, `{{sN}}` templates, KDP geometry,
page-bounds guard, PDF export and font embedding, mix planner, and the whole
web app — Customize tab, review cards, paginators, thumbnails, answer key.

**Search space is smaller than what we already ship**: 4!³ = 13,824 states
against our 8×8's 8!×8! = 1.6 billion. None of the Phase 2 scaling pain
applies here.

### 🚦 GATE B — where 16×16 comes from
Set by GATE A's outcome:
- GATE A **passed** → 16×16 ships from the spatial engine; Phase 6 stays
  here as a differentiator.
- GATE A **failed** → Phase 6 moves ahead of Phase 3, because the matrix
  form's 16×16 (4 categories × 4 items = 256 intersections) is then the only
  honest route to the badge.

**Naming:** not "Murdle mode". Murdle and Murdoku are live commercial brands
from major publishers, and a feature name sits in our UI, pricing page and
marketing — a stronger exposure than a book's metadata. Use a neutral
internal name (Case Matrix / Deduction Grid) and the generic market term
"Murder Mystery Logic Grid Puzzles".

---

# Decisions needed from you

| # | Decision | Blocks | Default if unanswered |
|---|---|---|---|
| D1 | Lookahead policy — zero guesses everywhere, or a disclosed printed count at the top tier | 2.5, and how hard Phase 2 is | keep zero-guess everywhere |
| D2 | Theme-pack versioning, or replace content in place | 4.1, and whether current drafts stay reproducible | version the packs |
| D3 | Asset library scope — what you can supply per theme, per pool | Phase 4 sizing | scaffold stays until real assets land |
| D4 | Whether Phase 6 waits for GATE A or starts in parallel | overall shape | wait for the gate |

# What is NOT in this plan, and why

- **DLX / Algorithm X.** Our clues include binary relations, which exact
  cover cannot express. Adopting it means dropping the relational clue
  families that make Hard, Expert and Extreme what they are. The measured
  bottleneck is answered by 2.2 instead.
- **Grid size as the difficulty lever.** Measured and rejected: withholding
  information does not make a puzzle harder to reason about, it makes it
  impossible to reason about. Grid size scales a tier's presentation; the
  technique contract sets its difficulty.
- **Real-solver validation.** Everything here is machine simulation. That
  limit does not close until puzzles are put in front of people, and no
  phase below removes it.
