// Real artwork: what the manifest says, and which file a given slot gets.
//
// This module is pure. It resolves *which* asset belongs somewhere and
// never touches a filesystem — the bytes are loaded at the edges, the way
// fonts already are (node-art.ts here, a fetch loader in the browser
// worker). That is what keeps the browser bundle free of `node:fs`.

/** One drawing, as `pack.json` lists it. */
export interface ArtEntry {
  id: string;
  /** Path of the baked colour copy, relative to the art root. */
  baked: string;
  /** Path of the baked greyscale copy — a black-ink interior needs its own. */
  bakedGrey: string;
}

export interface PortraitEntry extends ArtEntry {
  role: string;
}
export interface PropEntry extends ArtEntry {
  /**
   * The prop's FOLDER name — a slug like "grandfather-clock". The engine
   * asks by landmark name ("grandfather clock"), so both sides are
   * slugified before comparison rather than one being stored
   * pre-formatted: a folder name is a published path and must not depend
   * on how content.ts happens to punctuate a string today.
   */
  prop: string;
  theme: string;
}
export interface FloorEntry extends ArtEntry {
  /** A band slug from ROOM_SURFACES — "barn-stable", "pantry", ... */
  roomType: string;
}

export interface ArtManifest {
  id: string;
  portraits: PortraitEntry[];
  furniture: PropEntry[];
  floors: FloorEntry[];
}

/**
 * A manifest plus the bytes for it, ready to embed.
 *
 * `images` is keyed by the `baked`/`bakedGrey` path, so a caller may load
 * every entry or only the ones a particular book reaches — a resolver
 * returning an entry whose bytes are absent falls back to procedural art
 * rather than failing, which is what lets a partly-filled pack ship.
 */
export interface LoadedArtPack {
  manifest: ArtManifest;
  images: ReadonlyMap<string, Uint8Array>;
}

// ---------------------------------------------------------------------
// Which roles suit which theme
// ---------------------------------------------------------------------

/**
 * Suspects carry a name and a height, not a job — the puzzle logic has
 * never needed one. So a portrait cannot be looked up by role directly,
 * and inventing a `role` field would put presentation into the solver's
 * data model for the sake of a picture.
 *
 * Instead the theme decides which roles are plausible and the seed picks
 * from those. A manor book draws butlers and aristocrats; a camp book
 * draws rangers and campers; both draw doctors, because a doctor is a
 * doctor anywhere. The result is stable for a given puzzle and varies
 * between puzzles, which is the same contract the rest of the engine
 * keeps.
 */
const CROSS_THEME_ROLES = [
  "generic",
  "detective",
  "police-officer",
  "doctor",
  "nurse",
  "priest",
  "journalist",
  "lawyer",
  "professor",
  "businessperson",
  "child",
  "elderly-man",
  "elderly-woman",
] as const;

const THEME_ROLES: Record<string, readonly string[]> = {
  manor: ["butler", "maid", "cook", "gardener", "chauffeur", "aristocrat", "governess"],
  farm: ["farmer", "farmhand", "veterinarian", "milkmaid"],
  camp: ["camp-counsellor", "ranger", "camper"],
  messHall: ["soldier", "sergeant", "officer", "medic"],
};

/** The roles a theme may cast from, most-specific first. */
export function rolesForTheme(themeId: string): string[] {
  return [...(THEME_ROLES[themeId] ?? []), ...CROSS_THEME_ROLES];
}

// ---------------------------------------------------------------------
// Resolution
// ---------------------------------------------------------------------

