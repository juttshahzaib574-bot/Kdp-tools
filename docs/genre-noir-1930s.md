# The noir-1930s pack — genre bible

What this pack is, what books it can make, what art it needs, and what
actually makes a reader feel they are inside the genre rather than looking
at a grid with period clip-art on it.

Written against the engine as it stands. Every asset named here maps to a
folder in `assets/packs/noir-1930s/`, and every immersion lever named in
the last section is either code that exists or code that is named with a
file path. Nothing here is aspirational art direction.

---

## 1. First, the thing the pack name gets wrong

**`noir-1930s` and Blackwood Manor are two different genres.** Not two
moods of one genre — two separate literary traditions with different
readers, different rooms, different props and different palettes.

| | Golden Age / country-house | American hardboiled / noir |
|---|---|---|
| Years | c. 1920–1939 | c. 1929–1958 |
| Writers | Christie, Sayers, Marsh, Allingham | Hammett, Chandler, Cain |
| Setting | English country house, village, vicarage | American city — offices, hotels, waterfronts |
| Detective | gifted amateur, eccentric gentleman | paid professional, tired, compromised |
| The world | orderly; the murder is an aberration to be corrected | corrupt; the murder is the world behaving normally |
| Light | afternoon, drawing room, French windows | one bulb, rain on glass, 3am |
| Palette | oak, brass, wine, moss, cream | black, wet asphalt, chrome, one hot accent |

We have built the left-hand column and named the folder after the right.
Blackwood Manor is a Christie house: library, drawing room, conservatory,
billiard room, servants' hall, butler, governess, a vase of lilies.

**This is worth fixing, and it is commercially good news, not bad.** These
are two proven, separately-selling categories. The fix is not to pick one:

- Rename the current pack **`golden-age`** — it is already a coherent,
  well-observed Golden Age pack and the artwork commissioned for it is not
  wasted.
- Build **`noir-1930s`** as its own pack, to the brief below.

A reader who buys a book called *Noir* and finds a butler in a ballroom
notices. The two packs sharing one name is the only real risk here.

---

## 2. What 1930s noir actually looks like

Noir's visual grammar is not "old-timey". It is specific, it is
documented, and — this is the part that matters for us — **almost all of it
survives at 0.1 inches in black ink**, which is more than can be said for
most genres.

### Chiaroscuro is the whole idea

Noir inherits its lighting from German Expressionist cinema (*Caligari*,
1920) by way of émigré directors — Lang, Wilder, Siodmak — working in
Hollywood from the early thirties. One hard light source, deep black
shadow, no soft fill. Objects are read by their **silhouette and their
shadow**, not by their surface detail.

That is the same constraint our grid imposes for a completely different
reason. A genre whose entire aesthetic is *high contrast and strong
silhouette* is the single best fit for a 0.15-inch monochrome icon that
exists. This is a genuine advantage over a farm pack or a camp pack, where
the reference images are inherently mid-tone and cluttered.

### Art Deco geometry, then Streamline Moderne

- **Deco** (through ~1935): chevrons, sunbursts, stepped ziggurat forms,
  zigzags, fluted verticals, octagons, strict symmetry
- **Streamline Moderne** (~1935 onward): horizontal speed lines, rounded
  corners, porthole windows, chrome banding, teardrop forms

Both are **line-based geometric ornament**. They scale to any size without
turning to mud, unlike carved wood or marble veining. Deco is the reason a
noir floor tile reads at 0.3 inches when a photographic marble does not.

### The real 1930s palette

Not the 1920s one. After 1929 the palette got restrained and cooler:

| Colour | Note |
|---|---|
| **Eau de nil** — pale grey-green | *the* signature 1930s interior colour, everywhere from ocean liners to bathrooms |
| **Oxblood** | leather, lacquer, banquette upholstery |
| **Chrome / nickel** | the era's status metal; replaces brass |
| **Black lacquer** | Deco furniture, piano finish |
| **Cream / ivory** | walls, bakelite, cigarette holders |
| **Apricot and dusty rose** | soft furnishings, hotel rooms |
| **Jade** | glass, enamel, tile |

### Typography of the period

Geometric sans — **Futura** (1927) is the era's face — plus condensed
grotesque for headlines and Deco display faces for signage. If the pack
ever gets its own case-title face, that is the family.

### The one thing to avoid

Sepia. Noir is not brown. Brown is the visual language of *nostalgia*,
which is the opposite of the genre's actual mood. Cold neutrals with one
warm accent, never an overall warm wash.

---

## 3. Five noir books this engine can actually make

Each of these needs, to work at 16×16: **20+ room names, 20+ objects
(distinct weapons), 20+ landmark props, 28 first names, 20 surnames.** The
current themes carry 10/12/10/16/10, so every one of these is a
write-it-once content job on top of the art.

