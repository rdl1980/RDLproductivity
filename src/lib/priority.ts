/** Card priorities: P0 is the highest, P4 the lowest; null means none. */
export const PRIORITY_VALUES = [0, 1, 2, 3, 4] as const;
export type Priority = (typeof PRIORITY_VALUES)[number];

export const PRIORITIES: Record<Priority, { label: string; name: string; className: string }> = {
  0: { label: "P0", name: "Critica", className: "bg-red-600 text-white" },
  1: { label: "P1", name: "Alta", className: "bg-orange-500 text-orange-950" },
  2: { label: "P2", name: "Media", className: "bg-amber-300 text-amber-950" },
  3: { label: "P3", name: "Bassa", className: "bg-sky-200 text-sky-950" },
  4: { label: "P4", name: "Minima", className: "bg-slate-200 text-slate-800" },
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
