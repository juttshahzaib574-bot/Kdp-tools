# Art pack: noir-1930s

Drop PNG files into the folders below. The folders exist so the library is
easy to browse; what the engine actually reads is `pack.json`, so a file is
only in play once it has a row there.

## The one number that should drive the artwork

**A portrait prints at 32 points — 0.45 inches square.**
(`packages/generators/grid-mystery/src/puzzle-page.ts:656`)

At that size a stylized bust reads: the face carries, and a hat separates
from a coat. What still does not survive is fine detail — badge lettering,
stitching, fabric weave, anything photographic.

At that size these read instantly: silhouette, headwear shape, one bold
prop, strong light/dark contrast.

So a police officer at 0.45 inches IS a peaked cap. A doctor is a coat
collar and a stethoscope. A maid is a cap and an apron line. Draw the
recognisable shape, not the person.

## File requirements

| | |
|---|---|
| Format | **PNG with transparency** (preferred), or JPG. Single-path SVG also works and is ideal for furniture |
| Size | **512 x 512 px minimum.** 135px is what 0.45in at 300dpi needs, but the two-page dossier spread will print portraits much larger, so draw with headroom |
| Colour | Must survive **grayscale**. KDP black-ink interiors are far cheaper to print, so every pack has to work without colour. Line art and high contrast survive; soft tonal shading turns to mud |
| Background | Transparent, or a flat colour that is not near-black or near-white |
| Naming | `<role>-<nn>.png` — e.g. `police-officer-01.png`, `generic-07.png`. Lower case, hyphens, no spaces |

**Lower case, always.** Linux is case-sensitive and Windows is not, so a
folder called `Doctor` works on your machine and fails on the build server.

## How many

Aim for **24-32 portraits per pack**, and note the split:

- **~70% `generic/`** — guests, civilians, people with no stated job. These
  are the bulk of any real cast. A manor mystery where all seven suspects
  are staff reads as absurd; you need guests, and a guest is a well-dressed
  person with no occupation.
- **~30% role folders** — seasoning, not the whole dish.

## Roles here

**Cross-theme** (usable anywhere): generic, detective, police-officer,
doctor, nurse, priest, journalist, lawyer, professor, businessperson,
child, elderly-man, elderly-woman

**Blackwood Manor**: butler, maid, cook, gardener, chauffeur, aristocrat,
governess
**Sunnybrook Farm**: farmer, farmhand, veterinarian, milkmaid
**Lakeside Camp**: camp-counsellor, ranger, camper
**Barracks Mess Hall**: soldier, sergeant, officer, medic

Hotel and office roles (concierge, bellhop, receptionist, housekeeper,
executive, secretary, janitor, intern) are deliberately absent until those
themes exist — no point commissioning art for a theme that is not built.

## The four asset kinds, and why there are exactly four

Each kind has its own folder with its own README listing precisely which
files go where — those lists are pulled from the engine's own content, so
they are the commission brief, not a guess.

| Folder | What it is | Drawn at | Engine draws it today? |
|---|---|---|---|
| `portraits/` | one per suspect, on the clue cards | **0.45in** | yes, procedurally |
| `furniture/` | props inside grid cells, named in clues | **0.22-0.5in** | yes, procedurally |
| `floors/` | room floor treatments | a whole room | yes, procedurally |
| `objects/` | the evidence items each guest carried | not drawn | **no — text only** |

`portraits/` is split by ROLE and `floors/` by ROOM TYPE, because both
cross themes: one doctor serves the manor and the hotel alike, and a barn
floor is a barn floor in every theme that has a barn. `furniture/` and
`objects/` stay split by THEME, because a wheelbarrow belongs to the farm
and a grandfather clock does not.

### Holding a file, wondering where it goes

1. **Is it a person?** -> `portraits/<role>/`. The role, not the theme —
   one doctor serves every theme that has a doctor.
2. **Do you walk on it?** -> `floors/<room-type>/`. The kind of room, not
   the theme — a barn floor is a barn floor everywhere.
3. **Does a suspect carry it?** -> `objects/<theme>/`. Every one of the 48
   evidence items is unique to its theme by design; there is no cross-theme
   evidence, so there is never a "which theme?" question here.
4. **Otherwise it is furniture** -> `furniture/<theme>/`, and the same
   applies: all 40 landmark names are theme-exclusive.

There is deliberately no `shared/` drawer. It sounds useful and it would be
empty: measured across the four themes, **0 of 48 objects and 0 of 40
landmarks appear in more than one theme**. A drawer nothing belongs in only
invites misfiling. If a genuinely cross-theme landmark is ever written into
`content.ts`, that is when the folder gets made.

**The thing to check before drawing furniture:** the engine names its
landmarks in the clue text ("beside a *weather vane*"). A drawing whose
name is not on the list in `furniture/README.md` is never reached — the
cell falls back to the procedural glyph. Draw the list, or add the name to
`content.ts` first. Not the other way round.

### What is deliberately NOT a folder

- **Room label plates, coordinate numbers, the legend strip, the grid
  itself** — all drawn by code from fonts and vectors. Artwork here would
  be replacing something that already scales perfectly to every trim size.
- **Chapter dividers, prologue and epilogue ornaments** — story mode does
  not exist yet (Phase 3 in `docs/roadmap.md`). A folder now would collect
  art against a layout nobody has designed.
- **Cover art** — a separate product surface, not part of a book's interior
  pack.
- **UI icons** — app chrome, not book art.

If any of those becomes real, it gets a folder then. An empty folder that
outlives its purpose is worse than a missing one, because it invites
somebody to fill it.

## What 16x16 will need, before you draw for it

16x16 is the stated commercial target and it changes every count on this
page. The engine caps at 8x8 today (`generate.ts:61`), and the content
pools were sized for that:

| Per theme | Today | 16x16 needs | Why |
|---|---|---|---|
| Room names | 10 | **20+** | a 16x16 wants 12-16 rooms and still needs slack to shuffle, or every book has the same floor plan |
| Objects | 12 | **20+** | every suspect carries a distinct one, so 16 suspects is a hard floor |
| First names | 16 | **28+** | 16 suspects on a page, with room to vary between books |
| Last names | 10 | **20+** | same |
| Landmarks | 10 | **16+** | props scale with grid area, not grid side |

Those are content, not art — they cost nothing but writing, and they are
not blocking your upload. The art number that IS affected:

**Portraits.** A 16x16 puts 16 faces on one page. The old target of 24-32
per pack assumed 8. For 16 you want **40-48 per pack**, still ~70% in
`generic/`, or suspects start repeating within a single puzzle.

Draw for 16 now. Redoing a pack because it was sized for 8x8 is exactly
the expensive mistake the section below is about.

## Before commissioning the whole set

Get **one theme's worth** done first — Blackwood Manor, roughly 28
portraits. It gets rendered into a real page at 0.45 inches, in grayscale,
at every trim size, and judged there. Commissioning 200 portraits before
seeing one printed at actual size is the expensive mistake.
