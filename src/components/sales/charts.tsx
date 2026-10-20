"use client";

import { useEffect, useRef, useState } from "react";

import { niceMax } from "@/lib/stats";
import { cn } from "@/lib/utils";

/*
 * Small SVG charts for the sales dashboard. Specs (see docs/ARCHITECTURE.md,
 * "Vendite KDP"): columns ≤ 24px with a 4px rounded top and a 2px surface gap
 * between stacked segments, 2px lines, end dots with a surface ring, solid
 * hairline grid, selective direct labels, hover/focus tooltips. Every chart has
 * a table view next to it, so a tooltip never gates a value.
 */

const DEFAULT_WIDTH = 640;

/**
 * Width of the chart's box in CSS pixels. The SVG viewBox uses it, so 11px
 * text stays 11px whatever the screen (a fixed viewBox would scale it).
 */
function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(DEFAULT_WIDTH);
  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const observer = new ResizeObserver(([entry]) => {
      const next = Math.round(entry.contentRect.width);
      if (next > 0) setWidth(next);
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  return [ref, width] as const;
}
const RADIUS = 4;
const GAP = 2;

export type Series = { key: string; label: string; color: string };

/** Column with a rounded top and a square base. */
function topRounded(x: number, y: number, w: number, h: number) {
  if (h <= 0) return "";
  const r = Math.min(RADIUS, h, w / 2);
  return `M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h}Z`;
}

function Tooltip({
  x,
  children,
  edge,
}: {
  /** Horizontal position as a fraction of the chart width. */
  x: number;
  edge: "start" | "middle" | "end";
  children: React.ReactNode;
}) {
  return (
    <div
      role="status"
      className="pointer-events-none absolute top-0 z-10 rounded-md border bg-popover px-2.5 py-1.5 text-xs whitespace-nowrap text-popover-foreground shadow-md"
      style={{
        left: `${x * 100}%`,
        transform: `translateX(${edge === "end" ? "-100%" : edge === "start" ? "0" : "-50%"})`,
      }}
    >
      {children}
    </div>
  );
}

const edgeOf = (i: number, n: number) => (i < n * 0.2 ? "start" : i > n * 0.8 ? "end" : "middle");

export function Legend({ series }: { series: Series[] }) {
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
      {series.map((s) => (
        <li key={s.key} className="flex items-center gap-1.5">
          <span
            aria-hidden
            className="size-2.5 rounded-[3px]"
            style={{ backgroundColor: s.color }}
          />
          {s.label}
        </li>
      ))}
    </ul>
  );
}

function YAxis({
  max,
  y,
  left,
  right,
  format,
}: {
  max: number;
  y: (v: number) => number;
  left: number;
  right: number;
  format: (v: number) => string;
}) {
  return (
    <>
      {[0, max / 2, max].map((tick) => (
        <g key={tick}>
          <line
            x1={left}
            x2={right}
            y1={y(tick)}
            y2={y(tick)}
            className={tick === 0 ? "stroke-border" : "stroke-border/50"}
          />
          <text
            x={left - 6}
            y={y(tick)}
            dy="0.32em"
            textAnchor="end"
            className="fill-muted-foreground text-[11px] tabular-nums"
          >
            {format(tick)}
          </text>
        </g>
      ))}
    </>
  );
}

/** Indexes of the x labels to draw: about `count`, always including the last. */
function labelIndexes(n: number, count = 6) {
  const step = Math.max(1, Math.ceil(n / count));
  const set = new Set<number>();
  for (let i = n - 1; i >= 0; i -= step) set.add(i);
  return set;
}

export type ColumnDatum = { label: string; detail: string; values: number[] };

