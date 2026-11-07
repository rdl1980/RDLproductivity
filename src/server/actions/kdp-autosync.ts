"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { accountLabel, KDP_ACCOUNT_VALUES } from "@/lib/kdp";
import { logActivity } from "@/server/activity";
import { db } from "@/server/db";
import { issueAutoSyncToken, revokeAutoSync } from "@/server/kdp-autosync";
import { SALES_ALERTS_KEY } from "@/server/kdp-sales-import";
import { isAuthenticated } from "@/server/session";

import { type ActionResult, fail, ok, parse, UNAUTHORIZED } from "./result";

const accountSchema = z.enum(KDP_ACCOUNT_VALUES, "Account non valido.");

const done = () => revalidatePath("/kdp/estensione");

/**
 * Turns on the hourly sync for an account and returns its token, which the
 * page hands to the extension of this browser (shown nowhere else).
 */
export async function enableKdpAutoSync(account: string): Promise<ActionResult<{ token: string }>> {
  if (!(await isAuthenticated())) return fail(UNAUTHORIZED);
  const { data, error } = parse(accountSchema, account);
  if (data === null) return fail(error);
  const token = await issueAutoSyncToken(data);
  await logActivity({
    kind: "kdp.autosync",
    summary: `Aggiornamento automatico delle vendite attivato (${accountLabel(data)})`,
    entityIds: [],
  });
  done();
  return ok({ token });
}

export async function disableKdpAutoSync(account: string): Promise<ActionResult<null>> {
  if (!(await isAuthenticated())) return fail(UNAUTHORIZED);
  const { data, error } = parse(accountSchema, account);
  if (data === null) return fail(error);
  await revokeAutoSync(data);
  await logActivity({
    kind: "kdp.autosync",
    summary: `Aggiornamento automatico delle vendite disattivato (${accountLabel(data)})`,
    entityIds: [],
  });
  done();
  return ok(null);
}

export async function setKdpSalesAlerts(on: boolean): Promise<ActionResult<null>> {
  if (!(await isAuthenticated())) return fail(UNAUTHORIZED);
  const { data, error } = parse(z.boolean(), on);
  if (data === null) return fail(error);
  await db.appSetting.upsert({
    where: { key: SALES_ALERTS_KEY },
    create: { key: SALES_ALERTS_KEY, value: data ? "on" : "off" },
    update: { value: data ? "on" : "off" },
  });
  done();
  return ok(null);
}
