import { describe, expect, it } from "vitest";

import { staleSources } from "./kdp-freshness";

const now = new Date("2026-10-24T12:00:00Z");
const daysAgo = (days: number) =>
  new Date(now.getTime() - days * 24 * 60 * 60 * 1000).toISOString();

describe("staleSources", () => {
  it("flags sales older than a week and books older than a month", () => {
    const stale = staleSources(
      {
        main: { sales: daysAgo(9), books: daysAgo(31) },
        secondary: { sales: daysAgo(2), books: daysAgo(10) },
        third: { sales: null, books: null },
      },
      now,
    );
    expect(stale.map((s) => [s.account, s.kind, s.days])).toEqual([
      ["main", "sales", 9],
      ["main", "books", 31],
    ]);
    expect(stale[0].message).toBe("Vendite di «Rosario» aggiornati 9 giorni fa.");
    expect(stale[0].href).toBe("/kdp/vendite");
  });

  it("ignores an account never imported at all, but not a missing source", () => {
    const stale = staleSources(
      {
        main: { sales: daysAgo(1), books: null },
        secondary: { sales: null, books: null },
        third: { sales: null, books: null },
      },
      now,
    );
    expect(stale).toHaveLength(1);
    expect(stale[0]).toMatchObject({ account: "main", kind: "books", days: null });
    expect(stale[0].message).toBe("Libri di «Rosario» mai importati.");
  });

  it("is quiet when everything is fresh", () => {
    expect(
      staleSources(
        {
          main: { sales: daysAgo(6), books: daysAgo(29) },
          secondary: { sales: daysAgo(0), books: daysAgo(0) },
          third: { sales: daysAgo(0), books: daysAgo(0) },
        },
        now,
      ),
    ).toEqual([]);
  });
});
