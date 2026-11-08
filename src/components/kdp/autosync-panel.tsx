"use client";

import { BellRingIcon, Loader2Icon, RefreshCwIcon, TimerIcon } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { accountLabel, KDP_ACCOUNTS, type KdpAccount } from "@/lib/kdp";
import {
  AUTOSYNC_VERSION,
  type ExtensionAutoSyncState,
  extensionAutoSync,
  olderVersion,
  useKdpExtension,
} from "@/lib/kdp-extension";
import {
  disableKdpAutoSync,
  enableKdpAutoSync,
  setKdpSalesAlerts,
} from "@/server/actions/kdp-autosync";
import type { AutoSyncStatus } from "@/server/kdp-autosync";

const NETWORK = "Errore di rete, riprova.";
const when = (iso: string) =>
  new Intl.DateTimeFormat("it-IT", { dateStyle: "short", timeStyle: "short" }).format(
    new Date(iso),
  );

/**
 * The hourly sales sync of this browser (one KDP account per browser) and the
 * Telegram alerts of new sales.
 */
export function AutoSyncPanel({
  status,
  alertsOn,
  botName,
}: {
  status: AutoSyncStatus[];
  alertsOn: boolean;
  /** Telegram bot of the reminders, null when not connected. */
  botName: string | null;
}) {
  const router = useRouter();
  const version = useKdpExtension();
  const [local, setLocal] = useState<ExtensionAutoSyncState | null>(null);
  const [account, setAccount] = useState<KdpAccount>("main");
  const [pending, start] = useTransition();
  const [running, setRunning] = useState(false);
  const supported = !!version && !olderVersion(version, AUTOSYNC_VERSION);

  useEffect(() => {
    if (!supported) return;
    let live = true;
    extensionAutoSync("get")
      .then((state) => {
        if (!live) return;
        setLocal(state);
        if (state.config) setAccount(state.config.account as KdpAccount);
      })
      .catch(() => live && setLocal(null));
    return () => {
      live = false;
    };
  }, [supported]);

  function enable() {
    start(async () => {
      const result = await enableKdpAutoSync(account).catch(() => null);
      if (!result?.ok) return void toast.error(result?.error ?? NETWORK);
      try {
        setLocal(
          await extensionAutoSync("set", {
            account,
            label: accountLabel(account),
            token: result.data.token,
            appUrl: window.location.origin,
          }),
        );
        toast.success(`Aggiornamento automatico attivo per ${accountLabel(account)}`);
      } catch (e) {
        toast.error((e as Error).message);
      }
      router.refresh();
    });
  }

  function disable() {
    const current = local?.config?.account as KdpAccount | undefined;
    if (!current) return;
    start(async () => {
      const result = await disableKdpAutoSync(current).catch(() => null);
      if (!result?.ok) return void toast.error(result?.error ?? NETWORK);
      setLocal(await extensionAutoSync("set", null).catch(() => null));
      toast.success("Aggiornamento automatico disattivato in questo browser");
      router.refresh();
    });
  }

  async function runNow() {
    setRunning(true);
    try {
      const state = await extensionAutoSync("run");
      setLocal(state);
      if (state.lastRun?.ok) toast.success(state.lastRun.message);
      else toast.error(state.lastRun?.message ?? "Aggiornamento non riuscito.");
      router.refresh();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setRunning(false);
    }
  }

  function toggleAlerts(on: boolean) {
    start(async () => {
      const result = await setKdpSalesAlerts(on).catch(() => null);
      if (!result?.ok) return void toast.error(result?.error ?? NETWORK);
      router.refresh();
    });
  }

  const enabled = status.filter((s) => s.enabledAt);

  return (
    <section
      className="flex flex-col gap-3 rounded-xl border p-5 text-sm"
      aria-label="Aggiornamento automatico"
      data-testid="autosync-panel"
    >
      <h2 className="flex items-center gap-2 text-base font-semibold">
        <TimerIcon className="size-4 text-muted-foreground" />
        Aggiornamento automatico e avvisi vendite
      </h2>
      <p className="text-muted-foreground">
        Ogni ora l&apos;estensione legge da sola i Report KDP degli ultimi giorni in una scheda
        nascosta, senza toglierti il focus, e l&apos;app ti scrive su Telegram le copie nuove. Va
        attivato in ogni browser (o profilo) collegato a un account KDP, e funziona finché quel
        browser resta aperto. KDP aggiorna i Report con qualche ora di ritardo.
      </p>

      {!version ? (
        <p className="text-muted-foreground">
          Installa l&apos;estensione (punti 1 e 2) per attivarlo.
        </p>
      ) : !supported ? (
        <p className="text-amber-700 dark:text-amber-400" data-testid="autosync-outdated">
          Serve l&apos;estensione {AUTOSYNC_VERSION} o successiva (questo browser ha la {version}):
          scarica lo zip e sostituisci i file nella cartella.
        </p>
      ) : local?.config ? (
        <div
          className="flex flex-col gap-2 rounded-lg bg-muted/50 p-3"
          data-testid="autosync-local"
        >
          <p>
            In questo browser: <strong>attivo per {local.config.label}</strong>.
            {local.lastRun
              ? ` Ultimo controllo ${when(local.lastRun.at)}: ${local.lastRun.message}.`
              : " Primo controllo entro un'ora."}
          </p>
          <div className="flex flex-wrap gap-2">
            <Button type="button" size="sm" variant="outline" onClick={runNow} disabled={running}>
              {running ? <Loader2Icon className="animate-spin" /> : <RefreshCwIcon />}
              Controlla ora
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={disable} disabled={pending}>
              Disattiva in questo browser
            </Button>
          </div>
        </div>
      ) : (
        <fieldset className="flex flex-col gap-2 rounded-lg bg-muted/50 p-3">
          <legend className="sr-only">Account di questo browser</legend>
          <p>Con quale account KDP sei collegato in questo browser?</p>
          <div className="flex flex-wrap gap-3">
            {KDP_ACCOUNTS.map((a) => (
              <label key={a.value} className="flex items-center gap-1.5">
                <input
                  type="radio"
                  name="autosync-account"
                  value={a.value}
                  checked={account === a.value}
                  onChange={() => setAccount(a.value)}
                />
                {a.label}
              </label>
            ))}
          </div>
          <Button
            type="button"
            size="sm"
            onClick={enable}
            disabled={pending}
            className="self-start"
          >
            Attiva in questo browser
          </Button>
        </fieldset>
      )}

      <div className="flex flex-col gap-1">
        <h3 className="font-medium">Account con l&apos;aggiornamento automatico</h3>
        {enabled.length === 0 ? (
          <p className="text-muted-foreground">Nessuno.</p>
        ) : (
          <ul className="flex flex-col gap-1" data-testid="autosync-accounts">
            {enabled.map((s) => (
              <li key={s.account}>
                <strong>{accountLabel(s.account)}</strong>:{" "}
                {s.lastRun ? (
                  <span className={s.lastRun.ok ? "" : "text-destructive"}>
                    {when(s.lastRun.at)}, {s.lastRun.message}
                  </span>
                ) : (
                  <span className="text-muted-foreground">nessun controllo ancora</span>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="flex items-start gap-2 border-t pt-3">
        <Checkbox
          id="sales-alerts"
          checked={alertsOn}
          disabled={pending}
          onCheckedChange={(checked) => toggleAlerts(checked === true)}
        />
        <div className="flex flex-col gap-0.5">
          <Label htmlFor="sales-alerts" className="flex items-center gap-1.5">
            <BellRingIcon className="size-3.5 text-muted-foreground" />
            Avvisami su Telegram delle vendite nuove
          </Label>
          <p className="text-xs text-muted-foreground">
            {botName ? (
              <>
                Scrive @{botName}, lo stesso bot del promemoria. Vale anche per gli aggiornamenti a
                mano.
              </>
            ) : (
              <>
                Nessun bot collegato: collegalo da{" "}
                <Link href="/robotti/da-fare" className="text-primary underline underline-offset-2">
                  Robotti &amp; Robotte → Da fare
                </Link>
                .
              </>
            )}
          </p>
        </div>
      </div>
    </section>
  );
}
