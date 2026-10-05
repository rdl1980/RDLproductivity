import type { Metadata } from "next";

import { TemplateList } from "@/components/templates/template-list";
import { requireSession } from "@/server/session";
import { listTemplates } from "@/server/templates";

export const metadata: Metadata = { title: "Template · RDL Productivity" };

export default async function TemplatesPage() {
  await requireSession();
  const templates = await listTemplates();
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 p-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Template</h1>
        <p className="text-sm text-muted-foreground">
          Le board si creano da template con &quot;Crea una board&quot;; le card dal menu di una
          lista (Aggiungi card da template…). Clicca un nome per rinominarlo.
        </p>
      </div>
      <TemplateList templates={templates} />
    </main>
  );
}
