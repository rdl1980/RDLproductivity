"use client";

import { CopyIcon } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";

/**
 * Fallback when the bookmarklet cannot be dragged (phones and tablets, some
 * browsers, hidden bookmarks bar): copy its URL and save it as a bookmark by hand.
 */
export function ManualBookmark({ href, name }: { href: string; name: string }) {
  async function copy() {
    try {
      await navigator.clipboard.writeText(href);
      toast.success("Preferito copiato: incollalo come indirizzo di un nuovo preferito.");
    } catch {
      toast.error("Copia non riuscita.");
    }
  }

  return (
    <details className="mt-2 rounded-lg border bg-muted/40 px-3 py-2 text-sm">
      <summary className="cursor-pointer font-medium">Non riesco a trascinarlo</summary>
      <ol className="mt-2 flex list-decimal flex-col gap-1.5 pl-5">
        <li>
          <Button type="button" size="sm" variant="outline" onClick={copy}>
            <CopyIcon />
            Copia il preferito
          </Button>
        </li>
        <li>
          Aggiungi ai preferiti una pagina qualsiasi (Ctrl+D, su Mac Cmd+D, oppure la stellina nella
          barra degli indirizzi) e chiamalo «{name}».
        </li>
        <li>
          Modifica quel preferito e al posto dell&apos;indirizzo (URL) incolla quello copiato: è un
          testo lungo che inizia con <code className="font-mono text-xs">javascript:</code>.
        </li>
        <li>
          Per usarlo, sulla pagina di KDP apri il preferito dalla barra o dal menu dei preferiti.
          Sul telefono scrivi «{name}» nella barra degli indirizzi e tocca il preferito nei
          suggerimenti.
        </li>
      </ol>
    </details>
  );
}
