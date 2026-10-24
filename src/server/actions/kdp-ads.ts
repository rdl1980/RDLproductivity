"use server";

import { revalidatePath } from "next/cache";

import { fxSchema } from "@/lib/kdp-ads";
import { logActivity } from "@/server/activity";
import { db } from "@/server/db";
import { FX_KEY } from "@/server/queries/kdp-ads";
import { isAuthenticated } from "@/server/session";

import { type ActionResult, fail, ok, parse, UNAUTHORIZED } from "./result";

/** EUR per unit of each currency, used to show ad spend next to EUR royalties. */
export async function setKdpFxRates(input: Record<string, number>): Promise<ActionResult> {
  if (!(await isAuthenticated())) return fail(UNAUTHORIZED);
  const { data, error } = parse(fxSchema, input);
  if (!data) return fail(error);
  const value = JSON.stringify(data);
  await db.appSetting.upsert({
    where: { key: FX_KEY },
    create: { key: FX_KEY, value },
    update: { value },
  });
  await logActivity({
    kind: "kdp.fx",
    summary: "Tassi di cambio per la spesa Ads aggiornati",
    entityIds: [FX_KEY],
  });
  revalidatePath("/kdp/vendite");
  revalidatePath("/kdp/ads/importa");
  return ok(undefined);
}
