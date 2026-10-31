"use client";

import { BotIcon, RotateCcwIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { type TodoItem, type TodoKind, todoKey } from "@/lib/content";
import { completeContentTodo, reopenContentTodo } from "@/server/actions/content";
import type { ActionResult } from "@/server/actions/result";
import type { ContentRubricDTO, ContentTodo } from "@/server/queries/content";

import { ContentTabs } from "./content-tabs";
import { dayLabel } from "./content-ui";
import { type PieceDraft, PieceDialog } from "./piece-dialog";

const NETWORK = "Errore di rete, modifica annullata.";

/** What checking an item does, shown under the list. */
const KIND_HELP: Record<TodoKind, string> = {
  schedule: "Da programmare: un layer pronto che esce nei prossimi 7 giorni. Fatto = programmato.",
  pin: "Commento da fissare: layer pubblicato con commento non ancora fissato. Fatto = fissato.",
  metrics: "Numeri da rilevare: pubblicato da più di 48 ore senza rilevazioni.",
  vote: "Voto chiuso senza esito: la data di chiusura è passata e manca l'esito.",
  slot: "Slot vuoto: il piano prevede una rubrica e nessuna scheda la copre.",
};

export function ContentTodoView({
  todo,
  rubrics,
}: {
  todo: ContentTodo;
  rubrics: ContentRubricDTO[];
}) {
  const router = useRouter();
  // Optimistic: checked items leave the list at once, and come back on error.
  const [source, setSource] = useState(todo);
  const [hidden, setHidden] = useState<ReadonlySet<string>>(new Set());
  if (source !== todo) {
    setSource(todo);
    setHidden(new Set());
  }
  const [openCode, setOpenCode] = useState<string | null>(null);
  const [draft, setDraft] = useState<PieceDraft | null>(null);

  const open = todo.open.filter((item) => !hidden.has(todoKey(item)));
  const done = todo.done.filter((item) => !hidden.has(todoKey(item)));

  async function run(key: string, action: () => Promise<ActionResult<null>>, message: string) {
    setHidden((current) => new Set(current).add(key));
    const result = await action().catch((): ActionResult<null> => ({ ok: false, error: NETWORK }));
    if (!result.ok) {
      setHidden((current) => {
        const next = new Set(current);
        next.delete(key);
        return next;
      });
      toast.error(result.error);
      return;
    }
    toast.success(message);
    router.refresh();
  }

  function complete(item: TodoItem) {
    const key = todoKey(item);
    void run(
      key,
      () => completeContentTodo({ kind: item.kind, key, code: item.code, platform: item.platform }),
      "Fatto",
    );
  }

  function openItem(item: TodoItem) {
    if (item.code) setOpenCode(item.code);
    else if (item.slot)
      setDraft({ date: item.slot.date, slot: item.slot.slot, rubric: item.slot.rubric });
  }

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-col gap-4 p-4 sm:p-6">
      <PageHeader
        icon={BotIcon}
        title="Robotti & Robotte"
        description="Cosa c'è da fare sul calendario editoriale: dagli ultimi 60 giorni ai prossimi 7."
      />
      <ContentTabs current="todo" todoCount={open.length} />

      <section aria-label="Da fare" className="rounded-xl border bg-card">
        {open.length === 0 ? (
          <p className="p-4 text-sm text-muted-foreground">Niente in sospeso.</p>
        ) : (
          <ul className="divide-y" data-testid="todo-list">
            {open.map((item) => (
              <li
                key={todoKey(item)}
                data-testid="todo-item"
                data-kind={item.kind}
                className="flex items-center gap-3 px-3 py-2 text-sm"
              >
                <Checkbox
                  aria-label={`Fatto: ${item.text}`}
                  onCheckedChange={(checked) => checked === true && complete(item)}
                />
                <span className="w-28 shrink-0 text-xs text-muted-foreground">
                  {dayLabel(item.date)}
                </span>
                <button
                  type="button"
                  onClick={() => openItem(item)}
                  className="min-w-0 flex-1 text-left hover:underline"
                >
                  {item.text}
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {done.length > 0 && (
        <details className="rounded-xl border bg-card p-3" data-testid="todo-done">
          <summary className="cursor-pointer text-sm font-semibold">Fatte ({done.length})</summary>
          <ul className="mt-2 flex flex-col gap-1">
            {done.map((item) => {
              const key = todoKey(item);
              return (
                <li key={key} className="flex items-center gap-3 text-sm">
                  <span className="w-28 shrink-0 text-xs text-muted-foreground">
                    {dayLabel(item.date)}
                  </span>
                  <span className="min-w-0 flex-1 text-muted-foreground line-through">
                    {item.text}
                  </span>
                  <Button
                    type="button"
                    size="xs"
                    variant="ghost"
                    onClick={() => void run(key, () => reopenContentTodo(key), "Rimessa da fare")}
                  >
                    <RotateCcwIcon />
                    Rimetti
                    <span className="sr-only"> da fare: {item.text}</span>
                  </Button>
                </li>
              );
            })}
          </ul>
        </details>
      )}

      <section className="text-xs text-muted-foreground" aria-label="Come funziona">
        <h2 className="mb-1 font-semibold text-foreground">Come funziona</h2>
        <p className="mb-1">
          L&apos;elenco si calcola dalle schede e dal piano: una voce sparisce da sola quando la
          scheda è a posto. Spuntarla la segna come fatta: «Da programmare» e «Commento da fissare»
          aggiornano il layer, le altre restano in «Fatte», da dove si rimettono.
        </p>
        <ul className="list-disc pl-4">
          {Object.values(KIND_HELP).map((text) => (
            <li key={text}>{text}</li>
          ))}
        </ul>
      </section>

      <PieceDialog
        code={openCode}
        draft={draft}
        rubrics={rubrics}
        onClose={() => {
          setOpenCode(null);
          setDraft(null);
        }}
        onSaved={(piece) => {
          setDraft(null);
          setOpenCode(piece.code);
          router.refresh();
        }}
      />
    </main>
  );
}
