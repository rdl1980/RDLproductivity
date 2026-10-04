import { authenticateClient, findClient, revokeToken } from "@/server/oauth";
import { clientCredentials, corsPreflight, json, oauthError, readForm } from "@/server/oauth-http";

/** RFC 7009 token revocation: always 200 for unknown tokens. */
export async function POST(req: Request) {
  const form = await readForm(req);
  const { clientId, secret } = clientCredentials(req, form);
  if (!clientId) return oauthError("invalid_client", "Missing client_id.", 401);
  const client = await findClient(clientId);
  if (!client || !(await authenticateClient(client, secret))) {
    return oauthError("invalid_client", "Client authentication failed.", 401);
  }
  if (form.token) await revokeToken(form.token, client.id);
  return json({});
}

export const OPTIONS = corsPreflight;
