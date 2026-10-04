"use server";

import { z } from "zod";

import { positionAfter, positionBetween } from "@/lib/position";
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

  const list = await db.list.findUnique({ where: { id: data.listId }, select: { id: true } });
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
  const { count } = await db.card.updateMany({ where: { id }, data: changes });
  if (count === 0) return fail("Card non trovata.");
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
    db.card.findUnique({ where: { id: data.id }, select: { list: { select: { boardId: true } } } }),
    db.list.findUnique({ where: { id: data.listId }, select: { boardId: true } }),
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
    await db.card.update({ where: { id: data.id }, data: { listId: data.listId, position } });
    return ok({ position });
  } catch {
    return fail("Posizione non valida.");
  }
}
