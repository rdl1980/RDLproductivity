"use client";

import {
  DndContext,
  type DragEndEvent,
  DragOverlay,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { format, isSameMonth, isToday } from "date-fns";
import { it } from "date-fns/locale";
import { CheckIcon, ChevronLeftIcon, ChevronRightIcon } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { CardDetailDialog } from "@/components/card-detail/card-detail-dialog";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DEFAULT_BOARD_COLOR } from "@/lib/board-colors";
import {
  type CalendarView as View,
  dayKey,
  moveToDay,
  parseDayKey,
  shiftAnchor,
  visibleDays,
} from "@/lib/calendar";
import { dueStatus } from "@/lib/due";
import { useIsClient } from "@/lib/use-is-client";
import { cn } from "@/lib/utils";
import { updateCardDetails } from "@/server/actions/card-details";
import type { CalendarCard } from "@/server/queries/calendar";

type BoardOption = {
  id: string;
  title: string;
  color: string | null;
  labels: { id: string; name: string; color: string }[];
};

type Props = {
  cards: CalendarCard[];
  boards: BoardOption[];
  view: View;
  date: string | null;
  boardId: string | null;
  labelId: string | null;
};

const ALL = "all";
const WEEKDAYS = ["lun", "mar", "mer", "gio", "ven", "sab", "dom"];

