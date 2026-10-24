import { ChevronLeftIcon, ChevronRightIcon, ClipboardCheckIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { PriorityBadge, DueBadge } from "@/components/card-detail/card-badges";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { DEFAULT_BOARD_COLOR } from "@/lib/board-colors";
import {
  accountLabel,
  addWeeks,
  isoWeekNumber,
  KDP_ACCOUNT_VALUES,
  laneLabel,
  mondayOf,
  todayIn,
  weekRangeLabel,
} from "@/lib/kdp";
import { change, formatEuro, formatInt } from "@/lib/kdp-sales";
import { cn } from "@/lib/utils";
import { getWeeklyReview, type ReviewCard } from "@/server/queries/review";
import { requireSession } from "@/server/session";

export const metadata: Metadata = { title: "Riepilogo settimanale · RDL Productivity" };

/** The app is single-user: "this week" is the owner's. */
const TIME_ZONE = process.env.DEFAULT_TIME_ZONE ?? "Europe/Rome";

export default async function ReviewPage({ searchParams }: PageProps<"/riepilogo">) {
  await requireSession();
  const params = await searchParams;
  const today = todayIn(TIME_ZONE);
  const current = mondayOf(today)!;
  const week = (typeof params.week === "string" && mondayOf(params.week)) || current;
  const review = await getWeeklyReview(week, today);

  const totals = (which: "current" | "previous") =>
    KDP_ACCOUNT_VALUES.reduce(
      (sum, a) => ({
        royalty: sum.royalty + review.sales[which][a].royalty,
        units: sum.units + review.sales[which][a].units,
        kenp: sum.kenp + review.sales[which][a].kenp,
      }),
      { royalty: 0, units: 0, kenp: 0 },
    );
  const sales = totals("current");
  const previous = totals("previous");
  const tasks = review.kdp.tasks;
  const done = tasks.filter((t) => t.done);

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-col gap-6 p-4 sm:p-6">
      <PageHeader
        icon={ClipboardCheckIcon}
        title="Riepilogo settimanale"
        description="Com'è andata la settimana: card chiuse, attività KDP, vendite, e cosa arriva la prossima."
        actions={
          <nav aria-label="Settimana" className="flex items-center gap-1">
            <Button asChild variant="outline" size="icon" aria-label="Settimana precedente">
              <Link href={`/riepilogo?week=${addWeeks(week, -1)}`}>
                <ChevronLeftIcon />
              </Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/riepilogo">Questa settimana</Link>
            </Button>
            <Button
              asChild
              variant="outline"
              size="icon"
              aria-label="Settimana successiva"
              className={cn(week >= current && "pointer-events-none opacity-50")}
            >
              <Link href={`/riepilogo?week=${addWeeks(week, 1)}`} aria-disabled={week >= current}>
                <ChevronRightIcon />
              </Link>
            </Button>
          </nav>
        }
      />
      <h2 className="text-lg font-semibold" data-testid="review-week">
        Settimana {isoWeekNumber(week)} · {weekRangeLabel(week)} {week.slice(0, 4)}
      </h2>

      <section
        aria-label="In numeri"
        className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"
        data-testid="review-kpis"
      >
        <Stat label="Card completate" value={formatInt(review.cards.completed.length)} />
        <Stat label="Card create" value={formatInt(review.cards.created)} />
        <Stat
          label="Attività KDP fatte"
          value={`${done.length} / ${tasks.length}`}
          hint={tasks.length ? "della settimana" : "nessuna pianificata"}
        />
        <Stat
          label="Royalty della settimana"
          value={formatEuro(sales.royalty)}
          hint={deltaText(change(sales.royalty, previous.royalty), formatEuro(previous.royalty))}
        />
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <Section
          title="Card completate"
          count={review.cards.completed.length}
          empty="Nessuna card chiusa."
        >
          <CardList cards={review.cards.completed} />
        </Section>
        <Section
          title="Attività KDP"
          count={tasks.length}
          empty="Nessuna attività KDP in questa settimana."
        >
          <ul className="divide-y rounded-lg border">
            {tasks.map((task) => (
              <li key={task.id} className="flex items-start gap-2 p-2.5 text-sm">
                <span
                  aria-hidden
                  className={cn(
                    "mt-1 size-2.5 shrink-0 rounded-full",
                    task.done ? "bg-green-600" : "bg-muted-foreground/40",
                  )}
                />
                <span className="sr-only">{task.done ? "fatta: " : "da fare: "}</span>
                <span className="flex min-w-0 flex-col">
                  <span className={cn(task.done && "text-muted-foreground line-through")}>
                    {task.title}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {laneLabel(task.account, task.track)}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </Section>
      </div>

      <Section title="Vendite" count={null} empty="">
        <div className="grid gap-3 sm:grid-cols-3" data-testid="review-sales">
          <Stat
            label="Copie"
            value={formatInt(sales.units)}
            hint={deltaText(change(sales.units, previous.units), formatInt(previous.units))}
          />
          <Stat
            label="Pagine KENP"
            value={formatInt(sales.kenp)}
            hint={deltaText(change(sales.kenp, previous.kenp), formatInt(previous.kenp))}
          />
          <div className="flex flex-col gap-1 rounded-xl border p-4 text-sm">
            <span className="text-muted-foreground">Per account</span>
            {KDP_ACCOUNT_VALUES.map((account) => (
              <span key={account} className="flex justify-between tabular-nums">
                <span>{accountLabel(account)}</span>
                <span className="font-medium">
                  {formatEuro(review.sales.current[account].royalty)}
                </span>
              </span>
            ))}
          </div>
        </div>
        {review.sales.topBooks.length > 0 && (
          <ol className="mt-3 flex flex-col gap-1 text-sm">
            {review.sales.topBooks.map((book, i) => (
              <li key={`${book.title}-${i}`} className="flex items-baseline gap-2">
                <span className="w-4 text-right text-muted-foreground tabular-nums">{i + 1}.</span>
                <span className="min-w-0 flex-1 truncate">{book.title}</span>
                <span className="text-xs text-muted-foreground">{formatInt(book.units)} copie</span>
                <span className="font-medium tabular-nums">{formatEuro(book.royalty)}</span>
              </li>
            ))}
          </ol>
        )}
        {Object.keys(review.goals).length > 0 && (
          <div className="mt-4 flex flex-col gap-2" data-testid="review-goals">
            <h3 className="text-sm font-medium">Obiettivo del mese</h3>
            {KDP_ACCOUNT_VALUES.flatMap((account) => {
              const goal = review.goals[account];
              if (!goal) return [];
              return (
                <div key={account} className="flex flex-col gap-1 text-sm">
                  <span className="flex justify-between">
                    <span>{accountLabel(account)}</span>
                    <span className="tabular-nums">
                      {formatEuro(goal.royalty)} su {formatEuro(goal.target)} ({goal.percent}%)
                      {" · "}proiezione {formatEuro(goal.projected)}
                    </span>
                  </span>
                  <span className="h-2 overflow-hidden rounded-full bg-muted">
                    <span
                      className={cn(
                        "block h-full rounded-full",
                        goal.projected >= goal.target ? "bg-green-600" : "bg-primary",
                      )}
                      style={{ width: `${Math.min(100, goal.percent)}%` }}
                    />
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </Section>

      <div className="grid gap-6 lg:grid-cols-2">
        <Section
          title="Scadute o in scadenza"
          count={review.cards.overdue.length}
          empty="Niente di scaduto."
          danger={review.cards.overdue.length > 0}
        >
          <CardList cards={review.cards.overdue} />
        </Section>
        <Section
          title="Prossima settimana"
          count={review.cards.dueNext.length}
          empty="Nessuna scadenza nella prossima settimana."
        >
          <CardList cards={review.cards.dueNext} />
        </Section>
      </div>
    </main>
  );
}

function deltaText(delta: number | null, previous: string) {
  if (delta === null) return `settimana prima: ${previous}`;
  const sign = delta >= 0 ? "+" : "";
  return `${sign}${Math.round(delta)}% sulla settimana prima (${previous})`;
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="flex flex-col gap-1 rounded-xl border p-4" data-testid="stat-tile">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="text-3xl font-semibold tracking-tight tabular-nums">{value}</span>
      {hint && <span className="text-xs text-muted-foreground">{hint}</span>}
    </div>
  );
}

function Section({
  title,
  count,
  empty,
  danger,
  children,
}: {
  title: string;
  count: number | null;
  empty: string;
  danger?: boolean;
  children: React.ReactNode;
}) {
  return (
    <section aria-label={title} className="flex flex-col gap-2">
      <h2 className={cn("text-lg font-semibold", danger && "text-destructive")}>
        {title}
        {count !== null && (
          <span className="text-sm font-normal text-muted-foreground"> ({count})</span>
        )}
      </h2>
      {count === 0 ? <p className="text-sm text-muted-foreground">{empty}</p> : children}
    </section>
  );
}

function CardList({ cards }: { cards: ReviewCard[] }) {
  return (
    <ul className="divide-y rounded-lg border">
      {cards.map((card) => (
        <li key={card.id} className="flex flex-col gap-1 p-2.5 text-sm">
          <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <span
              aria-hidden
              className="size-2.5 shrink-0 rounded-full"
              style={{ backgroundColor: card.board.color ?? DEFAULT_BOARD_COLOR }}
            />
            <span className="truncate">
              {card.board.title} · {card.list}
            </span>
          </span>
          <Link
            href={`/boards/${card.board.id}?card=${card.id}`}
            className="font-medium hover:underline"
          >
            {card.title}
          </Link>
          <span className="flex flex-wrap gap-1.5">
            <PriorityBadge priority={card.priority} />
            {card.dueDate && <DueBadge dueDate={card.dueDate} completed={false} />}
          </span>
        </li>
      ))}
    </ul>
  );
}
