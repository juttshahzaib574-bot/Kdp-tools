"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import {
  DIFFICULTY_TIERS,
  gridFit,
  gridFitAdvice,
  INTERIOR_COLORS,
  INTERIOR_COLOR_LABELS,
  COLOR_TIERS,
  COLOR_TIER_LABELS,
  MYSTERY_THEMES,
  PAPER_TYPE_LABELS,
  PAPER_TYPES_BY_INTERIOR_COLOR,
  type ColorTier,
  type CustomPageRecord,
  type GridMysteryInput,
  type CustomPageSection,
  type DifficultyTier,
  type KdpTrimSize,
  type InteriorColor,
  type MysteryThemeId,
  type PageOverride,
  type PaperType,
} from "@kdp/shared";
import { AssetGallery } from "@/components/asset-gallery";
import { AssetsTab } from "@/components/assets-tab";
import { CustomizeTab } from "@/components/customize-tab";
import { DEFAULT_MIX, MixPlannerPanel, type MixSettings } from "@/components/mix-planner-panel";
import type { BookPuzzleSpec } from "@/components/puzzle-carousel";
import { PageArranger } from "@/components/page-arranger";
import { PagesContentTab } from "@/components/pages-content-tab";
import { PdfPreview } from "@/components/pdf-preview";
import { PuzzleCarousel } from "@/components/puzzle-carousel";
import { TabErrorBoundary } from "@/components/tab-error-boundary";

const fieldClass =
  "w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-accent/30";
const labelClass = "text-sm font-medium";
const smallLabelClass = "text-xs font-medium";
const checkboxRowClass = "flex items-center gap-2 text-sm";
const checkboxClass = "h-4 w-4 rounded border-border";

// Create book is gone — its settings live on Generate now.
//
// Cover and Publishing tools are gone too. Both moved to the last tab,
// which is now Preview & Export: the cover spec and the royalty estimate
// are both functions of the finished interior, so they belong beside it
// rather than on tabs where the book they describe isn't in view. The
// back-cover blurb moved onto Generate, next to the title and subtitle
// it's written with.
const TABS = [
  { id: "generate", label: "Generate" },
  // Step 2, immediately after Generate: the publisher sees the book they
  // just asked for, puzzle by puzzle, before anything is rendered. It is
  // entirely skippable — see the tab's own copy — but it sits here rather
  // than at the end because reviewing after export is not reviewing.
  { id: "customize", label: "Review & Customize" },
  // Step 3. The front and back of the book: what comes before puzzle 1
  // and after puzzle N. Named for what it is rather than "Pages
  // content", which said nothing about where those pages go.
  { id: "content", label: "Front & Back Matter" },
  { id: "assets", label: "Assets" },
  { id: "arrange", label: "Create and arrange" },
  { id: "images", label: "Assign Templates" },
  // The last stop, and the only place every "is it ready?" number is
  // true at once: the interior in view, the cover spec derived from its
  // length, and the royalty derived from the same. Cover design happens
  // last in real life because it needs the final page count, so it
  // belongs here rather than in a tab of its own.
  { id: "preview", label: "Preview & Export" },
] as const;
type TabId = (typeof TABS)[number]["id"];

/**
 * Where this browser remembers which draft it was working on.
 *
 * The id ONLY. Book content lives server-side, where it's shared across
 * devices, survives a cleared cache and is the same data the export
 * reads. Mirroring settings into localStorage as well would create a
 * second copy that silently disagrees with the first.
 */
const DRAFT_ID_KEY = "kdp:draft-book-id";

function readStoredDraftId(): string | null {
  try {
    return window.localStorage.getItem(DRAFT_ID_KEY);
  } catch {
    // Private mode, or storage disabled outright. A wizard that can't
    // remember its draft still works; it just starts fresh.
    return null;
  }
}

function rememberDraftId(id: string): void {
  try {
    window.localStorage.setItem(DRAFT_ID_KEY, id);
  } catch {
    /* see readStoredDraftId */
  }
}

function clearStoredDraftId(): void {
  try {
    window.localStorage.removeItem(DRAFT_ID_KEY);
  } catch {
    /* see readStoredDraftId */
  }
}

/** The saved settings a restore puts back. Exactly the validated input the API returns. */
type RestorableInput = GridMysteryInput;

const DEFAULT_FRONT_ORDER = ["titlePage", "copyrightPage", "dedicationPage", "howToSolvePage"];
const DEFAULT_BACK_ORDER = ["aboutAuthorPage", "reviewRequestPage"];

// The four built-in pages that already have their own dedicated on/off
// toggle (rendered here, moved into the "Create and arrange" tab); every
// other key (dedicationPage, aboutAuthorPage, and every custom page) is
// gated purely by membership in `disabledKeys` instead — see
// togglePage/isPageEnabled below and the matching comment in render-pdf.ts.
type BuiltinToggleKey = "titlePage" | "copyrightPage" | "howToSolvePage" | "reviewRequestPage";

