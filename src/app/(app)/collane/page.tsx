import type { Metadata } from "next";

import { SeriesIndexView } from "@/components/series/series-index-view";
import { getPenNameOptions, getSeriesCatalog } from "@/server/queries/kdp-series";
import { requireSession } from "@/server/session";

export const metadata: Metadata = { title: "Collane · RDL Productivity" };

export default async function SeriesPage() {
  await requireSession();
  const [catalog, penNames] = await Promise.all([getSeriesCatalog(), getPenNameOptions()]);
  return <SeriesIndexView catalog={catalog} penNames={penNames} />;
}
