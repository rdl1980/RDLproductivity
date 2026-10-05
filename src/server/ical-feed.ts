import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";

import { buildCalendar, type IcalEvent } from "@/lib/ical";
import { isPriority, PRIORITIES } from "@/lib/priority";
import { db } from "@/server/db";

const VERSION_KEY = "ical.version";
const EVENT_MINUTES = 30;
const PAST_DAYS = 90;

/**
 * The feed URL carries an HMAC of the feed version: nothing secret is stored,
 * and bumping the version revokes every previous URL.
 */
function tokenFor(version: number): string {
  const secret = process.env.AUTH_SECRET;
  if (!secret) throw new Error("AUTH_SECRET is not set");
  return createHmac("sha256", secret).update(`ical-feed:${version}`).digest("base64url");
}

/** Signed counter: positive = enabled at that version, negative = disabled. */
async function storedVersion(): Promise<number> {
  const setting = await db.appSetting.findUnique({ where: { key: VERSION_KEY } });
  const version = Number(setting?.value);
  return Number.isInteger(version) ? version : 0;
}

async function feedVersion(): Promise<number | null> {
  const version = await storedVersion();
  return version > 0 ? version : null;
}

async function storeVersion(version: number) {
  await db.appSetting.upsert({
    where: { key: VERSION_KEY },
    create: { key: VERSION_KEY, value: String(version) },
    update: { value: String(version) },
  });
}

/** Current feed token, or null when the feed is disabled. */
export async function currentFeedToken(): Promise<string | null> {
  const version = await feedVersion();
  return version === null ? null : tokenFor(version);
}

export async function isValidFeedToken(token: string): Promise<boolean> {
  const expected = await currentFeedToken();
  if (!expected) return false;
  const a = Buffer.from(token);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Enables the feed, or issues a new URL (the old one stops working). */
export async function rotateFeed(): Promise<void> {
  // Always a new version, so a re-enabled feed never reuses an old URL.
  await storeVersion(Math.abs(await storedVersion()) + 1);
}

export async function disableFeed(): Promise<void> {
  await storeVersion(-Math.abs(await storedVersion()));
}

/** Active cards with a due date, from 90 days ago on. */
export async function buildFeed(origin: string, now = new Date()): Promise<string> {
  const cards = await db.card.findMany({
    where: {
      archived: false,
      list: { archived: false, board: { archived: false } },
      dueDate: { gte: new Date(now.getTime() - PAST_DAYS * 24 * 60 * 60 * 1000) },
    },
    orderBy: { dueDate: "asc" },
    take: 2000,
    select: {
      id: true,
      title: true,
      dueDate: true,
      completed: true,
      priority: true,
      updatedAt: true,
      list: { select: { title: true, board: { select: { id: true, title: true } } } },
    },
  });
  const host = new URL(origin).host;
  const events: IcalEvent[] = cards.map((card) => {
    const due = card.dueDate!;
    const prefix = [
      card.completed ? "✓" : null,
      isPriority(card.priority) ? `[${PRIORITIES[card.priority].label}]` : null,
    ]
      .filter(Boolean)
      .join(" ");
    const url = `${origin}/boards/${card.list.board.id}?card=${card.id}`;
    return {
      uid: `${card.id}@${host}`,
      summary: prefix ? `${prefix} ${card.title}` : card.title,
      description: `${card.list.board.title} · ${card.list.title}\n${url}`,
      url,
      start: due,
      end: new Date(due.getTime() + EVENT_MINUTES * 60 * 1000),
      updated: card.updatedAt,
    };
  });
  return buildCalendar("RDL Productivity · Scadenze", events, now);
}
