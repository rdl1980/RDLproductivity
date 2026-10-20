/**
 * KDP sales analytics: the import payload produced by the Reports collector,
 * and pure aggregation helpers used by the dashboard (client) and MCP (server).
 * Dates are calendar days "YYYY-MM-DD" in KDP's marketplace time, handled in UTC.
 */
import { z } from "zod";

import type { KdpAccount } from "@/lib/kdp";

// --- Sources (formats + KENP) --------------------------------------------------

export const SALE_SOURCES = ["ebook", "paperback", "hardcover", "kenp"] as const;
export type SaleSource = (typeof SALE_SOURCES)[number];

export const SOURCE_LABELS: Record<SaleSource, string> = {
  ebook: "eBook",
  paperback: "Cartaceo",
  hardcover: "Copertina rigida",
  kenp: "KENP (pagine lette)",
};

/** Categorical slot per source: fixed, so a filter never repaints the others. */
export const SOURCE_COLORS: Record<SaleSource, string> = {
  ebook: "var(--series-1)",
  paperback: "var(--series-2)",
  hardcover: "var(--series-3)",
  kenp: "var(--series-4)",
};

// --- Import payload ------------------------------------------------------------

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data non valida.");
const count = z.number().int().min(0).max(10_000_000);
const money = z.number().min(-1_000_000).max(10_000_000);

/** [date, marketplace, titleKey, ebookUnits, paperbackUnits, hardcoverUnits, kenp,
 *  royalty, royaltyEbook, royaltyPaperback, royaltyHardcover, royaltyKenp] */
export const saleRowSchema = z.tuple([
  day,
  z.string().regex(/^Amazon\.[a-z.]{2,8}$/, "Marketplace non valido."),
  z.string().min(1).max(200),
  count,
  count,
  count,
  count,
  money,
  money,
  money,
  money,
  money,
]);

export const salesPayloadSchema = z
  .object({
    v: z.literal(1),
    kind: z.literal("sales"),
    currency: z.literal("EUR"),
    from: day,
    to: day,
    generatedAt: z.string().max(40).optional(),
    rows: z.array(saleRowSchema).max(200_000),
  })
  .refine((p) => p.from <= p.to, "Intervallo di date non valido.");

export type SalesPayload = z.infer<typeof salesPayloadSchema>;

/** Decodes the URL fragment: "gz.<base64url gzip JSON>" or plain base64url JSON. */
/** Decompressed size cap: far above years of rows, far below a gzip bomb. */
const MAX_DECODED_BYTES = 64 * 1024 * 1024;

export async function decodeSalesHash(hash: string): Promise<unknown> {
  const raw = hash.replace(/^#/, "");
  const gzip = raw.startsWith("gz.");
  const data = (gzip ? raw.slice(3) : raw).replace(/-/g, "+").replace(/_/g, "/");
  const bytes = Uint8Array.from(atob(data), (char) => char.charCodeAt(0));
  if (!gzip) return JSON.parse(new TextDecoder().decode(bytes));

  const reader = new Response(bytes).body!.pipeThrough(new DecompressionStream("gzip")).getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_DECODED_BYTES) {
      await reader.cancel();
      throw new Error("Payload too large");
    }
    chunks.push(value);
  }
  const all = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    all.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return JSON.parse(new TextDecoder().decode(all));
}

export async function encodeSalesHash(payload: unknown): Promise<string> {
  const stream = new Response(JSON.stringify(payload)).body!.pipeThrough(
    new CompressionStream("gzip"),
  );
  const bytes = new Uint8Array(await new Response(stream).arrayBuffer());
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return `gz.${btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")}`;
}

/** "DIGITAL=B0A:PRINT=B0B:HARDCOVER=:" → the ASIN of each format. */
export function parseTitleKey(key: string): {
  ebook: string | null;
  paperback: string | null;
  hardcover: string | null;
} {
  const pick = (name: string) => new RegExp(`${name}=([A-Z0-9]{10})`).exec(key)?.[1] ?? null;
  return { ebook: pick("DIGITAL"), paperback: pick("PRINT"), hardcover: pick("HARDCOVER") };
}

export function marketplaceLabel(marketplace: string): string {
  return marketplace.replace(/^Amazon\./, "");
}

