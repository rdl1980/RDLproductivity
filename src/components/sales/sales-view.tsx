"use client";

import {
  ArrowDownRightIcon,
  ArrowUpRightIcon,
  TrendingUpIcon,
  UploadIcon,
  XIcon,
} from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { BarList } from "@/components/stats/bar-list";
import { KdpTabs } from "@/components/kdp/kdp-tabs";
import { BookmarkletStep } from "@/components/kdp/bookmarklet-step";
import { LocalDateTime } from "@/components/local-date-time";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import Link from "next/link";

import { accountLabel, KDP_ACCOUNTS, type KdpAccount } from "@/lib/kdp";
import { daysSince, SALES_STALE_DAYS } from "@/lib/kdp-freshness";
import { salesBookmarkletHref, salesCollectorSource } from "@/lib/kdp-sales-collector";
import {
  addDays,
  autoGranularity,
  bucketLabel,
  change,
  daysBetween,
  filterRecords,
  formatCompact,
  formatEuro,
  formatEuroCompact,
  formatInt,
  GRANULARITIES,
  type Granularity,
  groupSums,
  launchCurve,
  marketplaceLabel,
  previousPeriod,
  SALE_SOURCES,
  type SaleBook,
  type SaleRecord,
  type SaleSource,
  SOURCE_COLORS,
  SOURCE_LABELS,
  sumRecords,
  timeSeries,
  unresolvedCounts,
  weekdayAverages,
} from "@/lib/kdp-sales";
import { cn } from "@/lib/utils";
import type { KdpGoals } from "@/server/queries/kdp-goals";
import type { CatalogBook, SalesImportInfo } from "@/server/queries/kdp-sales";

import {
  AreaLine,
  type HeatCell,
  Heatmap,
  Legend,
  MultiLine,
  SegmentBar,
  type Series,
  Sparkline,
  StackedColumns,
} from "./charts";
import { GoalTile } from "./goal-tile";
import { TitleAliasDialog } from "./title-alias-dialog";

const PERIODS = [
  { value: "30d", label: "Ultimi 30 giorni" },
  { value: "90d", label: "Ultimi 90 giorni" },
  { value: "12m", label: "Ultimi 12 mesi" },
  { value: "ytd", label: "Anno in corso" },
  { value: "all", label: "Tutto lo storico" },
  { value: "custom", label: "Personalizzato" },
] as const;
type Period = (typeof PERIODS)[number]["value"];

const METRICS = [
  { value: "royalty", label: "Royalty" },
  { value: "units", label: "Copie" },
  { value: "kenp", label: "Pagine KENP" },
] as const;
type Metric = (typeof METRICS)[number]["value"];

export type SalesState = {
  period: Period;
  from: string;
  to: string;
  account: KdpAccount | "all";
  markets: string[];
  sources: SaleSource[];
  book: string | null;
  granularity: Granularity | "auto";
  metric: Metric;
};

type Props = {
  records: SaleRecord[];
  books: SaleBook[];
  catalog: CatalogBook[];
  imports: Partial<Record<KdpAccount, SalesImportInfo>>;
  goals: KdpGoals;
  monthToDate: Record<KdpAccount, number>;
  today: string;
  initial: SalesState;
  origin: string;
};

function periodRange(
  state: SalesState,
  today: string,
  first: string,
): { from: string; to: string } {
  switch (state.period) {
    case "30d":
      return { from: addDays(today, -29), to: today };
    case "90d":
      return { from: addDays(today, -89), to: today };
    case "12m":
      return { from: addDays(today, -364), to: today };
    case "ytd":
      return { from: `${today.slice(0, 4)}-01-01`, to: today };
    case "all":
      return { from: first, to: today };
    case "custom":
      return state.from <= state.to
        ? { from: state.from, to: state.to }
        : { from: state.to, to: state.from };
  }
}

/** Filters live in the URL (replaceState): reload and share keep the view. */
function writeUrl(state: SalesState) {
  const params = new URLSearchParams();
  if (state.period !== "90d") params.set("period", state.period);
  if (state.period === "custom") {
    params.set("from", state.from);
    params.set("to", state.to);
  }
  if (state.account !== "all") params.set("account", state.account);
  if (state.markets.length) params.set("markets", state.markets.join(","));
  if (state.sources.length !== SALE_SOURCES.length) params.set("sources", state.sources.join(","));
  if (state.book) params.set("book", state.book);
  if (state.granularity !== "auto") params.set("gran", state.granularity);
  if (state.metric !== "royalty") params.set("metric", state.metric);
  const query = params.toString();
  window.history.replaceState(null, "", query ? `?${query}` : window.location.pathname);
}

