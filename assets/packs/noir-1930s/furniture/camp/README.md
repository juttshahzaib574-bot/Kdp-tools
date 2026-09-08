# furniture / camp — Lakeside Camp

One folder per prop. Open the folder, drop the PNGs in. Nothing else to decide.

- `canoe-rack/` — canoe rack
- `bonfire-pit/` — bonfire pit
- `bug-zapper-lamp/` — bug-zapper lamp
- `archery-target/` — archery target
- `cooler-chest/` — cooler chest
- `flagpole/` — flagpole
- `bunk-ladder/` — bunk ladder
- `first-aid-box/` — first-aid box
- `rope-swing/` — rope swing
- `stack-of-firewood/` — stack of firewood

These ten names are not a suggestion — they are the exact strings the
engine prints in clue text ("beside a **canoe rack**"), from
`content.ts`. **A drawing whose folder is not on this list is never
reached**, whatever it is called. To add a new prop, the name goes into
`content.ts` first and the folder second.

Every prop here is **blocked** — a guest can never stand on it. That is not
a setting: `buildOccupyMaskAndLandmarks` only ever places a landmark on a
cell no suspect occupies. The page legend says "BLOCKED — FURNITURE", so
these drawings must read as *things in the way*, never as somewhere to sit.
