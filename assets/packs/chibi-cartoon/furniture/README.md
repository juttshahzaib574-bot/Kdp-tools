# furniture/ — props drawn inside grid cells

These are the engine's **landmarks**: the objects drawn into the floor plan
and named in clues ("beside a **wheelbarrow**", "on the **hay bale**").

## The size problem — these are SMALLER than portraits

A grid cell measures roughly **0.32in to 0.75in**, depending on trim size and
how many suspects the puzzle has. An icon fills about 70% of that, so you
are drawing for **0.22in to 0.5in**. That is tighter than the 0.45in
portrait slot, and it is the tightest brief in the pack.

One silhouette, one read. A wheelbarrow is a wheel and two handles. A
grandfather clock is a tall box with a round face. Nothing else survives.

## Every prop is BLOCKED — there is no other kind

The page legend reads "CAN STAND HERE / BLOCKED — FURNITURE", which makes
it look like props come in two kinds. They do not.
`buildOccupyMaskAndLandmarks` in `floor-plan.ts` places a landmark only on
a cell no suspect occupies — a prop is never something a guest stands on.

(An earlier version of this file said to set occupiable/blocked per prop in
`pack.json`. That was wrong; there is no such choice.)

So draw these as **things in the way**: a shape that reads as furniture
blocking a square, never as a seat.

## Where each file goes

`furniture/<theme>/<prop>/` — one folder per prop, named for the exact
string the engine prints in clue text. Open the folder, drop the PNGs in.
Each folder holds its own one-page brief.

**A drawing whose folder is not on the list is never reached.** The engine
names its landmarks in the clue text, so art for a prop `content.ts` does
not know about will not appear, whatever it is called or wherever it sits.
New prop = the name goes into `content.ts` first, the folder second.

## The four theme folders

- `manor/` — Blackwood Manor
- `farm/` — Sunnybrook Farm
- `camp/` — Lakeside Camp
- `mess-hall/` — Barracks Mess Hall

Each lists its ten props and links into their folders.
