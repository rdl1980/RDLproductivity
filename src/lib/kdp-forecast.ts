import { addDays, type SaleRecord, type SaleSource, sumRecords } from "./kdp-sales";

/**
 * Forecast of the current month's royalty from what the month has done so
 * far and from the last three full months.
 */

export type MonthForecast = {
  /** "YYYY-MM" of the month forecast. */
  month: string;
  daysInMonth: number;
  /** Royalty of the month so far, up to the last day with data. */
  monthToDate: number;
  /** Last day of the month with data (null when none yet). */
  dataThrough: string | null;
  /** Days of the month covered by data. */
  daysWithData: number;
  /** Month end at the pace of the days with data (null without data). */
  pace: number | null;
  /** The previous full months with data, oldest first, up to three. */
  history: { month: string; royalty: number }[];
  /** What the history alone would give this month, trend included (null without history). */
  baseline: number | null;
  /** Month-over-month change of the trend line in percent of the average (null with one month). */
  trendPercent: number | null;
  /** The forecast: month to date plus the rest at a mix of pace and baseline. */
  forecast: number;
};

const HISTORY_MONTHS = 3;

function shiftMonth(month: string, step: number): string {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1 + step, 1)).toISOString().slice(0, 7);
}

function daysIn(month: string): number {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

const royaltyOf = (records: SaleRecord[], sources: ReadonlySet<SaleSource>) =>
  sumRecords(records, sources).royalty;

/**
 * Least-squares line through `values` (one per month, oldest first),
 * evaluated at the next month; never below zero.
 */
export function trendNext(values: number[]): { next: number; slope: number } {
  const n = values.length;
  if (n === 0) return { next: 0, slope: 0 };
  if (n === 1) return { next: values[0], slope: 0 };
  const xMean = (n - 1) / 2;
  const yMean = values.reduce((a, b) => a + b, 0) / n;
  let num = 0;
  let den = 0;
  values.forEach((y, x) => {
    num += (x - xMean) * (y - yMean);
    den += (x - xMean) ** 2;
  });
  const slope = den ? num / den : 0;
  const intercept = yMean - slope * xMean;
  return { next: Math.max(0, intercept + slope * n), slope };
}

/**
 * The rest of the month is forecast at a daily rate between the current
 * pace and the historical baseline: the pace weighs as much of the month as
 * the data covers, so early in the month history leads and later the month's
 * own numbers do. Days after `today` that KDP has not reported yet count as
 * not covered, which keeps a late import from dragging the pace down.
 */
export function forecastMonth(
  records: SaleRecord[],
  sources: ReadonlySet<SaleSource>,
  today: string,
): MonthForecast {
  const month = today.slice(0, 7);
  const daysInMonth = daysIn(month);
  const own = records.filter((r) => r.d.slice(0, 7) === month && r.d <= today);
  const dataThrough = own.length ? own.reduce((max, r) => (r.d > max ? r.d : max), "") : null;
  const daysWithData = dataThrough ? Number(dataThrough.slice(8, 10)) : 0;
  const monthToDate = royaltyOf(own, sources);
  const pace = daysWithData ? (monthToDate / daysWithData) * daysInMonth : null;

  const firstData = records.reduce((min, r) => (min === "" || r.d < min ? r.d : min), "");
  const history: MonthForecast["history"] = [];
  for (let step = HISTORY_MONTHS; step >= 1; step--) {
    const past = shiftMonth(month, -step);
    // A month before the first report has no data, not zero sales.
    if (!firstData || firstData > `${past}-01`) continue;
    const rows = records.filter((r) => r.d.slice(0, 7) === past);
    history.push({ month: past, royalty: royaltyOf(rows, sources) });
  }
  const trend = history.length ? trendNext(history.map((h) => h.royalty)) : null;
  const baseline = trend ? trend.next : null;
  const mean = history.length ? history.reduce((sum, h) => sum + h.royalty, 0) / history.length : 0;
  const trendPercent = trend && history.length > 1 && mean > 0 ? (trend.slope / mean) * 100 : null;

  const remaining = daysInMonth - daysWithData;
  const paceRate = daysWithData ? monthToDate / daysWithData : 0;
  const baselineRate = baseline !== null ? baseline / daysInMonth : null;
  const weight = daysWithData / daysInMonth;
  const rate =
    baselineRate === null
      ? paceRate
      : daysWithData === 0
        ? baselineRate
        : weight * paceRate + (1 - weight) * baselineRate;
  return {
    month,
    daysInMonth,
    monthToDate,
    dataThrough,
    daysWithData,
    pace,
    history,
    baseline,
    trendPercent,
    forecast: monthToDate + remaining * rate,
  };
}

/** Last day of `month` ("YYYY-MM"). */
export function monthEnd(month: string): string {
  return addDays(`${shiftMonth(month, 1)}-01`, -1);
}
