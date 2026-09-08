"use client";

import { useEffect, useRef, useState } from "react";
import { clampPuzzleNumber, parseJump } from "@kdp/shared";

// The one navigation control, and the one numbering system it speaks.
//
// The carousel used to show three numbers side by side — "Puzzle 3 of
// 100", "Page 1 of 20", and chips reading 1..5 — leaving a reader to
// work out which was which. There is one number now: the puzzle number.
// The arrows step it, the chips jump to it, the box types it, and the
// caption reads it.

export interface PuzzleJumpBoxProps {
  value: number;
  total: number;
  onJump: (value: number) => void;
  /** Called before any change, so the caller can stand autoplay down. */
  onInteract?: () => void;
  label?: string;
}

/**
 * The `[ 3 ] / 100` box.
 *
 * Enter commits, Escape puts back what was there, and the arrow keys
 * step — the conventions of every number field, so nobody has to learn
 * this one. Out of range clamps and says the range for a second, because
 * silently landing on 100 when you typed 1000 looks like a bug. Text
 * that isn't a number is refused with a shake rather than an error: the
 * refusal IS the message.
 */
export function PuzzleJumpBox({
  value,
  total,
  onJump,
  onInteract,
  label = "Go to puzzle",
}: PuzzleJumpBoxProps) {
  const [draft, setDraft] = useState(String(value));
  const [hint, setHint] = useState<string | null>(null);
  const [shaking, setShaking] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const editingRef = useRef(false);

  // Follow the selection while the reader isn't typing — autoplay and
  // the arrows both move it, and the box has to keep up without
  // stealing what someone is halfway through entering.
  useEffect(() => {
    if (!editingRef.current) setDraft(String(value));
  }, [value]);

  useEffect(() => {
    if (!hint) return;
    const timer = setTimeout(() => setHint(null), 1000);
    return () => clearTimeout(timer);
  }, [hint]);

  useEffect(() => {
    if (!shaking) return;
    const timer = setTimeout(() => setShaking(false), 320);
    return () => clearTimeout(timer);
  }, [shaking]);

  function commit(raw: string) {
    const result = parseJump(raw, total);
    if (result.kind === "invalid") {
      setShaking(true);
      setDraft(String(value));
      return;
    }
    if (result.kind === "clamped") setHint(`1–${result.total}`);
    setDraft(String(result.value));
    onJump(result.value);
  }

  function step(delta: number) {
    onInteract?.();
    const next = clampPuzzleNumber((Number(draft) || value) + delta, total);
    setDraft(String(next));
    onJump(next);
  }

  return (
    <div className="flex items-center gap-1.5">
      <div className="relative">
        <input
          ref={inputRef}
          aria-label={label}
          inputMode="numeric"
          // Not type="number": its spinners and locale parsing get in the
          // way, and this validates its own input anyway.
          type="text"
          size={4}
          value={draft}
          onFocus={() => {
            editingRef.current = true;
            onInteract?.();
          }}
          onBlur={() => {
            editingRef.current = false;
            setDraft(String(value));
          }}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              onInteract?.();
              commit(draft);
              inputRef.current?.blur();
            } else if (event.key === "Escape") {
              event.preventDefault();
              setDraft(String(value));
              inputRef.current?.blur();
            } else if (event.key === "ArrowUp") {
              event.preventDefault();
              step(1);
            } else if (event.key === "ArrowDown") {
              event.preventDefault();
              step(-1);
            }
          }}
          className={`w-[4.5ch] rounded-md border border-border bg-surface px-1.5 py-1 text-center text-xs tabular-nums focus:outline-none focus:ring-2 focus:ring-accent/30 ${
            shaking ? "kdp-shake border-red-500" : ""
          }`}
        />
        {hint ? (
          <span className="absolute -top-5 left-1/2 -translate-x-1/2 whitespace-nowrap rounded bg-foreground px-1.5 py-0.5 text-[10px] font-medium text-surface">
            {hint}
          </span>
        ) : null}
      </div>
      <span className="text-xs tabular-nums text-muted-foreground">/ {total}</span>
    </div>
  );
}

export interface PuzzleNavProps {
  /** 1-based puzzle number. */
  selected: number;
  total: number;
  /** The five (or fewer) numbers currently on screen. */
  chips: readonly number[];
  /** True for a chip whose puzzle has finished rendering. */
  isReady?: (puzzleNumber: number) => boolean;
  onSelect: (puzzleNumber: number) => void;
  onStep: (delta: 1 | -1) => void;
  onInteract?: () => void;
}

/** Arrows, the windowed chips, and the jump box — all writing one number. */
export function PuzzleNav({
  selected,
  total,
  chips,
  isReady,
  onSelect,
  onStep,
  onInteract,
}: PuzzleNavProps) {
  return (
    <div className="flex flex-wrap items-center justify-center gap-2">
      <button
        type="button"
        aria-label="Previous puzzle"
        onClick={() => {
          onInteract?.();
          onStep(-1);
        }}
        disabled={total < 2}
        className="rounded-md border border-border px-2 py-1 text-sm text-muted-foreground hover:bg-muted disabled:opacity-30"
      >
        ‹
      </button>

      <div className="flex items-center gap-1">
        {chips.map((n) => {
          const ready = isReady ? isReady(n) : true;
          const active = n === selected;
          return (
            <button
              key={n}
              type="button"
              aria-label={`Show puzzle ${n}`}
              aria-current={active ? "true" : undefined}
              disabled={!ready && !active}
              onClick={() => {
                onInteract?.();
                onSelect(n);
              }}
              className={`h-7 min-w-8 rounded-md px-1.5 text-xs tabular-nums ${
                active
                  ? "bg-accent text-accent-foreground"
                  : ready
                    ? "border border-border text-foreground hover:bg-muted"
                    : "border border-border text-muted-foreground opacity-40"
              }`}
            >
              {n}
            </button>
          );
        })}
      </div>

      <button
        type="button"
        aria-label="Next puzzle"
        onClick={() => {
          onInteract?.();
          onStep(1);
        }}
        disabled={total < 2}
        className="rounded-md border border-border px-2 py-1 text-sm text-muted-foreground hover:bg-muted disabled:opacity-30"
      >
        ›
      </button>

      <PuzzleJumpBox value={selected} total={total} onJump={onSelect} onInteract={onInteract} />
    </div>
  );
}
