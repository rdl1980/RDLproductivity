"use client";

import { CloudUploadIcon, DownloadIcon, UnlinkIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { disconnectGoogleDrive, runBackupNow } from "@/server/actions/backup";
import type { BackupRun } from "@/server/backup-job";

const NETWORK = "Errore di rete, riprova.";
const when = (iso: string) =>
  new Intl.DateTimeFormat("it-IT", { dateStyle: "short", timeStyle: "short" }).format(
    new Date(iso),
  );

/** Full backup: download now, or weekly on the owner's Google Drive. */
export function BackupPanel({
  connected,
  driveEmail,
  lastRun,
  googleConfigured,
  redirectUri,
  notice,
}: {
  connected: boolean;
  driveEmail: string | null;
  lastRun: BackupRun | null;
  /** The Google login client exists (AUTH_GOOGLE_ID). */
  googleConfigured: boolean;
  redirectUri: string;
  /** Outcome of the Drive consent (?drive=…). */
  notice: string | null;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();

  function now() {
    start(async () => {
      const result = await runBackupNow().catch(() => null);
      if (!result?.ok) toast.error(result && !result.ok ? result.error : NETWORK);
      else toast.success(result.data.message);
      router.refresh();
    });
  }

  function disconnect() {
    start(async () => {
      const result = await disconnectGoogleDrive().catch(() => null);
      if (!result?.ok) return void toast.error(NETWORK);
      toast.success("Google Drive scollegato");
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-3 text-sm" data-testid="backup-panel">
      <p className="text-muted-foreground">
        Tutto il database in uno zip (un file JSON per tabella): board, KDP, contenuti, storico.
        Restano fuori le credenziali (token del bot, chiavi API, accessi di Claude); gli allegati
        sono elencati, non copiati.
      </p>
      <Button asChild variant="outline" size="sm" className="self-start">
        <a href="/api/backup" download>
          <DownloadIcon />
          Scarica il backup completo
        </a>
      </Button>

      {notice === "ok" && (
        <p className="text-emerald-700 dark:text-emerald-400">Google Drive collegato.</p>
      )}
      {notice && notice !== "ok" && (
        <p className="text-destructive" data-testid="drive-error">
          {notice === "noclient"
            ? "Il login Google non è configurato in questa installazione."
            : `Collegamento a Drive non riuscito: ${notice}`}
        </p>
      )}

      <h3 className="font-semibold">Backup settimanale su Google Drive</h3>
      {connected ? (
        <>
          <p data-testid="drive-status">
            Collegato{driveEmail ? ` a ${driveEmail}` : ""}: ogni domenica alle 3 lo zip va nella
            cartella «RDL Productivity backup» (restano gli ultimi 12).
            {lastRun
              ? ` Ultimo backup ${when(lastRun.at)}: ${lastRun.ok ? "" : "non riuscito, "}${lastRun.message}.`
              : ""}
          </p>
          <div className="flex flex-wrap gap-2">
            <Button type="button" size="sm" variant="outline" onClick={now} disabled={pending}>
              <CloudUploadIcon />
              Fai un backup ora
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={disconnect} disabled={pending}>
              <UnlinkIcon />
              Scollega Drive
            </Button>
          </div>
        </>
      ) : googleConfigured ? (
        <>
          <p className="text-muted-foreground">
            L&apos;app chiede il permesso solo sui file che crea lei (non vede il resto del tuo
            Drive). Prima, nella console Google Cloud, aggiungi agli «URI di reindirizzamento
            autorizzati» del client OAuth usato per il login:
          </p>
          <code className="w-fit max-w-full rounded-md border bg-muted px-3 py-1.5 text-xs break-all select-all">
            {redirectUri}
          </code>
          <Button asChild size="sm" className="self-start">
            <a href="/api/google-drive/connect">Collega Google Drive</a>
          </Button>
        </>
      ) : (
        <p className="text-muted-foreground">
          Serve il login Google dell&apos;app (variabili AUTH_GOOGLE_ID e AUTH_GOOGLE_SECRET su
          Vercel): intanto usa il download.
        </p>
      )}
    </div>
  );
}
