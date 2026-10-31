import "server-only";

import { accountLabel, type KdpAccount } from "@/lib/kdp";
import { mainTitle } from "@/lib/kdp-books";
import { parseTitleKey, type SaleBook, type SaleRecord } from "@/lib/kdp-sales";
import type { AdRecord } from "@/lib/kdp-ads";
import type { KdpFormat } from "@/lib/kdp-books";
import type { PriceChange } from "@/lib/kdp-prices";
import { volumeNumber } from "@/lib/kdp-series";
import { db } from "@/server/db";
import { getAdRecords } from "@/server/queries/kdp-ads";
import { parseFormats } from "@/server/queries/kdp-books";

export const salesImportKey = (account: KdpAccount) => `kdp.sales.${account}`;

export type SalesImportInfo = { importedAt: string; from: string; to: string; rows: number };

export type CatalogBook = { id: string; title: string; account: KdpAccount };

export type SalesData = {
  records: SaleRecord[];
  books: SaleBook[];
  /** Every imported book, for naming unresolved titles. */
  catalog: CatalogBook[];
  imports: Partial<Record<KdpAccount, SalesImportInfo>>;
  /** When each account's Bookshelf was last imported (ISO), if ever. */
  booksImportedAt: Partial<Record<KdpAccount, string>>;
  /** Amazon Ads rows in EUR, on the same book keys as `records`. */
  ads: AdRecord[];
  /** EUR per unit of the ad report currencies. */
  fx: Record<string, number>;
  /** List prices seen on the Bookshelf, one per change. */
  prices: PriceChange[];
};

/**
 * Every sales row, with its title family resolved to the imported KDP book
 * that owns one of its ASINs (or kept as "key:<titleKey>" when unknown).
 */
export async function getSalesData(): Promise<SalesData> {
  const [rows, books, settings, aliases, bookImports] = await Promise.all([
    db.kdpSale.findMany({ orderBy: { date: "asc" } }),
    db.kdpBook.findMany({
      select: {
        id: true,
        account: true,
        title: true,
        series: true,
        author: true,
        formats: true,
        volume: true,
        prices: {
          orderBy: { seenAt: "asc" },
          select: { format: true, price: true, market: true, seenAt: true },
        },
      },
    }),
    db.appSetting.findMany({ where: { key: { startsWith: "kdp.sales." } } }),
    db.kdpTitleAlias.findMany({
      select: { account: true, titleKey: true, bookId: true, title: true },
    }),
    db.kdpBook.groupBy({ by: ["account"], _max: { importedAt: true } }),
  ]);
  const aliasOf = new Map(aliases.map((a) => [`${a.account}:${a.titleKey}`, a]));
  const booksImportedAt: SalesData["booksImportedAt"] = {};
  for (const group of bookImports) {
    if (group._max.importedAt) {
      booksImportedAt[group.account as KdpAccount] = group._max.importedAt.toISOString();
    }
  }

  const byAsin = new Map<string, string>();
  const saleBooks = new Map<string, SaleBook>();
  for (const book of books) {
    const asins = parseFormats(book.formats).flatMap((f) => (f.asin ? [f.asin] : []));
    for (const asin of asins) byAsin.set(`${book.account}:${asin}`, book.id);
    saleBooks.set(book.id, {
      key: book.id,
      title: mainTitle(book.title),
      account: book.account as KdpAccount,
      series: book.series,
      author: book.author,
      asins,
      volume: book.volume ?? volumeNumber(book.title),
    });
  }
  const prices: PriceChange[] = books.flatMap((book) =>
    book.prices.map((p) => ({
      book: book.id,
      format: p.format as KdpFormat,
      price: p.price,
      market: p.market,
      date: p.seenAt.toISOString().slice(0, 10),
    })),
  );

  const records: SaleRecord[] = rows.map((row) => {
    const account = row.account as KdpAccount;
    const asins = [row.ebookAsin, row.paperbackAsin, row.hardcoverAsin].filter(
      (asin): asin is string => asin !== null,
    );
    let book = asins.map((asin) => byAsin.get(`${account}:${asin}`)).find(Boolean);
    const alias = aliasOf.get(`${account}:${row.titleKey}`);
    if (!book && alias?.bookId && saleBooks.has(alias.bookId)) book = alias.bookId;
    if (!book) {
      book = `key:${row.titleKey}`;
      if (!saleBooks.has(book)) {
        saleBooks.set(book, {
          key: book,
          title: alias?.title ?? `Titolo non importato (${asins.join(", ") || row.titleKey})`,
          account,
          series: null,
          asins,
          titleKey: row.titleKey,
          unresolved: !alias?.title,
        });
      }
    }
    return {
      d: row.date.toISOString().slice(0, 10),
      a: account,
      m: row.marketplace,
      book,
      eu: row.ebookUnits,
      pu: row.paperbackUnits,
      hu: row.hardcoverUnits,
      k: row.kenp,
      re: row.royaltyEbook,
      rp: row.royaltyPaperback,
      rh: row.royaltyHardcover,
      rk: row.royaltyKenp,
    };
  });

  // Ads name an ASIN only: the book that owns it, else the sales title family it appears in.
  const bookByAsin = new Map<string, string>();
  for (const r of rows) {
    for (const asin of [r.ebookAsin, r.paperbackAsin, r.hardcoverAsin]) {
      if (asin) bookByAsin.set(`${r.account}:${asin}`, `key:${r.titleKey}`);
    }
  }
  for (const [key, id] of byAsin) bookByAsin.set(key, id);
  for (const r of records) {
    if (!r.book.startsWith("key:")) continue;
    const alias = aliasOf.get(`${r.a}:${r.book.slice(4)}`);
    if (alias?.bookId && saleBooks.has(alias.bookId)) {
      for (const [key, value] of bookByAsin)
        if (value === r.book) bookByAsin.set(key, alias.bookId);
    }
  }
  const { ads, fx } = await getAdRecords((account, asin) => bookByAsin.get(`${account}:${asin}`));

  const used = new Set(records.map((r) => r.book));
  for (const ad of ads) used.add(ad.book);
  const imports: SalesData["imports"] = {};
  for (const setting of settings) {
    const account = setting.key.slice("kdp.sales.".length) as KdpAccount;
    try {
      imports[account] = JSON.parse(setting.value) as SalesImportInfo;
    } catch {
      // Ignore a malformed setting: it is rewritten by the next import.
    }
  }
  for (const ad of ads) {
    if (!saleBooks.has(ad.book)) {
      saleBooks.set(ad.book, {
        key: ad.book,
        title: `Solo pubblicità (${ad.asin})`,
        account: ad.a,
        series: null,
        asins: [ad.asin],
        unresolved: true,
      });
    }
  }
  return {
    records,
    books: [...saleBooks.values()].filter((book) => used.has(book.key)),
    catalog: books.map((book) => ({
      id: book.id,
      title: mainTitle(book.title),
      account: book.account as KdpAccount,
    })),
    imports,
    booksImportedAt,
    ads,
    fx,
    prices,
  };
}

