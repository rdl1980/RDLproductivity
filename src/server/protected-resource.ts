import "server-only";

import { MCP_SCOPE } from "@/lib/oauth";
import { issuerOf, resourceOf } from "@/server/oauth";
import { json } from "@/server/oauth-http";

/** RFC 9728 protected resource metadata for the MCP endpoint. */
export function protectedResourceMetadata(req: Request) {
  const issuer = issuerOf(req);
  return json(
    {
      resource: resourceOf(issuer),
      authorization_servers: [issuer],
      scopes_supported: [MCP_SCOPE],
      bearer_methods_supported: ["header"],
      resource_name: "RDL Productivity",
    },
    200,
    { "Cache-Control": "public, max-age=3600" },
  );
}
