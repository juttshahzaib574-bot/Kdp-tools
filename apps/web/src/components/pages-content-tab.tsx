"use client";

import { useState, type ReactNode } from "react";
import {
  SECTION_ALIGNMENTS,
  SECTION_ALIGN_LABELS,
  SECTION_POSITIONS,
  SECTION_POSITION_LABELS,
  type CustomPageRecord,
  type PageOverride,
  type SectionAlign,
  type SectionLayout,
  type SectionPosition,
} from "@kdp/shared";
import { isBuiltInPageKey, labelForPageKey } from "@/lib/page-labels";

const inputClass =
  "w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-accent/30";
const selectClass =
  "rounded-md border border-border bg-surface px-1.5 py-1 text-[11px] text-foreground focus:outline-none focus:ring-2 focus:ring-accent/30";

// Every section's placement defaults to matching whatever this page prints
// when nobody has touched the controls — center-flowing for the two pages
// whose generated layout is centered (Title, Dedication), left-flowing
// (top to bottom, ragged right) for every other page. Picking the same
// default the renderer itself falls back to means these dropdowns always
// show what will actually happen, not just what's stored.
const LEFT_FLOW: SectionLayout = { align: "left", position: "flow" };
const CENTER_FLOW: SectionLayout = { align: "center", position: "flow" };
const CENTERED_PAGES = new Set(["titlePage", "dedicationPage"]);
function defaultLayoutFor(pageKey: string): SectionLayout {
  return CENTERED_PAGES.has(pageKey) ? CENTER_FLOW : LEFT_FLOW;
}

// The default heading and body text each built-in page prints when its
// Title/Content box is left blank — shown only as placeholder text inside
// the real input (never as a substitute for the input itself), so nobody
// has to guess what happens if they skip a field.
const DEFAULT_TITLE_HINT: Partial<Record<string, string>> = {
  howToSolvePage: "How to Solve This Puzzle",
  aboutAuthorPage: "About the Author",
  reviewRequestPage: "Enjoyed This Book?",
};
const DEFAULT_TITLE_HINT_NONE = "Leave blank for no heading on this page";
const DEFAULT_CONTENT_HINT: Partial<Record<string, string>> = {
  copyrightPage: "Leave blank to use the standard generated copyright notice",
  howToSolvePage: "Leave blank to use the standard how-to-solve instructions",
  reviewRequestPage: "Leave blank to use the standard review-request text",
};
const DEFAULT_CONTENT_HINT_NONE =
  "Write this page's text here, or leave it blank to skip this page entirely";

export interface PagesContentTabProps {
  frontOrder: string[];
  backOrder: string[];
  customPages: CustomPageRecord[];
  title: string;
  onTitleChange: (value: string) => void;
  subtitle: string;
  onSubtitleChange: (value: string) => void;
  pageOverrides: Record<string, PageOverride>;
  onPageOverrideChange: (key: string, override: PageOverride) => void;
  onCustomPageSaved: (page: CustomPageRecord) => void;
}

/**
 * Every front/back-matter page, open by default, each with real
 * Title/Subtitle/Content boxes for that page's own words — separate from
 * "Create and arrange" (which only controls order and on/off) and from
 * "Assign Templates" (which swaps a page's content for a picture entirely;
 * an assigned image always wins over whatever's typed here). Every box
 * starts empty; nothing is pre-filled on a user's behalf. Every section
 * also gets its own Position and Alignment controls — title, subtitle, and
 * content place independently, so a page can be laid out however its
 * owner wants rather than one fixed template.
 */
