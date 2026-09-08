"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  DIFFICULTY_TIERS,
  difficultyLabel,
  alignedGroup,
  clampPuzzleNumber,
  groupForPuzzle,
  pageCountFor,
  showingLabel,
  type DifficultyTier,
  type InteriorColor,
  type KdpTrimSize,
  type MysteryThemeId,
} from "@kdp/shared";
// Text-only subpath: substituting names is a string operation, and this
// import must not drag pdf-lib into the page bundle. See the package's
// exports map.
import { renderTemplate } from "@kdp/generator-grid-mystery/text";
import type {
  PuzzleReviewRequest,
  PuzzleReviewResponse,
  ReviewSuspect,
} from "@/workers/puzzle-review.worker";
import { PdfPageView } from "@/components/pdf-page-view";
import { PuzzleJumpBox } from "@/components/puzzle-nav";

/** Puzzles per page in this tab. The API is told the same number, and both derive their page count from it through @kdp/shared. */
const PAGE_SIZE = 5;
/** How long the editor waits after the last keystroke before autosaving. */
const AUTOSAVE_MS = 600;

/**
 * Rendered pages and resolved text, keyed by SEED.
 *
 * A seed is the puzzle — same seed, same everything — so these are
 * valid for as long as the row keeps that seed, which is until it's
 * rerolled. Module-level rather than component state so switching tabs,
 * paging away and back, or remounting the tab reuses what's already
 * been built instead of rebuilding it.
 *
 * Bounded: a hundred-puzzle book browsed end to end would otherwise
 * hold a hundred PDFs in memory.
 */
const CACHE_MAX = 60;

/**
 * Resolved TEXT, keyed by seed alone.
 *
 * The clue templates, the cast and the solution are all functions of the
 * seed — renaming a suspect doesn't change them, it changes the map they
 * are read through. So an edit never invalidates this.
 */
const TEXT_CACHE = new Map<string, PuzzleText>();

/**
 * Rendered PAGES, keyed by seed AND the overrides drawn into them.
 *
 * This is the one thing an edit does invalidate: the page has the old
 * names printed on it. Keying by both is what lets the two caches have
 * different lifetimes — a rename must not throw away a solver proof, and
 * it must throw away a picture.
 */
const PAGE_CACHE = new Map<string, Uint8Array>();

/** A page's identity: same seed AND same printed words means the same picture. */
function pageKey(seed: number, overrides: unknown): string {
  return `${seed}|${overrides ? JSON.stringify(overrides) : ""}`;
}

function remember<T>(cache: Map<string, T>, key: string, value: T): void {
  if (cache.size >= CACHE_MAX) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
  cache.set(key, value);
}

const fieldClass =
  "w-full rounded-md border border-border bg-surface px-2.5 py-1.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-accent/30";

/**
 * One puzzle as the server describes it. Mirrors PuzzleRowView.
 *
 * Rows only: a seed, a tier and the publisher's own words. The title and
 * the cast are DERIVED from the seed by the review worker, which is what
 * keeps a page load from running the solver five times over for puzzles
 * that were proved once and haven't changed.
 */
interface PuzzleRowView {
  id: string;
  index: number;
  seed: number;
  difficulty: DifficultyTier;
  requestedDifficulty: DifficultyTier;
  gridSize: number;
  solveNodes: number;
  verified: boolean;
  overrides: {
    title?: string;
    subtitle?: string;
    names?: Record<string, string>;
    heights?: Record<string, number>;
  } | null;
}

interface SetSummary {
  total: number;
  verified: number;
  counts: Partial<Record<DifficultyTier, number>>;
  estimatedPageCount: number;
  estimatedBytes: number;
  limitSeverity: "ok" | "warn" | "block";
  limitMessage: string;
}

/** Everything the engine produced for one puzzle, still tokenised. */
/**
 * What the puzzle demands of a solver, measured by the engine.
 *
 * The tier badge is a one-word summary of this; this is the evidence
 * behind it. Shown on the card so a publisher can audit the claim —
 * "Extreme" is only worth printing if something stands behind it.
 */
interface LogicProfile {
  solvedAt: "direct" | "elimination" | "relational" | "crossLayer";
  chain: number;
  techniques: string[];
  summary: string;
}

/** Plain-English names for the ladder rungs. The engine's own terms read as jargon on a card. */
const TECHNIQUE_LABEL: Record<LogicProfile["solvedAt"], string> = {
  direct: "reading the clues off",
  elimination: "elimination",
  relational: "playing clues against each other",
  crossLayer: "working the evidence back into the grid",
};

interface PuzzleText {
  titleTemplate: string;
  briefTemplate: string;
  clueTemplates: string[];
  evidenceTemplates: string[];
  suspects: ReviewSuspect[];
  crimeRoomName: string;
  culpritSuspectId: string;
  victimSuspectId: string;
  murderWeapon: string;
  logicProfile: LogicProfile;
}

/** A draft as the engine wants it: blank fields dropped, so an empty title means "no override". */
function toOverrides(draft: Draft) {
  return {
    title: draft.title.trim() || undefined,
    subtitle: draft.subtitle.trim() || undefined,
    names: draft.names,
    heights: draft.heights,
  };
}

/** The publisher's unsaved-then-saved edits, held locally so typing is never gated on the network. */
interface Draft {
  title: string;
  subtitle: string;
  names: Record<string, string>;
  heights: Record<string, number>;
}

/** What Undo puts back: the seed and tier the puzzle had before the last reroll. */
interface UndoEntry {
  seed: number;
  difficulty: DifficultyTier;
  requestedDifficulty: DifficultyTier;
}

export interface CustomizeTabProps {
  /**
   * Creates the draft book on first entry — and on every later entry,
   * pushes the Generate tab's current settings to it — returning its id.
   *
   * Called on every load rather than once, because a publisher who goes
   * back to Generate, changes the trim size, and returns must not be
   * reviewing a book that no longer matches its own settings.
   */
  onNeedBook: () => Promise<string | null>;
  theme: MysteryThemeId;
  trimSize: KdpTrimSize;
  interiorColor: InteriorColor;
  bleed: boolean;
  /** Advances to the next step of the wizard. NOT an export — see the buttons. */
  onSkip: () => void;
}

