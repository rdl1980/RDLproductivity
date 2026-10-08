"use client";

import {
  DndContext,
  type DragEndEvent,
  DragOverlay,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { toast } from "sonner";

import { CardDetailDialog } from "@/components/card-detail/card-detail-dialog";
import type { AggregateCard } from "@/lib/aggregate";
import type { LabelItem } from "@/lib/board-state";
import { PRIORITIES, type Priority, SUPER_BOARD_PRIORITIES } from "@/lib/priority";
import {
  type BoardListRef,
  cellCards,
  columnKey,
  isSuperBoardPriority,
  superColumns,
  targetList,
} from "@/lib/super-board";
import { cn } from "@/lib/utils";
import { moveCardToList, updateCardDetails } from "@/server/actions/card-details";
import type { ActionResult } from "@/server/actions/result";

import { AggregateCardBody, applyPatch } from "./aggregate-card";
import { useCardParam } from "./use-card-param";
import { FlameIcon } from "lucide-react";
import { PageHeader } from "@/components/page-header";

const NETWORK_ERROR = "Errore di rete, modifica annullata.";

const LANES: Record<number, string> = {
  0: "Expedite",
  1: "Alta priorità",
};

type Props = { cards: AggregateCard[]; lists: BoardListRef[] };

export function SuperBoardView({ cards: initialCards, lists }: Props) {
  const router = useRouter();
  const { openCardId, setCardParam } = useCardParam();
  // Local copy for optimistic moves; reset when the server sends new data.
  const [source, setSource] = useState(initialCards);
  const [cards, setCards] = useState(initialCards);
  if (source !== initialCards) {
    setSource(initialCards);
    setCards(initialCards);
  }
  const [dragging, setDragging] = useState<AggregateCard | null>(null);
  const boardLabels = useRef(new Map<string, LabelItem[]>());

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 8 } }),
    useSensor(KeyboardSensor),
  );

  const columns = superColumns(cards, lists);

  function replace(cardId: string, update: (card: AggregateCard) => AggregateCard) {
    setCards((current) => current.map((card) => (card.id === cardId ? update(card) : card)));
  }

  async function onDragEnd({ active, over }: DragEndEvent) {
    setDragging(null);
    const card = cards.find((c) => c.id === active.id);
    const [, column, lane] = String(over?.id ?? "").split("|");
    if (!card || column === undefined) return;
    const priority = Number(lane) as Priority;
    const sameColumn = columnKey(card.list.title) === column;
    if (sameColumn && card.priority === priority) return;

    const list = sameColumn ? undefined : targetList(lists, card.board.id, column);
    if (!sameColumn && !list) {
      const title = columns.find((c) => c.key === column)?.title ?? column;
      toast.error(`La board «${card.board.title}» non ha una lista «${title}».`);
      return;
    }

    const previous = { priority: card.priority, list: card.list };
    replace(card.id, (c) => ({
      ...c,
      priority,
      list: list ? { id: list.id, title: list.title } : c.list,
    }));
    // One request, so leaving the page right after the drop cannot half-apply it.
    const result = await (
      list
        ? moveCardToList({ id: card.id, listId: list.id, placement: "bottom", priority })
        : updateCardDetails({ id: card.id, priority })
    ).catch((): ActionResult<unknown> => ({ ok: false, error: NETWORK_ERROR }));
    if (!result.ok) {
      replace(card.id, (c) => ({ ...c, ...previous }));
      toast.error(result.error);
    }
  }

  return (
    <main className="flex h-[calc(100dvh-var(--header-height))] min-h-0 flex-col overflow-hidden">
      <PageHeader
        icon={FlameIcon}
        title="Super board"
        description="Le card P0 e P1 di tutte le board: colonne per lista di origine, righe per priorità. Trascina tra le righe per cambiare priorità, tra le colonne per spostare la card nella lista con lo stesso nome della sua board."
        className="px-4 pt-5 pb-4"
      />

      {cards.length === 0 ? (
        <p className="px-4 text-sm text-muted-foreground">
          Nessuna card con priorità P0 o P1. Imposta la priorità dal dettaglio di una card.
        </p>
      ) : (
        <DndContext
          // Stable id: generated ids differ between server and client (hydration).
          id="super-board-dnd"
          sensors={sensors}
          onDragStart={({ active }) => setDragging(cards.find((c) => c.id === active.id) ?? null)}
          onDragEnd={onDragEnd}
          onDragCancel={() => setDragging(null)}
        >
          <div
            data-testid="super-board"
            className="min-h-0 flex-1 overflow-auto px-4 pb-4"
            role="table"
            aria-label="Super board"
          >
            <div
              className="grid w-max gap-2"
              style={{ gridTemplateColumns: `8rem repeat(${columns.length}, 17rem)` }}
            >
              <div role="row" className="contents">
                <div role="columnheader" className="sticky top-0 z-10 bg-background">
                  <span className="sr-only">Priorità</span>
                </div>
                {columns.map((column) => (
                  <div
                    key={column.key}
                    role="columnheader"
                    className="sticky top-0 z-10 rounded-md bg-muted px-3 py-2 text-sm font-semibold"
                  >
                    {column.title}
                  </div>
                ))}
              </div>
              {SUPER_BOARD_PRIORITIES.map((priority) => (
                <div key={priority} role="row" className="contents">
                  <div
                    role="rowheader"
                    className={cn(
                      "sticky left-0 z-[5] flex flex-col justify-start gap-1 rounded-md px-3 py-2",
                      PRIORITIES[priority].className,
                    )}
                  >
                    <span className="text-lg font-bold">{PRIORITIES[priority].label}</span>
                    <span className="text-xs font-medium">{LANES[priority]}</span>
                  </div>
                  {columns.map((column) => (
                    <Cell
                      key={column.key}
                      id={`cell|${column.key}|${priority}`}
                      label={`${PRIORITIES[priority].label} · ${column.title}`}
                      expedite={priority === 0}
                    >
                      {cellCards(cards, column.key, priority).map((card) => (
                        <DraggableCard
                          key={card.id}
                          card={card}
                          onOpen={() => setCardParam(card.id)}
                        />
                      ))}
                    </Cell>
                  ))}
                </div>
              ))}
            </div>
          </div>
          <DragOverlay>
            {dragging ? (
              <div className="rotate-2 rounded-md bg-list-card p-2 shadow-lg">
                <AggregateCardBody card={dragging} hidePriority />
              </div>
            ) : null}
          </DragOverlay>
        </DndContext>
      )}

      <CardDetailDialog
        cardId={openCardId}
        onClose={() => setCardParam(null)}
        onCardChange={(cardId, patch) =>
          setCards((current) =>
            current.flatMap((card) => {
              if (card.id !== cardId) return [card];
              if (!isSuperBoardPriority(patch.priority)) return [];
              return [applyPatch(card, patch, boardLabels.current.get(card.board.id))];
            }),
          )
        }
        onLabelsChange={(boardId, labels) => boardLabels.current.set(boardId, labels)}
        onCardRemoved={(cardId) => setCards((current) => current.filter((c) => c.id !== cardId))}
        onCardPlaced={() => router.refresh()}
      />
    </main>
  );
}

