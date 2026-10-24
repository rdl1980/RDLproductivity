"use client";

import {
  CheckIcon,
  LibraryIcon,
  Link2Icon,
  RefreshCwIcon,
  SearchIcon,
  SparklesIcon,
  UploadIcon,
  XIcon,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState, useTransition } from "react";
import { toast } from "sonner";

import { LocalDateTime } from "@/components/local-date-time";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { accountLabel, KDP_ACCOUNTS, type KdpAccount } from "@/lib/kdp";
import { bookmarkletHref, scraperSource } from "@/lib/kdp-bookmarklet";
import { BookmarkletStep } from "@/components/kdp/bookmarklet-step";
import { type KdpBookItem, type KdpBookLinkItem, mainTitle, normalize } from "@/lib/kdp-books";
import { cn } from "@/lib/utils";
import {
  findLinkableCards,
  type LinkableCard,
  refreshKdpSuggestions,
  setKdpBookLink,
} from "@/server/actions/kdp-books";
import type { ActionResult } from "@/server/actions/result";

import { BookFormats } from "./book-formats";
import { KdpTabs } from "./kdp-tabs";

const NETWORK_ERROR = "Errore di rete, modifica annullata.";

type Props = { books: KdpBookItem[]; origin: string };
type LinkCard = KdpBookLinkItem["card"];

const cardHref = (card: { id: string; boardId: string }) =>
  `/boards/${card.boardId}?card=${card.id}`;

/** Replaces (or removes, with `null`) the link between a book and a card. */
function withLink(
  books: KdpBookItem[],
  bookId: string,
  cardId: string,
  link: KdpBookLinkItem | null,
): KdpBookItem[] {
  return books.map((book) => {
    if (book.id !== bookId) return book;
    const others = book.links.filter((l) => l.card.id !== cardId);
    return { ...book, links: link ? [...others, link] : others };
  });
}

