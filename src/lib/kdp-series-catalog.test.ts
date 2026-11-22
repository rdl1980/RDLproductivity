import { describe, expect, it } from "vitest";

import type { KdpBookFormat } from "./kdp-books";
import {
  buildCatalog,
  type CatalogBook,
  type CatalogEntry,
  type CatalogSeries,
  displayName,
  firstSales,
  normalizeKdpName,
  onlineWeeks,
  publicationDate,
  seriesBookInputSchema,
  seriesInputSchema,
} from "./kdp-series-catalog";

const live = (asin: string): KdpBookFormat => ({
  format: "ebook",
  status: "live",
  statusText: "Online",
  asin,
  price: "€2,99 EUR",
  market: "IT",
  url: null,
});
const draft: KdpBookFormat = { ...live(""), status: "draft", statusText: "Bozza", asin: null };

const series = (over: Partial<CatalogSeries> = {}): CatalogSeries => ({
  id: "s1",
  name: "Amori in agenzia",
  account: "fourth",
  penName: "Lena Di Leva",
  kdpName: "amori in agenzia",
  status: "active",
  plannedVolumes: 4,
  language: "IT",
  genre: null,
  description: null,
  notes: null,
  ...over,
});
const book = (over: Partial<CatalogBook> & { id: string }): CatalogBook => ({
  account: "fourth",
  title: `Titolo ${over.id}`,
  series: "amori in agenzia",
  author: "Lena Di Leva",
  volume: null,
  formats: [live(`B0${over.id.padEnd(8, "X")}`)],
  missing: false,
  publishedAt: null,
  ...over,
});
const entry = (over: Partial<CatalogEntry> & { id: string }): CatalogEntry => ({
  seriesId: "s1",
  title: `Planned ${over.id}`,
  volume: null,
  status: "idea",
  plannedDate: null,
  bookId: null,
  notes: null,
  card: null,
  task: null,
  ...over,
});
const noEvidence = { onlineWeek: new Map(), firstSale: new Map(), salesStart: new Map() };

describe("names", () => {
  it("normalizes the Bookshelf series name and capitalises a display name", () => {
    expect(normalizeKdpName("  Amori   in Agenzia ")).toBe("amori in agenzia");
    expect(normalizeKdpName("  ")).toBeNull();
    expect(displayName("l'evoluzione tattica nel calcio")).toBe("L'Evoluzione Tattica Nel Calcio");
  });
});

describe("input schemas", () => {
  it("clears empty texts, lowercases the KDP name and leaves missing fields alone", () => {
    const parsed = seriesInputSchema.parse({ id: "s1", penName: "", kdpName: " Nonna Connie " });
    expect(parsed).toEqual({ id: "s1", penName: null, kdpName: "nonna connie" });
  });

  it("rejects an invalid date or account", () => {
    expect(
      seriesBookInputSchema.safeParse({ seriesId: "s", plannedDate: "2026-13-40" }).success,
    ).toBe(false);
    expect(seriesInputSchema.safeParse({ name: "X", account: "fifth" }).success).toBe(false);
  });
});

describe("publicationDate", () => {
  it("prefers the date set by hand", () => {
    expect(
      publicationDate({
        manual: "2025-01-02",
        onlineWeek: "2026-11-01",
        firstSale: "2026-10-20",
        salesStart: null,
      }),
    ).toEqual({ date: "2025-01-02", source: "manual", before: false });
  });

  it("takes the earliest evidence that the book was live", () => {
    expect(
      publicationDate({
        manual: null,
        onlineWeek: "2026-11-01",
        firstSale: "2026-11-03",
        salesStart: "2025-10-16",
      }),
    ).toEqual({ date: "2026-11-01", source: "task", before: false });
    expect(
      publicationDate({
        manual: null,
        onlineWeek: "2026-11-08",
        firstSale: "2026-11-03",
        salesStart: "2025-10-16",
      }),
    ).toEqual({ date: "2026-11-03", source: "sale", before: false });
  });

  it("marks a first sale on the first day of the reports as 'on or before'", () => {
    expect(
      publicationDate({
        manual: null,
        onlineWeek: null,
        firstSale: "2025-10-16",
        salesStart: "2025-10-16",
      }),
    ).toEqual({ date: "2025-10-16", source: "sale", before: true });
    expect(
      publicationDate({ manual: null, onlineWeek: null, firstSale: null, salesStart: null }),
    ).toBeNull();
  });
});

