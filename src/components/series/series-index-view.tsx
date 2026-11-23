"use client";

import { LibraryIcon, PlusIcon } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { accountLabel, KDP_ACCOUNTS, type KdpAccount } from "@/lib/kdp";
import { displayName, type SeriesStatus } from "@/lib/kdp-series-catalog";
import { importKdpSeries } from "@/server/actions/kdp-series";
import type { SeriesCatalog } from "@/server/queries/kdp-series";

import { SeriesDialog } from "./series-dialog";
import { dateLabel, selectClass, SeriesStatusBadge } from "./series-ui";

export function SeriesIndexView({
  catalog,
  penNames,
}: {
  catalog: SeriesCatalog;
  penNames: string[];
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [account, setAccount] = useState<KdpAccount | "">("");
  const [status, setStatus] = useState<SeriesStatus | "">("");
  const [creating, setCreating] = useState(false);
  const [pending, start] = useTransition();

  const needle = query.trim().toLowerCase();
  const shown = catalog.series.filter(
    (s) =>
      (!account || s.account === account) &&
      (!status || s.status === status) &&
      (!needle ||
        [s.name, s.penName, s.kdpName, s.genre, ...s.rows.map((r) => r.title)]
          .filter(Boolean)
          .some((v) => v!.toLowerCase().includes(needle))),
  );
  const unmanaged = catalog.unmanaged.filter((u) => !account || u.account === account);

  function addFromKdp(item?: { account: KdpAccount; kdpName: string }) {
    start(async () => {
      const result = await importKdpSeries(item ?? (account ? { account } : {})).catch(() => null);
      if (!result?.ok) {
        toast.error(result?.error ?? "Errore di rete, riprova.");
        return;
      }
      toast.success(
        result.data.created === 1 ? "Collana aggiunta" : `${result.data.created} collane aggiunte`,
      );
      router.refresh();
    });
  }

  return (
    <main className="mx-auto flex w-full max-w-7xl flex-col gap-5 p-4 sm:p-6">
      <PageHeader
        icon={LibraryIcon}
        title="Collane"
        description="Le serie di libri pubblicate e in lavorazione: volumi, stato, account, pen name e date di pubblicazione."
        actions={
          <Button type="button" onClick={() => setCreating(true)}>
            <PlusIcon />
            Nuova collana
          </Button>
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        <Input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Cerca collana, pen name o titolo"
          aria-label="Cerca collane"
          className="w-full sm:w-80"
        />
        <select
          aria-label="Account"
          value={account}
          onChange={(e) => setAccount(e.target.value as KdpAccount | "")}
          className={`${selectClass} sm:w-44`}
        >
          <option value="">Tutti gli account</option>
          {KDP_ACCOUNTS.map((a) => (
            <option key={a.value} value={a.value}>
              {a.label}
            </option>
          ))}
        </select>
        <select
          aria-label="Stato della collana"
          value={status}
          onChange={(e) => setStatus(e.target.value as SeriesStatus | "")}
          className={`${selectClass} sm:w-40`}
        >
          <option value="">Tutti gli stati</option>
          <option value="active">In corso</option>
          <option value="paused">In pausa</option>
          <option value="completed">Conclusa</option>
        </select>
      </div>

      {shown.length === 0 ? (
        <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">
          {catalog.series.length === 0
            ? "Nessuna collana: creane una o aggiungi quelle che KDP già conosce qui sotto."
            : "Nessuna collana corrisponde ai filtri."}
        </p>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3" data-testid="series-list">
          {shown.map((s) => (
            <li key={s.id}>
              <Link
                href={`/collane/${s.id}`}
                data-testid="series-card"
                className="flex h-full flex-col gap-2 rounded-xl border p-4 transition-colors hover:bg-muted/50 focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
              >
                <span className="flex items-start justify-between gap-2">
                  <span className="font-semibold">{s.name}</span>
                  <SeriesStatusBadge status={s.status} />
                </span>
                <span className="text-sm text-muted-foreground">
                  {accountLabel(s.account)} · {s.penName ?? "pen name non indicato"}
                  {s.language ? ` · ${s.language}` : ""}
                </span>
                <span className="text-sm tabular-nums">
                  {s.counts.published}
                  {s.plannedVolumes ? ` di ${s.plannedVolumes}` : ""} pubblicati
                  {s.counts.inProgress > 0 && ` · ${s.counts.inProgress} in lavorazione`}
                  {s.counts.ideas > 0 && ` · ${s.counts.ideas} idee`}
                </span>
                <span className="mt-auto text-xs text-muted-foreground">
                  {s.lastPublished && `Ultima uscita ${dateLabel(s.lastPublished)}`}
                  {s.lastPublished && s.nextPlanned && " · "}
                  {s.nextPlanned && `Prossima prevista ${dateLabel(s.nextPlanned)}`}
                  {!s.lastPublished && !s.nextPlanned && "Nessuna data"}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}

      {unmanaged.length > 0 && (
        <section className="flex flex-col gap-3" aria-labelledby="unmanaged-title">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 id="unmanaged-title" className="text-lg font-semibold">
                Serie su KDP da aggiungere
              </h2>
              <p className="text-sm text-muted-foreground">
                Nomi di serie letti dal Bookshelf che nessuna collana copre ancora.
              </p>
            </div>
            <Button type="button" variant="outline" disabled={pending} onClick={() => addFromKdp()}>
              Aggiungi tutte ({unmanaged.length})
            </Button>
          </div>
          <div className="overflow-x-auto rounded-xl border">
            <table className="w-full text-sm" data-testid="unmanaged-series">
              <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 font-medium">Serie</th>
                  <th className="px-3 py-2 font-medium">Account</th>
                  <th className="px-3 py-2 font-medium">Pen name</th>
                  <th className="px-3 py-2 text-right font-medium">Libri</th>
                  <th className="px-3 py-2">
                    <span className="sr-only">Azioni</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {unmanaged.map((u) => (
                  <tr key={`${u.account}|${u.kdpName}`} className="border-t">
                    <td className="px-3 py-2">{displayName(u.kdpName)}</td>
                    <td className="px-3 py-2">{accountLabel(u.account)}</td>
                    <td className="px-3 py-2">{u.author ?? "—"}</td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {u.published}/{u.books}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        disabled={pending}
                        onClick={() => addFromKdp({ account: u.account, kdpName: u.kdpName })}
                        aria-label={`Aggiungi la collana ${displayName(u.kdpName)}`}
                      >
                        Aggiungi
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {catalog.withoutSeries > 0 && (
        <p className="text-sm text-muted-foreground">
          {catalog.withoutSeries} libri del Bookshelf non hanno una serie su KDP: si aggiungono a
          una collana dalla sua pagina, con «Aggiungi dal Bookshelf».{" "}
          <Link href="/kdp/libri" className="text-primary underline underline-offset-2">
            Vai a Libri KDP
          </Link>
        </p>
      )}

      <SeriesDialog
        key={creating ? "new" : "closed"}
        open={creating}
        series={null}
        penNames={penNames}
        onOpenChange={setCreating}
        onSaved={(id) => router.push(`/collane/${id}`)}
      />
    </main>
  );
}