function Cell({
  id,
  label,
  expedite,
  children,
}: {
  id: string;
  label: string;
  expedite: boolean;
  children: React.ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({ id });
  return (
    <div
      ref={setNodeRef}
      role="cell"
      aria-label={label}
      data-testid="super-cell"
      className={cn(
        "flex min-h-24 flex-col gap-2 rounded-md p-2",
        expedite ? "bg-red-500/10" : "bg-list",
        isOver && "ring-2 ring-ring",
      )}
    >
      {children}
    </div>
  );
}

function DraggableCard({ card, onOpen }: { card: AggregateCard; onOpen: () => void }) {
  const { setNodeRef, setActivatorNodeRef, attributes, listeners, isDragging } = useDraggable({
    id: card.id,
  });
  const { onKeyDown: dragKeyDown, ...pointerListeners } = listeners ?? {};
  return (
    // Mouse and touch drags start anywhere on the card; the keyboard uses the
    // title button (Enter opens, Space drags), as on the board.
    <div
      ref={setNodeRef}
      {...pointerListeners}
      onClick={onOpen}
      data-testid="super-card"
      className={cn(
        "cursor-pointer rounded-md bg-list-card p-2 text-foreground shadow-sm select-none",
        isDragging && "opacity-40",
      )}
    >
      <AggregateCardBody
        card={card}
        hidePriority
        title={
          <button
            ref={setActivatorNodeRef}
            type="button"
            {...attributes}
            onKeyDown={(event) => {
              if (event.key === "Enter") onOpen();
              else (dragKeyDown as React.KeyboardEventHandler | undefined)?.(event);
            }}
            onClick={(event) => {
              event.stopPropagation();
              onOpen();
            }}
            data-card-title
            className={cn(
              "w-full cursor-pointer rounded-sm text-left text-sm break-words whitespace-pre-wrap outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50",
              card.completed && "text-muted-foreground line-through",
            )}
          >
            {card.title}
          </button>
        }
      />
    </div>
  );
}
