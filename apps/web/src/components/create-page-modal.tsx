"use client";

import { useState, type FormEvent } from "react";
import {
  CUSTOM_PAGE_SECTIONS,
  CUSTOM_PAGE_SECTION_LABELS,
  type CustomPageRecord,
  type CustomPageSection,
} from "@kdp/shared";
import { labelForPageKey } from "@/lib/page-labels";
import { ReorderablePageList, type ReorderableItem } from "./reorderable-page-list";

const inputClass =
  "w-full rounded-md border border-border bg-surface px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-accent/30";

const NEW_PAGE_KEY = "__new__";

export interface CreatePageModalProps {
  open: boolean;
  onClose: () => void;
  frontOrder: string[];
  backOrder: string[];
  customPages: CustomPageRecord[];
  /** index is this page's position within its section's order, 0-based. */
  onCreated: (page: CustomPageRecord, section: CustomPageSection, index: number) => void | Promise<void>;
}

/**
 * The "+ Add page" popup, shared by the Images tab's gallery and the
 * "Create and arrange" tab so there's exactly one page-creation flow.
 * Position is chosen visually — the new page is dropped into a live preview
 * of that section's actual pages and dragged (or moved with the arrows) to
 * where it belongs — rather than typed as a raw number, which is both
 * harder to reason about ("where's slot 3, exactly?") and, as a bare
 * `<input type="number">`, prone to the browser preserving a leading zero
 * from the previous keystroke instead of replacing it.
 */
export function CreatePageModal({
  open,
  onClose,
  frontOrder,
  backOrder,
  customPages,
  onCreated,
}: CreatePageModalProps) {
  const [name, setName] = useState("");
  const [section, setSection] = useState<CustomPageSection>("BACK");
  const [content, setContent] = useState("");
  const [previewOrder, setPreviewOrder] = useState<string[]>([]);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Resets the form exactly on the false->true transition — not a
  // useEffect (see the matching pattern, and its rationale, in
  // dashboard/new/page.tsx) so it never re-fires on every frontOrder/
  // backOrder change while open, which would fight the user's own
  // in-progress drag.
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setName("");
      setContent("");
      setError(null);
      setSection("BACK");
      setPreviewOrder([...backOrder, NEW_PAGE_KEY]);
    }
  }

  function selectSection(next: CustomPageSection) {
    setSection(next);
    setPreviewOrder([...(next === "FRONT" ? frontOrder : backOrder), NEW_PAGE_KEY]);
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!name.trim()) return;
    setCreating(true);
    setError(null);
    const position = previewOrder.indexOf(NEW_PAGE_KEY);
    const response = await fetch("/api/custom-pages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: name.trim(),
        content: content.trim() || undefined,
        section,
        position,
      }),
    });
    setCreating(false);
    if (!response.ok) {
      const body = await response.json().catch(() => null);
      setError(body?.error ?? "Couldn't create that page. Please try again.");
      return;
    }
    const { customPage } = (await response.json()) as { customPage: CustomPageRecord };
    await onCreated(customPage, section, position);
    onClose();
  }

  if (!open) return null;

  const previewItems: ReorderableItem[] = previewOrder.map((key) => ({
    key,
    label: key === NEW_PAGE_KEY ? name.trim() || "New page" : labelForPageKey(key, customPages),
  }));

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <form
        onSubmit={handleSubmit}
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[90vh] w-full max-w-sm flex-col rounded-lg border border-border bg-surface p-4 sm:p-5"
      >
        <h3 className="text-sm font-semibold">Add a page</h3>
        <p className="mt-1 text-xs text-muted-foreground">
          Creates a new front/back-matter page alongside the built-in ones — it appears in every
          book you generate.
        </p>

        <div className="mt-4 flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto pr-0.5">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="newPageName" className="text-xs font-medium">
              Page name
            </label>
            <input
              id="newPageName"
              required
              autoFocus
              maxLength={60}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Series Promo Page"
              className={inputClass}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <span className="text-xs font-medium">Where in the book</span>
            <div className="flex gap-2">
              {CUSTOM_PAGE_SECTIONS.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => selectSection(s)}
                  className={`flex-1 rounded-md border px-2 py-1.5 text-xs font-medium transition-colors ${
                    section === s
                      ? "border-accent bg-accent/10 text-accent"
                      : "border-border text-muted-foreground hover:bg-muted"
                  }`}
                >
                  {CUSTOM_PAGE_SECTION_LABELS[s]}
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <span className="text-xs font-medium">
              Position <span className="font-normal text-muted-foreground">— drag ⠿, or use ▲▼</span>
            </span>
            <ReorderablePageList
              items={previewItems}
              onReorder={setPreviewOrder}
              highlightKey={NEW_PAGE_KEY}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="newPageContent" className="text-xs font-medium">
              Page content <span className="font-normal text-muted-foreground">(optional)</span>
            </label>
            <textarea
              id="newPageContent"
              rows={4}
              maxLength={2000}
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="You can add content here if you want, or upload an image for this page later and use it as a direct swap in the PDF."
              className={inputClass}
            />
          </div>

          {error ? <p className="text-xs text-danger">{error}</p> : null}
        </div>

        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-border px-3 py-1.5 text-xs font-medium hover:bg-muted"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={creating}
            className="rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-accent-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {creating ? "Adding…" : "Add page"}
          </button>
        </div>
      </form>
    </div>
  );
}
