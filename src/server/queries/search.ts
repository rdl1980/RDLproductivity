import "server-only";

import { db } from "@/server/db";

export const SEARCH_LIMIT = 50;

/** Case-insensitive search on card title and description, excluding archived items. */
export async function searchCards(query: string) {
  const q = query.trim();
  if (!q) return [];
  return db.card.findMany({
    where: {
      archived: false,
      list: { archived: false, board: { archived: false } },
      OR: [
        { title: { contains: q, mode: "insensitive" } },
        { description: { contains: q, mode: "insensitive" } },
      ],
    },
    orderBy: { updatedAt: "desc" },
    take: SEARCH_LIMIT,
    select: {
      id: true,
      title: true,
      description: true,
      dueDate: true,
      completed: true,
      list: { select: { title: true, board: { select: { id: true, title: true, color: true } } } },
      labels: { select: { label: { select: { id: true, name: true, color: true } } } },
    },
  });
}

export function searchBoards(query: string) {
  const q = query.trim();
  if (!q) return Promise.resolve([]);
  return db.board.findMany({
    where: { archived: false, title: { contains: q, mode: "insensitive" } },
    orderBy: { position: "asc" },
    take: 10,
    select: { id: true, title: true, color: true },
  });
}
