import { cn } from "@/lib/utils";

/** RDL monogram: three stacked bars, like cards in a column. */
export function BrandMark({ className }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        "inline-flex size-7 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-indigo-500 to-violet-600 text-white shadow-sm",
        className,
      )}
    >
      <svg viewBox="0 0 16 16" className="size-4" fill="currentColor">
        <rect x="2.5" y="3" width="11" height="2.5" rx="1.25" />
        <rect x="2.5" y="6.75" width="8" height="2.5" rx="1.25" opacity="0.85" />
        <rect x="2.5" y="10.5" width="5" height="2.5" rx="1.25" opacity="0.7" />
      </svg>
    </span>
  );
}

export function BrandName({ className }: { className?: string }) {
  return (
    <span className={cn("font-semibold tracking-tight", className)}>
      RDL <span className="font-normal text-muted-foreground">Productivity</span>
    </span>
  );
}
