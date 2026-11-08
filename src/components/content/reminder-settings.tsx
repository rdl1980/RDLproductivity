"use client";

import { BellRingIcon, SendIcon, UnlinkIcon } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { REMINDER_HOUR } from "@/lib/content-reminder";
import { connectTelegram, disconnectTelegram, sendTestReminder } from "@/server/actions/telegram";
import type { ReminderStatus } from "@/server/content-reminder";

const NETWORK = "Errore di rete, riprova.";

/** Telegram reminder of the list: connect the bot, test it, disconnect it. */
export function ReminderSettings({
  status,
  title = "Promemoria Telegram",
  moreHref,
}: {
  status: ReminderStatus;
  title?: string;
  /** Where the bot's other settings are, when shown outside Integrazioni. */
  moreHref?: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [token, setToken] = useState("");

  function connect(event: React.FormEvent) {
    event.preventDefault();
    start(async () => {
      const result = await connectTelegram(token).catch(() => null);
      if (!result?.ok) return void toast.error(result?.error ?? NETWORK);
      setToken("");
      toast.success(`Bot @${result.data.botName} collegato`);
      router.refresh();
    });
  }

  function test() {
    start(async () => {
      const result = await sendTestReminder().catch(() => null);
      if (!result?.ok) return void toast.error(result?.error ?? NETWORK);
      toast.success(
        result.data.items ? `Inviato: ${result.data.items} voci` : "Inviato: niente da fare",
      );
    });
  }

  function disconnect() {
    start(async () => {
      const result = await disconnectTelegram().catch(() => null);
      if (!result?.ok) return void toast.error(result?.error ?? NETWORK);
      toast.success("Bot scollegato");
      router.refresh();
    });
  }

  return (
    <section
      aria-label={title}
      className="flex flex-col gap-2 rounded-xl border bg-card p-3 text-sm"
      data-testid="reminder-settings"
    >
      <h2 className="flex items-center gap-2 font-semibold">
        <BellRingIcon className="size-4 text-muted-foreground" />
        {title}
      </h2>
      {status.connected ? (
        <>
          <p className="text-muted-foreground">
            Ogni giorno alle {REMINDER_HOUR}:00 @{status.botName} ti scrive le voci di oggi e gli
            arretrati non ancora spuntati. Se non c&apos;è niente, non scrive.
            {status.lastSent
              ? ` Ultimo invio: ${status.lastSent.split("-").reverse().join("/")}.`
              : ""}
          </p>
          {!status.scheduled && (
            <p className="text-amber-700 dark:text-amber-400">
              L&apos;invio automatico non è ancora attivo sul database: chiedi a Claude di
              programmarlo.
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            <Button type="button" size="sm" variant="outline" disabled={pending} onClick={test}>
              <SendIcon />
              Invia ora una prova
            </Button>
            <Button type="button" size="sm" variant="ghost" disabled={pending} onClick={disconnect}>
              <UnlinkIcon />
              Scollega
            </Button>
          </div>
          {moreHref && (
            <p className="text-xs text-muted-foreground">
              Riepilogo vendite, allarmi KDP, comandi e cattura rapida:{" "}
              <Link href={moreHref} className="text-primary underline underline-offset-2">
                impostazioni del bot in Integrazioni
              </Link>
              .
            </p>
          )}
        </>
      ) : (
        <form onSubmit={connect} className="flex flex-col gap-2">
          <ol className="list-decimal pl-4 text-muted-foreground">
            <li>
              Su Telegram apri @BotFather, invia <code>/newbot</code> e scegli nome e username.
            </li>
            <li>Copia il token che ti dà e apri la chat col tuo bot: invia /start.</li>
            <li>Incolla qui il token e collega.</li>
          </ol>
          <Label htmlFor="telegram-token" className="sr-only">
            Token del bot
          </Label>
          <div className="flex flex-wrap gap-2">
            <Input
              id="telegram-token"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder="123456789:AAE…"
              autoComplete="off"
              spellCheck={false}
              required
              className="w-full font-mono sm:w-96"
            />
            <Button type="submit" size="sm" disabled={pending || !token.trim()}>
              Collega
            </Button>
          </div>
        </form>
      )}
    </section>
  );
}
