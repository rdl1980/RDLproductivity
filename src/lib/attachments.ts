/** Shared attachment rules for the client and the server. */

export const MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024;
export const MAX_ATTACHMENTS_PER_CARD = 50;

/**
 * "local" stores files on disk (development and tests); otherwise the browser
 * uploads straight to the private Vercel Blob store.
 */
export const ATTACHMENT_STORAGE =
  process.env.NEXT_PUBLIC_ATTACHMENT_STORAGE === "local" ? "local" : "blob";

/**
 * Raster images shown inline (thumbnails, covers). SVG is excluded on purpose:
 * it can carry scripts, so it is only ever downloaded.
 */
export function isImage(contentType: string): boolean {
  return /^image\/(png|jpe?g|gif|webp|avif)$/.test(contentType);
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1).replace(".", ",")} MB`;
}

/** Storage key: unique folder per upload, original (sanitized) file name. */
export function storageKey(cardId: string, fileName: string, unique: string): string {
  const safe =
    fileName
      .normalize("NFKD")
      .replace(/[^\w.-]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(-100) || "file";
  return `cards/${cardId}/${unique}/${safe}`;
}
