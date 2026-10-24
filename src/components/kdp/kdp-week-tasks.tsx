"use client";

import { BookOpenIcon } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";

import { Checkbox } from "@/components/ui/checkbox";
import { type KdpTaskItem, laneLabel, weekRangeLabel } from "@/lib/kdp";
import { cn } from "@/lib/utils";
import { updateKdpTask } from "@/server/actions/kdp";

const NETWORK_ERROR = "Errore di rete, modifica annullata.";

/** This week's KDP tasks, as a block on the Today page: done ones are ticked, not hidden. */
export function KdpWeekTasks({
  week,
  tasks: initialTasks,
}: {
  week: string;
  tasks: KdpTaskItem[];
}) {
  const [source, setSource] = useState(initialTasks);
  const [tasks, setTasks] = useState(initialTasks);
  if (source !== initialTasks) {
    setSource(initialTasks);
    setTasks(initialTasks);
  }
  if (tasks.length === 0) return null;

  function setDone(task: KdpTaskItem, done: boolean) {
    const apply = (value: boolean) =>
      setTasks((current) => current.map((t) => (t.id === task.id ? { ...t, done: value } : t)));
    apply(done);
    updateKdpTask({ id: task.id, done })
      .catch(() => ({ ok: false as const, error: NETWORK_ERROR }))
      .then((result) => {
        if (!result.ok) {
          apply(!done);
          toast.error(result.error);
        }
      });
  }

  const open = tasks.filter((t) => !t.done).length;
  return (
    <section aria-label="Settimana KDP" data-testid="kdp-week" className="flex flex-col gap-2">
      <h2 className="flex items-center gap-2 text-lg font-semibold">
        <BookOpenIcon className="size-5 text-muted-foreground" />
        Settimana KDP{" "}
        <span className="text-sm font-normal text-muted-foreground">
          ({open} da fare · {weekRangeLabel(week)})
        </span>
        <Link
          href={`/kdp?month=${week.slice(0, 7)}`}
          className="ml-auto text-sm font-normal text-primary hover:underline"
        >
          Apri il calendario
        </Link>
      </h2>
      <ul className="divide-y rounded-lg border">
        {tasks.map((task) => (
          <li key={task.id} data-testid="kdp-week-task" className="flex items-start gap-3 p-3">
            <Checkbox
              className="mt-0.5"
              aria-label={`Fatta: ${task.title}`}
              checked={task.done}
              onCheckedChange={(checked) => setDone(task, checked === true)}
            />
            <div className="flex min-w-0 flex-col">
              <span
                className={cn(
                  "text-sm font-medium",
                  task.done && "text-muted-foreground line-through",
                )}
              >
                {task.title}
              </span>
              <span className="text-xs text-muted-foreground">
                {laneLabel(task.account, task.track)}
              </span>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
