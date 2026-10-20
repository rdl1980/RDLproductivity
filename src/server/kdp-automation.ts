import "server-only";

import { accountLabel, type KdpAccount, laneLabel, mondayOf, todayIn } from "@/lib/kdp";
import {
  FORMAT_LABELS,
  type KdpBookFormat,
  type KdpFormat,
  formatSummary,
  mainTitle,
} from "@/lib/kdp-books";
import { positionAfter } from "@/lib/position";
import { logActivity, q, snapshot } from "@/server/activity";
import { db } from "@/server/db";

/** The app is single-user: "this week" is the owner's. */
const TIME_ZONE = process.env.DEFAULT_TIME_ZONE ?? "Europe/Rome";

/** Lists that mean "published" on a board: the first match receives online books. */
const DONE_LIST = /^(done|fatt[oi]|complet|pubblicat|online|uscit)/i;

export type BookChange = {
  bookId: string;
  account: KdpAccount;
  title: string;
  formats: KdpBookFormat[];
  live: KdpFormat[];
  blocked: KdpFormat[];
};

const formatList = (formats: KdpFormat[]) =>
  formats.map((f) => FORMAT_LABELS[f].toLowerCase()).join(", ");

/**
 * Reacts to status changes found by a Bookshelf import:
 * - a format online → an "actual" task in this week of the KDP calendar, and
 *   the linked cards completed and moved to the board's "Done" list;
 * - a format blocked → the linked cards raised to P0.
 * Every change is logged and can be undone.
 */
export async function applyBookChanges(
  changes: BookChange[],
): Promise<{ tasks: number; cards: number }> {
  let tasks = 0;
  let cards = 0;
  const week = mondayOf(todayIn(TIME_ZONE))!;

  for (const change of changes) {
    const title = mainTitle(change.title);

    if (change.live.length > 0) {
      const last = await db.kdpTask.findFirst({
        where: { week: new Date(`${week}T00:00:00Z`), account: change.account, track: "actual" },
        orderBy: { position: "desc" },
        select: { position: true },
      });
      const task = await db.kdpTask.create({
        data: {
          title: `Online: ${title} (${formatList(change.live)})`,
          notes:
            formatSummary(change.formats.filter((f) => change.live.includes(f.format))) || null,
          account: change.account,
          track: "actual",
          week: new Date(`${week}T00:00:00Z`),
          position: positionAfter(last?.position ?? null),
        },
      });
      await logActivity({
        kind: "kdp.create",
        summary: `Attività KDP ${q(task.title)} aggiunta dall'import (${laneLabel(change.account, "actual")}, settimana del ${week})`,
        entityIds: [task.id],
        undo: [{ op: "delete", model: "kdpTask", id: task.id }],
      });
      tasks++;
    }

    const links = await db.kdpBookLink.findMany({
      where: { bookId: change.bookId, status: "confirmed", card: { archived: false } },
      select: {
        card: {
          select: {
            id: true,
            title: true,
            completed: true,
            completedAt: true,
            priority: true,
            listId: true,
            position: true,
            listEnteredAt: true,
            list: { select: { boardId: true } },
          },
        },
      },
    });

    for (const { card } of links) {
      const boardId = card.list.boardId;
      if (change.live.length > 0 && !card.completed) {
        const done = (
          await db.list.findMany({
            where: { boardId, archived: false },
            orderBy: { position: "asc" },
            select: { id: true, title: true },
          })
        ).find((list) => DONE_LIST.test(list.title.trim()));
        const move = done && done.id !== card.listId;
        const lastInDone = move
          ? await db.card.findFirst({
              where: { listId: done.id },
              orderBy: { position: "desc" },
              select: { position: true },
            })
          : null;
        const now = new Date();
        await db.card.update({
          where: { id: card.id },
          data: {
            completed: true,
            completedAt: now,
            ...(move
              ? {
                  listId: done.id,
                  position: positionAfter(lastInDone?.position ?? null),
                  listEnteredAt: now,
                }
              : {}),
          },
        });
        await logActivity({
          kind: "card.update",
          summary: `Card ${q(card.title)} completata${move ? ` e spostata in ${q(done.title)}` : ""}: ${q(title)} è online su KDP (${formatList(change.live)})`,
          boardId,
          cardId: card.id,
          entityIds: [card.id],
          undo: [
            {
              op: "update",
              model: "card",
              id: card.id,
              data: snapshot({
                completed: card.completed,
                completedAt: card.completedAt,
                ...(move
                  ? {
                      listId: card.listId,
                      position: card.position,
                      listEnteredAt: card.listEnteredAt,
                    }
                  : {}),
              }),
            },
          ],
        });
        cards++;
      }
      if (change.blocked.length > 0 && card.priority !== 0) {
        await db.card.update({ where: { id: card.id }, data: { priority: 0 } });
        await logActivity({
          kind: "card.update",
          summary: `Card ${q(card.title)} portata a P0: ${q(title)} è bloccato su KDP (${formatList(change.blocked)}, ${accountLabel(change.account)})`,
          boardId,
          cardId: card.id,
          entityIds: [card.id],
          undo: [{ op: "update", model: "card", id: card.id, data: { priority: card.priority } }],
        });
        cards++;
      }
    }
  }
  return { tasks, cards };
}
