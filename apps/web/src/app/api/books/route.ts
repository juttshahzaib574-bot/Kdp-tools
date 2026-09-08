import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@kdp/db";
import { gridMysteryInputSchema } from "@kdp/shared";
import { getOrCreateCurrentUser } from "@/lib/current-user";
import { checkRateLimit } from "@/lib/rate-limit";
import { buildPuzzleSet } from "@/lib/puzzle-set";

// Only the fields the client is allowed to set. Anything else in the request
// body (e.g. userId, status) is ignored rather than trusted.
const createBookSchema = gridMysteryInputSchema;

/**
 * A draft is a book that exists but hasn't been sent to the worker yet.
 *
 * The Customize tab needs somewhere to put a reroll and a rename, and
 * "somewhere" has to be a real book — puzzles are rows against a bookId.
 * So opening that tab creates the book as a DRAFT with its puzzle set
 * built and no generation job. Export is a separate step (PUT with
 * `enqueue`), which is also what makes "Skip to Export" a one-click path
 * rather than a different code path.
 *
 * Read off the raw body rather than through the input schema because
 * that schema is the *generator's* contract — draft-ness is about this
 * app's workflow, not about what gets rendered.
 */
function wantsDraft(body: unknown): boolean {
  return Boolean(body && typeof body === "object" && (body as { draft?: unknown }).draft === true);
}

export async function POST(request: Request) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rateLimit = await checkRateLimit(`create-book:${userId}`);
  if (!rateLimit.success) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  const body = await request.json().catch(() => null);
  const parsed = createBookSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input", issues: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const user = await getOrCreateCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Defense in depth: without this, a request could reference another
  // user's asset id and have it silently embedded into this book (the
  // worker also re-checks ownership before rendering, but rejecting it
  // here means a bad reference never even gets persisted).
  const assetIds = Object.values(parsed.data.pageImages ?? {}).filter((id): id is string =>
    Boolean(id),
  );
  if (assetIds.length > 0) {
    const ownedCount = await prisma.asset.count({
      where: { id: { in: assetIds }, userId: user.id },
    });
    if (ownedCount !== new Set(assetIds).size) {
      return NextResponse.json(
        { error: "One or more page images were not found" },
        { status: 400 },
      );
    }
  }

  const draft = wantsDraft(body);

  const book = await prisma.book.create({
    data: {
      userId: user.id,
      type: "MURDER_MYSTERY",
      title: parsed.data.title,
      status: draft ? "DRAFT" : "QUEUED",
      inputParams: parsed.data,
      // A draft gets no job — nothing should render until the publisher
      // says so. Everything else queues immediately, as it always has.
      ...(draft ? {} : { jobs: { create: { status: "QUEUED" } } }),
    },
    select: { id: true, title: true, status: true, createdAt: true },
  });

  // Rows are seeds, not solved puzzles (see puzzle-set.ts), so building
  // a hundred-puzzle set here is one INSERT rather than minutes of
  // search inside this request. Verification happens per page, when the
  // publisher actually looks at a puzzle.
  if (draft) await buildPuzzleSet(book.id, parsed.data);

  // No separate queue to push to: the GenerationJob row created above is
  // the source of truth, and the worker picks it up by polling for QUEUED
  // jobs (see apps/worker/src/claim-job.ts).

  return NextResponse.json({ book }, { status: 201 });
}

export async function GET() {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = await getOrCreateCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const books = await prisma.book.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({ books });
}
