"use client";

import { MoreHorizontalIcon, PlusIcon } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { DEFAULT_BOARD_COLOR } from "@/lib/board-colors";
import { createBoard, updateBoard } from "@/server/actions/boards";

import { BoardFormDialog } from "./board-form-dialog";

type BoardSummary = { id: string; title: string; color: string | null };

export function BoardGrid({ boards }: { boards: BoardSummary[] }) {
  const router = useRouter();
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<BoardSummary | null>(null);

  return (
    <>
      <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
        {boards.map((board) => (
          <li key={board.id} className="group relative">
            <Link
              href={`/boards/${board.id}`}
              className="flex h-24 items-start rounded-lg p-3 font-semibold text-white shadow-sm transition hover:brightness-110"
              style={{ backgroundColor: board.color ?? undefined }}
            >
              <span className="line-clamp-2 pr-6">{board.title}</span>
            </Link>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={`Azioni per ${board.title}`}
                  className="absolute top-1.5 right-1.5 size-7 text-white opacity-0 group-hover:opacity-100 hover:bg-white/20 hover:text-white focus-visible:opacity-100 data-[state=open]:opacity-100"
                >
                  <MoreHorizontalIcon />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onSelect={() => setEditing(board)}>
                  Modifica titolo e colore
                </DropdownMenuItem>
                <DropdownMenuItem
                  variant="destructive"
                  onSelect={async () => {
                    const result = await updateBoard({ id: board.id, archived: true });
                    if (result.ok) toast.success(`Board "${board.title}" archiviata`);
                    else toast.error(result.error);
                  }}
                >
                  Archivia
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </li>
        ))}
        <li>
          <button
            type="button"
            onClick={() => setCreating(true)}
            className="flex h-24 w-full items-center justify-center gap-2 rounded-lg bg-muted text-sm font-medium text-muted-foreground transition hover:bg-muted/70"
          >
            <PlusIcon className="size-4" />
            Crea una board
          </button>
        </li>
      </ul>

      <BoardFormDialog
        open={creating}
        onOpenChange={setCreating}
        title="Nuova board"
        submitLabel="Crea"
        onSubmit={async (values) => {
          const result = await createBoard(values);
          if (!result.ok) return result.error;
          router.push(`/boards/${result.data.id}`);
          return null;
        }}
      />

      <BoardFormDialog
        open={editing !== null}
        onOpenChange={(open) => !open && setEditing(null)}
        title="Modifica board"
        submitLabel="Salva"
        initialValues={
          editing
            ? { title: editing.title, color: editing.color ?? DEFAULT_BOARD_COLOR }
            : undefined
        }
        onSubmit={async (values) => {
          if (!editing) return null;
          const result = await updateBoard({ id: editing.id, ...values });
          return result.ok ? null : result.error;
        }}
      />
    </>
  );
}
