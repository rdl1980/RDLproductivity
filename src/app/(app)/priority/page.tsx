import type { Metadata } from "next";

import { SuperBoardView } from "@/components/aggregate/super-board-view";
import { getSuperBoard } from "@/server/queries/aggregate";
import { requireSession } from "@/server/session";

export const metadata: Metadata = { title: "Super board · RDL Productivity" };

export default async function SuperBoardPage() {
  await requireSession();
  const { cards, lists } = await getSuperBoard();
  return <SuperBoardView cards={cards} lists={lists} />;
}
