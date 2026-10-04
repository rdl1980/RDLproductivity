import "server-only";

import { db } from "@/server/db";

export type CalendarCard = {
  id: string;
  title: string;
  /** ISO string (UTC). */
  dueDate: string;
  completed: boolean;
  labelIds: string[];
  board: { id: string; title: string; color: string | null };
};

export async function getCalendarCards(options: {
  from: Date;
  to: Date;
  boardId?: string;
  labelId?: string;
}): Promise<CalendarCard[]> {
  const cards = await db.card.findMany({
    where: {
      archived: false,
      dueDate: { gte: options.from, lte: options.to },
      list: {
        archived: false,
        board: { archived: false, ...(options.boardId ? { id: options.boardId } : {}) },
      },
      ...(options.labelId ? { labels: { some: { labelId: options.labelId } } } : {}),
    },
    orderBy: { dueDate: "asc" },
    take: 1000,
    select: {
      id: true,
      title: true,
      dueDate: true,
      completed: true,
      labels: { select: { labelId: true } },
      list: { select: { board: { select: { id: true, title: true, color: true } } } },
    },
  });
  return cards.map((card) => ({
    id: card.id,
    title: card.title,
    dueDate: card.dueDate!.toISOString(),
    completed: card.completed,
    labelIds: card.labels.map((label) => label.labelId),
    board: card.list.board,
  }));
}

/** Boards with their labels, for the calendar filters. */
export function getCalendarFilterOptions() {
  return db.board.findMany({
    where: { archived: false },
    orderBy: { position: "asc" },
    select: {
      id: true,
      title: true,
      color: true,
      labels: { orderBy: { name: "asc" }, select: { id: true, name: true, color: true } },
    },
  });
}
