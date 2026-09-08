// Per-section placement controls for a page's Title/Subtitle/Content boxes
// (see the "Pages content" tab) — shared between the zod schema (built-in
// page overrides), the CustomPage record, and the renderer, so all three
// agree on the same vocabulary.
//
// "flow" is the default: this section renders directly after whichever
// section came before it, top to bottom (title, then subtitle, then
// content) — the natural reading order. Choosing "top" / "center" /
// "bottom" instead pins that one section to an absolute spot on the page,
// independent of the others — e.g. a Content box pinned to the bottom of
// the page while Title stays flowing at the top. Because each section's
// position is independent, an explicit pin can end up overlapping another
// section; that's the deliberate trade-off of "complete granular control"
// over a same fixed one-size-fits-all layout.
export const SECTION_ALIGNMENTS = ["left", "center", "right"] as const;
export type SectionAlign = (typeof SECTION_ALIGNMENTS)[number];

export const SECTION_POSITIONS = ["flow", "top", "center", "bottom"] as const;
export type SectionPosition = (typeof SECTION_POSITIONS)[number];

export interface SectionLayout {
  align: SectionAlign;
  position: SectionPosition;
}

export const DEFAULT_SECTION_LAYOUT: SectionLayout = { align: "left", position: "flow" };

export const SECTION_ALIGN_LABELS: Record<SectionAlign, string> = {
  left: "Left",
  center: "Center",
  right: "Right",
};

export const SECTION_POSITION_LABELS: Record<SectionPosition, string> = {
  flow: "Follows the section above",
  top: "Top of the page",
  center: "Middle of the page",
  bottom: "Bottom of the page",
};
