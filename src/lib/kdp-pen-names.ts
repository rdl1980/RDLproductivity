/**
 * Sales by pen name: the author line of each KDP book groups its sales. Pure
 * functions over the same records as the sales dashboard, tested.
 */
import type { KdpAccount } from "./kdp";
import type { AdRecord } from "./kdp-ads";
import {
  emptySums,
  groupSums,
  NO_PEN_NAME,
  type SaleRecord,
  type SaleSource,
  type Sums,
} from "./kdp-sales";

/** A book as the pen name pages know it: sold or not. */
export type PenBook = {
  key: string;
  title: string;
  account: KdpAccount;
  series: string | null;
  author: string | null;
};

export const penNameOf = (book: { author?: string | null } | undefined) =>
  book?.author || NO_PEN_NAME;

export type PenNameRow = {
  name: string;
  /** Books of the pen name (in the account filter), sold or not. */
  books: number;
  /** Books with a sale or KENP read in the period. */
  sold: number;
  sums: Sums;
  previous: Sums;
  adSpend: number;
};

export type PenBookRow = {
  book: PenBook;
  sums: Sums;
  previous: Sums;
  adSpend: number;
  /** First and last day with a record, over the whole history. */
  first: string | null;
  last: string | null;
};

const active = (sums: Sums) => sums.units > 0 || sums.kenp > 0 || sums.royalty !== 0;

/**
 * One row per pen name, largest royalty first, unknown last: the period's
 * and the previous period's sums, ad spend, and how many of its books sold.
 */
export function penNameTable(
  current: SaleRecord[],
  previous: SaleRecord[],
  ads: AdRecord[],
  books: PenBook[],
  sources: ReadonlySet<SaleSource>,
): PenNameRow[] {
  const byKey = new Map(books.map((b) => [b.key, b]));
  const pen = (key: string) => penNameOf(byKey.get(key));
  const now = groupSums(current, (r) => pen(r.book), sources);
  const before = groupSums(previous, (r) => pen(r.book), sources);
  const perBook = groupSums(current, (r) => r.book, sources);
  const spend = new Map<string, number>();
  for (const ad of ads) spend.set(pen(ad.book), (spend.get(pen(ad.book)) ?? 0) + ad.spend);

  const names = new Set([...books.map((b) => penNameOf(b)), ...now.keys()]);
  const rows = [...names].map((name) => {
    const own = books.filter((b) => penNameOf(b) === name);
    return {
      name,
      books: own.length,
      sold: own.filter((b) => {
        const sums = perBook.get(b.key);
        return sums !== undefined && active(sums);
      }).length,
      sums: now.get(name) ?? emptySums(),
      previous: before.get(name) ?? emptySums(),
      adSpend: spend.get(name) ?? 0,
    };
  });
  return rows.sort(
    (a, b) =>
      Number(a.name === NO_PEN_NAME) - Number(b.name === NO_PEN_NAME) ||
      b.sums.royalty - a.sums.royalty ||
      a.name.localeCompare(b.name, "it"),
  );
}

/** Every book of a pen name, sold in the period or not, largest royalty first. */
export function penBookRows(
  name: string,
  all: SaleRecord[],
  current: SaleRecord[],
  previous: SaleRecord[],
  ads: AdRecord[],
  books: PenBook[],
  sources: ReadonlySet<SaleSource>,
): PenBookRow[] {
  const own = books.filter((b) => penNameOf(b) === name);
  const keys = new Set(own.map((b) => b.key));
  const now = groupSums(
    current.filter((r) => keys.has(r.book)),
    (r) => r.book,
    sources,
  );
  const before = groupSums(
    previous.filter((r) => keys.has(r.book)),
    (r) => r.book,
    sources,
  );
  const spend = new Map<string, number>();
  for (const ad of ads) {
    if (keys.has(ad.book)) spend.set(ad.book, (spend.get(ad.book) ?? 0) + ad.spend);
  }
  const first = new Map<string, string>();
  const last = new Map<string, string>();
  for (const r of all) {
    if (!keys.has(r.book)) continue;
    if (!first.has(r.book) || r.d < first.get(r.book)!) first.set(r.book, r.d);
    if (!last.has(r.book) || r.d > last.get(r.book)!) last.set(r.book, r.d);
  }
  return own
    .map((book) => ({
      book,
      sums: now.get(book.key) ?? emptySums(),
      previous: before.get(book.key) ?? emptySums(),
      adSpend: spend.get(book.key) ?? 0,
      first: first.get(book.key) ?? null,
      last: last.get(book.key) ?? null,
    }))
    .sort(
      (a, b) => b.sums.royalty - a.sums.royalty || a.book.title.localeCompare(b.book.title, "it"),
    );
}
