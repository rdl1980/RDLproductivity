"use client";

import { DEFAULT_BOARD_COLOR } from "@/lib/board-colors";
import type { AggregateCard } from "@/lib/aggregate";
import type { LabelItem } from "@/lib/board-state";
import { cn } from "@/lib/utils";

import { CardBadges, LabelChips } from "@/components/card-detail/card-badges";
import type { CardSummaryPatch } from "@/components/card-detail/card-detail-dialog";

/** Board and list a card lives in, with the board color as a dot. */
export function CardOrigin({ card, showList = true }: { card: AggregateCard; showList?: boolean }) {
  return (
    <span className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
      <span
        aria-hidden
        className="size-2.5 shrink-0 rounded-full"
        style={{ backgroundColor: card.board.color ?? DEFAULT_BOARD_COLOR }}
      />
      <span className="truncate">
        {card.board.title}
        {showList && ` · ${card.list.title}`}
      </span>
    </span>
  );
}

/** Body of a card shown outside its board: origin, labels, title and badges. */
export function AggregateCardBody({
  card,
  hidePriority,
  title,
  className,
}: {
  card: AggregateCard;
  hidePriority?: boolean;
  /** Replaces the plain title, e.g. with a button that opens the card. */
  title?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex min-w-0 flex-col gap-1", className)}>
      <CardOrigin card={card} />
      <LabelChips labelIds={card.labelIds} labels={card.labels} />
      {title ?? (
        <span
          className={cn(
            "text-sm break-words whitespace-pre-wrap",
            card.completed && "text-muted-foreground line-through",
          )}
        >
          {card.title}
        </span>
      )}
      <CardBadges card={hidePriority ? { ...card, priority: null } : card} />
    </div>
  );
}

/**
 * Applies a card dialog change to an aggregate card; `boardLabels` resolves
 * labels created in the dialog.
 */
export function applyPatch(
  card: AggregateCard,
  patch: CardSummaryPatch,
  boardLabels: LabelItem[] = card.labels,
): AggregateCard {
  return {
    ...card,
    ...patch,
    labels: boardLabels.filter((label) => patch.labelIds.includes(label.id)),
  };
}
