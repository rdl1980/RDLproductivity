"use server";

import { revalidatePath } from "next/cache";

import { runBackup } from "@/server/backup-job";
import { disconnectDrive } from "@/server/google-drive";
import { isAuthenticated } from "@/server/session";

import { type ActionResult, fail, ok, UNAUTHORIZED } from "./result";

export async function runBackupNow(): Promise<ActionResult<{ message: string }>> {
  if (!(await isAuthenticated())) return fail(UNAUTHORIZED);
  const run = await runBackup();
  revalidatePath("/connections");
  return run.ok ? ok({ message: run.message }) : fail(run.message);
}

export async function disconnectGoogleDrive(): Promise<ActionResult<null>> {
  if (!(await isAuthenticated())) return fail(UNAUTHORIZED);
  await disconnectDrive();
  revalidatePath("/connections");
  return ok(null);
}
