"use client";

import { SearchIcon } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef } from "react";

import { Input } from "@/components/ui/input";
import { isTypingTarget } from "@/lib/dom";

/** Header search field; `/` focuses it from anywhere. */
export function SearchBox() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const input = useRef<HTMLInputElement>(null);
  const current = pathname === "/search" ? (searchParams.get("q") ?? "") : "";

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "/" || event.metaKey || event.ctrlKey || event.altKey) return;
      if (isTypingTarget(event.target) || document.querySelector("[role=dialog]")) return;
      event.preventDefault();
      input.current?.focus();
      input.current?.select();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  return (
    <form
      role="search"
      className="relative w-full max-w-sm"
      onSubmit={(event) => {
        event.preventDefault();
        const q = new FormData(event.currentTarget).get("q")?.toString().trim() ?? "";
        if (q) router.push(`/search?q=${encodeURIComponent(q)}`);
      }}
    >
      <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        ref={input}
        // Remount when the query in the URL changes so the field shows it.
        key={current}
        name="q"
        type="search"
        defaultValue={current}
        aria-label="Cerca card"
        placeholder="Cerca card…"
        className="h-9 rounded-lg border-transparent bg-muted pr-2 pl-8 shadow-none focus-visible:border-input focus-visible:bg-background sm:pr-9"
        onKeyDown={(event) => {
          if (event.key === "Escape") event.currentTarget.blur();
        }}
      />
      <kbd className="pointer-events-none absolute top-1/2 right-2 z-10 hidden -translate-y-1/2 rounded border bg-background px-1.5 font-mono text-[11px] text-muted-foreground sm:block">
        /
      </kbd>
    </form>
  );
}
