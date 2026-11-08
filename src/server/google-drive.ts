import "server-only";

import { BACKUPS_KEPT } from "@/lib/backup";
import { getSetting, setSetting } from "@/server/telegram-settings";

/**
 * Google Drive for the weekly backup, with the owner's own account: the
 * OAuth client already used for the Google login, scope `drive.file` (only
 * the files the app creates). The refresh token lives in AppSetting.
 */
export const DRIVE_TOKEN_KEY = "google.drive.refreshToken";
export const DRIVE_FOLDER_KEY = "google.drive.folderId";
export const DRIVE_EMAIL_KEY = "google.drive.email";
/** Cookie holding the OAuth state between the consent and the callback. */
export const DRIVE_STATE_COOKIE = "rdl-drive-state";
export const DRIVE_SCOPE = "https://www.googleapis.com/auth/drive.file";
const FOLDER_NAME = "RDL Productivity backup";

/** Overridable in tests, to point at a stub server. */
const authBase = () => process.env.GOOGLE_AUTH_URL ?? "https://accounts.google.com";
const tokenBase = () => process.env.GOOGLE_TOKEN_URL ?? "https://oauth2.googleapis.com";
const apiBase = () => process.env.GOOGLE_API_URL ?? "https://www.googleapis.com";

export class DriveError extends Error {}

export function driveClient(): { id: string; secret: string } | null {
  const id = process.env.AUTH_GOOGLE_ID;
  const secret = process.env.AUTH_GOOGLE_SECRET;
  return id && secret ? { id, secret } : null;
}

export const driveRedirectUri = (origin: string) => `${origin}/api/google-drive/callback`;

export function driveConsentUrl(origin: string, state: string): string | null {
  const client = driveClient();
  if (!client) return null;
  const params = new URLSearchParams({
    client_id: client.id,
    redirect_uri: driveRedirectUri(origin),
    response_type: "code",
    scope: `${DRIVE_SCOPE} openid email`,
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "true",
    state,
  });
  return `${authBase()}/o/oauth2/v2/auth?${params}`;
}

async function tokenRequest(body: Record<string, string>) {
  const client = driveClient();
  if (!client) throw new DriveError("Login Google non configurato (AUTH_GOOGLE_ID).");
  let res: Response;
  try {
    res = await fetch(`${tokenBase()}/token`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ client_id: client.id, client_secret: client.secret, ...body }),
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    throw new DriveError("Google non risponde, riprova.");
  }
  const json = (await res.json().catch(() => null)) as {
    access_token?: string;
    refresh_token?: string;
    id_token?: string;
    error?: string;
    error_description?: string;
  } | null;
  if (!res.ok || !json?.access_token) {
    throw new DriveError(
      json?.error === "invalid_grant"
        ? "Accesso a Drive revocato o scaduto: ricollega Google Drive."
        : `Google: ${json?.error_description ?? json?.error ?? res.status}`,
    );
  }
  return json;
}

/** Exchanges the consent code and keeps the refresh token. */
export async function connectDrive(code: string, origin: string): Promise<void> {
  const json = await tokenRequest({
    code,
    grant_type: "authorization_code",
    redirect_uri: driveRedirectUri(origin),
  });
  if (!json.refresh_token) {
    throw new DriveError("Google non ha dato l'accesso permanente: riprova a collegare.");
  }
  await setSetting(DRIVE_TOKEN_KEY, json.refresh_token);
  await setSetting(DRIVE_FOLDER_KEY, null);
  const email = emailOf(json.id_token);
  await setSetting(DRIVE_EMAIL_KEY, email);
}

function emailOf(idToken: string | undefined): string | null {
  try {
    const payload = JSON.parse(Buffer.from(idToken!.split(".")[1], "base64url").toString());
    return typeof payload.email === "string" ? payload.email : null;
  } catch {
    return null;
  }
}

async function accessToken(): Promise<string> {
  const refresh = await getSetting(DRIVE_TOKEN_KEY);
  if (!refresh) throw new DriveError("Google Drive non collegato.");
  return (await tokenRequest({ refresh_token: refresh, grant_type: "refresh_token" }))
    .access_token!;
}

async function drive<T>(token: string, path: string, init: RequestInit = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${apiBase()}${path}`, {
      ...init,
      headers: { authorization: `Bearer ${token}`, ...(init.headers ?? {}) },
      signal: AbortSignal.timeout(60_000),
    });
  } catch {
    throw new DriveError("Google Drive non risponde, riprova.");
  }
  if (res.status === 204) return undefined as T;
  const json = (await res.json().catch(() => null)) as T & { error?: { message?: string } };
  if (!res.ok) throw new DriveError(`Google Drive: ${json?.error?.message ?? res.status}`);
  return json;
}

/** The app's backup folder, created on first use (it may have been deleted). */
async function folderId(token: string): Promise<string> {
  const saved = await getSetting(DRIVE_FOLDER_KEY);
  if (saved) {
    const found = await drive<{ id?: string; trashed?: boolean }>(
      token,
      `/drive/v3/files/${saved}?fields=id,trashed`,
    ).catch(() => null);
    if (found?.id && !found.trashed) return saved;
  }
  const created = await drive<{ id: string }>(token, "/drive/v3/files?fields=id", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name: FOLDER_NAME, mimeType: "application/vnd.google-apps.folder" }),
  });
  await setSetting(DRIVE_FOLDER_KEY, created.id);
  return created.id;
}

/** Uploads the zip into the backup folder and deletes all but the last 12. */
export async function uploadBackup(name: string, data: Buffer): Promise<{ id: string }> {
  const token = await accessToken();
  const parent = await folderId(token);
  const boundary = `rdl${Date.now().toString(36)}`;
  const meta = JSON.stringify({ name, parents: [parent], mimeType: "application/zip" });
  const body = Buffer.concat([
    Buffer.from(
      `--${boundary}\r\ncontent-type: application/json; charset=UTF-8\r\n\r\n${meta}\r\n--${boundary}\r\ncontent-type: application/zip\r\n\r\n`,
    ),
    data,
    Buffer.from(`\r\n--${boundary}--`),
  ]);
  const file = await drive<{ id: string }>(
    token,
    "/upload/drive/v3/files?uploadType=multipart&fields=id",
    {
      method: "POST",
      headers: { "content-type": `multipart/related; boundary=${boundary}` },
      body,
    },
  );
  const list = await drive<{ files?: { id: string }[] }>(
    token,
    `/drive/v3/files?q=${encodeURIComponent(`'${parent}' in parents and trashed = false`)}&orderBy=createdTime desc&fields=files(id)&pageSize=100`,
  );
  for (const old of (list.files ?? []).slice(BACKUPS_KEPT)) {
    await drive(token, `/drive/v3/files/${old.id}`, { method: "DELETE" }).catch(() => undefined);
  }
  return file;
}

export async function disconnectDrive(): Promise<void> {
  const refresh = await getSetting(DRIVE_TOKEN_KEY);
  if (refresh) {
    await fetch(`${tokenBase()}/revoke?token=${encodeURIComponent(refresh)}`, {
      method: "POST",
    }).catch(() => undefined);
  }
  await setSetting(DRIVE_TOKEN_KEY, null);
  await setSetting(DRIVE_FOLDER_KEY, null);
  await setSetting(DRIVE_EMAIL_KEY, null);
}