function formatBytes(bytes: number): string {
  const mb = bytes / 1024 / 1024;
  return mb < 1 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${mb.toFixed(1)} MB`;
}

/**
 * Review & Customize — the step between generating a book and exporting it.
 *
 * The design constraint that shapes everything here: editing must feel
 * local. A publisher renaming a character sees every clue, the brief and
 * the title update as they type, because the engine stores that text with
 * `{{sN}}` tokens rather than baked-in names — so a rename is a map edit
 * and a React render, not a regeneration and certainly not a re-solve.
 * The server call that follows is an autosave the reader never waits on.
 *
 * Rerolling is the opposite: it genuinely builds a new puzzle and proves
 * it before anything is swapped in, which is why it's the one action with
 * a spinner, a verified badge, and an Undo.
 */
export function CustomizeTab({
  onNeedBook,
  theme,
  trimSize,
  interiorColor,
  bleed,
  onSkip,
}: CustomizeTabProps) {
  const [page, setPage] = useState(1);
  const [pageCount, setPageCount] = useState(1);
  const [rows, setRows] = useState<PuzzleRowView[]>([]);
  const [summary, setSummary] = useState<SetSummary | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [texts, setTexts] = useState<Record<string, PuzzleText>>({});
  const [pages, setPages] = useState<Record<string, Uint8Array>>({});
  const [undoable, setUndoable] = useState<Record<string, UndoEntry>>({});
  const [busy, setBusy] = useState<Record<string, boolean>>({});
  const [saving, setSaving] = useState(0);
  /**
   * Which cards are collapsed. Empty means all expanded, which is the
   * default: this is a REVIEW surface, and a page of five closed boxes
   * shows a publisher nothing about their book.
   *
   * Cleared on every navigation — arriving at a new group of five always
   * starts expanded, whatever was collapsed on the group before.
   */
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  /** "Compact all", remembered for the session — a scanning mode, not a per-card choice. */
  const [compactAll, setCompactAll] = useState(false);
  /**
   * The puzzle a jump just landed on, pulsed for a second.
   *
   * Jumping to 85 lands on a page of five, and without this the reader
   * has to re-scan the group to find which one they asked for.
   */
  const [highlight, setHighlight] = useState<number | null>(null);
  /**
   * The puzzle NUMBER the reader is pointed at. One numbering system
   * across the app; which group of five holds it is derived, not stored.
   */
  const [selectedPuzzle, setSelectedPuzzle] = useState(1);
  /**
   * Cards whose typed words have not yet been drawn into their page.
   *
   * The read view — title, clues, the solution line — updates as you
   * type, because that text is resolved through a name map on every
   * render and costs nothing. The PAGE is a rendered PDF and costs
   * seconds, so it waits to be asked. This set is what "asked" means.
   */
  const [dirty, setDirty] = useState<Set<string>>(new Set());
  /** Cards showing "Applied ✓" for a moment after their page caught up. */
  const [justApplied, setJustApplied] = useState<Set<string>>(new Set());
  /** The puzzle open in the full-page modal, by row id. */
  const [previewing, setPreviewing] = useState<string | null>(null);
  /**
   * Whole-book verification, as progress.
   *
   * Proving a book is the product's central promise and it takes real
   * time. Left implicit it reads as a defect — puzzles sitting there
   * unbadged — so it's shown climbing, and export waits for it.
   */
  const [proof, setProof] = useState<{ verified: number; total: number; running: boolean }>({
    verified: 0,
    total: 0,
    running: false,
  });

  const workerRef = useRef<Worker | null>(null);
  const requestIdRef = useRef(0);
  /** Row id -> page cache key, so a worker reply can be filed against the words it drew. */
  const pageKeyById = useRef<Record<string, string>>({});
  const saveTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const resolvedBookId = useRef<string | null>(null);
  // Held in a ref, not a dependency. The parent defines onNeedBook inline,
  // so it's a new function on every one of its renders — depending on it
  // would make the load effect re-fire on each render, which re-fetches,
  // which re-renders. The ref keeps the latest callback reachable while
  // leaving the effect's identity stable.
  const onNeedBookRef = useRef(onNeedBook);
  useEffect(() => {
    onNeedBookRef.current = onNeedBook;
  });

  useEffect(() => {
    const worker = new Worker("/workers/puzzle-review.worker.js");
    workerRef.current = worker;
    // Captured now rather than read at cleanup time: the ref objects are
    // stable, and reading `.current` during teardown is exactly the
    // pattern that drops timers React has already swapped out.
    const pendingSaves = saveTimers.current;
    return () => {
      worker.terminate();
      for (const timer of Object.values(pendingSaves)) clearTimeout(timer);
    };
  }, []);

  useEffect(() => {
    const worker = workerRef.current;
    if (!worker) return;
    const handler = (event: MessageEvent<PuzzleReviewResponse>) => {
      const data = event.data;
      if (data.requestId !== requestIdRef.current) return;
      if (data.kind === "text") {
        remember(TEXT_CACHE, String(data.seed), {
          titleTemplate: data.titleTemplate,
          briefTemplate: data.briefTemplate,
          clueTemplates: data.clueTemplates,
          evidenceTemplates: data.evidenceTemplates,
          suspects: data.suspects,
          crimeRoomName: data.crimeRoomName,
          culpritSuspectId: data.culpritSuspectId,
          victimSuspectId: data.victimSuspectId,
          murderWeapon: data.murderWeapon,
          logicProfile: data.logicProfile,
        });
        setTexts((prev) => ({
          ...prev,
          [data.id]: {
            titleTemplate: data.titleTemplate,
            briefTemplate: data.briefTemplate,
            clueTemplates: data.clueTemplates,
            evidenceTemplates: data.evidenceTemplates,
            suspects: data.suspects,
            crimeRoomName: data.crimeRoomName,
            culpritSuspectId: data.culpritSuspectId,
            victimSuspectId: data.victimSuspectId,
            murderWeapon: data.murderWeapon,
            logicProfile: data.logicProfile,
          },
        }));
      } else if (data.kind === "page") {
        const key = pageKeyById.current[data.id];
        if (key !== undefined) remember(PAGE_CACHE, key, data.pdf);
        setPages((prev) => ({ ...prev, [data.id]: data.pdf }));
      } else if (data.kind === "error") {
        // One puzzle failing to preview must not blank the whole page —
        // its card falls back to text with a note.
        console.error("puzzle review worker failed", data.id, data.error);
      }
    };
    worker.addEventListener("message", handler);
    return () => worker.removeEventListener("message", handler);
  }, []);

  /** Asks the worker to rebuild text (and optionally the thumbnail) for some puzzles. */
  const requestPreviews = useCallback(
    (specs: PuzzleRowView[], overridesById: Record<string, Draft>, withThumbnails: boolean) => {
      const worker = workerRef.current;
      if (specs.length === 0) return;

      // Cache first: anything already built for this seed goes straight
      // on screen with no worker round trip at all. This is what makes
      // returning to a group instant rather than a rebuild.
      const cachedText: Record<string, PuzzleText> = {};
      const cachedPages: Record<string, Uint8Array> = {};
      const missing = specs.filter((row) => {
        const draft = overridesById[row.id];
        const key = pageKey(row.seed, draft ? toOverrides(draft) : null);
        pageKeyById.current[row.id] = key;
        const text = TEXT_CACHE.get(String(row.seed));
        const page = PAGE_CACHE.get(key);
        if (text) cachedText[row.id] = text;
        if (page) cachedPages[row.id] = page;
        return !text || (withThumbnails && !page);
      });
      if (Object.keys(cachedText).length > 0) {
        setTexts((prev) => ({ ...prev, ...cachedText }));
      }
      if (Object.keys(cachedPages).length > 0) {
        setPages((prev) => ({ ...prev, ...cachedPages }));
      }
      if (!worker || missing.length === 0) return;
      const requestId = ++requestIdRef.current;
      const request: PuzzleReviewRequest = {
        requestId,
        theme,
        trimSize,
        interiorColor,
        bleed,
        includeThumbnails: withThumbnails,
        puzzles: missing.map((row) => {
          const draft = overridesById[row.id];
          return {
            id: row.id,
            seed: row.seed,
            gridSize: row.gridSize,
            difficulty: row.difficulty,
            overrides: draft ? toOverrides(draft) : null,
          };
        }),
      };
      worker.postMessage(request);
    },
    [theme, trimSize, interiorColor, bleed],
  );

  /** One page of the set, straight off the API. */
  interface PageResult {
    puzzles: PuzzleRowView[];
    page: number;
    pageCount: number;
    summary: SetSummary;
  }

  /**
   * Fetches a page. Deliberately holds no state of its own — the caller
   * decides what to do with the result, which is what lets the initial
   * load run from an effect without a synchronous setState in its body.
   */
  const fetchPage = useCallback(
    async (
      targetPage: number,
    ): Promise<{ ok: true; data: PageResult } | { ok: false; error: string }> => {
      const id = await onNeedBookRef.current();
      if (!id) {
        return {
          ok: false,
          error:
            "Couldn't start a draft of this book. Check the Generate tab for missing fields.",
        };
      }
      resolvedBookId.current = id;

      const response = await fetch(
        `/api/books/${id}/puzzles?page=${targetPage}&pageSize=${PAGE_SIZE}`,
      );
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        return { ok: false, error: body?.error ?? "Couldn't load this book's puzzles." };
      }
      return { ok: true, data: (await response.json()) as PageResult };
    },
    [],
  );

  /**
   * Drives verification to completion, one chunk at a time.
   *
   * Chunked because proving a hundred Extreme puzzles is minutes of
   * search — one request that long would time out and report nothing.
   * Each round returns the running count, which is what the progress
   * line shows. A puzzle the engine can't prove is silently re-seeded
   * server-side, so a publisher never sees a failure they can't act on.
   */
  useEffect(() => {
    if (highlight === null) return;
    const timer = setTimeout(() => setHighlight(null), 1000);
    return () => clearTimeout(timer);
  }, [highlight]);

  const runVerification = useCallback(async (bookId: string) => {
    setProof((prev) => ({ ...prev, running: true }));
    try {
      // Bounded: each round proves at least one puzzle, so a book of N
      // needs at most N rounds. The cap stops a server bug turning into
      // an infinite request loop in the browser.
      for (let round = 0; round < 200; round++) {
        const response = await fetch(`/api/books/${bookId}/puzzles/verify`, { method: "POST" });
        if (!response.ok) {
          const body = await response.json().catch(() => null);
          setError(body?.error ?? "Couldn't finish verifying this book.");
          return;
        }
        const body = (await response.json()) as {
          verified: number;
          total: number;
          done: boolean;
        };
        setProof({ verified: body.verified, total: body.total, running: !body.done });
        if (body.done) return;
      }
    } finally {
      setProof((prev) => ({ ...prev, running: false }));
    }
  }, []);

  /** Puts a fetched page on screen and kicks off its previews. */
  const applyPage = useCallback(
    (data: PageResult) => {
      setRows(data.puzzles);
      // Arriving at a new group always starts expanded. A card someone
      // closed on the previous five has nothing to say about these.
      setCollapsed(new Set());
      setPage(data.page);
      // Recomputed locally from the same helper the API used, so a stale
      // or malformed pageCount can never leave the paginator offering
      // pages that aren't there.
      setPageCount(pageCountFor(data.summary.total, PAGE_SIZE));
      setSummary(data.summary);
      setStatus("ready");
      setError(null);

      // Seed the local drafts from what's stored, so the fields show the
      // publisher's own words and an untouched title shows as empty (the
      // generated one is the placeholder).
      const nextDrafts: Record<string, Draft> = {};
      for (const row of data.puzzles) {
        nextDrafts[row.id] = {
          title: row.overrides?.title ?? "",
          subtitle: row.overrides?.subtitle ?? "",
          // Only what the publisher CHANGED. The generated cast comes
          // from the worker, so an untouched name has no entry here and
          // the field falls back to the engine's own.
          names: { ...(row.overrides?.names ?? {}) },
          heights: { ...(row.overrides?.heights ?? {}) },
        };
      }
      setDrafts((prev) => ({ ...prev, ...nextDrafts }));
      requestPreviews(data.puzzles, nextDrafts, true);

      setProof((prev) => ({
        verified: data.summary.verified,
        total: data.summary.total,
        running: prev.running,
      }));
    },
    [requestPreviews],
  );

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const result = await fetchPage(1);
      if (cancelled) return;
      if (!result.ok) {
        setStatus("error");
        setError(result.error);
        return;
      }
      applyPage(result.data);
      // Prove the WHOLE book, not just the page in view. Export is
      // gated on it, and a publisher shouldn't have to page through
      // thirty puzzles to unlock the button.
      if (result.data.summary.verified < result.data.summary.total) {
        const bookId = resolvedBookId.current;
        if (bookId) {
          await runVerification(bookId);
          // The rows on screen were fetched before their proofs landed
          // (and a re-seeded puzzle has a new seed), so re-read them.
          const refreshed = await fetchPage(1);
          if (!cancelled && refreshed.ok) applyPage(refreshed.data);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [fetchPage, applyPage, runVerification]);

  /**
   * Writes an edit to the server. One place, so the debounced autosave
   * and the immediate flush behind [Apply changes] can't drift.
   */
  const flushSave = useCallback(async (puzzleId: string, draft: Draft) => {
    const id = resolvedBookId.current;
    if (!id) return;
    setSaving((n) => n + 1);
    try {
      const response = await fetch(`/api/books/${id}/puzzles/${puzzleId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        // The draft already holds ONLY what the publisher changed — an
        // untouched name never enters it — so it is the override set.
        body: JSON.stringify({ overrides: toOverrides(draft) }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        setError(body?.error ?? "That edit couldn't be saved.");
      } else {
        setError(null);
      }
    } finally {
      setSaving((n) => n - 1);
    }
  }, []);

  /**
   * Autosave.
   *
   * Debounced and fire-and-forget by design: the screen already shows the
   * change, so making the publisher wait on a round-trip would add
   * latency to an operation that has none. Separate from the RENDER,
   * which waits for [Apply changes] — typing is cheap to save and
   * expensive to draw.
   */
  const scheduleSave = useCallback(
    (puzzleId: string, draft: Draft) => {
      clearTimeout(saveTimers.current[puzzleId]);
      saveTimers.current[puzzleId] = setTimeout(() => void flushSave(puzzleId, draft), AUTOSAVE_MS);
    },
    [flushSave],
  );

  function editDraft(row: PuzzleRowView, patch: Partial<Draft>) {
    const current = drafts[row.id];
    if (!current) return;
    const next: Draft = { ...current, ...patch };
    setDrafts((prev) => ({ ...prev, [row.id]: next }));
    // Autosave still runs — nothing typed is ever lost, whether or not
    // the page is re-rendered — but the PICTURE waits for Apply. It used
    // to re-render on a timer while someone was still typing, which
    // spent seconds per keystroke-pause on a page about to change again.
    scheduleSave(row.id, next);
    setDirty((prev) => new Set(prev).add(row.id));
    setJustApplied((prev) => {
      if (!prev.has(row.id)) return prev;
      const nextSet = new Set(prev);
      nextSet.delete(row.id);
      return nextSet;
    });
  }

  /**
   * Draws the typed words into the page.
   *
   * Only the render — verification is untouched, because none of this
   * changes the puzzle. A rename cannot invalidate a solver proof, and
   * this deliberately doesn't pretend it can.
   */
  function applyChanges(row: PuzzleRowView) {
    const draft = drafts[row.id];
    if (!draft) return;
    clearTimeout(saveTimers.current[row.id]);
    void flushSave(row.id, draft);
    requestPreviews([row], { [row.id]: draft }, true);
    setDirty((prev) => {
      const next = new Set(prev);
      next.delete(row.id);
      return next;
    });
    setJustApplied((prev) => new Set(prev).add(row.id));
    setTimeout(
      () =>
        setJustApplied((prev) => {
          const next = new Set(prev);
          next.delete(row.id);
          return next;
        }),
      1000,
    );
  }

  /**
   * Jumps to a puzzle NUMBER, not a page number.
   *
   * One numbering system across the app: the reader thinks in puzzles,
   * so they type a puzzle. Which page of five holds it is this
   * function's problem, not theirs.
   */
  async function jumpToPuzzle(puzzleNumber: number) {
    const total = summary?.total ?? puzzleNumber;
    const target = clampPuzzleNumber(puzzleNumber, total);
    setSelectedPuzzle(target);
    setHighlight(target);
    const targetPage = groupForPuzzle(target, total, PAGE_SIZE);
    if (targetPage !== page) await goToPage(targetPage);
  }

  async function goToPage(next: number) {
    if (next < 1 || next > pageCount || next === page) return;
    setStatus("loading");
    const result = await fetchPage(next);
    if (result.ok) applyPage(result.data);
    else {
      setStatus("error");
      setError(result.error);
    }
  }

  async function reroll(row: PuzzleRowView, difficulty?: DifficultyTier) {
    const id = resolvedBookId.current;
    if (!id) return;
    setBusy((prev) => ({ ...prev, [row.id]: true }));
    setError(null);
    try {
      const response = await fetch(`/api/books/${id}/puzzles/${row.id}/reroll`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(difficulty ? { difficulty } : {}),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) {
        setError(body?.error ?? "Couldn't reroll that puzzle.");
        return;
      }
      const { puzzle, undo } = body as { puzzle: PuzzleRowView; undo: UndoEntry };
      applyReplacement(row.id, puzzle);
      setUndoable((prev) => ({ ...prev, [row.id]: undo }));
    } finally {
      setBusy((prev) => ({ ...prev, [row.id]: false }));
    }
  }

  async function undo(row: PuzzleRowView) {
    const id = resolvedBookId.current;
    const entry = undoable[row.id];
    if (!id || !entry) return;
    setBusy((prev) => ({ ...prev, [row.id]: true }));
    setError(null);
    try {
      const response = await fetch(`/api/books/${id}/puzzles/${row.id}/undo`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(entry),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) {
        setError(body?.error ?? "Couldn't restore that puzzle.");
        return;
      }
      applyReplacement(row.id, (body as { puzzle: PuzzleRowView }).puzzle);
      setUndoable((prev) => {
        const next = { ...prev };
        delete next[row.id];
        return next;
      });
    } finally {
      setBusy((prev) => ({ ...prev, [row.id]: false }));
    }
  }

  /** Swaps one puzzle's row, draft and preview in place. Every other card is untouched. */
  function applyReplacement(puzzleId: string, puzzle: PuzzleRowView) {
    setRows((prev) => prev.map((r) => (r.id === puzzleId ? puzzle : r)));
    const draft: Draft = {
      title: puzzle.overrides?.title ?? "",
      subtitle: puzzle.overrides?.subtitle ?? "",
      names: { ...(puzzle.overrides?.names ?? {}) },
      heights: { ...(puzzle.overrides?.heights ?? {}) },
    };
    setDrafts((prev) => ({ ...prev, [puzzleId]: draft }));
    setPages((prev) => {
      const next = { ...prev };
      delete next[puzzleId];
      return next;
    });
    requestPreviews([puzzle], { [puzzleId]: draft }, true);
  }

  // The five cards on screen, as puzzle numbers. Derived from the
  // selection so the chips and the cards cannot disagree.
  const visibleWindow = alignedGroup(selectedPuzzle, summary?.total ?? 0, PAGE_SIZE);

  // Export waits on this. A book is only shippable once every puzzle
  // has been through the solver.
  const allVerified = proof.total > 0 && proof.verified >= proof.total;

  const summaryLine = useMemo(() => {
    if (!summary) return null;
    const tiers = DIFFICULTY_TIERS.filter((tier) => (summary.counts[tier.id] ?? 0) > 0)
      .map((tier) => `${summary.counts[tier.id]} ${difficultyLabel(tier.id)}`)
      .join(" · ");
    return { tiers, ...summary };
  }, [summary]);

  return (
    <div className="flex flex-col gap-5">
      <div className="rounded-lg border border-border bg-surface p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-base font-semibold tracking-tight">
              Review &amp; Customize{" "}
              <span className="ml-1 rounded-full border border-border px-2 py-0.5 align-middle text-[11px] font-medium text-muted-foreground">
                100% optional
              </span>
            </h2>
            <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
              Below is your entire book, puzzle by puzzle. Happy with the mix? Hit Skip to Export
              and you&rsquo;re done.
            </p>
            <p className="mt-1.5 max-w-2xl text-sm text-muted-foreground">
              Want to make it yours? Edit any title, subtitle, or character name. Don&rsquo;t like a
              puzzle? Hit Reroll and a brand-new, freshly-verified puzzle takes its place — you can
              even change its difficulty. Everything autosaves.
            </p>
          </div>
          {/* Reviewing is not exporting. This advances to the next step
              of the wizard; the one export button in the app lives on
              Preview & Export, where the interior it ships is in view. */}
          <button
            type="button"
            onClick={onSkip}
            className="shrink-0 rounded-md bg-accent px-4 py-2 text-sm font-semibold text-accent-foreground hover:opacity-90"
          >
            Skip this step →
          </button>
        </div>

        {summaryLine ? (
          <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-border pt-3 text-xs text-muted-foreground">
            <span className="font-medium text-foreground">{summaryLine.total} puzzles</span>
            {summaryLine.tiers ? <span>{summaryLine.tiers}</span> : null}
            <span>~{summaryLine.estimatedPageCount} pages</span>
            <span>~{formatBytes(summaryLine.estimatedBytes)}</span>
            {saving > 0 ? <span className="text-accent">Saving…</span> : null}
            <button
              type="button"
              onClick={() => {
                setCompactAll((v) => !v);
                setCollapsed(new Set());
              }}
              aria-pressed={compactAll}
              className="ml-auto rounded-md border border-border px-2 py-0.5 text-[11px] font-medium hover:bg-muted"
            >
              {compactAll ? "Expand all" : "Compact all"}
            </button>
          </div>
        ) : null}

        {/* Verification, shown as what it is: progress — and shown at
            all only while some remains. A book whose seeds were all
            proved on a previous visit says so and gets on with it. */}
        {proof.total > 0 ? (
          <div className="mt-2 flex flex-col gap-1.5">
            <div className="flex items-center justify-between gap-2 text-xs">
              <span className={allVerified ? "text-emerald-500" : "text-muted-foreground"}>
                {allVerified
                  ? `${proof.total} of ${proof.total} verified ✓`
                  : `Verifying ${proof.verified}/${proof.total}…`}
              </span>
              {!allVerified ? (
                <span className="text-[11px] text-muted-foreground">
                  Each puzzle is proved to have exactly one solution.
                </span>
              ) : null}
            </div>
            {!allVerified ? (
              <div
                className="h-1.5 w-full overflow-hidden rounded-full bg-muted"
                role="progressbar"
                aria-valuenow={proof.verified}
                aria-valuemin={0}
                aria-valuemax={proof.total}
                aria-label="Puzzles verified"
              >
                <div
                  className="h-full rounded-full bg-accent transition-[width] duration-300"
                  style={{ width: `${Math.round((proof.verified / proof.total) * 100)}%` }}
                />
              </div>
            ) : null}
          </div>
        ) : null}

        {summaryLine && summaryLine.limitSeverity !== "ok" ? (
          <p
            className={`mt-2 text-xs ${
              summaryLine.limitSeverity === "block" ? "text-red-500" : "text-amber-500"
            }`}
          >
            {summaryLine.limitMessage}
          </p>
        ) : null}
      </div>

      {error ? (
        <p className="rounded-md border border-red-500/40 bg-red-500/5 px-3 py-2 text-sm text-red-500">
          {error}
        </p>
      ) : null}

      {/* No "Loading your book…" once rows are in hand: a group that
          has been visited before comes back from the seed caches with
          nothing to wait for, and flashing a grey panel over it would
          invent a delay that isn't there. */}
      {status === "loading" && rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">Loading your book…</p>
      ) : null}

      <div className="flex flex-col gap-4">
        {rows.map((row) => (
          <PuzzleCard
            key={row.id}
            row={row}
            draft={drafts[row.id]}
            text={texts[row.id]}
            pdf={pages[row.id]}
            busy={Boolean(busy[row.id])}
            undoEntry={undoable[row.id]}
            highlighted={highlight === row.index + 1}
            dirty={dirty.has(row.id)}
            justApplied={justApplied.has(row.id)}
            onApply={() => applyChanges(row)}
            onPreview={() => setPreviewing(row.id)}
            expanded={!compactAll && !collapsed.has(row.id)}
            onToggleExpand={() =>
              setCollapsed((prev) => {
                const next = new Set(prev);
                if (next.has(row.id)) next.delete(row.id);
                else next.add(row.id);
                return next;
              })
            }
            onEdit={(patch) => editDraft(row, patch)}
            onReroll={(difficulty) => void reroll(row, difficulty)}
            onUndo={() => void undo(row)}
          />
        ))}
      </div>

      <ListNavigator
        window={visibleWindow}
        total={summary?.total ?? 0}
        selected={selectedPuzzle}
        onSelect={(n) => void jumpToPuzzle(n)}
        onStep={(delta) => void jumpToPuzzle(clampPuzzleNumber(selectedPuzzle + delta, summary?.total ?? 1))}
        onPageJump={(delta) =>
          void jumpToPuzzle(clampPuzzleNumber(selectedPuzzle + delta, summary?.total ?? 1))
        }
      />

      {previewing ? (
        <PagePreviewModal
          rows={rows}
          pages={pages}
          dirty={dirty}
          activeId={previewing}
          onSelect={setPreviewing}
          onClose={() => setPreviewing(null)}
        />
      ) : null}

      <div className="flex justify-end border-t border-border pt-4">
        <button
          type="button"
          onClick={onSkip}
          className="rounded-md bg-accent px-4 py-2 text-sm font-semibold text-accent-foreground hover:opacity-90"
        >
          Next: Front &amp; Back Matter →
        </button>
      </div>
    </div>
  );
}