/** Stacked columns over time (one series = plain columns). */
export function StackedColumns({
  data,
  series,
  format,
  formatAxis,
  label,
  height = 220,
}: {
  data: ColumnDatum[];
  series: Series[];
  format: (v: number) => string;
  formatAxis: (v: number) => string;
  label: string;
  height?: number;
}) {
  const [box, WIDTH] = useWidth<HTMLDivElement>();
  const [active, setActive] = useState<number | null>(null);
  const pad = { top: 18, right: 8, bottom: 24, left: 52 };
  const totals = data.map((d) => d.values.reduce((a, b) => a + b, 0));
  const max = niceMax(Math.max(0, ...totals));
  const plotW = WIDTH - pad.left - pad.right;
  const plotH = height - pad.top - pad.bottom;
  const slot = plotW / Math.max(1, data.length);
  const barW = Math.max(1, Math.min(24, slot * 0.7));
  const y = (v: number) => pad.top + plotH - (v / max) * plotH;
  const peak = totals.reduce((best, t, i) => (t > totals[best] ? i : best), 0);
  const labels = labelIndexes(
    data.length,
    data.length <= 12 ? data.length : Math.max(3, Math.floor(WIDTH / 110)),
  );

  return (
    <div ref={box} className="relative">
      <svg
        viewBox={`0 0 ${WIDTH} ${height}`}
        className="h-auto w-full overflow-visible"
        role="group"
        aria-label={label}
        onPointerLeave={() => setActive(null)}
      >
        <YAxis max={max} y={y} left={pad.left} right={WIDTH - pad.right} format={formatAxis} />
        {data.map((d, i) => {
          const x = pad.left + slot * i + (slot - barW) / 2;
          let base = pad.top + plotH;
          const top = series.findLastIndex((_, s) => d.values[s] > 0);
          return (
            <g key={i} opacity={active === null || active === i ? 1 : 0.55}>
              {series.map((s, si) => {
                const h = (d.values[si] / max) * plotH;
                if (h <= 0) return null;
                // 2px surface gap between stacked segments.
                const drawn = Math.max(0.5, h - (si < top ? GAP : 0));
                const yTop = base - h;
                base = yTop;
                return si === top ? (
                  <path key={s.key} d={topRounded(x, yTop, barW, drawn)} fill={s.color} />
                ) : (
                  <rect
                    key={s.key}
                    x={x}
                    y={yTop + (h - drawn)}
                    width={barW}
                    height={drawn}
                    fill={s.color}
                  />
                );
              })}
              {i === peak && totals[i] > 0 && (
                <text
                  x={x + barW / 2}
                  y={y(totals[i]) - 5}
                  textAnchor="middle"
                  className="fill-foreground text-[11px] font-medium"
                >
                  {format(totals[i])}
                </text>
              )}
              {labels.has(i) && (
                <text
                  x={x + barW / 2}
                  y={height - 6}
                  textAnchor="middle"
                  className="fill-muted-foreground text-[11px]"
                >
                  {d.label}
                </text>
              )}
              <rect
                x={pad.left + slot * i}
                y={pad.top}
                width={slot}
                height={plotH}
                fill="transparent"
                tabIndex={0}
                role="img"
                aria-label={`${d.detail}: ${format(totals[i])}`}
                onPointerEnter={() => setActive(i)}
                onFocus={() => setActive(i)}
                onBlur={() => setActive(null)}
                className="outline-none focus-visible:stroke-ring"
              />
            </g>
          );
        })}
      </svg>
      {active !== null && (
        <Tooltip x={(pad.left + slot * (active + 0.5)) / WIDTH} edge={edgeOf(active, data.length)}>
          <p className="mb-1 font-medium">{data[active].detail}</p>
          {series.length > 1 &&
            series.map((s, si) => (
              <p key={s.key} className="flex items-center gap-1.5">
                <span
                  aria-hidden
                  className="size-2 rounded-[2px]"
                  style={{ backgroundColor: s.color }}
                />
                <span className="text-muted-foreground">{s.label}</span>
                <span className="ml-auto pl-3 tabular-nums">{format(data[active].values[si])}</span>
              </p>
            ))}
          <p className={cn("tabular-nums", series.length > 1 && "mt-1 border-t pt-1 font-medium")}>
            {series.length > 1 ? "Totale " : ""}
            {format(totals[active])}
          </p>
        </Tooltip>
      )}
    </div>
  );
}

export type LinePoint = { label: string; detail: string; value: number };

