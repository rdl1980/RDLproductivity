import { createMcpHandler, withMcpAuth } from "mcp-handler";

import { MCP_SCOPE, sameResource } from "@/lib/oauth";
import { registerTools } from "@/server/mcp/tools";
import { issuerOf, resourceOf, verifyAccessToken } from "@/server/oauth";
import { CORS_HEADERS, corsPreflight } from "@/server/oauth-http";

const handler = createMcpHandler(registerTools, {
  serverInfo: { name: "rdl-productivity", version: "1.0.0" },
  instructions:
    "RDL Productivity is a personal Trello-like board app: boards contain lists, lists contain " +
    "cards; cards have labels (per board), dates, a markdown description and checklists. " +
    "Use list_boards and get_board to find IDs before writing. Dates are ISO 8601; ask the user " +
    "for their timezone when it matters. Archiving is reversible (restore).",
});

const authenticated = withMcpAuth(
  handler,
  async (req, bearerToken) => {
    if (!bearerToken) return undefined;
    const token = await verifyAccessToken(bearerToken);
    // Tokens are audience-bound to this deployment's MCP endpoint (RFC 8707).
    if (!token || !sameResource(token.resource, resourceOf(issuerOf(req)))) return undefined;
    return {
      token: bearerToken,
      clientId: token.clientId,
      scopes: token.scopes,
      expiresAt: token.expiresAt,
      resource: new URL(token.resource),
      extra: { email: token.email },
    };
  },
  { required: true, requiredScopes: [MCP_SCOPE] },
);

/** Browser-based MCP clients need CORS, and must be able to read the auth challenge. */
async function withCors(req: Request) {
  const response = await authenticated(req);
  const headers = new Headers(response.headers);
  for (const [key, value] of Object.entries(CORS_HEADERS)) headers.set(key, value);
  headers.set("Access-Control-Expose-Headers", "WWW-Authenticate, Mcp-Session-Id");
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

export { withCors as DELETE, withCors as GET, withCors as POST };
export const OPTIONS = corsPreflight;
