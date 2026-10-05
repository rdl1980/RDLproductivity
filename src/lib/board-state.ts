import { positionBetween } from "./position";

export type CardItem = {
  id: string;
  title: string;
  position: string;
  /** ISO string (UTC). */
  dueDate: string | null;
  completed: boolean;
  /** 0 (highest) to 4, or null. */
  priority: number | null;
  /** Completing the card creates its next occurrence. */
  recurring: boolean;
  hasDescription: boolean;
  labelIds: string[];
  checklist: { done: number; total: number };
};

export type LabelItem = { id: string; name: string; color: string };

/** Summary for a freshly created card. */
export function newCardSummary(id: string, title: string, position: string): CardItem {
  return {
    id,
    title,
    position,
    dueDate: null,
    completed: false,
    priority: null,
    recurring: false,
    hasDescription: false,
    labelIds: [],
    checklist: { done: 0, total: 0 },
  };
}
export type ListItem = { id: string; title: string; position: string; cards: CardItem[] };

/** Neighbours of the item at `index`, used to compute a fractional position. */
export function neighboursAt<T extends { id: string; position: string }>(
  items: T[],
  index: number,
) {
  const before = items[index - 1] ?? null;
  const after = items[index + 1] ?? null;
  return {
    beforeId: before?.id ?? null,
    afterId: after?.id ?? null,
    position: positionBetween(before?.position ?? null, after?.position ?? null),
  };
}

export function findListOfCard(lists: ListItem[], cardId: string): ListItem | undefined {
  return lists.find((list) => list.cards.some((card) => card.id === cardId));
}

/**
 * Moves a card to `toListId` at `toIndex` (index in the destination list after
 * the card has been removed from its source list). Positions are not touched.
 */
export function moveCardInState(
  lists: ListItem[],
  cardId: string,
  toListId: string,
  toIndex: number,
): ListItem[] {
  const fromList = findListOfCard(lists, cardId);
  const card = fromList?.cards.find((c) => c.id === cardId);
  if (!fromList || !card || !lists.some((list) => list.id === toListId)) return lists;

  return lists.map((list) => {
    let cards = list.id === fromList.id ? list.cards.filter((c) => c.id !== cardId) : list.cards;
    if (list.id === toListId) {
      const index = Math.max(0, Math.min(toIndex, cards.length));
      cards = [...cards.slice(0, index), card, ...cards.slice(index)];
    }
    return cards === list.cards ? list : { ...list, cards };
  });
}

/** Assigns a fresh fractional position to `cardId` based on its current neighbours. */
export function repositionCard(lists: ListItem[], cardId: string) {
  const list = findListOfCard(lists, cardId);
  if (!list) return null;
  const index = list.cards.findIndex((card) => card.id === cardId);
  const { beforeId, afterId, position } = neighboursAt(list.cards, index);
  const next = lists.map((l) =>
    l.id === list.id
      ? { ...l, cards: l.cards.map((c) => (c.id === cardId ? { ...c, position } : c)) }
      : l,
  );
  return { lists: next, listId: list.id, beforeId, afterId, position };
}

/** Moves a list to `toIndex` and assigns it a fresh fractional position. */
export function moveListInState(lists: ListItem[], listId: string, toIndex: number) {
  const list = lists.find((l) => l.id === listId);
  if (!list) return null;
  const rest = lists.filter((l) => l.id !== listId);
  const index = Math.max(0, Math.min(toIndex, rest.length));
  const ordered = [...rest.slice(0, index), list, ...rest.slice(index)];
  const { beforeId, afterId, position } = neighboursAt(ordered, index);
  ordered[index] = { ...list, position };
  return { lists: ordered, beforeId, afterId, position };
}

const byPosition = (a: { position: string }, b: { position: string }) =>
  a.position < b.position ? -1 : a.position > b.position ? 1 : 0;

/** Inserts or replaces `list`, keeping lists ordered by position. */
export function upsertList(lists: ListItem[], list: ListItem): ListItem[] {
  return [...lists.filter((l) => l.id !== list.id), list].sort(byPosition);
}

/** Places `card` in `listId` (removing it from anywhere else), ordered by position. */
export function upsertCard(lists: ListItem[], listId: string, card: CardItem): ListItem[] {
  return lists.map((list) => {
    const cards = list.cards.filter((c) => c.id !== card.id);
    if (list.id === listId) return { ...list, cards: [...cards, card].sort(byPosition) };
    return cards.length === list.cards.length ? list : { ...list, cards };
  });
}

export function removeList(lists: ListItem[], listId: string): ListItem[] {
  return lists.filter((l) => l.id !== listId);
}

export function removeCard(lists: ListItem[], cardId: string): ListItem[] {
  return lists.map((list) =>
    list.cards.some((c) => c.id === cardId)
      ? { ...list, cards: list.cards.filter((c) => c.id !== cardId) }
      : list,
  );
}

export function patchList(lists: ListItem[], listId: string, patch: Partial<ListItem>): ListItem[] {
  return lists.map((l) => (l.id === listId ? { ...l, ...patch } : l));
}

export function patchCard(lists: ListItem[], cardId: string, patch: Partial<CardItem>): ListItem[] {
  return lists.map((list) =>
    list.cards.some((c) => c.id === cardId)
      ? { ...list, cards: list.cards.map((c) => (c.id === cardId ? { ...c, ...patch } : c)) }
      : list,
  );
}
