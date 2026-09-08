import Link from "next/link";
import { prisma } from "@kdp/db";
import { getOrCreateCurrentUser } from "@/lib/current-user";

const STATUS_STYLES: Record<string, string> = {
  READY: "text-success",
  FAILED: "text-danger",
  QUEUED: "text-muted-foreground",
  GENERATING: "text-muted-foreground",
  DRAFT: "text-muted-foreground",
};

export default async function DashboardPage() {
  const user = await getOrCreateCurrentUser();
  const books = user
    ? await prisma.book.findMany({
        where: { userId: user.id },
        orderBy: { createdAt: "desc" },
        // The most recent successful job carries the file keys. Only its
        // presence decides which download links to offer — books made
        // before covers were retired still have one, newer ones don't,
        // and neither should be shown a link that 409s.
        include: {
          jobs: {
            where: { status: "SUCCEEDED" },
            orderBy: { finishedAt: "desc" },
            take: 1,
            select: { coverFileKey: true },
          },
        },
      })
    : [];

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-10 sm:px-6 sm:py-14">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">Your books</h1>
        <Link
          href="/dashboard/new"
          className="inline-flex items-center justify-center rounded-md bg-accent px-4 py-2 text-sm font-medium text-accent-foreground transition-opacity hover:opacity-90"
        >
          New book
        </Link>
      </div>

      {books.length === 0 ? (
        <div className="mt-10 rounded-lg border border-dashed border-border p-8 text-center">
          <p className="text-sm text-muted-foreground">
            No books yet. Generate your first verified whodunit puzzle book to get started.
          </p>
        </div>
      ) : (
        <ul className="mt-8 divide-y divide-border overflow-hidden rounded-lg border border-border">
          {books.map((book) => (
            <li
              key={book.id}
              className="flex flex-col gap-2 bg-surface px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between sm:px-5"
            >
              <span className="truncate text-sm font-medium">{book.title}</span>
              <div className="flex shrink-0 items-center gap-4">
                {book.status === "READY" ? (
                  <div className="flex items-center gap-3 text-xs font-medium">
                    <a
                      href={`/api/books/${book.id}/download?kind=interior`}
                      className="text-accent underline-offset-4 hover:underline"
                    >
                      Interior PDF
                    </a>
                    {/* Only for books generated back when the app drew
                        its own covers. New books get a cover SPEC and a
                        printable guide on the Preview & Export tab
                        instead — see cover-spec.tsx for why we stopped
                        designing covers. */}
                    {book.jobs[0]?.coverFileKey ? (
                      <a
                        href={`/api/books/${book.id}/download?kind=cover`}
                        className="text-accent underline-offset-4 hover:underline"
                      >
                        Cover PDF
                      </a>
                    ) : null}
                  </div>
                ) : null}
                <span
                  className={`text-xs font-medium uppercase tracking-wide ${STATUS_STYLES[book.status] ?? "text-muted-foreground"}`}
                >
                  {book.status}
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
