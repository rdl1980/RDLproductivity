import { z } from "zod";

import type { KdpAccount } from "./kdp";

/**
 * Amazon Ads "Advertised product" report: one row per day, campaign and
 * advertised ASIN, in the currency of the console (one console per
 * marketplace). Headers come in the console's language; this reads the
 * English and Italian ones. Spend and sales stay in the report currency and
 * are converted to EUR with the stored rates when shown.
 */

export type AdRow = {
  date: string;
  currency: string;
  campaign: string;
  asin: string;
  impressions: number;
  clicks: number;
  spend: number;
  sales: number;
  orders: number;
};

/** Column of the report → regex on its header (lower-cased, trimmed). */
const HEADERS: Record<keyof AdRow, RegExp> = {
  date: /^(date|data|start date|data di inizio|giorno)$/,
  currency: /^(currency|valuta)$/,
  campaign: /^(campaign name|campaign|nome della campagna|nome campagna|campagna)$/,
  asin: /^(advertised asin|asin pubblicizzato|asin)$/,
  impressions: /^(impressions|impressioni)$/,
  clicks: /^(clicks|clic|click)$/,
  spend: /^(spend|spesa|cost|costo)$/,
  sales: /^(\d+ ?day total sales|total sales|vendite totali( in \d+ giorni)?|vendite)$/,
  orders:
    /^(\d+ ?day total orders(?: \(#\))?|total orders(?: \(#\))?|ordini totali( in \d+ giorni)?(?: \(n\.\))?)$/,
};

const REQUIRED: (keyof AdRow)[] = ["date", "campaign", "asin", "spend"];

export type HeaderMap = Partial<Record<keyof AdRow, number>>;

/** Which column holds what; null when the required ones are missing. */
export function mapHeaders(headers: string[]): HeaderMap | null {
  const map: HeaderMap = {};
  headers.forEach((raw, index) => {
    const header = raw.trim().toLowerCase().replace(/\s+/g, " ");
    for (const key of Object.keys(HEADERS) as (keyof AdRow)[]) {
      if (map[key] === undefined && HEADERS[key].test(header)) map[key] = index;
    }
  });
  return REQUIRED.every((key) => map[key] !== undefined) ? map : null;
}

/** Whether the headers are Italian: decides how an ambiguous "01/02/2026" is read. */
export function isItalianReport(headers: string[]): boolean {
  return headers.some((h) => /^(data|spesa|impressioni|clic|valuta)$/i.test(h.trim()));
}

/** "2026-10-01", "01/10/2026" (dd/mm with `dayFirst`), "10/01/2026", "Oct 1, 2026", Excel dates. */
export function parseReportDate(value: unknown, dayFirst: boolean): string | null {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }
  const text = String(value ?? "").trim();
  let match = /^(\d{4})-(\d{2})-(\d{2})/.exec(text);
  if (match) return check(match[1], match[2], match[3]);
  match = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(text);
  if (match) {
    const [, a, b, y] = match;
    return dayFirst ? check(y, b, a) : check(y, a, b);
  }
  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString().slice(0, 10);
}

function check(y: string, m: string, d: string): string | null {
  const key = `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
  const date = new Date(`${key}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === key ? key : null;
}

/** "1.234,56", "1,234.56", "€12,30", "$1.5", "-" → number. */
export function parseAmount(value: unknown): number {
  if (typeof value === "number") return value;
  const text = String(value ?? "")
    .replace(/[^\d,.-]/g, "")
    .trim();
  if (!text) return 0;
  const lastComma = text.lastIndexOf(",");
  const lastDot = text.lastIndexOf(".");
  // The last separator is the decimal one; the other is grouping.
  const normalized =
    lastComma > lastDot ? text.replace(/\./g, "").replace(",", ".") : text.replace(/,/g, "");
  const number = Number(normalized);
  return Number.isFinite(number) ? number : 0;
}

/** Lines of a CSV with "," or ";" separators and quoted fields. */
export function parseCsv(text: string): string[][] {
  const first = text.split(/\r?\n/, 1)[0] ?? "";
  const separator = (first.match(/;/g) ?? []).length > (first.match(/,/g) ?? []).length ? ";" : ",";
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (quoted) {
      if (char === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (char === '"') quoted = false;
      else field += char;
    } else if (char === '"') quoted = true;
    else if (char === separator) {
      row.push(field);
      field = "";
    } else if (char === "\n" || char === "\r") {
      if (char === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else field += char;
  }
  if (field !== "" || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((cell) => cell.trim() !== ""));
}

export type ParsedReport = { rows: AdRow[]; skipped: number; from: string; to: string };

/** Turns the report's cells (header row first) into rows; invalid lines are counted, not kept. */
export function parseReport(table: unknown[][]): ParsedReport | { error: string } {
  const headers = (table[0] ?? []).map((cell) => String(cell ?? ""));
  const map = mapHeaders(headers);
  if (!map) {
    return {
      error:
        "Non riconosco le colonne: serve il report «Prodotto pubblicizzato» della console Amazon Ads, con data, campagna, ASIN pubblicizzato e spesa.",
    };
  }
  const dayFirst = isItalianReport(headers);
  const cell = (line: unknown[], key: keyof AdRow) =>
    map[key] === undefined ? undefined : line[map[key]!];
  const rows: AdRow[] = [];
  let skipped = 0;
  for (const line of table.slice(1)) {
    const date = parseReportDate(cell(line, "date"), dayFirst);
    const asin = String(cell(line, "asin") ?? "")
      .trim()
      .toUpperCase();
    if (!date || !/^[A-Z0-9]{10}$/.test(asin)) {
      skipped++;
      continue;
    }
    rows.push({
      date,
      currency:
        String(cell(line, "currency") ?? "EUR")
          .trim()
          .toUpperCase() || "EUR",
      campaign: String(cell(line, "campaign") ?? "").trim() || "(senza nome)",
      asin,
      impressions: Math.round(parseAmount(cell(line, "impressions"))),
      clicks: Math.round(parseAmount(cell(line, "clicks"))),
      spend: parseAmount(cell(line, "spend")),
      sales: parseAmount(cell(line, "sales")),
      orders: Math.round(parseAmount(cell(line, "orders"))),
    });
  }
  if (rows.length === 0) return { error: "Nessuna riga valida nel report." };
  const dates = rows.map((r) => r.date).sort();
  return { rows: mergeDuplicates(rows), skipped, from: dates[0], to: dates[dates.length - 1] };
}

/** The same day, campaign and ASIN can repeat (e.g. several SKUs): one row each. */
function mergeDuplicates(rows: AdRow[]): AdRow[] {
  const byKey = new Map<string, AdRow>();
  for (const row of rows) {
    const key = `${row.date}|${row.currency}|${row.campaign}|${row.asin}`;
    const existing = byKey.get(key);
    if (!existing) byKey.set(key, { ...row });
    else {
      existing.impressions += row.impressions;
      existing.clicks += row.clicks;
      existing.spend += row.spend;
      existing.sales += row.sales;
      existing.orders += row.orders;
    }
  }
  return [...byKey.values()];
}

export const adRowSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  currency: z.string().regex(/^[A-Z]{3}$/),
  campaign: z.string().min(1).max(300),
  asin: z.string().regex(/^[A-Z0-9]{10}$/),
  impressions: z.number().int().min(0),
  clicks: z.number().int().min(0),
  spend: z.number().min(0).max(1_000_000),
  sales: z.number().min(0).max(10_000_000),
  orders: z.number().int().min(0),
});

// --- Currencies ----------------------------------------------------------------

/** EUR per unit of currency; rough defaults, editable by the user. */
export const DEFAULT_FX: Record<string, number> = {
  EUR: 1,
  USD: 0.92,
  GBP: 1.17,
  CAD: 0.67,
  AUD: 0.6,
  JPY: 0.0061,
  MXN: 0.05,
  BRL: 0.17,
  INR: 0.011,
  SEK: 0.088,
  PLN: 0.23,
};

export const fxSchema = z.record(z.string().regex(/^[A-Z]{3}$/), z.number().positive().max(1000));

export function toEur(amount: number, currency: string, fx: Record<string, number>): number {
  return amount * (fx[currency] ?? DEFAULT_FX[currency] ?? 1);
}

// --- Records for the dashboard ---------------------------------------------------

/** One ad row as sent to the dashboard, already in EUR, resolved to a sales book key. */
export type AdRecord = {
  d: string;
  a: KdpAccount;
  /** Sales book key ("KdpBook id" or "key:<titleKey>") or "asin:<asin>" when unknown. */
  book: string;
  asin: string;
  spend: number;
  sales: number;
  clicks: number;
  impressions: number;
  orders: number;
};

export type AdSums = {
  spend: number;
  sales: number;
  clicks: number;
  impressions: number;
  orders: number;
};

export function emptyAdSums(): AdSums {
  return { spend: 0, sales: 0, clicks: 0, impressions: 0, orders: 0 };
}

export function sumAds(records: AdRecord[]): AdSums {
  const sums = emptyAdSums();
  for (const r of records) {
    sums.spend += r.spend;
    sums.sales += r.sales;
    sums.clicks += r.clicks;
    sums.impressions += r.impressions;
    sums.orders += r.orders;
  }
  return sums;
}

/** Advertising cost of sales: spend over attributed sales, null without sales. */
export function acos(sums: AdSums): number | null {
  return sums.sales > 0 ? (sums.spend / sums.sales) * 100 : null;
}
