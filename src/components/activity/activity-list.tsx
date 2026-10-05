"use client";

import { BotIcon, Undo2Icon, UserIcon } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { LocalDateTime } from "@/components/local-date-time";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { loadActivity, undoActivityAction } from "@/server/actions/activity";
import type { ActivityItem } from "@/server/activity";

const PAGE_SIZE = 50;

export function ActorIcon({ actor }: { actor: string }) {
  return actor === "claude" ? (
    <BotIcon className="size-4 shrink-0 text-violet-600" aria-label="Claude" />
  ) : (
    <UserIcon className="size-4 shrink-0 text-muted-foreground" aria-label="Tu" />
  );
}

export function ActivityList({ initial }: { initial: ActivityItem[] }) {
  const router = useRouter();
  const [source, setSource] = useState(initial);
  const [items, setItems] = useState(initial);
  if (source !== initial) {
    setSource(initial);
    setItems(initial);
  }
  const [hasMore, setHasMore] = useState(initial.length === PAGE_SIZE);
  const [busy, setBusy] = useState<string | null>(null);

  async function undo(item: ActivityItem) {
    setBusy(item.id);
    const result = await undoActivityAction(item.id).catch(() => null);
    setBusy(null);
    if (!result?.ok) return void toast.error(result?.error ?? "Errore di rete.");
    toast.success(`Annullato: ${result.data.summary}`);
    router.refresh();
  }

  async function more() {
    const last = items.at(-1);
    if (!last) return;
    const result = await loadActivity({ before: last.createdAt.toISOString() }).catch(() => null);
    if (!result?.ok) return void toast.error(result?.error ?? "Errore di rete.");
    setItems((current) => [...current, ...result.data]);
    setHasMore(result.data.length === PAGE_SIZE);
  }

  if (items.length === 0) {
    return <p className="text-sm text-muted-foreground">Nessuna attività registrata.</p>;
  }
  return (
    <div className="flex flex-col gap-3">
      <ul className="divide-y rounded-lg border">
        {items.map((item) => (
          <li
            key={item.id}
            data-testid="activity-item"
            className="flex items-start justify-between gap-3 p-3"
          >
            <div className="flex min-w-0 items-start gap-2">
              <ActorIcon actor={item.actor} />
              <div className="flex min-w-0 flex-col">
                <span className={cn("text-sm break-words", item.undone && "line-through")}>
                  {item.summary}
                </span>
                <span className="text-xs text-muted-foreground">
                  <LocalDateTime value={item.createdAt} />
                  {item.board && (
                    <>
                      {" · "}
                      <Link
                        href={
                          item.cardId
                            ? `/boards/${item.board.id}?card=${item.cardId}`
                            : `/boards/${item.board.id}`
                        }
                        className="hover:underline"
                      >
                        {item.board.title}
                      </Link>
                    </>
                  )}
                  {item.undone && " · annullata"}
                </span>
              </div>
            </div>
            {item.undoable && (
              <Button
                variant="outline"
                size="sm"
                disabled={busy !== null}
                onClick={() => undo(item)}
                aria-label={`Annulla: ${item.summary}`}
              >
                <Undo2Icon />
                Annulla
              </Button>
            )}
          </li>
        ))}
      </ul>
      {hasMore && (
        <Button variant="secondary" size="sm" className="self-center" onClick={more}>
          Carica altre
        </Button>
      )}
    </div>
  );
}
