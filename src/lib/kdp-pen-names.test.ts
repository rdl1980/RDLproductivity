import { describe, expect, it } from "vitest";

import { penBookRows, penNameTable, type PenBook } from "./kdp-pen-names";
import { NO_PEN_NAME, SALE_SOURCES, type SaleRecord } from "./kdp-sales";

const ALL = new Set(SALE_SOURCES);
const rec = (d: string, book: string, re: number, eu = 1): SaleRecord => ({
  d,
  a: "main",
  m: "Amazon.it",
  book,
  eu,
  pu: 0,
  hu: 0,
  k: 0,
  re,
  rp: 0,
  rh: 0,
  rk: 0,
});
const book = (key: string, author: string | null): PenBook => ({
  key,
  title: `Libro ${key}`,
  account: "main",
  series: null,
  author,
});

const books = [
  book("a1", "Rossella"),
  book("a2", "Rossella"),
  book("a3", "Rossella"),
  book("b1", "Dario"),
  book("x", null),
];
const all = [
  rec("2026-09-10", "a1", 3),
  rec("2026-10-02", "a1", 10),
  rec("2026-10-03", "a2", 5),
  rec("2026-10-04", "b1", 20),
  rec("2026-10-05", "x", 1),
];
const current = all.filter((r) => r.d >= "2026-10-01");
const previous = all.filter((r) => r.d < "2026-10-01");
const ads = [
  {
    d: "2026-10-02",
    a: "main" as const,
    book: "a1",
    asin: "B0",
    spend: 4,
    sales: 0,
    clicks: 0,
    impressions: 0,
    orders: 0,
  },
];

describe("penNameTable", () => {
  it("sums each pen name, counts its books and the sold ones, unknown last", () => {
    const rows = penNameTable(current, previous, ads, books, ALL);
    expect(
      rows.map((r) => [r.name, r.books, r.sold, r.sums.royalty, r.previous.royalty, r.adSpend]),
    ).toEqual([
      ["Dario", 1, 1, 20, 0, 0],
      ["Rossella", 3, 2, 15, 3, 4],
      [NO_PEN_NAME, 1, 1, 1, 0, 0],
    ]);
  });
});

describe("penBookRows", () => {
  it("lists every book of the pen name, unsold ones included", () => {
    const rows = penBookRows("Rossella", all, current, previous, ads, books, ALL);
    expect(
      rows.map((r) => [r.book.key, r.sums.royalty, r.previous.royalty, r.adSpend, r.first, r.last]),
    ).toEqual([
      ["a1", 10, 3, 4, "2026-09-10", "2026-10-02"],
      ["a2", 5, 0, 0, "2026-10-03", "2026-10-03"],
      ["a3", 0, 0, 0, null, null],
    ]);
  });
});
