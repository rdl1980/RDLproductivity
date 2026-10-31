"use client";

import { ArrowLeftIcon, PenLineIcon } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";

import { KdpTabs } from "@/components/kdp/kdp-tabs";
import { PageHeader } from "@/components/page-header";
import { BarList } from "@/components/stats/bar-list";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { accountLabel, KDP_ACCOUNTS, type KdpAccount } from "@/lib/kdp";
import type { AdRecord } from "@/lib/kdp-ads";
import { EXTENSION_VERSION } from "@/lib/kdp-extension";
import { type PenBook, penBookRows, penNameOf, penNameTable } from "@/lib/kdp-pen-names";
import {
  autoGranularity,
  bucketLabel,
  change,
  filterRecords,
  formatCompact,
  formatEuro,
  formatEuroCompact,
  formatInt,
  type Granularity,
  GRANULARITIES,
  groupSums,
  marketplaceLabel,
  NO_PEN_NAME,
  penNameSeries,
  previousMonthToDate,
  previousPeriod,
  SALE_SOURCES,
  type SaleRecord,
  type SaleSource,
  SOURCE_COLORS,
  SOURCE_LABELS,
  type Sums,
  timeSeries,
} from "@/lib/kdp-sales";
import { cn } from "@/lib/utils";

import { Legend, SegmentBar, type Series, Sparkline, StackedColumns } from "./charts";
import {
  Chip,
  ChipGroup,
  Field,
  type Metric,
  METRICS,
  Panel,
  type Period,
  periodRange,
  PERIODS,
  Tile,
} from "./sales-view";

export type PenState = {
  period: Period;
  from: string;
  to: string;
  account: KdpAccount | "all";
  markets: string[];
  sources: SaleSource[];
  granularity: Granularity | "auto";
  metric: Metric;
  /** The pen name shown in detail, or null for the comparison. */
  pen: string | null;
};

type Props = {
  records: SaleRecord[];
  books: PenBook[];
  ads: AdRecord[];
  today: string;
  initial: PenState;
};

const PEN_COLORS = [
  "var(--series-1)",
  "var(--series-2)",
  "var(--series-3)",
  "var(--series-4)",
  "var(--chart-2)",
  "var(--chart-4)",
];

const dayLabel = (day: string | null) =>
  day
    ? new Intl.DateTimeFormat("it-IT", {
        day: "numeric",
        month: "short",
        year: "2-digit",
        timeZone: "UTC",
      }).format(new Date(`${day}T00:00:00Z`))
    : "–";
const percent = (part: number, total: number) =>
  total > 0 ? `${Math.round((part / total) * 100)}%` : "–";
const deltaText = (value: number | null) =>
  value === null ? "nuovo" : `${value >= 0 ? "+" : "−"}${Math.abs(Math.round(value))}%`;

function writeUrl(state: PenState) {
  const params = new URLSearchParams();
  if (state.period !== "90d") params.set("period", state.period);
  if (state.period === "custom") {
    params.set("from", state.from);
    params.set("to", state.to);
  }
  if (state.account !== "all") params.set("account", state.account);
  if (state.markets.length) params.set("markets", state.markets.join(","));
  if (state.sources.length !== SALE_SOURCES.length) params.set("sources", state.sources.join(","));
  if (state.granularity !== "auto") params.set("gran", state.granularity);
  if (state.metric !== "royalty") params.set("metric", state.metric);
  if (state.pen) params.set("pen", state.pen);
  const query = params.toString();
  window.history.replaceState(null, "", query ? `?${query}` : window.location.pathname);
}

type Sort<K extends string> = { column: K; desc: boolean };

function SortHeader<K extends string>({
  sort,
  onSort,
  column,
  label,
  right,
  text,
}: {
  sort: Sort<K>;
  onSort: (sort: Sort<K>) => void;
  column: K;
  label: string;
  right?: boolean;
  /** Text columns start ascending. */
  text?: boolean;
}) {
  const active = sort.column === column;
  return (
    <th
      className={cn("py-2 pr-3 font-medium", right && "text-right")}
      aria-sort={active ? (sort.desc ? "descending" : "ascending") : "none"}
    >
      <button
        type="button"
        onClick={() => onSort({ column, desc: active ? !sort.desc : !text })}
        className={cn(
          "inline-flex items-center gap-0.5 hover:text-foreground",
          active && "text-foreground",
        )}
      >
        {label}
        <span aria-hidden className="w-2.5">
          {active ? (sort.desc ? "↓" : "↑") : ""}
        </span>
      </button>
    </th>
  );
}

