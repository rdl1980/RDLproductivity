"use server";

import { z } from "zod";

import type { CardItem, LabelItem } from "@/lib/board-state";
import { positionAfter, positionBetween } from "@/lib/position";
import {
  nextOccurrence,
  parseRecurrence,
  type Recurrence,
  recurrenceSchema,
} from "@/lib/recurrence";
import { logActivity, q, snapshot, type UndoOp } from "@/server/activity";
import { db, Prisma } from "@/server/db";
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
  priority: number | null;
  recurrence: Recurrence | null;
  archived: boolean;
  list: { id: string; title: string };
  board: { id: string; title: string; labels: LabelItem[] };
  labelIds: string[];
  checklists: ChecklistDetail[];
  /** Latest changes, newest first (ISO dates). */
  activity: { id: string; createdAt: string; actor: string; summary: string }[];
};

const detailsSchema = z.object({
  id: idSchema,
  description: z.string().max(20_000, "La descrizione è troppo lunga.").nullable().optional(),
  startDate: optionalDateSchema,
  dueDate: optionalDateSchema,
  completed: z.boolean().optional(),
  priority: z.number().int().min(0).max(4).nullable().optional(),
  recurrence: recurrenceSchema.nullable().optional(),
});

/**
 * Updates description, dates, priority, recurrence and the completed flag.
 * Completing a recurring card creates its next occurrence, returned as `next`.
 */
export async function updateCardDetails(
  input: z.input<typeof detailsSchema>,
): Promise<ActionResult<{ next: MovedCard | null }>> {
  if (!(await isAuthenticated())) return fail(UNAUTHORIZED);
  const { data, error } = parse(detailsSchema, input);
  if (!data) return fail(error);

  const current = await db.card.findUnique({
    where: { id: data.id },
    select: {
      title: true,
      description: true,
      startDate: true,
      dueDate: true,
      completed: true,
      priority: true,
      recurrence: true,
      list: { select: { boardId: true } },
    },
  });
  if (!current) return fail("Card non trovata.");

  const toDate = (value: string | null | undefined, fallback: Date | null) =>
    value === undefined ? fallback : value === null ? null : new Date(value);
  const startDate = toDate(data.startDate, current.startDate);
  const dueDate = toDate(data.dueDate, current.dueDate);
  if (startDate && dueDate && startDate > dueDate) {
    return fail("La data di inizio deve precedere la scadenza.");
  }
  // A rule needs a due date to repeat from; removing the due date drops it.
  let recurrence =
    data.recurrence === undefined ? parseRecurrence(current.recurrence) : data.recurrence;
  if (data.recurrence && !dueDate) return fail("Imposta una scadenza per ripetere la card.");
  if (!dueDate) recurrence = null;

  const completing = data.completed === true && !current.completed;
  const repeat = completing && recurrence && dueDate ? recurrence : null;

  const description = data.description === undefined ? undefined : data.description || null;
  const nextRecurrence = repeat || !recurrence ? null : recurrence;
  const previousRecurrence = parseRecurrence(current.recurrence);
  const next = await db.$transaction(async (tx) => {
    await tx.card.update({
      where: { id: data.id },
      data: {
        description,
        startDate,
        dueDate,
        completed: data.completed,
        priority: data.priority,
        // The completed occurrence hands its rule over to the next one.
        recurrence: nextRecurrence ?? Prisma.DbNull,
      },
    });
    const created = repeat ? await createNextOccurrence(tx, data.id, repeat) : null;

    const changes = describeDetailChanges(current, {
      description,
      startDate,
      dueDate,
      completed: data.completed,
      priority: data.priority,
      recurrence: nextRecurrence,
      next: created,
    });
    if (changes.length > 0) {
      const undo: UndoOp[] = [
        {
          op: "update",
          model: "card",
          id: data.id,
          data: snapshot({
            description: current.description,
            startDate: current.startDate,
            dueDate: current.dueDate,
            completed: current.completed,
            priority: current.priority,
            recurrence: previousRecurrence,
          }),
        },
      ];
      if (created) {
        undo.push({ op: "update", model: "card", id: created.card.id, data: { archived: true } });
      }
      await logActivity(
        {
          kind: "card.details",
          summary: `Card ${q(current.title)}: ${changes.join(", ")}`,
          boardId: current.list.boardId,
          cardId: data.id,
          entityIds: created ? [data.id, created.card.id] : [data.id],
          undo,
        },
        tx,
      );
    }
    return created;
  });
  return ok({ next });
}

