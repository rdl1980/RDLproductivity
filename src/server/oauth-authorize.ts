import "server-only";

import { grantedScope, isValidCodeChallenge, sameResource } from "@/lib/oauth";
import { findClient, type OAuthClientInfo, resourceOf } from "@/server/oauth";

export type AuthorizeParams = Record<string, string | string[] | undefined>;

export type AuthorizeRequest = {
  client: OAuthClientInfo;
  redirectUri: string;
  state: string | null;
  codeChallenge: string;
  scope: string;
  resource: string;
};

export type AuthorizeValidation =
  // The client cannot be trusted with a redirect: show the error to the user.
  | { kind: "fatal"; message: string }
  // Errors reported back to the client (RFC 6749 §4.1.2.1).
  | { kind: "redirect"; url: string }
  | { kind: "ok"; request: AuthorizeRequest };

function single(params: AuthorizeParams, key: string): string | null {
  const value = params[key];
  return typeof value === "string" ? value : null;
}

/** Builds the redirect back to the client with `iss` (RFC 9207). */
export function clientRedirect(
  redirectUri: string,
  issuer: string,
  values: Record<string, string | null>,
): string {
  const url = new URL(redirectUri);
  for (const [key, value] of Object.entries(values)) {
    if (value !== null) url.searchParams.set(key, value);
  }
  url.searchParams.set("iss", issuer);
  return url.toString();
}

/** Validates an authorization request; used by the consent page and its action. */
export async function validateAuthorizeRequest(
  params: AuthorizeParams,
  issuer: string,
): Promise<AuthorizeValidation> {
  const clientId = single(params, "client_id");
  const redirectUri = single(params, "redirect_uri");
  if (!clientId) return { kind: "fatal", message: "Richiesta non valida: client_id mancante." };

  const client = await findClient(clientId);
  if (!client) return { kind: "fatal", message: "Applicazione client sconosciuta." };
  // Exact match against a registered URI; a single one may be implied.
  const resolvedRedirect =
    redirectUri ?? (client.redirectUris.length === 1 ? client.redirectUris[0] : null);
  if (!resolvedRedirect || !client.redirectUris.includes(resolvedRedirect)) {
    return { kind: "fatal", message: "redirect_uri non registrato per questa applicazione." };
  }

  const state = single(params, "state");
  const fail = (error: string, description: string): AuthorizeValidation => ({
    kind: "redirect",
    url: clientRedirect(resolvedRedirect, issuer, {
      error,
      error_description: description,
      state,
    }),
  });

  if (single(params, "response_type") !== "code") {
    return fail("unsupported_response_type", "Only response_type=code is supported.");
  }
  const codeChallenge = single(params, "code_challenge");
  if (single(params, "code_challenge_method") !== "S256" || !codeChallenge) {
    return fail("invalid_request", "PKCE with S256 is required.");
  }
  if (!isValidCodeChallenge(codeChallenge)) {
    return fail("invalid_request", "Malformed code_challenge.");
  }
  const expectedResource = resourceOf(issuer);
  const resource = single(params, "resource");
  if (resource !== null && !sameResource(resource, expectedResource)) {
    return fail("invalid_target", "Unknown resource.");
  }

  return {
    kind: "ok",
    request: {
      client,
      redirectUri: resolvedRedirect,
      state,
      codeChallenge,
      scope: grantedScope(),
      resource: expectedResource,
    },
  };
}
