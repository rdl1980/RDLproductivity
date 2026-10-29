import { describe, expect, it } from "vitest";

import {
  duePayouts,
  goalProgress,
  payoutCurrency,
  payoutSchedule,
  payoutTransfers,
  weekEnd,
} from "./kdp-finance";

describe("payoutTransfers", () => {
  it("lists one transfer per marketplace with its currency, largest first", () => {
    expect(
      payoutTransfers([
        { marketplace: "Amazon.it", royalty: 12.5 },
        { marketplace: "Amazon.com", royalty: 30 },
        { marketplace: "Amazon.in", royalty: 0.001 },
        { marketplace: "Amazon.co.uk", royalty: 8 },
      ]),
    ).toEqual([
      { marketplace: "Amazon.com", royalty: 30, currency: "USD" },
      { marketplace: "Amazon.it", royalty: 12.5, currency: "EUR" },
      { marketplace: "Amazon.co.uk", royalty: 8, currency: "GBP" },
    ]);
    expect(payoutTransfers(undefined)).toEqual([]);
    expect(payoutCurrency("Amazon.xx")).toBe("—");
  });

  it("counts the transfers of the payments to come", () => {
    const payouts = payoutSchedule(
      [
        {
          month: "2026-09",
          account: "main",
          royalty: 40,
          markets: [
            { marketplace: "Amazon.it", royalty: 25 },
            { marketplace: "Amazon.com", royalty: 15 },
          ],
        },
        {
          month: "2026-09",
          account: "secondary",
          royalty: 5,
          markets: [{ marketplace: "Amazon.de", royalty: 5 }],
        },
      ],
      "2026-10-29",
    );
    expect(duePayouts(payouts)).toEqual([{ payDate: "2026-11-30", royalty: 45, transfers: 3 }]);
  });
});

describe("payoutSchedule", () => {
  it("pays a month at the end of the second month after it", () => {
    const payouts = payoutSchedule(
      [
        { month: "2026-08", account: "main", royalty: 100 },
        { month: "2026-09", account: "main", royalty: 50 },
        { month: "2026-09", account: "secondary", royalty: 20 },
        { month: "2026-10", account: "main", royalty: 0 },
      ],
      "2026-10-24",
    );
    expect(payouts.map((p) => [p.month, p.account, p.payDate, p.status])).toEqual([
      ["2026-09", "main", "2026-11-30", "due"],
      ["2026-09", "secondary", "2026-11-30", "due"],
      ["2026-08", "main", "2026-10-31", "due"],
    ]);
    expect(
      payoutSchedule([{ month: "2026-07", account: "main", royalty: 9 }], "2026-10-24")[0],
    ).toMatchObject({ payDate: "2026-09-30", status: "paid" });
    // December pays at the end of February, leap years included.
    expect(
      payoutSchedule([{ month: "2027-12", account: "main", royalty: 1 }], "2028-01-01")[0].payDate,
    ).toBe("2028-02-29");
  });

  it("sums what is still due per pay date", () => {
    const payouts = payoutSchedule(
      [
        { month: "2026-08", account: "main", royalty: 100 },
        { month: "2026-08", account: "secondary", royalty: 30 },
        { month: "2026-06", account: "main", royalty: 70 },
      ],
      "2026-10-24",
    );
    expect(duePayouts(payouts)).toEqual([{ payDate: "2026-10-31", royalty: 130, transfers: 0 }]);
  });
});

describe("goalProgress", () => {
  it("projects the month at the current pace", () => {
    const progress = goalProgress(300, 120, "2026-10-12");
    expect(progress).toMatchObject({ percent: 40, daysElapsed: 12, daysInMonth: 31 });
    expect(progress.projected).toBeCloseTo(310, 5);
  });

  it("copes with a zero target", () => {
    expect(goalProgress(0, 10, "2026-02-01")).toMatchObject({ percent: 0, daysInMonth: 28 });
  });
});

it("weekEnd is the Sunday", () => {
  expect(weekEnd("2026-10-19")).toBe("2026-10-25");
});
