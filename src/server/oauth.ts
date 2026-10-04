import "server-only";

import { isEmailAllowed } from "@/lib/allowed-email";
import {
  ACCESS_TOKEN_TTL_SECONDS,
  CODE_TTL_SECONDS,
  type ClientMetadata,
  hashToken,
  isClientMetadataUrl,
  MCP_PATH,
  parseClientMetadataDocument,
  randomToken,
  REFRESH_TOKEN_TTL_SECONDS,
  verifyPkce,
} from "@/lib/oauth";
import { db } from "@/server/db";

/**
 * Public origin of this deployment; it is also the OAuth issuer. `AUTH_URL`
 * wins when set, otherwise the proxy headers decide (Vercel sets them).
 */
export function issuerFromHeaders(headers: Headers, fallbackProtocol = "https:"): string {
  const configured = process.env.AUTH_URL?.replace(/\/+$/, "");
  if (configured) return configured;
  const host = (headers.get("x-forwarded-host") ?? headers.get("host"))?.split(",")[0].trim();
  if (!host) throw new Error("Cannot determine the public origin.");
  const protocol =
    headers.get("x-forwarded-proto")?.split(",")[0].trim() ?? fallbackProtocol.replace(/:$/, "");
  return `${protocol}://${host}`;
}

export function issuerOf(req: Request): string {
  return issuerFromHeaders(req.headers, new URL(req.url).protocol);
}

export function resourceOf(issuer: string): string {
  return `${issuer}${MCP_PATH}`;
}

export type OAuthClientInfo = ClientMetadata & { id: string; secretHash: string | null };

const METADATA_FETCH_TIMEOUT_MS = 5000;
const METADATA_MAX_BYTES = 64 * 1024;

/** Fetches and validates a client ID metadata document. */
async function fetchClientMetadata(clientId: string): Promise<ClientMetadata | null> {
  try {
    const response = await fetch(clientId, {
      headers: { accept: "application/json" },
      redirect: "error",
      signal: AbortSignal.timeout(METADATA_FETCH_TIMEOUT_MS),
    });
    if (!response.ok) return null;
    const text = await response.text();
    if (text.length > METADATA_MAX_BYTES) return null;
    return parseClientMetadataDocument(JSON.parse(text), clientId);
  } catch {
    return null;
  }
}

/** Resolves a registered client, or a metadata-document client by URL. */
export async function findClient(clientId: string): Promise<OAuthClientInfo | null> {
  if (isClientMetadataUrl(clientId)) {
    const metadata = await fetchClientMetadata(clientId);
    return metadata && { ...metadata, id: clientId, secretHash: null };
  }
  const client = await db.oAuthClient.findUnique({ where: { id: clientId } });
  return client && { ...client };
}

export async function registerClient(metadata: ClientMetadata & { confidential: boolean }) {
  const id = randomToken();
  const secret = metadata.confidential ? randomToken() : null;
  await db.oAuthClient.create({
    data: {
      id,
      name: metadata.name,
      redirectUris: metadata.redirectUris,
      secretHash: secret ? await hashToken(secret) : null,
    },
  });
  return { id, secret };
}

/** Client authentication at the token endpoint (public clients send no secret). */
export async function authenticateClient(
  client: { secretHash: string | null },
  secret: string | null,
): Promise<boolean> {
  if (client.secretHash === null) return true;
  return secret !== null && (await hashToken(secret)) === client.secretHash;
}

export async function createAuthorizationCode(grant: {
  clientId: string;
  email: string;
  redirectUri: string;
  codeChallenge: string;
  scope: string;
  resource: string;
}): Promise<string> {
  const code = randomToken();
  await db.oAuthCode.create({
    data: {
      ...grant,
      codeHash: await hashToken(code),
      expiresAt: new Date(Date.now() + CODE_TTL_SECONDS * 1000),
    },
  });
  // Opportunistic cleanup: codes are short-lived.
  await db.oAuthCode.deleteMany({ where: { expiresAt: { lt: new Date() } } });
  return code;
}

export type TokenResponse = {
  access_token: string;
  token_type: "Bearer";
  expires_in: number;
  refresh_token: string;
  scope: string;
};

export type TokenError = { error: string; error_description?: string };

async function issueTokens() {
  const accessToken = randomToken();
  const refreshToken = randomToken();
  const now = Date.now();
  return {
    accessToken,
    refreshToken,
    data: {
      accessTokenHash: await hashToken(accessToken),
      accessExpiresAt: new Date(now + ACCESS_TOKEN_TTL_SECONDS * 1000),
      refreshTokenHash: await hashToken(refreshToken),
      refreshExpiresAt: new Date(now + REFRESH_TOKEN_TTL_SECONDS * 1000),
      lastUsedAt: new Date(now),
    },
  };
}

