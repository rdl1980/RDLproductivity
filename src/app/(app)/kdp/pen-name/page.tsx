import type { Metadata } from "next";

import { PenNameView, type PenState } from "@/components/sales/pen-name-view";
import { KDP_ACCOUNT_VALUES, type KdpAccount, todayIn } from "@/lib/kdp";
import { addDays, GRANULARITIES, SALE_SOURCES, type SaleSource } from "@/lib/kdp-sales";
import { getSalesData, penBooks } from "@/server/queries/kdp-sales";
import { requireSession } from "@/server/session";

export const metadata: Metadata = { title: "Pen name KDP · RDL Productivity" };

/** The app is single-user: "today" is the owner's. */
const TIME_ZONE = process.env.DEFAULT_TIME_ZONE ?? "Europe/Rome";

const PERIODS = ["mtd", "30d", "90d", "12m", "ytd", "all", "custom"] as const;
const METRICS = ["royalty", "units", "kenp"] as const;
const isDay = (value: unknown): value is string =>
  typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
const pick = <T extends string>(value: unknown, allowed: readonly T[], fallback: T): T =>
  allowed.includes(value as T) ? (value as T) : fallback;
const list = (value: unknown) => (typeof value === "string" && value ? value.split(",") : []);

export default async function PenNamePage({ searchParams }: PageProps<"/kdp/pen-name">) {
  await requireSession();
  const today = todayIn(TIME_ZONE);
  const [params, data] = await Promise.all([searchParams, getSalesData()]);

  const sources = list(params.sources).filter((s): s is SaleSource =>
    (SALE_SOURCES as readonly string[]).includes(s),
  );
  const initial: PenState = {
    period: pick(params.period, PERIODS, "90d"),
    from: isDay(params.from) ? params.from : addDays(today, -89),
    to: isDay(params.to) ? params.to : today,
    account: pick<KdpAccount | "all">(params.account, [...KDP_ACCOUNT_VALUES, "all"], "all"),
    markets: list(params.markets).filter((m) => /^Amazon\./.test(m)),
    sources: sources.length ? sources : [...SALE_SOURCES],
    granularity: pick(params.gran, ["auto", ...GRANULARITIES.map((g) => g.value)], "auto"),
    metric: pick(params.metric, METRICS, "royalty"),
    pen: typeof params.pen === "string" && params.pen ? params.pen : null,
  };

  return (
    <PenNameView
      records={data.records}
      books={penBooks(data)}
      ads={data.ads}
      today={today}
      initial={initial}
    />
  );
}
