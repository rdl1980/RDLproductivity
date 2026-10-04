"use client";

import { CheckIcon, PencilIcon } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { LabelItem } from "@/lib/board-state";
import { LABEL_COLORS, labelTextColor } from "@/lib/label-colors";
import { cn } from "@/lib/utils";

type Props = {
  labels: LabelItem[];
  assignedIds: string[];
  onToggle: (label: LabelItem, assigned: boolean) => void;
  onCreate: (values: { name: string; color: string }) => void;
  onUpdate: (label: LabelItem, values: { name: string; color: string }) => void;
  onDelete: (label: LabelItem) => void;
};

/** Content of the labels popover: assign, create, edit and delete board labels. */
export function LabelPicker({
  labels,
  assignedIds,
  onToggle,
  onCreate,
  onUpdate,
  onDelete,
}: Props) {
  const [editing, setEditing] = useState<LabelItem | "new" | null>(null);

  if (editing) {
    const label = editing === "new" ? null : editing;
    return (
      <LabelForm
        key={label?.id ?? "new"}
        initial={label ?? { name: "", color: LABEL_COLORS[0].value }}
        submitLabel={label ? "Salva" : "Crea"}
        onCancel={() => setEditing(null)}
        onSubmit={(values) => {
          if (label) onUpdate(label, values);
          else onCreate(values);
          setEditing(null);
        }}
        onDelete={
          label
            ? () => {
                onDelete(label);
                setEditing(null);
              }
            : undefined
        }
      />
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <p className="text-center text-sm font-medium">Etichette</p>
      {labels.length === 0 && (
        <p className="text-center text-xs text-muted-foreground">
          Nessuna etichetta su questa board.
        </p>
      )}
      <ul className="flex flex-col gap-1">
        {labels.map((label) => {
          const assigned = assignedIds.includes(label.id);
          return (
            <li key={label.id} className="flex items-center gap-1">
              <button
                type="button"
                role="checkbox"
                aria-checked={assigned}
                aria-label={`Etichetta ${label.name || "senza nome"}`}
                onClick={() => onToggle(label, !assigned)}
                className="flex h-8 flex-1 items-center justify-between rounded px-2 text-left text-sm font-medium hover:brightness-110"
                style={{ backgroundColor: label.color, color: labelTextColor(label.color) }}
              >
                <span className="truncate">{label.name}</span>
                {assigned && <CheckIcon className="size-4 shrink-0" />}
              </button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="size-8"
                aria-label={`Modifica etichetta ${label.name || "senza nome"}`}
                onClick={() => setEditing(label)}
              >
                <PencilIcon />
              </Button>
            </li>
          );
        })}
      </ul>
      <Button type="button" variant="secondary" size="sm" onClick={() => setEditing("new")}>
        Crea una nuova etichetta
      </Button>
    </div>
  );
}

function LabelForm({
  initial,
  submitLabel,
  onSubmit,
  onCancel,
  onDelete,
}: {
  initial: { name: string; color: string };
  submitLabel: string;
  onSubmit: (values: { name: string; color: string }) => void;
  onCancel: () => void;
  onDelete?: () => void;
}) {
  const [values, setValues] = useState(initial);
  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit({ ...values, name: values.name.trim() });
      }}
    >
      <p className="text-center text-sm font-medium">
        {onDelete ? "Modifica etichetta" : "Nuova etichetta"}
      </p>
      <div
        className="flex h-8 items-center rounded px-2 text-sm font-medium"
        style={{ backgroundColor: values.color, color: labelTextColor(values.color) }}
      >
        {values.name}
      </div>
      <label className="flex flex-col gap-1 text-xs font-medium">
        Nome
        <Input
          autoFocus
          value={values.name}
          maxLength={50}
          onChange={(event) => setValues({ ...values, name: event.target.value })}
        />
      </label>
      <div className="grid grid-cols-5 gap-1.5" role="radiogroup" aria-label="Colore">
        {LABEL_COLORS.map((color) => (
          <button
            key={color.value}
            type="button"
            role="radio"
            aria-checked={values.color === color.value}
            aria-label={color.name}
            title={color.name}
            onClick={() => setValues({ ...values, color: color.value })}
            className={cn(
              "flex h-7 items-center justify-center rounded",
              values.color === color.value && "ring-2 ring-ring ring-offset-1",
            )}
            style={{ backgroundColor: color.value, color: labelTextColor(color.value) }}
          >
            {values.color === color.value && <CheckIcon className="size-3.5" />}
          </button>
        ))}
      </div>
      <div className="flex items-center justify-between gap-2">
        <div className="flex gap-1">
          <Button type="submit" size="sm">
            {submitLabel}
          </Button>
          <Button type="button" size="sm" variant="ghost" onClick={onCancel}>
            Annulla
          </Button>
        </div>
        {onDelete && (
          <Button type="button" size="sm" variant="destructive" onClick={onDelete}>
            Elimina
          </Button>
        )}
      </div>
    </form>
  );
}
