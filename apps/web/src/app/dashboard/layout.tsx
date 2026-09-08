import { DashboardShell } from "@/components/dashboard-shell";

// This layout stays mounted across every /dashboard/* navigation — the
// sidebar (and, on mobile, the drawer state) never remounts when moving
// between "My Books" and "New Book", so it reads as one app with a content
// pane that swaps, not a sequence of separate pages.
export default function DashboardLayout({ children }: LayoutProps<"/dashboard">) {
  return <DashboardShell>{children}</DashboardShell>;
}
