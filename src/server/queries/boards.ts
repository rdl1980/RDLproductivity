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
