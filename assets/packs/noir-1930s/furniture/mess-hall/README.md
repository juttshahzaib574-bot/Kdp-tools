# furniture / mess-hall — Barracks Mess Hall

One folder per prop. Open the folder, drop the PNGs in. Nothing else to decide.

- `steam-kettle/` — steam kettle
- `serving-line/` — serving line
- `ration-crate/` — ration crate
- `coffee-urn/` — coffee urn
- `walk-in-freezer-door/` — walk-in freezer door
- `mop-bucket/` — mop bucket
- `notice-board/` — notice board
- `stack-of-mess-trays/` — stack of mess trays
- `knife-rack/` — knife rack
- `grease-trap/` — grease trap

These ten names are not a suggestion — they are the exact strings the
engine prints in clue text ("beside a **steam kettle**"), from
`content.ts`. **A drawing whose folder is not on this list is never
reached**, whatever it is called. To add a new prop, the name goes into
`content.ts` first and the folder second.

Every prop here is **blocked** — a guest can never stand on it. That is not
a setting: `buildOccupyMaskAndLandmarks` only ever places a landmark on a
cell no suspect occupies. The page legend says "BLOCKED — FURNITURE", so
these drawings must read as *things in the way*, never as somewhere to sit.
