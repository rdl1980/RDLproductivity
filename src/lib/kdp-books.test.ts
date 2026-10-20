import { describe, expect, it } from "vitest";

import {
  amazonUrl,
  cleanSeries,
  decodeImportHash,
  encodeImportHash,
  importPayloadSchema,
  mainTitle,
  marketOf,
  matchScore,
  normalizeStatus,
  parseCardTitle,
  proposeLinks,
  statusTransitions,
  toStoredFormats,
} from "./kdp-books";

const soccerBrain = {
  id: "b1",
  title:
    "Soccer Brain Training: Mental Toughness for Young Soccer Players: Game-Day Routines, Mistake Resets and Confidence Drills for Ages 9-13",
  markets: ["US"],
};
const footballFairy = {
  id: "b2",
  title:
    "Football Fairy Tales: 21 Inspiring True Stories of Teams That Did the Impossible. Underdogs, Comebacks and Life Lessons, with Quizzes, for Kids 8-14",
  markets: ["UK"],
};
const soccerFairy = {
  ...footballFairy,
  id: "b3",
  title: footballFairy.title.replace("Football", "Soccer"),
  markets: ["US"],
};
const soccerIq = {
  id: "b4",
  title:
    "Soccer IQ for Young Players: How to Teach Game Intelligence, Positioning, and Decision-Making Without Overcomplicating Everything",
  markets: ["US"],
};
const soccerIqSessions = {
  id: "b5",
  title:
    "Soccer IQ Training Sessions for Young Players: 50 Small-Sided Games and Constraints That Teach Scanning, Positioning, and Decision-Making, Without a Whiteboard",
  markets: ["US"],
};
const books = [soccerBrain, footballFairy, soccerFairy, soccerIq, soccerIqSessions];

describe("normalizeStatus", () => {
  it("reads English and Italian KDP labels", () => {
    expect(normalizeStatus("Live")).toBe("live");
    expect(normalizeStatus("Online ")).toBe("live");
    expect(normalizeStatus("Bozza")).toBe("draft");
    expect(normalizeStatus("BLOCCATO")).toBe("blocked");
    expect(normalizeStatus("In revisione")).toBe("review");
    expect(normalizeStatus(null)).toBe("other");
  });
});

describe("marketOf", () => {
  it("prefers the Amazon link, then the currency", () => {
    expect(marketOf("https://www.amazon.it/dp/B0HMJQDDMC", "€3,99 EUR")).toBe("IT");
    expect(marketOf("https://www.amazon.co.uk/dp/B0HMPCYKCF", null)).toBe("UK");
    expect(marketOf(null, "$12,99 USD")).toBe("US");
    expect(marketOf(null, "£9,99 GBP")).toBe("UK");
    expect(marketOf(null, "€13,45 EUR")).toBeNull();
    expect(marketOf(null, "€13,45 EUR", "Le favole del calcio: Storie vere per ragazzi")).toBe(
      "IT",
    );
    expect(
      marketOf(null, "€12,49 EUR", "300 preguntas y curiosidades del fútbol: para niños"),
    ).toBe("ES");
    expect(
      marketOf(null, "€9,99 EUR", "La Grande Collection de Sudoku: 400 Grilles du Facile"),
    ).toBe("FR");
  });
});

describe("parseCardTitle", () => {
  it("drops the status after the dash and collects market tags", () => {
    const parsed = parseCardTitle("Soccer Brain Training (US) — pronto, slot settimana del 16/11");
    expect(parsed.core).toBe("Soccer Brain Training");
    expect([...parsed.markets]).toEqual(["US"]);
  });

  it("understands grouped tags", () => {
    const parsed = parseCardTitle("Football / Soccer Fairy Tales (EN, UK + US) — pronto");
    expect(parsed.core).toBe("Football / Soccer Fairy Tales");
    expect([...parsed.markets].sort()).toEqual(["UK", "US"]);
  });

  it("keeps parentheses that are not markets and strips leading symbols", () => {
    expect(parseCardTitle("Il Codice della Sibilla (Tancredi e Gea, Libro 1)").core).toBe(
      "Il Codice della Sibilla Tancredi e Gea, Libro 1",
    );
    expect(parseCardTitle("⚠️ Agenda Estetista 2027 — avviso").core).toBe("Agenda Estetista 2027");
  });
});

describe("mainTitle", () => {
  it("cuts at the subtitle", () => {
    expect(mainTitle(soccerBrain.title)).toBe("Soccer Brain Training");
  });
});

