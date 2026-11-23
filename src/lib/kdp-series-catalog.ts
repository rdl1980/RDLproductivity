import { z } from "zod";

import { KDP_ACCOUNT_VALUES, type KdpAccount, type KdpTrack } from "./kdp";
import {
  type KdpBookFormat,
  type KdpStatus,
  mainTitle,
  matchScore,
  SUGGEST_THRESHOLD,
} from "./kdp-books";
import { volumeNumber } from "./kdp-series";

/**
 * Collane: the series managed by hand, built on top of the Bookshelf. A series
 * has one account and one pen name. Its books are the Bookshelf books of the
 * account whose series name is the series' `kdpName`, plus entries
 * (`KdpSeriesBook`): planned or in-progress books, Bookshelf books added by
 * hand, or Bookshelf books with extra details (card, task, notes).
 */

export const SERIES_STATUSES = [
  { value: "active", label: "In corso" },
  { value: "paused", label: "In pausa" },
  { value: "completed", label: "Conclusa" },
] as const;
export type SeriesStatus = (typeof SERIES_STATUSES)[number]["value"];
const SERIES_STATUS_VALUES = SERIES_STATUSES.map((s) => s.value) as [
  SeriesStatus,
  ...SeriesStatus[],
];

/** Work stages of a book in a series; Pubblicato also follows the Bookshelf. */
export const BOOK_STAGES = [
  { value: "idea", label: "Idea" },
  { value: "working", label: "In lavorazione" },
  { value: "ready", label: "Pronto" },
  { value: "published", label: "Pubblicato" },
] as const;
export type BookStage = (typeof BOOK_STAGES)[number]["value"];
const BOOK_STAGE_VALUES = BOOK_STAGES.map((s) => s.value) as [BookStage, ...BookStage[]];

export function seriesStatusLabel(status: SeriesStatus): string {
  return SERIES_STATUSES.find((s) => s.value === status)?.label ?? status;
}

export function stageLabel(stage: BookStage): string {
  return BOOK_STAGES.find((s) => s.value === stage)?.label ?? stage;
}

/** Series name as stored to match the Bookshelf: trimmed, single spaces, lowercase. */
export function normalizeKdpName(value: string | null | undefined): string | null {
  const name = (value ?? "").replace(/\s+/g, " ").trim().toLowerCase();
  return name || null;
}

