import type { Metadata } from "next";

import { TemplateList } from "@/components/templates/template-list";
import { requireSession } from "@/server/session";
import { listTemplates } from "@/server/templates";
import { LayoutTemplateIcon } from "lucide-react";
import { PageHeader } from "@/components/page-header";

export const metadata: Metadata = { title: "Template · RDL Productivity" };

export default async function TemplatesPage() {
  await requireSession();
  const templates = await listTemplates();
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 p-6">
      <PageHeader
        icon={LayoutTemplateIcon}
        title="Template"
        description={
          <>
            Le board si creano da template con &quot;Crea una board&quot;; le card dal menu di una
            lista (Aggiungi card da template…). Clicca un nome per rinominarlo.
          </>
        }
      />
      <TemplateList templates={templates} />
    </main>
  );
}
