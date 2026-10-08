import "server-only";

import { db } from "@/server/db";

import { cardSummarySelect, toCardSummary } from "./card-summary";

export function getBoards() {
  return db.board.findMany({
    where: { archived: false },
    orderBy: { position: "asc" },
    select: { id: true, title: true, color: true },
  });
}

/** Active lists and open cards per board, for the board tiles. */
export async function getBoardCounts(): Promise<Map<string, { lists: number; openCards: number }>> {
  const lists = await db.list.findMany({
    where: { archived: false, board: { archived: false } },
    select: {
      boardId: true,
      _count: { select: { cards: { where: { archived: false, completed: false } } } },
    },
  });
  const counts = new Map<string, { lists: number; openCards: number }>();
  for (const list of lists) {
    const entry = counts.get(list.boardId) ?? { lists: 0, openCards: 0 };
    entry.lists++;
    entry.openCards += list._count.cards;
    counts.set(list.boardId, entry);
  }
  return counts;
}

export async function getBoard(id: string) {
  const board = await db.board.findFirst({
    where: { id, archived: false },
    select: {
      id: true,
      title: true,
      color: true,
      labels: { orderBy: { name: "asc" }, select: { id: true, name: true, color: true } },
      lists: {
        where: { archived: false },
        orderBy: { position: "asc" },
        select: {
          id: true,
          title: true,
          position: true,
          cards: {
            where: { archived: false },
            orderBy: { position: "asc" },
            select: cardSummarySelect,
          },
        },
      },
    },
  });
  if (!board) return null;
  return {
    ...board,
    lists: board.lists.map((list) => ({ ...list, cards: list.cards.map(toCardSummary) })),
  };
}
