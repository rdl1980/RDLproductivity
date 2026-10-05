"use server";

import { revalidatePath } from "next/cache";

import { disableFeed, rotateFeed } from "@/server/ical-feed";
import { requireSession } from "@/server/session";

/** Enables the feed or replaces its URL. */
export async function rotateIcalFeed() {
  await requireSession();
  await rotateFeed();
  revalidatePath("/connections");
}

export async function disableIcalFeed() {
  await requireSession();
  await disableFeed();
  revalidatePath("/connections");
}
