# Whole-book story mode — market research and what it can honestly deliver

The question: should the tool ship a premium "story mode" that turns a
book of puzzles into one continuous story, the way Shigai Royalty does?

Short answer: yes, and the market evidence is stronger than expected. But
the version everyone imagines — a novel whose plot runs through generated
puzzles — is not reachable by any generator, including Shigai's, and
understanding *why* is what tells us where the winnable ground is.

---

## 1. The market is proven, and it is bigger than the puzzle-book category

The reference case is **Murdle** (G. T. Karber, 2023) — the same genre we
are in: murder logic puzzles with a cast, rooms, weapons and a grid.

| | |
|---|---|
| UK sales, first 6 months | **300,000+** |
| Series worldwide | **4 million+** |
| UK Christmas #1 bestseller | 2023 — outsold Guinness World Records and Richard Osman |
| British Book Awards | **Overall Book of the Year 2024** |
| Peak week | 52,549 copies, w/e 16 Dec 2023 |
| Effect on category | UK puzzle-book sales hit their highest level since the 2005 sudoku boom |

That is not a puzzle-book number. That is a mainstream trade number, and
the thing that produced it was **a story wrapped around logic puzzles**.
It is the single strongest argument for building this feature.

## 2. Nobody in our actual tooling market has it

A scan of the KDP puzzle-generator field — KDP Builder, KDPForge,
PuzzleForge, Puzzle Generator, Puzzle Creator Pro, TangledTech's list —
turns up word search, sudoku, crossword, maze, kakuro, bulk generation,
answer keys, auto table of contents. **None of them advertise story mode,
a prologue/epilogue, or narrative continuity.**

The only competitor that does is Shigai Royalty, which markets it as a
premium mode: *"optionally enable Story mode when you want the cases woven
into one connected tale."*

So the competitive picture is: the *reader* market is proven at
mainstream scale, and the *tooling* market has exactly one player in it.

---

## 3. Why a generated book cannot be a novel — and what Shigai actually ships

A story needs causality: chapter 7 happens *because* of chapter 3. A
generated puzzle produces its facts — victim, culprit, room, weapon — as
outputs of a seed. Two orderings are possible and both fail:

- **Write the story first, generate after** → the puzzles do not match the
  plot. Chapter 7 says the manager died in the vault; the puzzle says the
  stoker died in the galley.
- **Generate first, narrate after** → the narration can only describe what
  came out, which is a sequence of unrelated murders with no through-line.
  That is an anthology, not a novel.

Shigai chose the second, and their own description says so precisely:
story mode *"adds an editable prologue and epilogue page and turns every
puzzle-case header into a story chapter that references the puzzle's real
cast and rooms."*

**That is a frame with per-case flavour text.** It is not a plot. This is
not a criticism — it is the only thing structurally available if you
generate first, and it is genuinely worth money. But it means the bar to
beat is much lower than "write a novel".

**Murdle can do more because Karber hand-wrote all 100 puzzles to fit a
plot he had already written.** A human author solving the constraint by
hand is not a feature a generator competes with directly.

---

## 4. There is a third ordering, and it is open

**Generate *under* the story's constraints.**

Instead of narrating whatever came out, express each chapter as a set of
requirements and make generation satisfy them. The story is authored; the
puzzles are searched for.

This is not theoretical — **the mechanism already exists in the engine and
was verified rather than assumed.** `GenerateGridMysteryOptions` accepts a
`theme` override: a complete content pack, per puzzle. Narrow the pack to
exactly the cast, rooms and objects a chapter requires and the generator
has no choice but to use them.

Measured, on the current engine with no changes:

```
chapter pack: 6 named suspects, 4 named rooms, 6 named weapons
12 seeds -> 12/12 honoured the pinned cast and rooms
            58ms per puzzle
```

So a chapter can already say *"this case features Ashford, Lockhart and
Whitfield, it happens among the Library, Ballroom, Wine Cellar and Study,
and the weapon is one of these six"* — and get a verified, unique puzzle
that obeys it.

What is **not** yet pinnable, and would need engine work:

- **which** suspect is the victim (currently the first of a random pair in
  a two-person room)
- **which** is the culprit
- a character who must survive to a later chapter
- a weapon that must recur

None of those is hard. They are all the same shape: accept an optional
predicate and reject candidates that fail it, which is exactly what the
existing 160-attempt retry loop already does for uniqueness and tier.

**This is the differentiator.** Shigai narrates what fell out. Constrained
generation lets an author write a real arc — a recurring rival who dies in
chapter 9, a knife that reappears in chapter 14 — and have every puzzle
provably obey it while staying uniquely solvable. No competitor does this,
and the only reason Murdle can is that a person did it by hand.

---

## 5. What readers actually complain about — the design brief, free

Murdle's reviews are unusually useful, because the book is a bestseller
*and* readers are specific about its flaws. Every one of these is a
feature we can decide about deliberately.

**"I didn't even understand that it was supposed to be telling you a
story — you can only read it if you check the solutions section."**

Murdle puts the narrative continuation in the answer key. There is a good
reason for it (the story continues *after* you solve, so it cannot spoil
the puzzle), and a real cost: **readers miss the story entirely.** The fix
is a visible front-matter promise and a chapter header that reads as
narrative, with only the *resolution* held back to the answer page.