/**
 * The list's navigator.
 *
 * Its chips are the five cards on screen — never a lookahead. A chip
 * that selects something you can't see would be a lie, so this works in
 * ALIGNED groups (1-5, 6-10, 11-15) and a jump to 13 brings up 11-15
 * with 13 marked. The carousel's rule is deliberately different: it
 * shows one puzzle, so its chips lead.
 *
 * No "page" anywhere. The reader counts puzzles, so the caption counts
 * puzzles: "Showing 11–15 of 100".
 */
function ListNavigator({
  window,
  total,
  selected,
  onSelect,
  onStep,
  onPageJump,
}: {
  window: readonly number[];
  total: number;
  selected: number;
  onSelect: (puzzleNumber: number) => void;
  onStep: (delta: 1 | -1) => void;
  onPageJump: (delta: number) => void;
}) {
  if (total === 0) return null;
  const first = window[0] ?? 1;
  const last = window[window.length - 1] ?? 1;

  return (
    <div className="flex flex-col items-center gap-2">
      <div className="flex flex-wrap items-center justify-center gap-2">
        <button
          type="button"
          onClick={() => onPageJump(-10)}
          disabled={first <= 1}
          aria-label="Back ten puzzles"
          className="rounded-md border border-border px-2 py-1 text-xs text-muted-foreground hover:bg-muted disabled:opacity-30"
        >
          …
        </button>
        <button
          type="button"
          onClick={() => onStep(-1)}
          disabled={total < 2}
          aria-label="Previous puzzle"
          className="rounded-md border border-border px-2 py-1 text-sm text-muted-foreground hover:bg-muted disabled:opacity-30"
        >
          ‹
        </button>

        {window.map((n) => (
          <button
            key={n}
            type="button"
            // Selecting inside the visible group never moves it — the
            // cards under these chips stay exactly where they are.
            onClick={() => onSelect(n)}
            aria-current={n === selected ? "true" : undefined}
            aria-label={`Select puzzle ${n}`}
            className={`h-7 min-w-8 rounded-md px-1.5 text-xs tabular-nums ${
              n === selected
                ? "bg-accent text-accent-foreground"
                : "border border-border text-foreground hover:bg-muted"
            }`}
          >
            {n}
          </button>
        ))}

        <button
          type="button"
          onClick={() => onStep(1)}
          disabled={total < 2}
          aria-label="Next puzzle"
          className="rounded-md border border-border px-2 py-1 text-sm text-muted-foreground hover:bg-muted disabled:opacity-30"
        >
          ›
        </button>
        <button
          type="button"
          onClick={() => onPageJump(10)}
          disabled={last >= total}
          aria-label="Forward ten puzzles"
          className="rounded-md border border-border px-2 py-1 text-xs text-muted-foreground hover:bg-muted disabled:opacity-30"
        >
          …
        </button>

        <PuzzleJumpBox value={selected} total={total} onJump={onSelect} label="Go to puzzle" />
      </div>
      <span className="text-xs tabular-nums text-muted-foreground">
        {showingLabel(window, total)}
      </span>
    </div>
  );
}

