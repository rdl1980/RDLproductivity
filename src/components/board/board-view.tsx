"use client";

import {
  closestCenter,
  closestCorners,
  type CollisionDetection,
  DndContext,
  type DragEndEvent,
  type DragOverEvent,
  DragOverlay,
  type DragStartEvent,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  horizontalListSortingStrategy,
  SortableContext,
  sortableKeyboardCoordinates,
} from "@dnd-kit/sortable";
import { PlusIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  type CardItem,
  findListOfCard,
  type ListItem,
  moveCardInState,
  moveListInState,
  patchCard,
  patchList,
  removeCard,
  removeList,
  repositionCard,
  upsertCard,
  upsertList,
} from "@/lib/board-state";
import { positionAfter } from "@/lib/position";
import { createCard, moveCard, updateCard } from "@/server/actions/cards";
import { createList, moveList, updateList } from "@/server/actions/lists";
import type { ActionResult } from "@/server/actions/result";

import { BoardHeader } from "./board-header";
import { CardPreview } from "./card-item";
import { Composer } from "./composer";
import { ListColumn, ListPreview } from "./list-column";

type Board = { id: string; title: string; color: string };
type Active = { type: "card" | "list"; id: string } | null;
type Update = (lists: ListItem[]) => ListItem[];

const NETWORK_ERROR = "Errore di rete, modifica annullata.";

const tempId = () => `temp-${crypto.randomUUID()}`;

const findCard = (lists: ListItem[], cardId: string) =>
  lists.flatMap((l) => l.cards).find((c) => c.id === cardId);

// Lists only collide with lists; cards use corners so empty lists are reachable.
const collisionDetection: CollisionDetection = (args) => {
  if (args.active.data.current?.type === "list") {
    return closestCenter({
      ...args,
      droppableContainers: args.droppableContainers.filter(
        (container) => container.data.current?.type === "list",
      ),
    });
  }
  return closestCorners(args);
};

function isTypingTarget(target: EventTarget | null) {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName))
  );
}