They are ordered by how well the setting supplies a **closed circle** —
the genre's structural requirement that the killer must be one of the
people in the building, which is also our puzzle's requirement.

### 1. The Grand Hotel — *the strongest pick*

*Grand Hotel* (1932) is literally the template: strangers under one roof,
each with a secret, over one night. Staff and guests give you two social
classes in one building, which is where Golden Age and noir overlap and
where clue-writing gets interesting.

- **Rooms** — lobby, front desk, telephone exchange, elevator bank,
  ballroom, cocktail lounge, kitchen, laundry, boiler room, linen store,
  manager's office, house detective's office, roof garden, cloakroom,
  service stair, suite, corridor, luggage room, staff dining, garage
- **Roles** — house detective, desk clerk, bellhop, elevator operator,
  chambermaid, concierge, bandleader, torch singer, travelling salesman,
  divorcée, stenographer, hotel doctor, night porter
- **Props** — switchboard, luggage trolley, potted palm, revolving door,
  grand piano, cigarette machine, room-key rack, laundry cart, floor safe
- **Weapons** — letter opener, telephone cord, ice pick, fire axe,
  bellhop's whistle chain, bottle of chloral, service revolver

### 2. The Ocean Liner

The closed circle taken to its logical end: nobody can leave. Transatlantic
liners are a defining 1930s image, and their interiors were the purest Deco
built anywhere — which makes the art brief unusually easy.

- **Rooms** — first-class lounge, smoking room, promenade deck, purser's
  office, wireless room, engine room, stokehold, galley, third-class
  berths, swimming bath, gymnasium, cargo hold, bridge, chart room,
  hospital bay, mail room, boat deck, veranda café
- **Roles** — purser, wireless operator, ship's doctor, stoker, steward,
  captain, bandleader, stowaway, heiress, businessman fleeing a warrant
- **Props** — deck chair, lifebuoy, telegraph, capstan, porthole,
  steamer trunk, cocktail bar, brass compass
- **Weapons** — signal flare, marlinspike, bottle of laudanum, coal
  shovel, mooring line

### 3. The Nightclub / Speakeasy

Prohibition ran to December 1933, so a 1930s club can be either an illegal
speakeasy (pre-33) or a legitimate club with a criminal owner (post-33) —
that choice sets the book's whole tone and is free to make per book.

- **Rooms** — main floor, bandstand, cloakroom, kitchen, cellar, back
  office, dressing room, alley door, private booth, cigarette counter,
  gaming room, ice room, coal chute
- **Roles** — club owner, torch singer, bandleader, bouncer, hat-check
  girl, bartender, croupier, cop on the take, gossip columnist
- **Props** — upright piano, banquette, cash register, jukebox, ice bucket,
  roulette wheel, hat rack, neon sign
- **Weapons** — cocktail shaker, corkscrew, brass knuckles, garrote,
  bottle of bathtub gin, microphone stand

### 4. The Film Studio

Hollywood in the thirties: a self-contained lot with a rigid hierarchy and
a lot of people with motives. Visually the richest of the five.

- **Rooms** — soundstage, backlot street, wardrobe, makeup, screening
  room, cutting room, producer's office, writers' building, prop store,
  carpentry shop, star's bungalow, commissary, gate house, vault
- **Roles** — studio boss, starlet, has-been leading man, director,
  screenwriter, continuity girl, stunt double, publicist, gate guard
- **Props** — camera on dolly, arc lamp, boom microphone, director's
  chair, film canister, dressing mirror, clapperboard, painted flat
- **Weapons** — length of film, sandbag, prop pistol loaded for real,
  scissors, bottle of developer

### 5. The Limited (train)

*Murder on the Orient Express* is 1934. Narrower than the others — a train
is essentially a corridor — which suits **smaller grids and shorter
books**, and makes it the natural 6×6 / 7×7 theme in a mixed series.

- **Rooms** — dining car, club car, observation car, Pullman berths,
  baggage car, mail car, locomotive cab, tender, porter's nook, vestibule,
  washroom, conductor's office
- **Roles** — conductor, Pullman porter, dining steward, engineer, senator,
  society wife, card sharp, federal agent
- **Props** — berth ladder, luggage rack, water cooler, card table,
  brass spittoon, mail sack, coal tender
- **Weapons** — carving knife, ice tongs, luggage strap, brakeman's
  lantern, bottle of veronal

---

## 4. The asset bill

Per theme, in the folders that already exist:

| Folder | Files | Note |
|---|---|---|
| `portraits/<role>/` | 40–48 per pack | ~70% `generic/`; 16×16 puts sixteen faces on one page |
| `furniture/<theme>/` | 20+ per theme | must match the landmark names in `content.ts`, or it is never drawn |
| `objects/<theme>/` | not drawn today | text-only; art here is speculative until the dossier spread exists |
| `floors/<room-type>/` | 4–8 per band | bands, not themes — a hotel corridor and a liner corridor are the same `hallway/` |

