/**
 * Weekly KDP publishing slots: Amazon lets an account publish a limited
 * number of new titles per format each week (2 ebooks, 2 paperbacks, 2
 * hardcovers). The tasks in the "Reale" lane use them, one per format they
 * carry; a manual adjustment covers what the calendar does not show. Pure.
 */
import { z } from "zod";

import { KDP_ACCOUNT_VALUES, type KdpAccount, type KdpTaskItem } from "./kdp";
import { KDP_FORMATS, type KdpFormat } from "./kdp-books";

export const DEFAULT_SLOT_LIMIT = 2;

export type FormatCounts = Record<KdpFormat, number>;

export const SLOT_FORMAT_LABELS: Record<KdpFormat, { short: string; long: string }> = {
  ebook: { short: "Ebook", long: "Ebook" },
  paperback: { short: "Cartaceo", long: "Copertina flessibile" },
  hardcover: { short: "Rigida", long: "Copertina rigida" },
};

const count = z.number().int().min(0).max(100);
const countsSchema = z.object({ ebook: count, paperback: count, hardcover: count });

export const slotLimitsSchema = z.object({
  base: countsSchema,
  /** Per-account limits; a missing account uses the base. */
  accounts: z.partialRecord(z.enum(KDP_ACCOUNT_VALUES), countsSchema).default({}),
});
export type SlotLimits = z.infer<typeof slotLimitsSchema>;

export const DEFAULT_SLOT_LIMITS: SlotLimits = {
  base: { ebook: DEFAULT_SLOT_LIMIT, paperback: DEFAULT_SLOT_LIMIT, hardcover: DEFAULT_SLOT_LIMIT },
  accounts: {},
};

/** Manual corrections of the used slots: "account|week|format" → delta. */
export type SlotAdjustments = Record<string, number>;

export const adjustmentKey = (account: KdpAccount, week: string, format: KdpFormat) =>
  `${account}|${week}|${format}`;

export function limitsOf(limits: SlotLimits, account: KdpAccount): FormatCounts {
  return limits.accounts[account] ?? limits.base;
}

export type SlotUsage = {
  format: KdpFormat;
  /** From the "Reale" tasks of the week. */
  fromTasks: number;
  /** Manual correction, may be negative. */
  adjustment: number;
  used: number;
  limit: number;
  left: number;
};

/** Used, limit and left slots per format, for one account and week. */
export function slotUsage(
  tasks: Pick<KdpTaskItem, "account" | "week" | "track" | "formats">[],
  account: KdpAccount,
  week: string,
  limits: SlotLimits,
  adjustments: SlotAdjustments,
): SlotUsage[] {
  const limit = limitsOf(limits, account);
  return KDP_FORMATS.map((format) => {
    const fromTasks = tasks.filter(
      (t) =>
        t.account === account &&
        t.week === week &&
        t.track === "actual" &&
        t.formats.includes(format),
    ).length;
    const adjustment = adjustments[adjustmentKey(account, week, format)] ?? 0;
    const used = Math.max(0, fromTasks + adjustment);
    return {
      format,
      fromTasks,
      adjustment,
      used,
      limit: limit[format],
      left: limit[format] - used,
    };
  });
}
