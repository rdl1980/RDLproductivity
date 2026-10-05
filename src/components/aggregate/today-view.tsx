"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { toast } from "sonner";

import { CardDetailDialog } from "@/components/card-detail/card-detail-dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { AGENDA_SECTIONS, groupAgenda } from "@/lib/agenda";
import type { AggregateCard } from "@/lib/aggregate";
import type { LabelItem } from "@/lib/board-state";
import { useIsClient } from "@/lib/use-is-client";
import { cn } from "@/lib/utils";
import { updateCardDetails } from "@/server/actions/card-details";

import { AggregateCardBody, applyPatch } from "./aggregate-card";
import { useCardParam } from "./use-card-param";

const NETWORK_ERROR = "Errore di rete, modifica annullata.";

export function TodayView({ cards: initialCards }: { cards: AggregateCard[] }) {
  const router = useRouter();
  const isClient = useIsClient();
  const { openCardId, setCardParam } = useCardParam();
  const [source, setSource] = useState(initialCards);
  const [cards, setCards] = useState(initialCards);
  if (source !== initialCards) {
    setSource(initialCards);
    setCards(initialCards);
  }
  const boardLabels = useRef(new Map<string, LabelItem[]>());

  function setCompleted(card: AggregateCard, completed: boolean) {
    const apply = (value: boolean) =>
      setCards((current) =>
        current.map((c) => (c.id === card.id ? { ...c, completed: value } : c)),
      );
    apply(completed);
    updateCardDetails({ id: card.id, completed })
      .catch(() => ({ ok: false as const, error: NETWORK_ERROR }))
      .then((result) => {
        if (result.ok) return;
        apply(!completed);
        toast.error(result.error);
      });
  }

  // Sections depend on the browser clock and time zone: render after hydration.
  const groups = isClient ? groupAgenda(cards, new Date()) : null;

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-8 p-6">
      <h1 className="text-2xl font-semibold tracking-tight">Oggi</h1>
      {groups &&
        AGENDA_SECTIONS.map((section) => (
          <section key={section.key} aria-label={section.title} className="flex flex-col gap-2">
            <h2
              className={cn(
                "text-lg font-semibold",
                section.key === "overdue" && groups.overdue.length > 0 && "text-destructive",
              )}
            >
              {section.title}{" "}
              <span className="text-sm font-normal text-muted-foreground">
                ({groups[section.key].length})
              </span>
            </h2>
            {groups[section.key].length === 0 ? (
              <p className="text-sm text-muted-foreground">{section.empty}</p>
            ) : (
              <ul className="divide-y rounded-lg border">
                {groups[section.key].map((card) => (
                  <li
                    key={card.id}
                    data-testid="agenda-card"
                    className="flex items-start gap-3 p-3"
                  >
                    <Checkbox
                      className="mt-1"
                      aria-label={`Completata: ${card.title}`}
                      checked={card.completed}
                      onCheckedChange={(checked) => setCompleted(card, checked === true)}
                    />
                    <AggregateCardBody
                      card={card}
                      className="flex-1"
                      title={
                        <button
                          type="button"
                          onClick={() => setCardParam(card.id)}
                          className={cn(
                            "w-fit cursor-pointer rounded-sm text-left text-sm font-medium break-words hover:underline focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none",
                            card.completed && "text-muted-foreground line-through",
                          )}
                        >
                          {card.title}
                        </button>
                      }
                    />
                  </li>
                ))}
              </ul>
            )}
          </section>
        ))}

      <CardDetailDialog
        cardId={openCardId}
        onClose={() => setCardParam(null)}
        onCardChange={(cardId, patch) =>
          setCards((current) =>
            current.map((card) =>
              card.id === cardId
                ? applyPatch(card, patch, boardLabels.current.get(card.board.id))
                : card,
            ),
          )
        }
        onLabelsChange={(boardId, labels) => boardLabels.current.set(boardId, labels)}
        onCardRemoved={(cardId) => setCards((current) => current.filter((c) => c.id !== cardId))}
        onCardPlaced={() => router.refresh()}
      />
    </main>
  );
}
