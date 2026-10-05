import type { Metadata } from "next";

import { TodayView } from "@/components/aggregate/today-view";
import { getAgendaCards } from "@/server/queries/aggregate";
import { requireSession } from "@/server/session";

export const metadata: Metadata = { title: "Oggi · RDL Productivity" };

export default async function TodayPage() {
  await requireSession();
  return <TodayView cards={await getAgendaCards()} />;
}
