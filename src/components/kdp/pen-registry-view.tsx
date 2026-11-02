"use client";

import { ContactIcon, ExternalLinkIcon, MailIcon, PenLineIcon, PlusIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { BookFormats } from "@/components/kdp/book-formats";
import { KdpTabs } from "@/components/kdp/kdp-tabs";
import { PenTabs } from "@/components/kdp/pen-tabs";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { accountLabel } from "@/lib/kdp";
import { PEN_PROFILE_FIELDS, type RegistryEntry } from "@/lib/kdp-pen-names";
import { NO_PEN_NAME } from "@/lib/kdp-sales";
import { savePenName } from "@/server/actions/kdp-pen-names";

type Field = (typeof PEN_PROFILE_FIELDS)[number];

const FIELDS: { key: Field; label: string; placeholder?: string; long?: boolean }[] = [
  { key: "owner", label: "Titolare", placeholder: "Persona o società dietro il nome" },
  { key: "email", label: "Email di contatto", placeholder: "nome@dominio.it" },
  { key: "website", label: "Sito internet", placeholder: "https://…" },
  {
    key: "amazonUrl",
    label: "Pagina autore Amazon",
    placeholder: "https://www.amazon.it/stores/…",
  },
  { key: "instagram", label: "Instagram", placeholder: "@nome o link" },
  { key: "facebook", label: "Facebook", placeholder: "Pagina o link" },
  { key: "tiktok", label: "TikTok", placeholder: "@nome o link" },
  { key: "languages", label: "Lingue", placeholder: "IT, ES" },
  { key: "genres", label: "Generi", placeholder: "Gialli, agende, ragazzi…" },
  { key: "bio", label: "Bio", long: true },
  { key: "notes", label: "Note", long: true },
];

const link = (value: string) => (/^https?:\/\//i.test(value) ? value : null);

export function PenRegistryView({ registry }: { registry: RegistryEntry[] }) {
  const [query, setQuery] = useState("");
  // The open entry: a name from the registry, or "" for a new pen name.
  const [open, setOpen] = useState<string | null>(null);
  const needle = query.trim().toLowerCase();
  const shown = registry.filter(
    (e) =>
      !needle ||
      [e.name, e.profile?.owner, e.profile?.email, e.profile?.genres]
        .filter(Boolean)
        .some((v) => v!.toLowerCase().includes(needle)),
  );
  const current = open === null ? null : (registry.find((e) => e.name === open) ?? null);

  return (
    <main className="mx-auto flex w-full max-w-7xl flex-col gap-5 p-4 sm:p-6">
      <PageHeader
        icon={PenLineIcon}
        title="Pen name"
        description="Anagrafica dei pen name: contatti, profili e i libri pubblicati con ciascun nome."
      />
      <KdpTabs current="pens" />
      <PenTabs current="registry" />

      <div className="flex flex-wrap items-center gap-2">
        <Input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Cerca per nome, titolare, email o genere"
          aria-label="Cerca pen name"
          className="w-full sm:w-80"
        />
        <Button type="button" onClick={() => setOpen("")} className="sm:ml-auto">
          <PlusIcon />
          Nuovo pen name
        </Button>
      </div>

      {shown.length === 0 ? (
        <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">
          {registry.length === 0
            ? "Nessun pen name: si leggono dalla riga «di …» della Bookshelf, oppure aggiungine uno."
            : "Nessun pen name corrisponde alla ricerca."}
        </p>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3" data-testid="pen-registry">
          {shown.map((entry) => (
            <li key={entry.name}>
              <button
                type="button"
                onClick={() => setOpen(entry.name)}
                data-testid="pen-card"
                className="flex h-full w-full flex-col gap-2 rounded-xl border p-4 text-left transition-colors hover:bg-muted/50 focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
              >
                <span className="flex items-start justify-between gap-2">
                  <span
                    className={
                      entry.name === NO_PEN_NAME
                        ? "font-semibold text-muted-foreground italic"
                        : "font-semibold"
                    }
                  >
                    {entry.name}
                  </span>
                  <span className="shrink-0 rounded-md bg-muted px-1.5 py-0.5 text-xs tabular-nums">
                    {entry.published}/{entry.books.length} pubblicati
                  </span>
                </span>
                {entry.profile?.owner && (
                  <span className="text-xs text-muted-foreground">{entry.profile.owner}</span>
                )}
                <span className="flex flex-col gap-0.5 text-sm">
                  {entry.profile?.website && (
                    <span className="flex items-center gap-1.5 truncate">
                      <ExternalLinkIcon className="size-3.5 shrink-0 text-muted-foreground" />
                      {entry.profile.website.replace(/^https?:\/\//, "")}
                    </span>
                  )}
                  {entry.profile?.email && (
                    <span className="flex items-center gap-1.5 truncate">
                      <MailIcon className="size-3.5 shrink-0 text-muted-foreground" />
                      {entry.profile.email}
                    </span>
                  )}
                  {!entry.profile && entry.name !== NO_PEN_NAME && (
                    <span className="text-xs text-muted-foreground">
                      Nessun dato: clic per completare l&apos;anagrafica.
                    </span>
                  )}
                </span>
                <span className="mt-auto text-xs text-muted-foreground">
                  {entry.accounts.map(accountLabel).join(", ") || "Nessun libro"}
                  {entry.profile?.languages ? ` · ${entry.profile.languages}` : ""}
                  {entry.profile?.genres ? ` · ${entry.profile.genres}` : ""}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      <PenDialog
        key={open ?? "closed"}
        open={open !== null}
        entry={current}
        onOpenChange={(value) => !value && setOpen(null)}
        onCreated={(name) => setOpen(name)}
      />
    </main>
  );
}

function PenDialog({
  open,
  entry,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  /** Null for a new pen name. */
  entry: RegistryEntry | null;
  onOpenChange: (open: boolean) => void;
  onCreated: (name: string) => void;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const editable = entry === null || entry.name !== NO_PEN_NAME;
  const published =
    entry?.books.filter((b) => !b.missing && b.formats.some((f) => f.status === "live")) ?? [];
  const others = entry?.books.filter((b) => !published.includes(b)) ?? [];

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const input = Object.fromEntries([
      ["name", entry?.name ?? String(form.get("name") ?? "")],
      ...FIELDS.map((f) => [f.key, String(form.get(f.key) ?? "")]),
    ]);
    start(async () => {
      const result = await savePenName(input).catch(() => null);
      if (!result?.ok) {
        toast.error(result?.error ?? "Errore di rete, riprova.");
        return;
      }
      toast.success("Anagrafica salvata");
      router.refresh();
      if (!entry) onCreated(result.data.name);
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl" data-testid="pen-dialog">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ContactIcon className="size-5 text-muted-foreground" />
            {entry?.name ?? "Nuovo pen name"}
          </DialogTitle>
          <DialogDescription>
            {entry
              ? `${entry.published} libri pubblicati su ${entry.books.length}${
                  entry.accounts.length ? ` · ${entry.accounts.map(accountLabel).join(", ")}` : ""
                }`
              : "Il nome va scritto come appare sui libri, così i libri vi si collegano."}
          </DialogDescription>
        </DialogHeader>

        {editable ? (
          <form onSubmit={submit} className="flex flex-col gap-3" aria-label="Anagrafica">
            {!entry && (
              <div className="flex flex-col gap-1">
                <Label htmlFor="pen-name">Pen name</Label>
                <Input id="pen-name" name="name" required maxLength={200} autoFocus />
              </div>
            )}
            <div className="grid gap-3 sm:grid-cols-2">
              {FIELDS.map((f) => {
                const value = entry?.profile?.[f.key] ?? "";
                const href = f.key === "email" && value ? `mailto:${value}` : link(value);
                return (
                  <div
                    key={f.key}
                    className={f.long ? "flex flex-col gap-1 sm:col-span-2" : "flex flex-col gap-1"}
                  >
                    <Label htmlFor={`pen-${f.key}`} className="flex items-center gap-1.5">
                      {f.label}
                      {href && (
                        <a
                          href={href}
                          target="_blank"
                          rel="noreferrer"
                          className="text-primary"
                          aria-label={`Apri ${f.label}`}
                        >
                          <ExternalLinkIcon className="size-3.5" />
                        </a>
                      )}
                    </Label>
                    {f.long ? (
                      <Textarea
                        id={`pen-${f.key}`}
                        name={f.key}
                        defaultValue={value}
                        rows={3}
                        maxLength={5000}
                      />
                    ) : (
                      <Input
                        id={`pen-${f.key}`}
                        name={f.key}
                        defaultValue={value}
                        placeholder={f.placeholder}
                        type={f.key === "email" ? "email" : "text"}
                        maxLength={500}
                      />
                    )}
                  </div>
                );
              })}
            </div>
            <Button type="submit" disabled={pending} className="self-start">
              Salva anagrafica
            </Button>
          </form>
        ) : (
          <p className="text-sm text-muted-foreground">
            Libri importati prima che l&apos;import leggesse l&apos;autore: aggiorna i libri dalla
            Bookshelf per assegnarli al loro pen name.
          </p>
        )}

        {entry && (
          <section aria-label="Libri pubblicati" className="flex flex-col gap-2 border-t pt-3">
            <h3 className="font-semibold">Libri pubblicati ({published.length})</h3>
            {published.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nessun libro online.</p>
            ) : (
              <ul className="flex flex-col gap-3" data-testid="pen-books-published">
                {published.map((book) => (
                  <li
                    key={book.id}
                    className="rounded-lg border p-3"
                    data-testid="pen-registry-book"
                  >
                    <p className="font-medium">{book.title}</p>
                    <p className="mb-1.5 text-xs text-muted-foreground">
                      {accountLabel(book.account)}
                      {book.series ? ` · ${book.series}` : ""}
                    </p>
                    <BookFormats formats={book.formats} />
                  </li>
                ))}
              </ul>
            )}
            {others.length > 0 && (
              <details className="text-sm">
                <summary className="cursor-pointer text-muted-foreground">
                  Non pubblicati o non più sul Bookshelf ({others.length})
                </summary>
                <ul className="mt-2 flex flex-col gap-3">
                  {others.map((book) => (
                    <li key={book.id} className="rounded-lg border p-3">
                      <p className="font-medium">{book.title}</p>
                      <p className="mb-1.5 text-xs text-muted-foreground">
                        {accountLabel(book.account)}
                        {book.missing ? " · non più sul Bookshelf" : ""}
                      </p>
                      <BookFormats formats={book.formats} />
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </section>
        )}
      </DialogContent>
    </Dialog>
  );
}