/** Plain-text summary for Claude: totals per book and month over a period. */
export async function getSalesSummary(from: string, to: string, account?: KdpAccount) {
  const { records, books, ads } = await getSalesData();
  const inRange = records.filter((r) => r.d >= from && r.d <= to && (!account || r.a === account));
  const adsInRange = ads.filter((r) => r.d >= from && r.d <= to && (!account || r.a === account));
  const spendByBook = new Map<string, number>();
  for (const ad of adsInRange) spendByBook.set(ad.book, (spendByBook.get(ad.book) ?? 0) + ad.spend);
  const adSpend = adsInRange.reduce((sum, ad) => sum + ad.spend, 0);
  const adSales = adsInRange.reduce((sum, ad) => sum + ad.sales, 0);
  const titles = new Map(books.map((b) => [b.key, b]));
  const perBook = new Map<string, { units: number; kenp: number; royalty: number }>();
  const perMonth = new Map<string, { units: number; kenp: number; royalty: number }>();
  const perMarket = new Map<string, { units: number; royalty: number }>();
  const add = <T extends { units: number; royalty: number }>(
    map: Map<string, T>,
    key: string,
    init: T,
    r: SaleRecord,
  ) => {
    const entry = map.get(key) ?? init;
    entry.units += r.eu + r.pu + r.hu;
    entry.royalty += r.re + r.rp + r.rh + r.rk;
    map.set(key, entry);
    return entry;
  };
  for (const r of inRange) {
    add(perBook, r.book, { units: 0, kenp: 0, royalty: 0 }, r).kenp += r.k;
    add(perMonth, r.d.slice(0, 7), { units: 0, kenp: 0, royalty: 0 }, r).kenp += r.k;
    add(perMarket, r.m, { units: 0, royalty: 0 }, r);
  }
  const round = (n: number) => Math.round(n * 100) / 100;
  return {
    period: { from, to, account: account ? accountLabel(account) : "tutti" },
    currency: "EUR (stime KDP; spesa Ads convertita con i tassi impostati)",
    totals: {
      ...[...perMonth.values()].reduce(
        (t, m) => ({
          units: t.units + m.units,
          kenp: t.kenp + m.kenp,
          royalty: round(t.royalty + m.royalty),
        }),
        { units: 0, kenp: 0, royalty: 0 },
      ),
      ...(adsInRange.length
        ? {
            adSpend: round(adSpend),
            adAttributedSales: round(adSales),
            acosPercent: adSales > 0 ? round((adSpend / adSales) * 100) : null,
          }
        : {}),
    },
    byMonth: Object.fromEntries(
      [...perMonth].sort().map(([k, v]) => [k, { ...v, royalty: round(v.royalty) }]),
    ),
    byMarketplace: Object.fromEntries(
      [...perMarket]
        .sort((a, b) => b[1].royalty - a[1].royalty)
        .map(([k, v]) => [k, { ...v, royalty: round(v.royalty) }]),
    ),
    byBook: [...perBook]
      .sort((a, b) => b[1].royalty - a[1].royalty)
      .map(([key, v]) => ({
        book: titles.get(key)?.title ?? key,
        bookId: key.startsWith("key:") ? null : key,
        titleKey: key.startsWith("key:") ? key.slice(4) : null,
        asins: titles.get(key)?.asins ?? parseTitleKey(key.slice(4)),
        ...v,
        royalty: round(v.royalty),
        ...(spendByBook.has(key)
          ? { adSpend: round(spendByBook.get(key)!), net: round(v.royalty - spendByBook.get(key)!) }
          : {}),
      })),
  };
}
