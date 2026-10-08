/** Card priorities: P0 is the highest, P4 the lowest; null means none. */
export const PRIORITY_VALUES = [0, 1, 2, 3, 4] as const;
export type Priority = (typeof PRIORITY_VALUES)[number];

/**
 * Tinted badges (≥ 4.5:1 in both themes); only P0 is solid, so it stands out.
 * `dot` is the solid swatch used in pickers and lane headers.
 */
export const PRIORITIES: Record<
  Priority,
  { label: string; name: string; className: string; dot: string }
> = {
  0: {
    label: "P0",
    name: "Critica",
    className: "bg-red-700 text-white",
    dot: "bg-red-600",
  },
  1: {
    label: "P1",
    name: "Alta",
    className: "bg-orange-100 text-orange-800 dark:bg-orange-500/15 dark:text-orange-300",
    dot: "bg-orange-500",
  },
  2: {
    label: "P2",
    name: "Media",
    className: "bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300",
    dot: "bg-amber-400",
  },
  3: {
    label: "P3",
    name: "Bassa",
    className: "bg-sky-100 text-sky-800 dark:bg-sky-500/15 dark:text-sky-300",
    dot: "bg-sky-500",
  },
  4: {
    label: "P4",
    name: "Minima",
    className: "bg-slate-100 text-slate-700 dark:bg-slate-500/20 dark:text-slate-300",
    dot: "bg-slate-400",
  },
};

/** Priorities collected on the super board (the expedite lane is P0). */
export const SUPER_BOARD_PRIORITIES: Priority[] = [0, 1];

export function isPriority(value: unknown): value is Priority {
  return typeof value === "number" && (PRIORITY_VALUES as readonly number[]).includes(value);
}

export function priorityLabel(priority: number | null): string {
  return isPriority(priority)
    ? `${PRIORITIES[priority].label} · ${PRIORITIES[priority].name}`
    : "Nessuna";
}

/** Sort key: cards without priority go last. */
export function priorityRank(priority: number | null): number {
  return priority ?? PRIORITY_VALUES.length;
}
