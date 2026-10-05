"use client";

import { CheckIcon } from "lucide-react";
import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { BOARD_COLORS, DEFAULT_BOARD_COLOR } from "@/lib/board-colors";
import type { TemplateSummary } from "@/lib/templates";
import { cn } from "@/lib/utils";

type Values = { title: string; color: string; templateId?: string };

const NO_TEMPLATE = "none";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  submitLabel: string;
  initialValues?: Values;
  /** Board templates to start from (creation only). */
  templates?: TemplateSummary[];
  /** Returns an error message, or null on success. */
  onSubmit: (values: Values) => Promise<string | null>;
};

export function BoardFormDialog({ open, onOpenChange, ...props }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        {/* Remounted on open so the form starts from initialValues. */}
        {open && <BoardForm {...props} onDone={() => onOpenChange(false)} />}
      </DialogContent>
    </Dialog>
  );
}

function BoardForm({
  title,
  submitLabel,
  initialValues,
  templates,
  onSubmit,
  onDone,
}: Omit<Props, "open" | "onOpenChange"> & { onDone: () => void }) {
  const [values, setValues] = useState<Values>(
    initialValues ?? { title: "", color: DEFAULT_BOARD_COLOR },
  );
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        startTransition(async () => {
          const message = await onSubmit(values);
          if (message) setError(message);
          else onDone();
        });
      }}
    >
      <DialogHeader>
        <DialogTitle>{title}</DialogTitle>
      </DialogHeader>

      <div
        className="flex h-20 items-end rounded-md p-3 text-sm font-semibold text-white"
        style={{ backgroundColor: values.color }}
      >
        {values.title || "Anteprima"}
      </div>

      <label className="flex flex-col gap-1.5 text-sm font-medium">
        Titolo
        <Input
          autoFocus
          value={values.title}
          maxLength={200}
          onChange={(event) => setValues({ ...values, title: event.target.value })}
          placeholder="Es. Lavoro"
        />
      </label>

      {templates && templates.length > 0 && (
        <div className="flex flex-col gap-1.5 text-sm font-medium">
          <span id="board-template-label">Template</span>
          <Select
            value={values.templateId ?? NO_TEMPLATE}
            onValueChange={(value) =>
              setValues({ ...values, templateId: value === NO_TEMPLATE ? undefined : value })
            }
          >
            <SelectTrigger aria-labelledby="board-template-label" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NO_TEMPLATE}>Board vuota</SelectItem>
              {templates.map((template) => (
                <SelectItem key={template.id} value={template.id}>
                  {template.name}
                  <span className="text-xs text-muted-foreground">{template.detail}</span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      <fieldset className="flex flex-col gap-1.5">
        <legend className="mb-1.5 text-sm font-medium">Colore</legend>
        <div className="flex flex-wrap gap-2">
          {BOARD_COLORS.map((color) => (
            <button
              key={color.value}
              type="button"
              title={color.name}
              aria-label={color.name}
              aria-pressed={values.color === color.value}
              onClick={() => setValues({ ...values, color: color.value })}
              className={cn(
                "flex size-8 items-center justify-center rounded-md text-white ring-offset-2 transition",
                values.color === color.value && "ring-2 ring-ring",
              )}
              style={{ backgroundColor: color.value }}
            >
              {values.color === color.value && <CheckIcon className="size-4" />}
            </button>
          ))}
        </div>
      </fieldset>

      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}

      <DialogFooter>
        <Button type="submit" disabled={pending || !values.title.trim()}>
          {submitLabel}
        </Button>
      </DialogFooter>
    </form>
  );
}
