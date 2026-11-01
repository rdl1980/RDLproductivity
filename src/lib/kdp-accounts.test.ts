import { describe, expect, it } from "vitest";

import { accountMismatch, likelyAccount } from "./kdp-accounts";

const m = (main: number, secondary: number, third = 0) => ({ main, secondary, third });

describe("likelyAccount", () => {
  it("picks the account that knows more items", () => {
    expect(likelyAccount(m(40, 0))).toBe("main");
    expect(likelyAccount(m(1, 12))).toBe("secondary");
    expect(likelyAccount(m(1, 2, 30))).toBe("third");
  });

  it("stays undecided for unknown data or a tie", () => {
    expect(likelyAccount(m(0, 0))).toBeNull();
    expect(likelyAccount(m(3, 3))).toBeNull();
    expect(likelyAccount(m(0, 5, 5))).toBeNull();
  });
});

describe("accountMismatch", () => {
  it("refuses data that belongs to another account", () => {
    expect(accountMismatch("main", m(0, 0), "libri")).toBeNull();
    expect(accountMismatch("main", m(30, 1), "libri")).toBeNull();
    expect(accountMismatch("main", m(2, 25), "libri")).toBe(
      "Questi dati sembrano di «Ilaria»: 25 libri sono già associati a quell'account " +
        "(2 a «Rosario»). Controlla con quale account sei entrato in KDP e scegli quello.",
    );
    expect(accountMismatch("secondary", m(9, 0), "titoli")).toContain("«Rosario»: 9 titoli");
    expect(accountMismatch("main", m(1, 3, 12), "ASIN")).toContain("«NonnoPeppe»: 12 ASIN");
    expect(accountMismatch("third", m(0, 0, 0), "libri")).toBeNull();
  });
});
