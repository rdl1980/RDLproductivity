"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { accountLabel, KDP_ACCOUNT_VALUES } from "@/lib/kdp";
import { formatEuro } from "@/lib/kdp-sales";
import { logActivity } from "@/server/activity";
import { db } from "@/server/db";
import { goalKey } from "@/server/queries/kdp-goals";
import { isAuthenticated } from "@/server/session";

import { type ActionResult, fail, ok, parse, UNAUTHORIZED } from "./result";

const goalSchema = z.object({
  account: z.enum(KDP_ACCOUNT_VALUES),
  /** Monthly royalty target in EUR; null removes it. */
  monthlyRoyalty: z.number().min(0).max(1_000_000).nullable(),
});

export async function setKdpGoal(input: z.input<typeof goalSchema>): Promise<ActionResult> {
  if (!(await isAuthenticated())) return fail(UNAUTHORIZED);
  const { data, error } = parse(goalSchema, input);
  if (!data) return fail(error);

  const key = goalKey(data.account);
  if (data.monthlyRoyalty === null || data.monthlyRoyalty === 0) {
    await db.appSetting.deleteMany({ where: { key } });
  } else {
    const value = String(Math.round(data.monthlyRoyalty * 100) / 100);
    await db.appSetting.upsert({ where: { key }, create: { key, value }, update: { value } });
  }
  await logActivity({
    kind: "kdp.goal",
    summary: data.monthlyRoyalty
      ? `Obiettivo mensile di ${accountLabel(data.account)}: ${formatEuro(data.monthlyRoyalty)}`
      : `Obiettivo mensile di ${accountLabel(data.account)} rimosso`,
    entityIds: [key],
  });
  revalidatePath("/kdp/vendite");
  revalidatePath("/riepilogo");
  return ok(undefined);
}
