"use client";

import { useIsClient } from "@/lib/use-is-client";
import { completionsPerWeek, countSince, formatDays } from "@/lib/stats";
import type { StatsData } from "@/server/queries/stats";

import { BarList } from "./bar-list";
import { WeeklyColumns } from "./weekly-columns";

/** Bars drawn per chart; the table view lists every row. */
const CHART_ROWS = 10;

const weekLabel = new Intl.DateTimeFormat("it-IT", { day: "numeric", month: "short" });

function Tile({ label, value, hint }: { label: string; value: number | string; hint: string }) {
  return (
    <div className="flex flex-col gap-1 rounded-lg border p-4" data-testid="stat-tile">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="text-3xl font-semibold tabular-nums">{value}</span>
      <span className="text-xs text-muted-foreground">{hint}</span>
    </div>
  );
}

function Panel({
  title,
  description,
  children,
  table,
  pending,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
  table: { headers: [string, string]; rows: [string, string][] };
  /** Data computed in the browser that is not ready yet. */
  pending?: boolean;
}) {
  return (
    <section className="flex flex-col gap-3 rounded-lg border p-4" aria-label={title}>
      <div className="flex flex-col gap-0.5">
        <h2 className="font-semibold">{title}</h2>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
      {pending ? (
        <div className="h-44 animate-pulse rounded bg-muted" aria-busy="true" />
      ) : table.rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nessun dato.</p>
      ) : (
        <>
          {children}
          <details className="text-sm">
            <summary className="cursor-pointer text-muted-foreground">Mostra tabella</summary>
            <table className="mt-2 w-full text-left">
              <thead>
                <tr className="border-b text-muted-foreground">
                  <th className="py-1 font-medium">{table.headers[0]}</th>
                  <th className="py-1 text-right font-medium">{table.headers[1]}</th>
                </tr>
              </thead>
              <tbody>
                {table.rows.map(([a, b]) => (
                  <tr key={a} className="border-b last:border-0">
                    <td className="py-1">{a}</td>
                    <td className="py-1 text-right tabular-nums">{b}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </details>
        </>
      )}
    </section>
  );
}

export function StatsView({ stats }: { stats: StatsData }) {
  // Week buckets follow the browser's calendar: compute after hydration.
  const isClient = useIsClient();
  const now = new Date();
  const weeks = isClient ? completionsPerWeek(stats.completions, now) : [];
  const lastWeek = isClient
    ? countSince(stats.completions, new Date(now.getTime() - 7 * 864e5))
    : 0;

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-6 p-6">
      <h1 className="text-2xl font-semibold tracking-tight">Statistiche</h1>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Tile label="Card aperte" value={stats.openCards} hint="non completate, non archiviate" />
        <Tile label="Completate" value={isClient ? lastWeek : "–"} hint="negli ultimi 7 giorni" />
        <Tile label="Scadute" value={stats.overdue} hint="aperte con scadenza passata" />
        <Tile label="P0 e P1 aperte" value={stats.urgent} hint="nella super board" />
      </div>

      <Panel
        title="Card completate per settimana"
        description="Ultime 12 settimane, da lunedì a domenica."
        pending={!isClient}
        table={{
          headers: ["Settimana dal", "Completate"],
          rows: weeks.map((w) => [weekLabel.format(w.start), String(w.count)]),
        }}
      >
        <WeeklyColumns weeks={weeks} label="Card completate per settimana, ultime 12 settimane" />
      </Panel>

      <div className="grid gap-6 md:grid-cols-2">
        <Panel
          title="Scadute per board"
          description="Card aperte con la scadenza già passata (prime 10 nel grafico)."
          table={{
            headers: ["Board", "Scadute"],
            rows: stats.overdueByBoard.map((b) => [b.title, String(b.count)]),
          }}
        >
          <BarList
            label="Scadute per board"
            rows={stats.overdueByBoard.slice(0, CHART_ROWS).map((b) => ({
              key: b.id,
              label: b.title,
              value: b.count,
              display: String(b.count),
            }))}
          />
        </Panel>

        <Panel
          title="Tempo medio nella lista"
          description="Da quanto le card aperte sono nella lista attuale; liste con lo stesso nome unite, prime 10 nel grafico."
          table={{
            headers: ["Lista", "Tempo medio"],
            rows: stats.ageByList.map((l) => [
              `${l.title} (${l.cards} card)`,
              formatDays(l.averageDays),
            ]),
          }}
        >
          <BarList
            label="Tempo medio nella lista"
            rows={stats.ageByList.slice(0, CHART_ROWS).map((l) => ({
              key: l.title,
              label: l.title,
              value: l.averageDays,
              display: formatDays(l.averageDays),
              detail: `${l.cards} card`,
            }))}
          />
        </Panel>
      </div>
    </main>
  );
}