/** "the nonna connie mysteries" → "The Nonna Connie Mysteries", for a new series' name. */
export function displayName(kdpName: string): string {
  return kdpName.replace(
    /(^|[\s'(-])(\p{L})/gu,
    (_, sep: string, ch: string) => sep + ch.toUpperCase(),
  );
}

// --- Input -------------------------------------------------------------------

/** Optional text: undefined leaves it, "" or null clears it. */
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, "Testo troppo lungo.")
    .nullable()
    .optional()
    .transform((value) => (value === undefined ? undefined : value || null));

const dateKey = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Data non valida (AAAA-MM-GG).")
  .refine((value) => !Number.isNaN(Date.parse(`${value}T00:00:00Z`)), "Data non valida.");

const id = z.string().min(1).max(64);

export const seriesInputSchema = z.object({
  /** Missing to create a series. */
  id: id.optional(),
  name: z
    .string()
    .trim()
    .min(1, "Il nome della collana non può essere vuoto.")
    .max(200, "Il nome è troppo lungo.")
    .optional(),
  account: z.enum(KDP_ACCOUNT_VALUES, "Account KDP non valido.").optional(),
  penName: optionalText(200),
  kdpName: optionalText(300).transform((value) =>
    value === undefined ? undefined : normalizeKdpName(value),
  ),
  status: z.enum(SERIES_STATUS_VALUES).optional(),
  plannedVolumes: z.number().int().min(1).max(999).nullable().optional(),
  language: optionalText(50),
  genre: optionalText(200),
  description: optionalText(5000),
  notes: optionalText(5000),
});
export type SeriesInput = z.output<typeof seriesInputSchema>;

export const seriesBookInputSchema = z.object({
  /** Entry to update; missing to create one (or to find the entry of `bookId`). */
  id: id.optional(),
  seriesId: id,
  /** Bookshelf book; null unlinks it from the entry. */
  bookId: id.nullable().optional(),
  title: z
    .string()
    .trim()
    .min(1, "Il titolo non può essere vuoto.")
    .max(300, "Il titolo è troppo lungo.")
    .optional(),
  volume: z.number().int().min(1).max(999).nullable().optional(),
  status: z.enum(BOOK_STAGE_VALUES).optional(),
  plannedDate: dateKey.nullable().optional(),
  /** Publication date set by hand on the linked Bookshelf book. */
  publishedAt: dateKey.nullable().optional(),
  notes: optionalText(5000),
  cardId: id.nullable().optional(),
  taskId: id.nullable().optional(),
});
export type SeriesBookInput = z.output<typeof seriesBookInputSchema>;

// --- Publication date --------------------------------------------------------

/**
 * When a book went live. Set by hand, or the earliest evidence that it was
 * already live: the week of the "Online: …" task the Bookshelf import adds to
 * the Reale lane, or the first sale. Sales reports only start at some date:
 * a first sale on that day only says "on or before" (`before`).
 */
export type PublishedOn = {
  /** "YYYY-MM-DD" */
  date: string;
  source: "manual" | "task" | "sale";
  before: boolean;
};

export function publicationDate(input: {
  manual: string | null;
  onlineWeek: string | null;
  firstSale: string | null;
  /** First day of the account's sales reports. */
  salesStart: string | null;
}): PublishedOn | null {
  if (input.manual) return { date: input.manual, source: "manual", before: false };
  const { onlineWeek, firstSale, salesStart } = input;
  if (firstSale && (!onlineWeek || firstSale < onlineWeek)) {
    return {
      date: firstSale,
      source: "sale",
      before: salesStart !== null && firstSale <= salesStart,
    };
  }
  if (onlineWeek) return { date: onlineWeek, source: "task", before: false };
  return null;
}

export type OnlineTask = { account: KdpAccount; title: string; notes: string | null; week: string };

/**
 * Week of the earliest "Online: …" task of each book: its notes list one of the
 * book's ASINs, or its title names the book's main title.
 */
export function onlineWeeks(
  books: { id: string; account: KdpAccount; title: string; formats: KdpBookFormat[] }[],
  tasks: OnlineTask[],
): Map<string, string> {
  const result = new Map<string, string>();
  const online = tasks.filter((t) => /^Online: /.test(t.title));
  for (const book of books) {
    const asins = book.formats.map((f) => f.asin).filter((a): a is string => !!a);
    const head = `Online: ${mainTitle(book.title)} (`;
    for (const task of online) {
      if (task.account !== book.account) continue;
      const match = task.title.startsWith(head) || asins.some((asin) => task.notes?.includes(asin));
      if (!match) continue;
      const known = result.get(book.id);
      if (!known || task.week < known) result.set(book.id, task.week);
    }
  }
  return result;
}

/** First sale of each book, from the first sale day of each ASIN of its account. */
export function firstSales(
  books: { id: string; account: KdpAccount; formats: KdpBookFormat[] }[],
  asinFirst: { account: string; asin: string; first: string }[],
): Map<string, string> {
  const byAsin = new Map<string, string>();
  for (const row of asinFirst) {
    const key = `${row.account}|${row.asin}`;
    const known = byAsin.get(key);
    if (!known || row.first < known) byAsin.set(key, row.first);
  }
  const result = new Map<string, string>();
  for (const book of books) {
    for (const format of book.formats) {
      if (!format.asin) continue;
      const first = byAsin.get(`${book.account}|${format.asin}`);
      const known = result.get(book.id);
      if (first && (!known || first < known)) result.set(book.id, first);
    }
  }
  return result;
}

// --- Catalog -----------------------------------------------------------------

export type CatalogSeries = {
  id: string;
  name: string;
  account: KdpAccount;
  penName: string | null;
  kdpName: string | null;
  status: SeriesStatus;
  plannedVolumes: number | null;
  language: string | null;
  genre: string | null;
  description: string | null;
  notes: string | null;
};

export type EntryCard = { id: string; title: string; boardId: string; boardTitle: string };
export type EntryTask = { id: string; title: string; week: string; track: KdpTrack; done: boolean };

export type CatalogEntry = {
  id: string;
  seriesId: string;
  title: string;
  volume: number | null;
  status: BookStage;
  plannedDate: string | null;
  bookId: string | null;
  notes: string | null;
  card: EntryCard | null;
  task: EntryTask | null;
};

export type CatalogBook = {
  id: string;
  account: KdpAccount;
  title: string;
  series: string | null;
  author: string | null;
  volume: number | null;
  formats: KdpBookFormat[];
  missing: boolean;
  /** Publication date set by hand. */
  publishedAt: string | null;
  /** First confirmed card of the book (Libri KDP links), shown when no entry names one. */
  linkedCard?: EntryCard | null;
};

export type SeriesRow = {
  /** Entry id, or "book:<id>" for a Bookshelf book without an entry. */
  key: string;
  entryId: string | null;
  book: {
    id: string;
    formats: KdpBookFormat[];
    author: string | null;
    missing: boolean;
    /** Volume set by hand on the book (null = read from the title). */
    volume: number | null;
    publishedAt: string | null;
    /** In the series by its Bookshelf series name (not removable here). */
    bySeriesName: boolean;
  } | null;
  title: string;
  volume: number | null;
  stage: BookStage;
  plannedDate: string | null;
  published: PublishedOn | null;
  /** The Bookshelf author differs from the series' pen name. */
  penMismatch: boolean;
  notes: string | null;
  card: EntryCard | null;
  task: EntryTask | null;
  /** For a planned book: the Bookshelf book it probably became. */
  suggestion: { bookId: string; title: string } | null;
};

export type SeriesView = CatalogSeries & {
  rows: SeriesRow[];
  counts: { total: number; published: number; inProgress: number; ideas: number };
  /** Earliest planned date among the books not yet published. */
  nextPlanned: string | null;
  lastPublished: string | null;
};

/** A series name on the Bookshelf that no managed series covers yet. */
export type UnmanagedSeries = {
  account: KdpAccount;
  kdpName: string;
  /** Most frequent author of its books. */
  author: string | null;
  books: number;
  published: number;
};

export type Evidence = {
  onlineWeek: Map<string, string>;
  firstSale: Map<string, string>;
  salesStart: Map<KdpAccount, string>;
};

const isLive = (formats: KdpBookFormat[]) => formats.some((f) => f.status === "live");

/** Stage of a Bookshelf book with no entry, from its formats. */
function shelfStage(formats: KdpBookFormat[]): BookStage {
  if (isLive(formats)) return "published";
  const ready: KdpStatus[] = ["review", "publishing"];
  return formats.some((f) => ready.includes(f.status)) ? "ready" : "working";
}

const STAGE_ORDER: Record<BookStage, number> = { published: 0, ready: 1, working: 2, idea: 3 };

function compareRows(a: SeriesRow, b: SeriesRow): number {
  if (a.volume !== null || b.volume !== null) {
    if (a.volume === null) return 1;
    if (b.volume === null) return -1;
    if (a.volume !== b.volume) return a.volume - b.volume;
  }
  const da = a.published?.date ?? a.plannedDate ?? "9999";
  const db = b.published?.date ?? b.plannedDate ?? "9999";
  if (da !== db) return da < db ? -1 : 1;
  if (a.stage !== b.stage) return STAGE_ORDER[a.stage] - STAGE_ORDER[b.stage];
  return a.title.localeCompare(b.title, "it");
}

/**
 * Every managed series with its books in reading order, and the Bookshelf
 * series names not managed yet.
 */
export function buildCatalog(
  series: CatalogSeries[],
  entries: CatalogEntry[],
  books: CatalogBook[],
  evidence: Evidence,
): { series: SeriesView[]; unmanaged: UnmanagedSeries[] } {
  const bookById = new Map(books.map((b) => [b.id, b]));
  const entryByBook = new Map(entries.filter((e) => e.bookId).map((e) => [e.bookId!, e]));
  const managed = new Map(
    series.filter((s) => s.kdpName).map((s) => [`${s.account}|${s.kdpName}`, s]),
  );
  const seriesKey = (book: CatalogBook) => {
    const name = normalizeKdpName(book.series);
    return name ? `${book.account}|${name}` : null;
  };

  function published(book: CatalogBook): PublishedOn | null {
    if (!book.publishedAt && !isLive(book.formats)) return null;
    return publicationDate({
      manual: book.publishedAt,
      onlineWeek: evidence.onlineWeek.get(book.id) ?? null,
      firstSale: evidence.firstSale.get(book.id) ?? null,
      salesStart: evidence.salesStart.get(book.account) ?? null,
    });
  }

  function bookRow(
    s: CatalogSeries,
    book: CatalogBook,
    entry: CatalogEntry | null,
    bySeriesName: boolean,
  ): SeriesRow {
    return {
      key: entry?.id ?? `book:${book.id}`,
      entryId: entry?.id ?? null,
      book: {
        id: book.id,
        formats: book.formats,
        author: book.author,
        missing: book.missing,
        volume: book.volume,
        publishedAt: book.publishedAt,
        bySeriesName,
      },
      title: mainTitle(book.title),
      volume: book.volume ?? volumeNumber(book.title) ?? entry?.volume ?? null,
      stage: isLive(book.formats) ? "published" : (entry?.status ?? shelfStage(book.formats)),
      plannedDate: entry?.plannedDate ?? null,
      published: published(book),
      penMismatch: !!s.penName && !!book.author && book.author !== s.penName,
      notes: entry?.notes ?? null,
      card: entry?.card ?? book.linkedCard ?? null,
      task: entry?.task ?? null,
      suggestion: null,
    };
  }

  const views = series.map((s): SeriesView => {
    const own = entries.filter((e) => e.seriesId === s.id);
    const rows: SeriesRow[] = [];
    const inRows = new Set<string>();
    for (const entry of own) {
      const book = entry.bookId ? bookById.get(entry.bookId) : undefined;
      if (book) {
        rows.push(
          bookRow(
            s,
            book,
            entry,
            s.kdpName !== null && seriesKey(book) === `${s.account}|${s.kdpName}`,
          ),
        );
        inRows.add(book.id);
      } else {
        rows.push({
          key: entry.id,
          entryId: entry.id,
          book: null,
          title: entry.title,
          volume: entry.volume,
          stage: entry.status,
          plannedDate: entry.plannedDate ?? entry.task?.week ?? null,
          published: null,
          penMismatch: false,
          notes: entry.notes,
          card: entry.card,
          task: entry.task,
          suggestion: null,
        });
      }
    }
    if (s.kdpName) {
      const key = `${s.account}|${s.kdpName}`;
      for (const book of books) {
        if (inRows.has(book.id) || entryByBook.has(book.id) || seriesKey(book) !== key) continue;
        rows.push(bookRow(s, book, null, true));
        inRows.add(book.id);
      }
    }

    // A planned book that came out: the account's Bookshelf book with that title.
    const candidates = books.filter(
      (b) =>
        b.account === s.account &&
        !entryByBook.has(b.id) &&
        (!seriesKey(b) || inRows.has(b.id) || !managed.has(seriesKey(b)!)),
    );
    for (const row of rows) {
      if (row.book) continue;
      let best: { book: CatalogBook; score: number } | null = null;
      for (const book of candidates) {
        const { score } = matchScore(
          { id: row.key, title: row.title },
          { id: book.id, title: book.title, markets: [] },
        );
        if (score >= SUGGEST_THRESHOLD && (!best || score > best.score)) best = { book, score };
      }
      if (best) row.suggestion = { bookId: best.book.id, title: mainTitle(best.book.title) };
    }

    rows.sort(compareRows);
    const unpublished = rows.filter((r) => r.stage !== "published");
    const dates = rows.map((r) => r.published?.date).filter((d): d is string => !!d);
    const planned = unpublished.map((r) => r.plannedDate).filter((d): d is string => !!d);
    return {
      ...s,
      rows,
      counts: {
        total: rows.length,
        published: rows.length - unpublished.length,
        inProgress: unpublished.filter((r) => r.stage !== "idea").length,
        ideas: unpublished.filter((r) => r.stage === "idea").length,
      },
      nextPlanned: planned.sort()[0] ?? null,
      lastPublished: dates.sort().at(-1) ?? null,
    };
  });

  const groups = new Map<string, CatalogBook[]>();
  for (const book of books) {
    const key = seriesKey(book);
    if (!key || managed.has(key) || entryByBook.has(book.id) || book.missing) continue;
    groups.set(key, [...(groups.get(key) ?? []), book]);
  }
  const unmanaged = [...groups.entries()].map(([key, group]): UnmanagedSeries => {
    const authors = new Map<string, number>();
    for (const b of group) if (b.author) authors.set(b.author, (authors.get(b.author) ?? 0) + 1);
    const author =
      [...authors.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0] ??
      null;
    return {
      account: group[0].account,
      kdpName: key.slice(key.indexOf("|") + 1),
      author,
      books: group.length,
      published: group.filter((b) => isLive(b.formats)).length,
    };
  });
  unmanaged.sort(
    (a, b) => a.account.localeCompare(b.account) || a.kdpName.localeCompare(b.kdpName),
  );

  return { series: views, unmanaged };
}
