"use client";

import { useEffect, useMemo, useRef, useState, type DragEvent } from "react";
import {
  formatBytes,
  MAX_ASSET_UPLOAD_BYTES,
  type CustomPageRecord,
  type CustomPageSection,
} from "@kdp/shared";
import { labelForPageKey } from "@/lib/page-labels";
import { CreatePageModal } from "./create-page-modal";

interface AssetsResponse {
  assets: Asset[];
  quota: Quota;
}

// Pure fetch helper — no setState, so it's safe to call from anywhere
// including inside a useEffect. Extracted specifically so the mount effect
// and the mutation handlers share the exact same request shape without two
// copies of the code drifting apart.
async function fetchAssets(): Promise<AssetsResponse | null> {
  const response = await fetch("/api/assets");
  if (!response.ok) return null;
  return response.json();
}

interface Asset {
  id: string;
  customPageId: string | null;
  pageRole: string | null;
  originalName: string;
  byteSize: number;
  width: number;
  height: number;
}

interface Quota {
  usedBytes: number;
  totalBytes: number;
}

export interface AssetGalleryProps {
  /** gallery key (a MatterPageRole, or a CustomPage id) -> assigned asset id, controlled by the parent so it can also feed the live preview and the submit body. */
  pageImages: Record<string, string>;
  onAssign: (key: string, assetId: string | null) => void;
  /** The user's custom pages — owned by the parent so the live preview and the "Create and arrange" tab see the same list. */
  customPages: CustomPageRecord[];
  /** The book's current front/back-matter order — same lists the "Create and arrange" tab reorders, so this tab's pill order always matches. */
  frontOrder: string[];
  backOrder: string[];
  onPageCreated: (
    page: CustomPageRecord,
    section: CustomPageSection,
    index: number,
  ) => void | Promise<void>;
  isEnabled: (key: string) => boolean;
  onPageDeleted: (key: string) => void | Promise<void>;
}

// Which gallery is currently being browsed — any key from frontOrder/backOrder, built-in or custom. Both work identically from here: their own image collection, their own count, the same "use for this page" control.
type GalleryView = { key: string };

/**
 * The front/back-matter image gallery. Every page in the book — see the
 * "Create and arrange" tab for the full list and its ordering — is one
 * entry here, each with its own image collection and its own "Use for
 * this page" control. Assigning an image replaces that page's generated
 * content, reflected live in the Preview tab and in the final export (see
 * packages/generators/grid-mystery/src/render-pdf.ts). Storage is capped
 * per user (see packages/shared/src/asset-limits.ts) and shown as a fill
 * bar so the limit is never a surprise at upload time.
 */
