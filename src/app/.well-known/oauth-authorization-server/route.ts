import { MCP_SCOPE } from "@/lib/oauth";
import { issuerOf } from "@/server/oauth";
import { corsPreflight, json } from "@/server/oauth-http";

/** RFC 8414 authorization server metadata. */
export function GET(req: Request) {
  const issuer = issuerOf(req);
  return json(
    {
      issuer,
      authorization_endpoint: `${issuer}/oauth/authorize`,
      token_endpoint: `${issuer}/oauth/token`,
      registration_endpoint: `${issuer}/oauth/register`,
      revocation_endpoint: `${issuer}/oauth/revoke`,
      response_types_supported: ["code"],
      grant_types_supported: ["authorization_code", "refresh_token"],
      code_challenge_methods_supported: ["S256"],
      token_endpoint_auth_methods_supported: ["none", "client_secret_post", "client_secret_basic"],
      revocation_endpoint_auth_methods_supported: [
        "none",
        "client_secret_post",
        "client_secret_basic",
      ],
      scopes_supported: [MCP_SCOPE],
      client_id_metadata_document_supported: true,
      authorization_response_iss_parameter_supported: true,
    },
    200,
    { "Cache-Control": "public, max-age=3600" },
  );
}

export const OPTIONS = corsPreflight;
