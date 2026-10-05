import type { Metadata } from "next";
import { headers } from "next/headers";

import { LocalDateTime } from "@/components/local-date-time";
import { Button } from "@/components/ui/button";
import { disableIcalFeed, rotateIcalFeed } from "@/server/actions/ical";
import { revokeConnection } from "@/server/actions/oauth";
import { currentFeedToken } from "@/server/ical-feed";
import { issuerFromHeaders, listConnections, resourceOf } from "@/server/oauth";
import { requireSession } from "@/server/session";

export const metadata: Metadata = { title: "Integrazioni · RDL Productivity" };

export default async function ConnectionsPage() {
  await requireSession();
  const [connections, requestHeaders, feedToken] = await Promise.all([
    listConnections(),
    headers(),
    currentFeedToken(),
  ]);
  const origin = issuerFromHeaders(requestHeaders);
  const mcpUrl = resourceOf(origin);
  const feedUrl = feedToken && `${origin}/api/calendar/${feedToken}.ics`;

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-8 p-6">
      <h1 className="text-2xl font-semibold tracking-tight">Integrazioni</h1>

      <section className="flex flex-col gap-2" aria-label="Calendario iCal">
        <h2 className="text-lg font-semibold">Calendario (iCal)</h2>
        <p className="text-sm text-muted-foreground">
          Iscrivi Google Calendar, Apple Calendar o Outlook a questo URL per vedere le scadenze
          delle card. L&apos;URL è privato: chi lo conosce vede titoli e scadenze. Se lo hai
          condiviso per errore, rigeneralo.
        </p>
        {feedUrl ? (
          <>
            <code
              data-testid="ical-url"
              className="w-fit max-w-full rounded-md border bg-muted px-3 py-2 text-sm break-all select-all"
            >
              {feedUrl}
            </code>
            <div className="flex flex-wrap gap-2">
              <Button asChild variant="outline" size="sm">
                <a href={feedUrl.replace(/^https?:/, "webcal:")}>Apri nel calendario</a>
              </Button>
              <form action={rotateIcalFeed}>
                <Button type="submit" variant="outline" size="sm">
                  Rigenera URL
                </Button>
              </form>
              <form action={disableIcalFeed}>
                <Button type="submit" variant="outline" size="sm">
                  Disattiva
                </Button>
              </form>
            </div>
          </>
        ) : (
          <form action={rotateIcalFeed}>
            <Button type="submit" size="sm">
              Attiva il feed
            </Button>
          </form>
        )}
      </section>

      <div className="flex flex-col gap-2">
        <h2 className="text-lg font-semibold">Claude (MCP)</h2>
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
        <h3 className="font-semibold">
          Client autorizzati{" "}
          <span className="text-sm font-normal text-muted-foreground">({connections.length})</span>
        </h3>
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
