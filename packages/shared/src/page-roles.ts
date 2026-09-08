// The front/back-matter page types a user can assign an uploaded image to,
// replacing that page's generated text content in the exported PDF. Shared
// between the zod input schema, the renderer, and the client-side gallery UI
// so all three stay in sync — add a role here once and it exists everywhere.
export const MATTER_PAGE_ROLES = [
  "titlePage",
  "copyrightPage",
  "dedicationPage",
  "howToSolvePage",
  "aboutAuthorPage",
  "reviewRequestPage",
] as const;

export type MatterPageRole = (typeof MATTER_PAGE_ROLES)[number];

export const MATTER_PAGE_ROLE_LABELS: Record<MatterPageRole, string> = {
  titlePage: "Title Page",
  copyrightPage: "Copyright Page",
  dedicationPage: "Dedication Page",
  howToSolvePage: "How to Solve Page",
  aboutAuthorPage: "About the Author Page",
  reviewRequestPage: "Review Request Page",
};
