# objects/ — the evidence items

The murder weapons. Each suspect carries exactly one, and the evidence
block pins who had what.

## ⚠️ Not drawn by the engine today

The evidence block currently prints these as **plain text** — "Franco —
lead pipe". No icon is rendered anywhere. This folder is here so the art
can be commissioned alongside everything else, but adding icons is a
feature that does not exist yet.

If it is built, these would be inline icons beside the text at roughly
**0.15in to 0.2in** — smaller than anything else in the pack, and only
worth doing for shapes that survive it. A cleaver does. A vial of laudanum
probably does not.


## What goes in each theme folder


### `manor/` — Blackwood Manor

- `brass-candlestick-01.png` — brass candlestick
- `lead-pipe-01.png` — lead pipe
- `coil-of-rope-01.png` — coil of rope
- `silver-letter-opener-01.png` — silver letter opener
- `duelling-pistol-01.png` — duelling pistol
- `crystal-decanter-01.png` — crystal decanter
- `iron-poker-01.png` — iron poker
- `garrote-wire-01.png` — garrote wire
- `vial-of-laudanum-01.png` — vial of laudanum
- `marble-bookend-01.png` — marble bookend
- `riding-crop-01.png` — riding crop
- `ceremonial-dagger-01.png` — ceremonial dagger

### `farm/` — Sunnybrook Farm

- `pitchfork-01.png` — pitchfork
- `hand-scythe-01.png` — hand scythe
- `length-of-baling-wire-01.png` — length of baling wire
- `cast-iron-skillet-01.png` — cast-iron skillet
- `pruning-shears-01.png` — pruning shears
- `horseshoe-01.png` — horseshoe
- `bottle-of-pesticide-01.png` — bottle of pesticide
- `hay-hook-01.png` — hay hook
- `shovel-01.png` — shovel
- `milking-stool-01.png` — milking stool
- `axe-handle-01.png` — axe handle
- `sack-of-lye-01.png` — sack of lye

### `camp/` — Lakeside Camp

- `hunting-knife-01.png` — hunting knife
- `aluminum-canoe-paddle-01.png` — aluminum canoe paddle
- `signal-flare-01.png` — signal flare
- `hatchet-01.png` — hatchet
- `length-of-climbing-rope-01.png` — length of climbing rope
- `archery-arrow-01.png` — archery arrow
- `tent-stake-01.png` — tent stake
- `heavy-flashlight-01.png` — heavy flashlight
- `bottle-of-white-gas-01.png` — bottle of white gas
- `cast-iron-dutch-oven-01.png` — cast-iron dutch oven
- `boat-anchor-01.png` — boat anchor
- `carabiner-chain-01.png` — carabiner chain

### `mess-hall/` — Barracks Mess Hall

- `meat-cleaver-01.png` — meat cleaver
- `cast-iron-ladle-01.png` — cast-iron ladle
- `boning-knife-01.png` — boning knife
- `tin-of-rat-poison-01.png` — tin of rat poison
- `rolling-pin-01.png` — rolling pin
- `carving-fork-01.png` — carving fork
- `length-of-apron-cord-01.png` — length of apron cord
- `steel-stockpot-01.png` — steel stockpot
- `fire-extinguisher-01.png` — fire extinguisher
- `bottle-of-degreaser-01.png` — bottle of degreaser
- `meat-tenderizer-01.png` — meat tenderizer
- `honing-steel-01.png` — honing steel


## Naming and format

`<slug>-01.png`, lower case, hyphens, no spaces. Add `-02`, `-03` for
variants of the same item — more than one drawing per item is what stops
every book in a series looking identical.

PNG with transparency, 256px minimum. Must survive **grayscale**: KDP's
black-ink interior halftones grey into dot screens, so strong value
separation beats subtle shading. Pure black and white is not needed — see
the pack README.

