"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, type ReactNode } from "react";

interface NavItem {
  href: string;
  label: string;
  icon: (props: { className?: string }) => ReactNode;
}

const NAV_ITEMS: NavItem[] = [
  { href: "/dashboard", label: "My Books", icon: BooksIcon },
  { href: "/dashboard/new", label: "New Book", icon: PlusIcon },
];

/**
 * Persistent app shell for everything under /dashboard: a sidebar that stays
 * mounted across navigation (Next only swaps the content pane, since this
 * layout wraps every /dashboard/* route) instead of each page feeling like a
 * standalone screen. Desktop gets a fixed sidebar; below `lg` it collapses
 * into a hamburger-triggered overlay drawer, closing itself on navigation or
 * a tap outside — the same interaction pattern as a mobile app's nav drawer,
 * not a second copy of the page's own layout.
 */
export function DashboardShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [drawerOpen, setDrawerOpen] = useState(false);

  return (
    <div className="flex flex-1 flex-col lg:flex-row">
      <button
        type="button"
        onClick={() => setDrawerOpen(true)}
        aria-label="Open navigation"
        className="flex h-11 items-center gap-2 border-b border-border px-4 text-sm font-medium lg:hidden"
      >
        <MenuIcon className="h-4 w-4" />
        Menu
      </button>

      {drawerOpen ? (
        <button
          type="button"
          aria-label="Close navigation"
          onClick={() => setDrawerOpen(false)}
          className="fixed inset-0 z-40 bg-black/40 lg:hidden"
        />
      ) : null}

      <aside
        className={`fixed inset-y-0 left-0 z-50 w-64 -translate-x-full border-r border-border bg-surface transition-transform duration-200 lg:static lg:z-auto lg:w-56 lg:translate-x-0 lg:shrink-0 ${
          drawerOpen ? "translate-x-0" : ""
        }`}
      >
        <div className="flex h-11 items-center justify-between border-b border-border px-4 lg:hidden">
          <span className="text-sm font-semibold">Navigate</span>
          <button
            type="button"
            onClick={() => setDrawerOpen(false)}
            aria-label="Close navigation"
            className="text-muted-foreground hover:text-foreground"
          >
            <CloseIcon className="h-4 w-4" />
          </button>
        </div>
        <nav className="flex flex-col gap-0.5 p-3">
          {NAV_ITEMS.map((item) => {
            const active = pathname === item.href;
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setDrawerOpen(false)}
                className={`flex items-center gap-2.5 rounded-md px-3 py-2 text-sm transition-colors ${
                  active ? "bg-accent text-accent-foreground" : "text-foreground hover:bg-muted"
                }`}
              >
                <Icon className="h-4 w-4 shrink-0" />
                {item.label}
              </Link>
            );
          })}
        </nav>
      </aside>

      <main className="min-w-0 flex-1">{children}</main>
    </div>
  );
}

function MenuIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        d="M4 6h16M4 12h16M4 18h16"
      />
    </svg>
  );
}

function CloseIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path stroke="currentColor" strokeWidth="2" strokeLinecap="round" d="M6 6l12 12M18 6L6 18" />
    </svg>
  );
}

function BooksIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M4 4.5h6.5A1.5 1.5 0 0 1 12 6v14a1.5 1.5 0 0 0-1.5-1.5H4z"
      />
      <path
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M20 4.5h-6.5A1.5 1.5 0 0 0 12 6v14a1.5 1.5 0 0 1 1.5-1.5H20z"
      />
    </svg>
  );
}

function PlusIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path stroke="currentColor" strokeWidth="2" strokeLinecap="round" d="M12 5v14M5 12h14" />
    </svg>
  );
}
