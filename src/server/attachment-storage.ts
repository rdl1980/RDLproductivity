import "server-only";

import { randomUUID } from "node:crypto";
import { mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";

import { del, get, head } from "@vercel/blob";

import { ATTACHMENT_STORAGE } from "@/lib/attachments";
import { db } from "@/server/db";

const LOCAL_PREFIX = "local:";
const LOCAL_ROOT = path.join(process.cwd(), ".data", "attachments");

export type StoredFile = { url: string; size: number; contentType: string };

function localPath(url: string): string {
  const key = url.slice(LOCAL_PREFIX.length);
  const resolved = path.resolve(LOCAL_ROOT, key);
  // Keys come from the database, but never let one escape the storage root.
  if (!resolved.startsWith(LOCAL_ROOT + path.sep)) throw new Error("Invalid attachment key");
  return resolved;
}

/** Local driver only: the browser posts the file to our own route. */
export async function saveLocalFile(key: string, data: Buffer): Promise<string> {
  const url = `${LOCAL_PREFIX}${key}`;
  const file = localPath(url);
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, data);
  return url;
}

/** Checks that an uploaded file exists in our store and returns its metadata. */
export async function inspectUpload(url: string): Promise<StoredFile | null> {
  if (url.startsWith(LOCAL_PREFIX)) {
    if (ATTACHMENT_STORAGE !== "local") return null;
    try {
      const info = await stat(localPath(url));
      return { url, size: info.size, contentType: "application/octet-stream" };
    } catch {
      return null;
    }
  }
  try {
    // `head` only answers for blobs of the store our token belongs to.
    const blob = await head(url);
    return { url: blob.url, size: blob.size, contentType: blob.contentType };
  } catch {
    return null;
  }
}

export type FileStream = { body: ReadableStream<Uint8Array> | Buffer; size: number | null };

export async function readFileStream(url: string): Promise<FileStream | null> {
  if (url.startsWith(LOCAL_PREFIX)) {
    try {
      const data = await readFile(localPath(url));
      return { body: data, size: data.length };
    } catch {
      return null;
    }
  }
  const result = await get(url, { access: "private" }).catch(() => null);
  if (!result || result.statusCode !== 200) return null;
  return { body: result.stream, size: result.blob.size };
}

/** Best effort: a missing file is not an error. */
export async function deleteFiles(urls: string[]): Promise<void> {
  const local = urls.filter((url) => url.startsWith(LOCAL_PREFIX));
  const remote = urls.filter((url) => !url.startsWith(LOCAL_PREFIX));
  await Promise.all(local.map((url) => rm(localPath(url), { force: true }).catch(() => {})));
  if (remote.length > 0) await del(remote).catch(() => {});
}

export function uniqueSegment(): string {
  return randomUUID();
}

/** Deletes stored files that no attachment row points to any more. */
export async function removeUnreferencedFiles(urls: string[]): Promise<void> {
  if (urls.length === 0) return;
  const stillUsed = await db.attachment.findMany({
    where: { url: { in: urls } },
    select: { url: true },
  });
  const used = new Set(stillUsed.map((row) => row.url));
  await deleteFiles(urls.filter((url) => !used.has(url)));
}
