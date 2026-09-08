"use client";

import { Component, type ReactNode } from "react";

/**
 * Catches render/lifecycle errors from a single tab's panel and shows a
 * recoverable inline error instead of letting the whole route crash. In
 * practice the tabs on New Book each mount heavy client-side machinery
 * (Web Workers, pdfjs, canvas rendering); an unhandled exception in any
 * one of them would otherwise blank the entire page. Scope this boundary
 * as tightly as possible — one per heavy tab — so an error in the
 * carousel doesn't hide the rest of the form.
 */
interface Props {
  tabLabel: string;
  children: ReactNode;
}
interface State {
  error: Error | null;
}
export class TabErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error) {
    console.error("TabErrorBoundary caught:", error);
  }

  reset = () => this.setState({ error: null });

  render() {
    if (this.state.error) {
      return (
        <div className="rounded-lg border border-danger/30 bg-danger/5 p-4 text-sm">
          <p className="font-semibold text-danger">
            The &ldquo;{this.props.tabLabel}&rdquo; tab hit an error.
          </p>
          <p className="mt-1 text-xs text-muted-foreground">{this.state.error.message}</p>
          <button
            type="button"
            onClick={this.reset}
            className="mt-3 rounded-md border border-border px-3 py-1 text-xs font-medium hover:bg-muted"
          >
            Try again
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
