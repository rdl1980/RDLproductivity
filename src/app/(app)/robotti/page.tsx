import type { Metadata } from "next";

import { ContentCalendarView, type ContentView } from "@/components/content/content-calendar-view";
import { CONTENT_TIME_ZONE, dayIn, mondayOf } from "@/lib/content";
import { addDays } from "@/lib/kdp-sales";
import {
  getContentPieces,
  getContentPlan,
  getContentRubrics,
  getContentTodo,
} from "@/server/queries/content";
import { requireSession } from "@/server/session";

export const metadata: Metadata = { title: "Robotti & Robotte · RDL Productivity" };

const VIEWS = ["settimana", "mese", "elenco"] as const;
const isDay = (value: unknown): value is string =>
  typeof value === "string" &&
  /^\d{4}-\d{2}-\d{2}$/.test(value) &&
  !Number.isNaN(Date.parse(value));

function lastOfMonth(first: string) {
  const [y, m] = first.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
}

export default async function ContentPage({ searchParams }: PageProps<"/robotti">) {
  await requireSession();
  const params = await searchParams;
  const now = new Date();
  const today = dayIn(now, CONTENT_TIME_ZONE);
  const view: ContentView = VIEWS.includes(params.view as ContentView)
    ? (params.view as ContentView)
    : "settimana";
  const date = isDay(params.date) ? params.date : null;

  let anchor: string;
  let from: string;
  let to: string;
  if (view === "mese") {
    anchor = `${(date ?? today).slice(0, 7)}-01`;
    from = mondayOf(anchor);
    to = addDays(mondayOf(lastOfMonth(anchor)), 6);
  } else {
    // Seven days from `date`; by default from yesterday, so the week moves every day.
    anchor = date ?? addDays(today, -1);
    from = anchor;
    to = addDays(anchor, 6);
  }

  const [pieces, plan, rubrics, todo] = await Promise.all([
    view === "elenco"
      ? getContentPieces({ includeArchived: true })
      : getContentPieces({ from, to }),
    getContentPlan(),
    getContentRubrics(),
    getContentTodo(now, today),
  ]);

  return (
    <ContentCalendarView
      key={`${view}-${anchor}`}
      view={view}
      anchor={anchor}
      today={today}
      from={from}
      to={to}
      pieces={pieces}
      plan={plan}
      rubrics={rubrics}
      todoCount={todo.open.length}
    />
  );
}
