"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";

import { Markdown } from "./markdown";

/** Markdown description: rendered view, click to edit with a write/preview toggle. */
export function DescriptionEditor({
  value,
  onSave,
}: {
  value: string;
  onSave: (value: string) => void;
}) {
  const [draft, setDraft] = useState<string | null>(null);

  if (draft === null) {
    return value.trim() ? (
      <button
        type="button"
        aria-label="Modifica descrizione"
        className="w-full rounded-md p-2 text-left hover:bg-muted/60"
        onClick={(event) => {
          // Let links inside the description work without entering edit mode.
          if ((event.target as HTMLElement).closest("a")) return;
          setDraft(value);
        }}
      >
        <Markdown>{value}</Markdown>
      </button>
    ) : (
      <button
        type="button"
        className="w-full rounded-md bg-muted p-3 text-left text-sm text-muted-foreground hover:bg-muted/70"
        onClick={() => setDraft("")}
      >
        Aggiungi una descrizione più dettagliata…
      </button>
    );
  }

  const close = () => setDraft(null);
  return (
    <Tabs defaultValue="write" className="gap-2">
      <TabsList>
        <TabsTrigger value="write">Scrivi</TabsTrigger>
        <TabsTrigger value="preview">Anteprima</TabsTrigger>
      </TabsList>
      <TabsContent value="write">
        <Textarea
          autoFocus
          aria-label="Descrizione"
          rows={8}
          maxLength={20_000}
          value={draft}
          placeholder="Supporta Markdown: **grassetto**, _corsivo_, elenchi, [link](https://…)"
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.preventDefault();
              event.stopPropagation();
              close();
            } else if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
              event.preventDefault();
              onSave(draft);
              close();
            }
          }}
        />
      </TabsContent>
      <TabsContent value="preview" className="min-h-40 rounded-md border p-3">
        {draft.trim() ? (
          <Markdown>{draft}</Markdown>
        ) : (
          <p className="text-sm text-muted-foreground">Niente da mostrare.</p>
        )}
      </TabsContent>
      <div className="flex gap-2">
        <Button
          size="sm"
          onClick={() => {
            onSave(draft);
            close();
          }}
        >
          Salva
        </Button>
        <Button size="sm" variant="ghost" onClick={close}>
          Annulla
        </Button>
      </div>
    </Tabs>
  );
}
