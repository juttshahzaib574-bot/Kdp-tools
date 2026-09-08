import {
  MATTER_PAGE_ROLES,
  MATTER_PAGE_ROLE_LABELS,
  type CustomPageRecord,
  type MatterPageRole,
} from "@kdp/shared";

export function isBuiltInPageKey(key: string): key is MatterPageRole {
  return (MATTER_PAGE_ROLES as readonly string[]).includes(key);
}

/** Resolves either a built-in MatterPageRole or a CustomPage id to its display label. */
export function labelForPageKey(key: string, customPages: CustomPageRecord[]): string {
  if (isBuiltInPageKey(key)) return MATTER_PAGE_ROLE_LABELS[key];
  return customPages.find((page) => page.id === key)?.name ?? "Untitled page";
}