describe("evidence", () => {
  const b = book({ id: "a", title: "Odio il mio capo: commedia", formats: [live("B0AAAAAAAA")] });

  it("finds the Online task by ASIN or by main title, the earliest week", () => {
    const weeks = onlineWeeks(
      [b],
      [
        {
          account: "fourth",
          title: "Online: Altro (eBook)",
          notes: "eBook B0AAAAAAAA",
          week: "2026-11-08",
        },
        {
          account: "fourth",
          title: "Online: Odio il mio capo (Cartaceo)",
          notes: null,
          week: "2026-11-01",
        },
        {
          account: "main",
          title: "Online: Odio il mio capo (eBook)",
          notes: null,
          week: "2026-10-01",
        },
        { account: "fourth", title: "Scrivere Odio il mio capo", notes: null, week: "2026-09-01" },
      ],
    );
    expect(weeks.get("a")).toBe("2026-11-01");
  });

  it("takes the first sale over the book's ASINs on its account", () => {
    const first = firstSales(
      [{ ...b, formats: [live("B0AAAAAAAA"), { ...live("B0PPPPPPPP"), format: "paperback" }] }],
      [
        { account: "fourth", asin: "B0AAAAAAAA", first: "2026-03-10" },
        { account: "fourth", asin: "B0PPPPPPPP", first: "2026-02-01" },
        { account: "main", asin: "B0AAAAAAAA", first: "2025-01-01" },
      ],
    );
    expect(first.get("a")).toBe("2026-02-01");
  });
});

describe("buildCatalog", () => {
  it("puts the Bookshelf books of the series name in reading order with the planned ones", () => {
    const { series: views } = buildCatalog(
      [series()],
      [
        entry({
          id: "e3",
          title: "Odio il mio editore",
          volume: 3,
          status: "working",
          plannedDate: "2027-01-10",
        }),
      ],
      [
        book({ id: "b2", title: "Odio il mio direttore: Libro 2" }),
        book({ id: "b1", title: "Odio il mio controller", volume: 1 }),
        book({ id: "x", series: "other", title: "Fuori" }),
        book({ id: "m", account: "main", title: "Altro account" }),
      ],
      noEvidence,
    );
    const view = views[0];
    expect(view.rows.map((r) => [r.title, r.volume, r.stage])).toEqual([
      ["Odio il mio controller", 1, "published"],
      ["Odio il mio direttore", 2, "published"],
      ["Odio il mio editore", 3, "working"],
    ]);
    expect(view.counts).toEqual({ total: 3, published: 2, inProgress: 1, ideas: 0 });
    expect(view.nextPlanned).toBe("2027-01-10");
  });

  it("keeps an entry's details on its book and flags another pen name", () => {
    const card = { id: "c", title: "Card", boardId: "bd", boardTitle: "Board" };
    const { series: views } = buildCatalog(
      [series()],
      [entry({ id: "e1", bookId: "b1", notes: "nota", card, status: "ready" })],
      [book({ id: "b1", author: "Altro Nome", formats: [draft], series: null })],
      noEvidence,
    );
    const [row] = views[0].rows;
    expect(row).toMatchObject({
      entryId: "e1",
      stage: "ready",
      notes: "nota",
      card,
      penMismatch: true,
      published: null,
    });
    expect(row.book?.bySeriesName).toBe(false);
  });

  it("derives the publication date of a live book", () => {
    const { series: views } = buildCatalog([series()], [], [book({ id: "b1" })], {
      onlineWeek: new Map([["b1", "2026-11-01"]]),
      firstSale: new Map(),
      salesStart: new Map(),
    });
    expect(views[0].rows[0].published).toEqual({
      date: "2026-11-01",
      source: "task",
      before: false,
    });
    expect(views[0].lastPublished).toBe("2026-11-01");
  });

  it("suggests the Bookshelf book a planned title became", () => {
    const { series: views } = buildCatalog(
      [series({ kdpName: null })],
      [entry({ id: "e1", title: "Odio il mio editore" })],
      [
        book({ id: "b9", series: null, title: "Odio il mio editore: una commedia" }),
        book({ id: "b8", account: "main", series: null, title: "Odio il mio editore" }),
      ],
      noEvidence,
    );
    expect(views[0].rows[0].suggestion).toEqual({ bookId: "b9", title: "Odio il mio editore" });
  });

  it("lists the Bookshelf series names no series covers yet", () => {
    const { unmanaged } = buildCatalog(
      [series()],
      [],
      [
        book({ id: "1", series: "Nonna Connie", author: "G" }),
        book({ id: "2", series: "nonna connie", author: "G", formats: [draft] }),
        book({ id: "3", series: "nonna connie", author: "H" }),
        book({ id: "4", series: "gone", missing: true }),
      ],
      noEvidence,
    );
    expect(unmanaged).toEqual([
      { account: "fourth", kdpName: "nonna connie", author: "G", books: 3, published: 2 },
    ]);
  });
});
