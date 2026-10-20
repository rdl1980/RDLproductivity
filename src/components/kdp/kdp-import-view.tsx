"use client";

import { UploadIcon } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";

import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { KDP_ACCOUNTS, type KdpAccount } from "@/lib/kdp";
import {
  decodeImportHash,
  type ImportPayload,
  importPayloadSchema,
  mainTitle,
} from "@/lib/kdp-books";
import { useIsClient } from "@/lib/use-is-client";
import { importKdpBooks } from "@/server/actions/kdp-books";

type State =
  | { kind: "loading" }
  | { kind: "empty" }
  | { kind: "invalid"; error: string }
  | { kind: "ready"; payload: ImportPayload };

function readHash(): State {
  if (!window.location.hash || window.location.hash === "#") return { kind: "empty" };
  try {
    const parsed = importPayloadSchema.safeParse(decodeImportHash(window.location.hash));
    if (!parsed.success) {
      return { kind: "invalid", error: parsed.error.issues[0]?.message ?? "Dati non validi." };
    }
    return { kind: "ready", payload: parsed.data };
  } catch {
    return { kind: "invalid", error: "Il link è incompleto o danneggiato." };
  }
}

export function KdpImportView() {
  const router = useRouter();
  // The fragment exists only in the browser: read it after hydration.
  const isClient = useIsClient();
  const state = useMemo<State>(() => (isClient ? readHash() : { kind: "loading" }), [isClient]);
  const [account, setAccount] = useState<KdpAccount>("main");
  const [pending, startTransition] = useTransition();

  function submit(payload: ImportPayload) {
    startTransition(async () => {
      const result = await importKdpBooks({ account, payload }).catch(() => null);
      if (!result?.ok) return void toast.error(result?.error ?? "Errore di rete, riprova.");
      const r = result.data;
      toast.success(
        `${r.created} nuovi e ${r.updated} aggiornati (${r.asins} ASIN). ` +
          `${r.confirmed} card collegate, ${r.suggested} abbinamenti da confermare.` +
          (r.tasks || r.cards
            ? ` ${r.tasks} uscite segnate nel calendario (Reale), ${r.cards} card aggiornate.`
            : ""),
      );
      // Drop the data from the URL so a reload does not import it again.
      window.history.replaceState(null, "", window.location.pathname);
      router.push("/kdp/libri");
    });
  }

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-5 p-4 sm:p-6">
      <PageHeader icon={UploadIcon} title="Importa libri KDP" />
      {state.kind === "loading" && <p className="text-sm text-muted-foreground">Lettura…</p>}
      {(state.kind === "empty" || state.kind === "invalid") && (
        <div className="flex flex-col gap-2 rounded-xl border border-dashed p-6 text-sm">
          <p>
            {state.kind === "invalid"
              ? `Impossibile leggere i dati: ${state.error}`
              : "Nessun dato da importare."}
          </p>
          <p className="text-muted-foreground">
            Apri il Bookshelf di KDP e usa il preferito «Importa da KDP» (istruzioni in{" "}
            <Link href="/kdp/libri" className="text-primary hover:underline">
              Libri KDP → Aggiorna da KDP
            </Link>
            ).
          </p>
        </div>
      )}
      {state.kind === "ready" && (
        <form
          className="flex flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            submit(state.payload);
          }}
        >
          <p className="text-sm">
            Trovati <strong>{state.payload.books.length}</strong> libri con{" "}
            <strong>
              {state.payload.books.reduce((n, b) => n + b.formats.filter((f) => f.asin).length, 0)}
            </strong>{" "}
            ASIN.
          </p>
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1 text-sm font-medium">
              Di quale account è questo Bookshelf?
            </legend>
            {KDP_ACCOUNTS.map(({ value, label }) => (
              <label key={value} className="flex items-center gap-2 text-sm">
                <input
                  type="radio"
                  name="account"
                  value={value}
                  checked={account === value}
                  onChange={() => setAccount(value)}
                  className="size-4 accent-primary"
                />
                {label}
              </label>
            ))}
          </fieldset>
          <p className="text-xs text-muted-foreground">
            I libri di questo account non presenti nell&apos;elenco verranno segnati come «non più
            presenti», non eliminati.
          </p>
          <details className="text-sm">
            <summary className="cursor-pointer font-medium">Elenco dei titoli</summary>
            <ul className="mt-2 flex max-h-72 list-disc flex-col gap-0.5 overflow-y-auto pl-5">
              {state.payload.books.map((book) => (
                <li key={book.kdpId}>
                  {mainTitle(book.title)}{" "}
                  <span className="font-mono text-xs text-muted-foreground">
                    {book.formats.flatMap((f) => (f.asin ? [f.asin] : [])).join(" ")}
                  </span>
                </li>
              ))}
            </ul>
          </details>
          <div className="flex gap-2">
            <Button type="submit" disabled={pending}>
              {pending ? "Importazione…" : "Importa"}
            </Button>
            <Button asChild variant="outline">
              <Link href="/kdp/libri">Annulla</Link>
            </Button>
          </div>
        </form>
      )}
    </main>
  );
}
