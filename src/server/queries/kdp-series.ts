import "server-only";

import type { KdpAccount, KdpTrack } from "@/lib/kdp";
import {
  type BookStage,
  buildCatalog,
  type CatalogBook,
  type CatalogEntry,
  type CatalogSeries,
  firstSales,
  onlineWeeks,
  type SeriesStatus,
  type SeriesView,
  type UnmanagedSeries,
} from "@/lib/kdp-series-catalog";
import { db } from "@/server/db";
import { parseFormats } from "@/server/queries/kdp-books";

const day = (date: Date | null) => (date ? date.toISOString().slice(0, 10) : null);

export type SeriesCatalog = {
  series: SeriesView[];
  unmanaged: UnmanagedSeries[];
  /** Bookshelf books still listed, with no series name and in no series. */
  withoutSeries: number;
};

/** Every managed series with its books, publication dates and links. */
export async function getSeriesCatalog(): Promise<SeriesCatalog> {
  const [series, entries, rawBooks, tasks, asinFirst, starts] = await Promise.all([
    db.kdpSeries.findMany({ orderBy: { name: "asc" } }),
    db.kdpSeriesBook.findMany({
      orderBy: { createdAt: "asc" },
      include: {
        card: { select: { id: true, title: true, list: { select: { board: true } } } },
        task: { select: { id: true, title: true, week: true, track: true, done: true } },
      },
    }),
    db.kdpBook.findMany({
      select: {
        id: true,
        account: true,
        title: true,
        series: true,
        author: true,
        volume: true,
        formats: true,
        missingSince: true,
        publishedAt: true,
        links: {
          where: { status: "confirmed", card: { archived: false } },
          orderBy: { createdAt: "asc" },
          take: 1,
          select: {
            card: { select: { id: true, title: true, list: { select: { board: true } } } },
          },
        },
      },
    }),
    db.kdpTask.findMany({
      where: { track: "actual", title: { startsWith: "Online: " } },
      select: { account: true, title: true, notes: true, week: true },
    }),
    db.$queryRaw<{ account: string; asin: string; first: Date }[]>`
      SELECT account, asin, MIN(date) AS first FROM (
        SELECT account, "ebookAsin" AS asin, date FROM "KdpSale" WHERE "ebookAsin" IS NOT NULL
        UNION ALL
        SELECT account, "paperbackAsin", date FROM "KdpSale" WHERE "paperbackAsin" IS NOT NULL
        UNION ALL
        SELECT account, "hardcoverAsin", date FROM "KdpSale" WHERE "hardcoverAsin" IS NOT NULL
      ) s GROUP BY account, asin`,
    db.kdpSale.groupBy({ by: ["account"], _min: { date: true } }),
  ]);

  const books: CatalogBook[] = rawBooks.map((b) => ({
    id: b.id,
    account: b.account as KdpAccount,
    title: b.title,
    series: b.series,
    author: b.author,
    volume: b.volume,
    formats: parseFormats(b.formats),
    missing: b.missingSince !== null,
    publishedAt: day(b.publishedAt),
    linkedCard: b.links[0]
      ? {
          id: b.links[0].card.id,
          title: b.links[0].card.title,
          boardId: b.links[0].card.list.board.id,
          boardTitle: b.links[0].card.list.board.title,
        }
      : null,
  }));
  const catalog = buildCatalog(
    series.map((s): CatalogSeries => ({
      id: s.id,
      name: s.name,
      account: s.account as KdpAccount,
      penName: s.penName,
      kdpName: s.kdpName,
      status: s.status as SeriesStatus,
      plannedVolumes: s.plannedVolumes,
      language: s.language,
      genre: s.genre,
      description: s.description,
      notes: s.notes,
    })),
    entries.map((e): CatalogEntry => ({
      id: e.id,
      seriesId: e.seriesId,
      title: e.title,
      volume: e.volume,
      status: e.status as BookStage,
      plannedDate: day(e.plannedDate),
      bookId: e.bookId,
      notes: e.notes,
      card: e.card
        ? {
            id: e.card.id,
            title: e.card.title,
            boardId: e.card.list.board.id,
            boardTitle: e.card.list.board.title,
          }
        : null,
      task: e.task
        ? {
            id: e.task.id,
            title: e.task.title,
            week: day(e.task.week)!,
            track: e.task.track as KdpTrack,
            done: e.task.done,
          }
        : null,
    })),
    books,
    {
      onlineWeek: onlineWeeks(
        books,
        tasks.map((t) => ({
          account: t.account as KdpAccount,
          title: t.title,
          notes: t.notes,
          week: day(t.week)!,
        })),
      ),
      firstSale: firstSales(
        books,
        asinFirst.map((r) => ({ account: r.account, asin: r.asin, first: day(r.first)! })),
      ),
      salesStart: new Map(
        starts.filter((s) => s._min.date).map((s) => [s.account as KdpAccount, day(s._min.date)!]),
      ),
    },
  );
  const inSeries = new Set(
    catalog.series.flatMap((s) => s.rows.map((r) => r.book?.id).filter(Boolean)),
  );
  const withoutSeries = books.filter((b) => !b.missing && !b.series && !inSeries.has(b.id)).length;
  return { ...catalog, withoutSeries };
}

export type ShelfOption = {
  id: string;
  title: string;
  series: string | null;
  author: string | null;
  live: boolean;
};

/** Bookshelf books of an account that no series entry holds yet, to add to a series. */
export async function getShelfOptions(account: KdpAccount): Promise<ShelfOption[]> {
  const books = await db.kdpBook.findMany({
    where: { account, missingSince: null, seriesEntry: { is: null } },
    orderBy: { title: "asc" },
    select: { id: true, title: true, series: true, author: true, formats: true },
  });
  return books.map((b) => ({
    id: b.id,
    title: b.title,
    series: b.series,
    author: b.author,
    live: parseFormats(b.formats).some((f) => f.status === "live"),
  }));
}

export type TaskOption = {
  id: string;
  title: string;
  week: string;
  track: KdpTrack;
  done: boolean;
};

/** KDP calendar tasks of an account from six months back on, to link to a book. */
export async function getTaskOptions(account: KdpAccount): Promise<TaskOption[]> {
  const since = new Date(Date.now() - 183 * 24 * 3600_000);
  const tasks = await db.kdpTask.findMany({
    where: { account, week: { gte: since } },
    orderBy: [{ week: "desc" }, { position: "asc" }],
    take: 300,
    select: { id: true, title: true, week: true, track: true, done: true },
  });
  return tasks.map((t) => ({ ...t, week: day(t.week)!, track: t.track as KdpTrack }));
}

/** Known pen names: the Bookshelf authors and the registry entries. */
export async function getPenNameOptions(): Promise<string[]> {
  const [authors, profiles] = await Promise.all([
    db.kdpBook.findMany({
      where: { author: { not: null } },
      distinct: ["author"],
      select: { author: true },
    }),
    db.kdpPenName.findMany({ select: { name: true } }),
  ]);
  const names = new Set([...authors.map((a) => a.author!), ...profiles.map((p) => p.name)]);
  return [...names].sort((a, b) => a.localeCompare(b, "it"));
}
