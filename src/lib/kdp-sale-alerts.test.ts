import { describe, expect, it } from "vitest";

import { newSales, saleAlertMessage, type SaleCounts, unitsLabel } from "./kdp-sale-alerts";

const row = (
  date: string,
  titleKey: string,
  ebook = 0,
  paperback = 0,
  royalty = 0,
): SaleCounts => ({
  date,
  marketplace: "Amazon.it",
  titleKey,
  ebook,
  paperback,
  hardcover: 0,
  royalty,
});

describe("newSales", () => {
  it("reports only the units added since the previous import", () => {
    const before = [row("2026-11-06", "A", 1, 0, 2), row("2026-11-06", "B", 2, 0, 4)];
    const after = [
      row("2026-11-06", "A", 3, 1, 9.5),
      row("2026-11-06", "B", 2, 0, 4),
      row("2026-11-07", "C", 1, 0, 1.99),
    ];
    expect(newSales(before, after, "2026-11-01")).toEqual([
      { ...row("2026-11-06", "A", 2, 1, 7.5) },
      { ...row("2026-11-07", "C", 1, 0, 1.99) },
    ]);
  });

  it("ignores old days and units that went down (KDP revisions)", () => {
    expect(
      newSales([row("2026-11-06", "A", 3)], [row("2026-11-06", "A", 2)], "2026-11-01"),
    ).toEqual([]);
    expect(newSales([], [row("2026-10-01", "A", 5)], "2026-11-01")).toEqual([]);
  });

  it("never reports a negative royalty", () => {
    const [alert] = newSales(
      [row("2026-11-06", "A", 1, 0, 5)],
      [row("2026-11-06", "A", 2, 0, 4)],
      "2026-11-01",
    );
    expect(alert.royalty).toBe(0);
  });
});

describe("saleAlertMessage", () => {
  it("names the books and sums the units and royalty", () => {
    const text = saleAlertMessage(
      [row("2026-11-06", "A", 2, 1, 7.5), row("2026-11-07", "B", 1, 0, 1.99)],
      "Rosario",
      (key) => (key === "A" ? "Gialli <1>" : "Ricette"),
      "https://example.com/kdp/vendite",
    );
    expect(text).toContain("<b>4 nuove vendite · Rosario</b>");
    expect(text).toContain("• Gialli &lt;1&gt;: 2 ebook, 1 cartaceo (it, 06/11)");
    expect(text).toContain("• Ricette: 1 ebook (it, 07/11)");
    expect(text).toContain("Royalty stimate: +9,49 €");
    expect(text).toContain('<a href="https://example.com/kdp/vendite">');
  });

  it("says one sale in the singular and stays under the Telegram limit", () => {
    expect(saleAlertMessage([row("2026-11-07", "A", 1)], "Ilaria", () => "X", "u")).toContain(
      "<b>Nuova vendita · Ilaria</b>",
    );
    const many = Array.from({ length: 400 }, (_, i) => row("2026-11-07", `K${i}`, 1));
    const text = saleAlertMessage(many, "Mario", (k) => `Titolo lunghissimo ${k} `.repeat(3), "u");
    expect(text.length).toBeLessThan(4096);
    expect(text).toContain("… e altre");
  });

  it("labels the formats", () => {
    expect(unitsLabel({ ebook: 0, paperback: 1, hardcover: 2 })).toBe(
      "1 cartaceo, 2 copertina rigida",
    );
  });
});