/** One series over time, with a 10% area wash and the last value labelled. */
export function AreaLine({
  data,
  format,
  formatAxis,
  label,
  color = "var(--chart-1)",
  height = 200,
}: {
  data: LinePoint[];
  format: (v: number) => string;
  formatAxis: (v: number) => string;
  label: string;
  color?: string;
  height?: number;
}) {
  const [box, WIDTH] = useWidth<HTMLDivElement>();
  const [active, setActive] = useState<number | null>(null);
  const pad = { top: 18, right: 56, bottom: 24, left: 52 };
  const max = niceMax(Math.max(0, ...data.map((d) => d.value)));
  const plotW = WIDTH - pad.left - pad.right;
  const plotH = height - pad.top - pad.bottom;
  const x = (i: number) =>
    pad.left + (data.length > 1 ? (i / (data.length - 1)) * plotW : plotW / 2);
  const y = (v: number) => pad.top + plotH - (v / max) * plotH;
  const line = data.map((d, i) => `${i ? "L" : "M"}${x(i)},${y(d.value)}`).join("");
  const area = data.length
    ? `${line}L${x(data.length - 1)},${pad.top + plotH}L${x(0)},${pad.top + plotH}Z`
    : "";
  const last = data.length - 1;
  const labels = labelIndexes(data.length);
  const slot = plotW / Math.max(1, data.length - 1);

  return (
    <div ref={box} className="relative">
      <svg
        viewBox={`0 0 ${WIDTH} ${height}`}
        className="h-auto w-full overflow-visible"
        role="group"
        aria-label={label}
        onPointerLeave={() => setActive(null)}
      >
        <YAxis max={max} y={y} left={pad.left} right={WIDTH - pad.right} format={formatAxis} />
        <path d={area} fill={color} opacity={0.1} />
        <path
          d={line}
          fill="none"
          stroke={color}
          strokeWidth={2}
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        {data.map((d, i) =>
          labels.has(i) ? (
            <text
              key={i}
              x={x(i)}
              y={height - 6}
              textAnchor="middle"
              className="fill-muted-foreground text-[11px]"
            >
              {d.label}
            </text>
          ) : null,
        )}
        {active !== null && (
          <line
            x1={x(active)}
            x2={x(active)}
            y1={pad.top}
            y2={pad.top + plotH}
            className="stroke-muted-foreground/50"
          />
        )}
        {last >= 0 && (
          <>
            <circle
              cx={x(last)}
              cy={y(data[last].value)}
              r={4}
              fill={color}
              className="stroke-background"
              strokeWidth={2}
            />
            <text
              x={x(last) + 8}
              y={y(data[last].value)}
              dy="0.32em"
              className="fill-foreground text-[11px] font-medium"
            >
              {format(data[last].value)}
            </text>
          </>
        )}
        {active !== null && (
          <circle
            cx={x(active)}
            cy={y(data[active].value)}
            r={4}
            fill={color}
            className="stroke-background"
            strokeWidth={2}
          />
        )}
        {data.map((d, i) => (
          <rect
            key={i}
            x={x(i) - slot / 2}
            y={pad.top}
            width={Math.max(slot, 4)}
            height={plotH}
            fill="transparent"
            tabIndex={0}
            role="img"
            aria-label={`${d.detail}: ${format(d.value)}`}
            onPointerEnter={() => setActive(i)}
            onFocus={() => setActive(i)}
            onBlur={() => setActive(null)}
            className="outline-none"
          />
        ))}
      </svg>
      {active !== null && (
        <Tooltip x={x(active) / WIDTH} edge={edgeOf(active, data.length)}>
          <span className="text-muted-foreground">{data[active].detail}</span>{" "}
          <strong className="font-semibold tabular-nums">{format(data[active].value)}</strong>
        </Tooltip>
      )}
    </div>
  );
}

