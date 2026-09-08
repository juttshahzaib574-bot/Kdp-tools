"use client";

import { useState } from "react";
import type { CustomPageRecord, CustomPageSection } from "@kdp/shared";
import { CreatePageModal } from "./create-page-modal";
import { isBuiltInPageKey, labelForPageKey } from "@/lib/page-labels";
import { ReorderablePageList, type ReorderableItem } from "./reorderable-page-list";

const HINT_KEYS = new Set(["dedicationPage", "aboutAuthorPage"]);

export interface PageArrangerProps {
  frontOrder: string[];
  backOrder: string[];
  onReorderFront: (keys: string[]) => void;
  onReorderBack: (keys: string[]) => void;
  isEnabled: (key: string) => boolean;
  onToggle: (key: string) => void;
  customPages: CustomPageRecord[];
  onPageCreated: (
    page: CustomPageRecord,
    section: CustomPageSection,
    index: number,
  ) => void | Promise<void>;
  onPageDeleted: (key: string) => void | Promise<void>;
}

function toItems(
  order: string[],
  customPages: CustomPageRecord[],
  isEnabled: (key: string) => boolean,
): ReorderableItem[] {
  return order.map((key) => ({
    key,
    label: labelForPageKey(key, customPages),
    enabled: isEnabled(key),
    removable: !isBuiltInPageKey(key),
    hint:
      HINT_KEYS.has(key) || !isBuiltInPageKey(key)
        ? "Skips automatically if it ends up with no image and no content"
        : undefined,
  }));
}

/**
 * The book's full front/back-matter sequence — every built-in page plus
 * every custom page, in one place, reorderable exactly the same way as the
 * position picker inside the create-page popup (same ReorderablePageList).
 * Checking a page off here only controls whether it's *eligible* to
 * appear — a page still needs its own content, image, or (for the four
 * built-ins with one) its own toggle to actually render; see each page's
 * hint and render-pdf.ts's per-key dispatch for the exact rule.
 */
export function PageArranger({
  frontOrder,
  backOrder,
  onReorderFront,
  onReorderBack,
  isEnabled,
  onToggle,
  customPages,
  onPageCreated,
  onPageDeleted,
}: PageArrangerProps) {
  const [showCreateModal, setShowCreateModal] = useState(false);

  return (
    <div className="rounded-lg border border-border bg-surface p-4 sm:p-5">
      <h2 className="text-sm font-semibold tracking-tight">Create and arrange</h2>
      <p className="mt-1 text-xs text-muted-foreground">
        Every page in this book, front matter and back matter — uncheck one to leave it out of the
        export, or drag it (or use the arrows) to change where it lands. Reordering never touches
        a page&rsquo;s own content or images.
      </p>

      <div className="mt-4 flex flex-col gap-2">
        <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Front matter
        </h3>
        <ReorderablePageList
          items={toItems(frontOrder, customPages, isEnabled)}
          onReorder={onReorderFront}
          onToggle={onToggle}
          onDelete={onPageDeleted}
        />
      </div>

      <div className="mt-5 flex flex-col gap-2">
        <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Back matter
        </h3>
        <ReorderablePageList
          items={toItems(backOrder, customPages, isEnabled)}
          onReorder={onReorderBack}
          onToggle={onToggle}
          onDelete={onPageDeleted}
        />
      </div>

      <button
        type="button"
        onClick={() => setShowCreateModal(true)}
        className="mt-4 flex items-center gap-1 text-xs font-medium text-accent hover:underline"
      >
        + Create page
      </button>

      <CreatePageModal
        open={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        frontOrder={frontOrder}
        backOrder={backOrder}
        customPages={customPages}
        onCreated={onPageCreated}
      />
    </div>
  );
}