export function PagesContentTab({
  frontOrder,
  backOrder,
  customPages,
  title,
  onTitleChange,
  subtitle,
  onSubtitleChange,
  pageOverrides,
  onPageOverrideChange,
  onCustomPageSaved,
}: PagesContentTabProps) {
  function renderCardBody(key: string): ReactNode {
    if (key === "titlePage") {
      const override = pageOverrides.titlePage ?? {};
      return (
        <TitlePageEditor
          title={title}
          onTitleChange={onTitleChange}
          subtitle={subtitle}
          onSubtitleChange={onSubtitleChange}
          override={override}
          onOverrideChange={(next) => onPageOverrideChange("titlePage", next)}
        />
      );
    }

    if (isBuiltInPageKey(key)) {
      const override = pageOverrides[key] ?? {};
      return (
        <BuiltInOverrideEditor
          pageKey={key}
          override={override}
          onChange={(next) => onPageOverrideChange(key, next)}
        />
      );
    }

    const page = customPages.find((p) => p.id === key);
    if (!page) return null;
    return <CustomPageEditor page={page} onSaved={onCustomPageSaved} />;
  }

  function renderSection(sectionTitle: string, order: string[]) {
    if (order.length === 0) return null;
    return (
      <div className="flex flex-col gap-2">
        <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {sectionTitle}
        </h3>
        {order.map((key) => (
          <PageCard key={key} title={labelForPageKey(key, customPages)}>
            {renderCardBody(key)}
          </PageCard>
        ))}
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border bg-surface p-4 sm:p-5">
      <h2 className="text-sm font-semibold tracking-tight">Pages content</h2>
      <p className="mt-1 text-xs text-muted-foreground">
        Fill these in if you don&rsquo;t have your own custom templates or images for the front
        and back matter pages. If you do have them, upload them in the &ldquo;Assign
        Templates&rdquo; tab instead — an uploaded image swaps in as that page&rsquo;s content
        directly in your exported PDF, so you can skip filling in anything here for that page.
      </p>
      <div className="mt-4 flex flex-col gap-5">
        {renderSection("Front matter", frontOrder)}
        {renderSection("Back matter", backOrder)}
      </div>
    </div>
  );
}

function Field({
  label,
  optional,
  layout,
  onLayoutChange,
  children,
}: {
  label: string;
  optional?: boolean;
  layout: SectionLayout;
  onLayoutChange: (next: SectionLayout) => void;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-xs font-medium">
        {label} {optional ? <span className="font-normal text-muted-foreground">(optional)</span> : null}
      </span>
      {children}
      <LayoutControls layout={layout} onChange={onLayoutChange} />
    </div>
  );
}

/** Position + Alignment controls for one section — see SectionLayout in @kdp/shared. */
function LayoutControls({
  layout,
  onChange,
}: {
  layout: SectionLayout;
  onChange: (next: SectionLayout) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <label className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
        Position
        <select
          value={layout.position}
          onChange={(e) => onChange({ ...layout, position: e.target.value as SectionPosition })}
          className={selectClass}
        >
          {SECTION_POSITIONS.map((position) => (
            <option key={position} value={position}>
              {SECTION_POSITION_LABELS[position]}
            </option>
          ))}
        </select>
      </label>
      <label className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
        Alignment
        <select
          value={layout.align}
          onChange={(e) => onChange({ ...layout, align: e.target.value as SectionAlign })}
          className={selectClass}
        >
          {SECTION_ALIGNMENTS.map((align) => (
            <option key={align} value={align}>
              {SECTION_ALIGN_LABELS[align]}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}

function PageCard({ title, children }: { title: string; children: ReactNode }) {
  const [open, setOpen] = useState(true);
  return (
    <div className="rounded-md border border-border">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-2 p-3 text-left"
      >
        <span className="text-sm font-medium">{title}</span>
        <span className="text-xs text-muted-foreground">{open ? "▲" : "▼"}</span>
      </button>
      {open ? <div className="border-t border-border p-3">{children}</div> : null}
    </div>
  );
}

function TitlePageEditor({
  title,
  onTitleChange,
  subtitle,
  onSubtitleChange,
  override,
  onOverrideChange,
}: {
  title: string;
  onTitleChange: (value: string) => void;
  subtitle: string;
  onSubtitleChange: (value: string) => void;
  override: PageOverride;
  onOverrideChange: (next: PageOverride) => void;
}) {
  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs text-muted-foreground">
        Title and Subtitle here are the same ones from the &ldquo;Create book&rdquo; tab —
        changing either one changes it there too.
      </p>
      <Field
        label="Title"
        layout={override.titleLayout ?? CENTER_FLOW}
        onLayoutChange={(next) => onOverrideChange({ ...override, titleLayout: next })}
      >
        <input
          value={title}
          maxLength={120}
          onChange={(e) => onTitleChange(e.target.value)}
          placeholder="The Blackwood Manor Mystery"
          className={inputClass}
        />
      </Field>
      <Field
        label="Subtitle"
        optional
        layout={override.subtitleLayout ?? CENTER_FLOW}
        onLayoutChange={(next) => onOverrideChange({ ...override, subtitleLayout: next })}
      >
        <input
          value={subtitle}
          maxLength={160}
          onChange={(e) => onSubtitleChange(e.target.value)}
          placeholder="A Whodunit Logic Puzzle Book"
          className={inputClass}
        />
      </Field>
      <Field
        label="Content"
        optional
        layout={override.contentLayout ?? CENTER_FLOW}
        onLayoutChange={(next) => onOverrideChange({ ...override, contentLayout: next })}
      >
        <textarea
          rows={4}
          maxLength={2000}
          value={override.content ?? ""}
          onChange={(e) => onOverrideChange({ ...override, content: e.target.value })}
          placeholder="Optional extra text under the title and subtitle — off by default."
          className={inputClass}
        />
      </Field>
    </div>
  );
}

function BuiltInOverrideEditor({
  pageKey,
  override,
  onChange,
}: {
  pageKey: string;
  override: PageOverride;
  onChange: (next: PageOverride) => void;
}) {
  const titlePlaceholder = DEFAULT_TITLE_HINT[pageKey] ?? DEFAULT_TITLE_HINT_NONE;
  const contentPlaceholder = DEFAULT_CONTENT_HINT[pageKey] ?? DEFAULT_CONTENT_HINT_NONE;
  const defaultLayout = defaultLayoutFor(pageKey);

  return (
    <div className="flex flex-col gap-3">
      <Field
        label="Title"
        optional
        layout={override.titleLayout ?? defaultLayout}
        onLayoutChange={(next) => onChange({ ...override, titleLayout: next })}
      >
        <input
          value={override.title ?? ""}
          maxLength={120}
          onChange={(e) => onChange({ ...override, title: e.target.value })}
          placeholder={titlePlaceholder}
          className={inputClass}
        />
      </Field>
      <Field
        label="Subtitle"
        optional
        layout={override.subtitleLayout ?? defaultLayout}
        onLayoutChange={(next) => onChange({ ...override, subtitleLayout: next })}
      >
        <input
          value={override.subtitle ?? ""}
          maxLength={160}
          onChange={(e) => onChange({ ...override, subtitle: e.target.value })}
          placeholder="A short line under the title"
          className={inputClass}
        />
      </Field>
      <Field
        label="Content"
        optional
        layout={override.contentLayout ?? defaultLayout}
        onLayoutChange={(next) => onChange({ ...override, contentLayout: next })}
      >
        <textarea
          rows={5}
          maxLength={2000}
          value={override.content ?? ""}
          onChange={(e) => onChange({ ...override, content: e.target.value })}
          placeholder={contentPlaceholder}
          className={inputClass}
        />
      </Field>
    </div>
  );
}

function CustomPageEditor({
  page,
  onSaved,
}: {
  page: CustomPageRecord;
  onSaved: (page: CustomPageRecord) => void;
}) {
  const [name, setName] = useState(page.name);
  const [subtitle, setSubtitle] = useState(page.subtitle ?? "");
  const [content, setContent] = useState(page.content ?? "");
  const [titleLayout, setTitleLayout] = useState(page.titleLayout ?? LEFT_FLOW);
  const [subtitleLayout, setSubtitleLayout] = useState(page.subtitleLayout ?? LEFT_FLOW);
  const [contentLayout, setContentLayout] = useState(page.contentLayout ?? LEFT_FLOW);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave() {
    if (!name.trim()) {
      setError("Page name can't be empty.");
      return;
    }
    setSaving(true);
    setSaved(false);
    setError(null);
    const response = await fetch(`/api/custom-pages/${page.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: name.trim(),
        subtitle: subtitle.trim() || undefined,
        content: content.trim() || undefined,
        titleLayout,
        subtitleLayout,
        contentLayout,
      }),
    });
    setSaving(false);
    if (!response.ok) {
      const body = await response.json().catch(() => null);
      setError(body?.error ?? "Couldn't save. Please try again.");
      return;
    }
    const { customPage } = (await response.json()) as { customPage: CustomPageRecord };
    onSaved(customPage);
    setSaved(true);
  }

  function markUnsaved() {
    setSaved(false);
  }

  return (
    <div className="flex flex-col gap-3">
      <Field
        label="Title"
        layout={titleLayout}
        onLayoutChange={(next) => {
          setTitleLayout(next);
          markUnsaved();
        }}
      >
        <input
          value={name}
          maxLength={60}
          onChange={(e) => {
            setName(e.target.value);
            markUnsaved();
          }}
          placeholder="Series Promo Page"
          className={inputClass}
        />
      </Field>
      <Field
        label="Subtitle"
        optional
        layout={subtitleLayout}
        onLayoutChange={(next) => {
          setSubtitleLayout(next);
          markUnsaved();
        }}
      >
        <input
          value={subtitle}
          maxLength={160}
          onChange={(e) => {
            setSubtitle(e.target.value);
            markUnsaved();
          }}
          placeholder="A short line under the title"
          className={inputClass}
        />
      </Field>
      <Field
        label="Content"
        optional
        layout={contentLayout}
        onLayoutChange={(next) => {
          setContentLayout(next);
          markUnsaved();
        }}
      >
        <textarea
          rows={5}
          maxLength={2000}
          value={content}
          onChange={(e) => {
            setContent(e.target.value);
            markUnsaved();
          }}
          placeholder="You can add content here if you want, or upload an image for this page later and use it as a direct swap in the PDF."
          className={inputClass}
        />
      </Field>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="rounded-md border border-border px-3 py-1.5 text-xs font-medium hover:bg-muted disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save"}
        </button>
        {saved ? <span className="text-xs text-success">Saved</span> : null}
        {error ? <span className="text-xs text-danger">{error}</span> : null}
      </div>
    </div>
  );
}
