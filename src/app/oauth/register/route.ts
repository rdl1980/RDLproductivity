import { z } from "zod";

import { isValidRedirectUri } from "@/lib/oauth";
import { registerClient } from "@/server/oauth";
import { corsPreflight, json, oauthError } from "@/server/oauth-http";

const registrationSchema = z.object({
  redirect_uris: z.array(z.string().max(2000)).min(1).max(10),
  client_name: z.string().trim().max(100).optional(),
  token_endpoint_auth_method: z
    .enum(["none", "client_secret_post", "client_secret_basic"])
    .optional(),
});

/** RFC 7591 dynamic client registration (open, as MCP clients expect). */
export async function POST(req: Request) {
  const body: unknown = await req.json().catch(() => null);
  const parsed = registrationSchema.safeParse(body);
  if (!parsed.success) {
    return oauthError("invalid_client_metadata", "Invalid client metadata.");
  }
  const metadata = parsed.data;
  if (!metadata.redirect_uris.every(isValidRedirectUri)) {
    return oauthError("invalid_redirect_uri", "Redirect URIs must be https or loopback http.");
  }

  // RFC 7591 defaults to client_secret_basic when the method is omitted.
  const authMethod = metadata.token_endpoint_auth_method ?? "client_secret_basic";
  const name = metadata.client_name || "Client MCP";
  const { id, secret } = await registerClient({
    name,
    redirectUris: metadata.redirect_uris,
    confidential: authMethod !== "none",
  });

  return json(
    {
      client_id: id,
      ...(secret ? { client_secret: secret, client_secret_expires_at: 0 } : {}),
      client_id_issued_at: Math.floor(Date.now() / 1000),
      client_name: name,
      redirect_uris: metadata.redirect_uris,
      token_endpoint_auth_method: authMethod,
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
    },
    201,
  );
}

export const OPTIONS = corsPreflight;
