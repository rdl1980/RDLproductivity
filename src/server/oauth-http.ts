import "server-only";

/** OAuth endpoints are called cross-origin by browser-based MCP clients. */
export const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
  "Access-Control-Allow-Headers":
    "Authorization, Content-Type, Accept, MCP-Protocol-Version, Mcp-Session-Id, Last-Event-ID",
  "Access-Control-Max-Age": "86400",
};

export function json(body: unknown, status = 200, headers: Record<string, string> = {}) {
  return Response.json(body, {
    status,
    headers: { ...CORS_HEADERS, "Cache-Control": "no-store", ...headers },
  });
}

export function oauthError(error: string, description: string, status = 400) {
  return json({ error, error_description: description }, status);
}

export function corsPreflight() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

/** Reads an `application/x-www-form-urlencoded` (or JSON) body as string fields. */
export async function readForm(req: Request): Promise<Record<string, string>> {
  const type = req.headers.get("content-type") ?? "";
  const fields: Record<string, string> = {};
  if (type.includes("application/json")) {
    const body: unknown = await req.json().catch(() => null);
    if (body && typeof body === "object") {
      for (const [key, value] of Object.entries(body)) {
        if (typeof value === "string") fields[key] = value;
      }
    }
    return fields;
  }
  const params = new URLSearchParams(await req.text());
  for (const [key, value] of params) fields[key] = value;
  return fields;
}

/** Client credentials from HTTP Basic (RFC 6749 §2.3.1) or the request body. */
export function clientCredentials(
  req: Request,
  form: Record<string, string>,
): { clientId: string | null; secret: string | null } {
  const header = req.headers.get("authorization");
  if (header?.toLowerCase().startsWith("basic ")) {
    try {
      const decoded = atob(header.slice(6).trim());
      const separator = decoded.indexOf(":");
      if (separator > 0) {
        return {
          clientId: decodeURIComponent(decoded.slice(0, separator)),
          secret: decodeURIComponent(decoded.slice(separator + 1)),
        };
      }
    } catch {
      // Fall through to body credentials.
    }
  }
  return { clientId: form.client_id ?? null, secret: form.client_secret ?? null };
}