export function SalesView({
  records,
  books,
  catalog,
  imports,
  goals,
  monthToDate,
  today,
  initial,
  origin,
}: Props) {
  const [state, setState] = useState(initial);
  const [syncOpen, setSyncOpen] = useState(false);
  const [aliasing, setAliasing] = useState<SaleBook | null>(null);
  const update = (patch: Partial<SalesState>) =>
    setState((s) => {
      const next = { ...s, ...patch };
      writeUrl(next);
      return next;
    });

  const bookTitles = useMemo(() => new Map(books.map((b) => [b.key, b])), [books]);
  const first = records.length ? records[0].d : today;
  const range = periodRange(state, today, first);
  const granularity =
    state.granularity === "auto" ? autoGranularity(range.from, range.to) : state.granularity;
  const sources = useMemo(() => new Set(state.sources), [state.sources]);
  const marketsAll = useMemo(() => [...new Set(records.map((r) => r.m))].sort(), [records]);

  const base = { account: state.account, markets: new Set(state.markets), book: state.book };
  const current = useMemo(
    () => filterRecords(records, { ...base, ...range }),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `base` is rebuilt from these fields
    [records, range.from, range.to, state.account, state.markets, state.book],
  );
  const prevRange = previousPeriod(range.from, range.to);
  const previous = useMemo(
    () => filterRecords(records, { ...base, ...prevRange }),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- as above
    [records, prevRange.from, prevRange.to, state.account, state.markets, state.book],
  );
  const totals = sumRecords(current, sources);
  const prevTotals = sumRecords(previous, sources);
  const series = timeSeries(current, range.from, range.to, granularity, sources);

  if (records.length === 0) {
    return (
      <main className="mx-auto flex w-full max-w-7xl flex-col gap-5 p-4 sm:p-6">
        <Header onSync={() => setSyncOpen(true)} />
        <div className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
          Nessuna vendita importata. Usa <strong>Aggiorna dati</strong> dalla pagina Report di KDP.
        </div>
        <SyncDialog open={syncOpen} onOpenChange={setSyncOpen} origin={origin} />
      </main>
    );
  }

  // --- Derived datasets ---------------------------------------------------------
  const firstSale = new Map<string, string>();
  for (const r of records) if (!firstSale.has(r.book)) firstSale.set(r.book, r.d);
  const sourceSeries = (list: SaleSource[]): Series[] =>
    list
      .filter((s) => sources.has(s))
      .map((s) => ({ key: s, label: SOURCE_LABELS[s], color: SOURCE_COLORS[s] }));
  const unitSources = sourceSeries(["ebook", "paperback", "hardcover"]);
  const royaltySources = sourceSeries([...SALE_SOURCES]);
  const trendSeries: Series[] =
    state.metric === "royalty"
      ? royaltySources
      : state.metric === "units"
        ? unitSources
        : [{ key: "kenp", label: SOURCE_LABELS.kenp, color: SOURCE_COLORS.kenp }];
  const valueOf = (sums: (typeof series)[number]["sums"], key: string) =>
    state.metric === "royalty"
      ? sums.bySource[key as SaleSource].royalty
      : state.metric === "units"
        ? sums.bySource[key as SaleSource].units
        : sums.kenp;
  const metricFormat = state.metric === "royalty" ? formatEuro : formatInt;
  const metricAxis = state.metric === "royalty" ? formatEuroCompact : formatCompact;
  const detail = (start: string) =>
    granularity === "day"
      ? bucketLabel(start, "day")
      : granularity === "week"
        ? `Settimana dal ${bucketLabel(start, "day")}`
        : bucketLabel(start, "month");

  let running = 0;
  const cumulative = series.map((b) => ({
    label: bucketLabel(b.start, granularity),
    detail: `Fino a ${detail(b.start).toLowerCase()}`,
    value: (running += b.sums.royalty),
  }));

  const byMarket = [...groupSums(current, (r) => r.m, sources)].sort(
    (a, b) => b[1].royalty - a[1].royalty,
  );
  const byBook = [...groupSums(current, (r) => r.book, sources)].sort(
    (a, b) => b[1].royalty - a[1].royalty,
  );
  const bySeries = [
    ...groupSums(current, (r) => bookTitles.get(r.book)?.series ?? "Senza collana", sources),
  ].sort((a, b) => b[1].royalty - a[1].royalty);
  const weekdays = weekdayAverages(current, range.from, range.to, sources);
  const sparkBuckets = series.slice(-12);
  const bookTrend = (book: string) => {
    const own = current.filter((r) => r.book === book);
    const s = timeSeries(own, sparkBuckets[0]?.start ?? range.from, range.to, granularity, sources);
    return s.map((b) => b.sums.royalty);
  };

  // Heatmap: the last 26 weeks of the period, by day.
  const heatEnd = range.to;
  const heatStart = addDays(heatEnd, -(26 * 7 - 1));
  const daily = new Map(
    timeSeries(
      filterRecords(records, { ...base, from: heatStart, to: heatEnd }),
      heatStart,
      heatEnd,
      "day",
      sources,
    ).map((b) => [b.start, b.sums.royalty]),
  );
  const heatWeeks: HeatCell[][] = [];
  const firstMonday = addDays(
    heatStart,
    -((new Date(`${heatStart}T00:00:00Z`).getUTCDay() + 6) % 7),
  );
  for (let w = firstMonday; w <= heatEnd; w = addDays(w, 7)) {
    heatWeeks.push(
      Array.from({ length: 7 }, (_, d) => {
        const key = addDays(w, d);
        return {
          key,
          detail: bucketLabel(key, "day"),
          value: daily.get(key) ?? 0,
          empty: key < heatStart || key > heatEnd,
        };
      }),
    );
  }

  // Launch curves: the three best sellers of the period, 90 days from their first sale.
  const launchBooks = [...groupSums(current, (r) => r.book, sources)]
    .sort((a, b) => b[1].units - a[1].units)
    .slice(0, 3)
    .filter(([, s]) => s.units > 0)
    .map(([key]) => key);
  const LAUNCH_DAYS = 90;
  // Each curve stops today: a book out for 20 days has 21 points.
  const launchValues = launchBooks.map((key) => {
    const curve = launchCurve(records, key, LAUNCH_DAYS, sources);
    const age = firstSale.has(key) ? daysBetween(firstSale.get(key)!, today) : LAUNCH_DAYS;
    return curve.slice(0, Math.min(LAUNCH_DAYS, age) + 1);
  });
  const launchSeries: Series[] = launchBooks.map((key, i) => ({
    key,
    label: bookTitles.get(key)?.title ?? key,
    color: `var(--series-${i + 1})`,
  }));

  const selectedBook = state.book ? bookTitles.get(state.book) : null;
  const avgPerUnit = totals.units
    ? (totals.royalty - totals.bySource.kenp.royalty) / totals.units
    : 0;
  const prevAvgPerUnit = prevTotals.units
    ? (prevTotals.royalty - prevTotals.bySource.kenp.royalty) / prevTotals.units
    : 0;

  return (
    <main className="mx-auto flex w-full max-w-7xl flex-col gap-5 p-4 sm:p-6">
      <Header onSync={() => setSyncOpen(true)} />
      <ImportStatus imports={imports} today={today} />
      <UnresolvedBanner books={books} />

      <Filters
        state={state}
        update={update}
        markets={marketsAll}
        books={books}
        range={range}
        granularity={granularity}
      />

      {selectedBook && (
        <div className="flex items-center gap-2 rounded-lg bg-accent px-3 py-2 text-sm text-accent-foreground">
          <span>
            Libro: <strong>{selectedBook.title}</strong> ({accountLabel(selectedBook.account)})
          </span>
          <Button
            size="sm"
            variant="ghost"
            className="ml-auto"
            onClick={() => update({ book: null })}
          >
            <XIcon />
            Tutti i libri
          </Button>
        </div>
      )}

      <section
        aria-label="Riepilogo"
        className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6"
        data-testid="sales-kpis"
      >
        <div className="flex flex-col gap-1 rounded-xl border p-4 lg:col-span-2">
          <span className="text-sm text-muted-foreground">Royalty nel periodo</span>
          <span className="text-5xl font-semibold tracking-tight" data-testid="sales-hero">
            {formatEuro(totals.royalty)}
          </span>
          <Delta
            value={change(totals.royalty, prevTotals.royalty)}
            previous={formatEuro(prevTotals.royalty)}
          />
        </div>
        <Tile
          label="Copie vendute"
          value={formatInt(totals.units)}
          delta={change(totals.units, prevTotals.units)}
          previous={formatInt(prevTotals.units)}
        />
        <Tile
          label="Pagine KENP lette"
          value={formatInt(totals.kenp)}
          delta={change(totals.kenp, prevTotals.kenp)}
          previous={formatInt(prevTotals.kenp)}
        />
        <Tile
          label="Royalty media per copia"
          value={totals.units ? formatEuro(avgPerUnit) : "–"}
          delta={totals.units && prevTotals.units ? change(avgPerUnit, prevAvgPerUnit) : null}
          previous={prevTotals.units ? formatEuro(prevAvgPerUnit) : "–"}
        />
        <GoalTile goals={goals} account={state.account} monthToDate={monthToDate} today={today} />
      </section>

      <Panel
        title="Andamento"
        description={`${METRICS.find((m) => m.value === state.metric)!.label} per ${GRANULARITIES.find((g) => g.value === granularity)!.label.toLowerCase()}, ${bucketLabel(range.from, "day")} – ${bucketLabel(range.to, "day")}`}
        actions={
          <div role="radiogroup" aria-label="Misura" className="flex rounded-md border p-0.5">
            {METRICS.map((m) => (
              <button
                key={m.value}
                type="button"
                role="radio"
                aria-checked={state.metric === m.value}
                onClick={() => update({ metric: m.value })}
                className={cn(
                  "rounded px-2.5 py-1 text-xs font-medium",
                  state.metric === m.value
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {m.label}
              </button>
            ))}
          </div>
        }
        table={{
          headers: ["Periodo", ...trendSeries.map((s) => s.label), "Totale"],
          rows: series.map((b) => [
            detail(b.start),
            ...trendSeries.map((s) => metricFormat(valueOf(b.sums, s.key))),
            metricFormat(trendSeries.reduce((sum, s) => sum + valueOf(b.sums, s.key), 0)),
          ]),
        }}
      >
        {trendSeries.length > 1 && <Legend series={trendSeries} />}
        <StackedColumns
          data={series.map((b) => ({
            label: bucketLabel(b.start, granularity),
            detail: detail(b.start),
            values: trendSeries.map((s) => valueOf(b.sums, s.key)),
          }))}
          series={trendSeries}
          format={metricFormat}
          formatAxis={metricAxis}
          label="Andamento nel periodo"
        />
      </Panel>

      <div className="grid gap-5 lg:grid-cols-2">
        <Panel
          title="Royalty cumulate"
          description="Totale progressivo nel periodo"
          table={{
            headers: ["Periodo", "Cumulato"],
            rows: cumulative.map((c) => [c.detail, formatEuro(c.value)]),
          }}
        >
          <AreaLine
            data={cumulative}
            format={formatEuro}
            formatAxis={formatEuroCompact}
            label="Royalty cumulate"
          />
        </Panel>
        <Panel
          title="Mix per formato"
          description="Quota delle royalty per formato e KENP"
          table={{
            headers: ["Formato", "Royalty", "Copie"],
            rows: royaltySources.map((s) => [
              s.label,
              formatEuro(totals.bySource[s.key as SaleSource].royalty),
              s.key === "kenp"
                ? `${formatInt(totals.kenp)} pagine`
                : formatInt(totals.bySource[s.key as SaleSource].units),
            ]),
          }}
        >
          <SegmentBar
            parts={royaltySources.map((s) => ({
              ...s,
              value: totals.bySource[s.key as SaleSource].royalty,
            }))}
            format={formatEuro}
            label="Royalty per formato"
          />
        </Panel>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <Panel
          title="Per mercato"
          description="Royalty per marketplace Amazon"
          table={{
            headers: ["Mercato", "Royalty", "Copie", "KENP"],
            rows: byMarket.map(([m, s]) => [
              marketplaceLabel(m),
              formatEuro(s.royalty),
              formatInt(s.units),
              formatInt(s.kenp),
            ]),
          }}
        >
          <BarList
            label="Royalty per mercato"
            rows={byMarket.slice(0, 10).map(([m, s]) => ({
              key: m,
              label: marketplaceLabel(m),
              value: Math.max(0, s.royalty),
              display: formatEuro(s.royalty),
              detail: `${formatInt(s.units)} copie`,
            }))}
          />
        </Panel>
        <Panel
          title="Per collana"
          description="Royalty dei libri raggruppati per collana KDP"
          table={{
            headers: ["Collana", "Royalty", "Copie"],
            rows: bySeries.map(([k, s]) => [k, formatEuro(s.royalty), formatInt(s.units)]),
          }}
        >
          <BarList
            label="Royalty per collana"
            rows={bySeries.slice(0, 10).map(([k, s]) => ({
              key: k,
              label: k,
              value: Math.max(0, s.royalty),
              display: formatEuro(s.royalty),
              detail: `${formatInt(s.units)} copie`,
            }))}
          />
        </Panel>
      </div>

      <section className="flex flex-col gap-3 rounded-xl border p-4" aria-label="Libri">
        <div className="flex flex-col gap-0.5">
          <h2 className="font-semibold">Libri</h2>
          <p className="text-xs text-muted-foreground">
            Clicca un titolo per filtrare tutta la pagina su quel libro. Tendenza: ultimi{" "}
            {sparkBuckets.length} periodi.
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[52rem] text-left text-sm" data-testid="sales-books">
            <thead>
              <tr className="border-b text-xs text-muted-foreground">
                <th className="py-2 pr-3 font-medium">Libro</th>
                <th className="py-2 pr-3 text-right font-medium">eBook</th>
                <th className="py-2 pr-3 text-right font-medium">Cartaceo</th>
                <th className="py-2 pr-3 text-right font-medium">Rigida</th>
                <th className="py-2 pr-3 text-right font-medium">KENP</th>
                <th className="py-2 pr-3 text-right font-medium">Royalty</th>
                <th className="py-2 pr-3 text-right font-medium">Quota</th>
                <th className="py-2 pr-3 font-medium">Tendenza</th>
                <th className="py-2 font-medium">Prima vendita</th>
              </tr>
            </thead>
            <tbody>
              {byBook.map(([key, s]) => {
                const book = bookTitles.get(key);
                return (
                  <tr key={key} className="border-b last:border-0">
                    <td className="max-w-80 py-2 pr-3">
                      <button
                        type="button"
                        onClick={() => update({ book: key })}
                        className="text-left font-medium hover:underline"
                      >
                        {book?.title ?? key}
                      </button>
                      <span className="block text-xs text-muted-foreground">
                        {book ? accountLabel(book.account) : ""}
                        {book?.titleKey && (
                          <>
                            {" · "}
                            <button
                              type="button"
                              onClick={() => setAliasing(book)}
                              className="text-primary hover:underline"
                            >
                              {book.unresolved ? "Assegna titolo" : "Cambia titolo"}
                            </button>
                          </>
                        )}
                      </span>
                    </td>
                    <td className="py-2 pr-3 text-right tabular-nums">
                      {formatInt(s.bySource.ebook.units)}
                    </td>
                    <td className="py-2 pr-3 text-right tabular-nums">
                      {formatInt(s.bySource.paperback.units)}
                    </td>
                    <td className="py-2 pr-3 text-right tabular-nums">
                      {formatInt(s.bySource.hardcover.units)}
                    </td>
                    <td className="py-2 pr-3 text-right tabular-nums">{formatInt(s.kenp)}</td>
                    <td className="py-2 pr-3 text-right font-medium tabular-nums">
                      {formatEuro(s.royalty)}
                    </td>
                    <td className="py-2 pr-3 text-right text-muted-foreground tabular-nums">
                      {totals.royalty > 0
                        ? `${Math.round((s.royalty / totals.royalty) * 100)}%`
                        : "–"}
                    </td>
                    <td className="py-2 pr-3">
                      <Sparkline
                        values={bookTrend(key)}
                        label={`Tendenza di ${book?.title ?? key}`}
                      />
                    </td>
                    <td className="py-2 text-muted-foreground tabular-nums">
                      {firstSale.get(key)
                        ? bucketLabel(firstSale.get(key)!, "day") +
                          " " +
                          firstSale.get(key)!.slice(0, 4)
                        : "–"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <div className="grid gap-5 lg:grid-cols-2">
        <Panel
          title="Giorno della settimana"
          description="Royalty medie per giorno nel periodo"
          table={{
            headers: ["Giorno", "Media"],
            rows: WEEKDAYS.map((d, i) => [d, formatEuro(weekdays[i])]),
          }}
        >
          <StackedColumns
            data={WEEKDAYS.map((d, i) => ({
              label: d.slice(0, 3),
              detail: d,
              values: [weekdays[i]],
            }))}
            series={[{ key: "avg", label: "Media", color: "var(--chart-1)" }]}
            format={formatEuro}
            formatAxis={formatEuroCompact}
            label="Royalty medie per giorno della settimana"
            height={180}
          />
        </Panel>
        <Panel
          title="Calendario"
          description={`Royalty giornaliere, ultime 26 settimane fino al ${bucketLabel(heatEnd, "day")}`}
          table={{
            headers: ["Giorno", "Royalty"],
            rows: [...daily]
              .filter(([, v]) => v !== 0)
              .map(([d, v]) => [bucketLabel(d, "day") + " " + d.slice(0, 4), formatEuro(v)]),
          }}
        >
          <Heatmap
            weeks={heatWeeks}
            format={formatEuro}
            label="Royalty giornaliere"
            weekLabels={heatWeeks.map((w) => bucketLabel(w[0].key, "day"))}
          />
        </Panel>
      </div>

      {launchSeries.length > 0 && (
        <Panel
          title="Curve di lancio"
          description={`Copie cumulate nei primi ${LAUNCH_DAYS} giorni dalla prima vendita: i ${launchSeries.length} libri più venduti del periodo`}
          table={{
            headers: ["Libro", "7 giorni", "30 giorni", `${LAUNCH_DAYS} giorni`],
            rows: launchSeries.map((s, i) => [
              s.label,
              formatInt(launchValues[i][7] ?? launchValues[i].at(-1) ?? 0),
              formatInt(launchValues[i][30] ?? launchValues[i].at(-1) ?? 0),
              formatInt(launchValues[i][LAUNCH_DAYS] ?? launchValues[i].at(-1) ?? 0),
            ]),
          }}
        >
          <Legend series={launchSeries} />
          <MultiLine
            xs={Array.from({ length: LAUNCH_DAYS + 1 }, (_, i) => i)}
            series={launchSeries}
            values={launchValues}
            format={formatInt}
            xLabel={(d) => `Giorno ${d}`}
            label="Curve di lancio"
          />
        </Panel>
      )}

      <SyncDialog open={syncOpen} onOpenChange={setSyncOpen} origin={origin} />
      <TitleAliasDialog book={aliasing} catalog={catalog} onClose={() => setAliasing(null)} />
    </main>
  );
}

/** Last import per account; amber when older than a week. */
function ImportStatus({
  imports,
  today,
}: {
  imports: Partial<Record<KdpAccount, SalesImportInfo>>;
  today: string;
}) {
  const now = new Date(`${today}T23:59:59Z`);
  return (
    <p className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
      {KDP_ACCOUNTS.map(({ value, label }) => {
        const info = imports[value];
        const days = daysSince(info?.importedAt ?? null, now);
        const stale = days === null || days >= SALES_STALE_DAYS;
        return (
          <span key={value} className="inline-flex items-center gap-1.5">
            {label}:{" "}
            {info ? (
              <>
                aggiornato <LocalDateTime value={new Date(info.importedAt)} />
              </>
            ) : (
              "mai importato"
            )}
            {stale && (
              <span
                data-testid="stale-badge"
                className="rounded-md bg-amber-100 px-1.5 py-0.5 text-xs font-medium text-amber-800 dark:bg-amber-500/15 dark:text-amber-300"
              >
                {days === null ? "da importare" : `${days} giorni fa`}
              </span>
            )}
          </span>
        );
      })}
      <span className="inline-block">Royalty in EUR, stime KDP.</span>
    </p>
  );
}

/** Title families the Bookshelf import does not know: the books page fixes most of them. */
function UnresolvedBanner({ books }: { books: SaleBook[] }) {
  const counts = unresolvedCounts(books);
  const entries = KDP_ACCOUNTS.filter(({ value }) => counts[value] > 0);
  if (entries.length === 0) return null;
  return (
    <div
      role="status"
      data-testid="unresolved-banner"
      className="flex flex-col gap-1 rounded-xl border border-amber-300/60 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200"
    >
      {entries.map(({ value, label }) => (
        <span key={value}>
          <strong>{counts[value]}</strong> {counts[value] === 1 ? "titolo" : "titoli"} senza libro
          in «{label}»: importa il Bookshelf di quell&apos;account da{" "}
          <Link href="/kdp/libri" className="font-medium underline">
            Libri e ASIN
          </Link>
          , oppure assegna un titolo dalla tabella dei libri qui sotto.
        </span>
      ))}
    </div>
  );
}

const WEEKDAYS = ["Lunedì", "Martedì", "Mercoledì", "Giovedì", "Venerdì", "Sabato", "Domenica"];

function Header({ onSync }: { onSync: () => void }) {
  return (
    <>
      <PageHeader
        icon={TrendingUpIcon}
        title="Vendite KDP"
        description="Storico di copie, pagine KENP e royalty dei tuoi libri, per periodo, mercato, formato e titolo."
        actions={
          <Button onClick={onSync}>
            <UploadIcon />
            Aggiorna dati
          </Button>
        }
      />
      <KdpTabs current="sales" />
    </>
  );
}

function Delta({ value, previous }: { value: number | null; previous: string }) {
  if (value === null) {
    return (
      <span className="text-xs text-muted-foreground">Nessun dato nel periodo precedente</span>
    );
  }
  const up = value >= 0;
  const Icon = up ? ArrowUpRightIcon : ArrowDownRightIcon;
  return (
    <span className="flex items-center gap-1 text-xs">
      <span
        className={cn(
          "flex items-center gap-0.5 font-medium",
          up ? "text-emerald-700 dark:text-emerald-300" : "text-red-700 dark:text-red-300",
        )}
      >
        <Icon className="size-3.5" aria-hidden />
        {/* From almost nothing the ratio means little: cap what is shown. */}
        {Math.abs(value) > 999
          ? up
            ? "oltre +999"
            : "oltre −999"
          : `${up ? "+" : "−"}${Math.abs(Math.round(value))}`}
        %
      </span>
      <span className="text-muted-foreground">vs periodo precedente ({previous})</span>
    </span>
  );
}

function Tile({
  label,
  value,
  delta,
  previous,
}: {
  label: string;
  value: string;
  delta: number | null;
  previous: string;
}) {
  return (
    <div className="flex flex-col gap-1 rounded-xl border p-4" data-testid="stat-tile">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="text-3xl font-semibold">{value}</span>
      <Delta value={delta} previous={previous} />
    </div>
  );
}

function Panel({
  title,
  description,
  actions,
  table,
  children,
}: {
  title: string;
  description: string;
  actions?: React.ReactNode;
  table: { headers: string[]; rows: string[][] };
  children: React.ReactNode;
}) {
  return (
    <section className="flex min-w-0 flex-col gap-3 rounded-xl border p-4" aria-label={title}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex flex-col gap-0.5">
          <h2 className="font-semibold">{title}</h2>
          <p className="text-xs text-muted-foreground">{description}</p>
        </div>
        {actions}
      </div>
      {children}
      <details className="text-sm">
        <summary className="cursor-pointer text-muted-foreground">Mostra tabella</summary>
        <div className="mt-2 max-h-80 overflow-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b text-muted-foreground">
                {table.headers.map((h, i) => (
                  <th key={h} className={cn("py-1 pr-3 font-medium", i > 0 && "text-right")}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {table.rows.map((row, r) => (
                <tr key={r} className="border-b last:border-0">
                  {row.map((cell, i) => (
                    <td key={i} className={cn("py-1 pr-3", i > 0 && "text-right tabular-nums")}>
                      {cell}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </section>
  );
}

function Filters({
  state,
  update,
  markets,
  books,
  range,
  granularity,
}: {
  state: SalesState;
  update: (patch: Partial<SalesState>) => void;
  markets: string[];
  books: SaleBook[];
  range: { from: string; to: string };
  granularity: Granularity;
}) {
  const toggle = <T extends string>(list: T[], value: T) =>
    list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
  const sortedBooks = [...books].sort((a, b) => a.title.localeCompare(b.title, "it"));

  return (
    <section aria-label="Filtri" className="flex flex-col gap-3 rounded-xl border bg-muted/30 p-3">
      <div className="flex flex-wrap items-end gap-3">
        <Field label="Periodo">
          <Select
            value={state.period}
            onValueChange={(v) => update({ period: v as Period, ...(v === "custom" ? range : {}) })}
          >
            <SelectTrigger className="w-44" aria-label="Periodo">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PERIODS.map((p) => (
                <SelectItem key={p.value} value={p.value}>
                  {p.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        {state.period === "custom" && (
          <>
            <Field label="Dal">
              <Input
                type="date"
                value={state.from}
                onChange={(e) => e.target.value && update({ from: e.target.value })}
                className="w-40"
                aria-label="Dal"
              />
            </Field>
            <Field label="Al">
              <Input
                type="date"
                value={state.to}
                onChange={(e) => e.target.value && update({ to: e.target.value })}
                className="w-40"
                aria-label="Al"
              />
            </Field>
          </>
        )}
        <Field label="Account">
          <Select
            value={state.account}
            onValueChange={(v) => update({ account: v as KdpAccount | "all" })}
          >
            <SelectTrigger className="w-48" aria-label="Account">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tutti gli account</SelectItem>
              {KDP_ACCOUNTS.map(({ value, label }) => (
                <SelectItem key={value} value={value}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field label="Libro">
          <Select
            value={state.book ?? "all"}
            onValueChange={(v) => update({ book: v === "all" ? null : v })}
          >
            <SelectTrigger className="w-64" aria-label="Libro">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tutti i libri</SelectItem>
              {sortedBooks.map((b) => (
                <SelectItem key={b.key} value={b.key}>
                  {b.title}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field label="Raggruppa per">
          <Select
            value={state.granularity}
            onValueChange={(v) => update({ granularity: v as Granularity | "auto" })}
          >
            <SelectTrigger className="w-40" aria-label="Raggruppa per">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="auto">
                Automatico (
                {GRANULARITIES.find((g) => g.value === granularity)!.label.toLowerCase()})
              </SelectItem>
              {GRANULARITIES.map((g) => (
                <SelectItem key={g.value} value={g.value}>
                  {g.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <ChipGroup label="Formati">
          {SALE_SOURCES.map((s) => (
            <Chip
              key={s}
              pressed={state.sources.includes(s)}
              color={SOURCE_COLORS[s]}
              onClick={() => {
                const next = toggle(state.sources, s);
                if (next.length) update({ sources: next });
              }}
            >
              {SOURCE_LABELS[s]}
            </Chip>
          ))}
        </ChipGroup>
        <ChipGroup label="Mercati">
          {markets.map((m) => (
            <Chip
              key={m}
              pressed={state.markets.length === 0 || state.markets.includes(m)}
              onClick={() => {
                const current = state.markets.length === 0 ? markets : state.markets;
                const next = toggle(current, m);
                update({
                  markets: next.length === markets.length || next.length === 0 ? [] : next,
                });
              }}
            >
              {marketplaceLabel(m)}
            </Chip>
          ))}
        </ChipGroup>
      </div>
    </section>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      {children}
    </div>
  );
}

function ChipGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div role="group" aria-label={label} className="flex flex-wrap items-center gap-1.5">
      <span className="mr-1 text-xs font-medium text-muted-foreground">{label}</span>
      {children}
    </div>
  );
}

function Chip({
  pressed,
  color,
  onClick,
  children,
}: {
  pressed: boolean;
  color?: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      onClick={onClick}
      className={cn(
        "flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs transition-colors focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none",
        pressed
          ? "border-foreground/20 bg-background font-medium"
          : "text-muted-foreground line-through opacity-70",
      )}
    >
      {color && (
        <span aria-hidden className="size-2 rounded-[2px]" style={{ backgroundColor: color }} />
      )}
      {children}
    </button>
  );
}

function SyncDialog({
  open,
  onOpenChange,
  origin,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  origin: string;
}) {
  async function copyScript() {
    try {
      await navigator.clipboard.writeText(salesCollectorSource(origin));
      toast.success("Script copiato");
    } catch {
      toast.error("Copia non riuscita.");
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Aggiorna le vendite</DialogTitle>
          <DialogDescription>
            Lo storico si legge dai Report di KDP nel tuo browser, dove sei già collegato:
            l&apos;app non conosce la tua password. Ogni aggiornamento sostituisce i dati
            dell&apos;account con quelli più recenti.
          </DialogDescription>
        </DialogHeader>
        <ol className="flex list-decimal flex-col gap-3 pl-5 text-sm">
          <li>
            <BookmarkletStep
              origin={origin}
              specific={{
                href: salesBookmarkletHref(origin),
                name: "Vendite KDP",
                page: "i Report",
              }}
            />
          </li>
          <li>
            Apri i{" "}
            <a
              href="https://kdpreports.amazon.com/dashboard"
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary hover:underline"
            >
              Report di KDP
            </a>{" "}
            con l&apos;account da aggiornare e clicca il preferito: in basso a destra vedi
            l&apos;avanzamento (circa un minuto), poi torna qui.
          </li>
          <li>Scegli l&apos;account e conferma l&apos;importazione.</li>
        </ol>
        <p className="text-xs text-muted-foreground">
          In alternativa{" "}
          <button type="button" onClick={copyScript} className="text-primary hover:underline">
            copia lo script
          </button>{" "}
          e incollalo nella console del browser su kdpreports.amazon.com.
        </p>
      </DialogContent>
    </Dialog>
  );
}
