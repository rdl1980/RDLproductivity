import "server-only";

import { db, Prisma } from "@/server/db";
import { getMcpUser } from "@/server/mcp-context";

/** Models whose fields an undo may restore. */
export type UndoModel = "board" | "list" | "card" | "label" | "checklist" | "checklistItem";

/** Inverse operations, applied in order to undo an activity. */
export type UndoOp =
  | { op: "update"; model: UndoModel; id: string; data: Record<string, unknown> }
  | { op: "delete"; model: "label" | "checklist" | "checklistItem"; id: string }
  | { op: "cardLabel"; cardId: string; labelId: string; assigned: boolean }
  | {
      op: "restoreLabel";
      label: { id: string; boardId: string; name: string; color: string };
      cardIds: string[];
    }
  | {
      op: "restoreChecklist";
      checklist: {
        id: string;
        cardId: string;
        title: string;
        position: string;
        items: { id: string; text: string; done: boolean; position: string }[];
      };
    }
  | {
      op: "restoreItem";
      item: { id: string; checklistId: string; text: string; done: boolean; position: string };
    };

export type ActivityEntry = {
  kind: string;
  summary: string;
  boardId?: string | null;
  cardId?: string | null;
  entityIds: string[];
  /** Omit when the change cannot be undone. */
  undo?: UndoOp[];
};

type Client = Prisma.TransactionClient | typeof db;

const RETENTION_DAYS = 180;

/** Quotes a title for summaries: «title», shortened. */
export function q(title: string): string {
  const trimmed = title.trim();
  return `«${trimmed.length > 60 ? `${trimmed.slice(0, 59)}…` : trimmed}»`;
}

/** Records a change; the actor is Claude when the call comes through MCP. */
export async function logActivity(entry: ActivityEntry, client: Client = db): Promise<void> {
  await client.activity.create({
    data: {
      actor: getMcpUser() ? "claude" : "user",
      kind: entry.kind,
      summary: entry.summary,
      boardId: entry.boardId ?? null,
      cardId: entry.cardId ?? null,
      entityIds: entry.entityIds,
      undo: entry.undo?.length ? (entry.undo as Prisma.InputJsonValue) : Prisma.DbNull,
    },
  });
  // Opportunistic cleanup, roughly once every hundred writes.
  if (Math.random() < 0.01) {
    await client.activity.deleteMany({
      where: { createdAt: { lt: new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000) } },
    });
  }
}

const DATE_FIELDS = new Set(["startDate", "dueDate"]);

/** JSON-safe snapshot of fields, for an update op. */
export function snapshot<T extends Record<string, unknown>>(fields: T): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(fields)
      .filter(([, value]) => value !== undefined)
      .map(([key, value]) => [key, value instanceof Date ? value.toISOString() : value]),
  );
}

function revive(data: Record<string, unknown>) {
  return Object.fromEntries(
    Object.entries(data).map(([key, value]) => {
      if (DATE_FIELDS.has(key) && typeof value === "string") return [key, new Date(value)];
      if (key === "recurrence" && value === null) return [key, Prisma.DbNull];
      return [key, value];
    }),
  );
}