/** Up to three series over the same x (e.g. launch curves), legend + end labels. */
export function MultiLine({
  xs,
  series,
  values,
  format,
  xLabel,
  label,
  height = 220,
}: {
  xs: number[];
  series: Series[];
  values: number[][];
  format: (v: number) => string;
  xLabel: (x: number) => string;
  label: string;
  height?: number;
}) {
  const [box, WIDTH] = useWidth<HTMLDivElement>();
  const [active, setActive] = useState<number | null>(null);
  const pad = { top: 16, right: 48, bottom: 24, left: 44 };
  const max = niceMax(Math.max(0, ...values.flat()));
  const plotW = WIDTH - pad.left - pad.right;
  const plotH = height - pad.top - pad.bottom;
  const n = xs.length;
  const x = (i: number) => pad.left + (n > 1 ? (i / (n - 1)) * plotW : 0);
  const y = (v: number) => pad.top + plotH - (v / max) * plotH;
  const labels = labelIndexes(n, 7);
  const slot = plotW / Math.max(1, n - 1);

  return (
    <div ref={box} className="relative">
      <svg
        viewBox={`0 0 ${WIDTH} ${height}`}
        className="h-auto w-full overflow-visible"
        role="group"
        aria-label={label}
        onPointerLeave={() => setActive(null)}
      >
        <YAxis max={max} y={y} left={pad.left} right={WIDTH - pad.right} format={format} />
        {xs.map((v, i) =>
          labels.has(i) ? (
            <text
              key={i}
              x={x(i)}
              y={height - 6}
              textAnchor="middle"
              className="fill-muted-foreground text-[11px]"
            >
              {xLabel(v)}
            </text>
          ) : null,
        )}
        {active !== null && (
          <line
            x1={x(active)}
            x2={x(active)}
            y1={pad.top}
            y2={pad.top + plotH}
            className="stroke-muted-foreground/50"
          />
        )}
        {series.map((s, si) => {
          const pts = values[si];
          if (!pts.length) return null;
          const last = pts.length - 1;
          return (
            <g key={s.key}>
              <path
                d={pts.map((v, i) => `${i ? "L" : "M"}${x(i)},${y(v)}`).join("")}
                fill="none"
                stroke={s.color}
                strokeWidth={2}
                strokeLinejoin="round"
                strokeLinecap="round"
              />
              <circle
                cx={x(last)}
                cy={y(pts[last])}
                r={4}
                fill={s.color}
                className="stroke-background"
                strokeWidth={2}
              />
              <text
                x={x(last) + 8}
                y={y(pts[last])}
                dy="0.32em"
                className="fill-foreground text-[11px] font-medium"
              >
                {format(pts[last])}
              </text>
            </g>
          );
        })}
        {xs.map((v, i) => (
          <rect
            key={i}
            x={x(i) - slot / 2}
            y={pad.top}
            width={Math.max(slot, 4)}
            height={plotH}
            fill="transparent"
            tabIndex={0}
            role="img"
            aria-label={`${xLabel(v)}: ${series.map((s, si) => `${s.label} ${format(values[si][i] ?? 0)}`).join(", ")}`}
            onPointerEnter={() => setActive(i)}
            onFocus={() => setActive(i)}
            onBlur={() => setActive(null)}
            className="outline-none"
          />
        ))}
      </svg>
      {active !== null && (
        <Tooltip x={x(active) / WIDTH} edge={edgeOf(active, n)}>
          <p className="mb-1 font-medium">{xLabel(xs[active])}</p>
          {series.map((s, si) => (
            <p key={s.key} className="flex items-center gap-1.5">
              <span
                aria-hidden
                className="h-0.5 w-3 rounded"
                style={{ backgroundColor: s.color }}
              />
              <span className="max-w-48 truncate text-muted-foreground">{s.label}</span>
              <span className="ml-auto pl-3 tabular-nums">{format(values[si][active] ?? 0)}</span>
            </p>
          ))}
        </Tooltip>
      )}
    </div>
  );
}