const sameTime = (a: Date | null, b: Date | null) =>
  (a?.getTime() ?? null) === (b?.getTime() ?? null);

/** Human description of what changed, e.g. "completata, priorità P1". */
function describeDetailChanges(
  before: {
    description: string | null;
    startDate: Date | null;
    dueDate: Date | null;
    completed: boolean;
    priority: number | null;
    recurrence: unknown;
  },
  after: {
    description: string | null | undefined;
    startDate: Date | null;
    dueDate: Date | null;
    completed: boolean | undefined;
    priority: number | null | undefined;
    recurrence: Recurrence | null;
    next: MovedCard | null;
  },
): string[] {
  const changes: string[] = [];
  if (after.completed !== undefined && after.completed !== before.completed) {
    changes.push(after.completed ? "completata" : "riaperta");
  }
  if (after.next) changes.push("creata la prossima occorrenza");
  if (!sameTime(after.dueDate, before.dueDate)) {
    changes.push(
      after.dueDate
        ? before.dueDate
          ? "scadenza cambiata"
          : "scadenza impostata"
        : "scadenza rimossa",
    );
  }
  if (!sameTime(after.startDate, before.startDate)) changes.push("data di inizio cambiata");
  if (after.description !== undefined && after.description !== before.description) {
    changes.push("descrizione modificata");
  }
  if (after.priority !== undefined && after.priority !== before.priority) {
    changes.push(after.priority === null ? "priorità rimossa" : `priorità P${after.priority}`);
  }
  const hadRule = parseRecurrence(before.recurrence) !== null;
  if (!after.next && hadRule !== (after.recurrence !== null)) {
    changes.push(after.recurrence ? "ripetizione impostata" : "ripetizione rimossa");
  } else if (
    after.recurrence &&
    JSON.stringify(after.recurrence) !== JSON.stringify(parseRecurrence(before.recurrence))
  ) {
    changes.push("ripetizione cambiata");
  }
  return changes;
}

