import type { KdpAccount } from "./kdp";

/**
 * Money side of KDP: when royalties get paid, and how a month is doing
 * against its target. Dates are "YYYY-MM-DD" / "YYYY-MM" strings in UTC.
 */

/** KDP pays a month's royalties about 60 days after the month ends. */
export const PAYOUT_DELAY_MONTHS = 2;

/** One marketplace's royalty within a month: KDP pays each marketplace with its own transfer. */
export type MarketRoyalty = { marketplace: string; royalty: number };

export type MonthlyRoyalty = {
  month: string;
  account: KdpAccount;
  royalty: number;
  /** Per marketplace, largest first (absent when not loaded). */
  markets?: MarketRoyalty[];
};

/**
 * Currency each Amazon marketplace pays in. The amounts here are KDP's EUR
 * estimates; the transfer arrives in this currency (or converted by the bank).
 */
export const PAYOUT_CURRENCY: Record<string, string> = {
  "Amazon.com": "USD",
  "Amazon.co.uk": "GBP",
  "Amazon.de": "EUR",
  "Amazon.fr": "EUR",
  "Amazon.it": "EUR",
  "Amazon.es": "EUR",
  "Amazon.nl": "EUR",
  "Amazon.ie": "EUR",
  "Amazon.com.be": "EUR",
  "Amazon.co.jp": "JPY",
  "Amazon.ca": "CAD",
  "Amazon.com.au": "AUD",
  "Amazon.com.br": "BRL",
  "Amazon.com.mx": "MXN",
  "Amazon.in": "INR",
  "Amazon.pl": "PLN",
  "Amazon.se": "SEK",
};

export function payoutCurrency(marketplace: string): string {
  return PAYOUT_CURRENCY[marketplace] ?? "—";
}

export type Transfer = MarketRoyalty & { currency: string };

/** The transfers behind a payout: one per marketplace with royalties, largest first. */
export function payoutTransfers(markets: MarketRoyalty[] | undefined): Transfer[] {
  return (markets ?? [])
    .filter((m) => Math.round(m.royalty * 100) !== 0)
    .map((m) => ({ ...m, currency: payoutCurrency(m.marketplace) }))
    .sort((a, b) => b.royalty - a.royalty || a.marketplace.localeCompare(b.marketplace));
}

export type Payout = MonthlyRoyalty & {
  /** Last day of the payment month. */
  payDate: string;
  status: "paid" | "due";
};

function lastDayOfMonth(month: string, offset = 0): string {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y, m + offset, 0)).toISOString().slice(0, 10);
}

/** Expected payments, newest first; paid when the pay date is before today. */
export function payoutSchedule(monthly: MonthlyRoyalty[], today: string): Payout[] {
  return monthly
    .filter((m) => m.royalty !== 0)
    .map((m) => {
      const payDate = lastDayOfMonth(m.month, PAYOUT_DELAY_MONTHS);
      const status: Payout["status"] = payDate < today ? "paid" : "due";
      return { ...m, payDate, status };
    })
    .sort((a, b) => b.month.localeCompare(a.month) || a.account.localeCompare(b.account));
}

/** Sum of the payments still to come, per pay month, with how many transfers make it up. */
export function duePayouts(
  payouts: Payout[],
): { payDate: string; royalty: number; transfers: number }[] {
  const byDate = new Map<string, { royalty: number; transfers: number }>();
  for (const p of payouts) {
    if (p.status !== "due") continue;
    const entry = byDate.get(p.payDate) ?? { royalty: 0, transfers: 0 };
    entry.royalty += p.royalty;
    entry.transfers += payoutTransfers(p.markets).length;
    byDate.set(p.payDate, entry);
  }
  return [...byDate]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([payDate, e]) => ({ payDate, royalty: e.royalty, transfers: e.transfers }));
}

export type GoalProgress = {
  target: number;
  royalty: number;
  percent: number;
  /** Royalty expected at month end at the current daily pace. */
  projected: number;
  daysElapsed: number;
  daysInMonth: number;
};

/** How the month is doing against a target: `today` is within the month. */
export function goalProgress(target: number, royalty: number, today: string): GoalProgress {
  const [y, m, d] = today.split("-").map(Number);
  const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const daysElapsed = Math.min(Math.max(d, 1), daysInMonth);
  return {
    target,
    royalty,
    percent: target > 0 ? Math.round((royalty / target) * 100) : 0,
    projected: (royalty / daysElapsed) * daysInMonth,
    daysElapsed,
    daysInMonth,
  };
}

/** Last day of the week starting on `start`. */
export function weekEnd(start: string): string {
  const date = new Date(`${start}T00:00:00Z`);
  return new Date(date.getTime() + 6 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
}
