// Themes the whodunit engine can render. A theme is *both* a visual identity
// (the room names, landmarks, and suspects the puzzle draws from) and the
// framing that becomes each puzzle's auto-generated title ("The Blackwood
// Manor Mystery", "The Sunnybrook Farm Mystery", etc.).
//
// Every theme here now has a real content pack behind it — rooms,
// landmarks, suspect names and an evidence-object pool — in
// packages/generators/grid-mystery/src/content.ts, matched by this `id`.
// Adding a new theme means writing its content pack there and adding a
// row here; the generator/solver code never changes.
export const MYSTERY_THEMES = [
  { id: "manor", label: "Blackwood Manor", ready: true },
  { id: "farm", label: "Sunnybrook Farm", ready: true },
  { id: "camp", label: "Lakeside Camp", ready: true },
  { id: "messHall", label: "Barracks Mess Hall", ready: true },
] as const;

export type MysteryThemeId = (typeof MYSTERY_THEMES)[number]["id"];

export const MYSTERY_THEME_IDS = MYSTERY_THEMES.map((t) => t.id) as [
  MysteryThemeId,
  ...MysteryThemeId[],
];
