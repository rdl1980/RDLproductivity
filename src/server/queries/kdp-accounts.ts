import "server-only";

import type { KdpAccount } from "@/lib/kdp";
import { type AccountMatches, noMatches } from "@/lib/kdp-accounts";
import { storedFormatsSchema } from "@/lib/kdp-books";
import { parseTitleKey } from "@/lib/kdp-sales";
import { db } from "@/server/db";

const empty = noMatches;

/** Bookshelf books (KDP ids) each account already has. */
export async function bookMatches(kdpIds: string[]): Promise<AccountMatches> {
  const matches = empty();
  if (kdpIds.length === 0) return matches;
  const groups = await db.kdpBook.groupBy({
    by: ["account"],
    where: { kdpId: { in: kdpIds } },
    _count: { _all: true },
  });
  for (const group of groups) matches[group.account as KdpAccount] = group._count._all;
  return matches;
}

/**
 * Report titles (`titleKey`) each account already knows: from its earlier
 * sales, or from a Bookshelf book holding one of the title's ASINs.
 */
export async function titleMatches(titleKeys: string[]): Promise<AccountMatches> {
  const matches = empty();
  const keys = [...new Set(titleKeys)];
  if (keys.length === 0) return matches;

  const [sales, books] = await Promise.all([
    db.kdpSale.findMany({
      where: { titleKey: { in: keys } },
      distinct: ["account", "titleKey"],
      select: { account: true, titleKey: true },
    }),
    db.kdpBook.findMany({ select: { account: true, formats: true } }),
  ]);
  const known = new Map<string, Set<string>>();
  const add = (key: string, account: string) => {
    if (!known.has(key)) known.set(key, new Set());
    known.get(key)!.add(account);
  };
  for (const sale of sales) add(sale.titleKey, sale.account);

  const asinAccount = new Map<string, string>();
  for (const book of books) {
    const formats = storedFormatsSchema.safeParse(book.formats);
    if (!formats.success) continue;
    for (const format of formats.data) if (format.asin) asinAccount.set(format.asin, book.account);
  }
  for (const key of keys) {
    for (const asin of Object.values(parseTitleKey(key))) {
      const account = asin && asinAccount.get(asin);
      if (account) add(key, account);
    }
  }

  for (const accounts of known.values()) {
    for (const account of accounts) matches[account as KdpAccount] += 1;
  }
  return matches;
}

/** Books (by ASIN) and earlier ad rows each account already has for these ASINs. */
export async function asinMatches(asins: string[]): Promise<AccountMatches> {
  const matches = empty();
  const unique = [...new Set(asins)];
  if (unique.length === 0) return matches;
  const [books, ads] = await Promise.all([
    db.kdpBook.findMany({ select: { account: true, formats: true } }),
    db.kdpAdSpend.findMany({
      where: { asin: { in: unique } },
      distinct: ["account", "asin"],
      select: { account: true, asin: true },
    }),
  ]);
  const known = new Map<string, Set<string>>();
  const add = (asin: string, account: string) => {
    if (!known.has(asin)) known.set(asin, new Set());
    known.get(asin)!.add(account);
  };
  const wanted = new Set(unique);
  for (const book of books) {
    const formats = storedFormatsSchema.safeParse(book.formats);
    if (!formats.success) continue;
    for (const f of formats.data) if (f.asin && wanted.has(f.asin)) add(f.asin, book.account);
  }
  for (const row of ads) add(row.asin, row.account);
  for (const accounts of known.values()) {
    for (const account of accounts) matches[account as KdpAccount] += 1;
  }
  return matches;
}
