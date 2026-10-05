"use server";

import { z } from "zod";

import { positionAfter, positionBetween } from "@/lib/position";
import { logActivity, q, snapshot } from "@/server/activity";
import { db } from "@/server/db";
import { isAuthenticated } from "@/server/session";

import { type ActionResult, fail, idSchema, ok, parse, titleSchema, UNAUTHORIZED } from "./result";

const createSchema = z.object({ listId: idSchema, title: titleSchema });

export async function createCard(
  input: z.input<typeof createSchema>,
): Promise<ActionResult<{ id: string; position: string }>> {
  if (!(await isAuthenticated())) return fail(UNAUTHORIZED);
  const { data, error } = parse(createSchema, input);
  if (!data) return fail(error);

  const list = await db.list.findUnique({
    where: { id: data.listId },
    select: { id: true, title: true, boardId: true },
  });
  if (!list) return fail("Lista non trovata.");

  const last = await db.card.findFirst({
    where: { listId: data.listId },
    orderBy: { position: "desc" },
    select: { position: true },
  });
  const card = await db.card.create({
    data: {
      listId: data.listId,
      title: data.title,
      position: positionAfter(last?.position ?? null),
    },
    select: { id: true, position: true },
  });
  await logActivity({
    kind: "card.create",
    summary: `Card ${q(data.title)} creata in ${q(list.title)}`,
    boardId: list.boardId,
    cardId: card.id,
    entityIds: [card.id],
    undo: [{ op: "update", model: "card", id: card.id, data: { archived: true } }],
  });
  return ok(card);
}

const updateSchema = z.object({
  id: idSchema,
  title: titleSchema.optional(),
  archived: z.boolean().optional(),
});

export async function updateCard(input: z.input<typeof updateSchema>): Promise<ActionResult> {
  if (!(await isAuthenticated())) return fail(UNAUTHORIZED);
  const { data, error } = parse(updateSchema, input);
  if (!data) return fail(error);

  const { id, ...changes } = data;
  const before = await db.card.findUnique({
    where: { id },
    select: { title: true, archived: true, list: { select: { boardId: true } } },
  });
  if (!before) return fail("Card non trovata.");
  await db.card.update({ where: { id }, data: changes });
  const summary =
    changes.archived === true
      ? `Card ${q(before.title)} archiviata`
      : changes.archived === false
        ? `Card ${q(before.title)} ripristinata`
        : `Card ${q(before.title)} rinominata in ${q(changes.title ?? before.title)}`;
  await logActivity({
    kind: "card.update",
    summary,
    boardId: before.list.boardId,
    cardId: id,
    entityIds: [id],
    undo: [
      {
        op: "update",
        model: "card",
        id,
        data: snapshot({
          title: changes.title === undefined ? undefined : before.title,
          archived: changes.archived === undefined ? undefined : before.archived,
        }),
      },
    ],
  });
  return ok(undefined);
}

const moveSchema = z.object({
  id: idSchema,
  listId: idSchema,
  beforeId: idSchema.nullable(),
  afterId: idSchema.nullable(),
});

/** Moves the card into `listId`, between `beforeId` and `afterId` (null = list edge). */
export async function moveCard(
  input: z.input<typeof moveSchema>,
): Promise<ActionResult<{ position: string }>> {
  if (!(await isAuthenticated())) return fail(UNAUTHORIZED);
  const { data, error } = parse(moveSchema, input);
  if (!data) return fail(error);

  const [card, list] = await Promise.all([
    db.card.findUnique({
      where: { id: data.id },
      select: {
        title: true,
        listId: true,
        position: true,
        listEnteredAt: true,
        list: { select: { boardId: true, title: true } },
      },
    }),
    db.list.findUnique({ where: { id: data.listId }, select: { boardId: true, title: true } }),
  ]);
  if (!card || !list) return fail("Card o lista non trovata.");
  if (card.list.boardId !== list.boardId) return fail("Spostamento tra board non supportato.");

  const neighbourIds = [data.beforeId, data.afterId].filter((id): id is string => id !== null);
  const neighbours = await db.card.findMany({
    where: { id: { in: neighbourIds }, listId: data.listId },
    select: { id: true, position: true },
  });
  const positionOf = (id: string | null) =>
    id === null ? null : neighbours.find((n) => n.id === id)?.position;
  const before = positionOf(data.beforeId);
  const after = positionOf(data.afterId);
  if (before === undefined || after === undefined) return fail("Posizione non valida.");

  try {
    const position = positionBetween(before, after);
    await db.card.update({
      where: { id: data.id },
      data: {
        listId: data.listId,
        position,
        listEnteredAt: card.listId !== data.listId ? new Date() : undefined,
      },
    });
    await logActivity({
      kind: "card.move",
      summary:
        card.listId === data.listId
          ? `Card ${q(card.title)} riordinata in ${q(list.title)}`
          : `Card ${q(card.title)} spostata da ${q(card.list.title)} a ${q(list.title)}`,
      boardId: list.boardId,
      cardId: data.id,
      entityIds: [data.id],
      undo: [
        {
          op: "update",
          model: "card",
          id: data.id,
          data: snapshot({
            listId: card.listId,
            position: card.position,
            listEnteredAt: card.listEnteredAt,
          }),
        },
      ],
    });
    return ok({ position });
  } catch {
    return fail("Posizione non valida.");
  }
}
