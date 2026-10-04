import {
  authenticateClient,
  exchangeAuthorizationCode,
  findClient,
  refreshAccessToken,
} from "@/server/oauth";
import { clientCredentials, corsPreflight, json, oauthError, readForm } from "@/server/oauth-http";

/** Token endpoint: authorization_code (with PKCE) and refresh_token grants. */
export async function POST(req: Request) {
  const form = await readForm(req);
  const { clientId, secret } = clientCredentials(req, form);
  if (!clientId) return oauthError("invalid_client", "Missing client_id.", 401);

  const client = await findClient(clientId);
  if (!client || !(await authenticateClient(client, secret))) {
    return oauthError("invalid_client", "Client authentication failed.", 401);
  }

  let result;
  if (form.grant_type === "authorization_code") {
    if (!form.code || !form.redirect_uri || !form.code_verifier) {
      return oauthError("invalid_request", "code, redirect_uri and code_verifier are required.");
    }
    result = await exchangeAuthorizationCode({
      client,
      code: form.code,
      redirectUri: form.redirect_uri,
      codeVerifier: form.code_verifier,
      resource: form.resource ?? null,
    });
  } else if (form.grant_type === "refresh_token") {
    if (!form.refresh_token) return oauthError("invalid_request", "refresh_token is required.");
    result = await refreshAccessToken({ client, refreshToken: form.refresh_token });
  } else {
    return oauthError("unsupported_grant_type", "Unsupported grant_type.");
  }

  return "error" in result ? json(result, 400) : json(result);
}

export const OPTIONS = corsPreflight;
