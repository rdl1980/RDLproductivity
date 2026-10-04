"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { createAuthorizationCode, deleteConnection, issuerFromHeaders } from "@/server/oauth";
import { clientRedirect, validateAuthorizeRequest } from "@/server/oauth-authorize";
import { requireSession } from "@/server/session";

function parseParams(raw: FormDataEntryValue | null): Record<string, string> {
  if (typeof raw !== "string") return {};
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return {};
    return Object.fromEntries(
      Object.entries(parsed).filter(
        (entry): entry is [string, string] => typeof entry[1] === "string",
      ),
    );
  } catch {
    return {};
  }
}

/** Consent form: the request is validated again, never trusted from the page. */
export async function decideAuthorization(formData: FormData) {
  const session = await requireSession();
  const issuer = issuerFromHeaders(await headers());
  const validation = await validateAuthorizeRequest(parseParams(formData.get("params")), issuer);
  if (validation.kind === "fatal") redirect("/oauth/authorize");
  if (validation.kind === "redirect") redirect(validation.url);

  const { request } = validation;
  if (formData.get("decision") !== "allow" || !session.user?.email) {
    redirect(
      clientRedirect(request.redirectUri, issuer, {
        error: "access_denied",
        error_description: "The user denied the request.",
        state: request.state,
      }),
    );
  }

  const code = await createAuthorizationCode({
    clientId: request.client.id,
    email: session.user.email,
    redirectUri: request.redirectUri,
    codeChallenge: request.codeChallenge,
    scope: request.scope,
    resource: request.resource,
  });
  redirect(clientRedirect(request.redirectUri, issuer, { code, state: request.state }));
}

/** Revokes every token of an MCP connection. */
export async function revokeConnection(id: string) {
  await requireSession();
  await deleteConnection(id);
  revalidatePath("/connections");
}
