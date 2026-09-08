// Bundles every Web Worker under src/workers/ into a single-file browser
// script under public/workers/, using esbuild.
//
// Why: Next 16's Turbopack does not compile or bundle files referenced by
// `new Worker(new URL('./worker.ts', import.meta.url))` — it copies the
// source file verbatim to /_next/static/media and serves it with the
// wrong MIME type (video/mp2t for .ts) and unresolvable bare imports
// (@kdp/generator-grid-mystery in the browser). Pre-bundling here to
// public/workers/ produces a single self-contained .js file per worker
// that the browser can load and run directly, with a real
// application/javascript MIME type.
//
// The output filenames match the source filenames — puzzle-sample.worker.js
// stays puzzle-sample.worker.js — so callers reference the bundled
// artifact by a stable public path (/workers/puzzle-sample.worker.js).
import { build } from "esbuild";
import { readdir, mkdir, copyFile, cp, writeFile, readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";

const here = new URL(".", import.meta.url).pathname;
const root = resolve(here, "..");
const srcDir = join(root, "src", "workers");
const outDir = join(root, "public", "workers");

await mkdir(outDir, { recursive: true });

// The interior typefaces are copied into public/fonts/ so the browser
// preview worker can fetch and embed the SAME fonts the server export
// uses. Without this the preview would silently fall back to base-14
// fonts and look different from the printed book — and the whole point
// of the preview is that it shows what will actually print.
const require = createRequire(import.meta.url);
const generatorRoot = dirname(require.resolve("@kdp/generator-grid-mystery/package.json"));
const fontSrcDir = join(generatorRoot, "assets", "fonts");
const fontOutDir = join(root, "public", "fonts");
await mkdir(fontOutDir, { recursive: true });
for (const file of (await readdir(fontSrcDir)).filter((f) => f.endsWith(".ttf"))) {
  await copyFile(join(fontSrcDir, file), join(fontOutDir, file));
}
console.log(`build-workers: copied interior fonts -> public/fonts/`);

// The baked artwork, copied the same way and for the same reason: a
// preview that draws procedural busts while the export draws real
// portraits is not a preview. The browser worker fetches only the files
// one puzzle actually reaches (see planPuzzleArt) rather than the whole
// pack, so the served tree is the full library and the transfer is not.
const artSrcDir = join(generatorRoot, "assets", "art");
const artOutDir = join(root, "public", "art");
await mkdir(artOutDir, { recursive: true });
await cp(artSrcDir, artOutDir, { recursive: true });

// The manifests travel with the art. Copied rather than imported so the
// worker bundle stays free of a 76-entry JSON blob it would carry on
// every page load.
const packsDir = join(root, "..", "..", "assets", "packs");
for (const packId of await readdir(packsDir)) {
  try {
    const manifest = await readFile(join(packsDir, packId, "pack.json"), "utf8");
    await mkdir(join(artOutDir, packId), { recursive: true });
    await writeFile(join(artOutDir, packId, "pack.json"), manifest);
  } catch {
    /* a pack with no manifest simply has no art to serve */
  }
}
console.log(`build-workers: copied baked art -> public/art/`);

const entries = (await readdir(srcDir)).filter((f) => f.endsWith(".worker.js"));
if (entries.length === 0) {
  console.warn(`build-workers: no *.worker.js files found in ${srcDir}`);
}

await Promise.all(
  entries.map(async (name) => {
    const inputPath = join(srcDir, name);
    const outputPath = join(outDir, name);
    await build({
      entryPoints: [inputPath],
      bundle: true,
      format: "iife",
      platform: "browser",
      target: ["es2022"],
      minify: true,
      sourcemap: false,
      outfile: outputPath,
      logLevel: "info",
      // pdf-lib pulls in a Node-shaped fontkit polyfill that references
      // Node built-ins it doesn't actually call in the browser path;
      // stubbing them keeps the bundle small and silent.
      define: {
        "process.env.NODE_ENV": '"production"',
      },
    });
  }),
);