// --- Records and aggregation ----------------------------------------------------

/** One sales row as sent to the dashboard. `book` is the KdpBook id, or "key:<titleKey>". */
export type SaleRecord = {
  d: string;
  a: KdpAccount;
  m: string;
  book: string;
  eu: number;
  pu: number;
  hu: number;
  k: number;
  re: number;
  rp: number;
  rh: number;
  rk: number;
};

export type SaleBook = {
  key: string;
  title: string;
  account: KdpAccount;
  series: string | null;
  asins: string[];
};

export type Sums = {
  royalty: number;
  units: number;
  kenp: number;
  bySource: Record<SaleSource, { royalty: number; units: number }>;
};

export function emptySums(): Sums {
  return {
    royalty: 0,
    units: 0,
    kenp: 0,
    bySource: {
      ebook: { royalty: 0, units: 0 },
      paperback: { royalty: 0, units: 0 },
      hardcover: { royalty: 0, units: 0 },
      kenp: { royalty: 0, units: 0 },
    },
  };
}

/** Adds a record to `sums`, counting only the selected sources. */
export function addRecord(sums: Sums, r: SaleRecord, sources: ReadonlySet<SaleSource>) {
  const parts: [SaleSource, number, number][] = [
    ["ebook", r.re, r.eu],
    ["paperback", r.rp, r.pu],
    ["hardcover", r.rh, r.hu],
    ["kenp", r.rk, 0],
  ];
  for (const [source, royalty, units] of parts) {
    if (!sources.has(source)) continue;
    sums.bySource[source].royalty += royalty;
    sums.bySource[source].units += units;
    sums.royalty += royalty;
    sums.units += units;
  }
  if (sources.has("kenp")) sums.kenp += r.k;
  return sums;
}

export function sumRecords(records: SaleRecord[], sources: ReadonlySet<SaleSource>): Sums {
  return records.reduce((sums, r) => addRecord(sums, r, sources), emptySums());
}

export type SalesFilter = {
  from: string;
  to: string;
  account: KdpAccount | "all";
  markets: ReadonlySet<string>;
  book: string | null;
};

export function filterRecords(records: SaleRecord[], f: SalesFilter): SaleRecord[] {
  return records.filter(
    (r) =>
      r.d >= f.from &&
      r.d <= f.to &&
      (f.account === "all" || r.a === f.account) &&
      (f.markets.size === 0 || f.markets.has(r.m)) &&
      (f.book === null || r.book === f.book),
  );
}

// --- Dates -------------------------------------------------------------------------

const DAY = 24 * 60 * 60 * 1000;
const toDate = (key: string) => new Date(`${key}T00:00:00Z`);
const toKey = (date: Date) => date.toISOString().slice(0, 10);

export function addDays(key: string, days: number): string {
  return toKey(new Date(toDate(key).getTime() + days * DAY));
}

export function daysBetween(from: string, to: string): number {
  return Math.round((toDate(to).getTime() - toDate(from).getTime()) / DAY);
}

/** The equally long period just before [from, to]. */
export function previousPeriod(from: string, to: string): { from: string; to: string } {
  const length = daysBetween(from, to) + 1;
  return { from: addDays(from, -length), to: addDays(from, -1) };
}

export const GRANULARITIES = [
  { value: "day", label: "Giorno" },
  { value: "week", label: "Settimana" },
  { value: "month", label: "Mese" },
] as const;
export type Granularity = (typeof GRANULARITIES)[number]["value"];

export function autoGranularity(from: string, to: string): Granularity {
  const days = daysBetween(from, to) + 1;
  return days <= 62 ? "day" : days <= 370 ? "week" : "month";
}

/** First day of the bucket containing `key` (weeks start on Monday). */
export function bucketStart(key: string, granularity: Granularity): string {
  if (granularity === "day") return key;
  if (granularity === "month") return `${key.slice(0, 7)}-01`;
  const date = toDate(key);
  return addDays(key, -((date.getUTCDay() + 6) % 7));
}

export function nextBucket(start: string, granularity: Granularity): string {
  if (granularity === "day") return addDays(start, 1);
  if (granularity === "week") return addDays(start, 7);
  const date = toDate(start);
  return toKey(new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1)));
}

