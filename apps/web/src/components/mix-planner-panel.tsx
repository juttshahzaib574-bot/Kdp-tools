"use client";

import { useMemo } from "react";
import {
  DEFAULT_RAMP_WEIGHTS,
  DIFFICULTY_TIERS,
  MIX_PRESETS,
  REMAINDER_POLICIES,
  difficultyLabel,
  planMix,
  type DifficultyTier,
  type MixMode,
  type RemainderPolicy,
} from "@kdp/shared";

// How a book's difficulty is spread across its puzzles.
//
// A real puzzle book is a ramp: it opens gently, builds, and finishes
// hard. Before this existed every puzzle was built at one tier, which —
// with the old rounding — produced books like "29 Medium and 1 Expert":
// neither a single-difficulty book nor a ramp, and nothing anybody asked
// for.
//
// The per-tier counts are shown BEFORE generating, because the whole
// point of a plan is to see it before it's committed. The arithmetic is
// planMix in @kdp/shared, which is where the rounding is defined and
// tested; this panel only ever displays what it returns.

/** The shape stored on the book. Mirrors the `mix` field of the input schema. */
export interface MixSettings {
  mode: MixMode;
  weights?: Partial<Record<DifficultyTier, number>>;
  sequence?: { tier: DifficultyTier; count: number }[];
  remainderPolicy?: RemainderPolicy;
}

export const DEFAULT_MIX: MixSettings = { mode: "ramp", weights: { ...DEFAULT_RAMP_WEIGHTS } };

const POLICY_LABELS: Record<RemainderPolicy, string> = {
  add_to_hardest_selected: "Add to the hardest tier I chose",
  add_to_easiest_selected: "Add to the easiest tier I chose",
  distribute_evenly: "Spread evenly across my tiers",
};

export interface MixPlannerPanelProps {
  total: number;
  value: MixSettings;
  onChange: (next: MixSettings) => void;
}

