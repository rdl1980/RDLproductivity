"use client";

import { MegaphoneIcon } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { toast } from "sonner";

import { AccountHint } from "@/components/kdp/account-hint";
import { KdpTabs } from "@/components/kdp/kdp-tabs";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { KDP_ACCOUNTS, type KdpAccount } from "@/lib/kdp";
import type { AccountMatches } from "@/lib/kdp-accounts";
import { type AdRow, DEFAULT_FX } from "@/lib/kdp-ads";
import { formatEuro, formatInt } from "@/lib/kdp-sales";
import { useIsClient } from "@/lib/use-is-client";
import { setKdpFxRates } from "@/server/actions/kdp-ads";

type Parsed = {
  rows: AdRow[];
  skipped: number;
  from: string;
  to: string;
  account: KdpAccount | null;
  matches: AccountMatches;
};

/** Upload of the Ads "Advertised product" report (CSV or Excel), then the account choice. */
export function AdsImportView({ fx: initialFx }: { fx: Record<string, number> }) {
  const router = useRouter();
  // The input works only once hydrated: until then it is disabled, not dead.
  const ready = useIsClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [parsed, setParsed] = useState<Parsed | null>(null);
  const [account, setAccount] = useState<KdpAccount | null>(null);
  const [pending, startTransition] = useTransition();
  const [fx, setFx] = useState<Record<string, string>>(() =>
    Object.fromEntries(Object.entries(initialFx).map(([k, v]) => [k, String(v)])),
  );

  async function read(file: File) {
    setParsed(null);
    setAccount(null);
    const body = new FormData();
    body.append("file", file);
    const response = await fetch("/api/kdp/ads/parse", { method: "POST", body }).catch(() => null);
    const data = await response?.json().catch(() => null);
    if (!response?.ok) return void toast.error(data?.error ?? "Errore di rete, riprova.");
    setParsed(data as Parsed);
    setAccount((data as Parsed).account);
  }

  function submit() {
    if (!parsed || !account) return;
    startTransition(async () => {
      const response = await fetch("/api/kdp/ads/import", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ account, rows: parsed.rows }),
      }).catch(() => null);
      const data = await response?.json().catch(() => null);
      if (!response?.ok) return void toast.error(data?.error ?? "Errore di rete, riprova.");
      toast.success(
        `Importate ${formatInt(data.rows)} righe di spesa (${data.from} – ${data.to}).`,
      );
      router.push(account === "main" ? "/kdp/vendite" : `/kdp/vendite?account=${account}`);
    });
  }

  function saveFx() {
    startTransition(async () => {
      const rates: Record<string, number> = {};
      for (const [code, raw] of Object.entries(fx)) {
        const value = Number(raw.replace(",", "."));
        if (!Number.isFinite(value) || value <= 0)
          return void toast.error(`Tasso non valido per ${code}.`);
        rates[code] = value;
      }
      const result = await setKdpFxRates(rates).catch(() => null);
      if (!result?.ok) return void toast.error(result?.error ?? "Errore di rete, riprova.");
      toast.success("Tassi salvati.");
    });
  }

  const summary = parsed
    ? {
        spend: parsed.rows.reduce((sum, r) => sum + r.spend, 0),
        currencies: [...new Set(parsed.rows.map((r) => r.currency))].join(", "),
        asins: new Set(parsed.rows.map((r) => r.asin)).size,
        campaigns: new Set(parsed.rows.map((r) => r.campaign)).size,
      }
    : null;

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-5 p-4 sm:p-6">
      <PageHeader
        icon={MegaphoneIcon}
        title="Importa spesa Amazon Ads"
        description="Dalla console Amazon Ads (advertising.amazon.com) esporta il report «Prodotto pubblicizzato» con dettaglio giornaliero, in CSV o Excel, e caricalo qui. La console è una per mercato: ripeti per ciascuno."
      />
      <KdpTabs current="sales" />

      <section className="flex flex-col gap-3 rounded-xl border p-4">
        <Label htmlFor="ads-file">Report «Prodotto pubblicizzato»</Label>
        <Input
          ref={fileRef}
          id="ads-file"
          type="file"
          disabled={!ready}
          accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void read(file);
          }}
        />
        <p className="text-xs text-muted-foreground">
          Report → Crea report → Prodotto pubblicizzato, periodo a scelta, unità di tempo
          «Giornaliero». Le spese già importate per lo stesso account, valuta e periodo vengono
          sostituite.
        </p>
      </section>

      {parsed && summary && (
        <form
          className="flex flex-col gap-4 rounded-xl border p-4"
          onSubmit={(event) => {
            event.preventDefault();
            submit();
          }}
        >
          <dl
            className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4"
            data-testid="ads-import-summary"
          >
            {[
              ["Periodo", `${parsed.from} – ${parsed.to}`],
              ["Spesa", `${summary.spend.toFixed(2)} ${summary.currencies}`],
              ["ASIN", formatInt(summary.asins)],
              ["Campagne", formatInt(summary.campaigns)],
            ].map(([label, value]) => (
              <div key={label} className="rounded-lg border p-3">
                <dt className="text-xs text-muted-foreground">{label}</dt>
                <dd className="font-semibold">{value}</dd>
              </div>
            ))}
          </dl>
          {parsed.skipped > 0 && (
            <p className="text-xs text-muted-foreground">
              {parsed.skipped} righe ignorate (totali o senza data e ASIN).
            </p>
          )}
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1 text-sm font-medium">Di quale account è questa console?</legend>
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
          <AccountHint
            detected={{ account: parsed.account, matches: parsed.matches }}
            what="ASIN"
          />
          <div className="flex gap-2">
            <Button type="submit" disabled={pending || !account}>
              {pending ? "Importazione…" : "Importa"}
            </Button>
            <Button asChild variant="outline">
              <Link href="/kdp/vendite">Annulla</Link>
            </Button>
          </div>
        </form>
      )}

      <section className="flex flex-col gap-3 rounded-xl border p-4">
        <h2 className="font-semibold">Tassi di cambio</h2>
        <p className="text-sm text-muted-foreground">
          Le royalty sono in EUR, la spesa nella valuta di ogni console: euro per una unità di
          valuta. Aggiornali quando vuoi, i grafici si ricalcolano.
        </p>
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
          {Object.keys(DEFAULT_FX).map((code) => (
            <div key={code} className="flex flex-col gap-1">
              <Label htmlFor={`fx-${code}`} className="text-xs">
                {code}
              </Label>
              <Input
                id={`fx-${code}`}
                inputMode="decimal"
                value={fx[code] ?? ""}
                disabled={code === "EUR"}
                onChange={(event) => setFx((v) => ({ ...v, [code]: event.target.value }))}
              />
            </div>
          ))}
        </div>
        <div>
          <Button type="button" variant="outline" onClick={saveFx} disabled={pending}>
            Salva tassi
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          Esempio: USD 0,92 vuol dire 1 $ = {formatEuro(0.92)}.
        </p>
      </section>
    </main>
  );
}
