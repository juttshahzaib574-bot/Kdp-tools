import { z } from "zod";
import { DIFFICULTY_TIER_IDS, normalizeDifficultyTier } from "../difficulty";
import { MIX_MODES, REMAINDER_POLICIES } from "../mix-planner";
import { COLOR_TIERS, INTERIOR_COLORS, PAPER_TYPES, PAPER_TYPES_BY_INTERIOR_COLOR } from "../kdp";
import { MYSTERY_THEME_IDS } from "../mystery-themes";
import { SECTION_ALIGNMENTS, SECTION_POSITIONS } from "../page-layout";

// A single section's placement — see page-layout.ts for what each value
// means. Always present on the wire (the "Pages content" UI always shows
// a live Position/Alignment control, never a tri-state "unset"), so this
// isn't itself optional — a whole title/subtitle/content section is
// skipped by omitting its *text*, not its layout.
export const sectionLayoutSchema = z.object({
  align: z.enum(SECTION_ALIGNMENTS),
  position: z.enum(SECTION_POSITIONS),
});
export type SectionLayoutInput = z.infer<typeof sectionLayoutSchema>;

// One optional asset id per gallery — either a built-in MatterPageRole (see
// ../page-roles) or a user-defined CustomPage id — assigning an image here
// replaces that page's generated content in the export. A plain string
// record rather than a fixed-key object because the set of custom-page ids
// is per-user and unbounded, unlike the fixed six built-in roles.
export const pageImageAssignmentsSchema = z.record(z.string(), z.string().min(1));
export type PageImageAssignments = z.infer<typeof pageImageAssignmentsSchema>;

// A page's own typed text — every front/back-matter page (built-in or
// custom) uses this same shape uniformly, from the "Pages content" tab.
// All three are optional and independent: a blank title/subtitle just
// means "no override, use the default"; a blank content means "keep this
// page's generated text" for the pages that have any (Copyright, How to
// Solve, Review Request) or "nothing to show" for the ones that don't
// (Dedication, About the Author, every custom page) — see each page's own
// render function in render-pdf.ts for its exact fallback.
export const pageOverrideSchema = z.object({
  title: z.string().trim().max(120).optional(),
  subtitle: z.string().trim().max(160).optional(),
  content: z.string().trim().max(2000).optional(),
  // Independent placement per section — see sectionLayoutSchema above.
  // Omitted entirely (not just blank) means "use this page's own default
  // placement," so a page nobody has touched the layout controls for
  // renders exactly as it always has.
  titleLayout: sectionLayoutSchema.optional(),
  subtitleLayout: sectionLayoutSchema.optional(),
  contentLayout: sectionLayoutSchema.optional(),
});
export type PageOverride = z.infer<typeof pageOverrideSchema>;
export const pageOverridesSchema = z.record(z.string(), pageOverrideSchema);
export type PageOverrides = z.infer<typeof pageOverridesSchema>;

