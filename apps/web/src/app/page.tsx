import Link from "next/link";
import { auth } from "@clerk/nextjs/server";

export default async function Home() {
  const { userId } = await auth();

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col items-center justify-center gap-6 px-4 py-16 text-center sm:gap-8 sm:px-6 sm:py-24">
      <span className="rounded-full border border-border px-3 py-1 text-xs font-medium text-muted-foreground">
        Verified deduction engine — no AI, every puzzle mathematically unique
      </span>
      <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl md:text-5xl">
        Generate print-ready whodunit puzzle books for Amazon KDP
      </h1>
      <p className="max-w-xl text-balance text-sm text-muted-foreground sm:text-base">
        Pick a grid size and difficulty. Get a fully laid-out, KDP-formatted PDF with a
        one-of-a-kind logic puzzle and answer key — generated and verified in seconds.
      </p>
      <div className="flex flex-col gap-3 sm:flex-row">
        {userId ? (
          <Link
            href="/dashboard"
            className="rounded-md bg-accent px-6 py-2.5 text-sm font-medium text-accent-foreground transition-opacity hover:opacity-90"
          >
            Go to dashboard
          </Link>
        ) : (
          <Link
            href="/sign-up"
            className="rounded-md bg-accent px-6 py-2.5 text-sm font-medium text-accent-foreground transition-opacity hover:opacity-90"
          >
            Get started
          </Link>
        )}
      </div>
    </main>
  );
}
