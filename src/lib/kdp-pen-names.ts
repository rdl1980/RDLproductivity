/**
 * Sales by pen name: the author line of each KDP book groups its sales. Pure
 * functions over the same records as the sales dashboard, tested.
 */
import { z } from "zod";

import type { KdpAccount } from "./kdp";
import type { KdpBookFormat } from "./kdp-books";
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

// --- Registry ----------------------------------------------------------------------

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((v) => v || null)
    .nullable()
    .optional();
const optionalUrl = optionalText(500).refine(
  (v) => !v || /^https?:\/\/\S+$/i.test(v),
  "Indirizzo non valido: deve iniziare con http:// o https://.",
);

/** Contact and profile details of a pen name; empty strings clear a field. */
export const penProfileSchema = z.object({
  name: z.string().trim().min(1, "Il pen name è obbligatorio.").max(200),
  owner: optionalText(200),
  website: optionalUrl,
  email: optionalText(200).refine(
    (v) => !v || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v),
    "Email non valida.",
  ),
  amazonUrl: optionalUrl,
  instagram: optionalText(200),
  facebook: optionalText(200),
  tiktok: optionalText(200),
  languages: optionalText(100),
  genres: optionalText(300),
  bio: optionalText(5000),
  notes: optionalText(5000),
});

export type PenProfileInput = z.input<typeof penProfileSchema>;
export type PenProfile = {
  [K in keyof z.output<typeof penProfileSchema>]-?: K extends "name" ? string : string | null;
};

export const PEN_PROFILE_FIELDS = [
  "owner",
  "website",
  "email",
  "amazonUrl",
  "instagram",
  "facebook",
  "tiktok",
  "languages",
  "genres",
  "bio",
  "notes",
] as const;

/** A registry book: its formats with status, ASIN and Amazon link. */
export type RegistryBook = {
  id: string;
  title: string;
  account: KdpAccount;
  series: string | null;
  author: string | null;
  formats: KdpBookFormat[];
  missing: boolean;
};

export type RegistryEntry = {
  name: string;
  /** Saved details, null when none were entered yet. */
  profile: PenProfile | null;
  accounts: KdpAccount[];
  books: RegistryBook[];
  /** Books with at least one format online. */
  published: number;
};

const isPublished = (book: RegistryBook) =>
  !book.missing && book.formats.some((f) => f.status === "live");

/**
 * Every pen name, from the books' author lines and from the saved profiles
 * (a profile can exist before its first book): name order, unknown last.
 * Within one, published books first, then by title.
 */
export function penRegistry(books: RegistryBook[], profiles: PenProfile[]): RegistryEntry[] {
  const byName = new Map<string, RegistryEntry>();
  const entry = (name: string) => {
    let e = byName.get(name);
    if (!e) {
      e = { name, profile: null, accounts: [], books: [], published: 0 };
      byName.set(name, e);
    }
    return e;
  };
  for (const profile of profiles) entry(profile.name).profile = profile;
  for (const book of books) {
    const e = entry(book.author || NO_PEN_NAME);
    e.books.push(book);
    if (!e.accounts.includes(book.account)) e.accounts.push(book.account);
  }
  for (const e of byName.values()) {
    e.books.sort(
      (a, b) =>
        Number(isPublished(b)) - Number(isPublished(a)) || a.title.localeCompare(b.title, "it"),
    );
    e.published = e.books.filter(isPublished).length;
  }
  return [...byName.values()].sort(
    (a, b) =>
      Number(a.name === NO_PEN_NAME) - Number(b.name === NO_PEN_NAME) ||
      a.name.localeCompare(b.name, "it"),
  );
}
