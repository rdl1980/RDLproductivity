import type { Metadata } from "next";

import { ContentCalendarPage } from "@/components/content/content-pages";

export const metadata: Metadata = { title: "Robotti & Robotte · RDL Productivity" };

export default async function ContentPage({ searchParams }: PageProps<"/robotti">) {
  return <ContentCalendarPage project="robotti" params={await searchParams} />;
}
