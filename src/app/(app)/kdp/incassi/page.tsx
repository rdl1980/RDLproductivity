import { DownloadIcon, ReceiptTextIcon, WalletIcon } from "lucide-react";
import Link from "next/link";
import type { Metadata } from "next";

import { KdpTabs } from "@/components/kdp/kdp-tabs";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { accountLabel, KDP_ACCOUNT_VALUES, todayIn } from "@/lib/kdp";
import {
  duePayouts,
  PAYOUT_DELAY_MONTHS,
  payoutTransfers,
  transferYears,
  yearTransfers,
} from "@/lib/kdp-finance";
import { formatEuro, marketplaceLabel } from "@/lib/kdp-sales";
import { cn } from "@/lib/utils";
import { getPayouts, getSalesYears } from "@/server/queries/kdp-finance";
import { requireSession } from "@/server/session";

export const metadata: Metadata = { title: "Incassi KDP · RDL Productivity" };

const TIME_ZONE = process.env.DEFAULT_TIME_ZONE ?? "Europe/Rome";

const monthLabel = new Intl.DateTimeFormat("it-IT", {
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});
const dateLabel = new Intl.DateTimeFormat("it-IT", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});
const month = (key: string) => {
  const label = monthLabel.format(new Date(`${key}-01T00:00:00Z`));
  return label.charAt(0).toUpperCase() + label.slice(1);
};
const date = (key: string) => dateLabel.format(new Date(`${key}T00:00:00Z`));

