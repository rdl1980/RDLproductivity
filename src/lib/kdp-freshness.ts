import { accountLabel, KDP_ACCOUNT_VALUES, type KdpAccount } from "./kdp";

/** Last import of each KDP source per account (ISO strings, null = never). */
export type KdpFreshness = Record<KdpAccount, { sales: string | null; books: string | null }>;

export const SALES_STALE_DAYS = 7;
export const BOOKS_STALE_DAYS = 30;

export type StaleSource = {
  account: KdpAccount;
  kind: "sales" | "books";
  /** Days since the last import; null when never imported. */
  days: number | null;
  message: string;
  href: string;
};

const DAY = 24 * 60 * 60 * 1000;

export function daysSince(iso: string | null, now: Date): number | null {
  if (!iso) return null;
  return Math.floor((now.getTime() - new Date(iso).getTime()) / DAY);
}

/**
 * Sources worth refreshing: sales older than a week, books older than a
 * month. An account never imported at all is not nagged about: it may not
 * exist. One never-imported source of an active account is.
 */
export function staleSources(freshness: KdpFreshness, now: Date): StaleSource[] {
  const stale: StaleSource[] = [];
  for (const account of KDP_ACCOUNT_VALUES) {
    const { sales, books } = freshness[account];
    if (!sales && !books) continue;
    const check = (
      kind: StaleSource["kind"],
      iso: string | null,
      limit: number,
      what: string,
      href: string,
    ) => {
      const days = daysSince(iso, now);
      if (days !== null && days < limit) return;
      stale.push({
        account,
        kind,
        days,
        href,
        message:
          days === null
            ? `${what} di «${accountLabel(account)}» mai importati.`
            : `${what} di «${accountLabel(account)}» aggiornati ${days} giorni fa.`,
      });
    };
    check("sales", sales, SALES_STALE_DAYS, "Vendite", "/kdp/vendite");
    check("books", books, BOOKS_STALE_DAYS, "Libri", "/kdp/libri");
  }
  return stale;
}
