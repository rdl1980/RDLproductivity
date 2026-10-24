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

/** Imported KDP books whose title, series or ASIN contains the query. */
export async function searchKdpBooks(query: string) {
  const q = query.trim();
  if (!q) return [];
  // ASINs live inside the formats JSON: a text match is enough for a 10-character code.
  const byAsin = await db.$queryRaw<{ id: string }[]>`
    SELECT id FROM "KdpBook" WHERE "formats"::text ILIKE ${`%${q}%`} LIMIT 20`;
  return db.kdpBook.findMany({
    where: {
      OR: [
        { title: { contains: q, mode: "insensitive" } },
        { series: { contains: q, mode: "insensitive" } },
        { id: { in: byAsin.map((row) => row.id) } },
      ],
    },
    orderBy: { title: "asc" },
    take: 20,
    select: { id: true, account: true, title: true, series: true, formats: true },
  });
}

/** KDP calendar tasks whose title or notes contain the query, newest week first. */
export function searchKdpTasks(query: string) {
  const q = query.trim();
  if (!q) return Promise.resolve([]);
  return db.kdpTask.findMany({
    where: {
      OR: [
        { title: { contains: q, mode: "insensitive" } },
        { notes: { contains: q, mode: "insensitive" } },
      ],
    },
    orderBy: [{ week: "desc" }, { position: "asc" }],
    take: 20,
    select: {
      id: true,
      title: true,
      notes: true,
      account: true,
      track: true,
      week: true,
      done: true,
    },
  });
}
