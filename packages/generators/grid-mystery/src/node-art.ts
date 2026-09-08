import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { ArtManifest, LoadedArtPack } from "./art";

// Node-side art loading, in its own module so the browser bundle never
// pulls `node:fs` in — the same split fonts already use. The browser
// worker fetches the identical baked files over HTTP instead.

function artRoot(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  // src/ during dev and tests, dist/ once built — assets sits beside both.
  return join(here, "..", "assets", "art");
}

function manifestPath(packId: string): string {
  const here = dirname(fileURLToPath(import.meta.url));
  return join(here, "..", "..", "..", "..", "assets", "packs", packId, "pack.json");
}

const cache = new Map<string, LoadedArtPack>();

/**
 * Loads a whole art pack: the manifest, plus the bytes for every entry
 * that is actually on disk.
 *
 * Missing bytes are skipped rather than thrown, because that is the
 * behaviour a half-filled pack needs — the resolvers treat an entry with
 * no bytes as absent and fall back to procedural art, so a pack holding
 * eleven floors out of twenty-four still improves the pages it can.
 *
 * `greyscale` selects which copy to load. A book is one interior colour
 * throughout, so loading both would double the memory for no gain.
 */
export async function loadNodeArtPack(
  packId: string,
  greyscale: boolean,
): Promise<LoadedArtPack | null> {
  const key = `${packId}|${greyscale}`;
  const hit = cache.get(key);
  if (hit) return hit;

  let manifest: ArtManifest;
  try {
    manifest = JSON.parse(await readFile(manifestPath(packId), "utf8")) as ArtManifest;
  } catch {
    // No pack, no art, procedural everything. Not an error — it is how
    // the engine ran before any artwork existed and must keep running.
    return null;
  }

  const root = artRoot();
  const images = new Map<string, Uint8Array>();
  const entries = [...manifest.portraits, ...manifest.furniture, ...manifest.floors];
  await Promise.all(
    entries.map(async (entry) => {
      const rel = greyscale ? entry.bakedGrey : entry.baked;
      if (!rel) return;
      try {
        images.set(rel, new Uint8Array(await readFile(join(root, rel))));
      } catch {
        /* listed but not baked — resolvers treat it as absent */
      }
    }),
  );

  const pack: LoadedArtPack = { manifest, images };
  cache.set(key, pack);
  return pack;
}
