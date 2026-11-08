import { describe, expect, it } from "vitest";

import { isCaptcha, parseRank, parseRating, parseReviews, readSnippets } from "./amazon-rank";

describe("parseRank", () => {
  it("reads the Italian detail bullets", () => {
    const html = `<li><span class="a-text-bold">Posizione nella classifica Bestseller di Amazon:</span>
      n.12.345 in Kindle Store (<a href="/gp/bestsellers/digital-text">Visualizza i Top 100</a>)
      <ul><li>n.3 in Gialli</li></ul></li>`;
    expect(parseRank(html)).toEqual({ rank: 12345, category: "Kindle Store" });
  });

  it("reads the US, German, French and Spanish pages", () => {
    expect(
      parseRank("Best Sellers Rank: #1,234 in Kindle Store (See Top 100) #2 in Mystery"),
    ).toEqual({ rank: 1234, category: "Kindle Store" });
    expect(parseRank("Amazon Bestseller-Rang: Nr. 45.678 in Kindle-Shop (Siehe Top 100)")).toEqual({
      rank: 45678,
      category: "Kindle-Shop",
    });
    expect(
      parseRank("Classement des meilleures ventes d'Amazon : 98&nbsp;765 en Boutique Kindle ("),
    ).toEqual({ rank: 98765, category: "Boutique Kindle" });
    expect(
      parseRank("Clasificación en los más vendidos de Amazon: nº5.432 en Tienda Kindle (Ver"),
    ).toEqual({ rank: 5432, category: "Tienda Kindle" });
  });

  it("reads a paperback rank in Libri", () => {
    expect(
      parseRank("Posizione nella classifica Bestseller di Amazon: n. 210.000 in Libri (Visualizza"),
    ).toEqual({ rank: 210000, category: "Libri" });
  });

  it("returns null without a rank", () => {
    expect(parseRank("Posizione nella classifica Bestseller di Amazon:")).toBeNull();
  });
});

describe("reviews and rating", () => {
  it("reads the count and the stars in any language", () => {
    expect(
      parseReviews('<span id="acrCustomerReviewText" class="a-size-base">1.234 voti</span>'),
    ).toBe(1234);
    expect(parseReviews('<span id="acrCustomerReviewText">7 ratings</span>')).toBe(7);
    expect(parseRating('<span id="acrPopover" class="x" title="4,5 su 5 stelle">')).toBe(4.5);
    expect(parseRating('<span id="acrPopover" title="4.2 out of 5 stars">')).toBe(4.2);
  });

  it("combines the snippets and spots the robot check", () => {
    expect(readSnippets({ reviews: '<span id="acrCustomerReviewText">3 voti</span>' })).toEqual({
      rank: null,
      category: null,
      reviews: 3,
      rating: null,
    });
    expect(isCaptcha('<form action="/errors/validateCaptcha">')).toBe(true);
    expect(isCaptcha("<html>prodotto</html>")).toBe(false);
  });
});

describe("extension", () => {
  it("looks for the same rank labels as the parser", async () => {
    const { readFileSync } = await import("node:fs");
    const { RANK_LABELS } = await import("./amazon-rank");
    const background = readFileSync("extension/background.js", "utf8");
    for (const label of RANK_LABELS) expect(background).toContain(JSON.stringify(label));
  });
});
