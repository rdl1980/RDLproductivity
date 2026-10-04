"use server";

import { z } from "zod";

import type { CardItem, LabelItem } from "@/lib/board-state";
import { positionAfter, positionBetween } from "@/lib/position";
import { db } from "@/server/db";
import { cardSummarySelect, toCardSummary } from "@/server/queries/card-summary";
import { isAuthenticated } from "@/server/session";

import {
  type ActionResult,
  fail,
  idSchema,
  ok,
  optionalDateSchema,
  parse,
  titleSchema,
  UNAUTHORIZED,
} from "./result";

export type ChecklistItemDetail = { id: string; text: string; done: boolean; position: string };
export type ChecklistDetail = {
  id: string;
  /** Client-only React key for optimistic items. */
  key?: string;
  title: string;
  position: string;
  items: ChecklistItemDetail[];
};

export type CardDetail = {
  id: string;
  title: string;
  description: string;
  startDate: string | null;
  dueDate: string | null;
  completed: boolean;
  archived: boolean;
  list: { id: string; title: string };
  board: { id: string; title: string; labels: LabelItem[] };
  labelIds: string[];
  checklists: ChecklistDetail[];
};

const detailsSchema = z.object({
  id: idSchema,
  description: z.string().max(20_000, "La descrizione è troppo lunga.").nullable().optional(),
  startDate: optionalDateSchema,
  dueDate: optionalDateSchema,
  completed: z.boolean().optional(),
});

/** Updates description, dates and the completed flag. */
export async function updateCardDetails(
  input: z.input<typeof detailsSchema>,
): Promise<ActionResult> {
  if (!(await isAuthenticated())) return fail(UNAUTHORIZED);
  const { data, error } = parse(detailsSchema, input);
  if (!data) return fail(error);

  const current = await db.card.findUnique({
    where: { id: data.id },
    select: { startDate: true, dueDate: true },
  });
  if (!current) return fail("Card non trovata.");

  const toDate = (value: string | null | undefined, fallback: Date | null) =>
    value === undefined ? fallback : value === null ? null : new Date(value);
  const startDate = toDate(data.startDate, current.startDate);
  const dueDate = toDate(data.dueDate, current.dueDate);
  if (startDate && dueDate && startDate > dueDate) {
    return fail("La data di inizio deve precedere la scadenza.");
  }

  await db.card.update({
    where: { id: data.id },
    data: {
      description: data.description === undefined ? undefined : data.description || null,
      startDate,
      dueDate,
      completed: data.completed,
    },
  });
  return ok(undefined);
}

/** Boards and lists a card can be moved or copied to. */
export async function getMoveTargets(): Promise<
  ActionResult<{ id: string; title: string; lists: { id: string; title: string }[] }[]>
> {
  if (!(await isAuthenticated())) return fail(UNAUTHORIZED);
  const boards = await db.board.findMany({
    where: { archived: false },
    orderBy: { position: "asc" },
    select: {
      id: true,
      title: true,
      lists: {
        where: { archived: false },
        orderBy: { position: "asc" },
        select: { id: true, title: true },
      },
    },
  });
  return ok(boards);
}

const placementSchema = z.enum(["top", "bottom"]);

async function edgePosition(listId: string, placement: "top" | "bottom") {
  const edge = await db.card.findFirst({
    where: { listId },
    orderBy: { position: placement === "top" ? "asc" : "desc" },
    select: { position: true },
  });
  return placement === "top"
    ? positionBetween(null, edge?.position ?? null)
    : positionAfter(edge?.position ?? null);
}

const moveToSchema = z.object({ id: idSchema, listId: idSchema, placement: placementSchema });

export type MovedCard = { boardId: string; listId: string; card: CardItem };

