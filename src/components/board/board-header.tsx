"use client";

import { CheckIcon, MoreHorizontalIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { BOARD_COLORS } from "@/lib/board-colors";
import { updateBoard } from "@/server/actions/boards";

import { InlineTitle } from "./inline-title";

type Board = { id: string; title: string; color: string };

export function BoardHeader({
  board,
  onChange,
  children,
}: {
  board: Board;
  onChange: (board: Board) => void;
  /** Extra controls on the right (filters). */
  children?: React.ReactNode;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);

  async function save(changes: Partial<Omit<Board, "id">>) {
    const previous = board;
    onChange({ ...board, ...changes });
    const result = await updateBoard({ id: board.id, ...changes }).catch(() => null);
    if (!result?.ok) {
      onChange(previous);
      toast.error(result?.error ?? "Errore di rete, modifica annullata.");
    }
  }

  return (
    <div className="flex items-center gap-2 px-4 py-3 text-white">
      <h1 className="min-w-0 text-lg font-semibold">
        <InlineTitle
          value={board.title}
          label="Titolo della board"
          editing={editing}
          onEditingChange={setEditing}
          onSave={(title) => save({ title })}
          className="max-w-[60vw] rounded px-2 py-1 hover:bg-white/20"
          inputClassName="text-lg font-semibold"
        />
      </h1>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="size-8 text-white hover:bg-white/20 hover:text-white"
            aria-label="Azioni board"
          >
            <MoreHorizontalIcon />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-56">
          <DropdownMenuLabel>Colore</DropdownMenuLabel>
          <div className="grid grid-cols-5 gap-1.5 px-2 pb-2">
            {BOARD_COLORS.map((color) => (
              <button
                key={color.value}
                type="button"
                title={color.name}
                aria-label={color.name}
                onClick={() => save({ color: color.value })}
                className="flex size-8 items-center justify-center rounded text-white"
                style={{ backgroundColor: color.value }}
              >
                {board.color === color.value && <CheckIcon className="size-4" />}
              </button>
            ))}
          </div>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => setEditing(true)}>Rinomina</DropdownMenuItem>
          <DropdownMenuItem
            variant="destructive"
            onSelect={async () => {
              const result = await updateBoard({ id: board.id, archived: true });
              if (!result.ok) return void toast.error(result.error);
              toast.success(`Board "${board.title}" archiviata`);
              router.push("/boards");
            }}
          >
            Archivia board
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <div className="ml-auto">{children}</div>
    </div>
  );
}
