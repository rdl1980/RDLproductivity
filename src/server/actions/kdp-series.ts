"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { accountLabel, type KdpAccount, KDP_ACCOUNT_VALUES } from "@/lib/kdp";
import { mainTitle } from "@/lib/kdp-books";
import { volumeNumber } from "@/lib/kdp-series";
import {
  displayName,
  normalizeKdpName,
  seriesBookInputSchema,
  seriesInputSchema,
} from "@/lib/kdp-series-catalog";
import { logActivity, q, snapshot, type UndoOp } from "@/server/activity";
import { db, Prisma } from "@/server/db";
import { parseFormats } from "@/server/queries/kdp-books";
import { getSeriesCatalog } from "@/server/queries/kdp-series";
import { isAuthenticated } from "@/server/session";

import { type ActionResult, fail, idSchema, ok, parse, UNAUTHORIZED } from "./result";

const PATH = "/collane";
const DUPLICATE_KDP_NAME = "Un'altra collana dello stesso account usa già questo nome KDP.";

const toDate = (value: string | null | undefined) =>
  value === undefined ? undefined : value === null ? null : new Date(`${value}T00:00:00Z`);

function refresh() {
  revalidatePath(PATH, "layout");
}

function isUniqueError(error: unknown) {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

/**
 * Creates a series (name and account required) or updates one: only the
 * fields given change, an empty text clears one. The account cannot change
 * while the series holds Bookshelf books of its account.
 */
export async function saveKdpSeries(input: unknown): Promise<ActionResult<{ id: string }>> {
  if (!(await isAuthenticated())) return fail(UNAUTHORIZED);
  const { data, error } = parse(seriesInputSchema, input);
  if (!data) return fail(error);
  const { id, ...fields } = data;
  const values = Object.fromEntries(Object.entries(fields).filter(([, v]) => v !== undefined));

  try {
    if (!id) {
      if (!data.name) return fail("Il nome della collana non può essere vuoto.");
      if (!data.account) return fail("Scegli l'account KDP della collana.");
      const created = await db.kdpSeries.create({
        data: { ...values, name: data.name, account: data.account },
      });
      await logActivity({
        kind: "kdp.series",
        summary: `Collana ${q(created.name)} creata (${accountLabel(data.account)})`,
        entityIds: [created.id],
        undo: [{ op: "delete", model: "kdpSeries", id: created.id }],
      });
      refresh();
      return ok({ id: created.id });
    }

    const current = await db.kdpSeries.findUnique({ where: { id } });
    if (!current) return fail("Collana non trovata.");
    if (data.account && data.account !== current.account) {
      const linked = await db.kdpSeriesBook.count({
        where: { seriesId: id, bookId: { not: null } },
      });
      if (linked > 0) {
        return fail("La collana contiene libri KDP del suo account: non si può spostare.");
      }
    }
    await db.kdpSeries.update({ where: { id }, data: values });
    const previous = Object.fromEntries(
      Object.keys(values).map((key) => [key, current[key as keyof typeof current]]),
    );
    await logActivity({
      kind: "kdp.series",
      summary: `Collana ${q(data.name ?? current.name)} aggiornata`,
      entityIds: [id],
      undo: [{ op: "update", model: "kdpSeries", id, data: snapshot(previous) }],
    });
    refresh();
    return ok({ id });
  } catch (error) {
    if (isUniqueError(error)) return fail(DUPLICATE_KDP_NAME);
    throw error;
  }
}

/** Deletes a series and its planned books; Bookshelf books stay as they are. */
export async function deleteKdpSeries(input: unknown): Promise<ActionResult> {
  if (!(await isAuthenticated())) return fail(UNAUTHORIZED);
  const { data, error } = parse(z.object({ id: idSchema }), input);
  if (!data) return fail(error);
  const series = await db.kdpSeries.findUnique({
    where: { id: data.id },
    select: { name: true, _count: { select: { books: true } } },
  });
  if (!series) return fail("Collana non trovata.");
  await db.kdpSeries.delete({ where: { id: data.id } });
  await logActivity({
    kind: "kdp.series",
    summary: `Collana ${q(series.name)} eliminata (${series._count.books} voci)`,
    entityIds: [data.id],
  });
  refresh();
  return ok(undefined);
}

const importSchema = z.object({
  account: z.enum(KDP_ACCOUNT_VALUES).optional(),
  kdpName: z.string().max(300).optional(),
});

/**
 * Creates a series for each Bookshelf series name no series covers yet (or
 * only the one given), with the name capitalised and the most frequent author
 * as pen name.
 */
export async function importKdpSeries(input: unknown): Promise<ActionResult<{ created: number }>> {
  if (!(await isAuthenticated())) return fail(UNAUTHORIZED);
  const { data, error } = parse(importSchema, input ?? {});
  if (!data) return fail(error);
  const kdpName = normalizeKdpName(data.kdpName);
  const { unmanaged } = await getSeriesCatalog();
  const chosen = unmanaged.filter(
    (u) => (!data.account || u.account === data.account) && (!kdpName || u.kdpName === kdpName),
  );
  if (chosen.length === 0) return fail("Nessuna collana KDP da aggiungere.");
  const created = await db.$transaction(
    chosen.map((u) =>
      db.kdpSeries.create({
        data: {
          name: displayName(u.kdpName),
          account: u.account,
          kdpName: u.kdpName,
          penName: u.author,
        },
        select: { id: true },
      }),
    ),
  );
  await logActivity({
    kind: "kdp.series",
    summary:
      chosen.length === 1
        ? `Collana ${q(displayName(chosen[0].kdpName))} aggiunta da KDP`
        : `${chosen.length} collane aggiunte da KDP`,
    entityIds: created.map((c) => c.id),
    undo: created.map((c) => ({ op: "delete", model: "kdpSeries", id: c.id })),
  });
  refresh();
  return ok({ created: created.length });
}

/**
 * Adds or updates a book of a series. Without a Bookshelf book it is a
 * planned book (title required). With `bookId` the Bookshelf book joins the
 * series (same account only); its volume and publication date are saved on
 * the book itself, the rest (stage, planned date, card, task, notes) on the
 * entry.
 */
export async function saveKdpSeriesBook(input: unknown): Promise<ActionResult<{ id: string }>> {
  if (!(await isAuthenticated())) return fail(UNAUTHORIZED);
  const { data, error } = parse(seriesBookInputSchema, input);
  if (!data) return fail(error);

  const series = await db.kdpSeries.findUnique({ where: { id: data.seriesId } });
  if (!series) return fail("Collana non trovata.");
  const account = series.account as KdpAccount;

  const entry = data.id
    ? await db.kdpSeriesBook.findUnique({ where: { id: data.id } })
    : data.bookId
      ? await db.kdpSeriesBook.findUnique({ where: { bookId: data.bookId } })
      : null;
  if (data.id && !entry) return fail("Libro della collana non trovato.");

  const bookId = data.bookId !== undefined ? data.bookId : (entry?.bookId ?? null);
  const book = bookId ? await db.kdpBook.findUnique({ where: { id: bookId } }) : null;
  if (bookId && !book) return fail("Libro KDP non trovato.");
  if (book && book.account !== account) {
    return fail(
      `Il libro è sull'account ${accountLabel(book.account as KdpAccount)}, la collana su ${accountLabel(account)}.`,
    );
  }
  if (book) {
    const other = await db.kdpSeriesBook.findUnique({
      where: { bookId: book.id },
      select: { id: true },
    });
    if (other && other.id !== entry?.id) {
      return fail("Questo libro KDP è già collegato a un altro libro di una collana.");
    }
  }
  if (!entry && !book && !data.title) return fail("Serve il titolo del libro.");
  if (data.publishedAt !== undefined && !book) {
    return fail("La data di pubblicazione si imposta sui libri KDP: collega prima il libro.");
  }
  if (data.cardId && !(await db.card.findUnique({ where: { id: data.cardId } }))) {
    return fail("Card non trovata.");
  }
  if (data.taskId) {
    const task = await db.kdpTask.findUnique({
      where: { id: data.taskId },
      select: { account: true },
    });
    if (!task) return fail("Attività KDP non trovata.");
    if (task.account !== account) return fail("L'attività è nel calendario di un altro account.");
  }

  const live = book ? parseFormats(book.formats).some((f) => f.status === "live") : false;
  const entryData = {
    seriesId: series.id,
    title: data.title ?? entry?.title ?? mainTitle(book!.title),
    status: data.status ?? entry?.status ?? (live ? "published" : "idea"),
    bookId,
    ...(book ? {} : data.volume !== undefined ? { volume: data.volume } : {}),
    ...(data.plannedDate !== undefined ? { plannedDate: toDate(data.plannedDate) } : {}),
    ...(data.notes !== undefined ? { notes: data.notes } : {}),
    ...(data.cardId !== undefined ? { cardId: data.cardId } : {}),
    ...(data.taskId !== undefined ? { taskId: data.taskId } : {}),
  };

  // On the book: its volume (a planned volume carries over when linking) and publication date.
  const bookData: { volume?: number | null; publishedAt?: Date | null } = {};
  if (book) {
    if (data.volume !== undefined) bookData.volume = data.volume;
    else if (entry?.volume && !entry.bookId && book.volume === null && !volumeNumber(book.title)) {
      bookData.volume = entry.volume;
    }
    if (data.publishedAt !== undefined) bookData.publishedAt = toDate(data.publishedAt)!;
  }

  const saved = await db.$transaction(async (tx) => {
    const row = entry
      ? await tx.kdpSeriesBook.update({ where: { id: entry.id }, data: entryData })
      : await tx.kdpSeriesBook.create({ data: entryData });
    if (book && Object.keys(bookData).length > 0) {
      await tx.kdpBook.update({ where: { id: book.id }, data: bookData });
    }
    return row;
  });

  const undo: UndoOp[] = [];
  if (entry) {
    const previous = Object.fromEntries(
      Object.keys(entryData).map((key) => [key, entry[key as keyof typeof entry]]),
    );
    undo.push({ op: "update", model: "kdpSeriesBook", id: entry.id, data: snapshot(previous) });
  } else {
    undo.push({ op: "delete", model: "kdpSeriesBook", id: saved.id });
  }
  if (book && Object.keys(bookData).length > 0) {
    const previous = Object.fromEntries(
      Object.keys(bookData).map((key) => [key, book[key as keyof typeof book]]),
    );
    undo.push({ op: "update", model: "kdpBook", id: book.id, data: snapshot(previous) });
  }
  await logActivity({
    kind: "kdp.series.book",
    summary: entry
      ? `${q(saved.title)} aggiornato nella collana ${q(series.name)}`
      : `${q(saved.title)} aggiunto alla collana ${q(series.name)}`,
    entityIds: [saved.id, ...(book ? [book.id] : [])],
    undo,
  });
  refresh();
  revalidatePath("/kdp/vendite");
  return ok({ id: saved.id });
}

/**
 * Removes a book from its series: a planned book is deleted, a Bookshelf
 * book loses the details kept here (it stays in the series if KDP lists it
 * under the series name).
 */
export async function deleteKdpSeriesBook(input: unknown): Promise<ActionResult> {
  if (!(await isAuthenticated())) return fail(UNAUTHORIZED);
  const { data, error } = parse(z.object({ id: idSchema }), input);
  if (!data) return fail(error);
  const entry = await db.kdpSeriesBook.findUnique({
    where: { id: data.id },
    include: { series: { select: { name: true } } },
  });
  if (!entry) return fail("Libro della collana non trovato.");
  await db.kdpSeriesBook.delete({ where: { id: entry.id } });
  await logActivity({
    kind: "kdp.series.book",
    summary: `${q(entry.title)} tolto dalla collana ${q(entry.series.name)}`,
    entityIds: [entry.id],
    undo: [
      {
        op: "restoreKdpSeriesBook",
        entry: {
          id: entry.id,
          seriesId: entry.seriesId,
          title: entry.title,
          volume: entry.volume,
          status: entry.status,
          plannedDate: entry.plannedDate?.toISOString().slice(0, 10) ?? null,
          bookId: entry.bookId,
          taskId: entry.taskId,
          cardId: entry.cardId,
          notes: entry.notes,
        },
      },
    ],
  });
  refresh();
  return ok(undefined);
}
