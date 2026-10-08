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
import { BookOpenIcon, ChevronLeftIcon, ChevronRightIcon, PlusIcon } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";

import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
  accountLabel,
  cellTasks,
  isoWeekNumber,
  KDP_ACCOUNTS,
  type KdpAccount,
  type KdpTaskItem,
  mondayOf,
  monthLabel,
  shiftMonth,
  weekRangeLabel,
} from "@/lib/kdp";
import { positionAfter } from "@/lib/position";
import { cn } from "@/lib/utils";
import { createKdpTask, deleteKdpTask, moveKdpTask, updateKdpTask } from "@/server/actions/kdp";
import type { ActionResult } from "@/server/actions/result";

import { KdpTaskDialog } from "./kdp-task-dialog";

const NETWORK_ERROR = "Errore di rete, modifica annullata.";
const isTemp = (id: string) => id.startsWith("temp-");

type Props = { month: string; weeks: string[]; tasks: KdpTaskItem[]; today: string };

export function KdpCalendarView({ month, weeks, tasks: initialTasks, today }: Props) {
  // Local copy for optimistic changes; reset when the server sends new data.
  const [source, setSource] = useState(initialTasks);
  const [tasks, setTasks] = useState(initialTasks);
  if (source !== initialTasks) {
    setSource(initialTasks);
    setTasks(initialTasks);
  }
  const [dragging, setDragging] = useState<KdpTaskItem | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const currentWeek = mondayOf(today);

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 8 } }),
    useSensor(KeyboardSensor),
  );

  /** Applies `change` now and reverts it with `revert` if the action fails. */
  async function optimistic(
    change: (current: KdpTaskItem[]) => KdpTaskItem[],
    revert: (current: KdpTaskItem[]) => KdpTaskItem[],
    action: () => Promise<ActionResult<unknown>>,
  ) {
    setTasks(change);
    const result = await action().catch((): ActionResult<unknown> => ({
      ok: false,
      error: NETWORK_ERROR,
    }));
    if (!result.ok) {
      setTasks(revert);
      toast.error(result.error);
    }
    return result;
  }

  const patch = (id: string, fields: Partial<KdpTaskItem>) => (current: KdpTaskItem[]) =>
    current.map((task) => (task.id === id ? { ...task, ...fields } : task));

  async function addTask(week: string, account: KdpAccount, title: string) {
    const tempId = `temp-${crypto.randomUUID()}`;
    const last = cellTasks(tasks, week, account).at(-1);
    const temp: KdpTaskItem = {
      id: tempId,
      title,
      notes: null,
      account,
      week,
      position: positionAfter(last?.position ?? null),
      done: false,
    };
    setTasks((current) => [...current, temp]);
    const result = await createKdpTask({ title, week, account }).catch(
      (): ActionResult<KdpTaskItem> => ({ ok: false, error: NETWORK_ERROR }),
    );
    setTasks((current) =>
      result.ok
        ? current.map((task) => (task.id === tempId ? result.data : task))
        : current.filter((task) => task.id !== tempId),
    );
    if (!result.ok) toast.error(result.error);
  }

  function setDone(task: KdpTaskItem, done: boolean) {
    void optimistic(patch(task.id, { done }), patch(task.id, { done: task.done }), () =>
      updateKdpTask({ id: task.id, done }),
    );
  }

  function onDragEnd({ active, over }: DragEndEvent) {
    setDragging(null);
    const task = tasks.find((t) => t.id === active.id);
    const [, week, account] = String(over?.id ?? "").split("|") as [string, string, KdpAccount];
    if (!task || !week || (task.week === week && task.account === account)) return;

    const last = cellTasks(tasks, week, account).at(-1);
    const previous = { week: task.week, account: task.account, position: task.position };
    void optimistic(
      patch(task.id, { week, account, position: positionAfter(last?.position ?? null) }),
      patch(task.id, previous),
      () => moveKdpTask({ id: task.id, week, account, beforeId: last?.id ?? null, afterId: null }),
    );
  }

  const editing = tasks.find((task) => task.id === editingId) ?? null;

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-5 p-4 sm:p-6">
      <PageHeader
        icon={BookOpenIcon}
        title="Calendario KDP"
        description="Attività settimanali per i due account KDP. Trascina un'attività per spostarla in un'altra settimana o nell'altro account."
        actions={
          <nav aria-label="Mese" className="flex items-center gap-1">
            <Button asChild variant="outline" size="icon" aria-label="Mese precedente">
              <Link href={`/kdp?month=${shiftMonth(month, -1)}`}>
                <ChevronLeftIcon />
              </Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/kdp">Oggi</Link>
            </Button>
            <Button asChild variant="outline" size="icon" aria-label="Mese successivo">
              <Link href={`/kdp?month=${shiftMonth(month, 1)}`}>
                <ChevronRightIcon />
              </Link>
            </Button>
          </nav>
        }
      />
      <h2 className="text-lg font-semibold" data-testid="kdp-month">
        {monthLabel(month)}
      </h2>

      <DndContext
        // Stable id: generated ids differ between server and client (hydration).
        id="kdp-dnd"
        sensors={sensors}
        onDragStart={({ active }) => setDragging(tasks.find((t) => t.id === active.id) ?? null)}
        onDragEnd={onDragEnd}
        onDragCancel={() => setDragging(null)}
      >
        <div
          role="table"
          aria-label="Calendario KDP"
          data-testid="kdp-calendar"
          className="grid grid-cols-[4.5rem_minmax(0,1fr)_minmax(0,1fr)] gap-1.5 sm:grid-cols-[6.5rem_1fr_1fr] sm:gap-2"
        >
          <div role="row" className="contents">
            <div
              role="columnheader"
              className="px-2 py-1.5 text-xs font-semibold text-muted-foreground uppercase"
            >
              <span aria-hidden className="sm:hidden">
                Sett.
              </span>
              <span className="sr-only sm:not-sr-only">Settimana</span>
            </div>
            {KDP_ACCOUNTS.map((account) => (
              <div
                key={account.value}
                role="columnheader"
                className="rounded-lg bg-muted px-3 py-1.5 text-sm font-semibold"
              >
                {account.label}
              </div>
            ))}
          </div>
          {weeks.map((week) => {
            const current = week === currentWeek;
            return (
              <div key={week} role="row" className="contents" data-testid="kdp-week">
                <div
                  role="rowheader"
                  aria-current={current ? "date" : undefined}
                  className={cn(
                    "flex flex-col gap-0.5 rounded-lg px-2 py-2",
                    current && "bg-accent text-accent-foreground",
                  )}
                >
                  <span className="text-sm font-semibold">Sett. {isoWeekNumber(week)}</span>
                  <span
                    className={cn(
                      "text-xs tabular-nums",
                      current ? "text-accent-foreground" : "text-muted-foreground",
                    )}
                  >
                    {weekRangeLabel(week)}
                  </span>
                </div>
                {KDP_ACCOUNTS.map((account) => (
                  <Cell
                    key={account.value}
                    id={`cell|${week}|${account.value}`}
                    label={`${account.label}, settimana ${weekRangeLabel(week)}`}
                    current={current}
                    onAdd={(title) => addTask(week, account.value, title)}
                  >
                    {cellTasks(tasks, week, account.value).map((task) => (
                      <TaskItem
                        key={task.id}
                        task={task}
                        onOpen={() => setEditingId(task.id)}
                        onDoneChange={(done) => setDone(task, done)}
                      />
                    ))}
                  </Cell>
                ))}
              </div>
            );
          })}
        </div>
        <DragOverlay>
          {dragging ? (
            <div className="rotate-2 rounded-lg border bg-list-card px-3 py-2 text-sm font-medium shadow-xl ring-2 ring-primary/30">
              {dragging.title}
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>

      <KdpTaskDialog
        task={editing}
        onClose={() => setEditingId(null)}
        onSave={(fields) => {
          if (!editing) return;
          const previous = { title: editing.title, notes: editing.notes };
          void optimistic(patch(editing.id, fields), patch(editing.id, previous), () =>
            updateKdpTask({ id: editing.id, ...fields }),
          );
        }}
        onDelete={() => {
          if (!editing) return;
          const removed = editing;
          setEditingId(null);
          void optimistic(
            (current) => current.filter((task) => task.id !== removed.id),
            (current) => [...current, removed],
            () => deleteKdpTask(removed.id),
          ).then((result) => {
            if (result.ok) toast.success(`Attività «${removed.title}» eliminata.`);
          });
        }}
        accountName={editing ? accountLabel(editing.account) : ""}
        weekName={editing ? weekRangeLabel(editing.week) : ""}
      />
    </main>
  );
}

