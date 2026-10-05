import type { Metadata } from "next";

import { StatsView } from "@/components/stats/stats-view";
import { getStats } from "@/server/queries/stats";
import { requireSession } from "@/server/session";

export const metadata: Metadata = { title: "Statistiche · RDL Productivity" };

export default async function StatsPage() {
  await requireSession();
  return <StatsView stats={await getStats()} />;
}
