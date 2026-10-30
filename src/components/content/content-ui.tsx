"use client";

import { CopyIcon } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  type LayerStatus,
  type PieceStatus,
  PLATFORM_LABELS,
  type Platform,
  textOn,
} from "@/lib/content";
import { cn } from "@/lib/utils";
import type { ContentLayerDTO, ContentPieceDTO, ContentRubricDTO } from "@/server/queries/content";

export const PLATFORM_SHORT: Record<Platform, string> = {
  tiktok: "TT",
  youtube: "YT",
  instagram: "IG",
};

/** Layer status colors: neutral → blue → amber → green, red for a problem. */
export const LAYER_STATUS_CLASS: Record<LayerStatus, string> = {
  "da preparare": "bg-muted text-muted-foreground ring-black/10 dark:ring-white/10",
  pronto: "bg-sky-100 text-sky-900 ring-sky-300 dark:bg-sky-500/15 dark:text-sky-200",
  programmato:
    "bg-amber-100 text-amber-900 ring-amber-300 dark:bg-amber-500/15 dark:text-amber-200",
  pubblicato:
    "bg-emerald-100 text-emerald-900 ring-emerald-300 dark:bg-emerald-500/15 dark:text-emerald-200",
  problema: "bg-red-100 text-red-900 ring-red-300 dark:bg-red-500/15 dark:text-red-200",
};

export const PIECE_STATUS_CLASS: Partial<Record<PieceStatus, string>> = {
  pronto: "text-sky-800 dark:text-sky-300",
  programmato: "text-amber-800 dark:text-amber-300",
  pubblicato: "text-emerald-800 dark:text-emerald-300",
  scartato: "text-muted-foreground line-through",
};

export function LayerBadge({
  layer,
}: {
  layer: Pick<ContentLayerDTO, "platform" | "publishStatus">;
}) {
  return (
    <span
      data-testid="layer-badge"
      data-platform={layer.platform}
      data-status={layer.publishStatus}
      title={`${PLATFORM_LABELS[layer.platform]}: ${layer.publishStatus}`}
      className={cn(
        "inline-flex h-5 items-center rounded px-1 text-[10px] leading-none font-semibold ring-1",
        LAYER_STATUS_CLASS[layer.publishStatus],
      )}
    >
      {PLATFORM_SHORT[layer.platform]}
      <span className="sr-only">
        {" "}
        {PLATFORM_LABELS[layer.platform]}: {layer.publishStatus}
      </span>
    </span>
  );
}

export function StatusText({ piece }: { piece: Pick<ContentPieceDTO, "shown"> }) {
  return (
    <span className={cn("text-xs font-medium", PIECE_STATUS_CLASS[piece.shown.status])}>
      {piece.shown.status}
      {piece.shown.partial && (
        <span className="font-normal text-muted-foreground"> (in parte)</span>
      )}
    </span>
  );
}

export function RubricChip({ rubric }: { rubric: ContentRubricDTO | undefined }) {
  if (!rubric) return null;
  return (
    <span
      className="inline-flex items-center rounded px-1.5 py-0.5 text-xs font-medium"
      style={{ backgroundColor: rubric.color, color: textOn(rubric.color) }}
    >
      {rubric.name}
    </span>
  );
}

export function CopyButton({ value, label }: { value: string; label: string }) {
  return (
    <Button
      type="button"
      variant="outline"
      size="xs"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          toast.success(`${label} copiato`);
        } catch {
          toast.error("Copia non riuscita.");
        }
      }}
    >
      <CopyIcon />
      Copia
      <span className="sr-only"> {label}</span>
    </Button>
  );
}

/** Layers shown with the platform filter: active ones of the selected platforms. */
export function visibleLayers(piece: ContentPieceDTO, platforms: ReadonlySet<Platform>) {
  return piece.layers.filter((l) => l.active && platforms.has(l.platform));
}

/** With every platform selected a piece always shows; otherwise it needs a selected active layer. */
export function pieceVisible(piece: ContentPieceDTO, platforms: ReadonlySet<Platform>) {
  return platforms.size === 3 || visibleLayers(piece, platforms).length > 0;
}

/** "2026-11-02T18:00:00Z" → value for <input type="datetime-local"> in the browser's zone. */
export function toLocalInput(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function fromLocalInput(value: string): string | null {
  return value ? new Date(value).toISOString() : null;
}

const dayFormat = new Intl.DateTimeFormat("it-IT", {
  weekday: "short",
  day: "numeric",
  month: "short",
  timeZone: "UTC",
});
export const dayLabel = (day: string) => dayFormat.format(new Date(`${day}T00:00:00Z`));