/** Part-to-whole in one bar (≤ 6 segments), with values and shares listed below. */
export function SegmentBar({
  parts,
  format,
  label,
}: {
  parts: (Series & { value: number })[];
  format: (v: number) => string;
  label: string;
}) {
  const total = parts.reduce((sum, p) => sum + Math.max(0, p.value), 0);
  const shown = parts.filter((p) => p.value > 0);
  return (
    <div className="flex flex-col gap-3">
      <div
        className="flex h-4 w-full gap-[2px] overflow-hidden rounded"
        role="img"
        aria-label={label}
      >
        {total > 0 ? (
          shown.map((p, i) => (
            <span
              key={p.key}
              title={`${p.label}: ${format(p.value)}`}
              className={cn(i === 0 && "rounded-l", i === shown.length - 1 && "rounded-r")}
              style={{ width: `${(p.value / total) * 100}%`, backgroundColor: p.color }}
            />
          ))
        ) : (
          <span className="w-full rounded bg-muted" />
        )}
      </div>
      <ul className="grid grid-cols-1 gap-1.5 text-sm sm:grid-cols-2">
        {parts.map((p) => (
          <li key={p.key} className="flex items-center gap-2">
            <span
              aria-hidden
              className="size-2.5 shrink-0 rounded-[3px]"
              style={{ backgroundColor: p.color }}
            />
            <span className="text-muted-foreground">{p.label}</span>
            <span className="ml-auto font-medium tabular-nums">{format(p.value)}</span>
            <span className="w-12 text-right text-xs text-muted-foreground tabular-nums">
              {total > 0 ? `${Math.round((p.value / total) * 100)}%` : "–"}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export type HeatCell = { key: string; detail: string; value: number; empty?: boolean };

/** Calendar heatmap: columns are weeks, rows Monday–Sunday; one hue, darker = more. */
export function Heatmap({
  weeks,
  format,
  label,
  weekLabels,
}: {
  /** weeks[w][day], Monday first. */
  weeks: HeatCell[][];
  format: (v: number) => string;
  label: string;
  weekLabels: string[];
}) {
  const [active, setActive] = useState<{ w: number; d: number } | null>(null);
  const max = Math.max(0, ...weeks.flat().map((c) => c.value));
  const cell = 14;
  const gap = 3;
  const left = 22;
  const top = 4;
  const width = left + weeks.length * (cell + gap);
  const height = top + 7 * (cell + gap) + 16;
  const days = ["L", "", "M", "", "V", "", "D"];
  const shade = (v: number) => (v <= 0 || max <= 0 ? 0 : 0.18 + 0.82 * (v / max));
  const activeCell = active && weeks[active.w][active.d];

  return (
    <div className="relative overflow-x-auto">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="h-auto w-full min-w-[28rem]"
        role="group"
        aria-label={label}
        onPointerLeave={() => setActive(null)}
      >
        {days.map((d, i) => (
          <text
            key={i}
            x={0}
            y={top + i * (cell + gap) + cell / 2}
            dy="0.32em"
            className="fill-muted-foreground text-[9px]"
          >
            {d}
          </text>
        ))}
        {weeks.map((week, w) => (
          <g key={w}>
            {week.map((c, d) =>
              c.empty ? null : (
                <rect
                  key={c.key}
                  x={left + w * (cell + gap)}
                  y={top + d * (cell + gap)}
                  width={cell}
                  height={cell}
                  rx={3}
                  className={c.value > 0 ? undefined : "fill-muted"}
                  fill={c.value > 0 ? "var(--chart-1)" : undefined}
                  fillOpacity={c.value > 0 ? shade(c.value) : undefined}
                  tabIndex={0}
                  role="img"
                  aria-label={`${c.detail}: ${format(c.value)}`}
                  onPointerEnter={() => setActive({ w, d })}
                  onFocus={() => setActive({ w, d })}
                  onBlur={() => setActive(null)}
                />
              ),
            )}
            {w % 4 === 0 && (
              <text
                x={left + w * (cell + gap)}
                y={height - 3}
                className="fill-muted-foreground text-[9px]"
              >
                {weekLabels[w]}
              </text>
            )}
          </g>
        ))}
      </svg>
      <div className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
        <span>0</span>
        {[0.18, 0.4, 0.6, 0.8, 1].map((o) => (
          <span
            key={o}
            aria-hidden
            className="size-3 rounded-[3px]"
            style={{ backgroundColor: "var(--chart-1)", opacity: o }}
          />
        ))}
        <span>{format(max)}</span>
      </div>
      {activeCell && active && (
        <Tooltip x={(left + active.w * (cell + gap)) / width} edge={edgeOf(active.w, weeks.length)}>
          <span className="text-muted-foreground">{activeCell.detail}</span>{" "}
          <strong className="font-semibold tabular-nums">{format(activeCell.value)}</strong>
        </Tooltip>
      )}
    </div>
  );
}

/** Tiny trend line for table rows: de-emphasized, last point accented. */
export function Sparkline({ values, label }: { values: number[]; label: string }) {
  const w = 72;
  const h = 18;
  const max = Math.max(0, ...values);
  if (values.length < 2 || max <= 0) {
    return <span className="text-xs text-muted-foreground">–</span>;
  }
  const x = (i: number) => (i / (values.length - 1)) * (w - 4) + 2;
  const y = (v: number) => h - 2 - (v / max) * (h - 4);
  const last = values.length - 1;
  return (
    <svg width={w} height={h} role="img" aria-label={label} className="overflow-visible">
      <path
        d={values.map((v, i) => `${i ? "L" : "M"}${x(i)},${y(v)}`).join("")}
        fill="none"
        className="stroke-muted-foreground/60"
        strokeWidth={1.5}
        strokeLinejoin="round"
      />
      <circle cx={x(last)} cy={y(values[last])} r={2.5} fill="var(--chart-1)" />
    </svg>
  );
}
