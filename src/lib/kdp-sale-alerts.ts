/**
 * Telegram alerts for new KDP sales: what a Reports import adds over the rows
 * already stored. KDP gives units per day, title and marketplace, so a "sale"
 * is the growth of a row's units since the previous import. Pure, tested.
 */
import { escapeHtml } from "./content-reminder";

export type SaleCounts = {
  date: string;
  marketplace: string;
  titleKey: string;
  ebook: number;
  paperback: number;
  hardcover: number;
  royalty: number;
};

export type SaleAlert = SaleCounts;

const keyOf = (r: Pick<SaleCounts, "date" | "marketplace" | "titleKey">) =>
  `${r.date}|${r.marketplace}|${r.titleKey}`;

/** Days back an import may bring news from: older rows are KDP revisions, not sales. */
export const ALERT_DAYS = 7;

/**
 * Rows of `after` (from `since` on) whose units grew over `before`: the new
 * units per format and the royalty they added (never negative).
 */
export function newSales(before: SaleCounts[], after: SaleCounts[], since: string): SaleAlert[] {
  const old = new Map(before.map((r) => [keyOf(r), r]));
  const alerts: SaleAlert[] = [];
  for (const row of after) {
    if (row.date < since) continue;
    const prev = old.get(keyOf(row));
    const ebook = Math.max(0, row.ebook - (prev?.ebook ?? 0));
    const paperback = Math.max(0, row.paperback - (prev?.paperback ?? 0));
    const hardcover = Math.max(0, row.hardcover - (prev?.hardcover ?? 0));
    if (ebook + paperback + hardcover === 0) continue;
    const royalty = Math.max(0, Math.round((row.royalty - (prev?.royalty ?? 0)) * 100) / 100);
    alerts.push({ ...row, ebook, paperback, hardcover, royalty });
  }
  return alerts.sort(
    (a, b) => a.date.localeCompare(b.date) || a.titleKey.localeCompare(b.titleKey),
  );
}

const euro = (value: number) =>
  `${value.toLocaleString("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: "always" })} €`;

const shortDay = (day: string) => `${day.slice(8, 10)}/${day.slice(5, 7)}`;

/** "2 ebook, 1 cartaceo": the formats that sold, in Italian. */
export function unitsLabel(a: Pick<SaleAlert, "ebook" | "paperback" | "hardcover">): string {
  const parts: string[] = [];
  if (a.ebook) parts.push(`${a.ebook} ebook`);
  if (a.paperback) parts.push(`${a.paperback} ${a.paperback === 1 ? "cartaceo" : "cartacei"}`);
  if (a.hardcover) parts.push(`${a.hardcover} copertina rigida`);
  return parts.join(", ");
}

/** Telegram message (HTML) for one account's new sales, under the 4096-character limit. */
export function saleAlertMessage(
  alerts: SaleAlert[],
  account: string,
  titleOf: (titleKey: string) => string,
  url: string,
): string {
  const units = alerts.reduce((s, a) => s + a.ebook + a.paperback + a.hardcover, 0);
  const royalty = alerts.reduce((s, a) => s + a.royalty, 0);
  const head = `<b>${units === 1 ? "Nuova vendita" : `${units} nuove vendite`} · ${escapeHtml(account)}</b>`;
  const lines = alerts.map(
    (a) =>
      `• ${escapeHtml(titleOf(a.titleKey))}: ${unitsLabel(a)} (${a.marketplace.replace(/^Amazon\./, "")}, ${shortDay(a.date)})`,
  );
  const foot = [
    "",
    `Royalty stimate: +${euro(royalty)}`,
    `<a href="${escapeHtml(url)}">Apri Vendite</a>`,
  ];
  const kept: string[] = [];
  let size = head.length + foot.join("\n").length + 10;
  for (const line of lines) {
    if (size + line.length + 1 > 4000) {
      kept.push(`… e altre ${lines.length - kept.length} righe`);
      break;
    }
    kept.push(line);
    size += line.length + 1;
  }
  return [head, ...kept, ...foot].join("\n");
}
