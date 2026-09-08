-- Puzzles become durable, editable rows so a book can be reviewed and
-- customised before export. Additive only: no existing table or column
-- is altered, so a deploy mid-flight leaves in-progress books untouched.
CREATE TABLE "Puzzle" (
    "id" TEXT NOT NULL,
    "bookId" TEXT NOT NULL,
    "index" INTEGER NOT NULL,
    "seed" INTEGER NOT NULL,
    "difficulty" TEXT NOT NULL,
    "requestedDifficulty" TEXT NOT NULL,
    "gridSize" INTEGER NOT NULL,
    "solveNodes" INTEGER NOT NULL DEFAULT 0,
    "overrides" JSONB,
    -- Null until a solver run has proved exactly one solution. The UI's
    -- verified badge reads this, so it can never appear ahead of proof.
    "verifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Puzzle_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Puzzle_bookId_idx" ON "Puzzle"("bookId");
-- One puzzle per slot: a reroll replaces a row's seed in place rather
-- than inserting a duplicate at the same position.
CREATE UNIQUE INDEX "Puzzle_bookId_index_key" ON "Puzzle"("bookId", "index");

ALTER TABLE "Puzzle" ADD CONSTRAINT "Puzzle_bookId_fkey"
    FOREIGN KEY ("bookId") REFERENCES "Book"("id") ON DELETE CASCADE ON UPDATE CASCADE;
