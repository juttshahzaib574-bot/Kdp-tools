// Fetches baked artwork in the browser so a preview draws the SAME
// portraits, props and floors the server export draws.
//
// Without this the preview shows procedural busts and glyphs while the
// exported book shows real art — which is not a preview, it is a
// different book. Same reasoning as load-fonts.js beside it.
//
// The difference from fonts: the whole pack is ~15 MB and one page needs
// perhaps twenty files. So this PLANS first — resolution is pure and runs
// with no bytes at all — and fetches only what the page will actually
// draw. The plan comes from the same resolvers the renderer uses, so a
// preview can never fetch one set and draw another.
import { planPuzzleArt, roomTypeSlug } from "@kdp/generator-grid-mystery";

const manifests = new Map();
const bytes = new Map();

async function manifestFor(packId) {
  if (manifests.has(packId)) return manifests.get(packId);
  let manifest = null;
  try {
    const response = await fetch(`/art/${packId}/pack.json`);
    if (response.ok) manifest = await response.json();
  } catch {
    /* no manifest, no art, procedural preview */
  }
  manifests.set(packId, manifest);
  return manifest;
}

async function fetchAsset(path) {
  if (bytes.has(path)) return bytes.get(path);
  const response = await fetch(`/art/${path}`);
  if (!response.ok) throw new Error(`art fetch failed: ${path} (${response.status})`);
  const data = new Uint8Array(await response.arrayBuffer());
  bytes.set(path, data);
  return data;
}

/**
 * The art one puzzle needs, or undefined.
 *
 * Undefined rather than throwing: a preview drawn with procedural art is
 * far better than a preview that shows an error box. The EXPORT path
 * (apps/worker) has the same fallback for the same reason — a book must
 * ship even when the art library is unreachable.
 *
 * Both caches are module-scoped. A worker previews many puzzles per
 * session and they share a cast; the browser HTTP cache covers restarts.
 */
export async function loadBrowserArtPack(packId, puzzle, seed, greyscale) {
  const manifest = await manifestFor(packId);
  if (!manifest) return undefined;
  try {
    const wanted = planPuzzleArt(manifest, puzzle, seed, greyscale, roomTypeSlug);
    const loaded = await Promise.all(wanted.map(fetchAsset));
    const images = new Map();
    wanted.forEach((path, i) => images.set(path, loaded[i]));
    return { manifest, images };
  } catch {
    return undefined;
  }
}

/**
 * One pack covering every puzzle in a book preview.
 *
 * Planned across all of them and fetched as a union, because the whole
 * book is embedded into one document: a per-puzzle pack would still work
 * but would issue the same fetch repeatedly across a thirty-page preview.
 * The byte cache makes repeats free, so this is mostly about issuing one
 * batch instead of thirty.
 */
export async function loadBrowserArtPackForBook(packId, puzzles, seed, greyscale) {
  const manifest = await manifestFor(packId);
  if (!manifest) return undefined;
  try {
    const wanted = new Set();
    for (const puzzle of puzzles) {
      for (const path of planPuzzleArt(manifest, puzzle, seed, greyscale, roomTypeSlug)) {
        wanted.add(path);
      }
    }
    const paths = [...wanted];
    const loaded = await Promise.all(paths.map(fetchAsset));
    const images = new Map();
    paths.forEach((path, i) => images.set(path, loaded[i]));
    return { manifest, images };
  } catch {
    return undefined;
  }
}
