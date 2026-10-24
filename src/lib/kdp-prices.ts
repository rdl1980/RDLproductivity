import type { KdpFormat } from "./kdp-books";
import { addDays, type SaleRecord } from "./kdp-sales";

/** A list price seen on the Bookshelf, as sent to the dashboard. */
export type PriceChange = {
  /** Sales book key. */
  book: string;
  format: KdpFormat;
  price: string;
  market: string | null;
  /** "YYYY-MM-DD" of the import that first saw it. */
  date: string;
};

export type PriceImpact = {
  change: PriceChange;
  previous: string | null;
  before: { unitsPerDay: number; royaltyPerDay: number };
  after: { unitsPerDay: number; royaltyPerDay: number };
  days: number;
};

const unitsOf = (r: SaleRecord) => r.eu + r.pu + r.hu;
const royaltyOf = (r: SaleRecord) => r.re + r.rp + r.rh + r.rk;

/**
 * Daily averages of a book in the `days` before each price change and the
 * `days` after it (the change day included), to judge the effect. Changes
 * are grouped per format in date order so each knows the previous price.
 */
export function priceImpacts(
  records: SaleRecord[],
  changes: PriceChange[],
  book: string,
  days = 14,
): PriceImpact[] {
  const own = records.filter((r) => r.book === book);
  const average = (from: string, to: string) => {
    const inRange = own.filter((r) => r.d >= from && r.d <= to);
    const length = Math.max(1, days);
    return {
      unitsPerDay: inRange.reduce((sum, r) => sum + unitsOf(r), 0) / length,
      royaltyPerDay: inRange.reduce((sum, r) => sum + royaltyOf(r), 0) / length,
    };
  };
  const previousByFormat = new Map<string, string>();
  return changes
    .filter((c) => c.book === book)
    .sort((a, b) => a.date.localeCompare(b.date) || a.format.localeCompare(b.format))
    .map((change) => {
      const previous = previousByFormat.get(change.format) ?? null;
      previousByFormat.set(change.format, change.price);
      return {
        change,
        previous,
        before: average(addDays(change.date, -days), addDays(change.date, -1)),
        after: average(change.date, addDays(change.date, days - 1)),
        days,
      };
    });
}
