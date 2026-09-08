# Stories, series and casting — the execution plan

The engine makes unlimited *puzzles*. It does not yet make unlimited
*books*, and the gap between those two things is the whole subject of this
document.

Everything below is measured against the engine as it stands. The
measurements were taken from a real 30-puzzle 8×8 book, not estimated.

---

## 1. The audit: what a book actually looks like today

```
30-puzzle 8x8 book, manor theme

suspects  pool  16 | each name seen 15.0x (max 20) | any two puzzles share 4.05 of 8
rooms     pool  10 | each seen 17.9x (max 23)      | any two puzzles share 3.54 of 6
objects   pool  12 | each seen 20.0x (max 23)      | any two puzzles share 5.30 of 8
props     pool  10 | each seen 17.9x (max 23)      | any two puzzles share 3.61 of 6

titles    30/30 distinct
```

Read the third column. **Any two puzzles in the book share half their
cast, more than half their rooms, and two thirds of their weapons.** A
reader who does puzzle 4 and then puzzle 19 meets the same four people in
the same three rooms holding the same five objects.

The puzzles are all genuinely different — the solutions and clue
fingerprints are provably distinct, and the cross-book harness already
proves that. What repeats is everything the reader *notices*. Combinatorial
uniqueness and perceptual uniqueness are not the same property, and only
one of them is currently being defended.

### The dead data

`suspectLastNames` exists in `content.ts` — 40 surnames, ten per theme,
carefully chosen. **Nothing reads it.** Casting is
`shuffle(rng, theme.suspectFirstNames).slice(0, size)` in `generate.ts:115`:
suspects are first-name-only. Every "Ashford", "Lockhart" and "Whitfield"
ever written for this project has never appeared in a book.

### And at 16×16 it is not a degradation, it is a wall

```
16x16 book
suspects k=16 pool= 16  ->  overlap 16.0 of 16
objects  k=16 pool= 12  ->  cannot even be cast
```

Sixteen suspects drawn from a pool of sixteen means **every puzzle in the
book has the identical cast**, in a different seating order. Sixteen
objects cannot be drawn from twelve at all — generation throws. 16×16 is
blocked on content before it is blocked on the solver.

---

## 2. The formula that sizes every pool

Two puzzles that each draw `k` items from a pool of `N` share about
`k²/N` of them. That single line replaces every guess about how much
content is enough.

| | k (8×8) | k (16×16) | pool for ≤1 shared at 8×8 | at 16×16 |
|---|---|---|---|---|
| suspects | 8 | 16 | 64 | 256 |
| objects | 8 | 16 | 64 | 256 |
| rooms | 6 | 12 | 36 | 144 |
| props | 6 | 12 | 36 | 144 |

**Target: ≤1 shared item between any two puzzles.** That is the point at
which two cases read as unrelated. ≤0.5 (double the pool) is the premium
target and is worth it for suspects, because names are what a reader
remembers.

These numbers look large. Two of the four have a trick that makes them
cheap; two do not.

### Suspects: surnames are a free 10× — this is the highest-value fix in the project

A full name is `first × last`, so the effective pool multiplies:

| first × last | full names | 16×16 overlap |
|---|---|---|
| 16 × 10 *(already written, unused)* | 160 | 1.60 |
| 24 × 20 | 480 | 0.53 |
| 40 × 30 | 1200 | **0.21** |

Wiring up the surnames that already exist takes 16×16 overlap from **16.0
to 1.6** — a tenfold improvement from data sitting in the repo. Growing to
40×30 costs an afternoon of writing and puts it under a quarter of a name.

There is a second, genre-specific dividend: noir characters have surnames.
"Corinne was in the third column" is a database row. "Miss Ballard was in
the third column" is a mystery novel. First-name-only casting reads as a
children's puzzle book, which is the wrong shelf.

### Rooms: qualifier × base is period-authentic, not a cheat

English country houses and grand hotels genuinely name rooms by colour,
aspect and size — the Blue Room, the Long Gallery, the Morning Room, the
North Landing. So a room name can be composed without looking composed:

```
qualifiers: Blue, Yellow, Chinese, Long, Lower, Upper, North, South,
            Old, New, Morning, Winter, Little, Great        (14)
bases:      Drawing Room, Library, Gallery, Parlour, Study, Landing,
            Salon, Smoking Room, Music Room, Card Room ...   (16)
```

14 × 16 = 224 room names from 30 written words, and every one of them is a
name a real building had. Composition must stay optional — "the Kitchen"
should not become "the Blue Kitchen" — so the qualifier list is per base,
not global.

**One hard constraint:** room names feed `candidateFamilies()` in
`textures.ts` by keyword, so a composed name must still contain its base
word. "Blue Drawing Room" contains "drawing room" and gets the right
floor. A name that loses the base word loses its floor binding.

### Objects and props: these just have to be written

