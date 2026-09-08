"use client";

import { useMemo, useState } from "react";
import {
  estimateRoyalty,
  printingScheduleFor,
  INTERIOR_COLOR_LABELS,
  KDP_ROYALTY_RATES,
  type ColorTier,
  type InteriorColor,
  type KdpRoyaltyRate,
  type KdpTrimSize,
  type PaperType,
} from "@kdp/shared";
import { CoverSpec } from "@/components/cover-spec";

// The "ship it" rail: everything a finished book needs on its way to KDP,
// in the order it's needed.
//
// It lives beside the interior viewer rather than in tabs of its own for
// one reason: every number here is a function of the finished interior.
// The spine comes from the page count; the royalty comes from the page
// count. Both were previously shown on a separate tab where the book
// they described wasn't in view, which is how you end up designing a
// cover for a spine width you've since changed.

export interface ShipPanelProps {
  title: string;
  trimSize: KdpTrimSize;
  interiorColor: InteriorColor;
  paperType: PaperType;
  colorTier: ColorTier;
  /** Interior length. Estimated until a book has actually been rendered. */
  pageCount: number;
  pageCountIsFinal?: boolean;
  /** Sends the book to the worker. Same action as the Customize tab's export. */
  onExport: () => void;
  exporting: boolean;
  /** Set when export is refused — e.g. the book would exceed KDP's page limit. */
  blockedReason?: string | null;
}

export function ShipPanel({
  title,
  trimSize,
  interiorColor,
  paperType,
  colorTier,
  pageCount,
  pageCountIsFinal = false,
  onExport,
  exporting,
  blockedReason,
}: ShipPanelProps) {
  const [listPrice, setListPrice] = useState("9.99");
  const [royaltyRate, setRoyaltyRate] = useState<KdpRoyaltyRate>(0.6);

  const royalty = useMemo(() => {
    const price = Number(listPrice);
    if (!Number.isFinite(price) || price <= 0 || pageCount <= 0) return null;
    return estimateRoyalty({
      listPriceUsd: price,
      pageCount,
      royaltyRate,
      // Colour costs roughly twice black-and-white per page, and colour
      // is the default interior — estimating on the wrong schedule can
      // show a profit on a book that loses money per copy.
      schedule: printingScheduleFor(interiorColor, colorTier),
    });
  }, [listPrice, pageCount, royaltyRate, interiorColor, colorTier]);

  return (
    <aside className="flex flex-col gap-5 rounded-lg border border-border bg-surface p-4">
      <section className="flex flex-col gap-2">
        <h3 className="text-sm font-semibold tracking-tight">Ship it</h3>
        <button
          type="button"
          onClick={onExport}
          disabled={exporting || Boolean(blockedReason)}
          className="rounded-md bg-accent px-4 py-2.5 text-sm font-semibold text-accent-foreground hover:opacity-90 disabled:opacity-50"
        >
          {exporting ? "Sending…" : "Generate & export interior PDF"}
        </button>
        <p className="text-xs text-muted-foreground">
          {pageCount} pages{pageCountIsFinal ? "" : " (est.)"} · {INTERIOR_COLOR_LABELS[interiorColor]} ·{" "}
          {trimSize.replace("x", "×")}
        </p>
        {blockedReason ? <p className="text-xs text-red-500">{blockedReason}</p> : null}
      </section>

      <div className="border-t border-border" />

      <CoverSpec
        trimSize={trimSize}
        interiorColor={interiorColor}
        paperType={paperType}
        colorTier={colorTier}
        pageCount={pageCount}
        pageCountIsFinal={pageCountIsFinal}
        title={title}
      />

      <div className="border-t border-border" />

      <section className="flex flex-col gap-2">
        <div>
          <h3 className="text-sm font-semibold tracking-tight">Profit</h3>
          <p className="mt-0.5 text-xs text-muted-foreground">
            KDP&rsquo;s own formula: your rate on the list price, minus printing. An estimate for
            the US store — check it against KDP&rsquo;s calculator before you launch.
          </p>
        </div>

        <div className="flex flex-wrap items-end gap-2">
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted-foreground">List price (USD)</span>
            <div className="flex items-center gap-1">
              <span className="text-sm text-muted-foreground">$</span>
              <input
                inputMode="decimal"
                value={listPrice}
                onChange={(event) => setListPrice(event.target.value)}
                className="w-24 rounded-md border border-border bg-surface px-2.5 py-1.5 text-sm tabular-nums focus:outline-none focus:ring-2 focus:ring-accent/30"
              />
            </div>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted-foreground">Royalty rate</span>
            <select
              value={royaltyRate}
              onChange={(event) => setRoyaltyRate(Number(event.target.value) as KdpRoyaltyRate)}
              className="rounded-md border border-border bg-surface px-2 py-1.5 text-sm"
            >
              {KDP_ROYALTY_RATES.map((rate) => (
                <option key={rate} value={rate}>
                  {Math.round(rate * 100)}%
                </option>
              ))}
            </select>
          </label>
        </div>

        {royalty ? (
          <div className="rounded-md border border-border bg-muted/40 p-3">
            <p
              className={`text-lg font-semibold tabular-nums ${
                royalty.netRoyaltyUsd < 0 ? "text-red-500" : "text-foreground"
              }`}
            >
              {royalty.netRoyaltyUsd < 0 ? "−" : ""}${Math.abs(royalty.netRoyaltyUsd).toFixed(2)}{" "}
              <span className="text-xs font-normal text-muted-foreground">per copy</span>
            </p>
            <p className="mt-1 text-xs text-muted-foreground tabular-nums">
              printing ${royalty.printingCostUsd.toFixed(2)} · break-even at $
              {royalty.minimumListPriceUsd.toFixed(2)}
            </p>
            {royalty.netRoyaltyUsd < 0 ? (
              <p className="mt-1.5 text-xs text-red-500">
                Below printing cost — KDP won&rsquo;t accept this price. Raise it to at least $
                {royalty.minimumListPriceUsd.toFixed(2)}.
              </p>
            ) : null}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">Enter a list price to see the royalty.</p>
        )}
      </section>
    </aside>
  );
}
