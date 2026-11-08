"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { logActivity } from "@/server/activity";
import { isAuthenticated } from "@/server/session";
import { setSetting } from "@/server/telegram-settings";
import { fetchVideoStats, runYouTubeMetrics, YOUTUBE_KEY, YouTubeError } from "@/server/youtube";

import { type ActionResult, fail, ok, parse, UNAUTHORIZED } from "./result";

const keySchema = z
  .string()
  .trim()
  .regex(/^[\w-]{30,60}$/, "Chiave non valida: è del tipo AIza…, da Google Cloud.");

/** Saves the YouTube Data API key after a test call. */
export async function saveYouTubeKey(key: string): Promise<ActionResult<null>> {
  if (!(await isAuthenticated())) return fail(UNAUTHORIZED);
  const { data, error } = parse(keySchema, key);
  if (data === null) return fail(error);
  try {
    // A public video: the key works if YouTube answers.
    await fetchVideoStats(data, ["jNQXAC9IVRw"]);
  } catch (e) {
    return fail(e instanceof YouTubeError ? e.message : "Verifica non riuscita, riprova.");
  }
  await setSetting(YOUTUBE_KEY, data);
  await logActivity({ kind: "youtube.connect", summary: "Chiave YouTube salvata", entityIds: [] });
  revalidatePath("/connections");
  return ok(null);
}

export async function removeYouTubeKey(): Promise<ActionResult<null>> {
  if (!(await isAuthenticated())) return fail(UNAUTHORIZED);
  await setSetting(YOUTUBE_KEY, null);
  revalidatePath("/connections");
  return ok(null);
}

/** Reads the numbers now, outside the daily run. */
export async function refreshYouTubeMetrics(): Promise<ActionResult<{ message: string }>> {
  if (!(await isAuthenticated())) return fail(UNAUTHORIZED);
  const run = await runYouTubeMetrics();
  if (!run) return fail("Salva prima la chiave YouTube.");
  revalidatePath("/connections");
  revalidatePath("/robotti", "layout");
  return run.ok ? ok({ message: run.message }) : fail(run.message);
}
