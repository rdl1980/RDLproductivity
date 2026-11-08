import "server-only";

import { CONTENT_TIME_ZONE, dayIn } from "@/lib/content";
import { hourIn } from "@/lib/content-reminder";
import { backupDue } from "@/lib/backup";
import { buildBackup } from "@/server/backup";
import { getSetting, setSetting } from "@/server/telegram-settings";
import { DRIVE_EMAIL_KEY, DRIVE_TOKEN_KEY, DriveError, uploadBackup } from "@/server/google-drive";
import { getTelegramConfig, sendTelegram } from "@/server/telegram";

export const BACKUP_LAST_RUN = "backup.lastRun";
const BACKUP_DAY = "backup.lastDay";

export type BackupRun = { at: string; ok: boolean; message: string; bytes: number };

const megabytes = (bytes: number) =>
  `${(bytes / 1_048_576).toLocaleString("it-IT", { maximumFractionDigits: 1 })} MB`;

/** Builds the backup and uploads it to Drive; the outcome goes to Telegram too. */
export async function runBackup(now = new Date()): Promise<BackupRun> {
  let run: BackupRun;
  try {
    const backup = await buildBackup(now);
    await uploadBackup(backup.name, backup.data);
    run = {
      at: now.toISOString(),
      ok: true,
      bytes: backup.data.length,
      message: `${backup.name} su Drive (${megabytes(backup.data.length)}, ${backup.rows} righe)`,
    };
  } catch (error) {
    run = {
      at: now.toISOString(),
      ok: false,
      bytes: 0,
      message:
        error instanceof DriveError ? error.message : `Backup non riuscito: ${String(error)}`,
    };
  }
  await setSetting(BACKUP_LAST_RUN, JSON.stringify(run));
  try {
    const config = await getTelegramConfig();
    if (config)
      await sendTelegram(
        config,
        `${run.ok ? "💾 Backup settimanale salvato:" : "⚠️"} ${run.message}`,
      );
  } catch {
    // The outcome is in the page anyway.
  }
  return run;
}

/** Sunday from 3:00 (Rome), once a week, only with Drive connected. */
export async function runBackupIfDue(now: Date): Promise<string> {
  if (!(await getSetting(DRIVE_TOKEN_KEY))) return "off";
  const today = dayIn(now, CONTENT_TIME_ZONE);
  if (!backupDue(today, hourIn(now), await getSetting(BACKUP_DAY))) return "not-due";
  // Marked first: a failing upload retries next week, not every hour.
  await setSetting(BACKUP_DAY, today);
  return (await runBackup(now)).message;
}

export async function getBackupStatus(): Promise<{
  driveEmail: string | null;
  connected: boolean;
  lastRun: BackupRun | null;
}> {
  const [token, email, last] = await Promise.all([
    getSetting(DRIVE_TOKEN_KEY),
    getSetting(DRIVE_EMAIL_KEY),
    getSetting(BACKUP_LAST_RUN),
  ]);
  let lastRun: BackupRun | null = null;
  try {
    lastRun = last ? (JSON.parse(last) as BackupRun) : null;
  } catch {
    lastRun = null;
  }
  return { connected: !!token, driveEmail: email, lastRun };
}