No composition trick. A weapon needs to be a specific, plausible object; a
"brass candlestick" and a "silver candlestick" read as padding. 40–60 per
theme, written once, is the honest cost. It is also the cheapest work in
this whole document — a morning per theme.

---

## 3. Story: five levels, and the one rule that makes it safe

### The rule

**Every sentence of story must be derived from the puzzle's own facts, or
be about something the puzzle has no facts about.** There is no third
category.

This is not a stylistic preference. A puzzle book's entire value is that
the reader can trust the page. If the prose says the victim was found
clutching a torn photograph and the evidence layer says he carried an ice
pick, a solver notices, and the book is worse than one with no story at
all. `case-titles.ts` already works this way — titles are built from
victim, room and weapon — and that discipline extends to everything below.

What the engine knows, and prose may therefore assert: victim, culprit,
crime room, murder weapon, every suspect's room, object and height rank,
the room names, the props in the plan, and the full solve trace.

What the engine has no opinion about, and prose may therefore invent
freely: **motive, relationship, history, weather, time of day, what
anybody wanted.** Motive is the safe playground, and conveniently it is
also where all the drama lives.

### The five levels

| | What it is | Cost | Data it needs |
|---|---|---|---|
| **L0** | Case title | **built** | victim, room, weapon |
| **L1** | 2–4 sentence case opening under the title | small | same facts + motive pools |
| **L2** | "How the inspector knew" on the answer page | small | **the solve trace we already compute and throw away** |
| **L3** | Book frame: prologue, interstitials, epilogue | medium | the book's own case list |
| **L4** | True story mode — chapters, a through-line, a recurring detective | large | L1–L3 plus authored arc |

**L2 is the one to build first, and it is nearly free.** The technique
ladder in `tier-contract.ts` already records exactly how the puzzle
resolves — which fact was forced first, what that unlocked, how long the
chain ran. That trace is currently discarded after grading. Turned into
prose it becomes a walkthrough:

> *Bhatt began with the only thing nobody could argue about: the pantry
> held the fifth-tallest of them. From there the fourth row emptied of
> everyone but Ballard...*

Every rival ships a bare answer grid. A narrated solution, generated from
the real solve order, is a genuine premium feature and it costs one
formatter over data we already have.

**L1 is the one with the biggest ratio of felt-quality to effort.** Four
sentences per puzzle, assembled from the facts plus a motive pool, turns a
grid into a case.

### L3 and the series question

A book-level frame needs no engine data at all. A prologue, a line between
cases, and an epilogue that names the cases in order. That is authored per
*series*, not per book, and one frame serves every book in the series with
the case names swapped in.

**Series shape that fits how these actually sell:** one recurring
investigator across the series, one setting per book, escalating grid size
through the book. Book 1 the hotel, book 2 the liner, book 3 the club. The
investigator is a frame character, never a suspect — which keeps them out
of the puzzle logic entirely and therefore unable to break it.

---

## 4. Casting that does justice to 1930s noir

### What is wrong with the current names

| Theme | Verdict |
|---|---|
| **farm** | genuinely excellent. Hattie, Etta, Nell, Clara, Sadie, Amos, Silas, Josiah, Rufus, Gideon — all real, all common in 1930s rural America. Surnames Harrow, Pike, Colter, Nash, Cade are period and regional. Keep every one. |
| **manor** | half right. Victor, Ursula, Cordelia, Oscar, Roland, Ophelia and surnames Ashford, Fenwick, Lockhart, Marsh, Whitfield, Doyle are perfect English country house. Fenna, Priya, Sven, Mara, Emil, Tomas and the surname Cho are not — they read as present-day casting dropped into 1935. |
| **camp** | contemporary. Bree, Colton, Juno, Kira, Tamsin are late-20th-century-and-after names. Fine for a modern theme; wrong for anything in a noir pack. |
| **messHall** | contemporary multinational. Reads as a present-day coalition base, not a 1930s US Army post. |

This is not a diversity problem and the fix is not to make the cast
uniform. **The 1930s American city was more genuinely mixed than the
current pools are** — it just mixed along different lines. Noir's cast is
an immigrant city, and getting that right is what makes it feel real
rather than sanitised.

### The real 1930s American urban name system

Noir's cast comes from specific communities that specific neighbourhoods
actually held. Casting from these is period-accurate *and* gives more
variety than the current pools, not less.

