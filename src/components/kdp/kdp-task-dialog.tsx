"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { KdpTaskItem } from "@/lib/kdp";

type Props = {
  task: KdpTaskItem | null;
  accountName: string;
  weekName: string;
  onClose: () => void;
  onSave: (fields: { title: string; notes: string | null }) => void;
  onDelete: () => void;
};

export function KdpTaskDialog({ task, accountName, weekName, onClose, onSave, onDelete }: Props) {
  return (
    <Dialog open={task !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:rounded-2xl">
        {task && (
          // Keyed form: fields reset when another task opens.
          <TaskForm
            key={task.id}
            task={task}
            accountName={accountName}
            weekName={weekName}
            onClose={onClose}
            onSave={onSave}
            onDelete={onDelete}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function TaskForm({
  task,
  accountName,
  weekName,
  onClose,
  onSave,
  onDelete,
}: Omit<Props, "task"> & { task: KdpTaskItem }) {
  const [title, setTitle] = useState(task.title);
  const [notes, setNotes] = useState(task.notes ?? "");

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        const value = title.trim();
        if (!value) return;
        if (value !== task.title || notes !== (task.notes ?? "")) {
          onSave({ title: value, notes: notes.trim() ? notes : null });
        }
        onClose();
      }}
    >
      <DialogHeader>
        <DialogTitle>Attività KDP</DialogTitle>
        <DialogDescription>
          {accountName} · settimana {weekName}
        </DialogDescription>
      </DialogHeader>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="kdp-title">Titolo</Label>
        <Input
          id="kdp-title"
          value={title}
          maxLength={200}
          onChange={(event) => setTitle(event.target.value)}
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="kdp-notes">Note</Label>
        <Textarea
          id="kdp-notes"
          value={notes}
          rows={5}
          maxLength={5000}
          onChange={(event) => setNotes(event.target.value)}
          placeholder="Dettagli, link, ASIN…"
        />
      </div>
      <DialogFooter className="gap-2 sm:justify-between">
        <Button type="button" variant="destructive" onClick={onDelete}>
          Elimina
        </Button>
        <div className="flex gap-2">
          <Button type="button" variant="outline" onClick={onClose}>
            Annulla
          </Button>
          <Button type="submit" disabled={!title.trim()}>
            Salva
          </Button>
        </div>
      </DialogFooter>
    </form>
  );
}
