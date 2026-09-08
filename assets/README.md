# Asset library

Art packs live here, one folder per pack under `packs/`. A pack is a
complete visual style — every portrait, prop and floor tile in it should
look like it was drawn by the same hand, because a book uses one pack
throughout.

```
assets/packs/<pack>/
├── README.md      what goes in this pack, at what size and format
├── pack.json      the manifest — the only thing the engine reads
├── portraits/     by ROLE — a role crosses themes
├── furniture/     by THEME — props drawn inside grid cells
├── floors/        by THEME — room floor treatments
└── objects/       by THEME — evidence items (not drawn by the engine yet)
```

## Two rules that save pain later

**Lower case, hyphens, no spaces** — for every folder and every file.
Linux is case-sensitive and Windows is not, so `Doctor/` works locally and
fails on the build server.

**Folders organise, the manifest decides.** The engine reads `pack.json`,
never a directory listing. That way one drawing serves several themes,
several drawings serve one role, and an empty folder can never break a
render.

## Status

Nothing here is wired into the engine yet. The structure is fixed now so
artwork can be produced against it; the loader lands in Phase 4 of
`docs/roadmap.md`.
