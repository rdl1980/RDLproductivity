"use client";

import { CheckSquareIcon, Trash2Icon } from "lucide-react";
import { useState } from "react";

import { Composer } from "@/components/board/composer";
import { InlineTitle } from "@/components/board/inline-title";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import type { ChecklistDetail, ChecklistItemDetail } from "@/server/actions/card-details";

type Props = {
  checklist: ChecklistDetail;
  onRename: (title: string) => void;
  onDelete: () => void;
  onAddItem: (text: string) => void;
  onUpdateItem: (item: ChecklistItemDetail, changes: { text?: string; done?: boolean }) => void;
  onDeleteItem: (item: ChecklistItemDetail) => void;
};

export function ChecklistSection({
  checklist,
  onRename,
  onDelete,
  onAddItem,
  onUpdateItem,
  onDeleteItem,
}: Props) {
  const [editingTitle, setEditingTitle] = useState(false);
  const [adding, setAdding] = useState(false);
  const done = checklist.items.filter((item) => item.done).length;
  const total = checklist.items.length;
  const percent = total === 0 ? 0 : Math.round((done / total) * 100);

  return (
    <section aria-label={`Checklist ${checklist.title}`} className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <CheckSquareIcon className="size-4 shrink-0 text-muted-foreground" />
        <div className="min-w-0 flex-1">
          <InlineTitle
            value={checklist.title}
            label="Titolo della checklist"
            editing={editingTitle}
            onEditingChange={setEditingTitle}
            onSave={onRename}
            className="w-full rounded px-1 font-semibold"
          />
        </div>
        <Button variant="secondary" size="sm" onClick={onDelete}>
          Elimina
        </Button>
      </div>

      <div className="flex items-center gap-2">
        <span className="w-9 text-right text-xs text-muted-foreground">{percent}%</span>
        <div
          className="h-2 flex-1 overflow-hidden rounded-full bg-muted"
          role="progressbar"
          aria-label={`Avanzamento ${checklist.title}`}
          aria-valuenow={percent}
          aria-valuemin={0}
          aria-valuemax={100}
        >
          <div
            className={percent === 100 ? "h-full bg-green-600" : "h-full bg-primary"}
            style={{ width: `${percent}%` }}
          />
        </div>
      </div>

      <ul className="flex flex-col">
        {checklist.items.map((item) => (
          <ChecklistItemRow
            key={item.id}
            item={item}
            onUpdate={(changes) => onUpdateItem(item, changes)}
            onDelete={() => onDeleteItem(item)}
          />
        ))}
      </ul>

      <div className="pl-11">
        {adding ? (
          <Composer
            placeholder="Aggiungi un elemento"
            submitLabel="Aggiungi"
            onSubmit={onAddItem}
            onClose={() => setAdding(false)}
          />
        ) : (
          <Button variant="secondary" size="sm" onClick={() => setAdding(true)}>
            Aggiungi un elemento
          </Button>
        )}
      </div>
    </section>
  );
}

function ChecklistItemRow({
  item,
  onUpdate,
  onDelete,
}: {
  item: ChecklistItemDetail;
  onUpdate: (changes: { text?: string; done?: boolean }) => void;
  onDelete: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const pending = item.id.startsWith("temp-");
  return (
    <li className="group flex items-center gap-3 rounded-md py-1 pr-1 pl-2 hover:bg-muted/60">
      <Checkbox
        aria-label={item.text}
        checked={item.done}
        disabled={pending}
        onCheckedChange={(checked) => onUpdate({ done: checked === true })}
      />
      <div className="min-w-0 flex-1 text-sm">
        <InlineTitle
          value={item.text}
          label="Testo dell'elemento"
          editing={editing}
          onEditingChange={(value) => !pending && setEditing(value)}
          onSave={(text) => onUpdate({ text })}
          className={item.done ? "w-full text-muted-foreground line-through" : "w-full"}
        />
      </div>
      <Button
        variant="ghost"
        size="icon"
        className="size-7 opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
        aria-label={`Elimina ${item.text}`}
        disabled={pending}
        onClick={onDelete}
      >
        <Trash2Icon />
      </Button>
    </li>
  );
}
