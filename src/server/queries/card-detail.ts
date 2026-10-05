import "server-only";

import type { CardDetail } from "@/server/actions/card-details";
import { db } from "@/server/db";

/** Full card data for the detail dialog, or null when the card does not exist. */
export async function loadCardDetail(cardId: string): Promise<CardDetail | null> {
  const card = await db.card.findUnique({
    where: { id: cardId },
    select: {
      id: true,
      title: true,
      description: true,
      startDate: true,
      dueDate: true,
      completed: true,
      priority: true,
      archived: true,
      list: {
        select: {
          id: true,
          title: true,
          board: {
            select: {
              id: true,
              title: true,
              labels: { orderBy: { name: "asc" }, select: { id: true, name: true, color: true } },
            },
          },
        },
      },
      labels: { select: { labelId: true } },
      checklists: {
        orderBy: { position: "asc" },
        select: {
          id: true,
          title: true,
          position: true,
          items: {
            orderBy: { position: "asc" },
            select: { id: true, text: true, done: true, position: true },
          },
        },
      },
    },
  });
  if (!card) return null;

  const { board, ...list } = card.list;
  return {
    id: card.id,
    title: card.title,
    description: card.description ?? "",
    startDate: card.startDate?.toISOString() ?? null,
    dueDate: card.dueDate?.toISOString() ?? null,
    completed: card.completed,
    priority: card.priority,
    archived: card.archived,
    list,
    board,
    labelIds: card.labels.map((label) => label.labelId),
    checklists: card.checklists,
  };
}