function tokenResponse(accessToken: string, refreshToken: string, scope: string): TokenResponse {
  return {
    access_token: accessToken,
    token_type: "Bearer",
    expires_in: ACCESS_TOKEN_TTL_SECONDS,
    refresh_token: refreshToken,
    scope,
  };
}

const invalidGrant = (description: string): TokenError => ({
  error: "invalid_grant",
  error_description: description,
});

export async function exchangeAuthorizationCode(params: {
  client: OAuthClientInfo;
  code: string;
  redirectUri: string;
  codeVerifier: string;
  resource: string | null;
}): Promise<TokenResponse | TokenError> {
  const codeHash = await hashToken(params.code);
  const grant = await db.oAuthCode.findUnique({ where: { codeHash } });
  // Single use: whoever deletes the row owns the code.
  const { count } = await db.oAuthCode.deleteMany({ where: { codeHash } });
  if (!grant || count === 0) return invalidGrant("Unknown or used authorization code.");
  if (grant.expiresAt < new Date()) return invalidGrant("Authorization code expired.");
  if (grant.clientId !== params.client.id) return invalidGrant("Client mismatch.");
  if (grant.redirectUri !== params.redirectUri) return invalidGrant("redirect_uri mismatch.");
  if (params.resource !== null && params.resource !== grant.resource) {
    return { error: "invalid_target", error_description: "Unknown resource." };
  }
  if (!(await verifyPkce(params.codeVerifier, grant.codeChallenge))) {
    return invalidGrant("PKCE verification failed.");
  }
  if (!isEmailAllowed(grant.email, process.env.ALLOWED_EMAIL)) {
    return invalidGrant("User no longer allowed.");
  }

  const { accessToken, refreshToken, data } = await issueTokens();
  await db.oAuthToken.create({
    data: {
      ...data,
      clientId: grant.clientId,
      clientName: params.client.name,
      email: grant.email,
      scope: grant.scope,
      resource: grant.resource,
    },
  });
  await db.oAuthToken.deleteMany({ where: { refreshExpiresAt: { lt: new Date() } } });
  return tokenResponse(accessToken, refreshToken, grant.scope);
}

/** Refresh tokens rotate: the old one stops working once used. */
export async function refreshAccessToken(params: {
  client: OAuthClientInfo;
  refreshToken: string;
}): Promise<TokenResponse | TokenError> {
  const refreshTokenHash = await hashToken(params.refreshToken);
  const token = await db.oAuthToken.findUnique({ where: { refreshTokenHash } });
  if (!token || token.clientId !== params.client.id) return invalidGrant("Unknown refresh token.");
  if (token.refreshExpiresAt < new Date()) return invalidGrant("Refresh token expired.");
  if (!isEmailAllowed(token.email, process.env.ALLOWED_EMAIL)) {
    return invalidGrant("User no longer allowed.");
  }

  const { accessToken, refreshToken, data } = await issueTokens();
  const { count } = await db.oAuthToken.updateMany({
    where: { id: token.id, refreshTokenHash },
    data,
  });
  if (count === 0) return invalidGrant("Refresh token already used.");
  return tokenResponse(accessToken, refreshToken, token.scope);
}

/** RFC 7009: revokes the grant that owns the token, whichever token it is. */
export async function revokeToken(token: string, clientId: string): Promise<void> {
  const tokenHash = await hashToken(token);
  await db.oAuthToken.deleteMany({
    where: {
      clientId,
      OR: [{ accessTokenHash: tokenHash }, { refreshTokenHash: tokenHash }],
    },
  });
}

export type VerifiedToken = {
  clientId: string;
  email: string;
  scopes: string[];
  resource: string;
  expiresAt: number;
};

const LAST_USED_GRANULARITY_MS = 5 * 60 * 1000;

export async function verifyAccessToken(accessToken: string): Promise<VerifiedToken | null> {
  const token = await db.oAuthToken.findUnique({
    where: { accessTokenHash: await hashToken(accessToken) },
  });
  if (!token || token.accessExpiresAt < new Date()) return null;
  if (!isEmailAllowed(token.email, process.env.ALLOWED_EMAIL)) return null;
  if (Date.now() - token.lastUsedAt.getTime() > LAST_USED_GRANULARITY_MS) {
    await db.oAuthToken.update({ where: { id: token.id }, data: { lastUsedAt: new Date() } });
  }
  return {
    clientId: token.clientId,
    email: token.email,
    scopes: token.scope.split(" "),
    resource: token.resource,
    expiresAt: Math.floor(token.accessExpiresAt.getTime() / 1000),
  };
}

/** Connected MCP clients, for the settings page. */
export function listConnections() {
  return db.oAuthToken.findMany({
    orderBy: { lastUsedAt: "desc" },
    select: { id: true, clientName: true, createdAt: true, lastUsedAt: true },
  });
}

export async function deleteConnection(id: string): Promise<boolean> {
  const { count } = await db.oAuthToken.deleteMany({ where: { id } });
  return count > 0;
}
