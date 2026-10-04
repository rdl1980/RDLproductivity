import type { Metadata } from "next";

import { CalendarView } from "@/components/calendar/calendar-view";
import { type CalendarView as View, parseDayKey, serverRange } from "@/lib/calendar";
import { getCalendarCards, getCalendarFilterOptions } from "@/server/queries/calendar";
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
  const [cards, boards] = await Promise.all([
    getCalendarCards({ ...range, boardId, labelId }),
    getCalendarFilterOptions(),
  ]);

  return (
    <CalendarView
      key={[view, date, boardId, labelId].join("|")}
      cards={cards}
      boards={boards}
      view={view}
      date={date}
      boardId={boardId ?? null}
      labelId={labelId ?? null}
    />
  );
}