function Cell({
  id,
  label,
  current,
  onAdd,
  children,
}: {
  id: string;
  label: string;
  current: boolean;
  onAdd: (title: string) => void;
  children: React.ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({ id });
  const [adding, setAdding] = useState(false);
  const [title, setTitle] = useState("");

  function submit(event: React.FormEvent) {
    event.preventDefault();
    const value = title.trim();
    if (value) onAdd(value);
    setTitle("");
  }

  return (
    <div
      ref={setNodeRef}
      role="cell"
      aria-label={label}
      data-testid="kdp-cell"
      className={cn(
        "flex min-h-24 min-w-0 flex-col gap-1.5 rounded-xl bg-list p-1.5 ring-1 ring-black/5 sm:p-2 dark:ring-white/5",
        current && "ring-2 ring-primary/40 dark:ring-primary/40",
        isOver && "ring-2 ring-ring",
      )}
    >
      <ul className="flex flex-col gap-1.5 empty:hidden">{children}</ul>
      {adding ? (
        <form onSubmit={submit} className="flex flex-col gap-1.5">
          <Input
            autoFocus
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Escape") setAdding(false);
            }}
            onBlur={() => {
              if (!title.trim()) setAdding(false);
            }}
            placeholder="Titolo dell'attività"
            aria-label={`Nuova attività, ${label}`}
            maxLength={200}
            className="h-8 bg-background"
          />
          <div className="flex gap-1.5">
            <Button type="submit" size="sm">
              Aggiungi
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => setAdding(false)}>
              Annulla
            </Button>
          </div>
        </form>
      ) : (
        <button
          type="button"
          onClick={() => setAdding(true)}
          aria-label={`Aggiungi attività, ${label}`}
          className="mt-auto flex items-center gap-1.5 rounded-md px-1.5 py-1 text-left text-sm text-muted-foreground transition-colors hover:bg-black/5 hover:text-foreground dark:hover:bg-white/10"
        >
          <PlusIcon className="size-4" />
          Aggiungi
        </button>
      )}
    </div>
  );
}