/** Copies a recurring card to its next due date, right after it in its list. */
async function createNextOccurrence(
  tx: Prisma.TransactionClient,
  cardId: string,
  recurrence: Recurrence,
): Promise<MovedCard> {
  const source = await tx.card.findUniqueOrThrow({
    where: { id: cardId },
    select: {
      listId: true,
      position: true,
      title: true,
      description: true,
      startDate: true,
      dueDate: true,
      priority: true,
      list: { select: { boardId: true } },
      labels: { select: { labelId: true } },
      checklists: {
        select: { title: true, position: true, items: { select: { text: true, position: true } } },
      },
    },
  });
  const dueDate = nextOccurrence(source.dueDate!, recurrence);
  const shift = dueDate.getTime() - source.dueDate!.getTime();
  const following = await tx.card.findFirst({
    where: { listId: source.listId, position: { gt: source.position } },
    orderBy: { position: "asc" },
    select: { position: true },
  });
  const created = await tx.card.create({
    data: {
      listId: source.listId,
      position: positionBetween(source.position, following?.position ?? null),
      title: source.title,
      description: source.description,
      startDate: source.startDate && new Date(source.startDate.getTime() + shift),
      dueDate,
      priority: source.priority,
      recurrence,
      labels: { create: source.labels },
      // Checklists start over, unchecked.
      checklists: {
        create: source.checklists.map((checklist) => ({
          title: checklist.title,
          position: checklist.position,
          items: { create: checklist.items },
        })),
      },
    },
    select: cardSummarySelect,
  });
  return { boardId: source.list.boardId, listId: source.listId, card: toCardSummary(created) };
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

const moveToSchema = z.object({
  id: idSchema,
  listId: idSchema,
  placement: placementSchema,
  /** Optionally changes the priority in the same update (super board). */
  priority: z.number().int().min(0).max(4).nullable().optional(),
});

export type MovedCard = { boardId: string; listId: string; card: CardItem };

/** Moves a card to the top or bottom of any list, also on another board. */
export async function moveCardToList(
  input: z.input<typeof moveToSchema>,
): Promise<ActionResult<MovedCard>> {
  if (!(await isAuthenticated())) return fail(UNAUTHORIZED);
  const { data, error } = parse(moveToSchema, input);
  if (!data) return fail(error);

  const [card, list] = await Promise.all([
    db.card.findUnique({
      where: { id: data.id },
      select: {
        title: true,
        listId: true,
        position: true,
        priority: true,
        labels: { select: { labelId: true } },
        list: { select: { boardId: true, title: true } },
      },
    }),
    db.list.findUnique({ where: { id: data.listId }, select: { boardId: true, title: true } }),
  ]);
  if (!card || !list) return fail("Card o lista non trovata.");

  const position = await edgePosition(data.listId, data.placement);
  const otherBoard = card.list.boardId !== list.boardId;
  const priorityChanged = data.priority !== undefined && data.priority !== card.priority;
  const updated = await db.$transaction(async (tx) => {
    // Labels belong to a board: they cannot follow the card elsewhere.
    if (otherBoard) {
      await tx.cardLabel.deleteMany({ where: { cardId: data.id } });
    }
    const result = await tx.card.update({
      where: { id: data.id },
      data: { listId: data.listId, position, priority: data.priority },
      select: cardSummarySelect,
    });
    const moved = card.listId !== data.listId;
    await logActivity(
      {
        kind: "card.move",
        summary: [
          moved
            ? `Card ${q(card.title)} spostata da ${q(card.list.title)} a ${q(list.title)}`
            : `Card ${q(card.title)}`,
          priorityChanged
            ? `priorità ${data.priority === null ? "rimossa" : `P${data.priority}`}`
            : null,
        ]
          .filter(Boolean)
          .join(", "),
        boardId: list.boardId,
        cardId: data.id,
        entityIds: [data.id],
        undo: [
          {
            op: "update",
            model: "card",
            id: data.id,
            data: { listId: card.listId, position: card.position, priority: card.priority },
          },
          ...(otherBoard
            ? card.labels.map(({ labelId }) => ({
                op: "cardLabel" as const,
                cardId: data.id,
                labelId,
                assigned: true,
              }))
            : []),
        ],
      },
      tx,
    );
    return result;
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
        priority: true,
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
    db.list.findUnique({ where: { id: data.listId }, select: { boardId: true, title: true } }),
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
      priority: source.priority,
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
  await logActivity({
    kind: "card.copy",
    summary: `Card ${q(data.title)} copiata in ${q(list.title)}`,
    boardId: list.boardId,
    cardId: created.id,
    entityIds: [created.id],
    undo: [{ op: "update", model: "card", id: created.id, data: { archived: true } }],
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
    select: {
      title: true,
      archived: true,
      listId: true,
      list: { select: { boardId: true, archived: true, board: { select: { archived: true } } } },
    },
  });
  if (!card) return fail("Card non trovata.");

  const restored = await db.$transaction(async (tx) => {
    await tx.list.update({ where: { id: card.listId }, data: { archived: false } });
    await tx.board.update({ where: { id: card.list.boardId }, data: { archived: false } });
    const result = await tx.card.update({
      where: { id: cardId },
      data: { archived: false },
      select: cardSummarySelect,
    });
    await logActivity(
      {
        kind: "card.restore",
        summary: `Card ${q(card.title)} ripristinata`,
        boardId: card.list.boardId,
        cardId,
        entityIds: [cardId, card.listId, card.list.boardId],
        undo: [
          { op: "update", model: "card", id: cardId, data: { archived: card.archived } },
          { op: "update", model: "list", id: card.listId, data: { archived: card.list.archived } },
          {
            op: "update",
            model: "board",
            id: card.list.boardId,
            data: { archived: card.list.board.archived },
          },
        ],
      },
      tx,
    );
    return result;
  });
  return ok({ boardId: card.list.boardId, listId: card.listId, card: toCardSummary(restored) });
}
