import { DownloadIcon, WalletIcon } from "lucide-react";
import type { Metadata } from "next";

import { KdpTabs } from "@/components/kdp/kdp-tabs";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { accountLabel, todayIn } from "@/lib/kdp";
import { duePayouts, PAYOUT_DELAY_MONTHS } from "@/lib/kdp-finance";
import { formatEuro } from "@/lib/kdp-sales";
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

export default async function PayoutsPage() {
  await requireSession();
  const today = todayIn(TIME_ZONE);
  const [payouts, years] = await Promise.all([getPayouts(today), getSalesYears()]);
  const due = duePayouts(payouts);
  const recent = payouts.slice(0, 24);

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-col gap-5 p-4 sm:p-6">
      <PageHeader
        icon={WalletIcon}
        title="Incassi KDP"
        description={`KDP paga le royalty di un mese circa ${PAYOUT_DELAY_MONTHS * 30} giorni dopo la fine del mese. Date e importi sono stime dai report importati, in EUR.`}
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
                <th className="px-3 py-2 font-medium">Pagamento</th>
                <th className="px-3 py-2 font-medium">Stato</th>
              </tr>
            </thead>
            <tbody>
              {recent.map((p) => (
                <tr key={`${p.month}-${p.account}`} className="border-b last:border-0">
                  <td className="px-3 py-2">{month(p.month)}</td>
                  <td className="px-3 py-2 text-muted-foreground">{accountLabel(p.account)}</td>
                  <td className="px-3 py-2 text-right font-medium tabular-nums">
                    {formatEuro(p.royalty)}
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
              ))}
            </tbody>
          </table>
        </div>
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