function TaskItem({
  task,
  onOpen,
  onDoneChange,
}: {
  task: KdpTaskItem;
  onOpen: () => void;
  onDoneChange: (done: boolean) => void;
}) {
  const pending = isTemp(task.id);
  const { setNodeRef, setActivatorNodeRef, attributes, listeners, isDragging } = useDraggable({
    id: task.id,
    disabled: pending,
  });
  const { onKeyDown: dragKeyDown, ...pointerListeners } = listeners ?? {};
  return (
    // Mouse and touch drags start anywhere on the task; the keyboard uses the
    // title button (Enter opens, Space drags), as on the board.
    <li
      ref={setNodeRef}
      {...pointerListeners}
      data-testid="kdp-task"
      className={cn(
        "flex items-start gap-2 rounded-lg border border-black/[0.06] bg-list-card px-2.5 py-2 text-sm shadow-card select-none dark:border-white/[0.06]",
        isDragging && "opacity-40",
        pending && "opacity-60",
      )}
    >
      <Checkbox
        className="mt-0.5"
        aria-label={`Fatta: ${task.title}`}
        checked={task.done}
        disabled={pending}
        onCheckedChange={(checked) => onDoneChange(checked === true)}
        onPointerDown={(event) => event.stopPropagation()}
      />
      <button
        ref={setActivatorNodeRef}
        type="button"
        {...attributes}
        disabled={pending}
        onKeyDown={(event) => {
          if (event.key === "Enter") onOpen();
          else (dragKeyDown as React.KeyboardEventHandler | undefined)?.(event);
        }}
        onClick={onOpen}
        className={cn(
          "min-w-0 flex-1 cursor-pointer rounded-sm text-left leading-snug font-medium break-words whitespace-pre-wrap outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50",
          task.done && "text-muted-foreground line-through",
        )}
      >
        {task.title}
        {task.notes && <span className="sr-only">, con note</span>}
      </button>
    </li>
  );
}
