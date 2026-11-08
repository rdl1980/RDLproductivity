import type { Metadata } from "next";

import { KdpCalendarView } from "@/components/kdp/kdp-calendar-view";
import { parseMonth, todayIn, WEEKS_SHOWN, weeksFrom, weekStartOf } from "@/lib/kdp";
import { getKdpSlotSettings, getKdpTasks } from "@/server/queries/kdp";
import { requireSession } from "@/server/session";

export const metadata: Metadata = { title: "Calendario KDP · RDL Productivity" };

/** The app is single-user: "this week" is the owner's. */
const TIME_ZONE = process.env.DEFAULT_TIME_ZONE ?? "Europe/Rome";

export default async function KdpPage({ searchParams }: PageProps<"/kdp">) {
  await requireSession();
  const params = await searchParams;
  const today = todayIn(TIME_ZONE);
  // `?week=` is any day of the first week shown; `?month=` (older links) its first week.
  const month = parseMonth(typeof params.month === "string" ? params.month : null);
  const start =
    (typeof params.week === "string" && weekStartOf(params.week)) ||
    (month && weekStartOf(`${month}-01`)) ||
    weekStartOf(today)!;
  const weeks = weeksFrom(start, WEEKS_SHOWN);
  const [tasks, slots] = await Promise.all([
    getKdpTasks(weeks[0], weeks[weeks.length - 1]),
    getKdpSlotSettings(),
  ]);

  return (
    <KdpCalendarView
      key={start}
      weeks={weeks}
      tasks={tasks}
      today={today}
      slotLimits={slots.limits}
      slotAdjustments={slots.adjustments}
    />
  );
}
