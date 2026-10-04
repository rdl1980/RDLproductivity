import type { Metadata } from "next";
import { headers } from "next/headers";

import { LocalDateTime } from "@/components/local-date-time";
import { Button } from "@/components/ui/button";
import { revokeConnection } from "@/server/actions/oauth";
import { issuerFromHeaders, listConnections, resourceOf } from "@/server/oauth";
import { requireSession } from "@/server/session";

export const metadata: Metadata = { title: "Connessioni Claude · RDL Productivity" };

export default async function ConnectionsPage() {
  await requireSession();
  const [connections, requestHeaders] = await Promise.all([listConnections(), headers()]);
  const mcpUrl = resourceOf(issuerFromHeaders(requestHeaders));

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-8 p-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">Connessioni Claude</h1>
        <p className="text-sm text-muted-foreground">
          Collega Claude a RDL Productivity tramite MCP: in Claude apri Impostazioni → Connettori →
          Aggiungi connettore personalizzato e incolla questo URL. Al primo utilizzo ti verrà
          chiesto di autorizzare l&apos;accesso.
        </p>
        <code className="w-fit max-w-full rounded-md border bg-muted px-3 py-2 text-sm break-all select-all">
          {mcpUrl}
        </code>
      </div>

      <section className="flex flex-col gap-2" aria-label="Client autorizzati">
        <h2 className="text-lg font-semibold">
          Client autorizzati{" "}
          <span className="text-sm font-normal text-muted-foreground">({connections.length})</span>
        </h2>
        {connections.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nessun client autorizzato.</p>
        ) : (
          <ul className="divide-y rounded-lg border">
            {connections.map((connection) => (
              <li key={connection.id} className="flex items-center justify-between gap-4 p-3">
                <div className="flex min-w-0 flex-col">
                  <span className="truncate font-medium">{connection.clientName}</span>
                  <span className="text-xs text-muted-foreground">
                    Autorizzato il <LocalDateTime value={connection.createdAt} /> · ultimo uso{" "}
                    <LocalDateTime value={connection.lastUsedAt} />
                  </span>
                </div>
                <form action={revokeConnection.bind(null, connection.id)}>
                  <Button type="submit" variant="outline" size="sm">
                    Revoca
                  </Button>
                </form>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
