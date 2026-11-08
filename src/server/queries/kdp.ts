import "server-only";

import type { KdpAccount, KdpTaskItem, KdpTrack } from "@/lib/kdp";
import type { KdpFormat } from "@/lib/kdp-books";
import {
  DEFAULT_SLOT_LIMITS,
  type SlotAdjustments,
  type SlotLimits,
  slotLimitsSchema,
} from "@/lib/kdp-slots";
import { db } from "@/server/db";

export const SLOT_LIMITS_KEY = "kdp.slots.limits";
export const SLOT_ADJUST_KEY = "kdp.slots.adjust";

/** Weekly slot limits and the manual corrections of the used slots. */
export async function getKdpSlotSettings(): Promise<{
  limits: SlotLimits;
  adjustments: SlotAdjustments;
}> {
  const rows = await db.appSetting.findMany({
    where: { key: { in: [SLOT_LIMITS_KEY, SLOT_ADJUST_KEY] } },
  });
  const json = (key: string) => {
    try {
      return JSON.parse(rows.find((r) => r.key === key)?.value ?? "null") as unknown;
    } catch {
      return null;
    }
  };
  const limits = slotLimitsSchema.safeParse(json(SLOT_LIMITS_KEY));
  const raw = json(SLOT_ADJUST_KEY);
  const adjustments: SlotAdjustments = {};
  if (raw && typeof raw === "object") {
    for (const [k, v] of Object.entries(raw)) if (typeof v === "number") adjustments[k] = v;
  }
  return { limits: limits.success ? limits.data : DEFAULT_SLOT_LIMITS, adjustments };
}

/** Tasks of the weeks from `firstWeek` to `lastWeek` (Sundays, inclusive). */
export async function getKdpTasks(firstWeek: string, lastWeek: string): Promise<KdpTaskItem[]> {
  const tasks = await db.kdpTask.findMany({
    where: {
      week: { gte: new Date(`${firstWeek}T00:00:00Z`), lte: new Date(`${lastWeek}T00:00:00Z`) },
    },
    orderBy: [{ week: "asc" }, { account: "asc" }, { track: "asc" }, { position: "asc" }],
    select: {
      id: true,
      title: true,
      notes: true,
      account: true,
      track: true,
      week: true,
      position: true,
      done: true,
      formats: true,
    },
  });
  return tasks.map((task) => ({
    ...task,
    account: task.account as KdpAccount,
    track: task.track as KdpTrack,
    week: task.week.toISOString().slice(0, 10),
    formats: task.formats as KdpFormat[],
  }));
}
