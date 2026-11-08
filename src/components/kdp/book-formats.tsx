"use client";

import { CopyIcon, ExternalLinkIcon } from "lucide-react";
import { toast } from "sonner";

import {
  amazonUrl,
  type BookRank,
  FORMAT_LABELS,
  type KdpBookFormat,
  type KdpStatus,
  STATUS_LABELS,
} from "@/lib/kdp-books";
import { cn } from "@/lib/utils";

const STATUS_STYLES: Record<KdpStatus, string> = {
  live: "bg-emerald-100 text-emerald-900 dark:bg-emerald-400/15 dark:text-emerald-200",
  draft: "bg-muted text-muted-foreground",
  review: "bg-amber-100 text-amber-900 dark:bg-amber-400/15 dark:text-amber-200",
  publishing: "bg-sky-100 text-sky-900 dark:bg-sky-400/15 dark:text-sky-200",
  blocked: "bg-red-600 text-white",
  unpublished: "bg-muted text-muted-foreground",
  other: "bg-muted text-muted-foreground",
};

async function copyAsin(asin: string) {
  try {
    await navigator.clipboard.writeText(asin);
    toast.success(`ASIN ${asin} copiato`);
  } catch {
    toast.error("Copia non riuscita.");
  }
}

/** One row per format: status, ASIN (copiable), price, link to Amazon. */
export function BookFormats({ formats }: { formats: KdpBookFormat[] }) {
  if (formats.length === 0) {
    return <p className="text-sm text-muted-foreground">Nessun formato.</p>;
  }
  return (
    <ul className="flex flex-col gap-1.5 text-sm">
      {formats.map((format) => {
        const url = amazonUrl(format);
        return (
          <li key={format.format} className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="w-28 shrink-0 font-medium">{FORMAT_LABELS[format.format]}</span>
            <span
              className={cn(
                "rounded px-1.5 py-0.5 text-xs font-medium",
                STATUS_STYLES[format.status],
              )}
              title={format.statusText ?? undefined}
            >
              {STATUS_LABELS[format.status]}
            </span>
            {format.asin ? (
              <button
                type="button"
                onClick={() => copyAsin(format.asin!)}
                className="flex items-center gap-1 rounded px-1 font-mono text-xs hover:bg-muted focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
                aria-label={`Copia ASIN ${format.asin}`}
              >
                {format.asin}
                <CopyIcon className="size-3 text-muted-foreground" />
              </button>
            ) : (
              <span className="text-xs text-muted-foreground">senza ASIN</span>
            )}
            {format.price && <span className="text-xs text-muted-foreground">{format.price}</span>}
            {format.market && (
              <span className="rounded border px-1 text-[11px] text-muted-foreground">
                {format.market}
              </span>
            )}
            {url && format.status === "live" && (
              <a
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-0.5 text-xs text-primary hover:underline"
              >
                Amazon
                <ExternalLinkIcon className="size-3" />
                <span className="sr-only">(si apre in una nuova scheda)</span>
              </a>
            )}
          </li>
        );
      })}
    </ul>
  );
}

const int = (n: number) => n.toLocaleString("it-IT", { useGrouping: "always" });

/** Latest Amazon rank and reviews per format, with the change over a week. */
export function BookRanks({ ranks }: { ranks: BookRank[] | undefined }) {
  if (!ranks?.length) return null;
  return (
    <ul className="flex flex-col gap-0.5 text-xs text-muted-foreground" data-testid="book-ranks">
      {ranks.map((r) => {
        const better = r.rank !== null && r.rankBefore !== null && r.rank < r.rankBefore;
        const worse = r.rank !== null && r.rankBefore !== null && r.rank > r.rankBefore;
        const newReviews =
          r.reviews !== null && r.reviewsBefore !== null ? r.reviews - r.reviewsBefore : 0;
        return (
          <li key={`${r.format}-${r.market}`} className="flex flex-wrap gap-x-2">
            <span className="font-medium text-foreground">
              {FORMAT_LABELS[r.format]}
              {r.market ? ` ${r.market}` : ""}
            </span>
            {r.rank !== null && (
              <span>
                BSR n.{int(r.rank)}
                {r.category ? ` in ${r.category}` : ""}
                {better && (
                  <span className="text-emerald-700 dark:text-emerald-400">
                    {" "}
                    ▲ da {int(r.rankBefore!)}
                  </span>
                )}
                {worse && (
                  <span className="text-red-700 dark:text-red-400"> ▼ da {int(r.rankBefore!)}</span>
                )}
              </span>
            )}
            {r.reviews !== null && (
              <span>
                {int(r.reviews)} valutazioni
                {r.rating !== null ? ` (${String(r.rating).replace(".", ",")}★)` : ""}
                {newReviews > 0 ? ` +${newReviews} in 7 giorni` : ""}
              </span>
            )}
            <span>
              · {r.date.slice(8, 10)}/{r.date.slice(5, 7)}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