export function CalendarView({ cards: initialCards, boards, view, date, boardId, labelId }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const isClient = useIsClient();
  // Local copy for optimistic moves; reset when the server sends new data.
  const [source, setSource] = useState(initialCards);
  const [cards, setCards] = useState(initialCards);
  if (source !== initialCards) {
    setSource(initialCards);
    setCards(initialCards);
  }
  const [dragging, setDragging] = useState<CalendarCard | null>(null);
  const openCardId = searchParams.get("card");

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 5 } }),
    // On touch screens a long press starts the drag, so swiping still scrolls.
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 8 } }),
    useSensor(KeyboardSensor),
  );

  function navigate(changes: Record<string, string | null>) {
    const params = new URLSearchParams(searchParams.toString());
    params.delete("card");
    for (const [key, value] of Object.entries(changes)) {
      if (value === null) params.delete(key);
      else params.set(key, value);
    }
    const query = params.toString();
    router.push(query ? `/calendar?${query}` : "/calendar");
  }

  function setCardParam(cardId: string | null) {
    const params = new URLSearchParams(window.location.search);
    if (cardId) params.set("card", cardId);
    else params.delete("card");
    const query = params.toString();
    window.history.pushState(null, "", query ? `?${query}` : window.location.pathname);
  }

  function onDragEnd({ active, over }: DragEndEvent) {
    setDragging(null);
    const target = parseDayKey(String(over?.id ?? "").replace(/^day:/, ""));
    const card = cards.find((c) => c.id === active.id);
    if (!target || !card) return;
    const previous = card.dueDate;
    const due = moveToDay(new Date(previous), target);
    if (dayKey(due) === dayKey(new Date(previous))) return;

    const setDue = (value: string) =>
      setCards((current) => current.map((c) => (c.id === card.id ? { ...c, dueDate: value } : c)));
    setDue(due.toISOString());
    updateCardDetails({ id: card.id, dueDate: due.toISOString() })
      .catch(() => ({ ok: false as const, error: "Errore di rete, modifica annullata." }))
      .then((result) => {
        if (result.ok) return;
        setDue(previous);
        toast.error(result.error);
      });
  }

  const labelOptions = boards
    .filter((board) => !boardId || board.id === boardId)
    .flatMap((board) =>
      board.labels.map((label) => ({
        ...label,
        text: boardId
          ? label.name || "Senza nome"
          : `${board.title} · ${label.name || "Senza nome"}`,
      })),
    );

  const toolbar = (title: string) => (
    <div className="flex flex-wrap items-center gap-2">
      <div className="flex items-center gap-1">
        <Button
          variant="outline"
          size="icon"
          className="size-8"
          aria-label="Periodo precedente"
          disabled={!isClient}
          onClick={() => navigate({ date: dayKey(shiftAnchor(anchor(), view, -1)) })}
        >
          <ChevronLeftIcon />
        </Button>
        <Button variant="outline" size="sm" onClick={() => navigate({ date: null })}>
          Oggi
        </Button>
        <Button
          variant="outline"
          size="icon"
          className="size-8"
          aria-label="Periodo successivo"
          disabled={!isClient}
          onClick={() => navigate({ date: dayKey(shiftAnchor(anchor(), view, 1)) })}
        >
          <ChevronRightIcon />
        </Button>
      </div>
      <h1 className="min-w-48 text-xl font-semibold tracking-tight first-letter:uppercase">
        {title}
      </h1>
      <div className="ml-auto flex flex-wrap items-center gap-2">
        <div className="flex rounded-md bg-muted p-0.5" role="group" aria-label="Vista">
          {(["month", "week"] as const).map((value) => (
            <Button
              key={value}
              size="sm"
              variant={view === value ? "default" : "ghost"}
              aria-pressed={view === value}
              className="h-7"
              onClick={() => navigate({ view: value === "month" ? null : value })}
            >
              {value === "month" ? "Mese" : "Settimana"}
            </Button>
          ))}
        </div>
        <Select
          value={boardId ?? ALL}
          onValueChange={(value) => navigate({ board: value === ALL ? null : value, label: null })}
        >
          <SelectTrigger aria-label="Filtro board" size="sm" className="w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Tutte le board</SelectItem>
            {boards.map((board) => (
              <SelectItem key={board.id} value={board.id}>
                {board.title}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={labelId ?? ALL}
          onValueChange={(value) => navigate({ label: value === ALL ? null : value })}
        >
          <SelectTrigger aria-label="Filtro etichetta" size="sm" className="w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Tutte le etichette</SelectItem>
            {labelOptions.map((label) => (
              <SelectItem key={label.id} value={label.id}>
                <span className="size-2.5 rounded-sm" style={{ backgroundColor: label.color }} />
                {label.text}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );

  function anchor() {
    return parseDayKey(date) ?? new Date();
  }

  // The grid depends on the browser time zone: render it after hydration.
  if (!isClient) {
    return (
      <main className="flex flex-1 flex-col gap-4 p-4">
        {toolbar("Calendario")}
        <div className="min-h-96 flex-1 animate-pulse rounded-lg bg-muted" aria-busy="true" />
      </main>
    );
  }

  const current = anchor();
  const days = visibleDays(current, view);
  const title =
    view === "month"
      ? format(current, "LLLL yyyy", { locale: it })
      : `${format(days[0], "d MMM", { locale: it })} – ${format(days[6], "d MMM yyyy", { locale: it })}`;

  const byDay = new Map<string, CalendarCard[]>();
  for (const card of cards) {
    const key = dayKey(new Date(card.dueDate));
    byDay.set(key, [...(byDay.get(key) ?? []), card]);
  }
  for (const list of byDay.values()) list.sort((a, b) => a.dueDate.localeCompare(b.dueDate));

  return (
    <main className="flex flex-1 flex-col gap-4 p-4">
      {toolbar(title)}

      <DndContext
        sensors={sensors}
        onDragStart={({ active }) => setDragging(cards.find((c) => c.id === active.id) ?? null)}
        onDragCancel={() => setDragging(null)}
        onDragEnd={onDragEnd}
      >
        <div className="overflow-x-auto">
          <div className="grid min-w-[44rem] grid-cols-7 overflow-hidden rounded-lg border">
            {WEEKDAYS.map((weekday) => (
              <div
                key={weekday}
                className="border-b bg-muted px-2 py-1 text-xs font-medium text-muted-foreground uppercase"
              >
                {weekday}
              </div>
            ))}
            {days.map((day) => (
              <DayCell
                key={dayKey(day)}
                day={day}
                muted={view === "month" && !isSameMonth(day, current)}
                tall={view === "week"}
                cards={byDay.get(dayKey(day)) ?? []}
                onOpen={(card) => setCardParam(card.id)}
              />
            ))}
          </div>
        </div>
        <DragOverlay>{dragging ? <Chip card={dragging} overlay /> : null}</DragOverlay>
      </DndContext>

      <CardDetailDialog
        cardId={openCardId}
        onClose={() => setCardParam(null)}
        onCardChange={(cardId, patch) => {
          const due = patch.dueDate;
          setCards((current) =>
            due === null
              ? current.filter((c) => c.id !== cardId)
              : current.map((c) =>
                  c.id === cardId
                    ? {
                        ...c,
                        title: patch.title,
                        dueDate: due,
                        completed: patch.completed,
                        labelIds: patch.labelIds,
                      }
                    : c,
                ),
          );
        }}
        onCardRemoved={(cardId) => setCards((current) => current.filter((c) => c.id !== cardId))}
        onCardPlaced={() => router.refresh()}
      />
    </main>
  );
}

function DayCell({
  day,
  muted,
  tall,
  cards,
  onOpen,
}: {
  day: Date;
  muted: boolean;
  tall: boolean;
  cards: CalendarCard[];
  onOpen: (card: CalendarCard) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `day:${dayKey(day)}` });
  const today = isToday(day);
  return (
    <div
      ref={setNodeRef}
      data-testid="calendar-day"
      data-day={dayKey(day)}
      aria-label={format(day, "EEEE d MMMM yyyy", { locale: it })}
      className={cn(
        "flex flex-col gap-1 border-r border-b p-1 [&:nth-child(7n)]:border-r-0",
        tall ? "min-h-96" : "min-h-28",
        muted && "bg-muted/40",
        isOver && "bg-primary/10",
      )}
    >
      <span
        className={cn(
          "self-end rounded-full px-1.5 text-xs",
          muted && "text-muted-foreground",
          today && "bg-primary font-semibold text-primary-foreground",
        )}
      >
        {day.getDate()}
      </span>
      <ul className="flex flex-col gap-1">
        {cards.map((card) => (
          <li key={card.id}>
            <DraggableChip card={card} onOpen={() => onOpen(card)} />
          </li>
        ))}
      </ul>
    </div>
  );
}

function DraggableChip({ card, onOpen }: { card: CalendarCard; onOpen: () => void }) {
  const { setNodeRef, attributes, listeners, isDragging } = useDraggable({ id: card.id });
  return (
    <button
      ref={setNodeRef}
      type="button"
      {...attributes}
      {...listeners}
      onClick={onOpen}
      data-testid="calendar-card"
      className={cn("block w-full text-left", isDragging && "opacity-40")}
    >
      <Chip card={card} />
    </button>
  );
}

function Chip({ card, overlay }: { card: CalendarCard; overlay?: boolean }) {
  const due = new Date(card.dueDate);
  const time = format(due, "HH:mm");
  const status = dueStatus(due, card.completed);
  return (
    <span
      className={cn(
        "flex items-center gap-1 rounded border-l-4 bg-background px-1.5 py-0.5 text-xs shadow-sm",
        overlay && "rotate-2 shadow-lg",
        status === "overdue" && "text-red-600 dark:text-red-400",
        card.completed && "text-muted-foreground line-through",
      )}
      style={{ borderLeftColor: card.board.color ?? DEFAULT_BOARD_COLOR }}
      title={`${card.title} · ${card.board.title}`}
    >
      {card.completed && <CheckIcon className="size-3 shrink-0 text-green-600" />}
      {time !== "00:00" && <span className="shrink-0 text-muted-foreground">{time}</span>}
      <span className="truncate">{card.title}</span>
    </span>
  );
}
