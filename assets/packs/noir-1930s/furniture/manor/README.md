# furniture / manor — Blackwood Manor

One folder per prop. Open the folder, drop the PNGs in. Nothing else to decide.

- `grandfather-clock/` — grandfather clock
- `chess-table/` — chess table
- `bookshelf/` — bookshelf
- `fireplace/` — fireplace
- `portrait/` — portrait
- `piano/` — piano
- `globe/` — globe
- `vase-of-lilies/` — vase of lilies
- `suit-of-armor/` — suit of armor
- `writing-desk/` — writing desk

These ten names are not a suggestion — they are the exact strings the
engine prints in clue text ("beside a **grandfather clock**"), from
`content.ts`. **A drawing whose folder is not on this list is never
reached**, whatever it is called. To add a new prop, the name goes into
`content.ts` first and the folder second.

Every prop here is **blocked** — a guest can never stand on it. That is not
a setting: `buildOccupyMaskAndLandmarks` only ever places a landmark on a
cell no suspect occupies. The page legend says "BLOCKED — FURNITURE", so
these drawings must read as *things in the way*, never as somewhere to sit.
