/**
 * Turns the browsable art library under assets/packs/ into something the
 * renderer can actually use.
 *
 * Two jobs, and the second is the one that matters:
 *
 *   1. MANIFEST. Walk the folders, derive each file's meaning from its
 *      path (role / prop / room type), and write pack.json. Folders are
 *      for humans; this file is the contract, so a file that fails
 *      validation is simply not listed rather than half-used.
 *
 *   2. BAKE. Source art is 900-1664px because that is what an artist
 *      hands over. A portrait prints at 0.45in and a prop at half an
 *      inch — 135 and 150 pixels at 300dpi. Embedding the source would
 *      waste ~150x the pixels in every PDF and walk straight into KDP's
 *      650MB interior cap. So each file is resized once, here, and the
 *      renderer only ever sees the baked copy.
 *
 * Run: node scripts/build-art-pack.mjs
 */
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";

const REPO = path.resolve(import.meta.dirname, "..");
const PACKS_DIR = path.join(REPO, "assets", "packs");
const BAKED_ROOT = path.join(REPO, "packages", "generators", "grid-mystery", "assets", "art");

// Bake sizes. Each is the print size at 300dpi, doubled — the headroom is
// for the two-page dossier spread, which prints portraits far larger than
// the puzzle page does.
const BAKE = {
  portrait: 320, // 0.45in @300dpi = 135px
  prop: 320, // 0.5in @300dpi = 150px
  floor: 512, // tiles across a room, so it is scaled at draw time
};

const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const isImage = (f) => /\.(png|jpe?g)$/i.test(f);

function walk(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    return e.isDirectory() ? walk(p) : isImage(e.name) ? [p] : [];
  });
}

/** Reasons a file is left out of the manifest rather than shipped. */
async function reject(file, meta, kind) {
  if (meta.width < 256 || meta.height < 256) return `too small (${meta.width}x${meta.height}, need 256+)`;
  // A portrait or prop without transparency prints as a rectangle sitting
  // on the page. Floors are meant to be opaque.
  if (kind !== "floor" && !meta.hasAlpha) return "no alpha channel — would print as a white box";
  return null;
}

/**
 * Writes both a colour and a greyscale copy of one asset.
 *
 * Two copies rather than one because pdf-lib cannot recolour an embedded
 * image — an XObject draws with the samples it was embedded with. A KDP
 * black-ink interior is far cheaper to print than colour, so it is the
 * common case, not an afterthought, and it needs real greyscale art
 * rather than a colour image the press desaturates unpredictably.
 *
 * Greyscale is a luminance conversion, not a channel average: sharp's
 * greyscale() is Rec.709 weighted, which keeps a red coat and a green
 * coat from collapsing onto the same tone.
 */
async function bakeOne(src, outRel, size, kind) {
  const out = path.join(BAKED_ROOT, outRel);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  const base = () => {
    let img = sharp(src).resize(size, size, {
      // Props and portraits keep their aspect and their transparency;
      // floors are a texture and may be squared off.
      fit: kind === "floor" ? "fill" : "inside",
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    });
    // Trim the transparent margin an artist leaves around a cut-out, so
    // the drawing fills its slot instead of floating in it.
    if (kind !== "floor") {
      img = img
        .trim({ threshold: 10 })
        .resize(size, size, { fit: "inside", background: { r: 0, g: 0, b: 0, alpha: 0 } });
    }
    return img;
  };
  await base().png({ compressionLevel: 9, palette: kind !== "floor" }).toFile(out);
  const grey = out.replace(/\.png$/, "-grey.png");
  await base().greyscale().png({ compressionLevel: 9, palette: kind !== "floor" }).toFile(grey);
  return fs.statSync(out).size + fs.statSync(grey).size;
}

const THEME_BY_DIR = { manor: "manor", farm: "farm", camp: "camp", "mess-hall": "messHall" };

