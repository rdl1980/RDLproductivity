"use client";

import { useState } from "react";

import { niceMax, type WeekBucket } from "@/lib/stats";

const HEIGHT = 180;
const PAD = { top: 16, right: 8, bottom: 24, left: 28 };
const BAR = 24;
const RADIUS = 4;

const weekLabel = new Intl.DateTimeFormat("it-IT", { day: "numeric", month: "short" });

/** Column with a 4px rounded top and a square base on the baseline. */
function columnPath(x: number, y: number, width: number, height: number) {
  if (height <= 0) return "";
  const r = Math.min(RADIUS, height, width / 2);
  return [
    `M${x},${y + height}`,
    `V${y + r}`,
    `Q${x},${y} ${x + r},${y}`,
    `H${x + width - r}`,
    `Q${x + width},${y} ${x + width},${y + r}`,
    `V${y + height}`,
    "Z",
  ].join(" ");
}

export function WeeklyColumns({ weeks, label }: { weeks: WeekBucket[]; label: string }) {
  const [active, setActive] = useState<number | null>(null);
  const width = 640;
  const max = niceMax(Math.max(...weeks.map((w) => w.count)));
  const plotW = width - PAD.left - PAD.right;
  const plotH = HEIGHT - PAD.top - PAD.bottom;
  const slot = plotW / weeks.length;
  const barW = Math.min(BAR, slot * 0.6);
  const y = (value: number) => PAD.top + plotH - (value / max) * plotH;
  const ticks = [0, max / 2, max];
  const peak = weeks.reduce((best, w, i) => (w.count > weeks[best].count ? i : best), 0);
  const current = weeks.length - 1;

  return (
    <div className="relative">
      <svg
        viewBox={`0 0 ${width} ${HEIGHT}`}
        className="h-auto w-full overflow-visible"
        role="group"
        aria-label={label}
        onPointerLeave={() => setActive(null)}
      >
        {ticks.map((tick) => (
          <g key={tick}>
            <line
              x1={PAD.left}
              x2={width - PAD.right}
              y1={y(tick)}
              y2={y(tick)}
              className={tick === 0 ? "stroke-border" : "stroke-border/60"}
              strokeDasharray={tick === 0 ? undefined : "2 4"}
            />
            <text
              x={PAD.left - 6}
              y={y(tick)}
              dy="0.32em"
              textAnchor="end"
              className="fill-muted-foreground text-[11px]"
            >
              {Number.isInteger(tick) ? tick : tick.toFixed(1)}
            </text>
          </g>
        ))}
        {weeks.map((week, i) => {
          const x = PAD.left + slot * i + (slot - barW) / 2;
          const top = y(week.count);
          // Direct labels only where they matter: the peak and the current week.
          const labelled = week.count > 0 && (i === peak || i === current);
          return (
            <g key={week.start.toISOString()}>
              <path d={columnPath(x, top, barW, PAD.top + plotH - top)} fill="var(--chart-1)" />
              {labelled && (
                <text
                  x={x + barW / 2}
                  y={top - 4}
                  textAnchor="middle"
                  className="fill-foreground text-[11px] font-medium"
                >
                  {week.count}
                </text>
              )}
              {(i % 2 === current % 2 || weeks.length <= 6) && (
                <text
                  x={x + barW / 2}
                  y={HEIGHT - 6}
                  textAnchor="middle"
                  className="fill-muted-foreground text-[11px]"
                >
                  {weekLabel.format(week.start)}
                </text>
              )}
              {/* Hit target: the whole slot, taller than the mark. */}
              <rect
                x={PAD.left + slot * i}
                y={PAD.top}
                width={slot}
                height={plotH}
                fill="transparent"
                tabIndex={0}
                role="img"
                aria-label={`Settimana dal ${weekLabel.format(week.start)}: ${week.count} card`}
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
        <div
          role="status"
          className="pointer-events-none absolute top-0 rounded-md border bg-popover px-2 py-1 text-xs whitespace-nowrap shadow-md"
          style={{
            // Centered on the column, kept inside the chart near the edges.
            left: `${((PAD.left + slot * (active + 0.5)) / width) * 100}%`,
            transform: `translateX(${active > weeks.length - 3 ? "-100%" : active < 2 ? "0" : "-50%"})`,
          }}
        >
          <strong className="font-semibold">{weeks[active].count}</strong>{" "}
          <span className="text-muted-foreground">
            · settimana dal {weekLabel.format(weeks[active].start)}
          </span>
        </div>
      )}
    </div>
  );
}