describe("matchScore", () => {
  it("is certain for the exact main title in the right market", () => {
    expect(
      matchScore({ id: "c", title: "Soccer Brain Training (US) — pronto" }, soccerBrain),
    ).toEqual({
      score: 1,
      exact: true,
    });
  });

  it("penalizes a market mismatch", () => {
    const result = matchScore({ id: "c", title: "Soccer Brain Training (UK)" }, soccerBrain);
    expect(result.exact).toBe(false);
    expect(result.score).toBeLessThan(0.5);
  });

  it("does not match a different sport", () => {
    expect(
      matchScore({ id: "c", title: "Football Brain Training (UK)" }, soccerBrain).score,
    ).toBeLessThan(0.5);
  });

  it("never matches on a shared number alone", () => {
    const book = { id: "x", title: "Zebra Quiz 1792: Questions", markets: ["US"] };
    expect(matchScore({ id: "c", title: "Uno 1792" }, book).score).toBe(0);
  });

  it("penalizes another year or volume", () => {
    const book = { id: "x", title: "Agenda Estetista 2026: Appuntamenti", markets: [] };
    const card = { id: "c", title: "Agenda Estetista 2027 — pronta" };
    expect(matchScore(card, book).score).toBeLessThan(0.5);
    expect(matchScore({ id: "c", title: "Agenda Estetista 2026" }, book).exact).toBe(true);
  });

  it("ignores accents and case", () => {
    const book = { id: "x", title: "Le favole del calcio: Storie vere", markets: ["IT"] };
    expect(matchScore({ id: "c", title: "LE FAVOLE DEL CALCIO (IT)" }, book).exact).toBe(true);
  });
});

describe("proposeLinks", () => {
  it("marks unique exact matches as certain and the rest as suggestions", () => {
    const cards = [
      { id: "c1", title: "Soccer Brain Training (US) — pronto" },
      { id: "c2", title: "Football / Soccer Fairy Tales (EN, UK + US) — pronto per l'upload" },
      { id: "c3", title: "Soccer IQ — il libro delle sedute (US + UK)" },
      { id: "c4", title: "Allineare i prezzi di Soccer IQ e Football IQ nel Regno Unito" },
    ];
    const links = proposeLinks(cards, books);
    expect(links.filter((l) => l.cardId === "c1")).toEqual([
      { bookId: "b1", cardId: "c1", score: 1, certain: true },
    ]);
    const fairy = links.filter((l) => l.cardId === "c2");
    expect(fairy.map((l) => l.bookId).sort()).toEqual(["b2", "b3"]);
    expect(fairy.every((l) => !l.certain)).toBe(true);
    const iq = links.filter((l) => l.cardId === "c3");
    expect(iq.map((l) => l.bookId).sort()).toEqual(["b4", "b5"]);
    expect(links.some((l) => l.cardId === "c4")).toBe(false);
  });

  it("skips decided pairs", () => {
    const links = proposeLinks(
      [{ id: "c1", title: "Soccer Brain Training (US)" }],
      books,
      new Set(["b1:c1"]),
    );
    expect(links).toEqual([]);
  });
});

describe("import payload", () => {
  it("round-trips through the URL fragment, accents included", () => {
    const payload = {
      v: 1,
      books: [
        {
          kdpId: "2KAAMSP35PE",
          title: "Le favole del calcio: Storie vere di squadre che hanno fatto l'impossibile",
          series: "Libro in l'evoluzione tattica nel calcio",
          formats: [
            {
              format: "paperback",
              status: "Online",
              asin: "B0HMLPFLNH",
              price: "€13,45 EUR",
              url: null,
            },
            {
              format: "ebook",
              status: "Online",
              asin: "B0HMJQDDMC",
              price: "€3,99 EUR",
              url: "https://www.amazon.it/dp/B0HMJQDDMC",
            },
          ],
        },
      ],
    };
    const decoded = importPayloadSchema.parse(decodeImportHash(`#${encodeImportHash(payload)}`));
    expect(decoded.books[0].title).toBe(payload.books[0].title);
    const formats = toStoredFormats(decoded.books[0].formats, decoded.books[0].title);
    expect(formats.map((f) => f.format)).toEqual(["ebook", "paperback"]);
    expect(formats[0]).toMatchObject({ status: "live", market: "IT", asin: "B0HMJQDDMC" });
    expect(amazonUrl(formats[1])).toBe("https://www.amazon.it/dp/B0HMLPFLNH");
    expect(cleanSeries(decoded.books[0].series)).toBe("l'evoluzione tattica nel calcio");
  });

  it("rejects malformed ASINs", () => {
    const result = importPayloadSchema.safeParse({
      v: 1,
      books: [{ kdpId: "X", title: "T", formats: [{ format: "ebook", asin: "nope" }] }],
    });
    expect(result.success).toBe(false);
  });
});

describe("statusTransitions", () => {
  const f = (format: "ebook" | "paperback", status: "live" | "draft" | "blocked") => ({
    format,
    status,
    statusText: null,
    asin: null,
    price: null,
    url: null,
    market: null,
  });

  it("finds formats that went online or got blocked", () => {
    expect(
      statusTransitions(
        [f("ebook", "draft"), f("paperback", "live")],
        [f("ebook", "live"), f("paperback", "blocked")],
        true,
      ),
    ).toEqual({ live: ["ebook"], blocked: ["paperback"] });
  });

  it("ignores unchanged formats", () => {
    expect(statusTransitions([f("ebook", "live")], [f("ebook", "live")], true)).toEqual({
      live: [],
      blocked: [],
    });
  });

  it("treats new books as news only after the first import", () => {
    expect(statusTransitions(null, [f("ebook", "live")], false).live).toEqual([]);
    expect(statusTransitions(null, [f("ebook", "live")], true).live).toEqual(["ebook"]);
  });
});
