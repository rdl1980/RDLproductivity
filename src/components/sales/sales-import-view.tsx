"use client";

import { UploadIcon } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";

import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { KDP_ACCOUNTS, type KdpAccount } from "@/lib/kdp";
import {
  decodeSalesHash,
  formatEuro,
  formatInt,
  marketplaceLabel,
  type SalesPayload,
  salesPayloadSchema,
} from "@/lib/kdp-sales";
import { importKdpSales } from "@/server/actions/kdp-sales";

type State =
  | { kind: "loading" }
  | { kind: "empty" }
  | { kind: "invalid"; error: string }
  | { kind: "ready"; payload: SalesPayload; hash: string };

async function readHash(): Promise<State> {
  const hash = window.location.hash;
  if (!hash || hash === "#") return { kind: "empty" };
  try {
    const parsed = salesPayloadSchema.safeParse(await decodeSalesHash(hash));
    if (!parsed.success) {
      return { kind: "invalid", error: parsed.error.issues[0]?.message ?? "Dati non validi." };
    }
    return { kind: "ready", payload: parsed.data, hash };
  } catch {
    return { kind: "invalid", error: "Il link è incompleto o danneggiato." };
  }
}

export function SalesImportView() {
  const router = useRouter();
  const [state, setState] = useState<State>({ kind: "loading" });
  const [account, setAccount] = useState<KdpAccount>("main");
  const [pending, startTransition] = useTransition();

  // The fragment exists only in the browser and is decompressed asynchronously.
  useEffect(() => {
    let cancelled = false;
    void readHash().then((next) => {
      if (!cancelled) setState(next);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  function submit(hash: string) {
    startTransition(async () => {
      const result = await importKdpSales({ account, hash }).catch(() => null);
      if (!result?.ok) return void toast.error(result?.error ?? "Errore di rete, riprova.");
      toast.success(
        `Importate ${formatInt(result.data.rows)} righe: ${formatInt(result.data.units)} copie, ${formatEuro(result.data.royalty)} di royalty.`,
      );
      // Drop the data from the URL so a reload does not import it again.
      window.history.replaceState(null, "", window.location.pathname);
      router.push(account === "main" ? "/kdp/vendite" : `/kdp/vendite?account=${account}`);
    });
  }

  const summary =
    state.kind === "ready"
      ? (() => {
          const rows = state.payload.rows;
          const markets = new Set(rows.map((r) => r[1]));
          return {
            units: rows.reduce((sum, r) => sum + r[3] + r[4] + r[5], 0),
            kenp: rows.reduce((sum, r) => sum + r[6], 0),
            royalty: rows.reduce((sum, r) => sum + r[7], 0),
            titles: new Set(rows.map((r) => r[2])).size,
            markets: [...markets].map(marketplaceLabel).sort().join(", "),
          };
        })()
      : null;

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-5 p-4 sm:p-6">
      <PageHeader icon={UploadIcon} title="Importa vendite KDP" />
      {state.kind === "loading" && <p className="text-sm text-muted-foreground">Lettura…</p>}
      {(state.kind === "empty" || state.kind === "invalid") && (
        <div className="flex flex-col gap-2 rounded-xl border border-dashed p-6 text-sm">
          <p>
            {state.kind === "invalid"
              ? `Impossibile leggere i dati: ${state.error}`
              : "Nessun dato da importare."}
          </p>
          <p className="text-muted-foreground">
            Apri i Report di KDP e usa il preferito «Vendite KDP» (istruzioni in{" "}
            <Link href="/kdp/vendite" className="text-primary hover:underline">
              Vendite KDP → Aggiorna dati
            </Link>
            ).
          </p>
        </div>
      )}
      {state.kind === "ready" && summary && (
        <form
          className="flex flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            submit(state.hash);
          }}
        >
          <dl
            className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4"
            data-testid="sales-import-summary"
          >
            {[
              ["Periodo", `${state.payload.from} – ${state.payload.to}`],
              ["Copie", formatInt(summary.units)],
              ["Pagine KENP", formatInt(summary.kenp)],
              ["Royalty stimate", formatEuro(summary.royalty)],
            ].map(([label, value]) => (
              <div key={label} className="rounded-lg border p-3">
                <dt className="text-xs text-muted-foreground">{label}</dt>
                <dd className="font-semibold">{value}</dd>
              </div>
            ))}
          </dl>
          <p className="text-sm text-muted-foreground">
            {formatInt(state.payload.rows.length)} righe giornaliere, {summary.titles} titoli,
            mercati: {summary.markets}.
          </p>
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1 text-sm font-medium">
              Di quale account sono questi report?
            </legend>
            {KDP_ACCOUNTS.map(({ value, label }) => (
              <label key={value} className="flex items-center gap-2 text-sm">
                <input
                  type="radio"
                  name="account"
                  value={value}
                  checked={account === value}
                  onChange={() => setAccount(value)}
                  className="size-4 accent-primary"
                />
                {label}
              </label>
            ))}
          </fieldset>
          <p className="text-xs text-muted-foreground">
            Le vendite già importate per questo account nello stesso periodo vengono sostituite.
          </p>
          <div className="flex gap-2">
            <Button type="submit" disabled={pending}>
              {pending ? "Importazione…" : "Importa"}
            </Button>
            <Button asChild variant="outline">
              <Link href="/kdp/vendite">Annulla</Link>
            </Button>
          </div>
        </form>
      )}
    </main>
  );
}
