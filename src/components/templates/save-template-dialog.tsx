"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import type { ActionResult } from "@/server/actions/result";

/** Asks for a template name (and, for boards, whether to include cards). */
export function SaveTemplateDialog({
  open,
  onOpenChange,
  title,
  defaultName,
  withCardsOption,
  onSave,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  defaultName: string;
  withCardsOption?: boolean;
  onSave: (values: { name: string; includeCards: boolean }) => Promise<ActionResult<unknown>>;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md" aria-describedby={undefined}>
        {open && (
          <SaveTemplateForm
            title={title}
            defaultName={defaultName}
            withCardsOption={withCardsOption}
            onSave={onSave}
            onDone={() => onOpenChange(false)}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function SaveTemplateForm({
  title,
  defaultName,
  withCardsOption,
  onSave,
  onDone,
}: {
  title: string;
  defaultName: string;
  withCardsOption?: boolean;
  onSave: (values: { name: string; includeCards: boolean }) => Promise<ActionResult<unknown>>;
  onDone: () => void;
}) {
  const [name, setName] = useState(defaultName);
  const [includeCards, setIncludeCards] = useState(false);
  const [pending, startTransition] = useTransition();

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        startTransition(async () => {
          const result = await onSave({ name, includeCards }).catch(() => null);
          if (!result?.ok) return void toast.error(result?.error ?? "Errore di rete.");
          toast.success(`Template ${JSON.stringify(name.trim())} salvato`);
          onDone();
        });
      }}
    >
      <DialogHeader>
        <DialogTitle>{title}</DialogTitle>
      </DialogHeader>
      <label className="flex flex-col gap-1.5 text-sm font-medium">
        Nome del template
        <Input autoFocus value={name} maxLength={100} onChange={(e) => setName(e.target.value)} />
      </label>
      {withCardsOption && (
        <label className="flex items-center gap-2 text-sm">
          <Checkbox
            checked={includeCards}
            onCheckedChange={(checked) => setIncludeCards(checked === true)}
          />
          Includi le card (con etichette, priorità e checklist)
        </label>
      )}
      <DialogFooter>
        <Button type="submit" disabled={pending || !name.trim()}>
          Salva template
        </Button>
      </DialogFooter>
    </form>
  );
}
