import type { Metadata } from "next";

import { ContentTodoPage } from "@/components/content/content-pages";

export const metadata: Metadata = { title: "Da fare · Rosario Di Leva · RDL Productivity" };

export default function WriterTodoPage() {
  return <ContentTodoPage project="scrittore" />;
}
