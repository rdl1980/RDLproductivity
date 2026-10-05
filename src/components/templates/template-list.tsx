"use client";

import { LayoutGridIcon, SquareIcon, Trash2Icon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { InlineTitle } from "@/components/board/inline-title";
import { Button } from "@/components/ui/button";
import type { TemplateSummary } from "@/lib/templates";
import { deleteTemplate, renameTemplate } from "@/server/actions/templates";

export function TemplateList({ templates }: { templates: TemplateSummary[] }) {
  const [editing, setEditing] = useState<string | null>(null);

  async function rename(template: TemplateSummary, name: string) {
    const result = await renameTemplate({ id: template.id, name }).catch(() => null);
    if (!result?.ok) toast.error(result?.error ?? "Errore di rete.");
  }

  async function remove(template: TemplateSummary) {
    const result = await deleteTemplate(template.id).catch(() => null);
    if (!result?.ok) return void toast.error(result?.error ?? "Errore di rete.");
    toast.success(`Template ${JSON.stringify(template.name)} eliminato`);
  }

  if (templates.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Nessun template. Salvane uno dal menu di una board (Salva come template…) o dal dettaglio di
        una card.
      </p>
    );
  }
  return (
    <ul className="divide-y rounded-lg border">
      {templates.map((template) => (
        <li
          key={template.id}
          data-testid="template-item"
          className="flex items-center justify-between gap-3 p-3"
        >
          <div className="flex min-w-0 items-center gap-2">
            {template.kind === "board" ? (
              <LayoutGridIcon
                className="size-4 shrink-0 text-muted-foreground"
                aria-label="Board"
              />
            ) : (
              <SquareIcon className="size-4 shrink-0 text-muted-foreground" aria-label="Card" />
            )}
            <div className="flex min-w-0 flex-col">
              <InlineTitle
                value={template.name}
                label="Nome del template"
                editing={editing === template.id}
                onEditingChange={(value) => setEditing(value ? template.id : null)}
                onSave={(name) => rename(template, name)}
                className="rounded px-1 text-left text-sm font-medium"
              />
              <span className="px-1 text-xs text-muted-foreground">{template.detail}</span>
            </div>
          </div>
          <Button
            variant="ghost"
            size="icon"
            aria-label={`Elimina il template ${template.name}`}
            onClick={() => remove(template)}
          >
            <Trash2Icon />
          </Button>
        </li>
      ))}
    </ul>
  );
}
