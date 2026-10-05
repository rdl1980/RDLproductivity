"use server";

import { z } from "zod";

import { positionAfter } from "@/lib/position";
import { logActivity, q } from "@/server/activity";
import { db } from "@/server/db";
import { isAuthenticated } from "@/server/session";

import { type ActionResult, fail, idSchema, ok, parse, titleSchema, UNAUTHORIZED } from "./result";

const textSchema = z
  .string()
  .trim()
  .min(1, "Il testo non può essere vuoto.")
  .max(500, "Il testo è troppo lungo.");

const cardContext = { select: { id: true, title: true, list: { select: { boardId: true } } } };

/** Card and board a checklist belongs to, for the activity log. */
function context(card: { id: string; title: string; list: { boardId: string } }) {
  return { cardId: card.id, boardId: card.list.boardId, prefix: `Card ${q(card.title)}` };
}

const createSchema = z.object({ cardId: idSchema, title: titleSchema });

export async function createChecklist(
  input: z.input<typeof createSchema>,
): Promise<ActionResult<{ id: string; position: string }>> {
  if (!(await isAuthenticated())) return fail(UNAUTHORIZED);
  const { data, error } = parse(createSchema, input);
  if (!data) return fail(error);

  const card = await db.card.findUnique({ where: { id: data.cardId }, ...cardContext });
  if (!card) return fail("Card non trovata.");
  const last = await db.checklist.findFirst({
    where: { cardId: data.cardId },
    orderBy: { position: "desc" },
    select: { position: true },
  });
  const checklist = await db.checklist.create({
    data: { ...data, position: positionAfter(last?.position ?? null) },
    select: { id: true, position: true },
  });
  const { prefix, ...where } = context(card);
  await logActivity({
    kind: "checklist.create",
    summary: `${prefix}: checklist ${q(data.title)} aggiunta`,
    ...where,
    entityIds: [checklist.id],
    undo: [{ op: "delete", model: "checklist", id: checklist.id }],
  });
  return ok(checklist);
}

const renameSchema = z.object({ id: idSchema, title: titleSchema });

export async function renameChecklist(input: z.input<typeof renameSchema>): Promise<ActionResult> {
  if (!(await isAuthenticated())) return fail(UNAUTHORIZED);
  const { data, error } = parse(renameSchema, input);
  if (!data) return fail(error);

  const checklist = await db.checklist.findUnique({
    where: { id: data.id },
    select: { title: true, card: cardContext },
  });
  if (!checklist) return fail("Checklist non trovata.");
  await db.checklist.update({ where: { id: data.id }, data: { title: data.title } });
  const { prefix, ...where } = context(checklist.card);
  await logActivity({
    kind: "checklist.rename",
    summary: `${prefix}: checklist ${q(checklist.title)} rinominata in ${q(data.title)}`,
    ...where,
    entityIds: [data.id],
    undo: [{ op: "update", model: "checklist", id: data.id, data: { title: checklist.title } }],
  });
  return ok(undefined);
}

export async function deleteChecklist(id: string): Promise<ActionResult> {
  if (!(await isAuthenticated())) return fail(UNAUTHORIZED);
  const { data: checklistId, error } = parse(idSchema, id);
  if (error !== null) return fail(error);

  const checklist = await db.checklist.findUnique({
    where: { id: checklistId },
    select: {
      id: true,
      cardId: true,
      title: true,
      position: true,
      items: { select: { id: true, text: true, done: true, position: true } },
      card: cardContext,
    },
  });
  if (!checklist) return fail("Checklist non trovata.");
  await db.checklist.delete({ where: { id: checklistId } });
  const { card, ...saved } = checklist;
  const { prefix, ...where } = context(card);
  await logActivity({
    kind: "checklist.delete",
    summary: `${prefix}: checklist ${q(checklist.title)} eliminata`,
    ...where,
    entityIds: [checklistId, ...checklist.items.map((item) => item.id)],
    undo: [{ op: "restoreChecklist", checklist: saved }],
  });
  return ok(undefined);
}

const createItemSchema = z.object({ checklistId: idSchema, text: textSchema });

export async function createChecklistItem(
  input: z.input<typeof createItemSchema>,
): Promise<ActionResult<{ id: string; position: string }>> {
  if (!(await isAuthenticated())) return fail(UNAUTHORIZED);
  const { data, error } = parse(createItemSchema, input);
  if (!data) return fail(error);

  const checklist = await db.checklist.findUnique({
    where: { id: data.checklistId },
    select: { id: true, title: true, card: cardContext },
  });
  if (!checklist) return fail("Checklist non trovata.");
  const last = await db.checklistItem.findFirst({
    where: { checklistId: data.checklistId },
    orderBy: { position: "desc" },
    select: { position: true },
  });
  const item = await db.checklistItem.create({
    data: { ...data, position: positionAfter(last?.position ?? null) },
    select: { id: true, position: true },
  });
  const { prefix, ...where } = context(checklist.card);
  await logActivity({
    kind: "checklist.item.create",
    summary: `${prefix}: ${q(data.text)} aggiunto a ${q(checklist.title)}`,
    ...where,
    entityIds: [item.id, data.checklistId],
    undo: [{ op: "delete", model: "checklistItem", id: item.id }],
  });
  return ok(item);
}

const updateItemSchema = z.object({
  id: idSchema,
  text: textSchema.optional(),
  done: z.boolean().optional(),
});

export async function updateChecklistItem(
  input: z.input<typeof updateItemSchema>,
): Promise<ActionResult> {
  if (!(await isAuthenticated())) return fail(UNAUTHORIZED);
  const { data, error } = parse(updateItemSchema, input);
  if (!data) return fail(error);

  const { id, ...changes } = data;
  const item = await db.checklistItem.findUnique({
    where: { id },
    select: { text: true, done: true, checklist: { select: { card: cardContext } } },
  });
  if (!item) return fail("Elemento non trovato.");
  await db.checklistItem.update({ where: { id }, data: changes });
  const { prefix, ...where } = context(item.checklist.card);
  const what =
    changes.done !== undefined && changes.done !== item.done
      ? changes.done
        ? "completato"
        : "riaperto"
      : `modificato in ${q(changes.text ?? item.text)}`;
  await logActivity({
    kind: "checklist.item.update",
    summary: `${prefix}: ${q(item.text)} ${what}`,
    ...where,
    entityIds: [id],
    undo: [
      { op: "update", model: "checklistItem", id, data: { text: item.text, done: item.done } },
    ],
  });
  return ok(undefined);
}

export async function deleteChecklistItem(id: string): Promise<ActionResult> {
  if (!(await isAuthenticated())) return fail(UNAUTHORIZED);
  const { data: itemId, error } = parse(idSchema, id);
  if (error !== null) return fail(error);

  const item = await db.checklistItem.findUnique({
    where: { id: itemId },
    select: {
      id: true,
      checklistId: true,
      text: true,
      done: true,
      position: true,
      checklist: { select: { card: cardContext } },
    },
  });
  if (!item) return fail("Elemento non trovato.");
  await db.checklistItem.delete({ where: { id: itemId } });
  const { checklist, ...saved } = item;
  const { prefix, ...where } = context(checklist.card);
  await logActivity({
    kind: "checklist.item.delete",
    summary: `${prefix}: ${q(item.text)} eliminato`,
    ...where,
    entityIds: [itemId],
    undo: [{ op: "restoreItem", item: saved }],
  });
  return ok(undefined);
}
