import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { SeriesDetailView } from "@/components/series/series-detail-view";
import { db } from "@/server/db";
import {
  getPenNameOptions,
  getSeriesCatalog,
  getShelfOptions,
  getTaskOptions,
} from "@/server/queries/kdp-series";
import { requireSession } from "@/server/session";

export async function generateMetadata({
  params,
}: PageProps<"/collane/[seriesId]">): Promise<Metadata> {
  await requireSession();
  const { seriesId } = await params;
  const series = await db.kdpSeries.findUnique({ where: { id: seriesId }, select: { name: true } });
  return {
    title: series ? `${series.name} · Collane · RDL Productivity` : "Collane · RDL Productivity",
  };
}

export default async function SeriesDetailPage({ params }: PageProps<"/collane/[seriesId]">) {
  await requireSession();
  const { seriesId } = await params;
  const [catalog, penNames] = await Promise.all([getSeriesCatalog(), getPenNameOptions()]);
  const series = catalog.series.find((s) => s.id === seriesId);
  if (!series) notFound();
  const [shelf, tasks] = await Promise.all([
    getShelfOptions(series.account),
    getTaskOptions(series.account),
  ]);
  return (
    <SeriesDetailView
      key={series.id}
      series={series}
      penNames={penNames}
      shelf={shelf}
      tasks={tasks}
    />
  );
}
