import type { Metadata } from "next";

import { ContentTodoView } from "@/components/content/content-todo-view";
import { CONTENT_TIME_ZONE, dayIn } from "@/lib/content";
import { getContentRubrics, getContentTodo } from "@/server/queries/content";
import { requireSession } from "@/server/session";

export const metadata: Metadata = { title: "Da fare · Robotti & Robotte · RDL Productivity" };

export default async function ContentTodoPage() {
  await requireSession();
  const now = new Date();
  const [todo, rubrics] = await Promise.all([
    getContentTodo(now, dayIn(now, CONTENT_TIME_ZONE)),
    getContentRubrics(),
  ]);
  return <ContentTodoView todo={todo} rubrics={rubrics} />;
}
