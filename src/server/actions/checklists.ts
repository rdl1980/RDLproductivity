"use server";

import { z } from "zod";

import { positionAfter } from "@/lib/position";
import { db } from "@/server/db";
import { isAuthenticated } from "@/server/session";

import { type ActionResult, fail, idSchema, ok, parse, titleSchema, UNAUTHORIZED } from "./result";

const textSchema = z
  .string()
  .trim()
  .min(1, "Il testo non può essere vuoto.")
  .max(500, "Il testo è troppo lungo.");

const createSchema = z.object({ cardId: idSchema, title: titleSchema });

export async function createChecklist(
  input: z.input<typeof createSchema>,
): Promise<ActionResult<{ id: string; position: string }>> {
  if (!(await isAuthenticated())) return fail(UNAUTHORIZED);
  const { data, error } = parse(createSchema, input);
  if (!data) return fail(error);

  const card = await db.card.findUnique({ where: { id: data.cardId }, select: { id: true } });
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
  return ok(checklist);
}

const renameSchema = z.object({ id: idSchema, title: titleSchema });

export async function renameChecklist(input: z.input<typeof renameSchema>): Promise<ActionResult> {
  if (!(await isAuthenticated())) return fail(UNAUTHORIZED);
  const { data, error } = parse(renameSchema, input);
  if (!data) return fail(error);

  const { count } = await db.checklist.updateMany({
    where: { id: data.id },
    data: { title: data.title },
  });
  if (count === 0) return fail("Checklist non trovata.");
  return ok(undefined);
}

export async function deleteChecklist(id: string): Promise<ActionResult> {
  if (!(await isAuthenticated())) return fail(UNAUTHORIZED);
  const { data: checklistId, error } = parse(idSchema, id);
  if (error !== null) return fail(error);

  const { count } = await db.checklist.deleteMany({ where: { id: checklistId } });
  if (count === 0) return fail("Checklist non trovata.");
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
    select: { id: true },
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
  const { count } = await db.checklistItem.updateMany({ where: { id }, data: changes });
  if (count === 0) return fail("Elemento non trovato.");
  return ok(undefined);
}

export async function deleteChecklistItem(id: string): Promise<ActionResult> {
  if (!(await isAuthenticated())) return fail(UNAUTHORIZED);
  const { data: itemId, error } = parse(idSchema, id);
  if (error !== null) return fail(error);

  const { count } = await db.checklistItem.deleteMany({ where: { id: itemId } });
  if (count === 0) return fail("Elemento non trovato.");
  return ok(undefined);
}
