/**
 * Pure helpers for the OAuth 2.1 authorization server that protects the MCP
 * endpoint. Kept free of server-only imports so they can be unit tested.
 */

export const MCP_SCOPE = "mcp";

/** Path of the MCP endpoint; its absolute URL is the OAuth resource identifier. */
export const MCP_PATH = "/api/mcp";

export const CODE_TTL_SECONDS = 5 * 60;
export const ACCESS_TOKEN_TTL_SECONDS = 60 * 60;
export const REFRESH_TOKEN_TTL_SECONDS = 60 * 24 * 60 * 60;

const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

/** Redirect URIs must be https, or http on a loopback host (native clients). */
export function isValidRedirectUri(value: string): boolean {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  if (url.hash) return false;
  if (url.protocol === "https:") return true;
  return url.protocol === "http:" && LOOPBACK_HOSTS.has(url.hostname);
}

/**
 * A client ID metadata document URL: https with a path, no fragment, no
 * credentials (draft-ietf-oauth-client-id-metadata-document).
 */
export function isClientMetadataUrl(clientId: string): boolean {
  let url: URL;
  try {
    url = new URL(clientId);
  } catch {
    return false;
  }
  return (
    url.protocol === "https:" && url.pathname !== "/" && !url.hash && !url.username && !url.password
  );
}

export type ClientMetadata = { name: string; redirectUris: string[] };

/** Validates a fetched client ID metadata document against its own URL. */
export function parseClientMetadataDocument(
  document: unknown,
  clientId: string,
): ClientMetadata | null {
  if (typeof document !== "object" || document === null) return null;
  const doc = document as Record<string, unknown>;
  if (doc.client_id !== clientId) return null;
  const redirectUris = doc.redirect_uris;
  if (
    !Array.isArray(redirectUris) ||
    redirectUris.length === 0 ||
    !redirectUris.every((uri) => typeof uri === "string" && isValidRedirectUri(uri))
  ) {
    return null;
  }
  // Metadata documents describe public clients only.
  const authMethod = doc.token_endpoint_auth_method;
  if (authMethod !== undefined && authMethod !== "none") return null;
  const name =
    typeof doc.client_name === "string" && doc.client_name.trim()
      ? doc.client_name.trim().slice(0, 100)
      : new URL(clientId).host;
  return { name, redirectUris: redirectUris as string[] };
}

/** This server has a single scope, granted whatever the client requests. */
export function grantedScope(): string {
  return MCP_SCOPE;
}

/** Base64url without padding (RFC 7636 appendix A). */
export function base64url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export async function sha256(value: string): Promise<Uint8Array> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return new Uint8Array(digest);
}

/** PKCE verifier: 43-128 chars from the unreserved set (RFC 7636 §4.1). */
export function isValidCodeVerifier(verifier: string): boolean {
  return /^[A-Za-z0-9\-._~]{43,128}$/.test(verifier);
}

/** S256 challenge: base64url SHA-256, always 43 chars. */
export function isValidCodeChallenge(challenge: string): boolean {
  return /^[A-Za-z0-9\-_]{43}$/.test(challenge);
}

export async function verifyPkce(verifier: string, challenge: string): Promise<boolean> {
  if (!isValidCodeVerifier(verifier)) return false;
  return base64url(await sha256(verifier)) === challenge;
}

/** Opaque random token with 256 bits of entropy. */
export function randomToken(): string {
  return base64url(crypto.getRandomValues(new Uint8Array(32)));
}

/** Tokens are stored hashed: a database leak does not leak usable credentials. */
export async function hashToken(token: string): Promise<string> {
  return base64url(await sha256(token));
}

/** Resource identifiers are compared without a trailing slash. */
export function sameResource(a: string, b: string): boolean {
  return a.replace(/\/+$/, "") === b.replace(/\/+$/, "");
}
