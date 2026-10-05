"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { BOARD_COLOR_VALUES } from "@/lib/board-colors";
import type { TemplateKind, TemplateSummary } from "@/lib/templates";
import { logActivity, q } from "@/server/activity";
import { db, type Prisma } from "@/server/db";
import { cardSummarySelect, toCardSummary } from "@/server/queries/card-summary";
import { isAuthenticated } from "@/server/session";
import {
  instantiateBoard,
  instantiateCard,
  listTemplates,
  loadTemplate,
  snapshotBoard,
  snapshotCard,
} from "@/server/templates";

import type { MovedCard } from "./card-details";
import { type ActionResult, fail, idSchema, ok, parse, titleSchema, UNAUTHORIZED } from "./result";

const nameSchema = z
  .string()
  .trim()
  .min(1, "Il nome non può essere vuoto.")
  .max(100, "Il nome è troppo lungo.");

const TEMPLATE_NOT_FOUND = "Template non trovato.";

export async function getTemplates(kind?: TemplateKind): Promise<ActionResult<TemplateSummary[]>> {
  if (!(await isAuthenticated())) return fail(UNAUTHORIZED);
  if (kind !== undefined && kind !== "board" && kind !== "card") return fail("Tipo non valido.");
  return ok(await listTemplates(kind));
}

const saveBoardSchema = z.object({
  boardId: idSchema,
  name: nameSchema,
  includeCards: z.boolean(),
});

export async function saveBoardAsTemplate(
  input: z.input<typeof saveBoardSchema>,
): Promise<ActionResult<{ id: string }>> {
  if (!(await isAuthenticated())) return fail(UNAUTHORIZED);
  const { data, error } = parse(saveBoardSchema, input);
  if (!data) return fail(error);
  const template = await snapshotBoard(data.boardId, data.includeCards);
  if (!template) return fail("Board non trovata.");
  const saved = await db.template.create({
    data: { kind: "board", name: data.name, data: template as Prisma.InputJsonValue },
    select: { id: true },
  });
  revalidatePath("/templates");
  return ok(saved);
}

const saveCardSchema = z.object({ cardId: idSchema, name: nameSchema });

export async function saveCardAsTemplate(
  input: z.input<typeof saveCardSchema>,
): Promise<ActionResult<{ id: string }>> {
  if (!(await isAuthenticated())) return fail(UNAUTHORIZED);
  const { data, error } = parse(saveCardSchema, input);
  if (!data) return fail(error);
  const template = await snapshotCard(data.cardId);
  if (!template) return fail("Card non trovata.");
  const saved = await db.template.create({
    data: { kind: "card", name: data.name, data: template as Prisma.InputJsonValue },
    select: { id: true },
  });
  revalidatePath("/templates");
  return ok(saved);
}

const boardFromSchema = z.object({
  templateId: idSchema,
  title: titleSchema,
  color: z.enum(BOARD_COLOR_VALUES).optional(),
});

export async function createBoardFromTemplate(
  input: z.input<typeof boardFromSchema>,
): Promise<ActionResult<{ id: string }>> {
  if (!(await isAuthenticated())) return fail(UNAUTHORIZED);
  const { data, error } = parse(boardFromSchema, input);
  if (!data) return fail(error);
  const template = await loadTemplate(data.templateId, "board");
  if (!template) return fail(TEMPLATE_NOT_FOUND);

  const id = await db.$transaction(
    async (tx) => {
      const boardId = await instantiateBoard(
        tx,
        template,
        data.title,
        data.color ?? template.color,
      );
      await logActivity(
        {
          kind: "board.create",
          summary: `Board ${q(data.title)} creata da template`,
          boardId,
          entityIds: [boardId],
          undo: [{ op: "update", model: "board", id: boardId, data: { archived: true } }],
        },
        tx,
      );
      return boardId;
    },
    { timeout: 30_000 },
  );
  revalidatePath("/boards");
  return ok({ id });
}

const cardFromSchema = z.object({ templateId: idSchema, listId: idSchema });

export async function createCardFromTemplate(
  input: z.input<typeof cardFromSchema>,
): Promise<ActionResult<MovedCard>> {
  if (!(await isAuthenticated())) return fail(UNAUTHORIZED);
  const { data, error } = parse(cardFromSchema, input);
  if (!data) return fail(error);
  const template = await loadTemplate(data.templateId, "card");
  if (!template) return fail(TEMPLATE_NOT_FOUND);
  const list = await db.list.findUnique({ where: { id: data.listId }, select: { title: true } });
  if (!list) return fail("Lista non trovata.");

  const card = await db.$transaction(async (tx) => {
    const created = await instantiateCard(tx, template, data.listId);
    await logActivity(
      {
        kind: "card.create",
        summary: `Card ${q(template.title)} creata da template in ${q(list.title)}`,
        boardId: created.boardId,
        cardId: created.id,
        entityIds: [created.id],
        undo: [{ op: "update", model: "card", id: created.id, data: { archived: true } }],
      },
      tx,
    );
    const summary = await tx.card.findUniqueOrThrow({
      where: { id: created.id },
      select: cardSummarySelect,
    });
    return { boardId: created.boardId, summary };
  });
  return ok({ boardId: card.boardId, listId: data.listId, card: toCardSummary(card.summary) });
}

const renameSchema = z.object({ id: idSchema, name: nameSchema });

export async function renameTemplate(input: z.input<typeof renameSchema>): Promise<ActionResult> {
  if (!(await isAuthenticated())) return fail(UNAUTHORIZED);
  const { data, error } = parse(renameSchema, input);
  if (!data) return fail(error);
  const { count } = await db.template.updateMany({
    where: { id: data.id },
    data: { name: data.name },
  });
  if (count === 0) return fail(TEMPLATE_NOT_FOUND);
  revalidatePath("/templates");
  return ok(undefined);
}

export async function deleteTemplate(id: string): Promise<ActionResult> {
  if (!(await isAuthenticated())) return fail(UNAUTHORIZED);
  const { data: templateId, error } = parse(idSchema, id);
  if (error !== null) return fail(error);
  const { count } = await db.template.deleteMany({ where: { id: templateId } });
  if (count === 0) return fail(TEMPLATE_NOT_FOUND);
  revalidatePath("/templates");
  return ok(undefined);
}
