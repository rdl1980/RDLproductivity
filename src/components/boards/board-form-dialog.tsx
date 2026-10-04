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
import { BOARD_COLORS, DEFAULT_BOARD_COLOR } from "@/lib/board-colors";
import { cn } from "@/lib/utils";

type Values = { title: string; color: string };

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  submitLabel: string;
  initialValues?: Values;
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