export function KdpBooksView({ books: initialBooks, origin }: Props) {
  // Local copy for optimistic changes; reset when the server sends new data.
  const [source, setSource] = useState(initialBooks);
  const [books, setBooks] = useState(initialBooks);
  if (source !== initialBooks) {
    setSource(initialBooks);
    setBooks(initialBooks);
  }
  const [query, setQuery] = useState("");
  const [account, setAccount] = useState<KdpAccount | "all">("all");
  const [unlinkedOnly, setUnlinkedOnly] = useState(false);
  const [syncOpen, setSyncOpen] = useState(false);
  const [linkingBook, setLinkingBook] = useState<KdpBookItem | null>(null);
  const [refreshing, startRefresh] = useTransition();

  async function changeLink(book: KdpBookItem, card: LinkCard, status: "confirmed" | "rejected") {
    const previous = book.links.find((l) => l.card.id === card.id) ?? null;
    const next: KdpBookLinkItem | null =
      status === "confirmed"
        ? {
            id: previous?.id ?? `temp-${card.id}`,
            status: "confirmed",
            auto: false,
            score: previous?.score ?? 0,
            card,
          }
        : null;
    setBooks((current) => withLink(current, book.id, card.id, next));
    const result = await setKdpBookLink({ bookId: book.id, cardId: card.id, status }).catch(
      (): ActionResult => ({ ok: false, error: NETWORK_ERROR }),
    );
    if (!result.ok) {
      setBooks((current) => withLink(current, book.id, card.id, previous));
      toast.error(result.error);
    }
  }

  function refresh() {
    startRefresh(async () => {
      const result = await refreshKdpSuggestions().catch(() => null);
      if (!result?.ok) return void toast.error(result?.error ?? NETWORK_ERROR);
      toast.success(
        `${result.data.confirmed} collegamenti automatici, ${result.data.suggested} da confermare`,
      );
    });
  }

  // Suggestions grouped by card, cards in title order.
  const suggestions = useMemo(() => {
    const byCard = new Map<string, { card: LinkCard; options: KdpBookItem[] }>();
    for (const book of books) {
      for (const link of book.links) {
        if (link.status !== "suggested") continue;
        const entry = byCard.get(link.card.id) ?? { card: link.card, options: [] };
        entry.options.push(book);
        byCard.set(link.card.id, entry);
      }
    }
    return [...byCard.values()].sort((a, b) => a.card.title.localeCompare(b.card.title, "it"));
  }, [books]);

  const visible = useMemo(() => {
    const needle = normalize(query);
    return books.filter((book) => {
      if (account !== "all" && book.account !== account) return false;
      if (unlinkedOnly && book.links.some((l) => l.status === "confirmed")) return false;
      if (!needle) return true;
      return (
        normalize(`${book.title} ${book.series ?? ""}`).includes(needle) ||
        book.formats.some((f) => f.asin?.toLowerCase().includes(needle))
      );
    });
  }, [books, query, account, unlinkedOnly]);

  const lastImport = (value: KdpAccount) =>
    books
      .filter((book) => book.account === value)
      .reduce<string | null>(
        (max, book) => (!max || book.importedAt > max ? book.importedAt : max),
        null,
      );

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-5 p-4 sm:p-6">
      <PageHeader
        icon={LibraryIcon}
        title="Libri KDP"
        description="Titoli, formati e ASIN importati dal Bookshelf di KDP, collegati alle card delle board."
        actions={
          <>
            <Button variant="outline" onClick={refresh} disabled={refreshing || books.length === 0}>
              <RefreshCwIcon className={cn(refreshing && "animate-spin")} />
              Ricalcola abbinamenti
            </Button>
            <Button onClick={() => setSyncOpen(true)}>
              <UploadIcon />
              Aggiorna da KDP
            </Button>
          </>
        }
      />
      <KdpTabs current="books" badge={suggestions.length} />

      <p className="text-sm text-muted-foreground">
        {KDP_ACCOUNTS.map(({ value, label }) => {
          const last = lastImport(value);
          return (
            <span key={value} className="mr-4 inline-block">
              {label}:{" "}
              {last ? (
                <>
                  aggiornato <LocalDateTime value={new Date(last)} />
                </>
              ) : (
                "mai importato"
              )}
            </span>
          );
        })}
      </p>

      {suggestions.length > 0 && (
        <section
          aria-labelledby="kdp-suggestions"
          className="flex flex-col gap-3 rounded-xl border border-amber-300/60 bg-amber-50/60 p-4 dark:border-amber-400/30 dark:bg-amber-400/5"
          data-testid="kdp-suggestions"
        >
          <h2 id="kdp-suggestions" className="flex items-center gap-2 font-semibold">
            <SparklesIcon className="size-4" />
            Abbinamenti da confermare ({suggestions.length})
          </h2>
          <p className="text-sm text-muted-foreground">
            Non sono sicuro di questi abbinamenti: conferma quelli giusti, scarta gli altri. Gli
            scartati non verranno più proposti.
          </p>
          <ul className="flex flex-col gap-3">
            {suggestions.map(({ card, options }) => (
              <li key={card.id} className="rounded-lg bg-background p-3 shadow-card">
                <Link href={cardHref(card)} className="font-medium hover:underline">
                  {card.title}
                </Link>
                <span className="ml-2 text-xs text-muted-foreground">
                  {card.boardTitle} · {card.listTitle}
                </span>
                <ul className="mt-2 flex flex-col gap-1.5">
                  {options.map((book) => (
                    <li key={book.id} className="flex flex-wrap items-center gap-2 text-sm">
                      <span className="min-w-0 flex-1">
                        <span className="font-medium">{mainTitle(book.title)}</span>{" "}
                        <span className="text-xs text-muted-foreground">
                          {[
                            ...new Set(book.formats.flatMap((f) => (f.market ? [f.market] : []))),
                          ].join(", ")}{" "}
                          · {book.formats.flatMap((f) => (f.asin ? [f.asin] : [])).join(", ")}
                        </span>
                      </span>
                      <Button size="sm" onClick={() => changeLink(book, card, "confirmed")}>
                        <CheckIcon />
                        Conferma
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => changeLink(book, card, "rejected")}
                      >
                        <XIcon />
                        Scarta
                      </Button>
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-56 flex-1">
          <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Cerca per titolo, collana o ASIN"
            aria-label="Cerca libri"
            className="pl-8"
          />
        </div>
        <Select value={account} onValueChange={(value) => setAccount(value as KdpAccount | "all")}>
          <SelectTrigger className="w-48" aria-label="Account">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tutti gli account</SelectItem>
            {KDP_ACCOUNTS.map(({ value, label }) => (
              <SelectItem key={value} value={value}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <label className="flex items-center gap-2 text-sm">
          <Checkbox
            checked={unlinkedOnly}
            onCheckedChange={(checked) => setUnlinkedOnly(checked === true)}
          />
          Solo senza card
        </label>
      </div>

      {books.length === 0 ? (
        <div className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
          Nessun libro importato. Usa <strong>Aggiorna da KDP</strong> per leggere il Bookshelf.
        </div>
      ) : (
        <>
          <p className="text-sm text-muted-foreground" aria-live="polite">
            {visible.length} di {books.length} libri
          </p>
          <ul className="flex flex-col gap-3" data-testid="kdp-books">
            {visible.map((book) => (
              <BookRow
                key={book.id}
                book={book}
                onLink={() => setLinkingBook(book)}
                onUnlink={(card) => changeLink(book, card, "rejected")}
              />
            ))}
          </ul>
        </>
      )}

      <SyncDialog open={syncOpen} onOpenChange={setSyncOpen} origin={origin} />
      <LinkCardDialog
        book={linkingBook}
        onClose={() => setLinkingBook(null)}
        onPick={(card) => {
          const book = linkingBook;
          setLinkingBook(null);
          if (book) void changeLink(book, card, "confirmed");
        }}
      />
    </main>
  );
}

function BookRow({
  book,
  onLink,
  onUnlink,
}: {
  book: KdpBookItem;
  onLink: () => void;
  onUnlink: (card: LinkCard) => void;
}) {
  const main = mainTitle(book.title);
  const subtitle = book.title.slice(main.length).replace(/^:\s*/, "");
  const confirmed = book.links.filter((link) => link.status === "confirmed");
  return (
    <li
      className="flex flex-col gap-3 rounded-xl border bg-card p-4 shadow-card"
      data-testid="kdp-book"
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <h3 className="font-semibold">{main}</h3>
          {subtitle && <p className="text-sm text-muted-foreground">{subtitle}</p>}
          <p className="mt-1 flex flex-wrap gap-x-3 text-xs text-muted-foreground">
            <span>{accountLabel(book.account)}</span>
            {book.series && <span>Collana: {book.series}</span>}
            {book.missingSince && (
              <span className="font-medium text-amber-700 dark:text-amber-300">
                Non più presente nel Bookshelf
              </span>
            )}
          </p>
        </div>
      </div>
      <BookFormats formats={book.formats} />
      <div className="flex flex-wrap items-center gap-2 border-t pt-3">
        <span className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">
          Card
        </span>
        {confirmed.map((link) => (
          <span
            key={link.card.id}
            className="flex max-w-full items-center gap-1 rounded-md bg-accent py-0.5 pr-0.5 pl-2 text-sm text-accent-foreground"
          >
            <Link
              href={cardHref(link.card)}
              className="truncate hover:underline"
              title={link.card.title}
            >
              {link.card.title}
            </Link>
            {link.auto && (
              <span className="text-[11px] opacity-70" title="Collegata automaticamente">
                auto
              </span>
            )}
            <Button
              variant="ghost"
              size="icon"
              className="size-6"
              aria-label={`Scollega ${link.card.title}`}
              onClick={() => onUnlink(link.card)}
            >
              <XIcon />
            </Button>
          </span>
        ))}
        <Button variant="ghost" size="sm" onClick={onLink}>
          <Link2Icon />
          Collega card
        </Button>
      </div>
    </li>
  );
}

function SyncDialog({
  open,
  onOpenChange,
  origin,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  origin: string;
}) {
  async function copyScript() {
    try {
      await navigator.clipboard.writeText(scraperSource(origin));
      toast.success("Script copiato");
    } catch {
      toast.error("Copia non riuscita.");
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Aggiorna da KDP</DialogTitle>
          <DialogDescription>
            I dati si leggono dal Bookshelf nel tuo browser, dove sei già collegato a KDP:
            l&apos;app non conosce la tua password.
          </DialogDescription>
        </DialogHeader>
        <ol className="flex list-decimal flex-col gap-3 pl-5 text-sm">
          <li>
            <BookmarkletStep
              origin={origin}
              specific={{
                href: bookmarkletHref(origin),
                name: "Importa da KDP",
                page: "il Bookshelf",
              }}
            />
          </li>
          <li>
            Apri il{" "}
            <a
              href="https://kdp.amazon.com/bookshelf"
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary hover:underline"
            >
              Bookshelf di KDP
            </a>{" "}
            con l&apos;account da aggiornare e clicca il preferito. Legge tutte le pagine e torna
            qui con i libri da importare.
          </li>
          <li>Scegli l&apos;account (principale o secondario) e conferma l&apos;importazione.</li>
        </ol>
        <p className="text-xs text-muted-foreground">
          In alternativa{" "}
          <button type="button" onClick={copyScript} className="text-primary hover:underline">
            copia lo script
          </button>{" "}
          e incollalo nella console del browser sulla pagina del Bookshelf.
        </p>
      </DialogContent>
    </Dialog>
  );
}

function LinkCardDialog({
  book,
  onClose,
  onPick,
}: {
  book: KdpBookItem | null;
  onClose: () => void;
  onPick: (card: LinkCard) => void;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<LinkableCard[] | null>(null);
  const [source, setSource] = useState(book);
  if (source !== book) {
    setSource(book);
    setQuery(book ? mainTitle(book.title) : "");
    setResults(null);
  }

  useEffect(() => {
    if (!book || !query.trim()) return;
    let cancelled = false;
    const timer = setTimeout(async () => {
      const result = await findLinkableCards(query).catch(() => null);
      if (!cancelled) setResults(result?.ok ? result.data : []);
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [book, query]);

  const linked = new Set(
    book?.links.filter((l) => l.status === "confirmed").map((l) => l.card.id) ?? [],
  );

  return (
    <Dialog open={book !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Collega una card</DialogTitle>
          <DialogDescription>{book ? mainTitle(book.title) : ""}</DialogDescription>
        </DialogHeader>
        <Input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Cerca una card"
          aria-label="Cerca una card"
          autoFocus
        />
        <ul className="flex max-h-80 flex-col gap-1 overflow-y-auto" aria-live="polite">
          {results?.length === 0 && (
            <li className="p-2 text-sm text-muted-foreground">Nessuna card trovata.</li>
          )}
          {results?.map((card) => (
            <li key={card.id}>
              <button
                type="button"
                disabled={linked.has(card.id)}
                onClick={() => onPick(card)}
                className="flex w-full flex-col rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none disabled:opacity-50"
              >
                <span className="font-medium">{card.title}</span>
                <span className="text-xs text-muted-foreground">
                  {card.boardTitle} · {card.listTitle}
                  {linked.has(card.id) && " · già collegata"}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </DialogContent>
    </Dialog>
  );
}
