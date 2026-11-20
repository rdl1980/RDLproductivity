import type { Metadata } from "next";

import { ContentCalendarPage } from "@/components/content/content-pages";

export const metadata: Metadata = { title: "Rosario Di Leva · RDL Productivity" };

export default async function WriterPage({ searchParams }: PageProps<"/scrittore">) {
  return <ContentCalendarPage project="scrittore" params={await searchParams} />;
}
