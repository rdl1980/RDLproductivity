import "server-only";

import JSZip from "jszip";

import { BACKUP_SKIPPED_MODELS, isSecretSetting } from "@/lib/backup";
import { Prisma } from "@/generated/prisma/client";
import { db } from "@/server/db";

/**
 * Full backup of the database as a zip: one JSON file per table, plus a
 * manifest. Credentials (bot token, API keys, Drive token, OAuth tables)
 * stay out; attachments are listed by their stored URL, not copied.
 */
export async function buildBackup(
  now = new Date(),
): Promise<{ name: string; data: Buffer; rows: number }> {
  const zip = new JSZip();
  const counts: Record<string, number> = {};
  for (const model of Object.values(Prisma.ModelName)) {
    if (BACKUP_SKIPPED_MODELS.includes(model)) continue;
    const delegate = (db as unknown as Record<string, { findMany(): Promise<unknown[]> }>)[
      model.charAt(0).toLowerCase() + model.slice(1)
    ];
    let rows = await delegate.findMany();
    if (model === "AppSetting") {
      rows = (rows as { key: string }[]).filter((r) => !isSecretSetting(r.key));
    }
    counts[model] = rows.length;
    zip.file(`${model}.json`, JSON.stringify(rows));
  }
  zip.file(
    "manifest.json",
    JSON.stringify(
      {
        app: "rdlproductivity",
        kind: "full-backup",
        version: 1,
        createdAt: now.toISOString(),
        tables: counts,
        skipped: [...BACKUP_SKIPPED_MODELS, "AppSetting: credentials"],
      },
      null,
      2,
    ),
  );
  const data = await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
  return {
    name: `rdlproductivity-backup-${now.toISOString().slice(0, 10)}.zip`,
    data,
    rows: Object.values(counts).reduce((a, b) => a + b, 0),
  };
}
