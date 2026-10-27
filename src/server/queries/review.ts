import "server-only";

import { type KdpAccount, KDP_ACCOUNT_VALUES, type KdpTaskItem, addWeeks } from "@/lib/kdp";
import { type GoalProgress, goalProgress, weekEnd } from "@/lib/kdp-finance";
import { db } from "@/server/db";
import { getKdpTasks } from "@/server/queries/kdp";
import { getRoyaltyBetween } from "@/server/queries/kdp-finance";
import { getKdpGoals } from "@/server/queries/kdp-goals";
import { getSalesData } from "@/server/queries/kdp-sales";

const DAY_MS = 24 * 60 * 60 * 1000;

export type ReviewCard = {
  id: string;
  title: string;
  priority: number | null;
  dueDate: string | null;
  board: { id: string; title: string; color: string | null };
  list: string;
};

export type WeeklyReview = {
  week: string;
  weekEnd: string;
  cards: {
    completed: ReviewCard[];
    created: number;
    overdue: ReviewCard[];
    dueNext: ReviewCard[];
  };
  kdp: { tasks: KdpTaskItem[] };
  sales: {
    current: Record<KdpAccount, { royalty: number; units: number; kenp: number }>;
    previous: Record<KdpAccount, { royalty: number; units: number; kenp: number }>;
    topBooks: { title: string; account: KdpAccount; royalty: number; units: number }[];
  };
  goals: Partial<Record<KdpAccount, GoalProgress>>;
};

const cardSelect = {
  id: true,
  title: true,
  priority: true,
  dueDate: true,
  list: { select: { title: true, board: { select: { id: true, title: true, color: true } } } },
} as const;

function toReviewCard(card: {
  id: string;
  title: string;
  priority: number | null;
  dueDate: Date | null;
  list: { title: string; board: { id: string; title: string; color: string | null } };
}): ReviewCard {
  return {
    id: card.id,
    title: card.title,
    priority: card.priority,
    dueDate: card.dueDate?.toISOString() ?? null,
    board: card.list.board,
    list: card.list.title,
  };
}

/**
 * Everything that happened in the week starting on `week` (a Sunday), plus
 * what is coming next: the "how is it going" page. `today` decides the
 * month-to-date goals.
 */
export async function getWeeklyReview(week: string, today: string): Promise<WeeklyReview> {
  const from = new Date(`${week}T00:00:00Z`);
  const to = new Date(from.getTime() + 7 * DAY_MS);
  const end = weekEnd(week);
  const previousWeek = addWeeks(week, -1);
  const active = { archived: false, list: { archived: false, board: { archived: false } } };

  const [completed, created, overdue, dueNext, tasks, current, previous, goals, salesData] =
    await Promise.all([
      db.card.findMany({
        where: { ...active, completedAt: { gte: from, lt: to } },
        orderBy: { completedAt: "desc" },
        take: 200,
        select: cardSelect,
      }),
      db.card.count({ where: { ...active, createdAt: { gte: from, lt: to } } }),
      db.card.findMany({
        where: { ...active, completed: false, dueDate: { lt: to } },
        orderBy: { dueDate: "asc" },
        take: 50,
        select: cardSelect,
      }),
      db.card.findMany({
        where: {
          ...active,
          completed: false,
          dueDate: { gte: to, lt: new Date(to.getTime() + 7 * DAY_MS) },
        },
        orderBy: { dueDate: "asc" },
        take: 50,
        select: cardSelect,
      }),
      getKdpTasks(week, week),
      getRoyaltyBetween(week, end),
      getRoyaltyBetween(previousWeek, weekEnd(previousWeek)),
      getKdpGoals(),
      getSalesData(),
    ]);

  // Top books of the week, over both accounts.
  const titles = new Map(salesData.books.map((b) => [b.key, b]));
  const perBook = new Map<string, { royalty: number; units: number }>();
  for (const r of salesData.records) {
    if (r.d < week || r.d > end) continue;
    const entry = perBook.get(r.book) ?? { royalty: 0, units: 0 };
    entry.royalty += r.re + r.rp + r.rh + r.rk;
    entry.units += r.eu + r.pu + r.hu;
    perBook.set(r.book, entry);
  }
  const topBooks = [...perBook]
    .sort((a, b) => b[1].royalty - a[1].royalty)
    .slice(0, 5)
    .map(([key, sums]) => ({
      title: titles.get(key)?.title ?? key,
      account: titles.get(key)?.account ?? "main",
      royalty: Math.round(sums.royalty * 100) / 100,
      units: sums.units,
    }));

  const monthStart = `${today.slice(0, 7)}-01`;
  const monthToDate = await getRoyaltyBetween(monthStart, today);
  const progress: WeeklyReview["goals"] = {};
  for (const account of KDP_ACCOUNT_VALUES) {
    const target = goals[account];
    if (target) progress[account] = goalProgress(target, monthToDate[account].royalty, today);
  }

  return {
    week,
    weekEnd: end,
    cards: {
      completed: completed.map(toReviewCard),
      created,
      overdue: overdue.map(toReviewCard),
      dueNext: dueNext.map(toReviewCard),
    },
    kdp: { tasks },
    sales: { current, previous, topBooks },
    goals: progress,
  };
}
