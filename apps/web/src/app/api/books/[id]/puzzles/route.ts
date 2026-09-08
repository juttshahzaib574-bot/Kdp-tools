import { NextResponse } from "next/server";
import { prisma } from "@kdp/db";
import { checkKdpLimits, difficultyRank, pageSlice, type DifficultyTier } from "@kdp/shared";
import { getOrCreateCurrentUser } from "@/lib/current-user";
import {
  PUZZLE_SELECT,
  asTier,
  buildPuzzleSet,
  loadOwnedBook,
  reconcilePuzzleSet,
  toClientRow,
} from "@/lib/puzzle-set";

// The book's puzzle set, as the Customize tab sees it.
//
// GET is paginated for a real reason rather than tidiness: materialising
// a puzzle means running the solver, so a hundred-puzzle book rendered
// in one response would be a hundred searches inside one request. Five
// per page is what the tab shows, and five is what this proves.

/** Matches the tab's paginator. Bounded so a crafted `pageSize` can't ask for a hundred solver runs. */
const DEFAULT_PAGE_SIZE = 5;
const MAX_PAGE_SIZE = 10;

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getOrCreateCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const owned = await loadOwnedBook(id, user.id);
  if (!owned) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const url = new URL(request.url);
  const pageSize = Math.min(
    MAX_PAGE_SIZE,
    Math.max(1, Number(url.searchParams.get("pageSize")) || DEFAULT_PAGE_SIZE),
  );
  const requestedPage = Math.max(1, Number(url.searchParams.get("page")) || 1);

  const total = await prisma.puzzle.count({ where: { bookId: id } });
  // Same arithmetic the tab's paginator runs — see @kdp/shared/pagination
  // for why that is shared code rather than two `Math.ceil` calls.
  const { page, skip, take, pageCount } = pageSlice(requestedPage, total, pageSize);

  const rows = await prisma.puzzle.findMany({
    where: { bookId: id },
    orderBy: { index: "asc" },
    skip,
    take,
    select: PUZZLE_SELECT,
  });

  // Rows only — no puzzle is materialised here.
  //
  // This route used to call summarize(), which generates each puzzle to
  // report its cast and title, and generating means SOLVING. So opening
  // the tab, switching away and back, or refreshing all re-ran the
  // solver five times over for puzzles that had already been proved —
  // seconds of work to redisplay something that hadn't changed, and the
  // reason the tab showed "Verifying…" every time it was opened.
  //
  // The browser already rebuilds these puzzles in a worker to draw
  // thumbnails and resolve clue text (see puzzle-review.worker.js), off
  // the main thread and cached per seed. Doing it server-side as well
  // was duplicated work whose only product was a slow page load.
  const puzzles = rows.map(toClientRow);

  // The whole-book summary line. Counts come from the rows, not from the
  // plan that created them — calibration can re-tier a puzzle, and the
  // publisher can reroll one to a different tier, so the plan stops
  // being the truth the moment anyone touches the book.
  const grouped = await prisma.puzzle.groupBy({
    by: ["difficulty"],
    where: { bookId: id },
    _count: { _all: true },
  });
  const counts: Partial<Record<DifficultyTier, number>> = {};
  for (const group of grouped) counts[asTier(group.difficulty)] = group._count._all;

  const verifiedCount = await prisma.puzzle.count({
    where: { bookId: id, verifiedAt: { not: null } },
  });

  const limits = checkKdpLimits({
    puzzleCount: total,
    includeAnswerKey: owned.input.includeAnswerKey,
    puzzlesPerSpread: owned.input.puzzlesPerSpread,
  });

  return NextResponse.json({
    puzzles,
    page,
    pageSize,
    pageCount,
    total,
    summary: {
      total,
      verified: verifiedCount,
      counts: Object.fromEntries(
        (Object.entries(counts) as [DifficultyTier, number][]).sort(
          (a, b) => difficultyRank(a[0]) - difficultyRank(b[0]),
        ),
      ),
      estimatedPageCount: limits.estimate.pageCount,
      estimatedBytes: limits.estimate.bytes,
      limitSeverity: limits.severity,
      limitMessage: limits.message,
    },
  });
}

/**
 * Builds (or brings up to date) the set.
 *
 * `?rebuild=1` forces a fresh set, discarding every edit — the tab asks
 * for that explicitly and warns first. Without it the set is reconciled,
 * which keeps existing rerolls and renames wherever it honestly can (see
 * reconcilePuzzleSet).
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getOrCreateCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const owned = await loadOwnedBook(id, user.id);
  if (!owned) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const rebuild = new URL(request.url).searchParams.get("rebuild") === "1";
  const result = rebuild
    ? { rebuilt: true, count: await buildPuzzleSet(id, owned.input) }
    : await reconcilePuzzleSet(id, owned.input);

  return NextResponse.json(result);
}
