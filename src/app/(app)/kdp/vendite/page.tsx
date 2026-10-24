import type { Metadata } from "next";
import { headers } from "next/headers";

import { SalesView, type SalesState } from "@/components/sales/sales-view";
import { KDP_ACCOUNT_VALUES, type KdpAccount, todayIn } from "@/lib/kdp";
import { addDays, GRANULARITIES, SALE_SOURCES, type SaleSource } from "@/lib/kdp-sales";
import { getRoyaltyBetween } from "@/server/queries/kdp-finance";
import { getKdpGoals } from "@/server/queries/kdp-goals";
import { getSalesData } from "@/server/queries/kdp-sales";
import { issuerFromHeaders } from "@/server/oauth";
import { requireSession } from "@/server/session";

export const metadata: Metadata = { title: "Vendite KDP · RDL Productivity" };

/** The app is single-user: "today" is the owner's. */
const TIME_ZONE = process.env.DEFAULT_TIME_ZONE ?? "Europe/Rome";

const PERIODS = ["30d", "90d", "12m", "ytd", "all", "custom"] as const;
const METRICS = ["royalty", "units", "kenp"] as const;
const isDay = (value: unknown): value is string =>
  typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
const pick = <T extends string>(value: unknown, allowed: readonly T[], fallback: T): T =>
  allowed.includes(value as T) ? (value as T) : fallback;
const list = (value: unknown) => (typeof value === "string" && value ? value.split(",") : []);

export default async function SalesPage({ searchParams }: PageProps<"/kdp/vendite">) {
  await requireSession();
  const today = todayIn(TIME_ZONE);
  const [params, data, requestHeaders, goals, monthToDate] = await Promise.all([
    searchParams,
    getSalesData(),
    headers(),
    getKdpGoals(),
    getRoyaltyBetween(`${today.slice(0, 7)}-01`, today),
  ]);

  const sources = list(params.sources).filter((s): s is SaleSource =>
    (SALE_SOURCES as readonly string[]).includes(s),
  );
  const initial: SalesState = {
    period: pick(params.period, PERIODS, "90d"),
    from: isDay(params.from) ? params.from : addDays(today, -89),
    to: isDay(params.to) ? params.to : today,
    account: pick<KdpAccount | "all">(params.account, [...KDP_ACCOUNT_VALUES, "all"], "all"),
    markets: list(params.markets).filter((m) => /^Amazon\./.test(m)),
    sources: sources.length ? sources : [...SALE_SOURCES],
    book: typeof params.book === "string" && params.book ? params.book : null,
    granularity: pick(params.gran, ["auto", ...GRANULARITIES.map((g) => g.value)], "auto"),
    metric: pick(params.metric, METRICS, "royalty"),
  };

  return (
    <SalesView
      records={data.records}
      books={data.books}
      catalog={data.catalog}
      imports={data.imports}
      goals={goals}
      ads={data.ads}
      prices={data.prices}
      monthToDate={{ main: monthToDate.main.royalty, secondary: monthToDate.secondary.royalty }}
      today={today}
      initial={initial}
      origin={issuerFromHeaders(requestHeaders)}
    />
  );
}
