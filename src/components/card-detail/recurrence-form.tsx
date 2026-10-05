"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  RECURRENCE_OPTIONS,
  type Recurrence,
  type RecurrenceRule,
  recurrenceUnit,
} from "@/lib/recurrence";

export function RecurrenceForm({
  initial,
  hasDueDate,
  onSave,
}: {
  initial: Recurrence | null;
  hasDueDate: boolean;
  onSave: (recurrence: Recurrence | null) => void;
}) {
  const [rule, setRule] = useState<RecurrenceRule>(initial?.rule ?? "weekly");
  const [interval, setInterval] = useState(String(initial?.interval ?? 1));
  const count = Number(interval);
  const valid = Number.isInteger(count) && count >= 1 && count <= 365;

  if (!hasDueDate) {
    return (
      <p className="text-sm text-muted-foreground">
        Imposta prima una scadenza: la ripetizione parte da quella data.
      </p>
    );
  }

  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(event) => {
        event.preventDefault();
        if (!valid) return;
        onSave({
          rule,
          interval: rule === "weekdays" ? 1 : count,
          timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        });
      }}
    >
      <p className="text-center text-sm font-medium">Ripeti</p>
      <Select value={rule} onValueChange={(value) => setRule(value as RecurrenceRule)}>
        <SelectTrigger aria-label="Frequenza" className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {RECURRENCE_OPTIONS.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {rule !== "weekdays" && (
        <div className="flex items-center gap-2">
          <Label htmlFor="recurrence-interval" className="text-sm font-normal">
            Ogni
          </Label>
          <Input
            id="recurrence-interval"
            type="number"
            min={1}
            max={365}
            value={interval}
            onChange={(event) => setInterval(event.target.value)}
            className="w-20"
            aria-invalid={!valid}
          />
          <span className="text-sm text-muted-foreground">
            {recurrenceUnit(rule, valid ? count : 2)}
          </span>
        </div>
      )}
      <p className="text-xs text-muted-foreground">
        Quando completi la card, ne viene creata una nuova con la scadenza successiva.
      </p>
      <div className="flex justify-between gap-2">
        {initial ? (
          <Button type="button" variant="ghost" size="sm" onClick={() => onSave(null)}>
            Rimuovi
          </Button>
        ) : (
          <span />
        )}
        <Button type="submit" size="sm" disabled={!valid}>
          Salva
        </Button>
      </div>
    </form>
  );
}
