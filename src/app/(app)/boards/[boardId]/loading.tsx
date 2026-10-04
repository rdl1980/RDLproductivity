/** Shown instantly while the board loads, so navigation never looks frozen. */
export default function BoardLoading() {
  return (
    <main className="flex flex-1 flex-col bg-muted" aria-busy="true" aria-label="Caricamento board">
      <div className="px-4 py-3">
        <div className="h-7 w-48 animate-pulse rounded bg-foreground/10" />
      </div>
      <div className="flex gap-3 overflow-hidden px-4">
        {[3, 2, 4].map((cards, i) => (
          <div key={i} className="flex w-72 shrink-0 flex-col gap-2 rounded-xl bg-list p-2">
            <div className="h-5 w-24 animate-pulse rounded bg-foreground/10" />
            {Array.from({ length: cards }, (_, j) => (
              <div key={j} className="h-9 animate-pulse rounded-md bg-list-card shadow-sm" />
            ))}
          </div>
        ))}
      </div>
    </main>
  );
}
