import "server-only";

import type { Prisma } from "@/generated/prisma/client";
import type { AggregateCard } from "@/lib/aggregate";
import type { BoardListRef } from "@/lib/super-board";
import { SUPER_BOARD_PRIORITIES } from "@/lib/priority";
import { db } from "@/server/db";

import { cardSummarySelect, toCardSummary } from "./card-summary";

const DAY_MS = 24 * 60 * 60 * 1000;

const aggregateSelect = {
  ...cardSummarySelect,
  list: {
    select: {
      id: true,
      title: true,
      board: { select: { id: true, title: true, color: true } },
    },
  },
} satisfies Prisma.CardSelect;

type AggregateRow = Prisma.CardGetPayload<{ select: typeof aggregateSelect }>;

const activeCard = {
  archived: false,
  list: { archived: false, board: { archived: false } },
} satisfies Prisma.CardWhereInput;

/** Attaches board and list context and resolves label ids to labels. */
async function toAggregate(rows: AggregateRow[]): Promise<AggregateCard[]> {
  const boardIds = [...new Set(rows.map((row) => row.list.board.id))];
  const labels = await db.label.findMany({
    where: { boardId: { in: boardIds } },
    select: { id: true, name: true, color: true },
  });
  const byId = new Map(labels.map((label) => [label.id, label]));
  return rows.map((row) => {
    const summary = toCardSummary(row);
    const { board, ...list } = row.list;
    return {
      ...summary,
      board,
      list,
      labels: summary.labelIds.flatMap((id) => byId.get(id) ?? []),
    };
  });
}

/** Active P0 and P1 cards, plus the lists of their boards (in board order). */
export async function getSuperBoard(): Promise<{ cards: AggregateCard[]; lists: BoardListRef[] }> {
  const rows = await db.card.findMany({
    where: { ...activeCard, priority: { in: SUPER_BOARD_PRIORITIES } },
    take: 1000,
    select: aggregateSelect,
  });
  const cards = await toAggregate(rows);
  const boardIds = [...new Set(cards.map((card) => card.board.id))];
  const lists = await db.list.findMany({
    where: { archived: false, boardId: { in: boardIds } },
    orderBy: [{ board: { position: "asc" } }, { position: "asc" }],
    select: { id: true, title: true, boardId: true },
  });
  return { cards, lists };
}

/**
 * Cards for the today view. The server does not know the browser time zone,
 * so it returns a padded range and the client picks the sections.
 */
export async function getAgendaCards(now = new Date()): Promise<AggregateCard[]> {
  const rows = await db.card.findMany({
    where: {
      ...activeCard,
      dueDate: { not: null, lte: new Date(now.getTime() + 9 * DAY_MS) },
      OR: [{ completed: false }, { dueDate: { gte: new Date(now.getTime() - 2 * DAY_MS) } }],
    },
    orderBy: { dueDate: "asc" },
    take: 500,
    select: aggregateSelect,
  });
  return toAggregate(rows);
}
