"use client";

import { CheckIcon, CircleAlertIcon, Loader2Icon, PuzzleIcon } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { KDP_ACCOUNTS, type KdpAccount } from "@/lib/kdp";
import { decodeImportHash, importPayloadSchema } from "@/lib/kdp-books";
import {
  EXTENSION_ACCOUNT_KEY,
  type ExtensionEvent,
  runExtensionSync,
  useKdpExtension,
} from "@/lib/kdp-extension";
import { formatEuro, formatInt, SALES_SYNC_MONTHS } from "@/lib/kdp-sales";
import type { SyncStep } from "@/lib/kdp-sync";
import { cn } from "@/lib/utils";
import { importKdpBooks } from "@/server/actions/kdp-books";
import { getSalesSyncWindow, importKdpSales } from "@/server/actions/kdp-sales";

type StepState = { status: "idle" | "running" | "done" | "error"; message: string };
const dayMonthYear = (day: string) =>
  new Intl.DateTimeFormat("it-IT", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${day}T00:00:00Z`));
const LABELS: Record<SyncStep, string> = { books: "Libri", sales: "Vendite" };

function readAccount(): KdpAccount | null {
  try {
    const value = localStorage.getItem(EXTENSION_ACCOUNT_KEY);
    return value === "main" || value === "secondary" ? value : null;
  } catch {
    return null;
  }
}

/**
 * One-click update through the browser extension: books, sales or both,
 * imported into the chosen account as the extension delivers them. Without
 * the extension, points to its install page.
 */
export function ExtensionSync({
  defaultSteps,
  onDone,
}: {
  defaultSteps: SyncStep[];
  onDone?: () => void;
}) {
  const router = useRouter();
  const version = useKdpExtension();
  const [account, setAccount] = useState<KdpAccount | null>(readAccount);
  const [running, setRunning] = useState(false);
  const [steps, setSteps] = useState<Partial<Record<SyncStep, StepState>>>({});
  // Sales: the last months only once there is an archive, unless asked for everything.
  const [fullHistory, setFullHistory] = useState(false);

  if (!version) {
    return (
      <p className="flex items-start gap-2 rounded-lg bg-muted/60 p-3 text-xs text-muted-foreground">
        <PuzzleIcon className="mt-0.5 size-3.5 shrink-0" />
        <span>
          Con l&apos;estensione «RDL KDP Sync» basta un clic, senza preferiti:{" "}
          <Link href="/kdp/estensione" className="text-primary hover:underline">
            come installarla
          </Link>
          .
        </span>
      </p>
    );
  }

  function choose(value: KdpAccount) {
    setAccount(value);
    try {
      localStorage.setItem(EXTENSION_ACCOUNT_KEY, value);
    } catch {
      // ignore
    }
  }

  const update = (step: SyncStep, state: StepState) =>
    setSteps((current) => ({ ...current, [step]: state }));

  /** Applies one event; for a result, returns the step's final status. */
  async function handle(
    event: ExtensionEvent,
    chosen: KdpAccount,
  ): Promise<StepState["status"] | null> {
    if (event.type === "progress") {
      update(event.step, { status: "running", message: event.message });
      return null;
    }
    if (event.type === "done") {
      if (event.error) toast.error(event.error);
      return null;
    }
    if (event.error || !event.hash) {
      update(event.step, { status: "error", message: event.error ?? "Nessun dato ricevuto." });
      return "error";
    }
    update(event.step, { status: "running", message: "Importo…" });
    try {
      if (event.step === "books") {
        const parsed = importPayloadSchema.safeParse(decodeImportHash(event.hash));
        if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? "Dati non validi.");
        const result = await importKdpBooks({ account: chosen, payload: parsed.data });
        if (!result.ok) throw new Error(result.error);
        const r = result.data;
        update("books", {
          status: "done",
          message: `${r.created} nuovi, ${r.updated} aggiornati (${r.asins} ASIN).`,
        });
      } else {
        const result = await importKdpSales({ account: chosen, hash: event.hash });
        if (!result.ok) throw new Error(result.error);
        const r = result.data;
        update("sales", {
          status: "done",
          message: `${formatInt(r.rows)} righe, ${formatInt(r.units)} copie, ${formatEuro(r.royalty)} di royalty.`,
        });
      }
      return "done";
    } catch (error) {
      update(event.step, {
        status: "error",
        message: error instanceof Error ? error.message : "Errore di rete, riprova.",
      });
      return "error";
    }
  }

  async function run(which: SyncStep[]) {
    if (!account || running) return;
    const chosen = account;
    setRunning(true);
    setSteps(Object.fromEntries(which.map((s) => [s, { status: "running", message: "In coda…" }])));
    let salesFrom: string | null = null;
    if (which.includes("sales") && !fullHistory) {
      const window = await getSalesSyncWindow({ account: chosen }).catch(() => null);
      salesFrom = window?.ok ? window.data.from : null;
      if (salesFrom) {
        update("sales", {
          status: "running",
          message: `In coda (dal ${dayMonthYear(salesFrom)}, il resto è già in archivio)…`,
        });
      }
    }
    const outcome = new Map<SyncStep, StepState["status"]>();
    await runExtensionSync(
      which,
      async (event) => {
        const status = await handle(event, chosen);
        if (status && event.type === "result") outcome.set(event.step, status);
      },
      { salesFrom },
    );
    setRunning(false);
    router.refresh();
    // Errors stay on screen; a clean run closes the dialog.
    if (which.every((step) => outcome.get(step) === "done")) onDone?.();
  }

  const entries = (Object.keys(steps) as SyncStep[]).map((step) => [step, steps[step]!] as const);

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-primary/30 bg-primary/5 p-3 text-sm">
      <p className="flex items-center gap-2 font-medium">
        <PuzzleIcon className="size-4 text-primary" />
        Estensione «RDL KDP Sync» attiva (v{version})
      </p>
      <fieldset className="flex flex-wrap gap-x-4 gap-y-1">
        <legend className="mb-1 text-xs text-muted-foreground">
          In questo browser sei collegato a KDP con:
        </legend>
        {KDP_ACCOUNTS.map(({ value, label }) => (
          <label key={value} className="flex items-center gap-1.5 text-sm">
            <input
              type="radio"
              name="extension-account"
              value={value}
              checked={account === value}
              disabled={running}
              onChange={() => choose(value)}
              className="size-4 accent-primary"
            />
            {label}
          </label>
        ))}
      </fieldset>
      <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <input
          type="checkbox"
          checked={fullHistory}
          disabled={running}
          onChange={(event) => setFullHistory(event.target.checked)}
          className="size-3.5 accent-primary"
        />
        Vendite: rileggi tutto lo storico (di norma bastano gli ultimi {SALES_SYNC_MONTHS} mesi,
        quelli che KDP può ancora correggere)
      </label>
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          size="sm"
          disabled={!account || running}
          onClick={() => run(defaultSteps)}
          data-testid="extension-sync"
        >
          {running && <Loader2Icon className="animate-spin" />}
          {defaultSteps.length > 1
            ? "Aggiorna libri e vendite"
            : `Aggiorna ${LABELS[defaultSteps[0]].toLowerCase()}`}
        </Button>
        {defaultSteps.length > 1 &&
          (["books", "sales"] as SyncStep[]).map((step) => (
            <Button
              key={step}
              type="button"
              size="sm"
              variant="ghost"
              disabled={!account || running}
              onClick={() => run([step])}
            >
              Solo {LABELS[step].toLowerCase()}
            </Button>
          ))}
      </div>
      {entries.length > 0 && (
        <ul className="flex flex-col gap-1 text-xs" data-testid="extension-steps">
          {entries.map(([step, state]) => (
            <li
              key={step}
              data-step={step}
              data-status={state.status}
              className={cn(
                "flex items-start gap-1.5",
                state.status === "error" && "text-red-700 dark:text-red-300",
              )}
            >
              {state.status === "running" ? (
                <Loader2Icon className="mt-0.5 size-3.5 shrink-0 animate-spin" />
              ) : state.status === "done" ? (
                <CheckIcon className="mt-0.5 size-3.5 shrink-0 text-emerald-700 dark:text-emerald-300" />
              ) : (
                <CircleAlertIcon className="mt-0.5 size-3.5 shrink-0" />
              )}
              <span>
                <strong>{LABELS[step]}:</strong> {state.message}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
