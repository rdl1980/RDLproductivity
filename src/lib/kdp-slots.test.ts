import { describe, expect, it } from "vitest";

import type { KdpTaskItem } from "./kdp";
import { adjustmentKey, DEFAULT_SLOT_LIMITS, type SlotLimits, slotUsage } from "./kdp-slots";

const week = "2026-11-08";
const task = (
  formats: KdpTaskItem["formats"],
  track: KdpTaskItem["track"] = "actual",
  account: KdpTaskItem["account"] = "main",
  w = week,
) => ({ account, week: w, track, formats });

const byFormat = (usage: ReturnType<typeof slotUsage>) =>
  Object.fromEntries(usage.map((u) => [u.format, `${u.used}/${u.limit}`]));

describe("slotUsage", () => {
  it("counts the formats of the Reale tasks of the account and week", () => {
    const tasks = [
      task(["ebook", "paperback"]),
      task(["ebook"]),
      task(["ebook"], "planned"),
      task(["hardcover"], "actual", "secondary"),
      task(["paperback"], "actual", "main", "2026-11-15"),
    ];
    expect(byFormat(slotUsage(tasks, "main", week, DEFAULT_SLOT_LIMITS, {}))).toEqual({
      ebook: "2/2",
      paperback: "1/2",
      hardcover: "0/2",
    });
  });

  it("applies the manual adjustment, never below zero, and goes negative when over", () => {
    const tasks = [task(["ebook", "paperback"]), task(["ebook", "paperback"]), task(["ebook"])];
    const adjust = {
      [adjustmentKey("main", week, "paperback")]: -5,
      [adjustmentKey("main", week, "hardcover")]: 1,
    };
    const usage = slotUsage(tasks, "main", week, DEFAULT_SLOT_LIMITS, adjust);
    expect(usage.map((u) => [u.format, u.used, u.left])).toEqual([
      ["ebook", 3, -1],
      ["paperback", 0, 2],
      ["hardcover", 1, 1],
    ]);
  });

  it("uses the account's own limits when set", () => {
    const limits: SlotLimits = {
      base: { ebook: 2, paperback: 2, hardcover: 2 },
      accounts: { third: { ebook: 5, paperback: 1, hardcover: 0 } },
    };
    expect(byFormat(slotUsage([], "third", week, limits, {}))).toEqual({
      ebook: "0/5",
      paperback: "0/1",
      hardcover: "0/0",
    });
    expect(byFormat(slotUsage([], "main", week, limits, {})).ebook).toBe("0/2");
  });
});
