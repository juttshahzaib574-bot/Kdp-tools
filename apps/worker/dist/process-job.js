import { prisma } from "@kdp/db";
import { gridMysteryInputSchema, sectionLayoutSchema, toEngineDifficulty, } from "@kdp/shared";
import { applyOverrides, generateGridMystery, renderGridMysteryPdf, } from "@kdp/generator-grid-mystery";
// Node-only subpath: reads the bundled TTFs from disk. KDP rejects
// interiors whose fonts aren't embedded, so this is not optional on the
// export path — see packages/generators/grid-mystery/src/fonts.ts.
import { loadNodeBookFonts } from "@kdp/generator-grid-mystery/node";
import { loadNodeArtPack } from "@kdp/generator-grid-mystery/node-art";
import { MAX_JOB_ATTEMPTS } from "./claim-job";
import { logger } from "./logger";
import { downloadObject, uploadPdf } from "./storage";
/**
 * Resolves each gallery -> assetId assignment (keyed by a built-in
 * MatterPageRole or a CustomPage id — both work identically from here) to
 * actual image bytes, scoped to `userId` so a book can never embed another
 * user's private asset even if a client somehow submitted a foreign asset
 * id (the API route validates this too, at submission time — this is
 * defense in depth, not the only check). A missing asset, a foreign asset,
 * or object storage being unreachable all degrade the same way: skip that
 * image and let the page fall back to its generated content, rather than
 * failing the whole book over one bad image reference.
 */
async function resolvePageImages(userId, assignments) {
    const entries = Object.entries(assignments ?? {}).filter((entry) => Boolean(entry[1]));
    if (entries.length === 0)
        return {};
    const assets = await prisma.asset.findMany({
        where: { id: { in: entries.map(([, assetId]) => assetId) }, userId },
    });
    const assetById = new Map(assets.map((asset) => [asset.id, asset]));
    const result = {};
    for (const [key, assetId] of entries) {
        const asset = assetById.get(assetId);
        if (!asset) {
            logger.warn("page image assignment references a missing or foreign asset — skipping", {
                key,
                assetId,
            });
            continue;
        }
        const bytes = await downloadObject(asset.fileKey);
        if (!bytes) {
            logger.warn("could not read asset bytes — skipping", { key, assetId });
            continue;
        }
        result[key] = bytes;
    }
    return result;
}
/** Parses a CustomPage's Json layout column back into a SectionLayout, or null for anything malformed/absent — the renderer's own default takes over from there, same as for a built-in page's omitted override layout. */
function asSectionLayout(value) {
    const parsed = sectionLayoutSchema.safeParse(value);
    return parsed.success ? parsed.data : null;
}
/**
 * Every custom page the user has defined, reused across every book they
 * generate — the same account-wide-reusable model as a built-in role's
 * gallery, not scoped to one book. Ordered by position within each
 * section so the renderer can just append front-matter and back-matter
 * custom pages as two blocks, in the order given.
 */
async function loadCustomPages(userId) {
    const rows = await prisma.customPage.findMany({
        where: { userId },
        orderBy: [{ section: "asc" }, { position: "asc" }, { createdAt: "asc" }],
    });
    return rows.map((row) => ({
        id: row.id,
        name: row.name,
        subtitle: row.subtitle,
        content: row.content,
        section: row.section,
        titleLayout: asSectionLayout(row.titleLayout),
        subtitleLayout: asSectionLayout(row.subtitleLayout),
        contentLayout: asSectionLayout(row.contentLayout),
    }));
}
/**
 * Resolves the book's puzzles.
 *
 * A book that has been through the Customize tab owns durable Puzzle
 * rows — a seed and a difficulty per slot, plus whatever the publisher
 * renamed or retitled. Those rows ARE the book: re-rolling fresh random
 * puzzles here would silently discard every reroll and every edit the
 * publisher made, which is the one thing the tab must never do.
 *
 * A book created before that tab existed, or one submitted straight from
 * Generate, has no rows; it falls back to the historical behaviour of
 * drawing `puzzleCount` fresh seeds at the book's single difficulty.
 *
 * Either way generation is deterministic and every puzzle is verified by
 * generateGridMystery itself, so a stored seed reproduces exactly the
 * puzzle the publisher approved on screen.
 */
async function loadBookPuzzles(bookId, input) {
    const rows = await prisma.puzzle.findMany({
        where: { bookId },
        orderBy: { index: "asc" },
    });
    if (rows.length === 0) {
        const engineDifficulty = toEngineDifficulty(input.difficulty);
        const puzzles = Array.from({ length: input.puzzleCount }, () => generateGridMystery({
            gridSize: input.gridSize,
            difficulty: engineDifficulty,
            themeId: input.theme,
            seed: Math.floor(Math.random() * 2 ** 31),
        }));
        return {
            puzzles,
            caseTitles: puzzles.map(() => undefined),
            caseSubtitles: puzzles.map(() => undefined),
        };
    }
    const puzzles = [];
    const caseTitles = [];
    const caseSubtitles = [];
    for (const row of rows) {
        // The row's difficulty is the tier the puzzle EARNED, and the seed
        // reproduces it exactly — so this regenerates the same puzzle, it
        // doesn't roll a new one at the same tier.
        const overrides = asPuzzleOverrides(row.overrides);
        const puzzle = generateGridMystery({
            gridSize: row.gridSize,
            difficulty: toEngineDifficulty(row.difficulty),
            themeId: input.theme,
            seed: row.seed,
        });
        puzzles.push(applyOverrides(puzzle, overrides ?? undefined));
        caseTitles.push(overrides?.title);
        caseSubtitles.push(overrides?.subtitle);
    }
    return { puzzles, caseTitles, caseSubtitles };
}
/** Reads a Puzzle row's Json overrides column back into its typed shape; anything malformed is treated as "no overrides" rather than failing the export. */
function asPuzzleOverrides(value) {
    return value && typeof value === "object" && !Array.isArray(value)
        ? value
        : null;
}
/**
 * Processes exactly one claimed job. Every failure path here re-queues (if
 * attempts remain) or marks the job/book FAILED — it never throws back out
 * to the caller, so one bad job can't take down the worker's main loop.
 *
 * Generation here is fully deterministic (no LLM call, no external API,
 * no per-book variable cost) — the puzzle is built and verified locally,
 * so the only failure modes are bugs, not a third-party outage or bill.
 */
