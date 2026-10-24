import type { Metadata } from "next";

import { TodayView } from "@/components/aggregate/today-view";
import { staleSources } from "@/lib/kdp-freshness";
import { getAgendaCards } from "@/server/queries/aggregate";
import { getKdpFreshness } from "@/server/queries/kdp-freshness";
import { requireSession } from "@/server/session";

export const metadata: Metadata = { title: "Oggi · RDL Productivity" };

export default async function TodayPage() {
  await requireSession();
  const [cards, freshness] = await Promise.all([getAgendaCards(), getKdpFreshness()]);
  return <TodayView cards={cards} kdpReminders={staleSources(freshness, new Date())} />;
}