export function AssetGallery({
  pageImages,
  onAssign,
  customPages,
  frontOrder,
  backOrder,
  onPageCreated,
  isEnabled,
  onPageDeleted,
}: AssetGalleryProps) {
  const [assets, setAssets] = useState<Asset[]>([]);
  const [quota, setQuota] = useState<Quota | null>(null);
  const [view, setView] = useState<GalleryView>({ key: frontOrder[0] ?? "titlePage" });
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [blockedKey, setBlockedKey] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function refreshAssets() {
    const data = await fetchAssets();
    if (data) {
      setAssets(data.assets);
      setQuota(data.quota);
    }
  }

  // The IIFE + cancelled-flag pattern is deliberate: the react-hooks
  // set-state-in-effect lint rule refuses any effect that (transitively)
  // calls setState, so calling `refreshAssets()` from here is out. The
  // setState calls here only run after the await resolves, and the
  // cancelled flag guards against a resolve after the component unmounts.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const data = await fetchAssets();
      if (cancelled) return;
      if (data) {
        setAssets(data.assets);
        setQuota(data.quota);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  function isCustomPageKey(key: string) {
    return customPages.some((page) => page.id === key);
  }

  async function uploadFiles(files: FileList | File[]) {
    setUploadError(null);
    setUploading(true);
    const failures: string[] = [];

    for (const file of Array.from(files)) {
      if (file.size > MAX_ASSET_UPLOAD_BYTES) {
        failures.push(`"${file.name}" is too large (max ${formatBytes(MAX_ASSET_UPLOAD_BYTES)})`);
        continue; // still try the rest of the batch — one oversized file shouldn't block the others
      }
      const formData = new FormData();
      formData.append("file", file);
      // Tag the upload with whichever gallery is currently open, so it
      // lands directly in that page's own collection.
      if (isCustomPageKey(view.key)) formData.append("customPageId", view.key);
      else formData.append("pageRole", view.key);

      try {
        const response = await fetch("/api/assets", { method: "POST", body: formData });
        if (!response.ok) {
          // A platform-level rejection (e.g. a request body over the
          // hosting limit) doesn't come back as JSON at all — fall back to
          // a status-based message rather than showing nothing useful.
          const body = await response.json().catch(() => null);
          failures.push(body?.error ?? `"${file.name}" failed (HTTP ${response.status})`);
        }
      } catch {
        failures.push(`"${file.name}" failed — check your connection and try again`);
      }
    }

    setUploading(false);
    if (failures.length > 0) setUploadError(failures.join("; "));
    await refreshAssets();
  }

  async function handleDelete(assetId: string) {
    const response = await fetch(`/api/assets/${assetId}`, { method: "DELETE" });
    if (!response.ok) {
      // Surface the failure instead of silently updating the UI to say
      // "gone" while the server still has it — that's the worst failure
      // mode for a destructive action.
      const body = await response.json().catch(() => null);
      setUploadError(body?.error ?? `Couldn't delete image (HTTP ${response.status})`);
      return;
    }
    for (const [key, id] of Object.entries(pageImages)) {
      if (id === assetId) onAssign(key, null);
    }
    await refreshAssets();
  }

  async function handleCreated(page: CustomPageRecord, section: CustomPageSection, index: number) {
    await onPageCreated(page, section, index);
    // Drop straight into the new page's gallery, ready to upload —
    // otherwise creating one is a dead end until you notice it in the list.
    setView({ key: page.id });
  }

  function selectPage(key: string) {
    if (!isEnabled(key)) {
      setBlockedKey(key);
      return;
    }
    setBlockedKey(null);
    setView({ key });
  }

  async function handleDeletePage(key: string) {
    const label = labelForPageKey(key, customPages);
    if (!window.confirm(`Delete "${label}"? This can't be undone.`)) return;
    const response = await fetch(`/api/custom-pages/${key}`, { method: "DELETE" });
    if (!response.ok) {
      const body = await response.json().catch(() => null);
      setUploadError(body?.error ?? `Couldn't delete "${label}" (HTTP ${response.status})`);
      return;
    }
    await onPageDeleted(key);
    if (blockedKey === key) setBlockedKey(null);
    if (view.key === key) {
      const fallback = [...frontOrder, ...backOrder].find((k) => k !== key);
      if (fallback) setView({ key: fallback });
    }
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragActive(false);
    if (event.dataTransfer.files.length > 0) void uploadFiles(event.dataTransfer.files);
  }

  const usedBytes = quota?.usedBytes ?? 0;
  const totalBytes = quota?.totalBytes ?? 1;
  const usedPct = Math.min(100, (usedBytes / totalBytes) * 100);

  // Every gallery — each built-in role and each custom page — is its own
  // disjoint bucket. An image counts in exactly one of them, so uploading
  // into one never changes any other gallery's count.
  const countByKey = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const asset of assets) {
      const key = asset.pageRole ?? asset.customPageId;
      if (key) counts[key] = (counts[key] ?? 0) + 1;
    }
    return counts;
  }, [assets]);

  const visibleAssets = assets.filter(
    (asset) => (asset.pageRole ?? asset.customPageId) === view.key,
  );
  const galleryTitle = labelForPageKey(view.key, customPages);
  const allKeys = [...frontOrder, ...backOrder];

  return (
    <div className="rounded-lg border border-border bg-surface p-4 sm:p-5">
      <h2 className="text-sm font-semibold tracking-tight">Assign Templates</h2>
      <p className="mt-1 text-xs text-muted-foreground">
        Assign an image to a page to replace its generated content — reflected live in the
        Preview tab.
      </p>

      <div className="mt-3">
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>Storage</span>
          <span className="font-mono tabular-nums">
            {formatBytes(usedBytes)} of {formatBytes(totalBytes)} used
          </span>
        </div>
        <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full transition-[width]"
            style={{
              width: `${usedPct}%`,
              backgroundColor: usedPct >= 90 ? "var(--danger)" : "var(--accent)",
            }}
          />
        </div>
      </div>

      {/* min-w-0 on the grid + every grid item is what actually contains the
          horizontally-scrolling pill rows below. CSS grid items default to
          min-width: auto, which resolves to their max-content intrinsic size
          — a row of whitespace-nowrap pills happily forces its grid item
          (and card) wider than the grid track, spilling out of the parent
          instead of scrolling inside the card as intended. This is the
          "grid overflow" gotcha; the fix is min-width: 0 all the way down. */}
      <div className="mt-4 grid min-w-0 gap-4 lg:grid-cols-[13rem_minmax(0,1fr)]">
        <div className="min-w-0 rounded-md border border-border p-2.5">
          {/* Own bordered card + horizontal scroll below lg: on a narrow
              screen a long vertical list reads as one undifferentiated wall
              of buttons alongside everything else on the page. A boxed,
              horizontally-scrolling pill row reads as "one control" (like a
              segmented picker) at any width, and still becomes the familiar
              vertical sidebar list once there's room for it at lg. */}
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Book pages
          </p>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            Order matches the &ldquo;Create and arrange&rdquo; tab.
          </p>
          <div className="mt-2 flex gap-1.5 overflow-x-auto pb-1 lg:flex-col lg:overflow-visible lg:pb-0 lg:gap-0.5">
            {allKeys.map((key) => {
              const active = view.key === key;
              const enabled = isEnabled(key);
              const removable = isCustomPageKey(key);
              return (
                <div
                  key={key}
                  className={`flex shrink-0 items-center whitespace-nowrap rounded-full text-xs transition-colors lg:rounded-md lg:whitespace-normal ${
                    !enabled
                      ? "bg-muted/40 text-muted-foreground/50 lg:bg-transparent"
                      : active
                        ? "bg-accent text-accent-foreground"
                        : "bg-muted text-foreground hover:bg-border lg:bg-transparent"
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => selectPage(key)}
                    className="flex flex-1 items-center justify-between gap-2 px-3 py-1.5 text-left"
                  >
                    <span className="truncate">{labelForPageKey(key, customPages)}</span>
                    <span
                      className={`flex h-4 min-w-4 shrink-0 items-center justify-center rounded-full px-1 text-[10px] font-medium tabular-nums ${
                        !enabled
                          ? "bg-black/10 text-muted-foreground/50 dark:bg-white/10"
                          : active
                            ? "bg-accent-foreground/20 text-accent-foreground"
                            : pageImages[key]
                              ? "bg-success/20 text-success"
                              : "bg-black/10 text-muted-foreground dark:bg-white/10"
                      }`}
                    >
                      {countByKey[key] ?? 0}
                    </span>
                  </button>
                  {removable ? (
                    <button
                      type="button"
                      onClick={() => handleDeletePage(key)}
                      aria-label={`Delete ${labelForPageKey(key, customPages)}`}
                      className="px-1.5 py-1.5 text-muted-foreground/70 hover:text-danger"
                    >
                      ×
                    </button>
                  ) : null}
                </div>
              );
            })}
          </div>
          {blockedKey ? (
            <div className="mt-2 flex items-start justify-between gap-2 rounded-md border border-border bg-muted/50 p-2 text-[11px] text-muted-foreground">
              <span>
                &ldquo;{labelForPageKey(blockedKey, customPages)}&rdquo; is turned off —
                enable it in the &ldquo;Create and arrange&rdquo; tab to use it.
              </span>
              <button
                type="button"
                onClick={() => setBlockedKey(null)}
                aria-label="Dismiss"
                className="shrink-0 text-muted-foreground hover:text-foreground"
              >
                ×
              </button>
            </div>
          ) : null}
          {pageImages[view.key] ? (
            <button
              type="button"
              onClick={() => onAssign(view.key, null)}
              className="mt-2 text-xs text-muted-foreground underline-offset-4 hover:text-danger hover:underline"
            >
              Clear {galleryTitle.toLowerCase()} image
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => setShowCreateModal(true)}
            className="mt-3 flex items-center gap-1 border-t border-border pt-2.5 text-xs font-medium text-accent hover:underline"
          >
            + Add page
          </button>
        </div>

        <div className="min-w-0">
          <div className="flex items-center justify-between gap-2">
            <p className="min-w-0 truncate text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {galleryTitle} — tap &ldquo;use for this page&rdquo; below an image
            </p>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="shrink-0 rounded-md border border-border px-2.5 py-1 text-xs font-medium hover:bg-muted"
            >
              Upload image
            </button>
          </div>

          <input
            ref={fileInputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            multiple
            hidden
            onChange={(e) => e.target.files && void uploadFiles(e.target.files)}
          />
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDragActive(true);
            }}
            onDragLeave={() => setDragActive(false)}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className={`mt-2 cursor-pointer rounded-md border-2 border-dashed p-4 text-center text-xs transition-colors ${
              dragActive ? "border-accent bg-muted" : "border-border text-muted-foreground"
            }`}
          >
            {uploading ? (
              "Uploading…"
            ) : (
              <>
                Drag images here, or <span className="text-accent underline-offset-4">browse</span>
                {" — PNG, JPEG, or WEBP, up to "}
                {formatBytes(MAX_ASSET_UPLOAD_BYTES)} each
              </>
            )}
          </div>
          {uploadError ? <p className="mt-2 text-xs text-danger">{uploadError}</p> : null}

          {visibleAssets.length === 0 ? (
            <p className="mt-4 text-center text-xs text-muted-foreground">
              No images yet for {galleryTitle.toLowerCase()} — upload one above.
            </p>
          ) : (
            <div className="mt-3 grid grid-cols-3 gap-3 sm:grid-cols-4">
              {visibleAssets.map((asset) => {
                const inUse = pageImages[view.key] === asset.id;
                return (
                  <div
                    key={asset.id}
                    className={`relative aspect-[3/4] overflow-hidden rounded-md border-2 ${
                      inUse ? "border-accent" : "border-border"
                    }`}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element -- user-uploaded content served from our own authenticated API route, not a static asset next/image can optimize */}
                    <img
                      src={`/api/assets/${asset.id}/raw`}
                      alt={asset.originalName}
                      className="h-full w-full object-cover"
                    />
                    {inUse ? (
                      <span className="pointer-events-none absolute left-1 top-1 rounded bg-accent px-1.5 py-0.5 text-[10px] font-medium text-accent-foreground">
                        In use
                      </span>
                    ) : null}
                    <button
                      type="button"
                      onClick={() => handleDelete(asset.id)}
                      aria-label={`Delete ${asset.originalName}`}
                      className="absolute right-1 top-1 flex h-6 w-6 items-center justify-center rounded-full bg-black/70 text-sm text-white"
                    >
                      ×
                    </button>
                    <button
                      type="button"
                      onClick={() => onAssign(view.key, inUse ? null : asset.id)}
                      aria-pressed={inUse}
                      className={`absolute inset-x-0 bottom-0 px-2 py-1.5 text-[11px] font-medium transition-colors ${
                        inUse
                          ? "bg-accent text-accent-foreground"
                          : "bg-black/70 text-white hover:bg-black/85"
                      }`}
                    >
                      {inUse ? "In use — this page" : "Use for this page"}
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      <CreatePageModal
        open={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        frontOrder={frontOrder}
        backOrder={backOrder}
        customPages={customPages}
        onCreated={handleCreated}
      />
    </div>
  );
}