export default async function PayoutsPage({ searchParams }: PageProps<"/kdp/incassi">) {
  await requireSession();
  const today = todayIn(TIME_ZONE);
  const [payouts, years, params] = await Promise.all([
    getPayouts(today),
    getSalesYears(),
    searchParams,
  ]);
  const due = duePayouts(payouts);
  const recent = payouts.slice(0, 24);
  // The tax return covers the year before: open on it when there is data.
  const taxYears = transferYears(payouts);
  const asked = Number(params.anno);
  const lastYear = Number(today.slice(0, 4)) - 1;
  const taxYear = taxYears.includes(asked)
    ? asked
    : taxYears.includes(lastYear)
      ? lastYear
      : (taxYears[0] ?? lastYear);
  const byAccount = yearTransfers(payouts, taxYear, KDP_ACCOUNT_VALUES);
  const yearTotal = byAccount.reduce((sum, a) => sum + a.received + a.due, 0);

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-col gap-5 p-4 sm:p-6">
      <PageHeader
        icon={WalletIcon}
        title="Incassi KDP"
        description={`KDP paga le royalty di un mese circa ${PAYOUT_DELAY_MONTHS * 30} giorni dopo la fine del mese, con un bonifico separato per ogni mercato, nella valuta di quel mercato. Date e importi sono stime in EUR dai report importati: il bonifico reale dipende dal cambio del giorno e da eventuali soglie minime di pagamento.`}
      />
      <KdpTabs current="payouts" />

      <section aria-label="In arrivo" className="flex flex-col gap-2">
        <h2 className="text-lg font-semibold">In arrivo</h2>
        {due.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nessun pagamento in arrivo: importa le vendite da Vendite → Aggiorna dati.
          </p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-3" data-testid="payouts-due">
            {due.map((entry) => (
              <div key={entry.payDate} className="flex flex-col gap-1 rounded-xl border p-4">
                <span className="text-sm text-muted-foreground">
                  entro il {date(entry.payDate)}
                </span>
                <span className="text-3xl font-semibold tracking-tight tabular-nums">
                  {formatEuro(entry.royalty)}
                </span>
                {entry.transfers > 0 && (
                  <span className="text-xs text-muted-foreground">
                    {entry.transfers} {entry.transfers === 1 ? "bonifico" : "bonifici"}
                  </span>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      <section aria-label="Per mese" className="flex flex-col gap-2">
        <h2 className="text-lg font-semibold">Per mese</h2>
        <div className="overflow-x-auto rounded-xl border">
          <table className="w-full text-left text-sm" data-testid="payouts-table">
            <thead>
              <tr className="border-b bg-muted/40 text-xs text-muted-foreground">
                <th className="px-3 py-2 font-medium">Mese di vendita</th>
                <th className="px-3 py-2 font-medium">Account</th>
                <th className="px-3 py-2 text-right font-medium">Royalty</th>
                <th className="px-3 py-2 font-medium">Bonifici per mercato</th>
                <th className="px-3 py-2 font-medium">Pagamento</th>
                <th className="px-3 py-2 font-medium">Stato</th>
              </tr>
            </thead>
            <tbody>
              {recent.map((p) => {
                const transfers = payoutTransfers(p.markets);
                return (
                  <tr key={`${p.month}-${p.account}`} className="border-b align-top last:border-0">
                    <td className="px-3 py-2">{month(p.month)}</td>
                    <td className="px-3 py-2 text-muted-foreground">{accountLabel(p.account)}</td>
                    <td className="px-3 py-2 text-right font-medium tabular-nums">
                      {formatEuro(p.royalty)}
                    </td>
                    <td className="px-3 py-2">
                      {transfers.length > 0 && (
                        <details data-testid="payout-transfers">
                          <summary className="cursor-pointer text-primary">
                            {transfers.length} {transfers.length === 1 ? "bonifico" : "bonifici"}
                          </summary>
                          <table className="mt-1.5 w-full text-xs">
                            <tbody>
                              {transfers.map((t) => (
                                <tr key={t.marketplace}>
                                  <td className="py-0.5 pr-3">{marketplaceLabel(t.marketplace)}</td>
                                  <td className="py-0.5 pr-3 text-muted-foreground">
                                    {t.currency}
                                  </td>
                                  <td className="py-0.5 text-right tabular-nums">
                                    {formatEuro(t.royalty)}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </details>
                      )}
                    </td>
                    <td className="px-3 py-2 tabular-nums">{date(p.payDate)}</td>
                    <td className="px-3 py-2">
                      <span
                        className={cn(
                          "rounded-md px-1.5 py-0.5 text-xs font-medium",
                          p.status === "paid"
                            ? "bg-green-100 text-green-800 dark:bg-green-500/15 dark:text-green-300"
                            : "bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300",
                        )}
                      >
                        {p.status === "paid" ? "pagato" : "in arrivo"}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section
        aria-label="Bonifici dell'anno"
        className="flex flex-col gap-3"
        id="anno"
        data-testid="tax-year"
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="flex items-center gap-2 text-lg font-semibold">
            <ReceiptTextIcon className="size-5 text-muted-foreground" />
            Bonifici dell&apos;anno {taxYear} (per il 730)
          </h2>
          {taxYears.length > 0 && (
            <Button asChild variant="outline" size="sm">
              <a href={`/api/kdp/export-bonifici?year=${taxYear}`} download>
                <DownloadIcon />
                Excel {taxYear}
              </a>
            </Button>
          )}
        </div>
        <p className="text-sm text-muted-foreground">
          Principio di cassa: contano i bonifici pagati nell&apos;anno solare, cioè le vendite da
          novembre dell&apos;anno prima a ottobre. Importi stimati in EUR dai report KDP: per USD,
          GBP e le altre valute la cifra arrivata in banca dipende dal cambio, quindi per la
          dichiarazione usa l&apos;estratto conto o i «Payments» di KDP. Le royalty dei libri sono
          di norma redditi da diritti d&apos;autore (quadro D, rigo D5): verifica con il
          commercialista o il CAF.
        </p>
        {taxYears.length > 1 && (
          <nav aria-label="Anno" className="flex flex-wrap gap-1">
            {taxYears.map((y) => (
              <Link
                key={y}
                href={`/kdp/incassi?anno=${y}#anno`}
                aria-current={y === taxYear ? "page" : undefined}
                className={cn(
                  "rounded-md border px-2.5 py-1 text-sm",
                  y === taxYear
                    ? "border-primary bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {y}
              </Link>
            ))}
          </nav>
        )}
        <div className="grid gap-3 sm:grid-cols-3">
          {byAccount.map((a) => (
            <div
              key={a.account}
              className="flex flex-col gap-1 rounded-xl border p-4"
              data-testid="tax-account"
              data-account={a.account}
            >
              <span className="text-sm text-muted-foreground">{accountLabel(a.account)}</span>
              <span className="text-3xl font-semibold tracking-tight tabular-nums">
                {formatEuro(a.received + a.due)}
              </span>
              <span className="text-xs text-muted-foreground">
                {a.transfers.length} {a.transfers.length === 1 ? "bonifico" : "bonifici"}
                {a.due > 0 ? ` · ${formatEuro(a.due)} ancora da ricevere` : ""}
              </span>
            </div>
          ))}
        </div>
        <p className="text-sm">
          Totale {taxYear}: <strong className="tabular-nums">{formatEuro(yearTotal)}</strong>
        </p>
        {byAccount
          .filter((a) => a.transfers.length > 0)
          .map((a) => (
            <details key={a.account} className="rounded-xl border p-3 text-sm">
              <summary className="cursor-pointer font-medium">
                Bonifici di {accountLabel(a.account)} ({a.transfers.length})
              </summary>
              <div className="mt-2 overflow-x-auto">
                <table className="w-full text-left" data-testid="tax-transfers">
                  <thead>
                    <tr className="border-b text-xs text-muted-foreground">
                      <th className="py-1 pr-3 font-medium">Pagamento</th>
                      <th className="py-1 pr-3 font-medium">Vendite di</th>
                      <th className="py-1 pr-3 font-medium">Mercato</th>
                      <th className="py-1 pr-3 font-medium">Valuta</th>
                      <th className="py-1 pr-3 text-right font-medium">Importo stimato</th>
                      <th className="py-1 font-medium">Stato</th>
                    </tr>
                  </thead>
                  <tbody>
                    {a.transfers.map((t) => (
                      <tr key={`${t.month}-${t.marketplace}`} className="border-b last:border-0">
                        <td className="py-1 pr-3 tabular-nums">{date(t.payDate)}</td>
                        <td className="py-1 pr-3">{month(t.month)}</td>
                        <td className="py-1 pr-3">{marketplaceLabel(t.marketplace)}</td>
                        <td className="py-1 pr-3 text-muted-foreground">{t.currency}</td>
                        <td className="py-1 pr-3 text-right tabular-nums">
                          {formatEuro(t.royalty)}
                        </td>
                        <td className="py-1 text-xs">
                          {t.status === "paid" ? "ricevuto" : "in arrivo"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
          ))}
      </section>

      <section aria-label="Export fiscale" className="flex flex-col gap-2">
        <h2 className="text-lg font-semibold">Export per il commercialista</h2>
        <p className="text-sm text-muted-foreground">
          Un file Excel per anno: un foglio col dettaglio per mese, account e mercato (copie per
          formato, pagine KENP, royalty per formato) e uno con i totali mensili e la data di
          pagamento attesa.
        </p>
        {years.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nessuna vendita importata.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {years.map((year) => (
              <Button key={year} asChild variant="outline">
                <a href={`/api/kdp/export?year=${year}`} download>
                  <DownloadIcon />
                  Vendite {year} (Excel)
                </a>
              </Button>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