/** Moves a card to the top or bottom of any list, also on another board. */
export async function moveCardToList(
  input: z.input<typeof moveToSchema>,
): Promise<ActionResult<MovedCard>> {
  if (!(await isAuthenticated())) return fail(UNAUTHORIZED);
  const { data, error } = parse(moveToSchema, input);
  if (!data) return fail(error);

  const [card, list] = await Promise.all([
    db.card.findUnique({ where: { id: data.id }, select: { list: { select: { boardId: true } } } }),
    db.list.findUnique({ where: { id: data.listId }, select: { boardId: true } }),
  ]);
  if (!card || !list) return fail("Card o lista non trovata.");

  const position = await edgePosition(data.listId, data.placement);
  const updated = await db.$transaction(async (tx) => {
    // Labels belong to a board: they cannot follow the card elsewhere.
    if (card.list.boardId !== list.boardId) {
      await tx.cardLabel.deleteMany({ where: { cardId: data.id } });
    }
    return tx.card.update({
      where: { id: data.id },
      data: { listId: data.listId, position },
      select: cardSummarySelect,
    });
  });
  return ok({ boardId: list.boardId, listId: data.listId, card: toCardSummary(updated) });
}

const copySchema = z.object({
  id: idSchema,
  listId: idSchema,
  title: titleSchema,
  placement: placementSchema,
  keepLabels: z.boolean(),
  keepChecklists: z.boolean(),
});

/** Copies a card (optionally with labels and checklists) into any list. */
export async function copyCard(
  input: z.input<typeof copySchema>,
): Promise<ActionResult<MovedCard>> {
  if (!(await isAuthenticated())) return fail(UNAUTHORIZED);
  const { data, error } = parse(copySchema, input);
  if (!data) return fail(error);

  const [source, list] = await Promise.all([
    db.card.findUnique({
      where: { id: data.id },
      select: {
        description: true,
        startDate: true,
        dueDate: true,
        list: { select: { boardId: true } },
        labels: { select: { labelId: true } },
        checklists: {
          select: {
            title: true,
            position: true,
            items: { select: { text: true, done: true, position: true } },
          },
        },
      },
    }),
    db.list.findUnique({ where: { id: data.listId }, select: { boardId: true } }),
  ]);
  if (!source || !list) return fail("Card o lista non trovata.");

  const sameBoard = source.list.boardId === list.boardId;
  const position = await edgePosition(data.listId, data.placement);
  const created = await db.card.create({
    data: {
      listId: data.listId,
      title: data.title,
      position,
      description: source.description,
      startDate: source.startDate,
      dueDate: source.dueDate,
      labels:
        data.keepLabels && sameBoard
          ? { create: source.labels.map(({ labelId }) => ({ labelId })) }
          : undefined,
      checklists: data.keepChecklists
        ? {
            create: source.checklists.map((checklist) => ({
              title: checklist.title,
              position: checklist.position,
              items: { create: checklist.items },
            })),
          }
        : undefined,
    },
    select: cardSummarySelect,
  });
  return ok({ boardId: list.boardId, listId: data.listId, card: toCardSummary(created) });
}

/** Restores an archived card (and its list, if archived) and returns its summary. */
export async function restoreCard(id: string): Promise<ActionResult<MovedCard>> {
  if (!(await isAuthenticated())) return fail(UNAUTHORIZED);
  const { data: cardId, error } = parse(idSchema, id);
  if (error !== null) return fail(error);

  const card = await db.card.findUnique({
    where: { id: cardId },
    select: { listId: true, list: { select: { boardId: true } } },
  });
  if (!card) return fail("Card non trovata.");

  const restored = await db.$transaction(async (tx) => {
    await tx.list.update({ where: { id: card.listId }, data: { archived: false } });
    await tx.board.update({ where: { id: card.list.boardId }, data: { archived: false } });
    return tx.card.update({
      where: { id: cardId },
      data: { archived: false },
      select: cardSummarySelect,
    });
  });
  return ok({ boardId: card.list.boardId, listId: card.listId, card: toCardSummary(restored) });
}