function PuzzleCard({
  row,
  draft,
  text,
  pdf,
  busy,
  undoEntry,
  highlighted,
  dirty,
  justApplied,
  onApply,
  onPreview,
  expanded,
  onToggleExpand,
  onEdit,
  onReroll,
  onUndo,
}: {
  row: PuzzleRowView;
  draft: Draft | undefined;
  text: PuzzleText | undefined;
  pdf: Uint8Array | undefined;
  busy: boolean;
  undoEntry: UndoEntry | undefined;
  /** True for a second after a jump lands on this puzzle. */
  highlighted: boolean;
  /** Typed words not yet drawn into the page. */
  dirty: boolean;
  justApplied: boolean;
  onApply: () => void;
  onPreview: () => void;
  expanded: boolean;
  onToggleExpand: () => void;
  onEdit: (patch: Partial<Draft>) => void;
  onReroll: (difficulty?: DifficultyTier) => void;
  onUndo: () => void;
}) {
  // The single map every text surface on this card resolves through.
  // Editing one entry re-renders the title, the brief and every clue in
  // the same pass — which is the whole reason clue text is stored with
  // tokens instead of names.
  const names = useMemo(() => {
    const map: Record<string, string> = {};
    for (const suspect of text?.suspects ?? []) {
      const typed = draft?.names[suspect.id]?.trim();
      map[suspect.id] = typed && typed.length > 0 ? typed : suspect.name;
    }
    return map;
  }, [draft, text]);

  const generatedTitle = text ? renderTemplate(text.titleTemplate, names) : "";
  const typedTitle = draft?.title.trim() ?? "";
  const shownTitle = typedTitle ? renderTemplate(typedTitle, names) : generatedTitle;
  const suspects = text?.suspects ?? [];

  return (
    <div
      className={`rounded-lg border bg-surface p-4 ${
        highlighted ? "kdp-pulse border-accent" : "border-border"
      }`}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <span className="text-sm font-semibold">Puzzle {row.index + 1}</span>
          <span className="rounded border border-border px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
            {difficultyLabel(row.difficulty)}
          </span>
          {/* Only ever shown for a row a solver run has actually proved —
              see verifyPage in lib/puzzle-set.ts. */}
          {row.verified ? (
            <span
              title={`Proved to have exactly one solution (${row.solveNodes.toLocaleString()} search nodes).`}
              className="rounded border border-emerald-500/40 bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-medium text-emerald-500"
            >
              ✓ Verified
            </span>
          ) : (
            <span className="rounded border border-border px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
              Checking…
            </span>
          )}
        </div>
        <span className="text-[11px] tabular-nums text-muted-foreground">seed {row.seed}</span>
      </div>

      {!expanded ? (
        // Collapsed: identity and the two actions that don't need the
        // editor open. Five of these fit on a page; five expanded cards
        // are a scroll.
        <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
          <p className="min-w-0 flex-1 truncate text-sm text-muted-foreground">{shownTitle}</p>
          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={() => onReroll()}
              disabled={busy}
              className="rounded-md border border-border px-2.5 py-1 text-xs font-medium hover:bg-muted disabled:opacity-40"
            >
              {busy ? "Rerolling…" : "Reroll"}
            </button>
            {undoEntry ? (
              <button
                type="button"
                onClick={onUndo}
                disabled={busy}
                className="rounded-md border border-accent px-2.5 py-1 text-xs font-medium hover:bg-accent/10 disabled:opacity-40"
              >
                Undo
              </button>
            ) : null}
            <button
              type="button"
              onClick={onToggleExpand}
              className="rounded-md border border-border px-2.5 py-1 text-xs font-medium hover:bg-muted"
            >
              Edit
            </button>
          </div>
        </div>
      ) : null}

      <div className="mt-3 grid gap-4 sm:grid-cols-[168px_1fr]" hidden={!expanded}>
        <Thumbnail pdf={pdf} stale={dirty} onOpen={onPreview} />

        <div className="flex min-w-0 flex-col gap-3">
          <div>
            <label className="text-xs font-medium" htmlFor={`title-${row.id}`}>
              Case title
            </label>
            <input
              id={`title-${row.id}`}
              className={`${fieldClass} mt-1`}
              value={draft?.title ?? ""}
              placeholder={generatedTitle}
              maxLength={120}
              onChange={(event) => onEdit({ title: event.target.value })}
            />
            {typedTitle ? null : (
              <p className="mt-1 text-[11px] text-muted-foreground">
                Leave blank to keep the generated title above.
              </p>
            )}
          </div>

          <div>
            <label className="text-xs font-medium" htmlFor={`subtitle-${row.id}`}>
              Subtitle <span className="font-normal text-muted-foreground">(optional)</span>
            </label>
            <input
              id={`subtitle-${row.id}`}
              className={`${fieldClass} mt-1`}
              value={draft?.subtitle ?? ""}
              placeholder="A line under the title"
              maxLength={160}
              onChange={(event) => onEdit({ subtitle: event.target.value })}
            />
          </div>

          <div>
            <p className="text-xs font-medium">Cast</p>
            <div className="mt-1 grid gap-1.5 sm:grid-cols-2">
              {suspects.map((suspect) => (
                <div key={suspect.id} className="flex items-center gap-1.5">
                  <input
                    aria-label={`Name for suspect ${suspect.id}`}
                    className={fieldClass}
                    value={draft?.names[suspect.id] ?? suspect.name}
                    maxLength={40}
                    onChange={(event) =>
                      onEdit({ names: { ...(draft?.names ?? {}), [suspect.id]: event.target.value } })
                    }
                  />
                  {suspect.isVictim ? (
                    <span
                      title="The victim"
                      className="shrink-0 rounded border border-border px-1 py-0.5 text-[10px] text-muted-foreground"
                    >
                      victim
                    </span>
                  ) : null}
                </div>
              ))}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <label className="text-xs font-medium" htmlFor={`difficulty-${row.id}`}>
              Reroll at
            </label>
            <select
              id={`difficulty-${row.id}`}
              className="rounded-md border border-border bg-surface px-2 py-1 text-xs"
              defaultValue={row.requestedDifficulty}
              onChange={(event) => onReroll(event.target.value as DifficultyTier)}
              disabled={busy}
            >
              {DIFFICULTY_TIERS.map((tier) => (
                <option key={tier.id} value={tier.id}>
                  {tier.label}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => onReroll()}
              disabled={busy}
              className="rounded-md border border-border px-2.5 py-1 text-xs font-medium hover:bg-muted disabled:opacity-40"
            >
              {busy ? "Rerolling…" : "Reroll"}
            </button>
            {undoEntry ? (
              <button
                type="button"
                onClick={onUndo}
                disabled={busy}
                className="rounded-md border border-accent px-2.5 py-1 text-xs font-medium text-foreground hover:bg-accent/10 disabled:opacity-40"
              >
                Undo reroll
              </button>
            ) : null}
            {/* Only while the page is behind the words. Editing costs
                nothing to show and seconds to draw, so the draw is asked
                for rather than guessed at. */}
            {dirty ? (
              <button
                type="button"
                onClick={onApply}
                className="rounded-md bg-accent px-2.5 py-1 text-xs font-semibold text-accent-foreground hover:opacity-90"
              >
                Apply changes
              </button>
            ) : justApplied ? (
              <span className="rounded-md border border-emerald-500/40 bg-emerald-500/10 px-2.5 py-1 text-xs font-medium text-emerald-500">
                Applied ✓
              </span>
            ) : null}
            <button
              type="button"
              onClick={onToggleExpand}
              className="ml-auto text-xs text-muted-foreground underline-offset-2 hover:underline"
            >
              Done editing
            </button>
          </div>
        </div>
      </div>

      {expanded && text ? (
        <div className="mt-4 border-t border-border pt-3 text-xs text-muted-foreground">
          {/* Live text, resolved through the name map above — this is
              what makes a rename visible instantly across every line. */}
          <p className="font-medium text-foreground">{shownTitle}</p>
          <p className="mt-1 italic">{renderTemplate(text.briefTemplate, names)}</p>
          <ul className="mt-2 list-disc space-y-0.5 pl-4">
            {text.clueTemplates.map((clue, i) => (
              <li key={i}>{renderTemplate(clue, names)}</li>
            ))}
          </ul>
          {text.evidenceTemplates.length > 0 ? (
            <>
              <p className="mt-2 font-medium text-foreground">Evidence</p>
              <ul className="mt-1 list-disc space-y-0.5 pl-4">
                {text.evidenceTemplates.map((clue, i) => (
                  <li key={i}>{renderTemplate(clue, names)}</li>
                ))}
              </ul>
            </>
          ) : null}

          {/* For the publisher, and only here. The printed puzzle page
              carries a blank "THE MURDERER IS" line; the solution
              appears on this card and in the exported answer key. It
              resolves through the same name map as everything else, so a
              rename shows up in it as you type. */}
          <p className="mt-3 rounded-md border border-dashed border-border bg-muted/40 p-2 text-[11px]">
            <span className="font-medium text-foreground">
              Solution (not printed on the puzzle page):
            </span>{" "}
            {names[text.culpritSuspectId] ?? "?"} is the murderer — they shared the{" "}
            {text.crimeRoomName} with {names[text.victimSuspectId] ?? "?"}, using the{" "}
            {text.murderWeapon}.
          </p>

          {/* The tier badge, audited.
              A label like "Extreme" is a promise about the reasoning the
              puzzle demands, and a promise nobody can check is just a
              word. This is the measurement it rests on: the hardest
              technique the puzzle forces, and how far the deductions
              cascade. See tier-contract.ts in the generator for what
              each rung means. */}
          {text.logicProfile ? (
            <p className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px]">
              <span className="font-medium text-foreground">Logic required:</span>
              <span>{text.logicProfile.summary}</span>
              <span className="text-muted-foreground/70">
                · needs {TECHNIQUE_LABEL[text.logicProfile.solvedAt]} · deductions chain{" "}
                {text.logicProfile.chain} deep
              </span>
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

/**
 * The puzzle's real printed page — and a way into a full-size look at it.
 *
 * Scaled to fit its column, never cropped; all of the measuring and
 * letterboxing lives in PdfPageView. The whole tile is the button, with
 * a chip for people who need to be told so: it appears on hover, and
 * stays put on touch, where there is no hover to reveal it.
 */
function Thumbnail({
  pdf,
  stale,
  onOpen,
}: {
  pdf: Uint8Array | undefined;
  stale: boolean;
  onOpen: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label="Open a full-page preview of this puzzle"
      className="group relative flex min-h-[180px] items-center justify-center rounded-md border border-border bg-muted/40 p-1.5 text-left hover:border-accent focus:outline-none focus:ring-2 focus:ring-accent/30"
    >
      <PdfPageView pdf={pdf} pageNumber={1} placeholder="Rendering…" />
      <span className="pointer-events-none absolute bottom-2 left-1/2 -translate-x-1/2 rounded-full bg-foreground/85 px-2 py-0.5 text-[10px] font-medium text-surface opacity-0 transition-opacity group-hover:opacity-100 group-focus:opacity-100 [@media(hover:none)]:opacity-100">
        🔍 Preview
      </span>
      {stale ? (
        <span className="pointer-events-none absolute right-1.5 top-1.5 rounded bg-amber-500 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-white">
          Not applied
        </span>
      ) : null}
    </button>
  );
}

/**
 * A full-page look at one puzzle, with the group's other puzzles a step
 * away.
 *
 * It shows the APPLIED page — the PDF as last drawn — because that is
 * what the export will print. If the card has words that haven't been
 * drawn yet the modal says so rather than quietly showing stale content
 * and letting a publisher approve something they didn't write.
 */
function PagePreviewModal({
  rows,
  pages,
  dirty,
  activeId,
  onSelect,
  onClose,
}: {
  rows: PuzzleRowView[];
  pages: Record<string, Uint8Array>;
  dirty: Set<string>;
  activeId: string;
  onSelect: (id: string) => void;
  onClose: () => void;
}) {
  const index = rows.findIndex((row) => row.id === activeId);
  const active = rows[index];

  const step = useCallback(
    (delta: 1 | -1) => {
      if (rows.length === 0) return;
      const next = (index + delta + rows.length) % rows.length;
      onSelect(rows[next]!.id);
    },
    [index, rows, onSelect],
  );

  // Keyboard is the point of a modal like this: Escape closes and the
  // arrows step, so a publisher can walk a group without reaching for
  // the mouse.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
      else if (event.key === "ArrowRight") step(1);
      else if (event.key === "ArrowLeft") step(-1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, step]);

  if (!active) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Puzzle ${active.index + 1} preview`}
      className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-3 bg-black/70 p-4"
      // Clicking the backdrop closes; clicking the page itself doesn't.
      onClick={onClose}
    >
      <div
        className="flex max-h-full w-full max-w-3xl flex-col gap-3 overflow-auto rounded-lg bg-surface p-4"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-sm font-semibold">Puzzle {active.index + 1}</span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => step(-1)}
              aria-label="Previous puzzle"
              disabled={rows.length < 2}
              className="rounded-md border border-border px-2 py-1 text-sm hover:bg-muted disabled:opacity-30"
            >
              ‹
            </button>
            <button
              type="button"
              onClick={() => step(1)}
              aria-label="Next puzzle"
              disabled={rows.length < 2}
              className="rounded-md border border-border px-2 py-1 text-sm hover:bg-muted disabled:opacity-30"
            >
              ›
            </button>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close preview"
              className="rounded-md border border-border px-2.5 py-1 text-sm hover:bg-muted"
            >
              ✕
            </button>
          </div>
        </div>

        {dirty.has(active.id) ? (
          <p className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-600">
            Unapplied changes — hit <span className="font-medium">Apply changes</span> to update
            this preview.
          </p>
        ) : null}

        <PdfPageView pdf={pages[active.id]} pageNumber={1} placeholder="Rendering…" />
      </div>
    </div>
  );
}
