"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import type { TemplateSummary } from "@/lib/templates";
import type { MovedCard } from "@/server/actions/card-details";
import { createCardFromTemplate, getTemplates } from "@/server/actions/templates";

/** Lists card templates and adds the chosen one to `listId`. */
export function CardTemplatePicker({
  listId,
  onClose,
  onCreated,
}: {
  listId: string | null;
  onClose: () => void;
  onCreated: (card: MovedCard) => void;
}) {
  return (
    <Dialog open={listId !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogTitle>Card da template</DialogTitle>
        <DialogDescription>La card viene aggiunta in fondo alla lista.</DialogDescription>
        {listId && <Templates listId={listId} onClose={onClose} onCreated={onCreated} />}
      </DialogContent>
    </Dialog>
  );
}

function Templates({
  listId,
  onClose,
  onCreated,
}: {
  listId: string;
  onClose: () => void;
  onCreated: (card: MovedCard) => void;
}) {
  const [templates, setTemplates] = useState<TemplateSummary[] | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getTemplates("card").then((result) => {
      if (cancelled) return;
      if (result.ok) setTemplates(result.data);
      else toast.error(result.error);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  async function create(template: TemplateSummary) {
    setBusy(true);
    const result = await createCardFromTemplate({ templateId: template.id, listId }).catch(
      () => null,
    );
    setBusy(false);
    if (!result?.ok) return void toast.error(result?.error ?? "Errore di rete.");
    onCreated(result.data);
    onClose();
  }

  if (!templates) return <div className="h-16 animate-pulse rounded bg-muted" aria-busy="true" />;
  if (templates.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Nessun template di card. Aprine una e usa &quot;Salva come template&quot;.
      </p>
    );
  }
  return (
    <ul className="flex flex-col gap-2">
      {templates.map((template) => (
        <li key={template.id}>
          <Button
            variant="outline"
            disabled={busy}
            className="h-auto w-full flex-col items-start gap-0.5 py-2 text-left"
            onClick={() => create(template)}
          >
            <span className="font-medium">{template.name}</span>
            <span className="text-xs font-normal text-muted-foreground">{template.detail}</span>
          </Button>
        </li>
      ))}
    </ul>
  );
}
