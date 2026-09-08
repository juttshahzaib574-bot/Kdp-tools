import type { SectionLayout } from "./page-layout";

// A user-defined front/back-matter page beyond the six built-in roles (see
// page-roles.ts) — e.g. "Series Promo Page". Mirrors the Prisma
// CustomPageSection enum (packages/db/prisma/schema.prisma); kept as a
// plain string union here so packages that don't depend on @kdp/db (the
// renderer, the client bundle) can still use it.
export const CUSTOM_PAGE_SECTIONS = ["FRONT", "BACK"] as const;
export type CustomPageSection = (typeof CUSTOM_PAGE_SECTIONS)[number];

export const CUSTOM_PAGE_SECTION_LABELS: Record<CustomPageSection, string> = {
  FRONT: "Front matter",
  BACK: "Back matter",
};

/** The full shape returned by GET/POST /api/custom-pages. */
export interface CustomPageRecord {
  id: string;
  name: string;
  subtitle: string | null;
  content: string | null;
  section: CustomPageSection;
  position: number;
  // Independent placement per section — see page-layout.ts. Null means "use
  // this page's own default placement," same as an omitted override on a
  // built-in page.
  titleLayout: SectionLayout | null;
  subtitleLayout: SectionLayout | null;
  contentLayout: SectionLayout | null;
}
