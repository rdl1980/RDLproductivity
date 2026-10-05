"use server";

import { z } from "zod";

import { LABEL_COLOR_VALUES } from "@/lib/label-colors";
import { logActivity, q } from "@/server/activity";
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
  await logActivity({
    kind: "label.create",
    summary: `Etichetta ${q(data.name || "senza nome")} creata`,
    boardId: data.boardId,
    entityIds: [label.id],
    undo: [{ op: "delete", model: "label", id: label.id }],
  });
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
  const before = await db.label.findUnique({
    where: { id },
    select: { name: true, color: true, boardId: true },
  });
  if (!before) return fail("Etichetta non trovata.");
  await db.label.update({ where: { id }, data: changes });
  await logActivity({
    kind: "label.update",
    summary: `Etichetta ${q(before.name || "senza nome")} modificata`,
    boardId: before.boardId,
    entityIds: [id],
    undo: [{ op: "update", model: "label", id, data: { name: before.name, color: before.color } }],
  });
  return ok(undefined);
}

export async function deleteLabel(id: string): Promise<ActionResult> {
  if (!(await isAuthenticated())) return fail(UNAUTHORIZED);
  const { data: labelId, error } = parse(idSchema, id);
  if (error !== null) return fail(error);

  const label = await db.label.findUnique({
    where: { id: labelId },
    select: {
      id: true,
      boardId: true,
      name: true,
      color: true,
      cards: { select: { cardId: true } },
    },
  });
  if (!label) return fail("Etichetta non trovata.");
  const { cards, ...fields } = label;
  await db.label.delete({ where: { id: labelId } });
  await logActivity({
    kind: "label.delete",
    summary: `Etichetta ${q(label.name || "senza nome")} eliminata`,
    boardId: label.boardId,
    entityIds: [labelId],
    undo: [{ op: "restoreLabel", label: fields, cardIds: cards.map((card) => card.cardId) }],
  });
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
      select: { title: true, list: { select: { boardId: true } } },
    }),
    db.label.findUnique({ where: { id: data.labelId }, select: { boardId: true, name: true } }),
  ]);
  if (!card || !label) return fail("Card o etichetta non trovata.");
  if (card.list.boardId !== label.boardId) return fail("L'etichetta appartiene a un'altra board.");

  const key = { cardId: data.cardId, labelId: data.labelId };
  const had = (await db.cardLabel.count({ where: key })) > 0;
  if (data.assigned) {
    await db.cardLabel.upsert({ where: { cardId_labelId: key }, create: key, update: {} });
  } else {
    await db.cardLabel.deleteMany({ where: key });
  }
  if (had !== data.assigned) {
    await logActivity({
      kind: "card.label",
      summary: `Card ${q(card.title)}: etichetta ${q(label.name || "senza nome")} ${
        data.assigned ? "aggiunta" : "rimossa"
      }`,
      boardId: card.list.boardId,
      cardId: data.cardId,
      entityIds: [data.cardId],
      undo: [{ op: "cardLabel", ...key, assigned: had }],
    });
  }
  return ok(undefined);
}
