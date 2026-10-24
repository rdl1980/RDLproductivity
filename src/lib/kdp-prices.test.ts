import { describe, expect, it } from "vitest";

import { priceImpacts } from "./kdp-prices";
import type { SaleRecord } from "./kdp-sales";

const rec = (d: string, eu: number, re: number): SaleRecord => ({
  d,
  a: "main",
  m: "Amazon.it",
  book: "b",
  eu,
  pu: 0,
  hu: 0,
  k: 0,
  re,
  rp: 0,
  rh: 0,
  rk: 0,
});

describe("priceImpacts", () => {
  it("averages the two weeks around each change and remembers the previous price", () => {
    const records = [
      rec("2026-09-20", 7, 7), // before
      rec("2026-09-30", 7, 7), // before, last day of the window
      rec("2026-10-01", 2, 4), // change day: after
      rec("2026-10-10", 2, 4), // after
      rec("2026-10-20", 1, 2), // outside
    ];
    const impacts = priceImpacts(
      records,
      [
        { book: "b", format: "ebook", price: "€4,99 EUR", market: "IT", date: "2026-10-01" },
        { book: "b", format: "ebook", price: "€2,99 EUR", market: "IT", date: "2026-08-01" },
        { book: "other", format: "ebook", price: "€1 EUR", market: "IT", date: "2026-10-01" },
      ],
      "b",
    );
    expect(impacts).toHaveLength(2);
    expect(impacts[0]).toMatchObject({ previous: null, change: { price: "€2,99 EUR" } });
    expect(impacts[1].previous).toBe("€2,99 EUR");
    expect(impacts[1].before).toEqual({ unitsPerDay: 1, royaltyPerDay: 1 });
    expect(impacts[1].after.unitsPerDay).toBeCloseTo(4 / 14, 6);
    expect(impacts[1].after.royaltyPerDay).toBeCloseTo(8 / 14, 6);
  });
});
