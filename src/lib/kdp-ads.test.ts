import { describe, expect, it } from "vitest";

import {
  acos,
  mapHeaders,
  parseAmount,
  parseCsv,
  parseReport,
  parseReportDate,
  sumAds,
  toEur,
} from "./kdp-ads";

describe("mapHeaders", () => {
  it("reads the English report", () => {
    const map = mapHeaders([
      "Date",
      "Portfolio name",
      "Currency",
      "Campaign Name",
      "Ad Group Name",
      "Advertised SKU",
      "Advertised ASIN",
      "Impressions",
      "Clicks",
      "Click-Thru Rate (CTR)",
      "Cost Per Click (CPC)",
      "Spend",
      "7 Day Total Sales",
      "Total Advertising Cost of Sales (ACOS)",
      "7 Day Total Orders (#)",
    ]);
    expect(map).toMatchObject({
      date: 0,
      currency: 2,
      campaign: 3,
      asin: 6,
      spend: 11,
      sales: 12,
      orders: 14,
    });
  });

  it("reads the Italian report and refuses an unrelated file", () => {
    expect(
      mapHeaders([
        "Data",
        "Valuta",
        "Nome della campagna",
        "ASIN pubblicizzato",
        "Impressioni",
        "Clic",
        "Spesa",
        "Vendite totali in 14 giorni",
        "Ordini totali in 14 giorni (n.)",
      ]),
    ).toMatchObject({ date: 0, campaign: 2, asin: 3, spend: 6, sales: 7, orders: 8 });
    expect(mapHeaders(["Titolo", "Copie"])).toBeNull();
  });
});

describe("parsing", () => {
  it("reads dates in every shape the console exports", () => {
    expect(parseReportDate("2026-10-03", false)).toBe("2026-10-03");
    expect(parseReportDate("03/10/2026", true)).toBe("2026-10-03");
    expect(parseReportDate("10/03/2026", false)).toBe("2026-10-03");
    expect(parseReportDate("Oct 3, 2026", false)).toBe("2026-10-03");
    expect(parseReportDate(new Date("2026-10-03T00:00:00Z"), false)).toBe("2026-10-03");
    expect(parseReportDate("31/02/2026", true)).toBeNull();
  });

  it("reads amounts with either separator and currency signs", () => {
    expect(parseAmount("1.234,56")).toBe(1234.56);
    expect(parseAmount("1,234.56")).toBe(1234.56);
    expect(parseAmount("€12,30")).toBe(12.3);
    expect(parseAmount("$1.5")).toBe(1.5);
    expect(parseAmount("-")).toBe(0);
    expect(parseAmount(7)).toBe(7);
  });

  it("splits CSV with quotes and semicolons", () => {
    expect(parseCsv('a;b;c\n"x;y";"he said ""hi""";3\n')).toEqual([
      ["a", "b", "c"],
      ["x;y", 'he said "hi"', "3"],
    ]);
    expect(parseCsv("a,b\r\n1,2")).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
  });

  it("builds rows, merges duplicates and counts the junk", () => {
    const result = parseReport([
      [
        "Data",
        "Valuta",
        "Nome della campagna",
        "ASIN pubblicizzato",
        "Clic",
        "Spesa",
        "Vendite totali in 7 giorni",
      ],
      ["01/10/2026", "EUR", "Calcio IT", "B0TESTAAA1", "3", "1,20", "9,99"],
      ["01/10/2026", "EUR", "Calcio IT", "b0testaaa1", "1", "0,40", "0"],
      ["02/10/2026", "EUR", "Calcio IT", "B0TESTAAA1", "0", "0", "0"],
      ["Totale", "", "", "", "4", "1,60", "9,99"],
    ]);
    if ("error" in result) throw new Error(result.error);
    expect(result.skipped).toBe(1);
    expect(result.from).toBe("2026-10-01");
    expect(result.to).toBe("2026-10-02");
    expect(result.rows).toHaveLength(2);
    expect(result.rows[0]).toMatchObject({
      asin: "B0TESTAAA1",
      clicks: 4,
      spend: 1.6,
      sales: 9.99,
      orders: 0,
    });
  });

  it("explains an unknown layout", () => {
    expect(
      parseReport([
        ["Titolo", "Copie"],
        ["x", "1"],
      ]),
    ).toMatchObject({ error: expect.stringContaining("Prodotto pubblicizzato") });
  });
});

describe("sums", () => {
  it("converts to EUR and computes ACoS", () => {
    expect(toEur(10, "USD", { USD: 0.9 })).toBe(9);
    expect(toEur(10, "XYZ", {})).toBe(10);
    const sums = sumAds([
      {
        d: "2026-10-01",
        a: "main",
        book: "b",
        asin: "A",
        spend: 2,
        sales: 8,
        clicks: 1,
        impressions: 10,
        orders: 1,
      },
      {
        d: "2026-10-02",
        a: "main",
        book: "b",
        asin: "A",
        spend: 2,
        sales: 2,
        clicks: 1,
        impressions: 10,
        orders: 1,
      },
    ]);
    expect(acos(sums)).toBe(40);
    expect(acos({ ...sums, sales: 0 })).toBeNull();
  });
});
