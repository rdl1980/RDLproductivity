/** Generic placeholder while an app page loads. */
export default function AppLoading() {
  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-4 p-6" aria-busy="true">
      <div className="h-8 w-56 animate-pulse rounded bg-muted" />
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="h-24 animate-pulse rounded-lg bg-muted" />
        ))}
      </div>
    </main>
  );
}
