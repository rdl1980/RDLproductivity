import "server-only";

import type { KdpAccount, KdpTaskItem } from "@/lib/kdp";
import { db } from "@/server/db";

/** Tasks of the weeks from `firstWeek` to `lastWeek` (Mondays, inclusive). */
export async function getKdpTasks(firstWeek: string, lastWeek: string): Promise<KdpTaskItem[]> {
  const tasks = await db.kdpTask.findMany({
    where: {
      week: { gte: new Date(`${firstWeek}T00:00:00Z`), lte: new Date(`${lastWeek}T00:00:00Z`) },
    },
    orderBy: [{ week: "asc" }, { account: "asc" }, { position: "asc" }],
    select: {
      id: true,
      title: true,
      notes: true,
      account: true,
      week: true,
      position: true,
      done: true,
    },
  });
  return tasks.map((task) => ({
    ...task,
    account: task.account as KdpAccount,
    week: task.week.toISOString().slice(0, 10),
  }));
}
