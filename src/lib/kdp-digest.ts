/**
 * Telegram digests of the KDP sales: the evening summary of the day and the
 * daily anomaly check (a book that stopped selling, KENP falling, ads that
 * spend without sales). Pure functions over the dashboard records, tested.
 */
import { escapeHtml } from "./content-reminder";
import { accountLabel, KDP_ACCOUNT_VALUES, type KdpAccount } from "./kdp";
import type { AdRecord } from "./kdp-ads";
import { addDays, type SaleBook, type SaleRecord } from "./kdp-sales";

const units = (r: SaleRecord) => r.eu + r.pu + r.hu;
const royalty = (r: SaleRecord) => r.re + r.rp + r.rh + r.rk;

export const euro = (value: number) =>
  `${value.toLocaleString("it-IT", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
    useGrouping: "always",
  })} €`;

type Totals = { units: number; royalty: number; kenp: number };
const zero = (): Totals => ({ units: 0, royalty: 0, kenp: 0 });

function totals(records: SaleRecord[], keep: (r: SaleRecord) => boolean): Totals {
  const t = zero();
  for (const r of records) {
    if (!keep(r)) continue;
    t.units += units(r);
    t.royalty += royalty(r);
    t.kenp += r.k;
  }
  return t;
}

const signed = (now: number, before: number) => {
  if (before === 0) return now === 0 ? "=" : "nuovo";
  const pct = Math.round(((now - before) / before) * 100);
  return pct === 0 ? "=" : `${pct > 0 ? "+" : ""}${pct}%`;
};

export type DayLine = {
  account: KdpAccount;
  today: Totals;
  lastWeek: Totals;
  month: Totals;
};

/** Per account: the day, the same weekday a week before and the month so far. */
export function daySummary(records: SaleRecord[], day: string): DayLine[] {
  const weekBefore = addDays(day, -7);
  const monthStart = `${day.slice(0, 7)}-01`;
  return KDP_ACCOUNT_VALUES.map((account) => ({
    account,
    today: totals(records, (r) => r.a === account && r.d === day),
    lastWeek: totals(records, (r) => r.a === account && r.d === weekBefore),
    month: totals(records, (r) => r.a === account && r.d >= monthStart && r.d <= day),
  })).filter((l) => l.today.units || l.today.kenp || l.month.units || l.month.kenp);
}

/** The book with the highest royalty on the day, with its units. */
export function bestBook(
  records: SaleRecord[],
  books: SaleBook[],
  day: string,
): { title: string; units: number; royalty: number } | null {
  const byBook = new Map<string, Totals>();
  for (const r of records) {
    if (r.d !== day) continue;
    const t = byBook.get(r.book) ?? zero();
    t.units += units(r);
    t.royalty += royalty(r);
    byBook.set(r.book, t);
  }
  let best: [string, Totals] | null = null;
  for (const entry of byBook) if (!best || entry[1].royalty > best[1].royalty) best = entry;
  if (!best || best[1].royalty <= 0) return null;
  const title = books.find((b) => b.key === best[0])?.title ?? best[0];
  return { title, units: best[1].units, royalty: best[1].royalty };
}

const dayLabel = (day: string) => `${day.slice(8, 10)}/${day.slice(5, 7)}`;

/** Evening message (HTML). `freshness` names accounts whose data is not of today. */
export function summaryMessage(
  records: SaleRecord[],
  books: SaleBook[],
  day: string,
  stale: KdpAccount[],
  url: string,
): string {
  const lines = daySummary(records, day);
  const out = [`<b>Vendite KDP di oggi (${dayLabel(day)})</b>`];
  if (lines.length === 0) out.push("Nessuna vendita registrata oggi né questo mese.");
  for (const l of lines) {
    out.push(
      `• <b>${escapeHtml(accountLabel(l.account))}</b>: ${l.today.units} copie, ${euro(l.today.royalty)}` +
        (l.today.kenp ? `, ${l.today.kenp} pagine KENP` : "") +
        ` (vs sett. scorsa ${signed(l.today.royalty, l.lastWeek.royalty)}) · mese ${euro(l.month.royalty)}`,
    );
  }
  const total = lines.reduce((s, l) => s + l.today.royalty, 0);
  if (lines.length > 1) out.push(`Totale oggi: <b>${euro(total)}</b>`);
  const best = bestBook(records, books, day);
  if (best) {
    out.push(`Il migliore: ${escapeHtml(best.title)} (${best.units} copie, ${euro(best.royalty)})`);
  }
  if (stale.length) {
    out.push(
      `<i>Dati non aggiornati oggi per ${stale.map((a) => escapeHtml(accountLabel(a))).join(", ")}.</i>`,
    );
  }
  out.push(`<a href="${escapeHtml(url)}">Apri Vendite</a>`);
  return out.join("\n");
}

