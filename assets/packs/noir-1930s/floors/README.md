# floors/ — one floor per kind of room

**Folders are room types, not themes.** A barn floor goes in barns, in every
theme, for ever. A garden floor goes in gardens. They never cross. That
binding is real code, not a convention: `candidateFamilies()` in
`packages/generators/grid-mystery/src/textures.ts` matches a room's NAME
against a keyword list and returns only the materials that room admits.

This used to be split by theme (`manor/`, `farm/`, …) and that was wrong.
The four themes all have a kitchen; splitting by theme would have you draw
the same kitchen floor four times, and would still not tell you which floor
a Milking Parlor gets.

## The bands

Each folder's own README lists the exact room words that land in it and the
materials that belong there.

| Folder | Room words | Materials |
|---|---|---|
| `mess-hall/` | 5 | checkerboard, square tile, woven matting |
| `servants-quarters/` | 6 | wood plank, woven matting, cut stone / flagstone |
| `hallway/` | 5 | square tile, parquet, marble |
| `shed/` | 3 | cut stone / flagstone, running-bond brick, cobble / setts |
| `storeroom/` | 3 | hex tile, poured concrete, square tile |
| `drawing-room/` | 4 | damask, carpet, parquet |
| `pantry/` | 4 | hex tile, square tile, subway tile |
| `kitchen/` | 4 | subway tile, square tile, checkerboard |
| `cellar/` | 6 | cut stone / flagstone, running-bond brick, cobble / setts |
| `silo-depot/` | 5 | poured concrete, diamond plate, brushed metal |
| `forge-workshop/` | 4 | diamond plate, brushed metal, rubble |
| `hayloft-coop/` | 4 | straw / hay, wood plank, burlap / sacking, … |
| `barn-stable/` | 5 | wood plank, straw / hay, cobble / setts, … |
| `garden/` | 5 | packed earth / furrows, grass, gravel, … |
| `yard/` | 6 | grass, gravel, cobble / setts, … |
| `dock/` | 6 | water / wet deck, wood plank, poured concrete, … |
| `ballroom-hall/` | 6 | parquet, marble, checkerboard |
| `library-study/` | 4 | parquet, carpet, wood plank |
| `conservatory/` | 3 | square tile, grass, terrazzo |
| `billiard-games/` | 3 | carpet, parquet, damask |
| `winery/` | 4 | cut stone / flagstone, cobble / setts, running-bond brick |
| `lodge/` | 5 | wood plank, burlap / sacking, parquet |
| `tower-attic/` | 4 | wood plank, cut stone / flagstone, pressed tin |
| `generic/` | — | fallback for a room matching nothing above |

## Two rules the engine enforces, that decide how many you draw

**One — a room only ever gets a floor from its own band.** This is what you
asked for and it is built. Straw never lands in a bathroom.

**Two — no two rooms in one puzzle share a floor.** A repeated material
reads as one room cut in half. The engine assigns the whole floor plan at
once (a bipartite matching) so this holds whenever it can hold at all.

Rule two is what sets the count. A 16x16 puzzle can put three rooms of the
same kind on one page — Barn, Stable and Milking Parlor are all
`barn-stable/` — so a band with two floors in it makes that puzzle
impossible to satisfy. **4 minimum per folder, 8 target.** Shigai Royalty
ships eight per room type; that is the bar.

## File requirements

| | |
|---|---|
| Format | **PNG**. JPEG is ~7x smaller for noisy stone and wood and is fine too — the interior is capped at 650 MB and 100 pages of floors costs about 1 MB either way |
| Size | **512 x 512 px minimum**, 1024 preferred. A floor covers a whole room, not one cell |
| Tiling | **Seamless.** Rooms are irregular polyominoes at every size from 6x6 to 16x16, so a tile repeats an unpredictable number of times. A visible seam shows up as a false grid line |
| Contrast | **Low.** A floor sits under the props, the coordinate numbers and the room label. The procedural engine caps its own luminance swing at 0.16 in colour and 0.10 in grayscale — match that or the puzzle gets harder to read, not prettier |
| Grayscale | Must survive it. KDP black-ink interiors are far cheaper to print. Adjacent rooms have to read as different rooms with the colour gone — which means **different values, not just different patterns** |
| Naming | `<folder>-<nn>.png` — `barn-stable-01.png`, `pantry-03.png`. Lower case, hyphens, no spaces |

**Lower case, always.** Linux is case-sensitive and Windows is not, so
`Pantry/` works on your machine and fails on the build server.

## Value, not just pattern

The grayscale proof of the farm puzzle showed four of six rooms sitting in
one light band — they separated by pattern but barely by value. Pattern
alone is not enough. When you draw a band's 4-8 variants, spread them
across dark, mid and light rather than making eight light ones.
