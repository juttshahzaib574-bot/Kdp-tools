# Floors: storeroom

Floors here are used **only** in rooms of this kind, and rooms of this
kind draw **only** from here.

## Rooms that land in this folder

A room whose name contains any of these words:

- `cold store`
- `storeroom`
- `store`

## Materials that belong here

- hex tile
- poured concrete
- square tile

These are the 3 the procedural engine draws today, and they are a
floor for this room in the real world — that is the whole test. Adding a
material outside this list is fine if it passes the same test; adding
marble here because it looks nice is not.

## How many

**4 minimum, 8 target.** Two reasons, both hard:

1. No two rooms in one puzzle may share a floor. A 16x16 can put three
   rooms from this band on one page, so the band needs at least that
   many before the rule can be satisfied.
2. Variety across the book is what keeps KDP's duplicate-content check
   quiet. One floor per room type means every storeroom in every book is
   identical. Shigai Royalty ships eight per room type.

Name them `storeroom-01.png`, `storeroom-02.png`, ... Lower case, hyphens.
