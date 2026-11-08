"use client";

import { MinusIcon, PlusIcon, SlidersHorizontalIcon } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { accountLabel, KDP_ACCOUNTS, type KdpAccount, weekRangeLabel } from "@/lib/kdp";
import { KDP_FORMATS, type KdpFormat } from "@/lib/kdp-books";
import {
  type FormatCounts,
  SLOT_FORMAT_LABELS,
  type SlotLimits,
  type SlotUsage,
} from "@/lib/kdp-slots";
import { cn } from "@/lib/utils";

const tone = (u: SlotUsage) =>
  u.left < 0
    ? "bg-red-100 text-red-900 dark:bg-red-400/20 dark:text-red-100"
    : u.left === 0
      ? "bg-amber-100 text-amber-900 dark:bg-amber-400/20 dark:text-amber-100"
      : "bg-background text-foreground";

/**
 * The slots left in a "Reale" cell (one chip per format); a click opens the
 * manual correction of the used ones.
 */
export function SlotBar({
  account,
  week,
  usage,
  onAdjust,
  onEditLimits,
}: {
  account: KdpAccount;
  week: string;
  usage: SlotUsage[];
  onAdjust: (format: KdpFormat, adjustment: number) => void;
  onEditLimits: () => void;
}) {
  const label = `Slot KDP di ${accountLabel(account)}, settimana ${weekRangeLabel(week)}`;
  const shown = usage.filter((u) => u.limit > 0 || u.used > 0);
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={`${label}: ${usage.map((u) => `${SLOT_FORMAT_LABELS[u.format].short} ${u.left} liberi su ${u.limit}`).join(", ")}`}
          data-testid="kdp-slots"
          className="flex flex-wrap gap-1 rounded-md text-left outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
          onPointerDown={(e) => e.stopPropagation()}
        >
          {shown.map((u) => (
            <span
              key={u.format}
              className={cn(
                "rounded px-1.5 py-0.5 text-[11px] leading-none font-medium tabular-nums ring-1 ring-black/10 dark:ring-white/10",
                tone(u),
              )}
            >
              {SLOT_FORMAT_LABELS[u.format].short} {Math.max(u.left, 0)}/{u.limit}
            </span>
          ))}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-72 text-sm" aria-label={label}>
        <p className="mb-2 font-semibold">{label}</p>
        <ul className="flex flex-col gap-2" data-testid="kdp-slots-detail">
          {usage.map((u) => (
            <li key={u.format} className="flex items-center justify-between gap-2">
              <span className="flex flex-col">
                <span className="font-medium">{SLOT_FORMAT_LABELS[u.format].long}</span>
                <span className="text-xs text-muted-foreground">
                  {u.used} usati su {u.limit}
                  {u.adjustment
                    ? ` (${u.fromTasks} dal calendario, ${u.adjustment > 0 ? "+" : ""}${u.adjustment} a mano)`
                    : ""}
                  {u.left < 0 ? ` · ${-u.left} oltre il limite` : ` · ${u.left} liberi`}
                </span>
              </span>
              <span className="flex items-center gap-1">
                <Button
                  type="button"
                  size="icon"
                  variant="outline"
                  className="size-7"
                  aria-label={`Un ${SLOT_FORMAT_LABELS[u.format].short.toLowerCase()} usato in meno`}
                  disabled={u.used === 0}
                  onClick={() => onAdjust(u.format, u.adjustment - 1)}
                >
                  <MinusIcon />
                </Button>
                <Button
                  type="button"
                  size="icon"
                  variant="outline"
                  className="size-7"
                  aria-label={`Un ${SLOT_FORMAT_LABELS[u.format].short.toLowerCase()} usato in più`}
                  onClick={() => onAdjust(u.format, u.adjustment + 1)}
                >
                  <PlusIcon />
                </Button>
              </span>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-xs text-muted-foreground">
          Contano le attività nella colonna «Reale» con il formato segnato; + e − correggono a mano
          (per esempio per un libro caricato fuori dal calendario).
        </p>
        <Button
          type="button"
          variant="link"
          size="sm"
          className="mt-1 h-auto px-0"
          onClick={onEditLimits}
        >
          Cambia i limiti settimanali
        </Button>
      </PopoverContent>
    </Popover>
  );
}

/** The weekly limits: the base for every account, and an override per account. */
export function SlotLimitsDialog({
  open,
  limits,
  onClose,
  onSave,
}: {
  open: boolean;
  limits: SlotLimits;
  onClose: () => void;
  onSave: (limits: SlotLimits) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={(value) => !value && onClose()}>
      <DialogContent className="sm:max-w-lg">
        {open && <LimitsForm limits={limits} onClose={onClose} onSave={onSave} />}
      </DialogContent>
    </Dialog>
  );
}

function CountsFields({
  idPrefix,
  value,
  onChange,
}: {
  idPrefix: string;
  value: FormatCounts;
  onChange: (value: FormatCounts) => void;
}) {
  return (
    <div className="grid grid-cols-3 gap-2">
      {KDP_FORMATS.map((f) => (
        <label
          key={f}
          className="flex flex-col gap-1 text-xs text-muted-foreground"
          htmlFor={`${idPrefix}-${f}`}
        >
          {SLOT_FORMAT_LABELS[f].short}
          <Input
            id={`${idPrefix}-${f}`}
            type="number"
            min={0}
            max={100}
            value={value[f]}
            onChange={(e) => onChange({ ...value, [f]: Math.max(0, Number(e.target.value) || 0) })}
          />
        </label>
      ))}
    </div>
  );
}

function LimitsForm({
  limits,
  onClose,
  onSave,
}: {
  limits: SlotLimits;
  onClose: () => void;
  onSave: (limits: SlotLimits) => void;
}) {
  const [draft, setDraft] = useState(limits);
  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        onSave(draft);
        onClose();
      }}
    >
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2">
          <SlidersHorizontalIcon className="size-4 text-muted-foreground" />
          Limiti settimanali KDP
        </DialogTitle>
        <DialogDescription>
          Titoli nuovi che ogni account può pubblicare in una settimana, per formato. La regola KDP
          attuale è 2 per formato.
        </DialogDescription>
      </DialogHeader>
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-sm font-medium">Per tutti gli account</legend>
        <CountsFields
          idPrefix="slot-base"
          value={draft.base}
          onChange={(base) => setDraft((d) => ({ ...d, base }))}
        />
      </fieldset>
      {KDP_ACCOUNTS.map((a) => {
        const own = draft.accounts[a.value];
        return (
          <fieldset key={a.value} className="flex flex-col gap-2">
            <legend className="sr-only">{a.label}</legend>
            <label className="flex items-center gap-2 text-sm font-medium">
              <Checkbox
                checked={!!own}
                onCheckedChange={(checked) =>
                  setDraft((d) => {
                    const accounts = { ...d.accounts };
                    if (checked === true) accounts[a.value] = { ...d.base };
                    else delete accounts[a.value];
                    return { ...d, accounts };
                  })
                }
                aria-label={`Limiti propri per ${a.label}`}
              />
              {a.label}: limiti propri
            </label>
            {own && (
              <CountsFields
                idPrefix={`slot-${a.value}`}
                value={own}
                onChange={(value) =>
                  setDraft((d) => ({ ...d, accounts: { ...d.accounts, [a.value]: value } }))
                }
              />
            )}
          </fieldset>
        );
      })}
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onClose}>
          Annulla
        </Button>
        <Button type="submit">Salva limiti</Button>
      </DialogFooter>
    </form>
  );
}
