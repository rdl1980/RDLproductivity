import "server-only";

import { KDP_ACCOUNT_VALUES, type KdpAccount } from "@/lib/kdp";
import { db } from "@/server/db";

export const goalKey = (account: KdpAccount) => `kdp.goal.${account}`;

export type KdpGoals = Record<KdpAccount, number | null>;

/** Monthly royalty target per account (EUR), null when not set. */
export async function getKdpGoals(): Promise<KdpGoals> {
  const settings = await db.appSetting.findMany({
    where: { key: { in: KDP_ACCOUNT_VALUES.map(goalKey) } },
  });
  const goals = Object.fromEntries(KDP_ACCOUNT_VALUES.map((a) => [a, null])) as KdpGoals;
  for (const setting of settings) {
    const value = Number(setting.value);
    if (Number.isFinite(value) && value > 0) {
      goals[setting.key.slice("kdp.goal.".length) as KdpAccount] = value;
    }
  }
  return goals;
}