| Community | Given names | Surnames |
|---|---|---|
| **Old-stock Anglo** | Warren, Russell, Clifford, Vernon, Chester, Wendell, Harold, Floyd, Dwight, Ellis · Beatrice, Florence, Mildred, Gladys, Dorothy, Marjorie, Vivian, Eleanor, Bernice, Lucille | Ashford, Whitfield, Prentice, Lockhart, Grayle, Stannard, Vane |
| **Irish** | Francis, Dennis, Eugene, Cornelius, Patrick, Terrence · Maureen, Kathleen, Sheila, Eileen, Nora | Cassidy, Halloran, Devlin, Moran, Rafferty, Brennan, Fallon, Quinlan |
| **Italian** | Salvatore, Vito, Rocco, Angelo, Dominic, Carmine · Assunta, Filomena, Concetta, Angelina, Rosaria | Bonanno, Ricci, Castellano, Marchetti, Fiore, Lanza |
| **Jewish (Eastern European)** | Irving, Milton, Seymour, Murray, Sidney, Morris, Nathan · Sylvia, Selma, Rhoda, Estelle, Miriam | Rosen, Kaufman, Glickman, Weiss, Bernstein, Shulman |
| **Polish / Slavic** | Stanley, Walter, Casimir, Frank · Wanda, Stella, Helena, Genevieve | Kowalczyk, Zielinski, Wisniewski, Pulaski, Nowak |
| **Black American** | Booker, Clarence, Otis, Percy, Nathaniel, Willie · Bessie, Ruby, Odessa, Alberta, Lorraine, Willa | — the Great Migration is the reason a 1930s Chicago or Harlem cast is not all white, and it is a fact of the setting, not a concession to it |

Write them as people, not as accents. No dialect spelling, no
community-to-role mapping — the Italian character is not automatically the
gangster and the Irish one is not automatically the cop. That mapping is
exactly what dates a period pastiche badly.

### Two devices that are pure noir and cost almost nothing

**The nickname.** Moose Malloy, Dutch, Slim, Whitey, Legs. A suspect
carrying `nickname` alongside a name lets clue text alternate between
"Salvatore Ricci" and "Rocky" without adding a person, which widens the
n-gram spread *and* sounds exactly like the genre.

**The alias.** Velma Valento is Mrs Grayle. A character with two names is
the single most characteristic device in the whole genre, and it is a
clue mechanic waiting to happen — "the woman signing the register as
Mrs Grayle" is a legitimate puzzle constraint. This is a real feature, not
decoration; worth a design pass of its own once L1 exists.

---

## 5. So — does story mode need more assets?

**Almost none, and that is the useful answer.** The instinct that a story
layer means a pile of new art is wrong; story is text.

| | Needed? |
|---|---|
| New portrait art | **no.** Existing portraits become *more* valuable — a dossier spread finally has somewhere to print them large |
| New furniture / floors | **no.** Story does not change what the grid draws |
| New object art | **no.** Objects are still text-only |
| Chapter / case opener page template | **yes** — one layout, code not art |
| Divider ornament per theme | **optional** — 1–2 vector marks per theme, an hour each |
| **Content: names, rooms, objects, props, motives** | **yes, and this is the entire real cost** |

The bill for a series is a writing bill, not an art bill. That is good
news for a schedule and it is the opposite of where the instinct points.

---

## 6. Execution order

Strictly cheapest-and-most-decisive first. Steps 1–3 cost no drawing time
and no new files.

1. **Wire up `suspectLastNames`.** ~20 lines in `generate.ts`. Takes 16×16
   cast overlap from 16.0 to 1.6, makes every clue sentence read like a
   mystery novel instead of a worksheet, and unlocks nothing else being
   blocked on it. Do this first.
2. **Grow the pools to the formula.** 40 first / 30 last / 40 objects / 40
   props per theme, rooms via qualifier × base. Writing only. This is what
   unblocks 16×16 — the solver is not the wall, the object pool is.
3. **Repair the period casting.** Farm stays as written. Manor loses six
   names. Camp and messHall are re-cast or moved out of the noir pack.
4. **Build L2** — the narrated solution from the solve trace already
   computed. Highest feature-value per line of code in the project.
5. **Build L1** — case openings.
6. **Add per-theme phrasing pools** (see `genre-noir-1930s.md`), which is
   the same lever as L1 applied to the clues themselves.
7. **L3 series frame**, then L4 story mode as the premium tier.

### The gate

No book exports until, measured on its own generated puzzles:

- [ ] any two puzzles share **≤1 suspect**, ≤1 room, ≤1 object
- [ ] every case title in the book is distinct *(already enforced)*
- [ ] no clue sentence appears in more than 2% of puzzles *(already measured)*
- [ ] every story sentence traces to a puzzle fact or to a motive pool
- [ ] every composed room name still contains its base keyword, so it
      keeps its floor

The first item is the one that fails today, on every book, at every size.

---

## 7. One decision this forces

Growing and re-casting the name pools **changes what every existing seed
generates**. A book generated today and regenerated after step 2 is a
different book. That is roadmap decision **D2 (theme-pack versioning)**,
still open, and it stops being cheap the moment a customer has a saved
book they expect to reproduce.

The fix is small if done now: stamp a `contentVersion` on a saved puzzle
set and keep old pools addressable. It is a migration if done later.