export async function processJob(job) {
    const book = await prisma.book.findUniqueOrThrow({ where: { id: job.bookId } });
    try {
        const input = gridMysteryInputSchema.parse(book.inputParams);
        // The book's puzzles: its saved Puzzle rows when it has them, fresh
        // seeds at the book's difficulty when it doesn't. All five UI tiers
        // are engine-native (see DIFFICULTY_CONFIG in clues.ts): different
        // starting clue-strength AND a difficulty-scaled clue-drop budget, so
        // Expert and Extreme are measurably harder than Hard rather than
        // aliases for it.
        const { puzzles, caseTitles, caseSubtitles } = await loadBookPuzzles(book.id, input);
        // The art pack is loaded for the interior colour the book actually
        // prints in: pdf-lib cannot recolour an embedded image, so a
        // black-ink book needs the greyscale copies, and loading both would
        // double the memory for no gain. A pack that fails to load is null
        // and every page falls back to procedural art — the export must
        // still ship, the same way it did before any artwork existed.
        const [pageImages, customPages, fontBytes, artPack] = await Promise.all([
            resolvePageImages(book.userId, input.pageImages),
            loadCustomPages(book.userId),
            loadNodeBookFonts(),
            loadNodeArtPack("noir-1930s", input.interiorColor === "blackAndWhite"),
        ]);
        const { pdf, pageCount } = await renderGridMysteryPdf(puzzles, {
            bookTitle: book.title,
            trimSize: input.trimSize,
            includeAnswerKey: input.includeAnswerKey,
            matter: {
                authorName: input.authorName,
                subtitle: input.subtitle,
                includeTitlePage: input.includeTitlePage,
                includeCopyrightPage: input.includeCopyrightPage,
                includeHowToSolvePage: input.includeHowToSolvePage,
                includeReviewRequestPage: input.includeReviewRequestPage,
            },
            artPack: artPack ?? undefined,
            pageImages,
            customPages,
            frontMatterOrder: input.frontMatterOrder,
            backMatterOrder: input.backMatterOrder,
            disabledPageKeys: input.disabledPageKeys,
            pageOverrides: input.pageOverrides,
            puzzlesPerSpread: input.puzzlesPerSpread,
            interiorColor: input.interiorColor,
            // Percentages on the wire, 0..1 in the renderer: the schema speaks
            // the language of a slider, the engine speaks the language of an
            // opacity, and this is the one place they meet.
            floorStrength: (input.interiorColor === "blackAndWhite"
                ? input.floorStrengthGrey
                : input.floorStrengthColor) / 100,
            roomContrast: input.roomContrast / 100,
            cardCorners: input.cardCorners,
            bleed: input.bleed,
            fontBytes,
            caseTitles,
            caseSubtitles,
        });
        const resultFileKey = await uploadPdf(book.id, pdf, "interior");
        // No cover is generated here any more, and that is deliberate.
        //
        // KDP takes the cover as its own upload, and cover art is the single
        // biggest driver of clicks on a listing — a procedurally drawn one
        // from a puzzle engine would be the worst-looking thing we ship, and
        // publishers design covers in Canva regardless. What they genuinely
        // cannot get there is the arithmetic: the wrap size depends on the
        // spine, and the spine depends on this interior's page count. So the
        // app hands over the spec and a printable guide instead (see
        // apps/web/src/components/cover-spec.tsx), and leaves the design to
        // the designer.
        //
        await prisma.$transaction([
            prisma.generationJob.update({
                where: { id: job.id },
                data: { status: "SUCCEEDED", finishedAt: new Date(), resultFileKey },
            }),
            prisma.book.update({
                where: { id: book.id },
                data: { status: "READY" },
            }),
        ]);
        // The rendered length is worth recording: it's what a publisher's
        // cover spine is ultimately cut to, and the only place the real
        // number (rather than the estimate the UI shows) exists.
        logger.info("job succeeded", { jobId: job.id, bookId: book.id, pageCount });
    }
    catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        logger.error("job failed", {
            jobId: job.id,
            bookId: book.id,
            attempts: job.attempts,
            error: message,
        });
        const willRetry = job.attempts < MAX_JOB_ATTEMPTS;
        await prisma.$transaction([
            prisma.generationJob.update({
                where: { id: job.id },
                data: {
                    status: willRetry ? "QUEUED" : "FAILED",
                    error: message,
                    finishedAt: willRetry ? null : new Date(),
                },
            }),
            prisma.book.update({
                where: { id: book.id },
                data: { status: willRetry ? "QUEUED" : "FAILED" },
            }),
        ]);
    }
}
