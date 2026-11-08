"use client";

import { MessageSquareTextIcon, SendIcon, TerminalIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { AnomalyThresholds } from "@/lib/kdp-digest";
import {
  enableTelegramCommands,
  sendTestSummary,
  setTelegramCaptureList,
  setTelegramJob,
  setTelegramThresholds,
} from "@/server/actions/telegram";
import type { TelegramJob, TelegramSettings } from "@/server/telegram-settings";

const NETWORK = "Errore di rete, riprova.";
const NONE = "__none__";

export type CaptureBoard = { id: string; title: string; lists: { id: string; title: string }[] };

const JOB_LABELS: Record<TelegramJob, { label: string; help: string }> = {
  reminder: {
    label: "Promemoria «Da fare» alle 11:00",
    help: "Le voci di Robotti & Robotte di oggi e quelle arretrate.",
  },
  summary: {
    label: "Riepilogo vendite KDP alle 21:00",
    help: "Copie e royalty del giorno per account, confronto con la settimana prima, mese e libro migliore.",
  },
  anomalies: {
    label: "Allarmi KDP alle 9:00",
    help: "Libri fermi, KENP in calo, Ads che spendono senza vendite. Lo stesso allarme non si ripete per una settimana.",
  },
  sales: {
    label: "Avviso a ogni vendita nuova",
    help: "Quando un aggiornamento (a mano o automatico) porta copie in più.",
  },
  reviews: {
    label: "Avviso valutazioni nuove su Amazon",
    help: "Quando il controllo giornaliero dell'estensione trova più valutazioni di prima.",
  },
};

const THRESHOLD_FIELDS: { key: keyof AnomalyThresholds; label: string; suffix: string }[] = [
  { key: "stallDays", label: "Libro fermo dopo", suffix: "giorni senza copie" },
  { key: "stallMinUnits", label: "…se nei 30 giorni prima ha venduto almeno", suffix: "copie" },
  { key: "kenpDropPct", label: "KENP in calo di almeno", suffix: "% sulla settimana prima" },
  { key: "adSpendEur", label: "Ads: spesa oltre", suffix: "€ in 7 giorni senza copie" },
];

/** The bot's messages, commands and quick capture, in Integrazioni. */
export function TelegramPanel({
  settings,
  boards,
  botName,
}: {
  settings: TelegramSettings;
  boards: CaptureBoard[];
  botName: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [thresholds, setThresholds] = useState(settings.thresholds);

  const act = (run: () => Promise<{ ok: boolean; error?: string } | null>, done?: string) =>
    start(async () => {
      const result = await run().catch(() => null);
      if (!result?.ok) return void toast.error(result?.error ?? NETWORK);
      if (done) toast.success(done);
      router.refresh();
    });

  return (
    <div className="flex flex-col gap-4 text-sm" data-testid="telegram-panel">
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 font-semibold">Messaggi automatici</legend>
        {(Object.keys(JOB_LABELS) as TelegramJob[]).map((job) => (
          <div key={job} className="flex items-start gap-2">
            <Checkbox
              id={`job-${job}`}
              checked={settings.jobs[job]}
              disabled={pending}
              onCheckedChange={(checked) => act(() => setTelegramJob(job, checked === true))}
            />
            <div className="flex flex-col">
              <Label htmlFor={`job-${job}`}>{JOB_LABELS[job].label}</Label>
              <span className="text-xs text-muted-foreground">{JOB_LABELS[job].help}</span>
            </div>
          </div>
        ))}
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="self-start"
          disabled={pending}
          onClick={() => act(sendTestSummary, "Riepilogo inviato")}
        >
          <SendIcon />
          Invia ora il riepilogo di oggi
        </Button>
      </fieldset>

      <form
        className="flex flex-col gap-2"
        aria-label="Soglie degli allarmi"
        onSubmit={(e) => {
          e.preventDefault();
          act(() => setTelegramThresholds(thresholds), "Soglie salvate");
        }}
      >
        <h3 className="font-semibold">Soglie degli allarmi</h3>
        <div className="grid gap-2 sm:grid-cols-2">
          {THRESHOLD_FIELDS.map((f) => (
            <label key={f.key} className="flex flex-col gap-1">
              <span className="text-xs text-muted-foreground">{f.label}</span>
              <span className="flex items-center gap-2">
                <Input
                  type="number"
                  min={1}
                  step={f.key === "adSpendEur" ? 0.5 : 1}
                  value={thresholds[f.key]}
                  onChange={(e) =>
                    setThresholds((t) => ({ ...t, [f.key]: Number(e.target.value) }))
                  }
                  className="w-24"
                  aria-label={`${f.label} (${f.suffix})`}
                />
                <span className="text-xs text-muted-foreground">{f.suffix}</span>
              </span>
            </label>
          ))}
        </div>
        <Button type="submit" size="sm" variant="outline" disabled={pending} className="self-start">
          Salva soglie
        </Button>
      </form>

      <section className="flex flex-col gap-2" aria-label="Comandi">
        <h3 className="flex items-center gap-2 font-semibold">
          <TerminalIcon className="size-4 text-muted-foreground" />
          Comandi
        </h3>
        <p className="text-muted-foreground">
          Scrivi a @{botName}: <code>/oggi</code> scadenze e «Da fare», <code>/vendite</code> copie
          e royalty di oggi, ieri e del mese, <code>/fatto ep001</code> segna fatte le voci di una
          scheda, <code>/aiuto</code> l&apos;elenco.
        </p>
        {settings.commands ? (
          <p className="text-xs text-emerald-700 dark:text-emerald-400" data-testid="commands-on">
            Comandi attivi.
          </p>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-amber-700 dark:text-amber-400">
              Comandi non ancora attivi.
            </span>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={pending}
              onClick={() => act(enableTelegramCommands, "Comandi attivi")}
            >
              Attiva i comandi
            </Button>
          </div>
        )}
      </section>

      <section className="flex flex-col gap-2" aria-label="Cattura rapida">
        <h3 className="flex items-center gap-2 font-semibold">
          <MessageSquareTextIcon className="size-4 text-muted-foreground" />
          Cattura rapida
        </h3>
        <p className="text-muted-foreground">
          Ogni messaggio che non è un comando diventa una card in questa lista: la prima riga è il
          titolo, il resto la descrizione.
        </p>
        <Select
          value={settings.captureListId ?? NONE}
          disabled={pending}
          onValueChange={(value) =>
            act(() => setTelegramCaptureList(value === NONE ? null : value), "Lista salvata")
          }
        >
          <SelectTrigger className="w-full sm:w-96" aria-label="Lista della cattura rapida">
            <SelectValue placeholder="Scegli una lista" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NONE}>Nessuna (cattura spenta)</SelectItem>
            {boards.map((board) => (
              <SelectGroup key={board.id}>
                <SelectLabel>{board.title}</SelectLabel>
                {board.lists.map((list) => (
                  <SelectItem key={list.id} value={list.id}>
                    {board.title} → {list.title}
                  </SelectItem>
                ))}
              </SelectGroup>
            ))}
          </SelectContent>
        </Select>
      </section>
    </div>
  );
}