export function MixPlannerPanel({ total, value, onChange }: MixPlannerPanelProps) {
  // Always planned through the shared planner, never re-derived here —
  // the counts on screen are exactly the counts the book will be built
  // with.
  const plan = useMemo(
    () =>
      planMix({
        total,
        mode: value.mode,
        weights: value.weights,
        sequence: value.sequence,
        remainderPolicy: value.remainderPolicy,
      }),
    [total, value],
  );

  const isSequence = value.mode === "sequence";
  const rows = value.sequence ?? [{ tier: "medium" as DifficultyTier, count: total }];
  const sequenceTotal = rows.reduce((sum, row) => sum + row.count, 0);

  function setRow(index: number, patch: Partial<{ tier: DifficultyTier; count: number }>) {
    const next = rows.map((row, i) => (i === index ? { ...row, ...patch } : row));
    onChange({ ...value, sequence: next });
  }

  return (
    <div className="flex flex-col gap-3 rounded-md border border-border p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-sm font-medium">Difficulty mix</p>
          <p className="text-xs text-muted-foreground">
            How the {total} puzzle{total === 1 ? "" : "s"} are spread across the five tiers.
          </p>
        </div>
        <div className="flex gap-1">
          {(
            [
              ["ramp", "Progressive ramp"],
              ["sequence", "Custom sequence"],
            ] as const
          ).map(([mode, label]) => (
            <button
              key={mode}
              type="button"
              onClick={() =>
                onChange(
                  mode === "ramp"
                    ? { mode: "ramp", weights: { ...DEFAULT_RAMP_WEIGHTS } }
                    : {
                        mode: "sequence",
                        // Seed the rows from the ramp the publisher can
                        // already see, so switching modes starts from
                        // what's on screen rather than from nothing.
                        sequence: DIFFICULTY_TIERS.map((tier) => ({
                          tier: tier.id,
                          count: plan.counts[tier.id],
                        })).filter((row) => row.count > 0),
                        remainderPolicy: "add_to_hardest_selected",
                      },
                )
              }
              aria-pressed={value.mode === mode}
              className={`rounded-md border px-2.5 py-1 text-xs font-medium ${
                value.mode === mode
                  ? "border-accent bg-accent/10 text-foreground"
                  : "border-border text-muted-foreground hover:bg-muted"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {!isSequence ? (
        <div className="flex flex-wrap gap-1.5">
          {MIX_PRESETS.map((preset) => {
            const built = preset.build(total);
            const active =
              JSON.stringify(value.weights ?? {}) === JSON.stringify(built.weights ?? {});
            return (
              <button
                key={preset.id}
                type="button"
                title={preset.description}
                onClick={() => onChange({ mode: "percent", weights: built.weights })}
                className={`rounded-md border px-2 py-1 text-[11px] font-medium ${
                  active
                    ? "border-accent bg-accent/10 text-foreground"
                    : "border-border text-muted-foreground hover:bg-muted"
                }`}
              >
                {preset.label}
              </button>
            );
          })}
        </div>
      ) : null}

      {/* The plan itself: what the book will actually contain. */}
      <div className="grid grid-cols-5 gap-1.5">
        {DIFFICULTY_TIERS.map((tier) => {
          const count = plan.counts[tier.id];
          return (
            <div
              key={tier.id}
              className={`rounded-md border p-2 text-center ${
                count > 0 ? "border-border bg-muted/40" : "border-dashed border-border opacity-50"
              }`}
            >
              <div className="text-base font-semibold tabular-nums">{count}</div>
              <div className="mt-0.5 text-[10px] leading-tight text-muted-foreground">
                {difficultyLabel(tier.id)}
              </div>
            </div>
          );
        })}
      </div>

      {isSequence ? (
        <div className="flex flex-col gap-2">
          {rows.map((row, index) => (
            <div key={index} className="flex items-center gap-2">
              <select
                aria-label={`Tier for row ${index + 1}`}
                value={row.tier}
                onChange={(event) => setRow(index, { tier: event.target.value as DifficultyTier })}
                className="flex-1 rounded-md border border-border bg-surface px-2 py-1.5 text-xs"
              >
                {DIFFICULTY_TIERS.map((tier) => (
                  <option key={tier.id} value={tier.id}>
                    {tier.label}
                  </option>
                ))}
              </select>
              <input
                aria-label={`Count for row ${index + 1}`}
                type="number"
                min={0}
                max={total}
                value={row.count}
                onChange={(event) =>
                  setRow(index, { count: Math.max(0, Number(event.target.value) || 0) })
                }
                className="w-20 rounded-md border border-border bg-surface px-2 py-1.5 text-xs tabular-nums"
              />
              <button
                type="button"
                onClick={() =>
                  onChange({ ...value, sequence: rows.filter((_, i) => i !== index) })
                }
                disabled={rows.length <= 1}
                aria-label={`Remove row ${index + 1}`}
                className="rounded-md border border-border px-2 py-1.5 text-xs text-muted-foreground hover:bg-muted disabled:opacity-30"
              >
                ×
              </button>
            </div>
          ))}

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() =>
                onChange({ ...value, sequence: [...rows, { tier: "hard", count: 0 }] })
              }
              disabled={rows.length >= DIFFICULTY_TIERS.length}
              className="rounded-md border border-border px-2.5 py-1 text-xs font-medium hover:bg-muted disabled:opacity-40"
            >
              Add a tier
            </button>
            <span
              className={`text-xs tabular-nums ${
                sequenceTotal === total ? "text-muted-foreground" : "text-amber-500"
              }`}
            >
              {sequenceTotal} of {total} assigned
            </span>
          </div>

          {/* Only meaningful for a sequence: the rows may not add up, and
              the shortfall has to land somewhere the author picked.
              Weighted plans round by largest remainder instead. */}
          {sequenceTotal !== total ? (
            <label className="flex flex-col gap-1">
              <span className="text-xs font-medium text-muted-foreground">
                {sequenceTotal < total
                  ? `Where do the remaining ${total - sequenceTotal} go?`
                  : "Rows exceed the book length — extras are trimmed from the end."}
              </span>
              {sequenceTotal < total ? (
                <select
                  value={value.remainderPolicy ?? "add_to_hardest_selected"}
                  onChange={(event) =>
                    onChange({ ...value, remainderPolicy: event.target.value as RemainderPolicy })
                  }
                  className="rounded-md border border-border bg-surface px-2 py-1.5 text-xs"
                >
                  {REMAINDER_POLICIES.map((policy) => (
                    <option key={policy} value={policy}>
                      {POLICY_LABELS[policy]}
                    </option>
                  ))}
                </select>
              ) : null}
            </label>
          ) : null}
        </div>
      ) : null}

      <p className="text-[11px] text-muted-foreground">
        Roughly {Math.max(1, Math.round(plan.estimatedSeconds))}s to build and prove.
      </p>
    </div>
  );
}
