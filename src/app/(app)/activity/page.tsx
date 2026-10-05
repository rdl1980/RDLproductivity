import type { Metadata } from "next";

import { ActivityList } from "@/components/activity/activity-list";
import { listActivity } from "@/server/activity";
import { requireSession } from "@/server/session";

export const metadata: Metadata = { title: "Attività · RDL Productivity" };

export default async function ActivityPage() {
  await requireSession();
  const items = await listActivity({});
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 p-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Attività</h1>
        <p className="text-sm text-muted-foreground">
          Le modifiche fatte da te e da Claude. Una modifica si può annullare se dopo nessuno ha
          toccato gli stessi elementi. Sulla board, Ctrl/Cmd+Z annulla l&apos;ultima modifica.
        </p>
      </div>
      <ActivityList initial={items} />
    </main>
  );
}
