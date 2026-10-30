"use client";

import { PlusIcon, Trash2Icon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { CYCLES, type PlanRow, SLOT_LABELS, SLOTS, textOn, WEEKDAYS } from "@/lib/content";
import { saveContentPlan, saveContentRubric } from "@/server/actions/content";
import type { ContentRubricDTO } from "@/server/queries/content";

const NETWORK = "Errore di rete, riprova.";
const selectClass =
  "h-8 rounded-md border border-input bg-transparent px-2 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50";

/** Rubrics: rename, recolor, add. */
export function RubricsDialog({
  open,
  onOpenChange,
  rubrics,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  rubrics: ContentRubricDTO[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();

  function save(input: ContentRubricDTO, message: string) {
    start(async () => {
      const r = await saveContentRubric(input).catch(() => null);
      if (!r?.ok) return void toast.error(r?.error ?? NETWORK);
      toast.success(message);
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Rubriche</DialogTitle>
          <DialogDescription>
            Il colore distingue le rubriche nel calendario. Il valore resta fisso: è quello che usa
            Claude.
          </DialogDescription>
        </DialogHeader>
        <ul className="flex flex-col gap-2" data-testid="rubrics-list">
          {rubrics.map((rubric) => (
            <li key={`${rubric.value}-${rubric.name}-${rubric.color}`}>
              <form
                className="flex items-center gap-2"
                onSubmit={(event) => {
                  event.preventDefault();
                  const form = new FormData(event.currentTarget);
                  save(
                    {
                      value: rubric.value,
                      name: String(form.get("name") ?? "").trim(),
                      color: String(form.get("color")),
                    },
                    "Rubrica salvata",
                  );
                }}
              >
                <input
                  type="color"
                  name="color"
                  defaultValue={rubric.color}
                  aria-label={`Colore di ${rubric.name}`}
                  className="size-8 shrink-0 cursor-pointer rounded border"
                />
                <Input
                  name="name"
                  defaultValue={rubric.name}
                  aria-label={`Nome di ${rubric.value}`}
                  className="h-8"
                />
                <span className="hidden w-40 shrink-0 truncate font-mono text-xs text-muted-foreground sm:block">
                  {rubric.value}
                </span>
                <Button type="submit" size="sm" variant="outline" disabled={pending}>
                  Salva
                </Button>
              </form>
            </li>
          ))}
        </ul>
        <form
          className="flex flex-wrap items-center gap-2 border-t pt-3"
          onSubmit={(event) => {
            event.preventDefault();
            const formElement = event.currentTarget;
            const form = new FormData(formElement);
            save(
              {
                value: String(form.get("value") ?? "").trim(),
                name: String(form.get("name") ?? "").trim(),
                color: String(form.get("color")),
              },
              "Rubrica aggiunta",
            );
            formElement.reset();
          }}
        >
          <input
            type="color"
            name="color"
            defaultValue="#888888"
            aria-label="Colore della nuova rubrica"
            className="size-8 shrink-0 cursor-pointer rounded border"
          />
          <Input
            name="name"
            placeholder="Nome"
            aria-label="Nome della nuova rubrica"
            required
            className="h-8 w-40"
          />
          <Input
            name="value"
            placeholder="valore-stabile"
            aria-label="Valore della nuova rubrica"
            required
            pattern="[a-z0-9][a-z0-9\-]*"
            className="h-8 w-40 font-mono"
          />
          <Button type="submit" size="sm" disabled={pending}>
            <PlusIcon />
            Aggiungi
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** The weekly plan that generates the empty slots. */
export function PlanDialog({
  open,
  onOpenChange,
  plan,
  rubrics,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  plan: PlanRow[];
  rubrics: ContentRubricDTO[];
}) {
  const router = useRouter();
  const [rows, setRows] = useState<PlanRow[]>(plan);
  const [source, setSource] = useState(plan);
  const [pending, start] = useTransition();
  if (source !== plan) {
    setSource(plan);
    setRows(plan);
  }
  const color = (value: string) => rubrics.find((r) => r.value === value)?.color ?? "#888888";

  const patch = (index: number, fields: Partial<PlanRow>) =>
    setRows((current) => current.map((row, i) => (i === index ? { ...row, ...fields } : row)));

  const sorted = rows
    .map((row, index) => ({ row, index }))
    .sort((a, b) => a.row.weekday - b.row.weekday || a.row.slot.localeCompare(b.row.slot));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Piano settimanale</DialogTitle>
          <DialogDescription>
            Ogni riga è uno slot ricorrente. Le settimane del ciclo (A, B, C, D; la settimana del 2
            novembre 2026 è A) limitano la riga a quelle settimane; «attivo dal» la fa comparire da
            quella data. Due righe nello stesso giorno e fascia sono due schede.
          </DialogDescription>
        </DialogHeader>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[40rem] text-sm" data-testid="plan-table">
            <thead>
              <tr className="text-left text-xs text-muted-foreground">
                <th className="py-1 pr-2 font-medium">Giorno</th>
                <th className="py-1 pr-2 font-medium">Fascia</th>
                <th className="py-1 pr-2 font-medium">Rubrica</th>
                <th className="py-1 pr-2 font-medium">Settimane</th>
                <th className="py-1 pr-2 font-medium">Attivo dal</th>
                <th className="py-1" />
              </tr>
            </thead>
            <tbody>
              {sorted.map(({ row, index }) => (
                <tr key={index} className="border-t">
                  <td className="py-1 pr-2">
                    <select
                      aria-label="Giorno"
                      className={selectClass}
                      value={row.weekday}
                      onChange={(e) => patch(index, { weekday: Number(e.target.value) })}
                    >
                      {WEEKDAYS.map((name, i) => (
                        <option key={name} value={i + 1}>
                          {name}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="py-1 pr-2">
                    <select
                      aria-label="Fascia"
                      className={selectClass}
                      value={row.slot}
                      onChange={(e) => patch(index, { slot: e.target.value as PlanRow["slot"] })}
                    >
                      {SLOTS.map((s) => (
                        <option key={s} value={s}>
                          {SLOT_LABELS[s]}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="py-1 pr-2">
                    <select
                      aria-label="Rubrica"
                      className={selectClass}
                      style={{
                        backgroundColor: color(row.rubric),
                        color: textOn(color(row.rubric)),
                      }}
                      value={row.rubric}
                      onChange={(e) => patch(index, { rubric: e.target.value })}
                    >
                      {rubrics.map((r) => (
                        <option key={r.value} value={r.value}>
                          {r.name}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="py-1 pr-2">
                    <span className="flex gap-1.5">
                      {CYCLES.map((c) => (
                        <label key={c} className="flex items-center gap-0.5 text-xs">
                          <input
                            type="checkbox"
                            className="size-3.5 accent-primary"
                            checked={!row.cycles?.length || row.cycles.includes(c)}
                            onChange={(e) => {
                              const current = row.cycles?.length ? row.cycles : [...CYCLES];
                              const next = e.target.checked
                                ? [...new Set([...current, c])]
                                : current.filter((x) => x !== c);
                              patch(index, {
                                cycles: next.length === CYCLES.length ? undefined : next,
                              });
                            }}
                          />
                          {c}
                        </label>
                      ))}
                    </span>
                  </td>
                  <td className="py-1 pr-2">
                    <Input
                      type="date"
                      aria-label="Attivo dal"
                      className="h-8"
                      value={row.activeFrom ?? ""}
                      onChange={(e) => patch(index, { activeFrom: e.target.value || undefined })}
                    />
                  </td>
                  <td className="py-1">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      aria-label="Rimuovi la riga"
                      onClick={() => setRows((current) => current.filter((_, i) => i !== index))}
                    >
                      <Trash2Icon />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() =>
              setRows((current) => [
                ...current,
                { weekday: 1, slot: "19:00", rubric: rubrics[0]?.value ?? "" },
              ])
            }
          >
            <PlusIcon />
            Aggiungi riga
          </Button>
          <Button
            type="button"
            disabled={pending}
            onClick={() =>
              start(async () => {
                const r = await saveContentPlan(rows).catch(() => null);
                if (!r?.ok) return void toast.error(r?.error ?? NETWORK);
                toast.success("Piano salvato");
                onOpenChange(false);
                router.refresh();
              })
            }
          >
            Salva piano
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
