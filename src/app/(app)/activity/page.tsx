import type { Metadata } from "next";

import { ActivityList } from "@/components/activity/activity-list";
import { listActivity } from "@/server/activity";
import { requireSession } from "@/server/session";
import { HistoryIcon } from "lucide-react";
import { PageHeader } from "@/components/page-header";

export const metadata: Metadata = { title: "Attività · RDL Productivity" };

export default async function ActivityPage() {
  await requireSession();
  const items = await listActivity({});
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 p-6">
      <PageHeader
        icon={HistoryIcon}
        title="Attività"
        description={
          <>
            Le modifiche fatte da te e da Claude. Una modifica si può annullare se dopo nessuno ha
            toccato gli stessi elementi. Sulla board, Ctrl/Cmd+Z annulla l&apos;ultima modifica.
          </>
        }
      />
      <ActivityList initial={items} />
    </main>
  );
}
