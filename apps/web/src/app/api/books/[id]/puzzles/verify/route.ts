import { NextResponse } from "next/server";
import { getOrCreateCurrentUser } from "@/lib/current-user";
import {
  PuzzleVerificationExhaustedError,
  loadOwnedBook,
  verifyChunk,
} from "@/lib/puzzle-set";

// Proving a book, a chunk at a time.
//
// Verification is the product's central promise — every puzzle has
// exactly one solution, proved by a solver run — and it costs real time:
// a hundred Extreme puzzles is minutes of search. Doing it in one
// request would hit a gateway timeout and report nothing; doing it
// lazily, one page at a time, means a publisher can reach Export with
// most of the book unproved.
//
// So the client drives it in chunks and shows the count climbing. That
// makes verification legible as progress rather than something that
// looks like a defect while it's happening.

/**
 * Puzzles proved per request.
 *
 * Small enough that even a chunk of Extreme 8x8s finishes well inside a
 * request timeout, large enough that a 30-puzzle book isn't 30 round
 * trips.
 */
const CHUNK_SIZE = 4;

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getOrCreateCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const owned = await loadOwnedBook(id, user.id);
  if (!owned) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const requested = Number(new URL(request.url).searchParams.get("limit"));
  const limit = Number.isFinite(requested)
    ? Math.min(Math.max(1, Math.floor(requested)), CHUNK_SIZE)
    : CHUNK_SIZE;

  try {
    return NextResponse.json(await verifyChunk(id, owned.input, limit));
  } catch (error) {
    if (error instanceof PuzzleVerificationExhaustedError) {
      // Every other puzzle is fine; one slot couldn't be built. Say
      // which, so the publisher can reroll it rather than being told the
      // whole book failed.
      return NextResponse.json({ error: error.message, index: error.index }, { status: 422 });
    }
    throw error;
  }
}