export type Bucket = { start: string; sums: Sums };

/** Every bucket from `from` to `to`, empty ones included, in order. */
export function timeSeries(
  records: SaleRecord[],
  from: string,
  to: string,
  granularity: Granularity,
  sources: ReadonlySet<SaleSource>,
): Bucket[] {
  const buckets = new Map<string, Sums>();
  for (let start = bucketStart(from, granularity); start <= to;) {
    buckets.set(start, emptySums());
    start = nextBucket(start, granularity);
  }
  for (const r of records) {
    const sums = buckets.get(bucketStart(r.d, granularity));
    if (sums) addRecord(sums, r, sources);
  }
  return [...buckets].map(([start, sums]) => ({ start, sums }));
}

export function groupSums<K extends string>(
  records: SaleRecord[],
  key: (r: SaleRecord) => K,
  sources: ReadonlySet<SaleSource>,
): Map<K, Sums> {
  const groups = new Map<K, Sums>();
  for (const r of records) {
    const k = key(r);
    const sums = groups.get(k) ?? emptySums();
    groups.set(k, addRecord(sums, r, sources));
  }
  return groups;
}

/** Average royalty per weekday (Monday first) over the days of the period. */
export function weekdayAverages(
  records: SaleRecord[],
  from: string,
  to: string,
  sources: ReadonlySet<SaleSource>,
): number[] {
  const totals = Array<number>(7).fill(0);
  const days = Array<number>(7).fill(0);
  for (let key = from; key <= to; key = addDays(key, 1)) {
    days[(toDate(key).getUTCDay() + 6) % 7]++;
  }
  for (const r of records) {
    totals[(toDate(r.d).getUTCDay() + 6) % 7] += sumRecords([r], sources).royalty;
  }
  return totals.map((total, i) => (days[i] ? total / days[i] : 0));
}

/**
 * Cumulative units of each book from its first sale (day 0) to `days`, over
 * all of its history: the launch curve.
 */
export function launchCurve(
  records: SaleRecord[],
  book: string,
  days: number,
  sources: ReadonlySet<SaleSource>,
): number[] {
  const own = records.filter((r) => r.book === book && sumRecords([r], sources).units > 0);
  if (own.length === 0) return [];
  const first = own.reduce((min, r) => (r.d < min ? r.d : min), own[0].d);
  const perDay = Array<number>(days + 1).fill(0);
  for (const r of own) {
    const offset = daysBetween(first, r.d);
    if (offset <= days) perDay[offset] += sumRecords([r], sources).units;
  }
  let total = 0;
  return perDay.map((units) => (total += units));
}

/** Percentage change, or null when there is no base to compare with. */
export function change(current: number, previous: number): number | null {
  if (previous === 0) return current === 0 ? 0 : null;
  return ((current - previous) / Math.abs(previous)) * 100;
}

// --- Formatting -------------------------------------------------------------------

const euro = new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" });
const euroCompact = new Intl.NumberFormat("it-IT", {
  style: "currency",
  currency: "EUR",
  notation: "compact",
  maximumFractionDigits: 1,
});
const integer = new Intl.NumberFormat("it-IT");
const compact = new Intl.NumberFormat("it-IT", { notation: "compact", maximumFractionDigits: 1 });

export const formatEuro = (value: number) => euro.format(value);
export const formatEuroCompact = (value: number) =>
  Math.abs(value) < 1000 ? euro.format(value) : euroCompact.format(value);
export const formatInt = (value: number) => integer.format(Math.round(value));
export const formatCompact = (value: number) =>
  Math.abs(value) < 1000 ? integer.format(Math.round(value)) : compact.format(value);

const dayLabel = new Intl.DateTimeFormat("it-IT", {
  day: "numeric",
  month: "short",
  timeZone: "UTC",
});
const monthLabel = new Intl.DateTimeFormat("it-IT", {
  month: "short",
  year: "2-digit",
  timeZone: "UTC",
});

export function bucketLabel(start: string, granularity: Granularity): string {
  const date = toDate(start);
  return granularity === "month" ? monthLabel.format(date) : dayLabel.format(date);
}
