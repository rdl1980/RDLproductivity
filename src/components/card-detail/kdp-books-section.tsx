"use client";

import { CheckIcon, LibraryIcon, XIcon } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { BookFormats } from "@/components/kdp/book-formats";
import { Button } from "@/components/ui/button";
import { accountLabel } from "@/lib/kdp";
import { mainTitle } from "@/lib/kdp-books";
import { loadCardKdpBooks, setKdpBookLink } from "@/server/actions/kdp-books";
import type { ActionResult } from "@/server/actions/result";
import type { CardKdpBook } from "@/server/queries/kdp-books";

/** KDP books linked to the card (ASINs, links), and suggestions to confirm. */
export function KdpBooksSection({ cardId }: { cardId: string }) {
  const [state, setState] = useState<{ cardId: string; books: CardKdpBook[] } | null>(null);

  useEffect(() => {
    let cancelled = false;
    loadCardKdpBooks(cardId)
      .catch(() => null)
      .then((result) => {
        if (!cancelled && result?.ok) setState({ cardId, books: result.data });
      });
    return () => {
      cancelled = true;
    };
  }, [cardId]);

  const books = state?.cardId === cardId ? state.books : [];
  if (books.length === 0) return null;

  async function decide(entry: CardKdpBook, status: "confirmed" | "rejected") {
    const patch = (list: CardKdpBook[], next: CardKdpBook | null) =>
      list.flatMap((b) => (b.linkId === entry.linkId ? (next ? [next] : []) : [b]));
    setState(
      (s) =>
        s && {
          ...s,
          books: patch(s.books, status === "confirmed" ? { ...entry, status, auto: false } : null),
        },
    );
    const result = await setKdpBookLink({ bookId: entry.book.id, cardId, status }).catch(
      (): ActionResult => ({ ok: false, error: "Errore di rete, modifica annullata." }),
    );
    if (!result.ok) {
      setState((s) => s && { ...s, books: [...patch(s.books, null), entry] });
      toast.error(result.error);
    }
  }

  return (
    <section className="flex flex-col gap-3" data-testid="card-kdp-books">
      <h3 className="flex items-center gap-2 font-semibold">
        <LibraryIcon className="size-4 text-muted-foreground" />
        Libri KDP
        <Link
          href="/kdp/libri"
          className="ml-auto text-xs font-normal text-primary hover:underline"
        >
          Tutti i libri
        </Link>
      </h3>
      {books.map((entry) => (
        <div key={entry.linkId} className="flex flex-col gap-2 rounded-lg border p-3">
          <div className="flex flex-wrap items-start gap-2">
            <div className="min-w-0 flex-1">
              <p className="font-medium">{mainTitle(entry.book.title)}</p>
              <p className="text-xs text-muted-foreground">
                {accountLabel(entry.book.account)}
                {entry.status === "suggested" && " · abbinamento da confermare"}
                {entry.auto && " · collegato automaticamente"}
              </p>
            </div>
            {entry.status === "suggested" ? (
              <>
                <Button size="sm" onClick={() => decide(entry, "confirmed")}>
                  <CheckIcon />
                  Conferma
                </Button>
                <Button size="sm" variant="outline" onClick={() => decide(entry, "rejected")}>
                  Scarta
                </Button>
              </>
            ) : (
              <Button
                size="icon"
                variant="ghost"
                className="size-7"
                aria-label={`Scollega ${mainTitle(entry.book.title)}`}
                onClick={() => decide(entry, "rejected")}
              >
                <XIcon />
              </Button>
            )}
          </div>
          {entry.status === "confirmed" && <BookFormats formats={entry.book.formats} />}
        </div>
      ))}
    </section>
  );
}
