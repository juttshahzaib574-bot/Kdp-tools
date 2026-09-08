import Link from "next/link";
import { UserButton } from "@clerk/nextjs";
import { auth } from "@clerk/nextjs/server";
import { ThemeToggle } from "./theme-toggle";

// <SignedIn>/<SignedOut> were removed upstream (@clerk/nextjs "Core 3") —
// this checks auth state server-side instead, the same way every other
// server component in this app does (see lib/current-user.ts).
export async function SiteHeader() {
  const { userId } = await auth();
  const isSignedIn = Boolean(userId);

  return (
    <header className="border-b border-border">
      <div className="mx-auto flex h-14 w-full max-w-5xl items-center justify-between px-4 sm:px-6">
        <Link href="/" className="text-sm font-semibold tracking-tight sm:text-base">
          KDP Studio Library
        </Link>
        <div className="flex items-center gap-2 sm:gap-3">
          {isSignedIn ? (
            <Link
              href="/dashboard"
              className="hidden text-sm text-muted-foreground transition-colors hover:text-foreground sm:inline"
            >
              Dashboard
            </Link>
          ) : null}
          <ThemeToggle />
          {isSignedIn ? (
            // afterSignOutUrl was also removed from UserButtonProps
            // upstream; sign-out now uses Clerk's default redirect.
            <UserButton />
          ) : (
            <Link
              href="/sign-in"
              className="rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-accent-foreground transition-opacity hover:opacity-90"
            >
              Sign in
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}