/** Folder-name form: "Grandfather Clock" and "grandfather clock" both become "grandfather-clock". */
function propSlug(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function hash(seed: number, salt: string): number {
  let h = Math.imul(seed | 0, 0x9e3779b1) >>> 0;
  for (let i = 0; i < salt.length; i++) {
    h = Math.imul(h ^ salt.charCodeAt(i), 0x01000193) >>> 0;
  }
  h ^= h >>> 15;
  return h >>> 0;
}

/** The baked path to embed, for the interior colour in play. */
export function bakedPathFor(entry: ArtEntry, greyscale: boolean): string {
  return greyscale ? entry.bakedGrey : entry.baked;
}

/**
 * Casts a portrait for every suspect in one puzzle.
 *
 * Distinct by construction: a page showing the same face twice reads as a
 * mistake even when the names differ. Where the pack cannot supply enough
 * distinct portraits the leftover suspects get `null` and fall back to the
 * procedural bust, which is the honest behaviour for a half-filled pack —
 * a repeated face would look like a bug, a mixed page looks unfinished,
 * and only one of those gets refunded.
 */
export function castPortraits(
  pack: LoadedArtPack,
  themeId: string,
  suspectIds: readonly string[],
  seed: number,
  greyscale: boolean,
): (PortraitEntry | null)[] {
  const usable = pack.manifest.portraits.filter((p) =>
    pack.images.has(bakedPathFor(p, greyscale)),
  );
  if (usable.length === 0) return suspectIds.map(() => null);

  const allowed = new Set(rolesForTheme(themeId));
  const pool = usable.filter((p) => allowed.has(p.role));
  // A pack with no theme-appropriate art is better served by any portrait
  // than by none — a manor butler in a camp book is a smaller error than
  // half the cast being procedural.
  const candidates = pool.length > 0 ? pool : usable;

  const taken = new Set<string>();
  return suspectIds.map((id) => {
    const start = hash(seed, id) % candidates.length;
    for (let i = 0; i < candidates.length; i++) {
      const entry = candidates[(start + i) % candidates.length]!;
      if (taken.has(entry.id)) continue;
      taken.add(entry.id);
      return entry;
    }
    return null;
  });
}

/**
 * The drawing for one landmark, or null to keep the procedural glyph.
 *
 * Matched on the landmark's exact name, because that string is what the
 * clue text prints — art filed under a name `content.ts` does not know
 * about is unreachable by design rather than by accident.
 */
export function resolveProp(
  pack: LoadedArtPack,
  propName: string,
  themeId: string,
  seed: number,
  greyscale: boolean,
): PropEntry | null {
  const wanted = propSlug(propName);
  const matches = pack.manifest.furniture.filter(
    (f) =>
      propSlug(f.prop) === wanted &&
      f.theme === themeId &&
      pack.images.has(bakedPathFor(f, greyscale)),
  );
  if (matches.length === 0) return null;
  return matches[hash(seed, propName) % matches.length]!;
}

/**
 * The floor image for one room type, or null to keep the procedural
 * texture.
 *
 * Takes the band slug rather than the room name: the semantic binding
 * from room name to band already lives in textures.ts and is tested
 * there, so repeating the keyword table here would be a second copy to
 * keep in step.
 */
export function resolveFloor(
  pack: LoadedArtPack,
  roomTypeSlug: string,
  seed: number,
  greyscale: boolean,
): FloorEntry | null {
  const matches = pack.manifest.floors.filter(
    (f) => f.roomType === roomTypeSlug && pack.images.has(bakedPathFor(f, greyscale)),
  );
  if (matches.length === 0) return null;
  return matches[hash(seed, roomTypeSlug) % matches.length]!;
}

/**
 * Floor images for a whole plan, with no two rooms sharing one.
 *
 * The same rule the procedural floors keep, for the same reason: a
 * repeated material reads as one room cut in half. Rooms whose band has
 * no art, or whose art is already spoken for, come back null and keep
 * their procedural texture — which is why a pack holding one file per
 * band still improves a page instead of breaking it.
 */
export function resolveFloors(
  pack: LoadedArtPack,
  roomTypeSlugs: readonly string[],
  seed: number,
  greyscale: boolean,
): (FloorEntry | null)[] {
  const taken = new Set<string>();
  return roomTypeSlugs.map((slug) => {
    const matches = pack.manifest.floors.filter(
      (f) =>
        f.roomType === slug && pack.images.has(bakedPathFor(f, greyscale)) && !taken.has(f.id),
    );
    if (matches.length === 0) return null;
    const entry = matches[hash(seed, slug) % matches.length]!;
    taken.add(entry.id);
    return entry;
  });
}

// ---------------------------------------------------------------------
// Planning, for loaders that fetch rather than read from disk
// ---------------------------------------------------------------------

/**
 * The baked paths one puzzle will actually reach for.
 *
 * The Node loader reads the whole pack off local disk and does not care.
 * A browser worker does: pulling ~15MB over HTTP to preview one page
 * would be worse than showing no art. So it plans first and fetches only
 * these — typically eight portraits, half a dozen props and half a dozen
 * floors.
 *
 * Computed by running the real resolvers against a pack that claims to
 * hold every listed file. That is deliberate rather than a second
 * implementation: the plan is exactly what resolution will ask for, so
 * the two cannot drift apart and leave a preview fetching files the page
 * never draws (or worse, missing ones it does).
 */
export function planPuzzleArt(
  manifest: ArtManifest,
  puzzle: {
    themeId: string;
    suspects: readonly { id: string }[];
    floorPlan: { rooms: readonly { name: string }[]; landmarks: readonly { name: string }[] };
  },
  seed: number,
  greyscale: boolean,
  slugForRoom: (roomName: string) => string,
): string[] {
  const everything = new Map<string, Uint8Array>();
  for (const e of [...manifest.portraits, ...manifest.furniture, ...manifest.floors]) {
    everything.set(bakedPathFor(e, greyscale), new Uint8Array());
  }
  const pack: LoadedArtPack = { manifest, images: everything };

  const wanted = new Set<string>();
  for (const entry of castPortraits(pack, puzzle.themeId, puzzle.suspects.map((s) => s.id), seed, greyscale)) {
    if (entry) wanted.add(bakedPathFor(entry, greyscale));
  }
  for (const name of new Set(puzzle.floorPlan.landmarks.map((l) => l.name))) {
    const entry = resolveProp(pack, name, puzzle.themeId, seed, greyscale);
    if (entry) wanted.add(bakedPathFor(entry, greyscale));
  }
  const slugs = puzzle.floorPlan.rooms.map((r) => slugForRoom(r.name));
  for (const entry of resolveFloors(pack, slugs, seed, greyscale)) {
    if (entry) wanted.add(bakedPathFor(entry, greyscale));
  }
  return [...wanted];
}
