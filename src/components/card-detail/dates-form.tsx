"use client";

import { useState } from "react";
import { it } from "react-day-picker/locale";

import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { combineDateAndTime, formatDue, toTimeInput } from "@/lib/due";
import { cn } from "@/lib/utils";

type Values = { startDate: string | null; dueDate: string | null };

const startOfDay = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate());

/** Content of the dates popover: start date (day) and due date (day and time). */
export function DatesForm({
  initial,
  onSave,
}: {
  initial: Values;
  onSave: (values: Values) => void;
}) {
  const [start, setStart] = useState(initial.startDate ? new Date(initial.startDate) : null);
  const [due, setDue] = useState(initial.dueDate ? new Date(initial.dueDate) : null);
  const [dueTime, setDueTime] = useState(due ? toTimeInput(due) : "12:00");
  const [active, setActive] = useState<"start" | "due">("due");
  const [error, setError] = useState<string | null>(null);

  const selected = active === "start" ? start : due;

  function pick(day: Date | undefined) {
    if (!day) return;
    if (active === "start") setStart(startOfDay(day));
    else setDue(combineDateAndTime(day, dueTime));
  }

  function save(values: { start: Date | null; due: Date | null }) {
    if (values.start && values.due && values.start > values.due) {
      setError("La data di inizio deve precedere la scadenza.");
      return;
    }
    onSave({
      startDate: values.start?.toISOString() ?? null,
      dueDate: values.due?.toISOString() ?? null,
    });
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-center text-sm font-medium">Date</p>
      <Calendar
        mode="single"
        locale={it}
        weekStartsOn={1}
        selected={selected ?? undefined}
        defaultMonth={selected ?? undefined}
        onSelect={pick}
        className="mx-auto p-0"
      />

      <div
        className={cn("flex items-center gap-2 rounded-md p-1", active === "start" && "bg-muted")}
      >
        <Checkbox
          aria-label="Data di inizio"
          checked={start !== null}
          onCheckedChange={(checked) => {
            setActive("start");
            setStart(checked ? (start ?? startOfDay(new Date())) : null);
          }}
        />
        <button
          type="button"
          className="flex-1 text-left text-sm"
          onClick={() => setActive("start")}
        >
          <span className="block text-xs text-muted-foreground">Inizio</span>
          {start ? formatDue(start) : "Nessuna"}
        </button>
      </div>

      <div className={cn("flex items-center gap-2 rounded-md p-1", active === "due" && "bg-muted")}>
        <Checkbox
          aria-label="Data di scadenza"
          checked={due !== null}
          onCheckedChange={(checked) => {
            setActive("due");
            setDue(checked ? (due ?? combineDateAndTime(new Date(), dueTime)) : null);
          }}
        />
        <button type="button" className="flex-1 text-left text-sm" onClick={() => setActive("due")}>
          <span className="block text-xs text-muted-foreground">Scadenza</span>
          {due ? formatDue(due) : "Nessuna"}
        </button>
        <Input
          type="time"
          aria-label="Ora di scadenza"
          className="h-8 w-24"
          value={dueTime}
          disabled={!due}
          onChange={(event) => {
            setDueTime(event.target.value);
            if (due && event.target.value) setDue(combineDateAndTime(due, event.target.value));
          }}
        />
      </div>

      {error && (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      )}

      <div className="flex gap-2">
        <Button type="button" size="sm" className="flex-1" onClick={() => save({ start, due })}>
          Salva
        </Button>
        <Button
          type="button"
          size="sm"
          variant="secondary"
          className="flex-1"
          onClick={() => save({ start: null, due: null })}
        >
          Rimuovi
        </Button>
      </div>
    </div>
  );
}
