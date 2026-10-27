import { PuzzleIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { KdpTabs } from "@/components/kdp/kdp-tabs";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { requireSession } from "@/server/session";

export const metadata: Metadata = { title: "Estensione KDP · RDL Productivity" };

const CHROMIUM = "Chrome, Edge, Brave, Vivaldi, Opera o Comet";

export default async function ExtensionPage() {
  await requireSession();
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-5 p-4 sm:p-6">
      <PageHeader
        icon={PuzzleIcon}
        title="Estensione «RDL KDP Sync»"
        description="Aggiorna libri e vendite con un clic da Vendite → Aggiorna dati o da Libri → Aggiorna da KDP. Legge le pagine di KDP in schede nascoste del browser in cui sei collegato: l'app non conosce la tua password."
      />
      <KdpTabs current="books" />

      <section className="flex flex-col gap-3 rounded-xl border p-5 text-sm">
        <h2 className="text-base font-semibold">1. Scarica</h2>
        <div className="flex flex-wrap gap-2">
          <Button asChild>
            <a href="/extension/rdl-kdp-sync-chromium.zip" download>
              Per {CHROMIUM}
            </a>
          </Button>
          <Button asChild variant="outline">
            <a href="/extension/rdl-kdp-sync-firefox.zip" download>
              Per Firefox
            </a>
          </Button>
        </div>
        <p className="text-muted-foreground">Estrai lo zip in una cartella che non sposterai.</p>
      </section>

      <section className="flex flex-col gap-3 rounded-xl border p-5 text-sm">
        <h2 className="text-base font-semibold">2. Installa in {CHROMIUM}</h2>
        <ol className="flex list-decimal flex-col gap-1.5 pl-5">
          <li>
            Apri <code className="rounded bg-muted px-1">chrome://extensions</code> (in Edge{" "}
            <code className="rounded bg-muted px-1">edge://extensions</code>, in Opera{" "}
            <code className="rounded bg-muted px-1">opera://extensions</code>, in Vivaldi{" "}
            <code className="rounded bg-muted px-1">vivaldi://extensions</code>).
          </li>
          <li>Attiva «Modalità sviluppatore» in alto a destra.</li>
          <li>«Carica estensione non pacchettizzata» e scegli la cartella estratta.</li>
          <li>Ricarica questa app: nei dialog di aggiornamento compare «Estensione attiva».</li>
        </ol>
        <p className="text-muted-foreground">
          All&apos;avvio il browser può ricordarti che hai estensioni in modalità sviluppatore:
          chiudi l&apos;avviso. Per aggiornare l&apos;estensione, sostituisci i file nella cartella
          e premi «Ricarica» nella pagina delle estensioni.
        </p>
      </section>

      <section className="flex flex-col gap-3 rounded-xl border p-5 text-sm">
        <h2 className="text-base font-semibold">2 bis. Installa in Firefox</h2>
        <ol className="flex list-decimal flex-col gap-1.5 pl-5">
          <li>
            Apri{" "}
            <code className="rounded bg-muted px-1">about:debugging#/runtime/this-firefox</code> e
            scegli «Carica componente aggiuntivo temporaneo…», poi il file{" "}
            <code className="rounded bg-muted px-1">manifest.json</code> nella cartella estratta.
          </li>
          <li>
            In <code className="rounded bg-muted px-1">about:addons</code>, scheda «Permessi»
            dell&apos;estensione, consenti l&apos;accesso a kdp.amazon.com e kdpreports.amazon.com.
          </li>
        </ol>
        <p className="text-muted-foreground">
          Firefox rimuove le estensioni temporanee alla chiusura: va ricaricata a ogni avvio. Per
          un&apos;installazione stabile serve la firma gratuita di Mozilla (addons.mozilla.org,
          «Distribuisci tu stesso»), che produce un file .xpi installabile una volta per tutte.
        </p>
      </section>

      <section className="flex flex-col gap-3 rounded-xl border p-5 text-sm">
        <h2 className="text-base font-semibold">3. Due account, due browser</h2>
        <p>
          L&apos;estensione usa la sessione KDP del browser (o del profilo) in cui è installata.
          Tieni l&apos;account principale in un browser e il secondario in un altro, o in un secondo
          profilo di Chrome, installa l&apos;estensione in entrambi e in ciascuno scegli
          l&apos;account nel dialog di aggiornamento: niente più login e logout.
        </p>
        <p className="text-muted-foreground">
          Se KDP chiede di accedere, l&apos;estensione lascia aperta la scheda del login: entra e
          riprova. I preferiti «RDL KDP» continuano a funzionare come alternativa.
        </p>
      </section>

      <p className="text-sm">
        <Link href="/kdp/vendite" className="text-primary hover:underline">
          Torna alle vendite
        </Link>
      </p>
    </main>
  );
}
