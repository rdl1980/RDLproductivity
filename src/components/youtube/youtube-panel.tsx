"use client";

import { RefreshCwIcon, UnlinkIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { refreshYouTubeMetrics, removeYouTubeKey, saveYouTubeKey } from "@/server/actions/youtube";
import type { YouTubeRun } from "@/server/youtube";

const NETWORK = "Errore di rete, riprova.";
const when = (iso: string) =>
  new Intl.DateTimeFormat("it-IT", { dateStyle: "short", timeStyle: "short" }).format(
    new Date(iso),
  );

/** YouTube Data API key and the daily numbers of the published videos. */
export function YouTubePanel({
  connected,
  lastRun,
}: {
  connected: boolean;
  lastRun: YouTubeRun | null;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [key, setKey] = useState("");

  const act = (
    run: () => Promise<{ ok: true; data?: unknown } | { ok: false; error: string } | null>,
    done: (data: unknown) => string,
  ) =>
    start(async () => {
      const result = await run().catch(() => null);
      if (!result?.ok) return void toast.error(result && !result.ok ? result.error : NETWORK);
      toast.success(done(result.data));
      setKey("");
      router.refresh();
    });

  return (
    <div className="flex flex-col gap-2 text-sm" data-testid="youtube-panel">
      <p className="text-muted-foreground">
        Ogni mattina alle 6 l&apos;app legge visualizzazioni, like e commenti dei video YouTube
        pubblicati (layer YouTube con il link del video) e li aggiunge alle rilevazioni della
        scheda. Serve una chiave gratuita delle API di YouTube.
      </p>
      {connected ? (
        <>
          <p data-testid="youtube-status">
            Chiave salvata.
            {lastRun
              ? ` Ultimo controllo ${when(lastRun.at)}: ${lastRun.message}.`
              : " Primo controllo domattina."}
          </p>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={pending}
              onClick={() => act(refreshYouTubeMetrics, (d) => (d as { message: string }).message)}
            >
              <RefreshCwIcon />
              Aggiorna ora
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              disabled={pending}
              onClick={() => act(removeYouTubeKey, () => "Chiave rimossa")}
            >
              <UnlinkIcon />
              Rimuovi la chiave
            </Button>
          </div>
        </>
      ) : (
        <form
          className="flex flex-col gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            act(
              () => saveYouTubeKey(key),
              () => "Chiave YouTube salvata",
            );
          }}
        >
          <ol className="list-decimal pl-4 text-muted-foreground">
            <li>Apri console.cloud.google.com, crea un progetto e attiva «YouTube Data API v3».</li>
            <li>In «Credenziali» crea una chiave API (puoi limitarla a YouTube Data API v3).</li>
            <li>Incollala qui: l&apos;app la prova prima di salvarla.</li>
          </ol>
          <Label htmlFor="youtube-key" className="sr-only">
            Chiave API YouTube
          </Label>
          <div className="flex flex-wrap gap-2">
            <Input
              id="youtube-key"
              value={key}
              onChange={(e) => setKey(e.target.value)}
              placeholder="AIza…"
              autoComplete="off"
              spellCheck={false}
              required
              className="w-full font-mono sm:w-96"
            />
            <Button type="submit" size="sm" disabled={pending || !key.trim()}>
              Salva
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}
