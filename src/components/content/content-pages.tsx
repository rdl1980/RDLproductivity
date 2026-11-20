import { ContentCalendarView, type ContentView } from "@/components/content/content-calendar-view";
import { ContentTodoView } from "@/components/content/content-todo-view";
import { CONTENT_TIME_ZONE, type ContentProject, dayIn, mondayOf, PROJECTS } from "@/lib/content";
import { addDays } from "@/lib/kdp-sales";
import { getReminderStatus } from "@/server/content-reminder";
import {
  getContentPieces,
  getContentPlan,
  getContentRubrics,
  getContentTodo,
} from "@/server/queries/content";
import { requireSession } from "@/server/session";

const VIEWS = ["settimana", "mese", "elenco"] as const;
const isDay = (value: unknown): value is string =>
  typeof value === "string" &&
  /^\d{4}-\d{2}-\d{2}$/.test(value) &&
  !Number.isNaN(Date.parse(value));

function lastOfMonth(first: string) {
  const [y, m] = first.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
}

/** The calendar of a project (Settimana, Mese, Elenco). */
export async function ContentCalendarPage({
  project,
  params,
}: {
  project: ContentProject;
  params: Record<string, string | string[] | undefined>;
}) {
  await requireSession();
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
      ? getContentPieces({ includeArchived: true, project })
      : getContentPieces({ from, to, project }),
    getContentPlan(project),
    getContentRubrics(project),
    getContentTodo(now, today, project),
  ]);

  return (
    <ContentCalendarView
      key={`${view}-${anchor}`}
      project={PROJECTS[project]}
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

/** The "Da fare" list of a project. */
export async function ContentTodoPage({ project }: { project: ContentProject }) {
  await requireSession();
  const now = new Date();
  const [todo, rubrics, reminder] = await Promise.all([
    getContentTodo(now, dayIn(now, CONTENT_TIME_ZONE), project),
    getContentRubrics(project),
    getReminderStatus(),
  ]);
  return (
    <ContentTodoView
      project={PROJECTS[project]}
      todo={todo}
      rubrics={rubrics}
      reminder={reminder}
    />
  );
}