async function applyOp(tx: Prisma.TransactionClient, op: UndoOp) {
  switch (op.op) {
    case "update": {
      // Each model delegate has the same updateMany signature for these fields.
      const delegate = tx[op.model] as unknown as {
        updateMany(args: { where: { id: string }; data: Record<string, unknown> }): Promise<{
          count: number;
        }>;
      };
      const { count } = await delegate.updateMany({ where: { id: op.id }, data: revive(op.data) });
      if (count === 0) throw new UndoError("Un elemento coinvolto non esiste più.");
      return;
    }
    case "delete": {
      const delegate = tx[op.model] as unknown as {
        deleteMany(args: { where: { id: string } }): Promise<{ count: number }>;
      };
      await delegate.deleteMany({ where: { id: op.id } });
      return;
    }
    case "cardLabel": {
      const key = { cardId: op.cardId, labelId: op.labelId };
      if (op.assigned) {
        await tx.cardLabel.upsert({ where: { cardId_labelId: key }, create: key, update: {} });
      } else {
        await tx.cardLabel.deleteMany({ where: key });
      }
      return;
    }
    case "restoreLabel": {
      await tx.label.create({ data: op.label });
      const cards = await tx.card.findMany({
        where: { id: { in: op.cardIds } },
        select: { id: true },
      });
      await tx.cardLabel.createMany({
        data: cards.map((card) => ({ cardId: card.id, labelId: op.label.id })),
      });
      return;
    }
    case "restoreChecklist": {
      const { items, ...checklist } = op.checklist;
      await tx.checklist.create({ data: { ...checklist, items: { create: items } } });
      return;
    }
    case "restoreItem":
      await tx.checklistItem.create({ data: op.item });
      return;
  }
}

export class UndoError extends Error {}

/**
 * Undoes an activity, unless a later change (not itself undone) touched the
 * same records: undoing then would silently overwrite it.
 */
export async function undoActivity(id: string): Promise<{ summary: string }> {
  return db.$transaction(async (tx) => {
    const activity = await tx.activity.findUnique({ where: { id } });
    if (!activity) throw new UndoError("Attività non trovata.");
    if (activity.undoneAt) throw new UndoError("Questa modifica è già stata annullata.");
    if (!activity.undo) throw new UndoError("Questa modifica non si può annullare.");

    const later = await tx.activity.count({
      where: {
        createdAt: { gt: activity.createdAt },
        undoneAt: null,
        entityIds: { hasSome: activity.entityIds },
        kind: { not: "undo" },
      },
    });
    if (later > 0) {
      throw new UndoError(
        "Ci sono modifiche successive sugli stessi elementi: annulla prima quelle.",
      );
    }

    try {
      for (const op of activity.undo as UndoOp[]) await applyOp(tx, op);
    } catch (error) {
      if (error instanceof UndoError) throw error;
      // e.g. restoring a checklist whose card was deleted meanwhile.
      throw new UndoError("Un elemento coinvolto non esiste più.");
    }
    await tx.activity.update({ where: { id }, data: { undoneAt: new Date() } });
    await logActivity(
      {
        kind: "undo",
        summary: `Annullato: ${activity.summary}`,
        boardId: activity.boardId,
        cardId: activity.cardId,
        entityIds: activity.entityIds,
      },
      tx,
    );
    return { summary: activity.summary };
  });
}

export type ActivityItem = {
  id: string;
  createdAt: Date;
  actor: string;
  summary: string;
  undoable: boolean;
  undone: boolean;
  board: { id: string; title: string } | null;
  cardId: string | null;
};

/** Newest first, optionally for one card or board, `before` an activity for paging. */
export async function listActivity(options: {
  cardId?: string;
  boardId?: string;
  before?: Date;
  take?: number;
}): Promise<ActivityItem[]> {
  const rows = await db.activity.findMany({
    where: {
      kind: { not: "undo" },
      ...(options.cardId ? { cardId: options.cardId } : {}),
      ...(options.boardId ? { boardId: options.boardId } : {}),
      ...(options.before ? { createdAt: { lt: options.before } } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: options.take ?? 50,
  });
  const boardIds = [...new Set(rows.flatMap((row) => (row.boardId ? [row.boardId] : [])))];
  const boards = await db.board.findMany({
    where: { id: { in: boardIds } },
    select: { id: true, title: true },
  });
  const byId = new Map(boards.map((board) => [board.id, board]));
  return rows.map((row) => ({
    id: row.id,
    createdAt: row.createdAt,
    actor: row.actor,
    summary: row.summary,
    undoable: row.undo !== null && row.undoneAt === null,
    undone: row.undoneAt !== null,
    board: (row.boardId && byId.get(row.boardId)) || null,
    cardId: row.cardId,
  }));
}
