import { describe, expect, it } from "vitest";

import {
  autoGranularity,
  bucketStart,
  change,
  decodeSalesHash,
  encodeSalesHash,
  filterRecords,
  launchCurve,
  parseTitleKey,
  previousMonthToDate,
  previousPeriod,
  SALE_SOURCES,
  type SaleRecord,
  salesPayloadSchema,
  sumRecords,
  timeSeries,
  weekdayAverages,
} from "./kdp-sales";

const ALL = new Set(SALE_SOURCES);

const rec = (d: string, fields: Partial<SaleRecord> = {}): SaleRecord => ({
  d,
  a: "main",
  m: "Amazon.it",
  book: "b1",
  eu: 0,
  pu: 0,
  hu: 0,
  k: 0,
  re: 0,
  rp: 0,
  rh: 0,
  rk: 0,
  ...fields,
});

describe("parseTitleKey", () => {
  it("reads the ASIN of each format", () => {
    expect(parseTitleKey("DIGITAL=B0FZLK9KY5:PRINT=B0FZLPHPMJ:HARDCOVER=B0GJPH9MN5:")).toEqual({
      ebook: "B0FZLK9KY5",
      paperback: "B0FZLPHPMJ",
      hardcover: "B0GJPH9MN5",
    });
    expect(parseTitleKey(":PRINT=B0HF5CVG7S::")).toEqual({
      ebook: null,
      paperback: "B0HF5CVG7S",
      hardcover: null,
    });
  });
});

describe("sums", () => {
  const records = [
    rec("2026-10-01", { eu: 1, re: 3.5, k: 100, rk: 0.4 }),
    rec("2026-10-02", { pu: 2, rp: 6 }),
  ];

  it("adds every source", () => {
    const sums = sumRecords(records, ALL);
    expect(sums.units).toBe(3);
    expect(sums.kenp).toBe(100);
    expect(sums.royalty).toBeCloseTo(9.9);
    expect(sums.bySource.paperback).toEqual({ royalty: 6, units: 2 });
  });

  it("counts only the selected sources", () => {
    const sums = sumRecords(records, new Set(["paperback"] as const));
    expect(sums).toMatchObject({ units: 2, royalty: 6, kenp: 0 });
  });
});

describe("filterRecords", () => {
  it("filters by period, account, marketplace and book", () => {
    const records = [
      rec("2026-09-30"),
      rec("2026-10-01"),
      rec("2026-10-01", { a: "secondary" }),
      rec("2026-10-01", { m: "Amazon.com" }),
      rec("2026-10-01", { book: "b2" }),
    ];
    const result = filterRecords(records, {
      from: "2026-10-01",
      to: "2026-10-31",
      account: "main",
      markets: new Set(["Amazon.it"]),
      book: "b1",
    });
    expect(result).toHaveLength(1);
  });
});

describe("periods and buckets", () => {
  it("computes the previous period of the same length", () => {
    expect(previousPeriod("2026-10-01", "2026-10-31")).toEqual({
      from: "2026-08-31",
      to: "2026-09-30",
    });
  });

  it("compares month to date with the same days of the previous month", () => {
    expect(previousMonthToDate("2026-10-27")).toEqual({ from: "2026-09-01", to: "2026-09-27" });
    expect(previousMonthToDate("2026-03-31")).toEqual({ from: "2026-02-01", to: "2026-02-28" });
    expect(previousMonthToDate("2026-01-05")).toEqual({ from: "2025-12-01", to: "2025-12-05" });
  });

  it("chooses the granularity from the length", () => {
    expect(autoGranularity("2026-10-01", "2026-10-31")).toBe("day");
    expect(autoGranularity("2026-01-01", "2026-10-31")).toBe("week");
    expect(autoGranularity("2024-01-01", "2026-10-31")).toBe("month");
  });

  it("starts weeks on Monday and months on the 1st", () => {
    expect(bucketStart("2026-10-18", "week")).toBe("2026-10-12");
    expect(bucketStart("2026-10-19", "week")).toBe("2026-10-19");
    expect(bucketStart("2026-10-19", "month")).toBe("2026-10-01");
  });

  it("fills empty buckets", () => {
    const series = timeSeries(
      [rec("2026-10-02", { eu: 1, re: 2 })],
      "2026-10-01",
      "2026-10-03",
      "day",
      ALL,
    );
    expect(series.map((b) => [b.start, b.sums.royalty])).toEqual([
      ["2026-10-01", 0],
      ["2026-10-02", 2],
      ["2026-10-03", 0],
    ]);
  });

  it("spans month boundaries", () => {
    const series = timeSeries([], "2025-11-15", "2026-02-03", "month", ALL);
    expect(series.map((b) => b.start)).toEqual([
      "2025-11-01",
      "2025-12-01",
      "2026-01-01",
      "2026-02-01",
    ]);
  });
});

describe("weekdayAverages", () => {
  it("averages over the days of the period", () => {
    // 2026-10-05 and 2026-10-12 are Mondays.
    const avg = weekdayAverages(
      [rec("2026-10-05", { re: 4 }), rec("2026-10-12", { re: 2 })],
      "2026-10-05",
      "2026-10-18",
      ALL,
    );
    expect(avg[0]).toBe(3);
    expect(avg[1]).toBe(0);
  });
});

describe("launchCurve", () => {
  it("accumulates units from the first sale", () => {
    const curve = launchCurve(
      [rec("2026-10-03", { pu: 2 }), rec("2026-10-01", { eu: 1 }), rec("2026-10-20", { eu: 5 })],
      "b1",
      3,
      ALL,
    );
    expect(curve).toEqual([1, 1, 3, 3]);
  });
});

describe("change", () => {
  it("returns null without a base", () => {
    expect(change(5, 0)).toBeNull();
    expect(change(0, 0)).toBe(0);
    expect(change(15, 10)).toBe(50);
  });
});

describe("payload", () => {
  it("round-trips through the gzip fragment", async () => {
    const payload = {
      v: 1,
      kind: "sales",
      currency: "EUR",
      from: "2025-10-01",
      to: "2026-10-20",
      rows: [
        [
          "2026-10-01",
          "Amazon.it",
          "DIGITAL=B0GH15W51H:PRINT=B0GJ2YMP9F::",
          1,
          0,
          0,
          426,
          3.2,
          2.8,
          0,
          0,
          0.4,
        ],
      ],
    };
    const decoded = salesPayloadSchema.parse(
      await decodeSalesHash(`#${await encodeSalesHash(payload)}`),
    );
    expect(decoded.rows[0][6]).toBe(426);
  });

  it("rejects an inverted range", () => {
    const result = salesPayloadSchema.safeParse({
      v: 1,
      kind: "sales",
      currency: "EUR",
      from: "2026-10-20",
      to: "2026-10-01",
      rows: [],
    });
    expect(result.success).toBe(false);
  });
});