async function fetchCustomPages(): Promise<CustomPageRecord[] | null> {
  const response = await fetch("/api/custom-pages");
  if (!response.ok) return null;
  const { customPages } = (await response.json()) as { customPages: CustomPageRecord[] };
  return customPages;
}

/** Keeps a section's order in sync with the pages that actually exist: keeps everything already placed (built-ins always, custom pages if still present), then appends any newly-seen id at the end — so a user's manual reorder never gets reset by a background refetch. */
function syncOrder(prev: string[], validCustomIds: Set<string>, builtins: readonly string[]): string[] {
  const kept = prev.filter((key) => builtins.includes(key) || validCustomIds.has(key));
  const missing = [...validCustomIds].filter((id) => !kept.includes(id));
  return [...kept, ...missing];
}


export default function NewBookPage() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<TabId>("generate");
  const [title, setTitle] = useState("");
  const [authorName, setAuthorName] = useState("");
  const [subtitle, setSubtitle] = useState("");
  const [blurb, setBlurb] = useState("");
  const [theme, setTheme] = useState<MysteryThemeId>("manor");
  const [gridSize, setGridSize] = useState(7);
  const [difficulty, setDifficulty] = useState<DifficultyTier>("medium");
  const [trimSize, setTrimSize] = useState<KdpTrimSize>("6x9");
  // Full colour is the default: a colour interior is what the puzzles are
  // designed for, and black-and-white is a deliberate print-cost decision
  // the publisher opts into (KDP charges far less for B&W). Defaulting to
  // B&W silently shipped every book as greyscale.
  const [interiorColor, setInteriorColor] = useState<InteriorColor>("color");
  // Page-look controls. Defaults match the schema's, which were set by
  // rendering and comparing rather than picked — see the schema for the
  // reasoning and art-embed.ts for the measurements.
  const [floorStrengthColor, setFloorStrengthColor] = useState(38);
  const [floorStrengthGrey, setFloorStrengthGrey] = useState(30);
  const [roomContrast, setRoomContrast] = useState(55);
  const [cardCorners, setCardCorners] = useState<"rounded" | "square">("rounded");
  const [paperType, setPaperType] = useState<PaperType>("white");
  const [bleed, setBleed] = useState(false);
  const [puzzleCount, setPuzzleCount] = useState(30);
  const [puzzlesPerSpread, setPuzzlesPerSpread] = useState<"packed" | "onePerSpread">("packed");
  const [includeAnswerKey, setIncludeAnswerKey] = useState(true);
  // Which KDP colour tier the book will be ordered at. It doesn't change
  // what we render — but the tiers print on different paper stock, so it
  // changes the SPINE WIDTH the cover has to be built to.
  const [colorTier, setColorTier] = useState<ColorTier>("standard");
  // How difficulty is spread across the book. Defaults to the
  // progressive ramp — see MixPlannerPanel for why a single-tier book
  // was never what anyone wanted.
  const [mix, setMix] = useState<MixSettings>(DEFAULT_MIX);
  const [pageOverrides, setPageOverrides] = useState<Record<string, PageOverride>>({});
  const [includeTitlePage, setIncludeTitlePage] = useState(true);
  const [includeCopyrightPage, setIncludeCopyrightPage] = useState(true);
  const [includeHowToSolvePage, setIncludeHowToSolvePage] = useState(true);
  const [includeReviewRequestPage, setIncludeReviewRequestPage] = useState(true);
  const [pageImages, setPageImages] = useState<Record<string, string>>({});
  const [customPages, setCustomPages] = useState<CustomPageRecord[]>([]);
  const [frontOrder, setFrontOrder] = useState<string[]>(DEFAULT_FRONT_ORDER);
  const [backOrder, setBackOrder] = useState<string[]>(DEFAULT_BACK_ORDER);
  const [disabledKeys, setDisabledKeys] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  // The DRAFT book behind the Review & Customize tab. It exists as soon
  // as that tab is opened, because a reroll and a rename need somewhere
  // durable to live; it carries no generation job until the publisher
  // exports. Null until then — a publisher who never opens the tab gets
  // exactly the old one-shot create-and-queue path.
  const [draftBookId, setDraftBookId] = useState<string | null>(null);
  // False until the stored draft (if any) has been loaded back. Nothing
  // that could create a SECOND draft may run before then.
  const [draftRestored, setDraftRestored] = useState(false);
  // The publisher's own puzzles, once a draft has them. Feeding these to
  // the carousel is what turns it from a showroom into their book.
  const [bookPuzzles, setBookPuzzles] = useState<BookPuzzleSpec[]>([]);
  /**
   * Whether Review & Customize has ever been opened.
   *
   * It mounts lazily — its worker builds real puzzles and renders real
   * PDF pages, and none of that should start before the tab is visited.
   * But once mounted it STAYS mounted, hidden, because unmounting threw
   * away every rendered page, every resolved title and the whole
   * verification state, so coming back re-ran work that had already been
   * done. Lazy once, then kept.
   */
  const [customizeOpened, setCustomizeOpened] = useState(false);
  if (activeTab === "customize" && !customizeOpened) setCustomizeOpened(true);

  // KDP couples interior color with paper stock (see PAPER_TYPES_BY_INTERIOR_COLOR).
  // If the user switches interior color to one that doesn't support the
  // currently-selected paper, snap paper back to the first valid option.
  // Done as React's "adjusting state when a prop changes" pattern rather
  // than a useEffect to keep the set-state-in-effect lint rule happy.
  const [lastInteriorColorForPaperSync, setLastInteriorColorForPaperSync] = useState(interiorColor);
  if (interiorColor !== lastInteriorColorForPaperSync) {
    setLastInteriorColorForPaperSync(interiorColor);
    const validPapers = PAPER_TYPES_BY_INTERIOR_COLOR[interiorColor];
    if (!validPapers.includes(paperType)) setPaperType(validPapers[0]!);
  }

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const rows = await fetchCustomPages();
      if (!cancelled && rows) setCustomPages(rows);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  /** Puts a saved draft's settings back into the form, field by field. */
  function applyRestoredInput(input: RestorableInput) {
    setTitle(input.title);
    setAuthorName(input.authorName);
    setSubtitle(input.subtitle ?? "");
    setBlurb(input.blurb ?? "");
    setTheme(input.theme);
    setGridSize(input.gridSize);
    setDifficulty(input.difficulty);
    setTrimSize(input.trimSize);
    setInteriorColor(input.interiorColor);
    setFloorStrengthColor(input.floorStrengthColor ?? 38);
    setFloorStrengthGrey(input.floorStrengthGrey ?? 30);
    setRoomContrast(input.roomContrast ?? 55);
    setCardCorners(input.cardCorners ?? "rounded");
    setPaperType(input.paperType);
    setColorTier(input.colorTier);
    setBleed(input.bleed);
    setPuzzleCount(input.puzzleCount);
    setPuzzlesPerSpread(input.puzzlesPerSpread);
    setIncludeAnswerKey(input.includeAnswerKey);
    setIncludeTitlePage(input.includeTitlePage);
    setIncludeCopyrightPage(input.includeCopyrightPage);
    setIncludeHowToSolvePage(input.includeHowToSolvePage);
    setIncludeReviewRequestPage(input.includeReviewRequestPage);
    setPageImages(input.pageImages ?? {});
    setPageOverrides(input.pageOverrides ?? {});
    if (input.frontMatterOrder) setFrontOrder(input.frontMatterOrder);
    if (input.backMatterOrder) setBackOrder(input.backMatterOrder);
    if (input.disabledPageKeys) setDisabledKeys(new Set(input.disabledPageKeys));
    setMix(input.mix ?? DEFAULT_MIX);
  }

  /**
   * Loads the draft's puzzle list for the carousel.
   *
   * Only what a preview needs — id, index, seed, tier — never the whole
   * summary payload with its suspects and titles, which would mean
   * materialising every puzzle just to draw a carousel.
   */
  const loadBookPuzzles = useCallback(async (bookId: string) => {
    const response = await fetch(
      `/api/books/${bookId}/puzzles?page=1&pageSize=1`,
    ).catch(() => null);
    if (!response?.ok) return;
    const first = (await response.json()) as { summary: { total: number } };
    if (first.summary.total === 0) {
      setBookPuzzles([]);
      return;
    }
    const all = await fetch(
      `/api/books/${bookId}/puzzles/list`,
    ).catch(() => null);
    if (!all?.ok) return;
    const body = (await all.json()) as { puzzles: BookPuzzleSpec[] };
    setBookPuzzles(body.puzzles);
  }, []);

  // ---- Draft restore -------------------------------------------------
  //
  // Everything that makes a book — settings, seeds, renames, rerolls and
  // which puzzles are proved — has been durable server-side since
  // puzzles became rows. What was missing was the one pointer saying
  // WHICH draft this browser was working on, so a refresh started from
  // an empty form while the draft sat untouched in the database.
  //
  // localStorage holds only that pointer: an id, never book content. A
  // draft that has since been generated or deleted simply drops the
  // pointer and starts fresh, rather than leaving the wizard stuck on a
  // book it can't open.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const stored = readStoredDraftId();
      if (!stored) {
        if (!cancelled) setDraftRestored(true);
        return;
      }
      const response = await fetch(`/api/books/${stored}`).catch(() => null);
      if (cancelled) return;
      if (!response?.ok) {
        clearStoredDraftId();
        setDraftRestored(true);
        return;
      }
      const body = (await response.json()) as {
        book: { id: string; status: string };
        input: RestorableInput | null;
      };
      if (cancelled) return;
      // Only a DRAFT is still editable; anything queued or rendered is a
      // finished book, not a work in progress.
      if (body.book.status !== "DRAFT" || !body.input) {
        clearStoredDraftId();
        setDraftRestored(true);
        return;
      }
      applyRestoredInput(body.input);
      setDraftBookId(body.book.id);
      setDraftRestored(true);
      void loadBookPuzzles(body.book.id);
    })();
    return () => {
      cancelled = true;
    };
    // Mount-only: this restores the draft exactly once. loadBookPuzzles
    // is a stable useCallback, and depending on it would refetch the
    // draft on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);


  const [syncedCustomPages, setSyncedCustomPages] = useState(customPages);
  if (customPages !== syncedCustomPages) {
    setSyncedCustomPages(customPages);
    const frontIds = new Set(customPages.filter((p) => p.section === "FRONT").map((p) => p.id));
    const backIds = new Set(customPages.filter((p) => p.section === "BACK").map((p) => p.id));
    setFrontOrder((prev) => syncOrder(prev, frontIds, DEFAULT_FRONT_ORDER));
    setBackOrder((prev) => syncOrder(prev, backIds, DEFAULT_BACK_ORDER));
  }

  function handleAssignImage(key: string, assetId: string | null) {
    setPageImages((prev) => {
      const next = { ...prev };
      if (assetId) next[key] = assetId;
      else delete next[key];
      return next;
    });
  }

  async function handlePageCreated(page: CustomPageRecord, section: CustomPageSection, index: number) {
    setCustomPages((prev) => [...prev, page]);
    const setOrder = section === "FRONT" ? setFrontOrder : setBackOrder;
    setOrder((prev) => {
      const next = [...prev];
      next.splice(index, 0, page.id);
      return next;
    });
  }

  function handlePageDeleted(key: string) {
    setCustomPages((prev) => prev.filter((page) => page.id !== key));
    setFrontOrder((prev) => prev.filter((k) => k !== key));
    setBackOrder((prev) => prev.filter((k) => k !== key));
    setPageImages((prev) => {
      if (!(key in prev)) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
    setDisabledKeys((prev) => {
      if (!prev.has(key)) return prev;
      const next = new Set(prev);
      next.delete(key);
      return next;
    });
  }

  function handleCustomPageSaved(page: CustomPageRecord) {
    setCustomPages((prev) => prev.map((p) => (p.id === page.id ? page : p)));
  }

  function handlePageOverrideChange(key: string, override: PageOverride) {
    setPageOverrides((prev) => ({ ...prev, [key]: override }));
  }

  function isPageEnabled(key: string): boolean {
    switch (key as BuiltinToggleKey) {
      case "titlePage":
        return includeTitlePage;
      case "copyrightPage":
        return includeCopyrightPage;
      case "howToSolvePage":
        return includeHowToSolvePage;
      case "reviewRequestPage":
        return includeReviewRequestPage;
      default:
        return !disabledKeys.has(key);
    }
  }

  function togglePage(key: string) {
    switch (key as BuiltinToggleKey) {
      case "titlePage":
        setIncludeTitlePage((v) => !v);
        return;
      case "copyrightPage":
        setIncludeCopyrightPage((v) => !v);
        return;
      case "howToSolvePage":
        setIncludeHowToSolvePage((v) => !v);
        return;
      case "reviewRequestPage":
        setIncludeReviewRequestPage((v) => !v);
        return;
      default:
        setDisabledKeys((prev) => {
          const next = new Set(prev);
          if (next.has(key)) next.delete(key);
          else next.add(key);
          return next;
        });
    }
  }

  const disabledKeysArray = [...disabledKeys];

  function cleanPageOverrides(): Record<string, PageOverride> {
    const cleaned: Record<string, PageOverride> = {};
    for (const [key, override] of Object.entries(pageOverrides)) {
      const entry: PageOverride = {};
      if (override.title?.trim()) entry.title = override.title.trim();
      if (override.subtitle?.trim()) entry.subtitle = override.subtitle.trim();
      if (override.content?.trim()) entry.content = override.content.trim();
      if (Object.keys(entry).length > 0) cleaned[key] = entry;
    }
    return cleaned;
  }

  /** Everything the generator needs, exactly as the API validates it. One builder so the draft, the resync and the export can never drift apart. */
  function buildInput() {
    return {
      title,
      authorName,
      subtitle: subtitle || undefined,
      blurb: blurb || undefined,
      theme,
      gridSize,
      difficulty,
      trimSize,
      interiorColor,
      floorStrengthColor,
      floorStrengthGrey,
      roomContrast,
      cardCorners,
      paperType,
      colorTier,
      bleed,
      puzzleCount,
      puzzlesPerSpread,
      mix,
      includeAnswerKey,
      includeTitlePage,
      includeCopyrightPage,
      includeHowToSolvePage,
      includeReviewRequestPage,
      pageImages,
      frontMatterOrder: frontOrder,
      backMatterOrder: backOrder,
      disabledPageKeys: disabledKeysArray,
      pageOverrides: cleanPageOverrides(),
    };
  }

  /**
   * Makes sure a draft book exists and matches the current settings,
   * returning its id.
   *
   * Creating one the first time, and pushing the latest settings to it on
   * every later visit. The second half matters as much as the first: a
   * publisher who reviews thirty puzzles, goes back to Generate, and
   * bumps the count to forty must come back to forty puzzles — with the
   * thirty they already approved still exactly as they left them. That
   * reconciliation happens server-side (see reconcilePuzzleSet).
   */
  async function ensureDraftBook(): Promise<string | null> {
    setError(null);
    if (draftBookId) {
      const response = await fetch(`/api/books/${draftBookId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ input: buildInput() }),
      });
      if (response.ok) {
        void loadBookPuzzles(draftBookId);
        return draftBookId;
      }
      const body = await response.json().catch(() => null);
      setError(body?.error ?? "Couldn't update this draft.");
      return null;
    }

    const response = await fetch("/api/books", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...buildInput(), draft: true }),
    });
    if (!response.ok) {
      const body = await response.json().catch(() => null);
      setError(body?.error ?? "Couldn't start a draft of this book.");
      return null;
    }
    const { book } = (await response.json()) as { book: { id: string } };
    setDraftBookId(book.id);
    rememberDraftId(book.id);
    void loadBookPuzzles(book.id);
    return book.id;
  }

  /**
   * Sends the book to the worker.
   *
   * A book that's been through Review & Customize is enqueued in place,
   * so its saved puzzles — every reroll, every rename — are what gets
   * rendered. A book that hasn't is created and queued in one call,
   * exactly as before.
   */
  async function submitBook() {
    setError(null);
    setSubmitting(true);

    const response = draftBookId
      ? await fetch(`/api/books/${draftBookId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ input: buildInput(), enqueue: true }),
        })
      : await fetch("/api/books", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(buildInput()),
        });

    if (!response.ok) {
      const body = await response.json().catch(() => null);
      setError(body?.error ?? "Something went wrong. Please try again.");
      setSubmitting(false);
      return;
    }

    // The draft has become a real book; the pointer would otherwise
    // reopen a book that's no longer editable.
    clearStoredDraftId();
    router.push("/dashboard");
    router.refresh();
  }

  /** The Generate tab's own submit: settings are set, now go look at the book. */
  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setActiveTab("customize");
  }

  const validPapers = PAPER_TYPES_BY_INTERIOR_COLOR[interiorColor];

  /**
   * How many front/back matter pages this book actually carries.
   *
   * Feeds the facts line AND the cover spine, so it has to track what
   * the publisher has switched on rather than assume the six built-ins:
   * turning the title page off and adding two custom pages moves the
   * spine, and a spine cut to the wrong number is a misprinted cover.
   */
  const matterPages = [...frontOrder, ...backOrder].filter((key) => isPageEnabled(key)).length;

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-10 sm:px-6 sm:py-14">
      <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">New whodunit puzzle book</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Every puzzle is generated and mathematically verified to have exactly one solution before
        it&rsquo;s rendered.
      </p>

      <div role="tablist" className="mt-6 flex gap-1 overflow-x-auto border-b border-border">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={activeTab === tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`-mb-px shrink-0 whitespace-nowrap border-b-2 px-3 py-2.5 text-sm font-medium transition-colors ${
              activeTab === tab.id
                ? "border-accent text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Generate — settings at top, live carousel below. Merged from what
          used to be Create book + Generate. Conditionally mounted so the
          carousel's Web Worker + pdfjs don't load until this tab is
          visited (mobile Chromium OOMs otherwise). */}
      {activeTab === "generate" ? (
        <div className="mt-6 flex flex-col gap-6">
          <form
            onSubmit={handleSubmit}
            className="flex flex-col gap-5 rounded-lg border border-border bg-surface p-4 sm:p-5"
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <label htmlFor="title" className={labelClass}>
                  Book title
                </label>
                <input
                  id="title"
                  required
                  maxLength={120}
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Ultimate Whodunit Puzzle Book"
                  className={fieldClass}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label htmlFor="authorName" className={labelClass}>
                  Author name
                </label>
                <input
                  id="authorName"
                  required
                  maxLength={120}
                  value={authorName}
                  onChange={(e) => setAuthorName(e.target.value)}
                  placeholder="J. Rivera"
                  className={fieldClass}
                />
              </div>
              <div className="flex flex-col gap-1.5 sm:col-span-2">
                <label htmlFor="subtitle" className={labelClass}>
                  Subtitle <span className="font-normal text-muted-foreground">(optional)</span>
                </label>
                <input
                  id="subtitle"
                  maxLength={160}
                  value={subtitle}
                  onChange={(e) => setSubtitle(e.target.value)}
                  placeholder="A Whodunit Logic Puzzle Book"
                  className={fieldClass}
                />
              </div>
              {/* Printed on the back cover. It lives here rather than on
                  a tab of its own because it's book metadata, written at
                  the same moment as the title and the author name. */}
              <div className="flex flex-col gap-1.5 sm:col-span-2">
                <label htmlFor="blurb" className={labelClass}>
                  Back-cover blurb{" "}
                  <span className="font-normal text-muted-foreground">(optional)</span>
                </label>
                <textarea
                  id="blurb"
                  rows={3}
                  maxLength={600}
                  value={blurb}
                  onChange={(e) => setBlurb(e.target.value)}
                  placeholder="Seven guests. One locked room. Can you name the killer before the last page?"
                  className={fieldClass}
                />
                <p className="text-xs text-muted-foreground">
                  KDP reserves the lower right of the back cover for its barcode, so a long blurb
                  gets squeezed into what&rsquo;s left.
                </p>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <div className="flex flex-col gap-1.5">
                <label htmlFor="theme" className={smallLabelClass}>
                  Theme
                </label>
                <select
                  id="theme"
                  value={theme}
                  onChange={(e) => setTheme(e.target.value as MysteryThemeId)}
                  className={fieldClass}
                >
                  {MYSTERY_THEMES.map((t) => (
                    <option key={t.id} value={t.id} disabled={!t.ready}>
                      {t.label}
                      {t.ready ? "" : " (coming soon)"}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex flex-col gap-1.5">
                {/* The book's difficulty comes from the mix below, not
                    from here. This only picks the tier the sample
                    previews roll at. */}
                <label htmlFor="difficulty" className={smallLabelClass}>
                  Sample difficulty
                </label>
                <select
                  id="difficulty"
                  value={difficulty}
                  onChange={(e) => setDifficulty(e.target.value as DifficultyTier)}
                  className={fieldClass}
                >
                  {DIFFICULTY_TIERS.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex flex-col gap-1.5">
                <label htmlFor="gridSize" className={smallLabelClass}>
                  Grid size
                </label>
                <select
                  id="gridSize"
                  value={gridSize}
                  onChange={(e) => setGridSize(Number(e.target.value))}
                  className={fieldClass}
                >
                  {[6, 7, 8].map((size) => (
                    <option key={size} value={size}>
                      {size} × {size} ({size} suspects)
                      {gridFit(trimSize, size) === "unusable" ? " — too big for this trim" : ""}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex flex-col gap-1.5">
                <label htmlFor="trimSize" className={smallLabelClass}>
                  Trim size
                </label>
                <select
                  id="trimSize"
                  value={trimSize}
                  onChange={(e) => setTrimSize(e.target.value as typeof trimSize)}
                  className={fieldClass}
                >
                  <option value="6x9">6&quot; × 9&quot;</option>
                  <option value="7x10">7&quot; × 10&quot;</option>
                  <option value="8.5x11">8.5&quot; × 11&quot;</option>
                </select>
              </div>
            </div>

            {/*
              The plan takes what the header, the eight suspect cards and
              the evidence panel leave it. On a small trim with a large
              grid there is not enough page, and the tool used to print
              that silently — a 4.6mm cell nobody can write in, which only
              shows up in the buyer's hands. See gridFit in @kdp/shared for
              the measured table behind this.
            */}
            {gridFitAdvice(trimSize, gridSize) ? (
              <p
                role="status"
                className={`rounded-md border px-3 py-2 text-xs ${
                  gridFit(trimSize, gridSize) === "unusable"
                    ? "border-red-500/40 bg-red-500/5 text-red-600 dark:text-red-400"
                    : "border-amber-500/40 bg-amber-500/5 text-amber-700 dark:text-amber-400"
                }`}
              >
                {gridFitAdvice(trimSize, gridSize)}
              </p>
            ) : null}

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <div className="flex flex-col gap-1.5">
                <label htmlFor="puzzleCount" className={smallLabelClass}>
                  Puzzles per book
                </label>
                <input
                  id="puzzleCount"
                  type="number"
                  min={1}
                  max={100}
                  value={puzzleCount}
                  onChange={(e) => {
                    const n = Number(e.target.value);
                    if (Number.isFinite(n)) setPuzzleCount(Math.min(100, Math.max(1, Math.floor(n))));
                  }}
                  className={fieldClass}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label htmlFor="puzzlesPerSpread" className={smallLabelClass}>
                  Layout
                </label>
                <select
                  id="puzzlesPerSpread"
                  value={puzzlesPerSpread}
                  onChange={(e) => setPuzzlesPerSpread(e.target.value as typeof puzzlesPerSpread)}
                  className={fieldClass}
                >
                  <option value="packed">Packed (puzzles back-to-back)</option>
                  <option value="onePerSpread">One per spread (blank facing page)</option>
                </select>
              </div>
              <div className="flex flex-col gap-1.5">
                <label htmlFor="interiorColor" className={smallLabelClass}>
                  Interior color
                </label>
                <select
                  id="interiorColor"
                  value={interiorColor}
                  onChange={(e) => setInteriorColor(e.target.value as InteriorColor)}
                  className={fieldClass}
                >
                  {INTERIOR_COLORS.map((c) => (
                    <option key={c} value={c}>
                      {INTERIOR_COLOR_LABELS[c]}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex flex-col gap-1.5">
                <label htmlFor="cardCorners" className={smallLabelClass}>
                  Suspect card corners
                </label>
                <select
                  id="cardCorners"
                  value={cardCorners}
                  onChange={(e) => setCardCorners(e.target.value as "rounded" | "square")}
                  className={fieldClass}
                >
                  <option value="rounded">Rounded</option>
                  <option value="square">Square</option>
                </select>
              </div>

              <div className="flex flex-col gap-1.5 sm:col-span-2">
                <div className="flex items-baseline justify-between">
                  <label htmlFor="roomContrast" className={smallLabelClass}>
                    Room contrast
                  </label>
                  <span className="text-xs tabular-nums text-muted-foreground">
                    {roomContrast}%
                  </span>
                </div>
                <input
                  id="roomContrast"
                  type="range"
                  min={0}
                  max={100}
                  step={5}
                  value={roomContrast}
                  onChange={(e) => setRoomContrast(Number(e.target.value))}
                  className="w-full accent-foreground"
                />
                <p className="text-xs text-muted-foreground">
                  How far apart rooms sit in lightness. At 0 they differ only by hue — which is
                  nothing at all once the book prints in black ink.
                </p>
              </div>

              <div className="flex flex-col gap-1.5 sm:col-span-2">
                <div className="flex items-baseline justify-between">
                  <label htmlFor="floorStrength" className={smallLabelClass}>
                    Floor artwork strength
                    <span className="ml-1 font-normal text-muted-foreground">
                      ({interiorColor === "blackAndWhite" ? "black ink" : "colour"})
                    </span>
                  </label>
                  <span className="text-xs tabular-nums text-muted-foreground">
                    {interiorColor === "blackAndWhite" ? floorStrengthGrey : floorStrengthColor}%
                  </span>
                </div>
                <input
                  id="floorStrength"
                  type="range"
                  min={0}
                  max={100}
                  step={5}
                  value={interiorColor === "blackAndWhite" ? floorStrengthGrey : floorStrengthColor}
                  onChange={(e) => {
                    const next = Number(e.target.value);
                    // Two stored values, one visible slider: the setting
                    // that matters is the one for the interior actually
                    // being printed, and a publisher switching to black
                    // ink should not silently inherit a level tuned on a
                    // colour proof.
                    if (interiorColor === "blackAndWhite") setFloorStrengthGrey(next);
                    else setFloorStrengthColor(next);
                  }}
                  className="w-full accent-foreground"
                />
                <p className="text-xs text-muted-foreground">
                  0 hides the floor art and leaves a flat fill; 100 draws it at full contrast.
                  Colour and black ink keep separate levels — colour is competing with the grid,
                  black ink is carrying the plan.
                </p>
              </div>

              <div className="flex flex-col gap-1.5">
                <label htmlFor="paperType" className={smallLabelClass}>
                  Paper
                </label>
                <select
                  id="paperType"
                  value={paperType}
                  onChange={(e) => setPaperType(e.target.value as PaperType)}
                  disabled={validPapers.length < 2}
                  className={`${fieldClass} disabled:opacity-60`}
                >
                  {validPapers.map((p) => (
                    <option key={p} value={p}>
                      {PAPER_TYPE_LABELS[p]}
                    </option>
                  ))}
                </select>
              </div>
              {/* Only meaningful on a colour interior, and only because
                  the two tiers print on different paper stock — which
                  changes the spine width the cover must be built to. The
                  rendered PDF is identical either way. */}
              {interiorColor === "color" ? (
                <div className="flex flex-col gap-1.5">
                  <label htmlFor="colorTier" className={smallLabelClass}>
                    Colour tier
                  </label>
                  <select
                    id="colorTier"
                    value={colorTier}
                    onChange={(e) => setColorTier(e.target.value as ColorTier)}
                    className={fieldClass}
                  >
                    {COLOR_TIERS.map((tier) => (
                      <option key={tier} value={tier}>
                        {COLOR_TIER_LABELS[tier]}
                      </option>
                    ))}
                  </select>
                  <p className="text-xs text-muted-foreground">
                    Picked at KDP checkout. It only affects your spine width here.
                  </p>
                </div>
              ) : null}
            </div>

            <MixPlannerPanel total={puzzleCount} value={mix} onChange={setMix} />

            <div className="flex flex-wrap items-center gap-4">
              <label className={checkboxRowClass}>
                <input
                  type="checkbox"
                  checked={bleed}
                  onChange={(e) => setBleed(e.target.checked)}
                  className={checkboxClass}
                />
                Full bleed
              </label>
              <label className={checkboxRowClass}>
                <input
                  type="checkbox"
                  checked={includeAnswerKey}
                  onChange={(e) => setIncludeAnswerKey(e.target.checked)}
                  className={checkboxClass}
                />
                Answer key
              </label>
            </div>

            {error ? <p className="text-sm text-danger">{error}</p> : null}

            <div className="flex flex-col gap-2 border-t border-border pt-4 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-xs text-muted-foreground">
                The preview below auto-refreshes when a puzzle-affecting setting changes. Next
                you&rsquo;ll see all {puzzleCount} verified puzzle{puzzleCount === 1 ? "" : "s"}{" "}
                {puzzlesPerSpread === "onePerSpread" ? "with one per two-page spread" : "packed"} —
                review them, or skip straight to export.
              </p>
              <button
                type="submit"
                disabled={submitting}
                className="inline-flex items-center justify-center rounded-md bg-accent px-4 py-2.5 text-sm font-medium text-accent-foreground disabled:opacity-50"
              >
                {`Build ${puzzleCount} puzzle${puzzleCount === 1 ? "" : "s"} →`}
              </button>
            </div>
          </form>

          <TabErrorBoundary tabLabel="Generate">
            <PuzzleCarousel
              gridSize={gridSize}
              difficulty={difficulty}
              theme={theme}
              interiorColor={interiorColor}
              bleed={bleed}
              trimSize={trimSize}
              includeAnswerKey={includeAnswerKey}
              bookPuzzles={bookPuzzles}
            />
          </TabErrorBoundary>
        </div>
      ) : null}

      {/* Review & Customize. Mounted lazily — its worker builds real
          puzzles and renders real PDF pages, and none of that should
          start before the tab is visited — but kept mounted afterwards,
          merely hidden. Unmounting discarded every rendered page, every
          resolved title and the verification state, so returning to the
          tab re-ran work that was already finished. */}
      {customizeOpened ? (
        <div className="mt-6" hidden={activeTab !== "customize"}>
          {/* Held until the stored draft has been read back. Opening the
              tab first would call onNeedBook with no draft id yet and
              create a SECOND draft alongside the one being restored. */}
          {draftRestored ? (
            <TabErrorBoundary tabLabel="Review & Customize">
              <CustomizeTab
                onNeedBook={ensureDraftBook}
                theme={theme}
                trimSize={trimSize}
                interiorColor={interiorColor}
                bleed={bleed}
                onSkip={() => setActiveTab("content")}
              />
            </TabErrorBoundary>
          ) : (
            <p className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
              Opening your draft…
            </p>
          )}
        </div>
      ) : null}

      <div hidden={activeTab !== "assets"} className="mt-6">
        <AssetsTab />
      </div>

      <div hidden={activeTab !== "arrange"} className="mt-6">
        <PageArranger
          frontOrder={frontOrder}
          backOrder={backOrder}
          onReorderFront={setFrontOrder}
          onReorderBack={setBackOrder}
          isEnabled={isPageEnabled}
          onToggle={togglePage}
          customPages={customPages}
          onPageCreated={handlePageCreated}
          onPageDeleted={handlePageDeleted}
        />
      </div>

      <div hidden={activeTab !== "content"} className="mt-6">
        <PagesContentTab
          frontOrder={frontOrder}
          backOrder={backOrder}
          customPages={customPages}
          title={title}
          onTitleChange={setTitle}
          subtitle={subtitle}
          onSubtitleChange={setSubtitle}
          pageOverrides={pageOverrides}
          onPageOverrideChange={handlePageOverrideChange}
          onCustomPageSaved={handleCustomPageSaved}
        />
      </div>

      <div hidden={activeTab !== "images"} className="mt-6">
        <AssetGallery
          pageImages={pageImages}
          onAssign={handleAssignImage}
          customPages={customPages}
          frontOrder={frontOrder}
          backOrder={backOrder}
          onPageCreated={handlePageCreated}
          isEnabled={isPageEnabled}
          onPageDeleted={handlePageDeleted}
        />
      </div>

      {activeTab === "preview" ? (
        <div className="mt-6">
          <TabErrorBoundary tabLabel="Preview & Export">
            <PdfPreview
              theme={theme}
              interiorColor={interiorColor}
              bleed={bleed}
              customPages={customPages}
              frontMatterOrder={frontOrder}
              backMatterOrder={backOrder}
              disabledPageKeys={disabledKeysArray}
              title={title}
              authorName={authorName}
              subtitle={subtitle}
              gridSize={gridSize}
              difficulty={difficulty}
              trimSize={trimSize}
              includeAnswerKey={includeAnswerKey}
              pageOverrides={pageOverrides}
              includeTitlePage={includeTitlePage}
              includeCopyrightPage={includeCopyrightPage}
              includeHowToSolvePage={includeHowToSolvePage}
              includeReviewRequestPage={includeReviewRequestPage}
              pageImages={pageImages}
              paperType={paperType}
              colorTier={colorTier}
              matterPages={matterPages}
              bookPuzzles={bookPuzzles}
              puzzleCount={puzzleCount}
              puzzlesPerSpread={puzzlesPerSpread}
              onExport={() => void submitBook()}
              exporting={submitting}
            />
          </TabErrorBoundary>
        </div>
      ) : null}

    </div>
  );
}
