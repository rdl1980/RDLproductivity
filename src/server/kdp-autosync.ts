import "server-only";

import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

import { KDP_ACCOUNT_VALUES, type KdpAccount } from "@/lib/kdp";
import { db } from "@/server/db";

/**
 * Hourly automatic sales sync: the browser extension of an account reads the
 * KDP Reports by itself and posts them to `/api/kdp/autosync` with a bearer
 * token. One token per account (the browser where it was enabled), stored
 * hashed in AppSetting `kdp.autosync.<account>`; enabling again rotates it.
 */
export const autoSyncKey = (account: KdpAccount) => `kdp.autosync.${account}`;

export type AutoSyncRun = { at: string; ok: boolean; message: string };
type Stored = { tokenHash: string; enabledAt: string; lastRun?: AutoSyncRun };

const sha256 = (value: string) => createHash("sha256").update(value).digest("hex");

function parseStored(value: string | undefined): Stored | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as Stored;
    return typeof parsed.tokenHash === "string" ? parsed : null;
  } catch {
    return null;
  }
}

/** A new token for the account; the previous one stops working. */
export async function issueAutoSyncToken(account: KdpAccount): Promise<string> {
  const token = randomBytes(32).toString("base64url");
  const stored: Stored = { tokenHash: sha256(token), enabledAt: new Date().toISOString() };
  await db.appSetting.upsert({
    where: { key: autoSyncKey(account) },
    create: { key: autoSyncKey(account), value: JSON.stringify(stored) },
    update: { value: JSON.stringify(stored) },
  });
  return token;
}

export async function revokeAutoSync(account: KdpAccount): Promise<void> {
  await db.appSetting.deleteMany({ where: { key: autoSyncKey(account) } });
}

/** The account a bearer token belongs to, or null. */
export async function autoSyncAccount(header: string | null): Promise<KdpAccount | null> {
  const token = header?.replace(/^Bearer\s+/i, "").trim() ?? "";
  if (token.length < 32) return null;
  const given = Buffer.from(sha256(token));
  const rows = await db.appSetting.findMany({
    where: { key: { in: KDP_ACCOUNT_VALUES.map(autoSyncKey) } },
  });
  for (const account of KDP_ACCOUNT_VALUES) {
    const stored = parseStored(rows.find((r) => r.key === autoSyncKey(account))?.value);
    if (stored && timingSafeEqual(given, Buffer.from(stored.tokenHash))) return account;
  }
  return null;
}

export async function recordAutoSyncRun(account: KdpAccount, run: AutoSyncRun): Promise<void> {
  const row = await db.appSetting.findUnique({ where: { key: autoSyncKey(account) } });
  const stored = parseStored(row?.value);
  if (!stored) return;
  await db.appSetting.update({
    where: { key: autoSyncKey(account) },
    data: { value: JSON.stringify({ ...stored, lastRun: run }) },
  });
}

export type AutoSyncStatus = {
  account: KdpAccount;
  enabledAt: string | null;
  lastRun: AutoSyncRun | null;
};

export async function getAutoSyncStatus(): Promise<AutoSyncStatus[]> {
  const rows = await db.appSetting.findMany({
    where: { key: { in: KDP_ACCOUNT_VALUES.map(autoSyncKey) } },
  });
  return KDP_ACCOUNT_VALUES.map((account) => {
    const stored = parseStored(rows.find((r) => r.key === autoSyncKey(account))?.value);
    return { account, enabledAt: stored?.enabledAt ?? null, lastRun: stored?.lastRun ?? null };
  });
}
