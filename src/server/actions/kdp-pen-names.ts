"use server";

import { revalidatePath } from "next/cache";

import { PEN_PROFILE_FIELDS, type PenProfile, penProfileSchema } from "@/lib/kdp-pen-names";
import { logActivity } from "@/server/activity";
import { db } from "@/server/db";
import { isAuthenticated } from "@/server/session";

import { type ActionResult, fail, ok, parse, UNAUTHORIZED } from "./result";

/**
 * Saves the details of a pen name, created on first save. Only the fields
 * given change; an empty string clears one.
 */
export async function savePenName(input: unknown): Promise<ActionResult<PenProfile>> {
  if (!(await isAuthenticated())) return fail(UNAUTHORIZED);
  const { data, error } = parse(penProfileSchema, input);
  if (!data) return fail(error);
  const fields = Object.fromEntries(
    PEN_PROFILE_FIELDS.filter((key) => data[key] !== undefined).map((key) => [key, data[key]]),
  );
  const { id, ...profile } = await db.kdpPenName.upsert({
    where: { name: data.name },
    create: { name: data.name, ...fields },
    update: fields,
    select: {
      id: true,
      name: true,
      ...Object.fromEntries(PEN_PROFILE_FIELDS.map((k) => [k, true])),
    },
  });
  await logActivity({
    kind: "kdp.penName",
    summary: `Anagrafica del pen name ${data.name} aggiornata`,
    entityIds: [id],
  });
  revalidatePath("/kdp/pen-name/anagrafica");
  return ok(profile as PenProfile);
}
