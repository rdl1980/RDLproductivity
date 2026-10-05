import "server-only";

import { positionAfter } from "@/lib/position";
import {
  type BoardTemplate,
  boardTemplateSchema,
  type CardTemplate,
  cardTemplateSchema,
  describeTemplate,
  labelKey,
  type TemplateKind,
  type TemplateSummary,
} from "@/lib/templates";
import { db, type Prisma } from "@/server/db";

type Tx = Prisma.TransactionClient;

const cardSelect = {
  title: true,
  description: true,
  priority: true,
  labels: { select: { label: { select: { name: true, color: true } } } },
  checklists: {
    orderBy: { position: "asc" },
    select: { title: true, items: { orderBy: { position: "asc" }, select: { text: true } } },
  },
} satisfies Prisma.CardSelect;

function toCardTemplate(card: Prisma.CardGetPayload<{ select: typeof cardSelect }>): CardTemplate {
  return {
    title: card.title,
    description: card.description,
    priority: card.priority,
    labels: card.labels.map(({ label }) => label),
    checklists: card.checklists.map((checklist) => ({
      title: checklist.title,
      items: checklist.items.map((item) => item.text),
    })),
  };
}

export async function snapshotCard(cardId: string): Promise<CardTemplate | null> {
  const card = await db.card.findUnique({ where: { id: cardId }, select: cardSelect });
  return card && toCardTemplate(card);
}

/** Active lists (and optionally their active cards) of a board. */
export async function snapshotBoard(
  boardId: string,
  includeCards: boolean,
): Promise<BoardTemplate | null> {
  const board = await db.board.findUnique({
    where: { id: boardId },
    select: {
      color: true,
      labels: { orderBy: { name: "asc" }, select: { name: true, color: true } },
      lists: {
        where: { archived: false },
        orderBy: { position: "asc" },
        select: {
          title: true,
          cards: {
            where: { archived: false },
            orderBy: { position: "asc" },
            take: includeCards ? 500 : 0,
            select: cardSelect,
          },
        },
      },
    },
  });
  if (!board) return null;
  return {
    color: board.color ?? "#0079bf",
    labels: board.labels,
    lists: board.lists.map((list) => ({
      title: list.title,
      cards: list.cards.map(toCardTemplate),
    })),
  };
}

/** Label ids on `boardId` for the template labels, creating the missing ones. */
async function resolveLabels(
  tx: Tx,
  boardId: string,
  labels: { name: string; color: string }[],
): Promise<Map<string, string>> {
  const existing = await tx.label.findMany({
    where: { boardId },
    select: { id: true, name: true, color: true },
  });
  const byKey = new Map(existing.map((label) => [labelKey(label), label.id]));
  for (const label of labels) {
    const key = labelKey(label);
    if (byKey.has(key)) continue;
    const created = await tx.label.create({
      data: { boardId, name: label.name, color: label.color },
      select: { id: true },
    });
    byKey.set(key, created.id);
  }
  return byKey;
}

async function createCardFrom(
  tx: Tx,
  template: CardTemplate,
  listId: string,
  position: string,
  labelIds: Map<string, string>,
) {
  let checklistPosition: string | null = null;
  return tx.card.create({
    data: {
      listId,
      position,
      title: template.title,
      description: template.description,
      priority: template.priority,
      labels: {
        create: [...new Set(template.labels.map((label) => labelIds.get(labelKey(label))!))].map(
          (labelId) => ({ labelId }),
        ),
      },
      checklists: {
        create: template.checklists.map((checklist) => {
          checklistPosition = positionAfter(checklistPosition);
          let itemPosition: string | null = null;
          return {
            title: checklist.title,
            position: checklistPosition,
            items: {
              create: checklist.items.map((text) => {
                itemPosition = positionAfter(itemPosition);
                return { text, position: itemPosition };
              }),
            },
          };
        }),
      },
    },
    select: { id: true },
  });
}

/** Creates a board (at the end of the board list) from a template. */
export async function instantiateBoard(
  tx: Tx,
  template: BoardTemplate,
  title: string,
  color: string,
): Promise<string> {
  const last = await tx.board.findFirst({
    orderBy: { position: "desc" },
    select: { position: true },
  });
  const board = await tx.board.create({
    data: { title, color, position: positionAfter(last?.position ?? null) },
    select: { id: true },
  });
  const allLabels = [
    ...template.labels,
    ...template.lists.flatMap((l) => l.cards.flatMap((c) => c.labels)),
  ];
  const labelIds = await resolveLabels(tx, board.id, allLabels);
  let listPosition: string | null = null;
  for (const listTemplate of template.lists) {
    listPosition = positionAfter(listPosition);
    const list = await tx.list.create({
      data: { boardId: board.id, title: listTemplate.title, position: listPosition },
      select: { id: true },
    });
    let cardPosition: string | null = null;
    for (const card of listTemplate.cards) {
      cardPosition = positionAfter(cardPosition);
      await createCardFrom(tx, card, list.id, cardPosition, labelIds);
    }
  }
  return board.id;
}

/** Adds a card from a template at the bottom of `listId`. */
export async function instantiateCard(
  tx: Tx,
  template: CardTemplate,
  listId: string,
): Promise<{ id: string; boardId: string }> {
  const list = await tx.list.findUniqueOrThrow({
    where: { id: listId },
    select: { boardId: true },
  });
  const last = await tx.card.findFirst({
    where: { listId },
    orderBy: { position: "desc" },
    select: { position: true },
  });
  const labelIds = await resolveLabels(tx, list.boardId, template.labels);
  const card = await createCardFrom(
    tx,
    template,
    listId,
    positionAfter(last?.position ?? null),
    labelIds,
  );
  return { id: card.id, boardId: list.boardId };
}

export async function listTemplates(kind?: TemplateKind): Promise<TemplateSummary[]> {
  const rows = await db.template.findMany({
    where: kind ? { kind } : {},
    orderBy: { name: "asc" },
    select: { id: true, kind: true, name: true, data: true },
  });
  return rows.map((row) => ({
    id: row.id,
    kind: row.kind as TemplateKind,
    name: row.name,
    detail: describeTemplate(row.kind as TemplateKind, row.data),
  }));
}

export async function loadTemplate<K extends TemplateKind>(
  id: string,
  kind: K,
): Promise<(K extends "board" ? BoardTemplate : CardTemplate) | null> {
  const row = await db.template.findFirst({ where: { id, kind }, select: { data: true } });
  if (!row) return null;
  const schema = kind === "board" ? boardTemplateSchema : cardTemplateSchema;
  const parsed = schema.safeParse(row.data);
  return parsed.success ? (parsed.data as K extends "board" ? BoardTemplate : CardTemplate) : null;
}
