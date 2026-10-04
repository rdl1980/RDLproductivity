import { describe, expect, it } from "vitest";

import { isEmailAllowed, parseAllowedEmails } from "./allowed-email";

describe("allowed email", () => {
  it("parses a single address or a comma-separated list", () => {
    expect(parseAllowedEmails("me@example.com")).toEqual(["me@example.com"]);
    expect(parseAllowedEmails(" A@x.com , b@y.com ,")).toEqual(["a@x.com", "b@y.com"]);
    expect(parseAllowedEmails(undefined)).toEqual([]);
  });

  it("matches case-insensitively", () => {
    expect(isEmailAllowed("Me@Example.com", "me@example.com")).toBe(true);
  });

  it("denies everything when unset or email missing", () => {
    expect(isEmailAllowed("me@example.com", "")).toBe(false);
    expect(isEmailAllowed("me@example.com", undefined)).toBe(false);
    expect(isEmailAllowed(null, "me@example.com")).toBe(false);
  });

  it("denies other addresses", () => {
    expect(isEmailAllowed("other@example.com", "me@example.com")).toBe(false);
  });
});