async function buildPack(packId) {
  const root = path.join(PACKS_DIR, packId);
  const manifest = { id: packId, bakedAt: null, portraits: [], furniture: [], floors: [] };
  const skipped = [];
  let bakedBytes = 0;

  // ---- portraits: portraits/<role>/<file> ----
  for (const file of walk(path.join(root, "portraits"))) {
    const rel = path.relative(root, file);
    const role = rel.split(path.sep)[1];
    const meta = await sharp(file).metadata();
    const why = await reject(file, meta, "portrait");
    if (why) { skipped.push({ rel, why }); continue; }
    const id = `${slug(role)}-${String(manifest.portraits.filter((p) => p.role === role).length + 1).padStart(2, "0")}`;
    const baked = `${packId}/portrait/${id}.png`;
    bakedBytes += await bakeOne(file, baked, BAKE.portrait, "portrait");
    manifest.portraits.push({ id, role, source: rel, baked, bakedGrey: baked.replace(/\.png$/, "-grey.png") });
  }

  // ---- furniture: furniture/<theme>/<prop>/<file> ----
  for (const file of walk(path.join(root, "furniture"))) {
    const rel = path.relative(root, file);
    const parts = rel.split(path.sep);
    if (parts.length < 4) { skipped.push({ rel, why: "not inside furniture/<theme>/<prop>/" }); continue; }
    const theme = THEME_BY_DIR[parts[1]];
    const prop = parts[2];
    if (!theme) { skipped.push({ rel, why: `unknown theme folder "${parts[1]}"` }); continue; }
    const meta = await sharp(file).metadata();
    const why = await reject(file, meta, "prop");
    if (why) { skipped.push({ rel, why }); continue; }
    const n = manifest.furniture.filter((f) => f.prop === prop && f.theme === theme).length + 1;
    const id = `${slug(prop)}-${String(n).padStart(2, "0")}`;
    const baked = `${packId}/prop/${theme}/${id}.png`;
    bakedBytes += await bakeOne(file, baked, BAKE.prop, "prop");
    manifest.furniture.push({ id, prop, theme, source: rel, baked, bakedGrey: baked.replace(/\.png$/, "-grey.png") });
  }

  // ---- floors: floors/<roomType>/<file> ----
  for (const file of walk(path.join(root, "floors"))) {
    const rel = path.relative(root, file);
    const roomType = rel.split(path.sep)[1];
    const meta = await sharp(file).metadata();
    const why = await reject(file, meta, "floor");
    if (why) { skipped.push({ rel, why }); continue; }
    const n = manifest.floors.filter((f) => f.roomType === roomType).length + 1;
    const id = `${slug(roomType)}-${String(n).padStart(2, "0")}`;
    const baked = `${packId}/floor/${id}.png`;
    bakedBytes += await bakeOne(file, baked, BAKE.floor, "floor");
    manifest.floors.push({ id, roomType, source: rel, baked, bakedGrey: baked.replace(/\.png$/, "-grey.png") });
  }

  manifest.bakedAt = new Date().toISOString().slice(0, 10);
  fs.writeFileSync(path.join(root, "pack.json"), JSON.stringify(manifest, null, 2) + "\n");
  return { manifest, skipped, bakedBytes };
}

const packs = fs.readdirSync(PACKS_DIR).filter((d) => fs.statSync(path.join(PACKS_DIR, d)).isDirectory());
for (const packId of packs) {
  const { manifest, skipped, bakedBytes } = await buildPack(packId);
  const n = manifest.portraits.length + manifest.furniture.length + manifest.floors.length;
  console.log(`\n${packId}: ${n} listed  (${manifest.portraits.length} portraits, ${manifest.furniture.length} props, ${manifest.floors.length} floors)`);
  console.log(`  baked: ${(bakedBytes / 1024 / 1024).toFixed(2)} MB`);
  for (const s of skipped) console.log(`  SKIPPED ${s.rel}\n           -> ${s.why}`);
}
