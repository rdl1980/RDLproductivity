"use client";

import {
  ArchiveIcon,
  ArchiveRestoreIcon,
  ArrowRightIcon,
  CalendarIcon,
  CheckSquareIcon,
  CopyIcon,
  TagIcon,
  TextIcon,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { Composer } from "@/components/board/composer";
import { InlineTitle } from "@/components/board/inline-title";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { CardItem, LabelItem } from "@/lib/board-state";
import { isTypingTarget } from "@/lib/dom";
import { fetchCardDetail } from "@/lib/fetch-card-detail";
import { positionAfter } from "@/lib/position";
import { PRIORITIES, PRIORITY_VALUES } from "@/lib/priority";
import {
  type CardDetail,
  type ChecklistDetail,
  type MovedCard,
  restoreCard,
  updateCardDetails,
} from "@/server/actions/card-details";
import { updateCard } from "@/server/actions/cards";
import {
  createChecklist,
  createChecklistItem,
  deleteChecklist,
  deleteChecklistItem,
  renameChecklist,
  updateChecklistItem,
} from "@/server/actions/checklists";
import { createLabel, deleteLabel, setCardLabel, updateLabel } from "@/server/actions/labels";
import type { ActionResult } from "@/server/actions/result";

import { DueBadge, LabelChips } from "./card-badges";
import { ChecklistSection } from "./checklist-section";
import { DatesForm } from "./dates-form";
import { DescriptionEditor } from "./description-editor";
import { LabelPicker } from "./label-picker";
import { MoveCopyDialog } from "./move-copy-dialog";

export type CardSummaryPatch = Omit<CardItem, "id" | "position">;

export type CardDetailCallbacks = {
  /** Fired whenever the fields shown on the card summary change. */
  onCardChange?: (cardId: string, patch: CardSummaryPatch) => void;
  onLabelsChange?: (boardId: string, labels: LabelItem[]) => void;
  /** The card was archived. */
  onCardRemoved?: (cardId: string) => void;
  /** A card was placed in a list: moved, copied or restored. */
  onCardPlaced?: (result: MovedCard) => void;
};

type Props = CardDetailCallbacks & { cardId: string | null; onClose: () => void };

export function CardDetailDialog({ cardId, onClose, ...callbacks }: Props) {
  return (
    <Dialog open={cardId !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        className="max-h-[90vh] overflow-y-auto sm:max-w-3xl"
        aria-describedby={undefined}
        // Text fields use Escape to cancel their own editing; a second Escape closes.
        onEscapeKeyDown={(event) => isTypingTarget(event.target) && event.preventDefault()}
      >
        {cardId && (
          <CardDetailContent key={cardId} cardId={cardId} onClose={onClose} {...callbacks} />
        )}
      </DialogContent>
    </Dialog>
  );
}

const NETWORK_ERROR = "Errore di rete, modifica annullata.";
const NO_PRIORITY = "none";
// Popovers scroll instead of overflowing small viewports.
const POPOVER_FIT = "max-h-(--radix-popover-content-available-height) overflow-y-auto";
const tempId = () => `temp-${crypto.randomUUID()}`;

type Update = (detail: CardDetail) => CardDetail;

function toSummary(detail: CardDetail): CardSummaryPatch {
  const items = detail.checklists.flatMap((checklist) => checklist.items);
  return {
    title: detail.title,
    dueDate: detail.dueDate,
    completed: detail.completed,
    priority: detail.priority,
    hasDescription: detail.description.trim().length > 0,
    labelIds: detail.labelIds,
    checklist: { done: items.filter((item) => item.done).length, total: items.length },
  };
}

function patchChecklist(
  detail: CardDetail,
  checklistId: string,
  update: (checklist: ChecklistDetail) => ChecklistDetail,
): CardDetail {
  return {
    ...detail,
    // Matching the key too keeps updates working across the temp id -> real id swap.
    checklists: detail.checklists.map((c) =>
      c.id === checklistId || c.key === checklistId ? update(c) : c,
    ),
  };
}

function CardDetailContent({
  cardId,
  onClose,
  onCardChange,
  onLabelsChange,
  onCardRemoved,
  onCardPlaced,
}: Omit<Props, "cardId"> & { cardId: string }) {
  const [detail, setDetail] = useState<CardDetail | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState(false);
  const [openPopover, setOpenPopover] = useState<"labels" | "dates" | "checklist" | null>(null);
  const [moveCopy, setMoveCopy] = useState<"move" | "copy" | null>(null);
  // Real ids of checklists still being created, so their items can be queued.
  const pendingChecklists = useRef(new Map<string, Promise<string>>());

  useEffect(() => {
    let cancelled = false;
    fetchCardDetail(cardId).then((result) => {
      if (cancelled) return;
      if (result.ok) setDetail(result.data);
      else setLoadError(result.error);
    });
    return () => {
      cancelled = true;
    };
  }, [cardId]);

  // Keep the board (or calendar) in sync with every local change, rollbacks included.
  const callbacks = useRef({ onCardChange, onLabelsChange });
  useEffect(() => {
    callbacks.current = { onCardChange, onLabelsChange };
  });
  useEffect(() => {
    if (detail && !detail.archived) callbacks.current.onCardChange?.(detail.id, toSummary(detail));
  }, [detail]);
  const boardLabels = detail?.board.labels;
  const boardId = detail?.board.id;
  useEffect(() => {
    if (boardId && boardLabels) callbacks.current.onLabelsChange?.(boardId, boardLabels);
  }, [boardId, boardLabels]);

  if (loadError) {
    return (
      <div className="flex flex-col gap-2">
        <DialogTitle>Card non disponibile</DialogTitle>
        <p className="text-sm text-muted-foreground">{loadError}</p>
      </div>
    );
  }
  if (!detail) {
    return (
      <div className="flex flex-col gap-3" aria-busy="true">
        <DialogTitle className="sr-only">Caricamento della card</DialogTitle>
        <div className="h-7 w-2/3 animate-pulse rounded bg-muted" />
        <div className="h-24 animate-pulse rounded bg-muted" />
      </div>
    );
  }

  /** Optimistic update of the dialog state with a functional rollback. */
  function mutate<T>(
    apply: Update,
    revert: Update,
    action: () => Promise<ActionResult<T>>,
    onSuccess?: (data: T) => void,
  ) {
    setDetail((current) => current && apply(current));
    action()
      .catch((): ActionResult<T> => ({ ok: false, error: NETWORK_ERROR }))
      .then((result) => {
        if (result.ok) onSuccess?.(result.data);
        else {
          setDetail((current) => current && revert(current));
          toast.error(result.error);
        }
      });
  }

  const card = detail;

  // --- Card fields -------------------------------------------------------------

  function rename(title: string) {
    mutate(
      (d) => ({ ...d, title }),
      (d) => ({ ...d, title: card.title }),
      () => updateCard({ id: card.id, title }),
    );
  }

  function setCompleted(completed: boolean) {
    mutate(
      (d) => ({ ...d, completed }),
      (d) => ({ ...d, completed: !completed }),
      () => updateCardDetails({ id: card.id, completed }),
    );
  }

  function setPriority(priority: number | null) {
    if (priority === card.priority) return;
    mutate(
      (d) => ({ ...d, priority }),
      (d) => ({ ...d, priority: card.priority }),
      () => updateCardDetails({ id: card.id, priority }),
    );
  }

  function saveDates(values: { startDate: string | null; dueDate: string | null }) {
    setOpenPopover(null);
    mutate(
      (d) => ({ ...d, ...values }),
      (d) => ({ ...d, startDate: card.startDate, dueDate: card.dueDate }),
      () => updateCardDetails({ id: card.id, ...values }),
    );
  }

  function saveDescription(description: string) {
    if (description === card.description) return;
    mutate(
      (d) => ({ ...d, description }),
      (d) => ({ ...d, description: card.description }),
      () => updateCardDetails({ id: card.id, description }),
    );
  }

  // --- Labels ------------------------------------------------------------------

  function toggleLabel(label: LabelItem, assigned: boolean) {
    const without = (d: CardDetail) => d.labelIds.filter((id) => id !== label.id);
    mutate(
      (d) => ({ ...d, labelIds: assigned ? [...without(d), label.id] : without(d) }),
      (d) => ({ ...d, labelIds: assigned ? without(d) : [...without(d), label.id] }),
      () => setCardLabel({ cardId: card.id, labelId: label.id, assigned }),
    );
  }

  function setBoardLabels(d: CardDetail, labels: LabelItem[]): CardDetail {
    return { ...d, board: { ...d.board, labels } };
  }

  function createBoardLabel(values: { name: string; color: string }) {
    const id = tempId();
    mutate(
      (d) => setBoardLabels(d, [...d.board.labels, { id, ...values }]),
      (d) =>
        setBoardLabels(
          d,
          d.board.labels.filter((l) => l.id !== id),
        ),
      () => createLabel({ boardId: card.board.id, ...values }),
      (saved) => {
        setDetail(
          (d) =>
            d &&
            setBoardLabels(
              d,
              d.board.labels.map((l) => (l.id === id ? { ...l, id: saved.id } : l)),
            ),
        );
        toggleLabel({ id: saved.id, ...values }, true);
      },
    );
  }

  function updateBoardLabel(label: LabelItem, values: { name: string; color: string }) {
    const replace = (d: CardDetail, next: LabelItem) =>
      setBoardLabels(
        d,
        d.board.labels.map((l) => (l.id === label.id ? next : l)),
      );
    mutate(
      (d) => replace(d, { ...label, ...values }),
      (d) => replace(d, label),
      () => updateLabel({ id: label.id, ...values }),
    );
  }

  function deleteBoardLabel(label: LabelItem) {
    const wasAssigned = card.labelIds.includes(label.id);
    mutate(
      (d) => ({
        ...setBoardLabels(
          d,
          d.board.labels.filter((l) => l.id !== label.id),
        ),
        labelIds: d.labelIds.filter((id) => id !== label.id),
      }),
      (d) => ({
        ...setBoardLabels(d, [...d.board.labels, label]),
        labelIds: wasAssigned ? [...d.labelIds, label.id] : d.labelIds,
      }),
      () => deleteLabel(label.id),
    );
  }

  // --- Checklists --------------------------------------------------------------

  function addChecklist(title: string) {
    setOpenPopover(null);
    const id = tempId();
    const position = positionAfter(card.checklists.at(-1)?.position ?? null);
    let resolve: (realId: string) => void = () => {};
    let reject: () => void = () => {};
    const saved = new Promise<string>((res, rej) => {
      resolve = res;
      reject = rej;
    });
    saved.catch(() => {});
    pendingChecklists.current.set(id, saved);
    mutate(
      // `key` survives the temp id -> real id swap so the section keeps its state.
      (d) => ({ ...d, checklists: [...d.checklists, { id, key: id, title, position, items: [] }] }),
      (d) => {
        reject();
        return { ...d, checklists: d.checklists.filter((c) => c.key !== id) };
      },
      () => createChecklist({ cardId: card.id, title }),
      (result) => {
        resolve(result.id);
        setDetail((d) => d && patchChecklist(d, id, (c) => ({ ...c, ...result })));
      },
    );
  }

  /** Resolves to the checklist's real id, waiting for its creation if needed. */
  function checklistId(checklist: ChecklistDetail): Promise<string> {
    return pendingChecklists.current.get(checklist.id) ?? Promise.resolve(checklist.id);
  }

  /** Runs `action` once the checklist exists on the server. */
  function onChecklist<T>(
    checklist: ChecklistDetail,
    action: (id: string) => Promise<ActionResult<T>>,
  ) {
    return () =>
      checklistId(checklist).then(
        (id) => action(id),
        (): ActionResult<T> => ({ ok: false, error: "La checklist non è stata salvata." }),
      );
  }

  function checklistActions(checklist: ChecklistDetail) {
    const ref = checklist.key ?? checklist.id;
    return {
      onRename: (title: string) =>
        mutate(
          (d) => patchChecklist(d, ref, (c) => ({ ...c, title })),
          (d) => patchChecklist(d, ref, (c) => ({ ...c, title: checklist.title })),
          onChecklist(checklist, (id) => renameChecklist({ id, title })),
        ),
      onDelete: () => {
        const index = card.checklists.findIndex((c) => c.id === checklist.id);
        mutate(
          (d) => ({
            ...d,
            checklists: d.checklists.filter((c) => c.id !== checklist.id && c.key !== ref),
          }),
          (d) => ({
            ...d,
            checklists: [...d.checklists.slice(0, index), checklist, ...d.checklists.slice(index)],
          }),
          onChecklist(checklist, (id) => deleteChecklist(id)),
        );
      },
      onAddItem: (text: string) => {
        const id = tempId();
        const position = positionAfter(checklist.items.at(-1)?.position ?? null);
        mutate(
          (d) =>
            patchChecklist(d, ref, (c) => ({
              ...c,
              items: [...c.items, { id, text, done: false, position }],
            })),
          (d) =>
            patchChecklist(d, ref, (c) => ({
              ...c,
              items: c.items.filter((i) => i.id !== id),
            })),
          onChecklist(checklist, (checklistId) => createChecklistItem({ checklistId, text })),
          (saved) =>
            setDetail(
              (d) =>
                d &&
                patchChecklist(d, ref, (c) => ({
                  ...c,
                  items: c.items.map((i) => (i.id === id ? { ...i, ...saved } : i)),
                })),
            ),
        );
      },
      onUpdateItem: (
        item: ChecklistDetail["items"][number],
        changes: { text?: string; done?: boolean },
      ) =>
        mutate(
          (d) =>
            patchChecklist(d, ref, (c) => ({
              ...c,
              items: c.items.map((i) => (i.id === item.id ? { ...i, ...changes } : i)),
            })),
          (d) =>
            patchChecklist(d, ref, (c) => ({
              ...c,
              items: c.items.map((i) =>
                i.id === item.id ? { ...i, text: item.text, done: item.done } : i,
              ),
            })),
          () => updateChecklistItem({ id: item.id, ...changes }),
        ),
      onDeleteItem: (item: ChecklistDetail["items"][number]) => {
        const index = checklist.items.findIndex((i) => i.id === item.id);
        mutate(
          (d) =>
            patchChecklist(d, ref, (c) => ({
              ...c,
              items: c.items.filter((i) => i.id !== item.id),
            })),
          (d) =>
            patchChecklist(d, ref, (c) => ({
              ...c,
              items: [...c.items.slice(0, index), item, ...c.items.slice(index)],
            })),
          () => deleteChecklistItem(item.id),
        );
      },
    };
  }

  // --- Archive, restore, move, copy -------------------------------------------

  async function archive() {
    const result = await updateCard({ id: card.id, archived: true }).catch(() => null);
    if (!result?.ok) return void toast.error(result?.error ?? NETWORK_ERROR);
    toast.success("Card archiviata");
    onCardRemoved?.(card.id);
    onClose();
  }

  async function restore() {
    const result = await restoreCard(card.id).catch(() => null);
    if (!result?.ok) return void toast.error(result?.error ?? NETWORK_ERROR);
    setDetail((d) => d && { ...d, archived: false });
    onCardPlaced?.(result.data);
    toast.success("Card ripristinata");
  }

  const sidebarButton = "w-full justify-start";

  return (
    <div className="flex flex-col gap-5">
      {card.archived && (
        <div className="flex items-center justify-between gap-2 rounded-md bg-amber-100 p-3 text-sm text-amber-950">
          Questa card è archiviata.
          <Button size="sm" variant="secondary" onClick={restore}>
            <ArchiveRestoreIcon />
            Ripristina
          </Button>
        </div>
      )}

      <header className="flex flex-col gap-1 pr-8">
        <DialogTitle className="text-xl">
          <InlineTitle
            value={card.title}
            label="Titolo della card"
            editing={editingTitle}
            onEditingChange={setEditingTitle}
            onSave={rename}
            className="w-full rounded px-1 text-left break-words whitespace-normal"
            inputClassName="text-lg"
          />
        </DialogTitle>
        <DialogDescription className="px-1">
          nella lista <span className="font-medium">{card.list.title}</span> · {card.board.title}
        </DialogDescription>
      </header>

      <div className="grid gap-6 md:grid-cols-[1fr_11rem]">
        <div className="flex min-w-0 flex-col gap-6">
          <div className="flex flex-wrap gap-6">
            {card.labelIds.length > 0 && (
              <div className="flex flex-col gap-1.5">
                <h3 className="text-xs font-medium text-muted-foreground">Etichette</h3>
                <LabelChips labelIds={card.labelIds} labels={card.board.labels} size="md" />
              </div>
            )}
            {card.dueDate && (
              <div className="flex flex-col gap-1.5">
                <h3 className="text-xs font-medium text-muted-foreground">Scadenza</h3>
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox
                    aria-label="Completata"
                    checked={card.completed}
                    onCheckedChange={(checked) => setCompleted(checked === true)}
                  />
                  <DueBadge dueDate={card.dueDate} completed={card.completed} className="text-sm" />
                </label>
              </div>
            )}
            <div className="flex flex-col gap-1.5">
              <h3 className="text-xs font-medium text-muted-foreground">Priorità</h3>
              <Select
                value={card.priority === null ? NO_PRIORITY : String(card.priority)}
                onValueChange={(value) => setPriority(value === NO_PRIORITY ? null : Number(value))}
              >
                <SelectTrigger aria-label="Priorità" size="sm" className="w-36">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_PRIORITY}>Nessuna</SelectItem>
                  {PRIORITY_VALUES.map((value) => (
                    <SelectItem key={value} value={String(value)}>
                      <span
                        className={`rounded px-1 text-xs font-semibold ${PRIORITIES[value].className}`}
                      >
                        {PRIORITIES[value].label}
                      </span>
                      {PRIORITIES[value].name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {!card.dueDate && (
              <label className="flex items-center gap-2 self-end text-sm">
                <Checkbox
                  aria-label="Completata"
                  checked={card.completed}
                  onCheckedChange={(checked) => setCompleted(checked === true)}
                />
                Completata
              </label>
            )}
          </div>

          <section className="flex flex-col gap-2">
            <h3 className="flex items-center gap-2 font-semibold">
              <TextIcon className="size-4 text-muted-foreground" />
              Descrizione
            </h3>
            <DescriptionEditor value={card.description} onSave={saveDescription} />
          </section>

          {card.checklists.map((checklist) => (
            <ChecklistSection
              key={checklist.key ?? checklist.id}
              checklist={checklist}
              {...checklistActions(checklist)}
            />
          ))}
        </div>

        <aside className="flex flex-col gap-2" aria-label="Azioni card">
          <h3 className="text-xs font-medium text-muted-foreground">Aggiungi alla card</h3>
          <Popover
            open={openPopover === "labels"}
            onOpenChange={(open) => setOpenPopover(open ? "labels" : null)}
          >
            <PopoverTrigger asChild>
              <Button variant="secondary" size="sm" className={sidebarButton}>
                <TagIcon />
                Etichette
              </Button>
            </PopoverTrigger>
            <PopoverContent
              side="left"
              align="start"
              collisionPadding={8}
              className={`w-72 ${POPOVER_FIT}`}
            >
              <LabelPicker
                labels={card.board.labels}
                assignedIds={card.labelIds}
                onToggle={toggleLabel}
                onCreate={createBoardLabel}
                onUpdate={updateBoardLabel}
                onDelete={deleteBoardLabel}
              />
            </PopoverContent>
          </Popover>
          <Popover
            open={openPopover === "dates"}
            onOpenChange={(open) => setOpenPopover(open ? "dates" : null)}
          >
            <PopoverTrigger asChild>
              <Button variant="secondary" size="sm" className={sidebarButton}>
                <CalendarIcon />
                Date
              </Button>
            </PopoverTrigger>
            <PopoverContent
              side="left"
              align="start"
              collisionPadding={8}
              className={`w-80 ${POPOVER_FIT}`}
            >
              <DatesForm
                initial={{ startDate: card.startDate, dueDate: card.dueDate }}
                onSave={saveDates}
              />
            </PopoverContent>
          </Popover>
          <Popover
            open={openPopover === "checklist"}
            onOpenChange={(open) => setOpenPopover(open ? "checklist" : null)}
          >
            <PopoverTrigger asChild>
              <Button variant="secondary" size="sm" className={sidebarButton}>
                <CheckSquareIcon />
                Checklist
              </Button>
            </PopoverTrigger>
            <PopoverContent
              side="left"
              align="start"
              collisionPadding={8}
              className={`w-72 ${POPOVER_FIT}`}
            >
              <p className="mb-2 text-center text-sm font-medium">Aggiungi checklist</p>
              <Composer
                placeholder="Titolo della checklist"
                submitLabel="Aggiungi"
                onSubmit={addChecklist}
                onClose={() => setOpenPopover(null)}
              />
            </PopoverContent>
          </Popover>

          <h3 className="mt-3 text-xs font-medium text-muted-foreground">Azioni</h3>
          <Button
            variant="secondary"
            size="sm"
            className={sidebarButton}
            onClick={() => setMoveCopy("move")}
          >
            <ArrowRightIcon />
            Sposta
          </Button>
          <Button
            variant="secondary"
            size="sm"
            className={sidebarButton}
            onClick={() => setMoveCopy("copy")}
          >
            <CopyIcon />
            Copia
          </Button>
          {!card.archived && (
            <Button variant="secondary" size="sm" className={sidebarButton} onClick={archive}>
              <ArchiveIcon />
              Archivia
            </Button>
          )}
        </aside>
      </div>

      <MoveCopyDialog
        mode={moveCopy}
        card={{ id: card.id, title: card.title, boardId: card.board.id, listId: card.list.id }}
        onOpenChange={(open) => !open && setMoveCopy(null)}
        onDone={(mode, result) => {
          setMoveCopy(null);
          onCardPlaced?.(result);
          if (mode === "move") {
            toast.success("Card spostata");
            // Reload so list, board and labels reflect the new location.
            fetchCardDetail(card.id).then((r) => r.ok && setDetail(r.data));
          } else {
            toast.success("Copia creata");
          }
        }}
      />
    </div>
  );
}
