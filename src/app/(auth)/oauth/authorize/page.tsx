import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { Button } from "@/components/ui/button";
import { decideAuthorization } from "@/server/actions/oauth";
import { issuerFromHeaders } from "@/server/oauth";
import { validateAuthorizeRequest } from "@/server/oauth-authorize";
import { requireSession } from "@/server/session";

export const metadata: Metadata = { title: "Autorizza accesso · RDL Productivity" };

const PERMISSIONS = [
  "Leggere board, liste, card, etichette, checklist e calendario",
  "Creare, modificare, spostare, completare e archiviare card e liste",
  "Gestire etichette e checklist",
];

export default async function AuthorizePage({ searchParams }: PageProps<"/oauth/authorize">) {
  const session = await requireSession();
  const params = await searchParams;
  const issuer = issuerFromHeaders(await headers());
  const validation = await validateAuthorizeRequest(params, issuer);
  if (validation.kind === "redirect") redirect(validation.url);

  return (
    <main className="flex flex-1 items-center justify-center p-8">
      <div className="flex w-full max-w-md flex-col gap-6 rounded-xl border p-8 shadow-sm">
        {validation.kind === "fatal" ? (
          <>
            <h1 className="text-xl font-semibold tracking-tight">Richiesta non valida</h1>
            <p role="alert" className="text-sm text-destructive">
              {validation.message}
            </p>
          </>
        ) : (
          <>
            <div className="flex flex-col gap-2">
              <h1 className="text-xl font-semibold tracking-tight">
                {validation.request.client.name} vuole accedere a RDL Productivity
              </h1>
              <p className="text-sm text-muted-foreground">
                Account: {session.user?.email}. Dopo l&apos;autorizzazione verrai reindirizzato a{" "}
                <span className="font-medium text-foreground">
                  {new URL(validation.request.redirectUri).host}
                </span>
                .
              </p>
            </div>
            <div className="flex flex-col gap-2">
              <h2 className="text-sm font-medium">L&apos;applicazione potrà:</h2>
              <ul className="list-disc space-y-1 pl-5 text-sm">
                {PERMISSIONS.map((permission) => (
                  <li key={permission}>{permission}</li>
                ))}
              </ul>
            </div>
            <form action={decideAuthorization} className="flex justify-end gap-2">
              <input type="hidden" name="params" value={JSON.stringify(params)} />
              <Button type="submit" name="decision" value="deny" variant="outline">
                Annulla
              </Button>
              <Button type="submit" name="decision" value="allow">
                Consenti
              </Button>
            </form>
          </>
        )}
      </div>
    </main>
  );
}
