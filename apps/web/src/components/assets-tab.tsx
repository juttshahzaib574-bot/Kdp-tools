"use client";

import { useState } from "react";

const CATEGORIES = [
  { id: "backgrounds", label: "Backgrounds", note: "Full-page textures, parchment, canvas, grid papers." },
  { id: "borders", label: "Borders & frames", note: "Page frames, corner ornaments, decorative rules." },
  { id: "portraits", label: "Suspect portraits", note: "Character avatars used on suspect cards." },
  { id: "rooms", label: "Room floor tiles", note: "Repeating floor textures for grid room fills." },
  { id: "furniture", label: "Furniture & props", note: "Landmark sprites — tables, wheelbarrows, hay bales, etc." },
  { id: "icons", label: "Weapon & clue icons", note: "Small mark icons used inside clue boards." },
] as const;

type CategoryId = (typeof CATEGORIES)[number]["id"];

/**
 * The Assets tab. Two libraries side-by-side — a curated Stock library
 * shipped with the app, and a private Custom library the reader owns —
 * both organized under the same set of categories (backgrounds, borders,
 * portraits, room floors, furniture, icons). At export time the engine
 * samples from both pools so no two books draw from the same subset;
 * that's where real per-book visual uniqueness comes from, not
 * cosmetic vector jitter.
 *
 * This first pass is the shell only — the data model, upload endpoint,
 * and the engine's asset-sampling wiring land in follow-up rounds.
 * Everything visible here is real category structure that the later
 * rounds fill in; nothing is placeholder ornament that will get thrown
 * away.
 */
export function AssetsTab() {
  const [category, setCategory] = useState<CategoryId>("backgrounds");
  const active = CATEGORIES.find((c) => c.id === category)!;

  return (
    <div className="rounded-lg border border-border bg-surface p-4 sm:p-5">
      <h2 className="text-sm font-semibold tracking-tight">Assets</h2>
      <p className="mt-1 text-xs text-muted-foreground">
        The engine draws from these libraries every time it renders a book — a curated Stock
        library (fill it with hundreds of options) and your private Custom library. Sampling
        across both pools is what makes every book you export visually distinct from every
        other publisher&rsquo;s.
      </p>

      <div className="mt-4 flex flex-wrap gap-1.5">
        {CATEGORIES.map((c) => {
          const isActive = c.id === category;
          return (
            <button
              key={c.id}
              type="button"
              onClick={() => setCategory(c.id)}
              aria-current={isActive}
              className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                isActive
                  ? "bg-accent text-accent-foreground"
                  : "bg-muted text-foreground hover:bg-border"
              }`}
            >
              {c.label}
            </button>
          );
        })}
      </div>
      <p className="mt-2 text-[11px] text-muted-foreground">{active.note}</p>

      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <GalleryColumn
          heading="Stock library"
          subheading="Curated assets shipped with the app. Read-only."
          emptyLabel={`No ${active.label.toLowerCase()} in Stock yet — the initial pack is being prepared.`}
        />
        <GalleryColumn
          heading="Custom library"
          subheading="Your uploads. Private to your account, mixed into every book you generate."
          emptyLabel={`No ${active.label.toLowerCase()} uploaded yet — drop files here (coming soon).`}
          uploadStub
        />
      </div>
    </div>
  );
}

function GalleryColumn({
  heading,
  subheading,
  emptyLabel,
  uploadStub,
}: {
  heading: string;
  subheading: string;
  emptyLabel: string;
  uploadStub?: boolean;
}) {
  return (
    <div className="flex min-h-56 flex-col rounded-md border border-border bg-muted/20 p-3">
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="text-xs font-semibold">{heading}</h3>
        {uploadStub ? (
          <button
            type="button"
            disabled
            className="rounded-md border border-border px-2 py-0.5 text-[11px] font-medium text-muted-foreground disabled:opacity-60"
            title="Upload flow lands in the next round."
          >
            Upload
          </button>
        ) : null}
      </div>
      <p className="mt-0.5 text-[11px] text-muted-foreground">{subheading}</p>
      <div className="mt-3 flex flex-1 items-center justify-center rounded border border-dashed border-border p-4 text-center text-[11px] text-muted-foreground">
        {emptyLabel}
      </div>
    </div>
  );
}