// User-supplied input for a grid-mystery ("whodunit logic grid") puzzle
// book. Validated at the API boundary before it ever reaches the generator,
// so a malformed or hostile request can't crash the worker. gridSize is
// clamped to the range the deduction engine has actually been benchmarked
// reliable at — see packages/generators/grid-mystery/src/generate.ts.
export const gridMysteryInputSchema = z
  .object({
    title: z.string().trim().min(1).max(120),
    gridSize: z.number().int().min(6).max(8),
    // All five UI tiers are engine-native — see DIFFICULTY_CONFIG in the
    // grid-mystery clues module: each tier has its own starting
    // clue-strength AND its own clue-drop budget so Expert and Extreme are
    // measurably harder than Hard, not relabeled aliases.
    // Preprocessed so a book saved under a retired tier id still opens —
    // inputParams is stored JSON, not code, and the fifth tier was
    // renamed. See normalizeDifficultyTier.
    difficulty: z.preprocess(normalizeDifficultyTier, z.enum(DIFFICULTY_TIER_IDS)),
    /**
     * How the book's difficulty is spread across its puzzles.
     *
     * Omitted means the progressive ramp (10/25/30/20/15 across the five
     * tiers), which is what a real puzzle book does — open gently, build,
     * finish hard. The `difficulty` field above is then only the tier the
     * Generate tab rolls its sample previews at.
     *
     * Before this existed the whole book was built at one tier, which
     * combined with the old rounding produced books like "29 Medium and
     * 1 Expert" — neither a single-difficulty book nor a ramp.
     */
    mix: z
      .object({
        mode: z.enum(MIX_MODES),
        weights: z
          .record(z.enum(DIFFICULTY_TIER_IDS), z.number().min(0).max(1000))
          .optional(),
        sequence: z
          .array(
            z.object({
              tier: z.preprocess(normalizeDifficultyTier, z.enum(DIFFICULTY_TIER_IDS)),
              count: z.number().int().min(0).max(100),
            }),
          )
          .max(5)
          .optional(),
        remainderPolicy: z.enum(REMAINDER_POLICIES).optional(),
      })
      .optional(),
    // Which visual/thematic content pack the puzzle draws from (rooms,
    // suspects, landmarks, evidence objects). Every theme in
    // MYSTERY_THEMES now has a real content pack behind it.
    theme: z.enum(MYSTERY_THEME_IDS).default("manor"),
    trimSize: z.enum(["6x9", "7x10", "8.5x11"]),
    /**
     * How many verified puzzles the book contains — a real KDP puzzle
     * book has dozens to a hundred+. The worker generates this many
     * puzzles with distinct seeds and the renderer walks them in order,
     * with one combined Answer Key at the end (see render-pdf.ts).
     * Capped at 100 to keep per-book generation time bounded; a longer
     * batch is better split across multiple books.
     */
    puzzleCount: z.number().int().min(1).max(100).default(30),
    /**
     * Two-page-spread layout mode. "packed" is the historical default —
     * puzzles run back-to-back and the answer sheet lands wherever it
     * lands. "onePerSpread" pads with a blank left page before each
     * puzzle so every puzzle starts on the right-hand page of a spread
     * (the premium puzzle-book layout). Roughly doubles page count.
     */
    puzzlesPerSpread: z.enum(["packed", "onePerSpread"]).default("packed"),
    includeAnswerKey: z.boolean().default(true),
    // KDP interior print options. Stored per book so the cover-generator
    // can size the spine correctly AND so the interior renders in the
    // right mode — the renderer honours this now (see palette.ts): colour
    // by default, greyscale when black-and-white is chosen, which is what
    // KDP wants a B&W interior supplied as.
    interiorColor: z.enum(INTERIOR_COLORS).default("color"),
    /**
     * How strongly floor artwork is drawn, as a percentage.
     *
     * Two values because they are two different problems. In colour the
     * floor is competing with the grid's ink, so it is held back; in a
     * black-ink interior the floor image is the main thing separating one
     * room from another, so it is allowed more. Both defaults were set by
     * rendering the same page at several values and comparing, not by
     * taste — but taste is exactly what should override them, which is
     * why they are here rather than as constants in the renderer.
     */
    floorStrengthColor: z.number().int().min(0).max(100).default(38),
    floorStrengthGrey: z.number().int().min(0).max(100).default(30),
    /**
     * How far apart room fills sit in lightness, as a percentage.
     *
     * 0 gives every room the same value, so they are told apart by hue
     * alone — which is nothing at all once the book prints in black ink.
     * 100 spends the whole printable band.
     */
    roomContrast: z.number().int().min(0).max(100).default(55),
    /**
     * Suspect-card corner style. A soft corner reads as a modern card and
     * a hard one as a case file — both are right for some books, so
     * neither is the engine's call.
     */
    cardCorners: z.enum(["rounded", "square"]).default("rounded"),
    paperType: z.enum(PAPER_TYPES).default("white"),
    /**
     * Which colour tier the publisher will order at KDP. Ignored for a
     * black-and-white interior.
     *
     * We render the same PDF either way — but the tiers print on
     * different paper stock, so they give different SPINE WIDTHS for the
     * same page count (see COLOR_TIERS in ../kdp). Defaulting to
     * standard: it's the cheaper tier and the usual choice for a puzzle
     * book, and defaulting to premium would over-widen every spine.
     * Defaulted rather than required so books saved before this field
     * existed still open.
     */
    colorTier: z.enum(COLOR_TIERS).default("standard"),
    /** Full-bleed images run to the trimmed edge; adds 0.125" on all outer sides at export time. */
    bleed: z.boolean().default(false),
    // Cover Studio metadata — used only to render the full-wrap cover PDF, not
    // the interior. authorName is required because KDP requires an author
    // name on every listing; subtitle/blurb are optional dressing.
    authorName: z.string().trim().min(1).max(120),
    subtitle: z.string().trim().max(160).optional(),
    blurb: z.string().trim().max(600).optional(),
  // The four built-ins with a fixed on/off switch; a real published book
  // has all of them on by default. Dedication and About the Author have no
  // such switch — presence of text (in pageOverrides) is what includes
  // them, so there's nothing to keep in sync with a blank field.
  includeTitlePage: z.boolean().default(true),
  includeCopyrightPage: z.boolean().default(true),
  includeHowToSolvePage: z.boolean().default(true),
  includeReviewRequestPage: z.boolean().default(true),
  pageImages: pageImageAssignmentsSchema.optional(),
  // Every non-title built-in page's own typed title/subtitle/content —
  // see pageOverrideSchema above.
  pageOverrides: pageOverridesSchema.optional(),
  // Explicit page sequence — see RenderGridMysteryPdfOptions in
  // packages/generators/grid-mystery/src/render-pdf.ts for exactly what
  // these three control. Omit any of them for the historical fixed order
  // and no extra exclusions.
    frontMatterOrder: z.array(z.string()).optional(),
    backMatterOrder: z.array(z.string()).optional(),
    disabledPageKeys: z.array(z.string()).optional(),
  })
  // KDP couples color choice with paper stock (cream on B&W only, color
  // paper on color interiors only). Enforcing here so a bad combination
  // fails validation at the API boundary rather than at KDP's own
  // validator hours after upload.
  .refine(
    (data) => PAPER_TYPES_BY_INTERIOR_COLOR[data.interiorColor].includes(data.paperType),
    { message: "Paper stock isn't valid for this interior color.", path: ["paperType"] },
  );

export type GridMysteryInput = z.infer<typeof gridMysteryInputSchema>;