// --- Anomalies ---------------------------------------------------------------------

export type AnomalyThresholds = {
  /** Days without a copy after selling: a book "stopped". */
  stallDays: number;
  /** Copies in the 30 days before the stall, for the book to count. */
  stallMinUnits: number;
  /** KENP drop, week on week, in percent (50 = halved). */
  kenpDropPct: number;
  /** Ad spend (EUR, 7 days) with no copies of the book. */
  adSpendEur: number;
};

export const DEFAULT_THRESHOLDS: AnomalyThresholds = {
  stallDays: 14,
  stallMinUnits: 3,
  kenpDropPct: 50,
  adSpendEur: 10,
};

/** KENP pages a book needs the week before, for a drop to mean something. */
const KENP_MIN_PAGES = 300;

export type Anomaly = { key: string; text: string };

/**
 * What looks wrong as of `day`, only for the accounts in `fresh` (a stale
 * import would read as "stopped selling"). `key` identifies the alert, so
 * the same one is not repeated every day.
 */
export function anomalies(
  records: SaleRecord[],
  ads: AdRecord[],
  books: SaleBook[],
  day: string,
  fresh: ReadonlySet<KdpAccount>,
  t: AnomalyThresholds = DEFAULT_THRESHOLDS,
): Anomaly[] {
  const title = (key: string) => books.find((b) => b.key === key)?.title ?? key;
  const out: Anomaly[] = [];
  const stallFrom = addDays(day, -t.stallDays + 1);
  const beforeFrom = addDays(stallFrom, -30);
  const week = addDays(day, -6);
  const prevWeek = addDays(week, -7);

  type Agg = {
    account: KdpAccount;
    recent: number;
    before: number;
    kenp: number;
    kenpPrev: number;
    units7: number;
  };
  const byBook = new Map<string, Agg>();
  for (const r of records) {
    if (!fresh.has(r.a) || r.d > day) continue;
    const a = byBook.get(r.book) ?? {
      account: r.a,
      recent: 0,
      before: 0,
      kenp: 0,
      kenpPrev: 0,
      units7: 0,
    };
    if (r.d >= stallFrom) a.recent += units(r);
    else if (r.d >= beforeFrom) a.before += units(r);
    if (r.d >= week) {
      a.kenp += r.k;
      a.units7 += units(r);
    } else if (r.d >= prevWeek) a.kenpPrev += r.k;
    byBook.set(r.book, a);
  }
  for (const [book, a] of byBook) {
    const who = escapeHtml(accountLabel(a.account));
    if (a.before >= t.stallMinUnits && a.recent === 0) {
      out.push({
        key: `stall:${book}`,
        text: `📉 <b>${escapeHtml(title(book))}</b> (${who}): nessuna copia da ${t.stallDays} giorni, ${a.before} nei 30 prima.`,
      });
    }
    if (a.kenpPrev >= KENP_MIN_PAGES && a.kenp <= a.kenpPrev * (1 - t.kenpDropPct / 100)) {
      const pct = Math.round((1 - a.kenp / a.kenpPrev) * 100);
      out.push({
        key: `kenp:${book}`,
        text: `📖 <b>${escapeHtml(title(book))}</b> (${who}): KENP -${pct}% (${a.kenp} pagine negli ultimi 7 giorni, ${a.kenpPrev} nei 7 prima).`,
      });
    }
  }
  const spend = new Map<string, { account: KdpAccount; spend: number }>();
  for (const ad of ads) {
    if (!fresh.has(ad.a) || ad.d < week || ad.d > day) continue;
    const s = spend.get(ad.book) ?? { account: ad.a, spend: 0 };
    s.spend += ad.spend;
    spend.set(ad.book, s);
  }
  for (const [book, s] of spend) {
    if (s.spend <= t.adSpendEur || (byBook.get(book)?.units7 ?? 0) > 0) continue;
    out.push({
      key: `ads:${book}`,
      text: `💸 <b>${escapeHtml(title(book))}</b> (${escapeHtml(accountLabel(s.account))}): ${euro(s.spend)} di Ads in 7 giorni e nessuna copia.`,
    });
  }
  return out;
}

/** Alerts not sent in the last `days` days, by key. */
export function unsentAnomalies(
  found: Anomaly[],
  sent: Record<string, string>,
  day: string,
  days = 7,
): Anomaly[] {
  const since = addDays(day, -days + 1);
  return found.filter((a) => !sent[a.key] || sent[a.key] < since);
}
