import { describe, expect, it } from "vitest";

import { accountMismatch, likelyAccount } from "./kdp-accounts";

describe("likelyAccount", () => {
  it("picks the account that knows more items", () => {
    expect(likelyAccount({ main: 40, secondary: 0 })).toBe("main");
    expect(likelyAccount({ main: 1, secondary: 12 })).toBe("secondary");
  });

  it("stays undecided for unknown data or a tie", () => {
    expect(likelyAccount({ main: 0, secondary: 0 })).toBeNull();
    expect(likelyAccount({ main: 3, secondary: 3 })).toBeNull();
  });
});

describe("accountMismatch", () => {
  it("refuses data that belongs to the other account", () => {
    expect(accountMismatch("main", { main: 0, secondary: 0 }, "libri")).toBeNull();
    expect(accountMismatch("main", { main: 30, secondary: 1 }, "libri")).toBeNull();
    expect(accountMismatch("main", { main: 2, secondary: 25 }, "libri")).toBe(
      "Questi dati sembrano di «Account secondario»: 25 libri sono già associati a quell'account " +
        "(2 a «Account principale»). Controlla con quale account sei entrato in KDP e scegli quello.",
    );
    expect(accountMismatch("secondary", { main: 9, secondary: 0 }, "titoli")).toContain(
      "«Account principale»: 9 titoli",
    );
  });
});
