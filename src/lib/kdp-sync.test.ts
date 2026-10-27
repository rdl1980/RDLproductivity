import { beforeEach, describe, expect, it } from "vitest";

import {
  detectSync,
  finishSync,
  isSyncTab,
  markSyncStep,
  readSync,
  SYNC_WINDOW_NAME,
} from "./kdp-sync";

describe("kdp sync", () => {
  beforeEach(() => {
    localStorage.clear();
    window.name = "";
  });

  it("knows the launcher's tab", () => {
    expect(isSyncTab()).toBe(false);
    window.name = SYNC_WINDOW_NAME;
    expect(isSyncTab()).toBe(true);
  });

  it("remembers the steps done and the account, then forgets everything", () => {
    expect(readSync()).toBeNull();
    markSyncStep("books", "secondary", 1000);
    expect(readSync(2000)).toEqual({ account: "secondary", done: ["books"], at: 1000 });
    markSyncStep("sales", "secondary", 3000);
    expect(readSync(4000)?.done).toEqual(["books", "sales"]);
    window.name = SYNC_WINDOW_NAME;
    finishSync();
    expect(readSync()).toBeNull();
    expect(window.name).toBe("");
  });

  it("tells an import page which step it is", () => {
    expect(detectSync("sales")).toBeNull();
    window.name = SYNC_WINDOW_NAME;
    expect(detectSync("sales")).toEqual({ step: 1, account: null });
    markSyncStep("books", "main");
    expect(detectSync("sales")).toEqual({ step: 2, account: "main" });
    expect(detectSync("books")).toEqual({ step: 1, account: null });
  });

  it("drops a sync left half done an hour ago", () => {
    markSyncStep("sales", "main", 0);
    expect(readSync(61 * 60 * 1000)).toBeNull();
  });
});
