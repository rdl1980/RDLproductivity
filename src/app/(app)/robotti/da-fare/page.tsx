import type { Metadata } from "next";

import { ContentTodoPage } from "@/components/content/content-pages";

export const metadata: Metadata = { title: "Da fare · Robotti & Robotte · RDL Productivity" };

export default function RobottiTodoPage() {
  return <ContentTodoPage project="robotti" />;
}
