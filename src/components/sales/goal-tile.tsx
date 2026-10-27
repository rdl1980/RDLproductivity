"use client";

import { TargetIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { accountLabel, KDP_ACCOUNTS, KDP_ACCOUNT_VALUES, type KdpAccount } from "@/lib/kdp";
import { goalProgress } from "@/lib/kdp-finance";
import { formatEuro } from "@/lib/kdp-sales";
import { cn } from "@/lib/utils";
import { setKdpGoal } from "@/server/actions/kdp-goals";
import type { KdpGoals } from "@/server/queries/kdp-goals";

/**
 * Month-to-date royalty against the monthly target of the selected account
 * (or the sum of the set targets), with the month forecast when given,
 * else a projection at the current pace.
 */
export function GoalTile({
  goals,
  account,
  monthToDate,
  forecast,
  today,
}: {
  goals: KdpGoals;
  account: KdpAccount | "all";
  monthToDate: Record<KdpAccount, number>;
  /** Forecast of the month per account (see `forecastMonth`). */
  forecast?: Record<KdpAccount, number>;
  today: string;
}) {
  const [open, setOpen] = useState(false);
  const accounts = account === "all" ? KDP_ACCOUNT_VALUES : [account];
  const target = accounts.reduce((sum, a) => sum + (goals[a] ?? 0), 0);
  const royalty = accounts.reduce((sum, a) => sum + (goals[a] ? monthToDate[a] : 0), 0);
  const base = target > 0 ? goalProgress(target, royalty, today) : null;
  const progress =
    base && forecast
      ? {
          ...base,
          projected: accounts.reduce((sum, a) => sum + (goals[a] ? forecast[a] : 0), 0),
        }
      : base;

  return (
    <div className="flex flex-col gap-1 rounded-xl border p-4" data-testid="goal-tile">
      <span className="flex items-center justify-between text-sm text-muted-foreground">
        Obiettivo del mese
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="text-xs text-primary hover:underline"
        >
          {target > 0 ? "Modifica" : "Imposta"}
        </button>
      </span>
      {progress ? (
        <>
          <span className="text-3xl font-semibold tracking-tight tabular-nums">
            {progress.percent}%
          </span>
          <span className="h-1.5 overflow-hidden rounded-full bg-muted">
            <span
              className={cn(
                "block h-full rounded-full",
                progress.projected >= progress.target ? "bg-green-600" : "bg-primary",
              )}
              style={{ width: `${Math.min(100, progress.percent)}%` }}
            />
          </span>
          <span className="text-xs text-muted-foreground">
            {formatEuro(progress.royalty)} su {formatEuro(progress.target)} ·{" "}
            {forecast ? "previsione" : "proiezione"} {formatEuro(progress.projected)}
          </span>
        </>
      ) : (
        <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
          <TargetIcon className="size-4" />
          Nessun obiettivo
        </span>
      )}
      <GoalDialog open={open} onOpenChange={setOpen} goals={goals} />
    </div>
  );
}

function GoalDialog({
  open,
  onOpenChange,
  goals,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  goals: KdpGoals;
}) {
  const router = useRouter();
  const [values, setValues] = useState<Record<KdpAccount, string>>(
    () =>
      Object.fromEntries(
        KDP_ACCOUNT_VALUES.map((a) => [a, goals[a] ? String(goals[a]) : ""]),
      ) as Record<KdpAccount, string>,
  );
  const [pending, startTransition] = useTransition();

  function save() {
    startTransition(async () => {
      for (const account of KDP_ACCOUNT_VALUES) {
        const raw = values[account].replace(",", ".").trim();
        const monthlyRoyalty = raw ? Number(raw) : null;
        if (monthlyRoyalty !== null && !Number.isFinite(monthlyRoyalty)) {
          return void toast.error(`Importo non valido per ${accountLabel(account)}.`);
        }
        if ((goals[account] ?? null) === monthlyRoyalty) continue;
        const result = await setKdpGoal({ account, monthlyRoyalty }).catch(() => null);
        if (!result?.ok) return void toast.error(result?.error ?? "Errore di rete, riprova.");
      }
      toast.success("Obiettivi salvati.");
      onOpenChange(false);
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:rounded-2xl">
        <form
          className="flex flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            save();
          }}
        >
          <DialogHeader>
            <DialogTitle>Obiettivo mensile di royalty</DialogTitle>
            <DialogDescription>
              In EUR, per account. Lascia vuoto per non avere un obiettivo.
            </DialogDescription>
          </DialogHeader>
          {KDP_ACCOUNTS.map(({ value, label }) => (
            <div key={value} className="flex flex-col gap-1.5">
              <Label htmlFor={`goal-${value}`}>{label}</Label>
              <Input
                id={`goal-${value}`}
                inputMode="decimal"
                placeholder="Es. 500"
                value={values[value]}
                onChange={(event) => setValues((v) => ({ ...v, [value]: event.target.value }))}
              />
            </div>
          ))}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Annulla
            </Button>
            <Button type="submit" disabled={pending}>
              Salva
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