export function BoardView({
  board: initialBoard,
  initialLists,
}: {
  board: Board;
  initialLists: ListItem[];
}) {
  const [board, setBoard] = useState(initialBoard);
  const [lists, setLists] = useState(initialLists);
  const [active, setActive] = useState<Active>(null);
  const [composerListId, setComposerListId] = useState<string | null>(null);
  const [addingList, setAddingList] = useState(false);
  const hoveredListId = useRef<string | null>(null);
  const dragSnapshot = useRef<ListItem[] | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  /**
   * Applies `apply` optimistically, runs `action`, and applies `revert` if it
   * fails. Both are functional updates so concurrent mutations never clobber
   * each other; `onSuccess` receives the persisted data.
   */
  function mutate<T>(
    apply: Update,
    revert: Update,
    action: () => Promise<ActionResult<T>>,
    onSuccess?: (data: T) => void,
  ) {
    setLists(apply);
    action()
      .catch((): ActionResult<T> => ({ ok: false, error: NETWORK_ERROR }))
      .then((result) => {
        if (result.ok) onSuccess?.(result.data);
        else {
          setLists(revert);
          toast.error(result.error);
        }
      });
  }

  // Keyboard shortcuts: `n` opens the card composer, `Esc` closes composers.
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.metaKey || event.ctrlKey || event.altKey || isTypingTarget(event.target)) return;
      if (event.key === "n" && lists.length > 0) {
        event.preventDefault();
        const target = lists.find((l) => l.id === hoveredListId.current) ?? lists[0];
        setComposerListId(target.id);
      } else if (event.key === "Escape") {
        setComposerListId(null);
        setAddingList(false);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [lists]);

  // --- Lists -----------------------------------------------------------------

  function addList(title: string) {
    const id = tempId();
    const position = positionAfter(lists.at(-1)?.position ?? null);
    mutate(
      (current) => upsertList(current, { id, title, position, cards: [] }),
      (current) => removeList(current, id),
      () => createList({ boardId: board.id, title }),
      (saved) => setLists((current) => patchList(current, id, saved)),
    );
  }

  function renameList(list: ListItem, title: string) {
    mutate(
      (current) => patchList(current, list.id, { title }),
      (current) => patchList(current, list.id, { title: list.title }),
      () => updateList({ id: list.id, title }),
    );
  }

  function archiveList(list: ListItem) {
    mutate(
      (current) => removeList(current, list.id),
      (current) => upsertList(current, list),
      () => updateList({ id: list.id, archived: true }),
    );
  }

  // --- Cards -----------------------------------------------------------------

  function addCard(listId: string, title: string) {
    const id = tempId();
    const last = lists.find((l) => l.id === listId)?.cards.at(-1);
    const card = { id, title, position: positionAfter(last?.position ?? null) };
    mutate(
      (current) => upsertCard(current, listId, card),
      (current) => removeCard(current, id),
      () => createCard({ listId, title }),
      (saved) => setLists((current) => patchCard(current, id, saved)),
    );
  }

  function renameCard(card: CardItem, title: string) {
    mutate(
      (current) => patchCard(current, card.id, { title }),
      (current) => patchCard(current, card.id, { title: card.title }),
      () => updateCard({ id: card.id, title }),
    );
  }

  function archiveCard(listId: string, card: CardItem) {
    mutate(
      (current) => removeCard(current, card.id),
      (current) => upsertCard(current, listId, card),
      () => updateCard({ id: card.id, archived: true }),
    );
  }

  // --- Drag & drop -----------------------------------------------------------

  function listIdOf(id: string, type: unknown) {
    if (type === "list") return id;
    return findListOfCard(lists, id)?.id ?? null;
  }

  function onDragStart({ active }: DragStartEvent) {
    dragSnapshot.current = lists;
    setActive({ type: active.data.current?.type, id: String(active.id) });
  }

  // Moves the dragged card into the hovered list as soon as it crosses over.
  function onDragOver({ active, over }: DragOverEvent) {
    if (!over || active.data.current?.type !== "card") return;
    const cardId = String(active.id);
    const fromListId = findListOfCard(lists, cardId)?.id;
    const toListId = listIdOf(String(over.id), over.data.current?.type);
    if (!fromListId || !toListId || fromListId === toListId) return;

    const toList = lists.find((l) => l.id === toListId)!;
    const overIndex =
      over.data.current?.type === "card"
        ? toList.cards.findIndex((c) => c.id === over.id)
        : toList.cards.length;
    setLists(moveCardInState(lists, cardId, toListId, overIndex));
  }

  function onDragEnd({ active, over }: DragEndEvent) {
    const snapshot = dragSnapshot.current ?? lists;
    dragSnapshot.current = null;
    setActive(null);
    if (!over) return setLists(snapshot);

    const activeId = String(active.id);

    if (active.data.current?.type === "list") {
      const overListId = listIdOf(String(over.id), over.data.current?.type);
      const from = lists.findIndex((l) => l.id === activeId);
      const to = lists.findIndex((l) => l.id === overListId);
      if (from === -1 || to === -1 || from === to) return;
      const result = moveListInState(lists, activeId, to);
      const original = snapshot.find((l) => l.id === activeId);
      if (!result || !original) return;
      const moved = { ...original, position: result.position };
      mutate(
        (current) => {
          const list = current.find((l) => l.id === activeId);
          return list ? upsertList(current, { ...list, position: result.position }) : current;
        },
        (current) => {
          const list = current.find((l) => l.id === activeId) ?? moved;
          return upsertList(current, { ...list, position: original.position });
        },
        () => moveList({ id: activeId, beforeId: result.beforeId, afterId: result.afterId }),
      );
      return;
    }

    // Card: finish the reorder inside the (possibly new) list.
    let next = lists;
    const list = findListOfCard(next, activeId);
    if (!list) return setLists(snapshot);
    if (over.data.current?.type === "card" && over.id !== active.id) {
      const overIndex = list.cards.findIndex((c) => c.id === over.id);
      if (overIndex !== -1) next = moveCardInState(next, activeId, list.id, overIndex);
    }

    const before = findListOfCard(snapshot, activeId);
    const after = findListOfCard(next, activeId)!;
    const unchanged =
      before?.id === after.id &&
      before.cards.findIndex((c) => c.id === activeId) ===
        after.cards.findIndex((c) => c.id === activeId);
    if (unchanged) return setLists(snapshot);

    const result = repositionCard(next, activeId);
    const original = before?.cards.find((c) => c.id === activeId);
    if (!result || !before || !original) return setLists(snapshot);
    mutate(
      (current) => {
        const card = findCard(current, activeId) ?? original;
        return upsertCard(current, result.listId, { ...card, position: result.position });
      },
      (current) => {
        const card = findCard(current, activeId) ?? original;
        return upsertCard(current, before.id, { ...card, position: original.position });
      },
      () =>
        moveCard({
          id: activeId,
          listId: result.listId,
          beforeId: result.beforeId,
          afterId: result.afterId,
        }),
    );
  }

  function onDragCancel() {
    if (dragSnapshot.current) setLists(dragSnapshot.current);
    dragSnapshot.current = null;
    setActive(null);
  }

  const activeCard =
    active?.type === "card"
      ? lists.flatMap((l) => l.cards).find((c) => c.id === active.id)
      : undefined;
  const activeList = active?.type === "list" ? lists.find((l) => l.id === active.id) : undefined;

  return (
    <main className="flex flex-1 flex-col" style={{ backgroundColor: board.color }}>
      <BoardHeader board={board} onChange={setBoard} />

      <DndContext
        sensors={sensors}
        collisionDetection={collisionDetection}
        onDragStart={onDragStart}
        onDragOver={onDragOver}
        onDragEnd={onDragEnd}
        onDragCancel={onDragCancel}
        accessibility={{
          screenReaderInstructions: {
            draggable:
              "Premi spazio o invio per prendere l'elemento, usa le frecce per spostarlo, spazio o invio per rilasciarlo, Esc per annullare.",
          },
        }}
      >
        <div className="flex flex-1 items-start gap-3 overflow-x-auto px-4 pb-4">
          <SortableContext items={lists.map((l) => l.id)} strategy={horizontalListSortingStrategy}>
            {lists.map((list) => (
              <ListColumn
                key={list.id}
                list={list}
                composerOpen={composerListId === list.id}
                onComposerOpenChange={(open) => setComposerListId(open ? list.id : null)}
                onHover={() => (hoveredListId.current = list.id)}
                onRename={(title) => renameList(list, title)}
                onArchive={() => archiveList(list)}
                onAddCard={(title) => addCard(list.id, title)}
                onRenameCard={renameCard}
                onArchiveCard={(card) => archiveCard(list.id, card)}
              />
            ))}
          </SortableContext>

          <div className="w-72 shrink-0">
            {addingList ? (
              <div className="rounded-xl bg-neutral-100 p-2">
                <Composer
                  placeholder="Titolo della lista"
                  submitLabel="Aggiungi lista"
                  onSubmit={addList}
                  onClose={() => setAddingList(false)}
                />
              </div>
            ) : (
              <Button
                variant="ghost"
                className="w-full justify-start bg-white/20 text-white hover:bg-white/30 hover:text-white"
                onClick={() => setAddingList(true)}
              >
                <PlusIcon />
                {lists.length === 0 ? "Aggiungi una lista" : "Aggiungi un'altra lista"}
              </Button>
            )}
          </div>
        </div>

        <DragOverlay>
          {activeCard ? <CardPreview card={activeCard} /> : null}
          {activeList ? <ListPreview list={activeList} /> : null}
        </DragOverlay>
      </DndContext>
    </main>
  );
}