function sorted<T, K extends string>(
  rows: T[],
  sort: Sort<K>,
  value: (row: T, column: K) => number | string,
): T[] {
  return [...rows].sort((a, b) => {
    const [x, y] = [value(a, sort.column), value(b, sort.column)];
    const order =
      typeof x === "number" && typeof y === "number"
        ? x - y
        : String(x).localeCompare(String(y), "it", { sensitivity: "base" });
    return sort.desc ? -order : order;
  });
}

export function PenNameView({ records, books, ads, today, initial }: Props) {
  const [state, setState] = useState(initial);
  // The URL is written outside the state updater: the router must not update during render.
  const update = (patch: Partial<PenState>) => {
    const next = { ...state, ...patch };
    setState(next);
    writeUrl(next);
  };

  const first = records.length ? records[0].d : today;
  const range = periodRange(state, today, first);
  const prevRange =
    state.period === "mtd" ? previousMonthToDate(today) : previousPeriod(range.from, range.to);
  const granularity =
    state.granularity === "auto" ? autoGranularity(range.from, range.to) : state.granularity;
  const sources = useMemo(() => new Set(state.sources), [state.sources]);
  const marketsAll = useMemo(() => [...new Set(records.map((r) => r.m))].sort(), [records]);
  const bookByKey = useMemo(() => new Map(books.map((b) => [b.key, b])), [books]);
  const scopedBooks = books.filter((b) => state.account === "all" || b.account === state.account);

  const filter = { account: state.account, markets: new Set(state.markets), book: null };
  const current = filterRecords(records, { ...filter, ...range });
  const previous = filterRecords(records, { ...filter, ...prevRange });
  const inAds = (from: string, to: string) =>
    ads.filter(
      (r) => r.d >= from && r.d <= to && (state.account === "all" || r.a === state.account),
    );
  const adsCurrent = inAds(range.from, range.to);
  const hasAds = ads.length > 0;
  const table = penNameTable(current, previous, adsCurrent, scopedBooks, sources);
  const names = table.map((r) => r.name);
  const known = names.filter((n) => n !== NO_PEN_NAME);

  const metricOf = (sums: Sums) =>
    state.metric === "royalty" ? sums.royalty : state.metric === "units" ? sums.units : sums.kenp;
  const metricFormat = state.metric === "royalty" ? formatEuro : formatInt;
  const metricAxis = state.metric === "royalty" ? formatEuroCompact : formatCompact;
  const metricLabel = METRICS.find((m) => m.value === state.metric)!.label;
  const granLabel = GRANULARITIES.find((g) => g.value === granularity)!.label.toLowerCase();
  const detail = (start: string) =>
    granularity === "day"
      ? bucketLabel(start, "day")
      : granularity === "week"
        ? `Settimana dal ${bucketLabel(start, "day")}`
        : bucketLabel(start, "month");
  const previousLabel = `${bucketLabel(prevRange.from, "day")} – ${bucketLabel(prevRange.to, "day")}`;

  const metricToggle = (
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
  );

  const toggle = <T extends string>(list: T[], value: T) =>
    list.includes(value) ? list.filter((v) => v !== value) : [...list, value];

  return (
    <main className="mx-auto flex w-full max-w-7xl flex-col gap-5 p-4 sm:p-6">
      <PageHeader
        icon={PenLineIcon}
        title="Pen name"
        description="Quanto rende ogni pen name e come vanno i suoi libri, dai report KDP importati."
      />
      <KdpTabs current="pens" />

      <section
        aria-label="Filtri"
        className="flex flex-col gap-3 rounded-xl border bg-muted/30 p-3"
      >
        <div className="flex flex-wrap items-end gap-3">
          <Field label="Periodo">
            <Select
              value={state.period}
              onValueChange={(v) =>
                update({ period: v as Period, ...(v === "custom" ? range : {}) })
              }
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
          <Field label="Pen name">
            <Select
              value={state.pen ?? "all"}
              onValueChange={(v) => update({ pen: v === "all" ? null : v })}
            >
              <SelectTrigger className="w-56" aria-label="Pen name">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tutti (confronto)</SelectItem>
                {[...names]
                  .sort((a, b) =>
                    a === NO_PEN_NAME ? 1 : b === NO_PEN_NAME ? -1 : a.localeCompare(b, "it"),
                  )
                  .map((n) => (
                    <SelectItem key={n} value={n}>
                      {n}
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
                <SelectItem value="auto">Automatico ({granLabel})</SelectItem>
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
            {marketsAll.map((m) => (
              <Chip
                key={m}
                pressed={state.markets.length === 0 || state.markets.includes(m)}
                onClick={() => {
                  const now = state.markets.length === 0 ? marketsAll : state.markets;
                  const next = toggle(now, m);
                  update({
                    markets: next.length === marketsAll.length || next.length === 0 ? [] : next,
                  });
                }}
              >
                {marketplaceLabel(m)}
              </Chip>
            ))}
          </ChipGroup>
        </div>
      </section>

      {known.length === 0 && (
        <p
          role="status"
          className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-200"
          data-testid="pen-missing"
        >
          Nessun libro ha ancora il pen name: si legge dalla riga «di …» della Bookshelf. Aggiorna i
          libri di ogni account con l&apos;estensione {EXTENSION_VERSION} o il preferito (
          <Link href="/kdp/estensione" className="font-medium underline">
            scarica l&apos;estensione
          </Link>
          ).
        </p>
      )}

      {state.pen === null ? (
        <Overview
          table={table}
          current={current}
          previous={previous}
          bookByKey={bookByKey}
          range={range}
          granularity={granularity}
          sources={sources}
          hasAds={hasAds}
          metricOf={metricOf}
          metricFormat={metricFormat}
          metricAxis={metricAxis}
          metricLabel={metricLabel}
          granLabel={granLabel}
          detail={detail}
          previousLabel={previousLabel}
          metricToggle={metricToggle}
          onSelect={(pen) => update({ pen })}
        />
      ) : (
        <Detail
          pen={state.pen}
          state={state}
          records={records}
          current={current}
          previous={previous}
          ads={adsCurrent}
          books={scopedBooks}
          bookByKey={bookByKey}
          range={range}
          granularity={granularity}
          sources={sources}
          hasAds={hasAds}
          metricFormat={metricFormat}
          metricAxis={metricAxis}
          metricLabel={metricLabel}
          granLabel={granLabel}
          detail={detail}
          previousLabel={previousLabel}
          metricToggle={metricToggle}
          onBack={() => update({ pen: null })}
        />
      )}
    </main>
  );
}

type Shared = {
  current: SaleRecord[];
  previous: SaleRecord[];
  bookByKey: Map<string, PenBook>;
  range: { from: string; to: string };
  granularity: Granularity;
  sources: ReadonlySet<SaleSource>;
  hasAds: boolean;
  metricFormat: (v: number) => string;
  metricAxis: (v: number) => string;
  metricLabel: string;
  granLabel: string;
  detail: (start: string) => string;
  previousLabel: string;
  metricToggle: React.ReactNode;
};

type PenColumn =
  "name" | "books" | "units" | "kenp" | "royalty" | "delta" | "perBook" | "ads" | "net";

function Overview({
  table,
  current,
  bookByKey,
  range,
  granularity,
  sources,
  hasAds,
  metricOf,
  metricFormat,
  metricAxis,
  metricLabel,
  granLabel,
  detail,
  previousLabel,
  metricToggle,
  onSelect,
}: Shared & {
  table: ReturnType<typeof penNameTable>;
  metricOf: (sums: Sums) => number;
  onSelect: (pen: string) => void;
}) {
  const [sort, setSort] = useState<Sort<PenColumn>>({ column: "royalty", desc: true });
  const total = table.reduce((sum, r) => sum + r.sums.royalty, 0);
  const prevTotal = table.reduce((sum, r) => sum + r.previous.royalty, 0);
  const selling = table.filter((r) => r.sold > 0);
  const top = table.find((r) => r.name !== NO_PEN_NAME && r.sums.royalty > 0);
  const series = penNameSeries(
    current,
    (book) => bookByKey.get(book)?.author,
    range.from,
    range.to,
    granularity,
    sources,
    PEN_COLORS.length,
  );
  const colorOf = (name: string, i: number) =>
    name === NO_PEN_NAME ? "var(--muted-foreground)" : PEN_COLORS[i % PEN_COLORS.length];
  const penSeries: Series[] = series.groups.map((g, i) => ({
    key: g.name,
    label: g.name,
    color: colorOf(g.name, i),
  }));
  const value = (row: (typeof table)[number], column: PenColumn): number | string => {
    switch (column) {
      case "name":
        return row.name;
      case "books":
        return row.sold;
      case "units":
        return row.sums.units;
      case "kenp":
        return row.sums.kenp;
      case "royalty":
        return row.sums.royalty;
      case "delta":
        return change(row.sums.royalty, row.previous.royalty) ?? Number.POSITIVE_INFINITY;
      case "perBook":
        return row.sold ? row.sums.royalty / row.sold : 0;
      case "ads":
        return row.adSpend;
      case "net":
        return row.sums.royalty - row.adSpend;
    }
  };
  const header = (column: PenColumn, label: string, right = true) => (
    <SortHeader
      sort={sort}
      onSort={setSort}
      column={column}
      label={label}
      right={right}
      text={column === "name"}
    />
  );

  return (
    <>
      <section aria-label="Indicatori" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Tile
          label="Royalty di tutti i pen name"
          value={formatEuro(total)}
          delta={change(total, prevTotal)}
          previous={previousLabel}
        />
        <Tile
          label="Pen name con vendite"
          value={`${selling.length} su ${table.length}`}
          delta={null}
          previous="nel periodo"
          hint="almeno un libro venduto o letto"
        />
        <Tile
          label="Pen name principale"
          value={top?.name ?? "–"}
          delta={null}
          previous={top ? `${percent(top.sums.royalty, total)} delle royalty` : "nessuna vendita"}
          hint={top ? formatEuro(top.sums.royalty) : ""}
        />
        <Tile
          label="Libri venduti"
          value={`${table.reduce((s, r) => s + r.sold, 0)} su ${table.reduce((s, r) => s + r.books, 0)}`}
          delta={null}
          previous="nel periodo"
          hint="libri con almeno una vendita o lettura"
        />
      </section>

      <Panel
        title="Confronto pen name"
        description="Clic sul nome per il dettaglio con tutti i suoi libri"
        table={{
          headers: ["Pen name", "Libri venduti", "Copie", "KENP", "Royalty", "Quota", "Variazione"],
          rows: table.map((r) => [
            r.name,
            `${r.sold}/${r.books}`,
            formatInt(r.sums.units),
            formatInt(r.sums.kenp),
            formatEuro(r.sums.royalty),
            percent(r.sums.royalty, total),
            deltaText(change(r.sums.royalty, r.previous.royalty)),
          ]),
        }}
      >
        <div className="overflow-x-auto">
          <table className="w-full min-w-[48rem] text-left text-sm" data-testid="pen-table">
            <thead>
              <tr className="border-b text-xs text-muted-foreground">
                {header("name", "Pen name", false)}
                {header("books", "Libri venduti")}
                {header("units", "Copie")}
                {header("kenp", "KENP")}
                {header("royalty", "Royalty")}
                <th className="py-2 pr-3 text-right font-medium">Quota</th>
                {header("delta", "Variazione")}
                {header("perBook", "Per libro venduto")}
                {hasAds && header("ads", "Ads")}
                {hasAds && header("net", "Netto")}
              </tr>
            </thead>
            <tbody>
              {sorted(table, sort, value).map((r) => {
                const d = change(r.sums.royalty, r.previous.royalty);
                return (
                  <tr key={r.name} className="border-b last:border-0" data-testid="pen-row">
                    <td className="py-2 pr-3">
                      <button
                        type="button"
                        onClick={() => onSelect(r.name)}
                        className={cn(
                          "text-left font-medium hover:underline",
                          r.name === NO_PEN_NAME && "text-muted-foreground italic",
                        )}
                      >
                        {r.name}
                      </button>
                    </td>
                    <td className="py-2 pr-3 text-right tabular-nums">
                      {r.sold}/{r.books}
                    </td>
                    <td className="py-2 pr-3 text-right tabular-nums">{formatInt(r.sums.units)}</td>
                    <td className="py-2 pr-3 text-right tabular-nums">{formatInt(r.sums.kenp)}</td>
                    <td className="py-2 pr-3 text-right font-medium tabular-nums">
                      {formatEuro(r.sums.royalty)}
                    </td>
                    <td className="py-2 pr-3 text-right tabular-nums">
                      {percent(r.sums.royalty, total)}
                    </td>
                    <td
                      className={cn(
                        "py-2 pr-3 text-right tabular-nums",
                        d !== null && d > 0 && "text-emerald-700 dark:text-emerald-300",
                        d !== null && d < 0 && "text-red-700 dark:text-red-300",
                      )}
                    >
                      {deltaText(d)}
                    </td>
                    <td className="py-2 pr-3 text-right tabular-nums">
                      {r.sold ? formatEuro(r.sums.royalty / r.sold) : "–"}
                    </td>
                    {hasAds && (
                      <td className="py-2 pr-3 text-right tabular-nums">
                        {r.adSpend ? formatEuro(r.adSpend) : "–"}
                      </td>
                    )}
                    {hasAds && (
                      <td className="py-2 pr-3 text-right tabular-nums">
                        {formatEuro(r.sums.royalty - r.adSpend)}
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Panel>

      <Panel
        title="Andamento per pen name"
        description={`${metricLabel} per ${granLabel}, impilate per pen name`}
        actions={metricToggle}
        table={{
          headers: ["Periodo", ...penSeries.map((s) => s.label), "Totale"],
          rows: series.buckets.map((b) => [
            detail(b.start),
            ...b.sums.map((s) => metricFormat(metricOf(s))),
            metricFormat(b.sums.reduce((sum, s) => sum + metricOf(s), 0)),
          ]),
        }}
      >
        <Legend series={penSeries} />
        <StackedColumns
          data={series.buckets.map((b) => ({
            label: bucketLabel(b.start, granularity),
            detail: detail(b.start),
            values: b.sums.map(metricOf),
          }))}
          series={penSeries}
          format={metricFormat}
          formatAxis={metricAxis}
          label="Andamento per pen name"
        />
      </Panel>

      <Panel
        title="Quota delle royalty"
        description="Come si dividono le royalty del periodo fra i pen name"
        table={{
          headers: ["Pen name", "Royalty", "Quota"],
          rows: series.groups.map((g) => [
            g.name,
            formatEuro(g.sums.royalty),
            percent(g.sums.royalty, total),
          ]),
        }}
      >
        <SegmentBar
          parts={series.groups.map((g, i) => ({
            key: g.name,
            label: g.name,
            color: colorOf(g.name, i),
            value: g.sums.royalty,
          }))}
          format={formatEuro}
          label="Quota delle royalty per pen name"
        />
      </Panel>
    </>
  );
}

type BookColumn =
  | "title"
  | "ebook"
  | "paperback"
  | "hardcover"
  | "kenp"
  | "royalty"
  | "delta"
  | "ads"
  | "net"
  | "first"
  | "last";

function Detail({
  pen,
  state,
  records,
  current,
  previous,
  ads,
  books,
  bookByKey,
  range,
  granularity,
  sources,
  hasAds,
  metricFormat,
  metricAxis,
  metricLabel,
  granLabel,
  detail,
  previousLabel,
  metricToggle,
  onBack,
}: Shared & {
  pen: string;
  state: PenState;
  records: SaleRecord[];
  ads: AdRecord[];
  books: PenBook[];
  onBack: () => void;
}) {
  const [sort, setSort] = useState<Sort<BookColumn>>({ column: "royalty", desc: true });
  const mine = (r: SaleRecord) => penNameOf(bookByKey.get(r.book)) === pen;
  const own = current.filter(mine);
  const ownPrevious = previous.filter(mine);
  const rows = penBookRows(pen, records, current, previous, ads, books, sources);
  const totals = groupSums(own, () => "all", sources).get("all");
  const prevTotals = groupSums(ownPrevious, () => "all", sources).get("all");
  const royalty = totals?.royalty ?? 0;
  const sold = rows.filter((r) => r.sums.units > 0 || r.sums.kenp > 0 || r.sums.royalty !== 0);
  const adSpend = rows.reduce((sum, r) => sum + r.adSpend, 0);

  const buckets = timeSeries(own, range.from, range.to, granularity, sources);
  const formatSeries: Series[] = SALE_SOURCES.filter(
    (s) => sources.has(s) && (state.metric !== "units" || s !== "kenp"),
  ).map((s) => ({ key: s, label: SOURCE_LABELS[s], color: SOURCE_COLORS[s] }));
  const trendSeries: Series[] =
    state.metric === "kenp"
      ? [{ key: "kenp", label: SOURCE_LABELS.kenp, color: SOURCE_COLORS.kenp }]
      : formatSeries;
  const valueOf = (sums: Sums, key: string) =>
    state.metric === "royalty"
      ? sums.bySource[key as SaleSource].royalty
      : state.metric === "units"
        ? sums.bySource[key as SaleSource].units
        : sums.kenp;

  const spark = buckets.slice(-12);
  const trendOf = (book: string) =>
    timeSeries(
      own.filter((r) => r.book === book),
      spark[0]?.start ?? range.from,
      range.to,
      granularity,
      sources,
    ).map((b) => b.sums.royalty);

  const byMarket = [...groupSums(own, (r) => r.m, sources)].sort(
    (a, b) => b[1].royalty - a[1].royalty,
  );
  const bySeries = [
    ...groupSums(own, (r) => bookByKey.get(r.book)?.series ?? "Senza collana", sources),
  ].sort((a, b) => b[1].royalty - a[1].royalty);
  const byAccount = [...groupSums(own, (r) => r.a, sources)].sort(
    (a, b) => b[1].royalty - a[1].royalty,
  );

  const value = (row: (typeof rows)[number], column: BookColumn): number | string => {
    switch (column) {
      case "title":
        return row.book.title;
      case "ebook":
      case "paperback":
      case "hardcover":
        return row.sums.bySource[column].units;
      case "kenp":
        return row.sums.kenp;
      case "royalty":
        return row.sums.royalty;
      case "delta":
        return change(row.sums.royalty, row.previous.royalty) ?? Number.POSITIVE_INFINITY;
      case "ads":
        return row.adSpend;
      case "net":
        return row.sums.royalty - row.adSpend;
      case "first":
        return row.first ?? (sort.desc ? "" : "9999");
      case "last":
        return row.last ?? (sort.desc ? "" : "9999");
    }
  };
  const header = (column: BookColumn, label: string, right = true) => (
    <SortHeader
      sort={sort}
      onSort={setSort}
      column={column}
      label={label}
      right={right}
      text={column === "title" || column === "first" || column === "last"}
    />
  );
  // The sales dashboard on one book, with the same period and account.
  const salesHref = (key: string) => {
    const params = new URLSearchParams({ book: key });
    if (state.period !== "90d") params.set("period", state.period);
    if (state.period === "custom") {
      params.set("from", state.from);
      params.set("to", state.to);
    }
    if (state.account !== "all") params.set("account", state.account);
    return `/kdp/vendite?${params}`;
  };

  return (
    <>
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeftIcon className="size-4" />
          Tutti i pen name
        </button>
        <h2 className="text-xl font-semibold" data-testid="pen-title">
          {pen}
        </h2>
      </div>

      <section aria-label="Indicatori" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Tile
          label="Royalty"
          value={formatEuro(royalty)}
          delta={change(royalty, prevTotals?.royalty ?? 0)}
          previous={previousLabel}
        />
        <Tile
          label="Copie vendute"
          value={formatInt(totals?.units ?? 0)}
          delta={change(totals?.units ?? 0, prevTotals?.units ?? 0)}
          previous={previousLabel}
        />
        <Tile
          label="Pagine KENP"
          value={formatInt(totals?.kenp ?? 0)}
          delta={change(totals?.kenp ?? 0, prevTotals?.kenp ?? 0)}
          previous={previousLabel}
        />
        <Tile
          label="Libri venduti"
          value={`${sold.length} su ${rows.length}`}
          delta={null}
          previous="nel periodo"
          hint={`${rows.length - sold.length} senza vendite né letture`}
        />
        <Tile
          label="Royalty per libro venduto"
          value={sold.length ? formatEuro(royalty / sold.length) : "–"}
          delta={null}
          previous="media nel periodo"
          hint="royalty divise per i libri con vendite"
        />
        {hasAds ? (
          <Tile
            label="Netto dopo Ads"
            value={formatEuro(royalty - adSpend)}
            delta={null}
            previous={`spesa ${formatEuro(adSpend)}`}
            hint="royalty meno spesa pubblicitaria"
          />
        ) : (
          <Tile
            label="Libro migliore"
            value={rows[0]?.sums.royalty ? rows[0].book.title : "–"}
            delta={null}
            previous={rows[0]?.sums.royalty ? formatEuro(rows[0].sums.royalty) : "nessuna vendita"}
            hint={rows[0]?.sums.royalty ? percent(rows[0].sums.royalty, royalty) : ""}
          />
        )}
      </section>

      <Panel
        title={`Libri di ${pen}`}
        description="Tutti i libri del pen name, anche quelli senza vendite nel periodo. Clic sul titolo per il dettaglio in Vendite."
        table={{
          headers: [
            "Libro",
            "eBook",
            "Cartaceo",
            "Rigida",
            "KENP",
            "Royalty",
            "Quota",
            "Variazione",
          ],
          rows: rows.map((r) => [
            r.book.title,
            formatInt(r.sums.bySource.ebook.units),
            formatInt(r.sums.bySource.paperback.units),
            formatInt(r.sums.bySource.hardcover.units),
            formatInt(r.sums.kenp),
            formatEuro(r.sums.royalty),
            percent(r.sums.royalty, royalty),
            deltaText(change(r.sums.royalty, r.previous.royalty)),
          ]),
        }}
      >
        <div className="overflow-x-auto">
          <table className="w-full min-w-[64rem] text-left text-sm" data-testid="pen-books">
            <thead>
              <tr className="border-b text-xs text-muted-foreground">
                {header("title", "Libro", false)}
                {header("ebook", "eBook")}
                {header("paperback", "Cartaceo")}
                {header("hardcover", "Rigida")}
                {header("kenp", "KENP")}
                {header("royalty", "Royalty")}
                <th className="py-2 pr-3 text-right font-medium">Quota</th>
                {header("delta", "Variazione")}
                {hasAds && header("ads", "Ads")}
                {hasAds && header("net", "Netto")}
                <th className="py-2 pr-3 font-medium">Tendenza</th>
                {header("first", "Prima vendita", false)}
                {header("last", "Ultima vendita", false)}
              </tr>
            </thead>
            <tbody>
              {sorted(rows, sort, value).map((r) => {
                const d = change(r.sums.royalty, r.previous.royalty);
                const idle = r.sums.units === 0 && r.sums.kenp === 0 && r.sums.royalty === 0;
                return (
                  <tr
                    key={r.book.key}
                    className={cn("border-b last:border-0", idle && "text-muted-foreground")}
                    data-testid="pen-book"
                  >
                    <td className="max-w-80 py-2 pr-3">
                      <Link href={salesHref(r.book.key)} className="font-medium hover:underline">
                        {r.book.title}
                      </Link>
                      <span className="block text-xs text-muted-foreground">
                        {accountLabel(r.book.account)}
                        {r.book.series ? ` · ${r.book.series}` : ""}
                        {idle ? " · nessuna vendita nel periodo" : ""}
                      </span>
                    </td>
                    {(["ebook", "paperback", "hardcover"] as const).map((f) => (
                      <td key={f} className="py-2 pr-3 text-right tabular-nums">
                        {formatInt(r.sums.bySource[f].units)}
                      </td>
                    ))}
                    <td className="py-2 pr-3 text-right tabular-nums">{formatInt(r.sums.kenp)}</td>
                    <td className="py-2 pr-3 text-right font-medium tabular-nums">
                      {formatEuro(r.sums.royalty)}
                    </td>
                    <td className="py-2 pr-3 text-right tabular-nums">
                      {percent(r.sums.royalty, royalty)}
                    </td>
                    <td
                      className={cn(
                        "py-2 pr-3 text-right tabular-nums",
                        d !== null && d > 0 && "text-emerald-700 dark:text-emerald-300",
                        d !== null && d < 0 && "text-red-700 dark:text-red-300",
                      )}
                    >
                      {idle && r.previous.royalty === 0 ? "–" : deltaText(d)}
                    </td>
                    {hasAds && (
                      <td className="py-2 pr-3 text-right tabular-nums">
                        {r.adSpend ? formatEuro(r.adSpend) : "–"}
                      </td>
                    )}
                    {hasAds && (
                      <td className="py-2 pr-3 text-right tabular-nums">
                        {formatEuro(r.sums.royalty - r.adSpend)}
                      </td>
                    )}
                    <td className="w-28 py-2 pr-3">
                      {idle ? null : (
                        <Sparkline
                          values={trendOf(r.book.key)}
                          label={`Tendenza di ${r.book.title}`}
                        />
                      )}
                    </td>
                    <td className="py-2 pr-3 whitespace-nowrap">{dayLabel(r.first)}</td>
                    <td className="py-2 pr-3 whitespace-nowrap">{dayLabel(r.last)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Panel>

      <Panel
        title="Andamento"
        description={`${metricLabel} di ${pen} per ${granLabel}, divise per formato`}
        actions={metricToggle}
        table={{
          headers: ["Periodo", ...trendSeries.map((s) => s.label), "Totale"],
          rows: buckets.map((b) => [
            detail(b.start),
            ...trendSeries.map((s) => metricFormat(valueOf(b.sums, s.key))),
            metricFormat(trendSeries.reduce((sum, s) => sum + valueOf(b.sums, s.key), 0)),
          ]),
        }}
      >
        {trendSeries.length > 1 && <Legend series={trendSeries} />}
        <StackedColumns
          data={buckets.map((b) => ({
            label: bucketLabel(b.start, granularity),
            detail: detail(b.start),
            values: trendSeries.map((s) => valueOf(b.sums, s.key)),
          }))}
          series={trendSeries}
          format={metricFormat}
          formatAxis={metricAxis}
          label={`Andamento di ${pen}`}
        />
      </Panel>

      <div className="grid gap-5 lg:grid-cols-2">
        <Panel
          title="Per mercato"
          description={`Royalty di ${pen} per marketplace Amazon`}
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
            label={`Royalty di ${pen} per mercato`}
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
          description={`Royalty dei libri di ${pen} per collana KDP`}
          table={{
            headers: ["Collana", "Royalty", "Copie"],
            rows: bySeries.map(([k, s]) => [k, formatEuro(s.royalty), formatInt(s.units)]),
          }}
        >
          <BarList
            label={`Royalty di ${pen} per collana`}
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

      {byAccount.length > 1 && (
        <Panel
          title="Per account"
          description={`Royalty di ${pen} per account KDP`}
          table={{
            headers: ["Account", "Royalty", "Copie"],
            rows: byAccount.map(([a, s]) => [
              accountLabel(a as KdpAccount),
              formatEuro(s.royalty),
              formatInt(s.units),
            ]),
          }}
        >
          <BarList
            label={`Royalty di ${pen} per account`}
            rows={byAccount.map(([a, s]) => ({
              key: a,
              label: accountLabel(a as KdpAccount),
              value: Math.max(0, s.royalty),
              display: formatEuro(s.royalty),
              detail: `${formatInt(s.units)} copie`,
            }))}
          />
        </Panel>
      )}
    </>
  );
}
