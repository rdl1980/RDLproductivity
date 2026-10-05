import "server-only";

import { columnKey } from "@/lib/super-board";
import { daysBetween } from "@/lib/stats";
import { db } from "@/server/db";

const DAY_MS = 24 * 60 * 60 * 1000;
const activeCard = { archived: false, list: { archived: false, board: { archived: false } } };

export type StatsData = {
  openCards: number;
  overdue: number;
  urgent: number;
  /** ISO completion times of the last ~13 weeks (bucketed in the browser). */
  completions: string[];
  overdueByBoard: { id: string; title: string; count: number }[];
  ageByList: { title: string; cards: number; averageDays: number }[];
};

export async function getStats(now = new Date()): Promise<StatsData> {
  const [openCards, urgent, completed, overdueCards, openByList] = await Promise.all([
    db.card.count({ where: { ...activeCard, completed: false } }),
    db.card.count({ where: { ...activeCard, completed: false, priority: { in: [0, 1] } } }),
    db.card.findMany({
      where: { ...activeCard, completedAt: { gte: new Date(now.getTime() - 92 * DAY_MS) } },
      select: { completedAt: true },
      take: 5000,
    }),
    db.card.findMany({
      where: { ...activeCard, completed: false, dueDate: { lt: now } },
      select: { list: { select: { board: { select: { id: true, title: true } } } } },
      take: 5000,
    }),
    db.card.findMany({
      where: { ...activeCard, completed: false },
      select: { listEnteredAt: true, list: { select: { title: true } } },
      take: 5000,
    }),
  ]);

  const boards = new Map<string, { id: string; title: string; count: number }>();
  for (const { list } of overdueCards) {
    const entry = boards.get(list.board.id) ?? { ...list.board, count: 0 };
    entry.count++;
    boards.set(list.board.id, entry);
  }

  // Lists with the same name on different boards are one workflow stage.
  const lists = new Map<string, { title: string; cards: number; totalDays: number }>();
  for (const card of openByList) {
    const key = columnKey(card.list.title);
    const entry = lists.get(key) ?? { title: card.list.title.trim(), cards: 0, totalDays: 0 };
    entry.cards++;
    entry.totalDays += daysBetween(card.listEnteredAt, now);
    lists.set(key, entry);
  }

  return {
    openCards,
    overdue: overdueCards.length,
    urgent,
    completions: completed.map((card) => card.completedAt!.toISOString()),
    overdueByBoard: [...boards.values()].sort((a, b) => b.count - a.count),
    ageByList: [...lists.values()]
      .map(({ title, cards, totalDays }) => ({ title, cards, averageDays: totalDays / cards }))
      .sort((a, b) => b.averageDays - a.averageDays)
      .slice(0, 100),
  };
}
