"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { accountLabel } from "@/lib/kdp";
import type { SaleBook } from "@/lib/kdp-sales";
import { setKdpTitleAlias } from "@/server/actions/kdp-sales";
import type { CatalogBook } from "@/server/queries/kdp-sales";

const NONE = "__none__";

/**
 * Names a title family the reports know but the Bookshelf does not: as one
 * of the account's imported books, or with a free title.
 */
export function TitleAliasDialog({
  book,
  catalog,
  onClose,
}: {
  book: SaleBook | null;
  catalog: CatalogBook[];
  onClose: () => void;
}) {
  return (
    <Dialog open={book !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:rounded-2xl">
        {book?.titleKey && (
          <AliasForm key={book.key} book={book} catalog={catalog} onClose={onClose} />
        )}
      </DialogContent>
    </Dialog>
  );
}

function AliasForm({
  book,
  catalog,
  onClose,
}: {
  book: SaleBook;
  catalog: CatalogBook[];
  onClose: () => void;
}) {
  const router = useRouter();
  const [bookId, setBookId] = useState(NONE);
  const [title, setTitle] = useState(book.unresolved ? "" : book.title);
  const [pending, startTransition] = useTransition();
  const options = catalog
    .filter((entry) => entry.account === book.account)
    .sort((a, b) => a.title.localeCompare(b.title, "it"));

  function save(clear = false) {
    startTransition(async () => {
      const result = await setKdpTitleAlias({
        account: book.account,
        titleKey: book.titleKey!,
        bookId: clear || bookId === NONE ? null : bookId,
        title: clear || bookId !== NONE ? null : title,
      }).catch(() => null);
      if (!result?.ok) return void toast.error(result?.error ?? "Errore di rete, riprova.");
      toast.success(clear ? "Titolo rimosso." : "Titolo assegnato.");
      onClose();
      router.refresh();
    });
  }

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        if (bookId !== NONE || title.trim()) save();
      }}
    >
      <DialogHeader>
        <DialogTitle>Assegna un titolo</DialogTitle>
        <DialogDescription>
          ASIN {book.asins.join(", ") || book.titleKey} · {accountLabel(book.account)}. Nessun libro
          importato dal Bookshelf ha questi ASIN: scegli il libro giusto, oppure dai un titolo a
          queste vendite.
        </DialogDescription>
      </DialogHeader>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="alias-book">Libro importato</Label>
        <Select value={bookId} onValueChange={setBookId}>
          <SelectTrigger id="alias-book" aria-label="Libro importato">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NONE}>Nessuno: uso un titolo libero</SelectItem>
            {options.map((entry) => (
              <SelectItem key={entry.id} value={entry.id}>
                {entry.title}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">
          Le vendite si sommano a quelle del libro scelto. Se il libro manca dall&apos;elenco,
          importa prima il Bookshelf di questo account.
        </p>
      </div>
      {bookId === NONE && (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="alias-title">Titolo</Label>
          <Input
            id="alias-title"
            value={title}
            maxLength={200}
            placeholder="Es. Agenda Psicologa 2027"
            onChange={(event) => setTitle(event.target.value)}
          />
        </div>
      )}
      <DialogFooter className="gap-2 sm:justify-between">
        {!book.unresolved ? (
          <Button type="button" variant="outline" disabled={pending} onClick={() => save(true)}>
            Rimuovi titolo
          </Button>
        ) : (
          <span />
        )}
        <div className="flex gap-2">
          <Button type="button" variant="outline" onClick={onClose}>
            Annulla
          </Button>
          <Button type="submit" disabled={pending || (bookId === NONE && !title.trim())}>
            Salva
          </Button>
        </div>
      </DialogFooter>
    </form>
  );
}
