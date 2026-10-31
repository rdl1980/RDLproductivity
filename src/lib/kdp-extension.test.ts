import { describe, expect, it } from "vitest";

import { EXTENSION_VERSION, olderVersion } from "./kdp-extension";

describe("extension version", () => {
  it("compares versions number by number", () => {
    expect(olderVersion("1.0.2", "1.0.3")).toBe(true);
    expect(olderVersion("1.0.3", "1.0.3")).toBe(false);
    expect(olderVersion("1.0.10", "1.0.9")).toBe(false);
    expect(olderVersion("1.0", "1.0.1")).toBe(true);
  });

  it("is read from the manifest", () => {
    expect(EXTENSION_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
  });
});
