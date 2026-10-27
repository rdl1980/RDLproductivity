import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { generatedScripts } from "../../extension/generate";
import { scraperSource } from "./kdp-bookmarklet";
import { salesCollectorSource } from "./kdp-sales-collector";

describe("KDP page scripts", () => {
  it("leave no hook placeholders", () => {
    for (const source of [
      scraperSource("https://app.test"),
      salesCollectorSource("https://app.test"),
      ...Object.values(generatedScripts()),
    ]) {
      expect(source).not.toMatch(/__(DELIVER|FAIL|PROGRESS|APP)__/);
    }
    expect(scraperSource("https://app.test")).toContain(
      '"https://app.test" + "/kdp/libri/importa#"',
    );
  });

  it("are committed in the extension as generated (run pnpm extension:build)", () => {
    for (const [name, source] of Object.entries(generatedScripts())) {
      const committed = readFileSync(
        path.join(__dirname, "..", "..", "extension", "scripts", name),
        "utf8",
      );
      expect(committed).toBe(source);
    }
  });
});
