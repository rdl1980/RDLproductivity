"use client";

import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { MoreHorizontalIcon } from "lucide-react";
import { memo, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { CardBadges, LabelChips } from "@/components/card-detail/card-badges";
import type { CardItem as Card, LabelItem } from "@/lib/board-state";
import { cn } from "@/lib/utils";

import type { BoardActions } from "./board-actions";
import { InlineTitle } from "./inline-title";

export function isTempId(id: string) {
  return id.startsWith("temp-");
}

type Props = {
  card: Card;
  listId: string;
  labels: LabelItem[];
  dragDisabled?: boolean;
  actions: BoardActions;
};

// Memoized: with stable `actions`, a card re-renders only when its own data changes.
export const SortableCard = memo(function SortableCard({
  card,
  listId,
  labels,
  dragDisabled,
  actions,
}: Props) {
  const onOpen = () => actions.openCard(card);
  const [editing, setEditing] = useState(false);
  const pending = isTempId(card.id);
  const {
    setNodeRef,
    setActivatorNodeRef,
    attributes,
    listeners,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: card.id,
    data: { type: "card" },
    disabled: pending || editing || dragDisabled,
  });
  const { onKeyDown: dragKeyDown, ...pointerListeners } = listeners ?? {};
  const onKeyDown = dragKeyDown as React.KeyboardEventHandler<HTMLButtonElement> | undefined;

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      // Mouse and touch drags start anywhere on the card; the keyboard uses the
      // title button (Enter opens, Space drags), so no control is nested in another.
      {...(editing ? {} : pointerListeners)}
      data-testid="card"
      onClick={() => !editing && !pending && onOpen()}
      className={cn(
        "group relative cursor-pointer rounded-md bg-list-card px-3 py-2 text-sm text-foreground shadow-sm select-none [-webkit-touch-callout:none]",
        isDragging && "opacity-40",
        pending && "opacity-60",
      )}
    >
      {editing ? (
        <InlineTitle
          value={card.title}
          label="Titolo della card"
          editing
          onEditingChange={setEditing}
          onSave={(title) => actions.renameCard(card, title)}
        />
      ) : (
        <>
          <div className="mb-1 empty:hidden">
            <LabelChips labelIds={card.labelIds} labels={labels} />
          </div>
          <button
            ref={setActivatorNodeRef}
            type="button"
            {...attributes}
            onKeyDown={onKeyDown}
            data-card-title
            className="block w-full cursor-pointer rounded-sm pr-6 text-left break-words whitespace-pre-wrap outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
          >
            {card.title}
          </button>
          <CardBadges card={card} />
          {!pending && (
            <DropdownMenu modal={false}>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={`Azioni per ${card.title}`}
                  onMouseDown={(event) => event.stopPropagation()}
                  onTouchStart={(event) => event.stopPropagation()}
                  onClick={(event) => event.stopPropagation()}
                  className="absolute top-1 right-1 size-6 opacity-0 group-hover:opacity-100 focus-visible:opacity-100 data-[state=open]:opacity-100"
                >
                  <MoreHorizontalIcon />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" onClick={(event) => event.stopPropagation()}>
                <DropdownMenuItem onSelect={() => setEditing(true)}>Rinomina</DropdownMenuItem>
                <DropdownMenuItem
                  variant="destructive"
                  onSelect={() => actions.archiveCard(listId, card)}
                >
                  Archivia
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </>
      )}
    </li>
  );
});

/** Static copy rendered in the drag overlay. */
export function CardPreview({ card }: { card: Card }) {
  return (
    <div className="rotate-2 rounded-md bg-list-card px-3 py-2 text-sm break-words whitespace-pre-wrap text-foreground shadow-lg">
      {card.title}
    </div>
  );
}
