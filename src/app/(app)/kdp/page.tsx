import type { Metadata } from "next";

import { KdpCalendarView } from "@/components/kdp/kdp-calendar-view";
import { monthWeeks, parseMonth, todayIn } from "@/lib/kdp";
import { getKdpTasks } from "@/server/queries/kdp";
import { requireSession } from "@/server/session";

export const metadata: Metadata = { title: "Calendario KDP · RDL Productivity" };

/** The app is single-user: "this week" is the owner's. */
const TIME_ZONE = process.env.DEFAULT_TIME_ZONE ?? "Europe/Rome";

export default async function KdpPage({ searchParams }: PageProps<"/kdp">) {
  await requireSession();
  const params = await searchParams;
  const today = todayIn(TIME_ZONE);
  const month =
    parseMonth(typeof params.month === "string" ? params.month : null) ?? today.slice(0, 7);
  const weeks = monthWeeks(month);
  const tasks = await getKdpTasks(weeks[0], weeks[weeks.length - 1]);

  return <KdpCalendarView key={month} month={month} weeks={weeks} tasks={tasks} today={today} />;
}
