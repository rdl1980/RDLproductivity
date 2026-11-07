import { describe, expect, it } from "vitest";

import { anomalies, daySummary, summaryMessage, unsentAnomalies } from "./kdp-digest";
import type { AdRecord } from "./kdp-ads";
import { addDays, type SaleBook, type SaleRecord } from "./kdp-sales";

const sale = (d: string, book: string, eu: number, re = 0, k = 0, a: SaleRecord["a"] = "main") =>
  ({ d, a, m: "Amazon.it", book, eu, pu: 0, hu: 0, k, re, rp: 0, rh: 0, rk: 0 }) as SaleRecord;
const book = (key: string, title: string): SaleBook => ({
  key,
  title,
  account: "main",
  series: null,
  asins: [],
});
const ad = (d: string, bookKey: string, spend: number): AdRecord => ({
  d,
  a: "main",
  book: bookKey,
  asin: "B0",
  spend,
  sales: 0,
  clicks: 0,
  impressions: 0,
  orders: 0,
});

const day = "2026-11-20";

describe("daySummary and summaryMessage", () => {
  const records = [
    sale(day, "a", 2, 5),
    sale(addDays(day, -7), "a", 1, 2.5),
    sale("2026-11-02", "b", 4, 8),
    sale(day, "c", 1, 1, 0, "secondary"),
  ];
  it("sums the day, the same weekday before and the month per account", () => {
    const [main, secondary] = daySummary(records, day);
    expect(main).toMatchObject({
      account: "main",
      today: { units: 2, royalty: 5 },
      lastWeek: { units: 1, royalty: 2.5 },
      month: { units: 7, royalty: 15.5 },
    });
    expect(secondary.account).toBe("secondary");
  });
  it("writes the evening message with the best book and stale accounts", () => {
    const text = summaryMessage(records, [book("a", "Gialli")], day, ["third"], "https://x/kdp");
    expect(text).toContain("<b>Vendite KDP di oggi (20/11)</b>");
    expect(text).toContain(
      "<b>Rosario</b>: 2 copie, 5,00 € (vs sett. scorsa +100%) · mese 15,50 €",
    );
    expect(text).toContain("Totale oggi: <b>6,00 €</b>");
    expect(text).toContain("Il migliore: Gialli (2 copie, 5,00 €)");
    expect(text).toContain("Dati non aggiornati oggi per NonnoPeppe");
  });
});

describe("anomalies", () => {
  const fresh = new Set(["main"] as const);
  it("flags a book that stopped selling", () => {
    const records = [sale(addDays(day, -20), "a", 2), sale(addDays(day, -25), "a", 1)];
    const found = anomalies(records, [], [book("a", "Gialli")], day, fresh);
    expect(found.map((f) => f.key)).toEqual(["stall:a"]);
    expect(found[0].text).toContain("nessuna copia da 14 giorni, 3 nei 30 prima");
  });
  it("ignores accounts whose data is stale", () => {
    const records = [sale(addDays(day, -20), "a", 5)];
    expect(anomalies(records, [], [], day, new Set())).toEqual([]);
  });
  it("flags a KENP drop and ads spending without sales", () => {
    const records = [
      sale(addDays(day, -10), "a", 0, 0, 800),
      sale(addDays(day, -2), "a", 0, 0, 200),
    ];
    const ads = [ad(addDays(day, -1), "a", 6), ad(addDays(day, -3), "a", 6)];
    const keys = anomalies(records, ads, [book("a", "Gialli")], day, fresh).map((f) => f.key);
    expect(keys).toEqual(["kenp:a", "ads:a"]);
  });
  it("does not flag ads when the book sold", () => {
    const records = [sale(addDays(day, -1), "a", 1)];
    expect(anomalies(records, [ad(day, "a", 30)], [], day, fresh)).toEqual([]);
  });
  it("repeats an alert only after a week", () => {
    const found = [{ key: "stall:a", text: "x" }];
    expect(unsentAnomalies(found, { "stall:a": addDays(day, -3) }, day)).toEqual([]);
    expect(unsentAnomalies(found, { "stall:a": addDays(day, -7) }, day)).toEqual(found);
  });
});
