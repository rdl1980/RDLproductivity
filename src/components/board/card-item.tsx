"use client";

import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { MoreHorizontalIcon } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { CardItem as Card } from "@/lib/board-state";
import { cn } from "@/lib/utils";

import { InlineTitle } from "./inline-title";

export function isTempId(id: string) {
  return id.startsWith("temp-");
}

type Props = {
  card: Card;
  onRename: (title: string) => void;
  onArchive: () => void;
};

export function SortableCard({ card, onRename, onArchive }: Props) {
  const [editing, setEditing] = useState(false);
  const pending = isTempId(card.id);
  const { setNodeRef, attributes, listeners, transform, transition, isDragging } = useSortable({
    id: card.id,
    data: { type: "card" },
    disabled: pending || editing,
  });

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      // While renaming, the input must not sit inside a disabled sortable button.
      {...(editing ? {} : { ...attributes, ...listeners })}
      aria-label={card.title}
      data-testid="card"
      className={cn(
        "group relative rounded-md bg-white px-3 py-2 text-sm text-neutral-900 shadow-sm outline-none",
        "focus-visible:ring-[3px] focus-visible:ring-ring/50",
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
          onSave={onRename}
        />
      ) : (
        <>
          <p className="pr-6 break-words whitespace-pre-wrap">{card.title}</p>
          {!pending && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={`Azioni per ${card.title}`}
                  onPointerDown={(event) => event.stopPropagation()}
                  className="absolute top-1 right-1 size-6 opacity-0 group-hover:opacity-100 focus-visible:opacity-100 data-[state=open]:opacity-100"
                >
                  <MoreHorizontalIcon />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start">
                <DropdownMenuItem onSelect={() => setEditing(true)}>Rinomina</DropdownMenuItem>
                <DropdownMenuItem variant="destructive" onSelect={onArchive}>
                  Archivia
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </>
      )}
    </li>
  );
}

/** Static copy rendered in the drag overlay. */
export function CardPreview({ card }: { card: Card }) {
  return (
    <div className="rotate-2 rounded-md bg-white px-3 py-2 text-sm break-words whitespace-pre-wrap text-neutral-900 shadow-lg">
      {card.title}
    </div>
  );
}
