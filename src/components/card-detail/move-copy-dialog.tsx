"use client";

import { useEffect, useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  copyCard,
  getMoveTargets,
  type MovedCard,
  moveCardToList,
} from "@/server/actions/card-details";

type Target = { id: string; title: string; lists: { id: string; title: string }[] };

type Props = {
  mode: "move" | "copy" | null;
  card: { id: string; title: string; boardId: string; listId: string };
  onOpenChange: (open: boolean) => void;
  onDone: (mode: "move" | "copy", result: MovedCard) => void;
};

export function MoveCopyDialog({ mode, card, onOpenChange, onDone }: Props) {
  return (
    <Dialog open={mode !== null} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        {mode && (
          <MoveCopyForm key={mode} mode={mode} card={card} onDone={(r) => onDone(mode, r)} />
        )}
      </DialogContent>
    </Dialog>
  );
}

function MoveCopyForm({
  mode,
  card,
  onDone,
}: {
  mode: "move" | "copy";
  card: Props["card"];
  onDone: (result: MovedCard) => void;
}) {
  const [targets, setTargets] = useState<Target[] | null>(null);
  const [boardId, setBoardId] = useState(card.boardId);
  const [listId, setListId] = useState(card.listId);
  const [placement, setPlacement] = useState<"top" | "bottom">("bottom");
  const [title, setTitle] = useState(card.title);
  const [keepLabels, setKeepLabels] = useState(true);
  const [keepChecklists, setKeepChecklists] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    getMoveTargets().then((result) => {
      if (result.ok) setTargets(result.data);
      else setError(result.error);
    });
  }, []);

  const lists = targets?.find((board) => board.id === boardId)?.lists ?? [];
  const sameBoard = boardId === card.boardId;

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        startTransition(async () => {
          const result =
            mode === "move"
              ? await moveCardToList({ id: card.id, listId, placement })
              : await copyCard({
                  id: card.id,
                  listId,
                  placement,
                  title,
                  keepLabels,
                  keepChecklists,
                });
          if (result.ok) onDone(result.data);
          else setError(result.error);
        });
      }}
    >
      <DialogHeader>
        <DialogTitle>{mode === "move" ? "Sposta card" : "Copia card"}</DialogTitle>
        <DialogDescription>Scegli board, lista e posizione di destinazione.</DialogDescription>
      </DialogHeader>

      {mode === "copy" && (
        <label className="flex flex-col gap-1.5 text-sm font-medium">
          Titolo
          <Input value={title} maxLength={200} onChange={(event) => setTitle(event.target.value)} />
        </label>
      )}

      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2 flex flex-col gap-1.5 text-sm font-medium">
          Board
          <Select
            value={boardId}
            disabled={!targets}
            onValueChange={(value) => {
              setBoardId(value);
              setListId(targets?.find((board) => board.id === value)?.lists[0]?.id ?? "");
            }}
          >
            <SelectTrigger aria-label="Board" className="w-full">
              <SelectValue placeholder="Caricamento…" />
            </SelectTrigger>
            <SelectContent>
              {targets?.map((board) => (
                <SelectItem key={board.id} value={board.id}>
                  {board.title}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-1.5 text-sm font-medium">
          Lista
          <Select
            value={listId}
            disabled={!targets || lists.length === 0}
            onValueChange={setListId}
          >
            <SelectTrigger aria-label="Lista" className="w-full">
              <SelectValue placeholder="Nessuna lista" />
            </SelectTrigger>
            <SelectContent>
              {lists.map((list) => (
                <SelectItem key={list.id} value={list.id}>
                  {list.title}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-1.5 text-sm font-medium">
          Posizione
          <Select
            value={placement}
            onValueChange={(value) => setPlacement(value as "top" | "bottom")}
          >
            <SelectTrigger aria-label="Posizione" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="top">In cima</SelectItem>
              <SelectItem value="bottom">In fondo</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {mode === "copy" && (
        <div className="flex flex-col gap-2 text-sm">
          <label className="flex items-center gap-2">
            <Checkbox
              checked={keepLabels && sameBoard}
              disabled={!sameBoard}
              onCheckedChange={(checked) => setKeepLabels(checked === true)}
            />
            Mantieni le etichette
            {!sameBoard && (
              <span className="text-xs text-muted-foreground">(solo nella stessa board)</span>
            )}
          </label>
          <label className="flex items-center gap-2">
            <Checkbox
              checked={keepChecklists}
              onCheckedChange={(checked) => setKeepChecklists(checked === true)}
            />
            Mantieni le checklist
          </label>
        </div>
      )}

      {mode === "move" && !sameBoard && (
        <p className="text-xs text-muted-foreground">
          Spostando la card in un&apos;altra board le etichette verranno rimosse.
        </p>
      )}

      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}

      <DialogFooter>
        <Button type="submit" disabled={pending || !listId || (mode === "copy" && !title.trim())}>
          {mode === "move" ? "Sposta" : "Crea copia"}
        </Button>
      </DialogFooter>
    </form>
  );
}
