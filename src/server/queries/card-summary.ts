import "server-only";

import type { Prisma } from "@/generated/prisma/client";
import type { CardItem } from "@/lib/board-state";

/** Prisma `select` for the fields shown on a card in the board view. */
export const cardSummarySelect = {
  id: true,
  title: true,
  position: true,
  dueDate: true,
  completed: true,
  description: true,
  labels: { select: { labelId: true } },
  checklists: { select: { items: { select: { done: true } } } },
} satisfies Prisma.CardSelect;

type CardSummaryRow = Prisma.CardGetPayload<{ select: typeof cardSummarySelect }>;

export function toCardSummary(card: CardSummaryRow): CardItem {
  const items = card.checklists.flatMap((checklist) => checklist.items);
  return {
    id: card.id,
    title: card.title,
    position: card.position,
    dueDate: card.dueDate?.toISOString() ?? null,
    completed: card.completed,
    hasDescription: !!card.description?.trim(),
    labelIds: card.labels.map((label) => label.labelId),
    checklist: { done: items.filter((item) => item.done).length, total: items.length },
  };
}
