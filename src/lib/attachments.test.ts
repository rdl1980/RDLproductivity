import { describe, expect, it } from "vitest";

import { formatBytes, isImage, storageKey } from "./attachments";

describe("attachments", () => {
  it("recognises images", () => {
    expect(isImage("image/png")).toBe(true);
    expect(isImage("image/jpeg")).toBe(true);
    expect(isImage("application/pdf")).toBe(false);
    expect(isImage("image/x-icon")).toBe(false);
    expect(isImage("image/svg+xml")).toBe(false);
  });

  it("formats sizes", () => {
    expect(formatBytes(512)).toBe("512 B");
    expect(formatBytes(2048)).toBe("2 KB");
    expect(formatBytes(3.5 * 1024 * 1024)).toBe("3,5 MB");
  });

  it("builds safe storage keys", () => {
    expect(storageKey("c1", "Fattura è 2026.pdf", "u1")).toBe("cards/c1/u1/Fattura-e-2026.pdf");
    expect(storageKey("c1", "../../etc/passwd", "u1")).toBe("cards/c1/u1/..-..-etc-passwd");
    expect(storageKey("c1", "???", "u1")).toBe("cards/c1/u1/file");
  });
});
