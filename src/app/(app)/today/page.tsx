import type { Metadata } from "next";

import { TodayView } from "@/components/aggregate/today-view";
import { mondayOf, todayIn } from "@/lib/kdp";
import { staleSources } from "@/lib/kdp-freshness";
import { getAgendaCards } from "@/server/queries/aggregate";
import { getKdpTasks } from "@/server/queries/kdp";
import { getKdpFreshness } from "@/server/queries/kdp-freshness";
import { requireSession } from "@/server/session";

export const metadata: Metadata = { title: "Oggi · RDL Productivity" };

/** The app is single-user: "this week" is the owner's. */
const TIME_ZONE = process.env.DEFAULT_TIME_ZONE ?? "Europe/Rome";

export default async function TodayPage() {
  await requireSession();
  const week = mondayOf(todayIn(TIME_ZONE))!;
  const [cards, freshness, kdpTasks] = await Promise.all([
    getAgendaCards(),
    getKdpFreshness(),
    getKdpTasks(week, week),
  ]);
  return (
    <TodayView
      cards={cards}
      kdpReminders={staleSources(freshness, new Date())}
      kdpWeek={{ week, tasks: kdpTasks }}
    />
  );
}
