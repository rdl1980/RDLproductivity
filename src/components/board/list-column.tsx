"use client";

import { SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { MoreHorizontalIcon, PlusIcon } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { CardItem, ListItem } from "@/lib/board-state";
import { cn } from "@/lib/utils";

import { isTempId, SortableCard } from "./card-item";
import { Composer } from "./composer";
import { InlineTitle } from "./inline-title";

type Props = {
  list: ListItem;
  composerOpen: boolean;
  onComposerOpenChange: (open: boolean) => void;
  onHover: () => void;
  onRename: (title: string) => void;
  onArchive: () => void;
  onAddCard: (title: string) => void;
  onRenameCard: (card: CardItem, title: string) => void;
  onArchiveCard: (card: CardItem) => void;
};

export function ListColumn({
  list,
  composerOpen,
  onComposerOpenChange,
  onHover,
  onRename,
  onArchive,
  onAddCard,
  onRenameCard,
  onArchiveCard,
}: Props) {
  const [editing, setEditing] = useState(false);
  const pending = isTempId(list.id);
  const {
    setNodeRef,
    setActivatorNodeRef,
    attributes,
    listeners,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: list.id, data: { type: "list" }, disabled: pending });

  return (
    <section
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      onMouseEnter={onHover}
      aria-label={list.title}
      data-testid="list"
      className={cn(
        "flex max-h-full w-72 shrink-0 flex-col rounded-xl bg-neutral-100 text-neutral-900 shadow-sm",
        isDragging && "opacity-40",
      )}
    >
      <header
        ref={setActivatorNodeRef}
        {...(editing ? {} : { ...attributes, ...listeners })}
        className="flex items-center gap-1 px-2 pt-2 pb-1 outline-none"
      >
        <div className="min-w-0 flex-1">
          <InlineTitle
            value={list.title}
            label="Titolo della lista"
            editing={editing}
            onEditingChange={setEditing}
            onSave={onRename}
            className="w-full rounded px-2 py-1 text-sm font-semibold"
          />
        </div>
        {!pending && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="size-7"
                aria-label={`Azioni per ${list.title}`}
                onPointerDown={(event) => event.stopPropagation()}
              >
                <MoreHorizontalIcon />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              <DropdownMenuItem onSelect={() => onComposerOpenChange(true)}>
                Aggiungi una card
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => setEditing(true)}>Rinomina</DropdownMenuItem>
              <DropdownMenuItem variant="destructive" onSelect={onArchive}>
                Archivia lista
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </header>

      <SortableContext
        items={list.cards.map((card) => card.id)}
        strategy={verticalListSortingStrategy}
      >
        <ol className="flex min-h-2 flex-col gap-2 overflow-y-auto px-2 pb-1">
          {list.cards.map((card) => (
            <SortableCard
              key={card.id}
              card={card}
              onRename={(title) => onRenameCard(card, title)}
              onArchive={() => onArchiveCard(card)}
            />
          ))}
        </ol>
      </SortableContext>

      <div className="p-2">
        {composerOpen ? (
          <Composer
            placeholder="Titolo della card"
            submitLabel="Aggiungi card"
            onSubmit={onAddCard}
            onClose={() => onComposerOpenChange(false)}
          />
        ) : (
          <Button
            variant="ghost"
            size="sm"
            disabled={pending}
            className="w-full justify-start text-muted-foreground"
            onClick={() => onComposerOpenChange(true)}
          >
            <PlusIcon />
            Aggiungi una card
          </Button>
        )}
      </div>
    </section>
  );
}

/** Static copy rendered in the drag overlay. */
export function ListPreview({ list }: { list: ListItem }) {
  return (
    <div className="flex w-72 rotate-2 flex-col gap-2 rounded-xl bg-neutral-100 p-2 text-neutral-900 shadow-lg">
      <p className="px-2 py-1 text-sm font-semibold">{list.title}</p>
      {list.cards.map((card) => (
        <div key={card.id} className="rounded-md bg-white px-3 py-2 text-sm shadow-sm">
          {card.title}
        </div>
      ))}
    </div>
  );
}
