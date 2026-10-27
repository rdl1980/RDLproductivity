import { describe, expect, it } from "vitest";

import { forecastMonth, monthEnd, trendNext } from "./kdp-forecast";
import { SALE_SOURCES, type SaleRecord } from "./kdp-sales";

const ALL = new Set(SALE_SOURCES);
const rec = (d: string, re: number): SaleRecord => ({
  d,
  a: "main",
  m: "Amazon.it",
  book: "b",
  eu: 1,
  pu: 0,
  hu: 0,
  k: 0,
  re,
  rp: 0,
  rh: 0,
  rk: 0,
});
/** One record per day of `month` worth `perDay`. */
const month = (key: string, perDay: number, days: number) =>
  Array.from({ length: days }, (_, i) => rec(`${key}-${String(i + 1).padStart(2, "0")}`, perDay));

describe("trendNext", () => {
  it("extrapolates a line and never goes below zero", () => {
    expect(trendNext([100, 200, 300])).toEqual({ next: 400, slope: 100 });
    expect(trendNext([300, 200, 100]).next).toBe(0);
    expect(trendNext([250])).toEqual({ next: 250, slope: 0 });
    expect(trendNext([])).toEqual({ next: 0, slope: 0 });
  });
});

describe("forecastMonth", () => {
  const history = [
    ...month("2026-07", 10, 31), // 310
    ...month("2026-08", 10, 31), // 310
    ...month("2026-09", 12, 30), // 360
  ];

  it("blends the month's pace with the trend of the last three months", () => {
    const f = forecastMonth([...history, ...month("2026-10", 15, 10)], ALL, "2026-10-12");
    expect(f.month).toBe("2026-10");
    expect(f.monthToDate).toBe(150);
    expect(f.dataThrough).toBe("2026-10-10");
    expect(f.daysWithData).toBe(10);
    expect(f.pace).toBeCloseTo(465, 5);
    expect(f.history.map((h) => [h.month, h.royalty])).toEqual([
      ["2026-07", 310],
      ["2026-08", 310],
      ["2026-09", 360],
    ]);
    // Line through 310, 310, 360 at the next month: 376.67.
    expect(f.baseline).toBeCloseTo(376.67, 1);
    expect(f.trendPercent).toBeCloseTo((25 / 326.67) * 100, 1);
    // 10 of 31 days covered: rate = 10/31 × 15 + 21/31 × 12.15 = 13.07 per day for 21 days.
    const rate = (10 / 31) * 15 + (21 / 31) * (376.67 / 31);
    expect(f.forecast).toBeCloseTo(150 + 21 * rate, 0);
  });

  it("falls back to the history at the start of the month and to the pace without history", () => {
    const fresh = forecastMonth(history, ALL, "2026-10-01");
    expect(fresh.monthToDate).toBe(0);
    expect(fresh.pace).toBeNull();
    expect(fresh.forecast).toBeCloseTo(fresh.baseline!, 5);

    const noHistory = forecastMonth(month("2026-10", 15, 10), ALL, "2026-10-12");
    expect(noHistory.history).toEqual([]);
    expect(noHistory.baseline).toBeNull();
    expect(noHistory.forecast).toBeCloseTo(465, 5);
  });

  it("skips months before the first report instead of counting them as zero", () => {
    const f = forecastMonth(
      [...month("2026-09", 12, 30), ...month("2026-10", 15, 5)],
      ALL,
      "2026-10-06",
    );
    expect(f.history).toEqual([{ month: "2026-09", royalty: 360 }]);
    expect(f.trendPercent).toBeNull();
    expect(f.baseline).toBe(360);
  });

  it("ignores days after today and respects the selected sources", () => {
    const f = forecastMonth(
      [...month("2026-10", 15, 20)],
      new Set(["paperback"] as const),
      "2026-10-10",
    );
    expect(f.dataThrough).toBe("2026-10-10");
    expect(f.monthToDate).toBe(0);
  });

  it("knows the last day of a month", () => {
    expect(monthEnd("2026-02")).toBe("2026-02-28");
    expect(monthEnd("2026-12")).toBe("2026-12-31");
  });
});
