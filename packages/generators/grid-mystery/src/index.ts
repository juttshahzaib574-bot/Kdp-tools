export {
  generateGridMystery,
  generateWithProof,
  PuzzleVerificationFailedError,
  type GenerateGridMysteryOptions,
  type GeneratedWithProof,
} from "./generate";
export {
  TECHNIQUES,
  describeProfile,
  isDeducible,
  solvableFrom,
  solveByTechnique,
  structureClues,
  techniqueRank,
  type SolvableInput,
  type Technique,
  type TechniqueProfile,
} from "./technique-solver";
export {
  MANOR_THEME,
  FARM_THEME,
  CAMP_THEME,
  MESS_HALL_THEME,
  THEMES,
  themeById,
  type ThemeContent,
} from "./content";
export { countSolutions, type SolveStats } from "./solve";
export {
  CALIBRATION_TIERS,
  classifyDepth,
  isAcceptableForTier,
  recommendedGridSize,
  tierDistance,
  type SolveDepth,
} from "./calibration";
export {
  caseTitleFor,
  caseTitleVariants,
  caseBriefFor,
  howToSolveFor,
  resolveCaseTitles,
} from "./case-titles";
export {
  suspectToken,
  renderTemplate,
  resolveNames,
  applyOverrides,
  heightEditInvalidatesClues,
  type PuzzleOverrides,
} from "./text-template";
// NOTE: loadNodeBookFonts is deliberately NOT re-exported here — it imports
// node:fs, which would break the browser Web Worker bundle that imports this
// index. Node callers use the "@kdp/generator-grid-mystery/node" subpath.
export { loadBookFonts, BOOK_FONT_FILES, type BookFontBytes, type BookFonts } from "./fonts";
export { paletteFor, type Palette } from "./palette";
export {
  TEXTURE_FAMILIES,
  MAX_DELTA,
  paintTextureCell,
  surfaceForRoom,
  roomTypeSlug,
  surfacesForRooms,
  candidateFamilies,
  textureInk,
  type TextureFamily,
  type TextureIntensity,
  type TextureParams,
} from "./textures";
export * from "./types";
export {
  renderGridMysteryPdf,
  renderPuzzleOnlyPdf,
  type RenderCustomPage,
  type RenderGridMysteryPdfOptions,
  type RenderPuzzleOnlyPdfOptions,
  type RenderedGridMysteryPdf,
} from "./render-pdf";
// No cover renderer any more. KDP takes the cover as a separate upload,
// cover art is the biggest driver of clicks on a listing, and a
// procedurally drawn one would be the worst-looking thing this ships —
// so the app hands over the wrap SPEC (size, spine, barcode reserve) and
// a printable guide instead, and leaves the design to a design tool.
// The spine arithmetic lives on in @kdp/shared/cover, which is the part
// Canva genuinely can't work out for you.
export { DEFAULT_MATTER_TOGGLES, type BookMatterOptions } from "./matter";

export {
  EXTREME_MIN_CHAIN,
  TIER_CONTRACT,
  certifiesAs,
  gradePuzzle,
  tierFor,
  type DeductiveTechnique,
  type TierContract,
  type TierGrade,
} from "./tier-contract";

// Real artwork. Resolution is pure (art.ts); bytes are loaded at the
// edges (node-art.ts here, a fetch loader in the browser worker), the
// same split the fonts use.
export {
  bakedPathFor,
  castPortraits,
  planPuzzleArt,
  resolveFloor,
  resolveFloors,
  resolveProp,
  rolesForTheme,
  type ArtEntry,
  type ArtManifest,
  type FloorEntry,
  type LoadedArtPack,
  type PortraitEntry,
  type PropEntry,
} from "./art";
export { embedPuzzleArt, type PuzzleArt } from "./art-embed";

// Walkthrough generation for publisher review cards
export {
  generateWalkthrough,
  formatWalkthroughForPrint,
  type PuzzleWalkthrough,
  type WalkthroughStep,
} from "./walkthrough";

// Certification badge system
export {
  generateCertificationBadge,
  renderCertificationBadge,
  createCompactBadge,
  type CertificationBadge,
} from "./certification";
