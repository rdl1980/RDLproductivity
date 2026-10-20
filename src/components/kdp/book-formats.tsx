"use client";

import { CopyIcon, ExternalLinkIcon } from "lucide-react";
import { toast } from "sonner";

import {
  amazonUrl,
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
