// Upload/storage limits for the front/back-matter image gallery.
//
// This cap is a hosting-platform ceiling first, a print-quality budget
// second: Vercel's serverless functions hard-reject any request body over
// 4.5MB before our route handler ever runs (not configurable, and the
// rejection doesn't even come back as JSON we can parse into a useful
// error). 4MB leaves headroom for multipart/form-data overhead while still
// comfortably covering a full-bleed page at KDP's print resolution (300 DPI
// on the largest supported trim is 2600x3400px, which compresses to a few
// MB as JPEG) — the cap was originally set to 8MB purely from that print
// budget, without checking it against the platform limit; this is the
// corrected value.
export const MAX_ASSET_UPLOAD_BYTES = 4 * 1024 * 1024;

// Every upload is resized down to this on the long edge (see
// apps/web/src/lib/assets.ts) before storage — decouples "whatever the user
// drags in" from what's actually kept and billed against their quota, so a
// 20MB phone photo and a properly-sized source end up costing the same.
export const NORMALIZED_MAX_DIMENSION_PX = 3400;

// Quota is enforced against normalized (post-resize/recompress) bytes, not
// upload size — a real usage cap, not a proxy for it. Flat for now; there's
// only one plan tier today, but this is where a paid-tier multiplier would
// plug in once Subscription.plan actually gates anything.
export const FREE_TIER_STORAGE_QUOTA_BYTES = 200 * 1024 * 1024;

export const ALLOWED_ASSET_MIME_TYPES = ["image/png", "image/jpeg", "image/webp"] as const;

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB"];
  let value = bytes / 1024;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex++;
  }
  return `${value.toFixed(value >= 10 ? 0 : 1)} ${units[unitIndex]}`;
}
