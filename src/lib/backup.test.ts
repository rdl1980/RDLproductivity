import { describe, expect, it } from "vitest";

import { backupDue, isSecretSetting } from "./backup";

describe("isSecretSetting", () => {
  it("leaves credentials out and keeps the rest", () => {
    for (const key of [
      "telegram.botToken",
      "telegram.webhookSecret",
      "cron.secret",
      "youtube.apiKey",
      "google.drive.refreshToken",
      "kdp.autosync.main",
    ]) {
      expect(isSecretSetting(key)).toBe(true);
    }
    for (const key of ["telegram.chatId", "kdp.sales.main", "content.plan", "youtube.lastRun"]) {
      expect(isSecretSetting(key)).toBe(false);
    }
  });
});

describe("backupDue", () => {
  it("runs on Sunday from 3:00, once", () => {
    expect(backupDue("2026-11-08", 2, "2026-11-01")).toBe(false);
    expect(backupDue("2026-11-08", 3, "2026-11-01")).toBe(true);
    expect(backupDue("2026-11-08", 9, "2026-11-08")).toBe(false);
    expect(backupDue("2026-11-05", 9, "2026-11-01")).toBe(false);
  });
  it("catches up a missed week, and makes the first one at once", () => {
    expect(backupDue("2026-11-09", 9, "2026-11-01")).toBe(true);
    expect(backupDue("2026-11-04", 9, null)).toBe(true);
  });
});
