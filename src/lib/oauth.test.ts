import { describe, expect, it } from "vitest";

import {
  base64url,
  hashToken,
  isClientMetadataUrl,
  isValidCodeChallenge,
  isValidRedirectUri,
  parseClientMetadataDocument,
  randomToken,
  sameResource,
  sha256,
  verifyPkce,
} from "./oauth";

describe("isValidRedirectUri", () => {
  it("accepts https and loopback http", () => {
    expect(isValidRedirectUri("https://claude.ai/api/mcp/auth_callback")).toBe(true);
    expect(isValidRedirectUri("http://localhost:6274/callback")).toBe(true);
    expect(isValidRedirectUri("http://127.0.0.1:33418/cb")).toBe(true);
  });

  it("rejects plain http, fragments, custom schemes and garbage", () => {
    expect(isValidRedirectUri("http://evil.example/cb")).toBe(false);
    expect(isValidRedirectUri("https://claude.ai/cb#frag")).toBe(false);
    expect(isValidRedirectUri("javascript:alert(1)")).toBe(false);
    expect(isValidRedirectUri("not a url")).toBe(false);
  });
});

describe("client ID metadata documents", () => {
  const clientId = "https://claude.ai/oauth/mcp-oauth-client-metadata";

  it("recognises metadata URLs", () => {
    expect(isClientMetadataUrl(clientId)).toBe(true);
    expect(isClientMetadataUrl("https://claude.ai/")).toBe(false);
    expect(isClientMetadataUrl("http://claude.ai/client")).toBe(false);
    expect(isClientMetadataUrl("abc123")).toBe(false);
  });

  it("validates the document against its URL", () => {
    const doc = {
      client_id: clientId,
      client_name: "Claude",
      redirect_uris: ["https://claude.ai/api/mcp/auth_callback"],
      token_endpoint_auth_method: "none",
    };
    expect(parseClientMetadataDocument(doc, clientId)).toEqual({
      name: "Claude",
      redirectUris: ["https://claude.ai/api/mcp/auth_callback"],
    });
    expect(
      parseClientMetadataDocument({ ...doc, client_id: "https://evil.example/x" }, clientId),
    ).toBeNull();
    expect(
      parseClientMetadataDocument({ ...doc, redirect_uris: ["http://evil.example"] }, clientId),
    ).toBeNull();
    expect(
      parseClientMetadataDocument(
        { ...doc, token_endpoint_auth_method: "client_secret_basic" },
        clientId,
      ),
    ).toBeNull();
    expect(parseClientMetadataDocument(null, clientId)).toBeNull();
  });

  it("falls back to the host as client name", () => {
    const doc = { client_id: clientId, redirect_uris: ["https://claude.ai/cb"] };
    expect(parseClientMetadataDocument(doc, clientId)?.name).toBe("claude.ai");
  });
});

describe("PKCE", () => {
  // RFC 7636 appendix B.
  const verifier = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk";
  const challenge = "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM";

  it("matches the RFC test vector", async () => {
    expect(base64url(await sha256(verifier))).toBe(challenge);
    expect(await verifyPkce(verifier, challenge)).toBe(true);
    expect(isValidCodeChallenge(challenge)).toBe(true);
  });

  it("rejects wrong or malformed verifiers", async () => {
    expect(await verifyPkce(verifier.replace("d", "e"), challenge)).toBe(false);
    expect(await verifyPkce("short", challenge)).toBe(false);
    expect(isValidCodeChallenge("plain-text-challenge")).toBe(false);
  });
});

describe("tokens", () => {
  it("are random, url-safe and hashed deterministically", async () => {
    const a = randomToken();
    expect(a).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(randomToken()).not.toBe(a);
    expect(await hashToken(a)).toBe(await hashToken(a));
    expect(await hashToken(a)).not.toBe(a);
  });

  it("compares resources ignoring a trailing slash", () => {
    expect(sameResource("https://x.app/api/mcp/", "https://x.app/api/mcp")).toBe(true);
    expect(sameResource("https://x.app/api/mcp", "https://y.app/api/mcp")).toBe(false);
  });
});
