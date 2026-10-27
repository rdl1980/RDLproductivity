import type { Metadata } from "next";

import { CalendarView } from "@/components/calendar/calendar-view";
import { type CalendarView as View, parseDayKey, serverRange } from "@/lib/calendar";
import { weekStartOf } from "@/lib/kdp";
import { getCalendarCards, getCalendarFilterOptions } from "@/server/queries/calendar";
import { getKdpTasks } from "@/server/queries/kdp";
import { requireSession } from "@/server/session";

export const metadata: Metadata = { title: "Calendario · RDL Productivity" };

const param = (value: string | string[] | undefined) => (typeof value === "string" ? value : null);

export default async function CalendarPage({ searchParams }: PageProps<"/calendar">) {
  await requireSession();
  const params = await searchParams;
  const view: View = param(params.view) === "week" ? "week" : "month";
  const date = param(params.date);
  const boardId = param(params.board) ?? undefined;
  const labelId = param(params.label) ?? undefined;

  // The server does not know the browser time zone: load a padded range.
  const anchor = parseDayKey(date) ?? new Date();
  const range = serverRange(anchor, view);
  const toKey = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const [cards, boards, kdpTasks] = await Promise.all([
    getCalendarCards({ ...range, boardId, labelId }),
    getCalendarFilterOptions(),
    // Weekly KDP tasks of the visible weeks; shown only without board or label filters.
    boardId || labelId
      ? Promise.resolve([])
      : getKdpTasks(weekStartOf(toKey(range.from))!, weekStartOf(toKey(range.to))!),
  ]);

  return (
    <CalendarView
      key={[view, date, boardId, labelId].join("|")}
      cards={cards}
      kdpTasks={kdpTasks}
      boards={boards}
      view={view}
      date={date}
      boardId={boardId ?? null}
      labelId={labelId ?? null}
    />
  );
}