**Floors are the cheap win.** They are filed by room type, so noir's
rooms mostly land in bands that already exist — `hallway/`, `kitchen/`,
`cellar/`, `ballroom-hall/`, `storeroom/`. A Deco chevron parquet drawn
once serves the hotel ballroom, the liner lounge and the club floor. The
only genuinely new bands noir needs:

- `deck/` — planked ship's deck, caulked seams (liner, dock)
- `stage/` — sprung boards, marks taped out (club, studio, theatre)
- `platform/` — station and train flooring, rubber studded matting

**Portraits are the expensive part**, and noir's silhouettes are its
saving grace. At 0.45 inches these read instantly and are exactly the
genre's own iconography:

| Role | Reads as |
|---|---|
| Private eye | trilby brim + turned collar |
| Torch singer | marcel wave + bare shoulder line |
| Bellhop | pillbox cap + double row of buttons |
| Beat cop | domed helmet or peaked cap + badge shape |
| Newspaperman | press card in the hatband |
| Stoker | flat cap + bare arms + shovel |
| Society wife | cloche or wide brim + fur collar |
| Purser | peaked cap + shoulder boards |

---

## 5. Immersion — what actually does the work

Art is the smaller half of this. A reader spends thirty seconds looking at
the grid and ten minutes reading clue sentences. **The voice is the
immersion.**

### What the engine already does

| Lever | Where | State |
|---|---|---|
| Per-puzzle case titles from victim/room/weapon, 18 grammatical shapes, deduplicated across a book | `case-titles.ts` | built |
| 13+ phrasings per clue archetype, RNG-selected | `phrasings.ts` | built |
| Semantic floors per room type | `textures.ts` | built |
| Landmark props named inside the clue text | `content.ts`, `glyphs.ts` | built |
| Portrait roles | `assets/` | folders built, art pending |

### The gap that matters most

**The clue voice is genre-neutral, and it is the one thing a reader
actually reads.** Every phrasing pool in `phrasings.ts` is a single global
constant shared by all four themes. So a hardboiled book and a farm book
say the same sentence:

> *Corinne was in the 3rd column.*

That is a database row with a full stop on it. The genre version of the
same constraint:

> *The desk clerk swore Corinne never got past the third column.*
> *Whatever else was a lie that night, Corinne was in the third column.*
> *Corinne had an alibi for the third column. It even held up.*

Same constraint, same solver, same difficulty — completely different book.
This is a **per-theme phrasing pool**, keyed the same way the pools are
already keyed, and it is the highest-leverage unbuilt feature in the whole
project:

1. It is what makes a noir book feel noir
2. It multiplies the cross-book distinctness that keeps KDP's
   duplicate-content check quiet — the measured effect of pool size on
   n-gram similarity is already documented at the top of `phrasings.ts`
3. Shigai Royalty does not have it

Second, smaller: the opening line is fixed for every puzzle in every
theme — *"All the statements below are true, and no two guests share a
row or a column."* That is the rulebook talking. A noir book should open
its cases in its own voice and put the rules in the front matter once.

### The measured problem with the current palette

Noir is contrast. Ours has none:

```
room fill luminance:  0.853 0.858 0.859 0.867 0.875 0.888 0.903 (7 of 8)
our spread:           0.05
Shigai's spread:      0.50   (measured L 0.40 - 0.90)
```

Every room in every puzzle sits within five hundredths of every other. In
colour the hue carries the separation; **in grayscale — which is how a
cheap KDP interior prints — there is essentially nothing there**, which is
exactly what the farm proof showed with four of six rooms in one light
band.

For a noir pack this is not a small flaw, it is the genre's entire
aesthetic missing. The fix is a value ladder in `palette.ts`: room fills
spread deliberately across dark, mid and light, with the floor texture's
existing `MAX_DELTA` cap left alone (that cap protects legibility and is
doing its job — the problem is the fills underneath it, not the texture on
top).

---

## 6. What to do first

In order, cheapest and most decisive first:

1. **Split the pack name.** Rename the existing pack `golden-age`; start
   `noir-1930s` clean. Costs a directory move, prevents a wrong-genre book.
2. **Fix the value ladder in `palette.ts`.** No art required, fixes every
   theme, and it is a prerequisite for noir looking like noir.
3. **Write the Grand Hotel content pack** — 20 rooms, 20 objects, 20
   landmarks, 28+20 names. Writing, not drawing. It is also the template
   for backfilling the four existing themes to 16×16 sizes.
4. **Add per-theme phrasing pools.** The immersion lever, and the
   duplicate-content lever, in one change.
5. **Then** commission portraits — 40–48, ~70% generic, drawn to
   silhouette.

Art last is deliberate. Steps 1–4 change what every book reads like and
cost no drawing time; step 5 is the only one that costs money, and it goes
better once the pack it belongs to has a settled name.