**"The logic is not explained by the answers at the end."**

The #1 bestseller in this category does not explain its solutions. We
already compute the full technique ladder for every puzzle and throw it
away after grading. A narrated walkthrough — *how* the deduction goes, in
order — is a premium feature the market leader does not have and we are
one formatter away from.

**"Too many words, not enough puzzle."**

Some readers actively do not want story. **Story mode must be a switch,
not a rewrite** — and it already is one in Shigai's UI. Ship the same
book both ways.

**"Very little worldbuilding or characterization."** ·
**"Too repetitive — it's the same type of exercise all the time."**

The characterisation gap is real and is where the per-theme clue voice
(see `genre-noir-1930s.md`) and richer motive pools pay off. The
repetition complaint is about puzzle *form*, and is an argument for the
16×16 tier and for varying grid size through a book, not for more prose.

---

## 6. So what would story mode actually deliver?

Honest expectations, separated from the pitch.

### What it gives

- **A different shelf.** A story-driven puzzle book is a *gift* book. It
  competes with Murdle at £12–20, not with a 99p sudoku bundle.
- **A premium tier for the tool** with a clean upsell story, matching how
  Shigai already sells it.
- **A duplicate-content moat.** Prologue, chapter headers and epilogue are
  authored per book and pinned to that book's own cast — text no other
  generated book can accidentally share.
- **Reader completion.** An arc gives a reason to do puzzle 30 rather than
  abandoning at puzzle 9, which is what drives reviews.

### What it does not give

- **It is not a novel and should never be sold as one.** A buyer expecting
  a plot from a generated book will leave a one-star review, and that is
  the single biggest risk in this feature.
- **It does not make the puzzles better.** A weak puzzle with a story on
  top is still a weak puzzle, and reviewers say so.
- **It does not remove the writing bill.** Story mode is content:
  prologue, epilogue and chapter templates per theme, plus motive pools.
  See `story-and-series-plan.md` for the pool sizes.

### The compliance note

KDP requires publishers to disclose AI-**generated** text via a checkbox
at submission; it is internal, does not appear to buyers, and does not
affect royalties or ranking. AI-*assisted* content does not require it.
Our story text is deterministic template assembly from authored pools,
which is a materially different thing from language-model prose — but the
distinction matters to the publisher, not to us, so **the tool should
state plainly how its text is produced** and let them answer the checkbox.
The moment an LLM is wired in to write story prose, that changes, and the
tool should say so at that point too.

---

## 7. Recommended build

Ship it in three tiers, cheapest first, each saleable on its own.

**Tier 1 — the frame (parity with Shigai).** Editable prologue and
epilogue pages; every case header becomes a chapter heading naming that
puzzle's real cast and room; a closing paragraph on the answer page. All
derived from facts the engine already produces. This is the whole of what
the competitor sells.

**Tier 2 — the narrated solution (beyond Murdle).** Format the existing
technique-ladder trace into "how the detective knew". Uses data already
computed. This is the strongest single feature in the document because the
category leader is measurably missing it.

**Tier 3 — constrained generation (beyond everyone).** An authored arc
expressed as per-chapter constraints — cast, rooms, weapon, victim,
survivors — with generation searching for puzzles that satisfy them.
Partly works today via the `theme` override; needs victim/culprit pinning
and a recurring-character mechanism.

Tier 1 is a weekend. Tier 2 is the one to lead the marketing with. Tier 3
is the moat.

---

## Sources

- [Murdle Christmas 2023 bestseller — NationalWorld](https://www.nationalworld.com/culture/books/murdle-puzzle-book-christmas-2023-bestsellers-chart-waterstones-gift-of-the-year-4452526)
- [Murdle tops the Christmas charts — PuzzlesHQ](https://www.puzzleshq.com/puzzles/news/murdle-christmas-2023-uk-book-charts-besteller/)
- [Murdle — Profile Books](https://profilebooks.com/work/murdle/)
- [Murdle review, structure and criticism — crossexaminingcrime](https://crossexaminingcrime.com/2023/09/04/murdle-solve-100-devilishly-devious-murder-logic-puzzles-2023-by-g-t-karber/)
- [Murdle vol. 2 review — Cannonball Read](https://cannonballread.com/2024/05/murdle-vol-2-coffeeshopreader/)
- [Murdle reader reviews — The StoryGraph](https://app.thestorygraph.com/book_reviews/6bff57e4-bdb4-49f1-a307-84e59cb92cb2?dnf=true&sort=latest)
- [Shigai Royalty review — d-papa](https://www.d-papa.com/shigai-review/)
- [Shigai Royalty review — mei-review](https://mei-review.com/shigai-royalty-review/)
- [KDP puzzle book generators — TangledTech](https://tangledtech.com/amazon-kdp/free-puzzle-generator-for-kdp/)
- [KDP Builder puzzle book creator](https://kdpbuilder.com/tools/puzzle-book-generator)
- [KDP AI disclosure rules 2026 — KDP Builder](https://kdpbuilder.com/blog/kdp-ai-disclosure-rules)
- [KDP AI content policy 2026 — univers.studio](https://www.univers.studio/blog/kdp-ai-content-policy-2026/)
