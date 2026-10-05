import { niceMax } from "@/lib/stats";

export type BarRow = {
  key: string;
  label: string;
  value: number;
  display: string;
  detail?: string;
};

/** Horizontal bars (single series) with the value at the tip. */
export function BarList({ rows, label }: { rows: BarRow[]; label: string }) {
  const max = niceMax(Math.max(...rows.map((row) => row.value)));
  return (
    <ul className="flex flex-col gap-2" aria-label={label}>
      {rows.map((row) => (
        <li
          key={row.key}
          className="grid grid-cols-[minmax(0,9rem)_1fr] items-center gap-3 text-sm"
          title={row.detail ? `${row.label}: ${row.display} (${row.detail})` : undefined}
        >
          <span className="truncate text-muted-foreground">{row.label}</span>
          <span className="flex items-center gap-2">
            <span
              aria-hidden
              className="h-3.5 rounded-r-[4px]"
              style={{
                width: `${Math.max((row.value / max) * 85, row.value > 0 ? 1 : 0)}%`,
                backgroundColor: "var(--chart-1)",
              }}
            />
            <span className="shrink-0 font-medium tabular-nums">{row.display}</span>
            {row.detail && (
              <span className="shrink-0 text-xs text-muted-foreground">{row.detail}</span>
            )}
          </span>
        </li>
      ))}
    </ul>
  );
}
