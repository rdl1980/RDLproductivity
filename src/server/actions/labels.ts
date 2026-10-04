"use server";

import { z } from "zod";

import { LABEL_COLOR_VALUES } from "@/lib/label-colors";
import { db } from "@/server/db";
import { isAuthenticated } from "@/server/session";

import { type ActionResult, fail, idSchema, ok, parse, UNAUTHORIZED } from "./result";

const nameSchema = z.string().trim().max(50, "Il nome è troppo lungo.");
const colorSchema = z.enum(LABEL_COLOR_VALUES);

const createSchema = z.object({ boardId: idSchema, name: nameSchema, color: colorSchema });

export async function createLabel(
  input: z.input<typeof createSchema>,
): Promise<ActionResult<{ id: string }>> {
  if (!(await isAuthenticated())) return fail(UNAUTHORIZED);
  const { data, error } = parse(createSchema, input);
  if (!data) return fail(error);

  const board = await db.board.findUnique({ where: { id: data.boardId }, select: { id: true } });
  if (!board) return fail("Board non trovata.");
  const label = await db.label.create({ data, select: { id: true } });
  return ok(label);
}

const updateSchema = z.object({
  id: idSchema,
  name: nameSchema.optional(),
  color: colorSchema.optional(),
});

export async function updateLabel(input: z.input<typeof updateSchema>): Promise<ActionResult> {
  if (!(await isAuthenticated())) return fail(UNAUTHORIZED);
  const { data, error } = parse(updateSchema, input);
  if (!data) return fail(error);

  const { id, ...changes } = data;
  const { count } = await db.label.updateMany({ where: { id }, data: changes });
  if (count === 0) return fail("Etichetta non trovata.");
  return ok(undefined);
}

export async function deleteLabel(id: string): Promise<ActionResult> {
  if (!(await isAuthenticated())) return fail(UNAUTHORIZED);
  const { data: labelId, error } = parse(idSchema, id);
  if (error !== null) return fail(error);

  const { count } = await db.label.deleteMany({ where: { id: labelId } });
  if (count === 0) return fail("Etichetta non trovata.");
  return ok(undefined);
}

const assignSchema = z.object({ cardId: idSchema, labelId: idSchema, assigned: z.boolean() });

/** Adds or removes a label on a card; the label must belong to the card's board. */
export async function setCardLabel(input: z.input<typeof assignSchema>): Promise<ActionResult> {
  if (!(await isAuthenticated())) return fail(UNAUTHORIZED);
  const { data, error } = parse(assignSchema, input);
  if (!data) return fail(error);

  const [card, label] = await Promise.all([
    db.card.findUnique({
      where: { id: data.cardId },
      select: { list: { select: { boardId: true } } },
    }),
    db.label.findUnique({ where: { id: data.labelId }, select: { boardId: true } }),
  ]);
  if (!card || !label) return fail("Card o etichetta non trovata.");
  if (card.list.boardId !== label.boardId) return fail("L'etichetta appartiene a un'altra board.");

  const key = { cardId: data.cardId, labelId: data.labelId };
  if (data.assigned) {
    await db.cardLabel.upsert({ where: { cardId_labelId: key }, create: key, update: {} });
  } else {
    await db.cardLabel.deleteMany({ where: key });
  }
  return ok(undefined);
}
