"use client";

import { FilterIcon, XIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { LabelItem } from "@/lib/board-state";
import {
  activeFilterCount,
  type BoardFilters,
  type DueFilter,
  EMPTY_FILTERS,
  NO_LABEL,
  NO_PRIORITY,
  type StatusFilter,
} from "@/lib/filters";
import { PRIORITIES, PRIORITY_VALUES } from "@/lib/priority";

const ALL = "all";

const DUE_OPTIONS: { value: DueFilter; label: string }[] = [
  { value: "overdue", label: "Scadute" },
  { value: "today", label: "In scadenza oggi" },
  { value: "week", label: "Entro 7 giorni" },
  { value: "none", label: "Senza scadenza" },
];

const STATUS_OPTIONS: { value: StatusFilter; label: string }[] = [
  { value: "open", label: "Da completare" },
  { value: "done", label: "Completate" },
];

export function BoardFiltersButton({
  labels,
  filters,
  onChange,
}: {
  labels: LabelItem[];
  filters: BoardFilters;
  onChange: (filters: BoardFilters) => void;
}) {
  const count = activeFilterCount(filters);

  function toggleLabel(id: string, checked: boolean) {
    const rest = filters.labels.filter((label) => label !== id);
    onChange({ ...filters, labels: checked ? [...rest, id] : rest });
  }

  function togglePriority(key: string, checked: boolean) {
    const rest = filters.priorities.filter((value) => value !== key);
    onChange({ ...filters, priorities: checked ? [...rest, key] : rest });
  }

  const priorityOptions = [
    ...PRIORITY_VALUES.map((value) => ({
      key: String(value),
      label: `${PRIORITIES[value].label} · ${PRIORITIES[value].name}`,
    })),
    { key: NO_PRIORITY, label: "Senza priorità" },
  ];

  const labelOptions = [...labels, { id: NO_LABEL, name: "Senza etichette", color: "" }];

  return (
    <div className="flex items-center gap-1">
      <Popover>
        <PopoverTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            className="rounded-lg bg-white/15 text-white backdrop-blur-sm hover:bg-white/25 hover:text-white data-[state=open]:bg-white/25"
          >
            <FilterIcon />
            Filtri
            {count > 0 && (
              <span className="rounded-full bg-white px-1.5 text-xs font-semibold text-neutral-900">
                {count}
              </span>
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent
          align="end"
          className="flex max-h-(--radix-popover-content-available-height) w-72 flex-col gap-4 overflow-y-auto"
        >
          <fieldset className="flex flex-col gap-1.5">
            <legend className="mb-1 text-xs font-medium text-muted-foreground">Etichette</legend>
            {labelOptions.map((label) => (
              <label key={label.id} className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={filters.labels.includes(label.id)}
                  onCheckedChange={(checked) => toggleLabel(label.id, checked === true)}
                />
                {label.color && (
                  <span className="size-3 rounded-sm" style={{ backgroundColor: label.color }} />
                )}
                <span className={label.id === NO_LABEL ? "text-muted-foreground" : undefined}>
                  {label.name || "Senza nome"}
                </span>
              </label>
            ))}
          </fieldset>

          <fieldset className="flex flex-col gap-1.5">
            <legend className="mb-1 text-xs font-medium text-muted-foreground">Priorità</legend>
            {priorityOptions.map((option) => (
              <label key={option.key} className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={filters.priorities.includes(option.key)}
                  onCheckedChange={(checked) => togglePriority(option.key, checked === true)}
                />
                <span className={option.key === NO_PRIORITY ? "text-muted-foreground" : undefined}>
                  {option.label}
                </span>
              </label>
            ))}
          </fieldset>

          <div className="flex flex-col gap-1.5">
            <span className="text-xs font-medium text-muted-foreground">Scadenza</span>
            <Select
              value={filters.due ?? ALL}
              onValueChange={(value) =>
                onChange({ ...filters, due: value === ALL ? null : (value as DueFilter) })
              }
            >
              <SelectTrigger aria-label="Filtro scadenza" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>Tutte</SelectItem>
                {DUE_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col gap-1.5">
            <span className="text-xs font-medium text-muted-foreground">Stato</span>
            <Select
              value={filters.status ?? ALL}
              onValueChange={(value) =>
                onChange({ ...filters, status: value === ALL ? null : (value as StatusFilter) })
              }
            >
              <SelectTrigger aria-label="Filtro stato" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>Tutte</SelectItem>
                {STATUS_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <Button
            variant="secondary"
            size="sm"
            disabled={count === 0}
            onClick={() => onChange(EMPTY_FILTERS)}
          >
            Cancella filtri
          </Button>
        </PopoverContent>
      </Popover>
      {count > 0 && (
        <Button
          variant="ghost"
          size="icon"
          className="size-8 text-white hover:bg-white/20 hover:text-white"
          aria-label="Cancella filtri"
          onClick={() => onChange(EMPTY_FILTERS)}
        >
          <XIcon />
        </Button>
      )}
    </div>
  );
}
