"use client";

import { ArrowRightIcon, CheckIcon } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { LAUNCHER_NAME } from "@/components/kdp/bookmarklet-step";
import { finishSync, otherStep, STEP_PAGES, type SyncStep } from "@/lib/kdp-sync";

const SECONDS = 5;

/**
 * Shown after the first step of a full sync: the tab goes to the other KDP
 * page by itself, where the same bookmarklet does the second step.
 */
export function SyncNextStep({ done, backHref }: { done: SyncStep; backHref: string }) {
  const next = otherStep(done);
  const page = STEP_PAGES[next];
  const [left, setLeft] = useState(SECONDS);
  const [stopped, setStopped] = useState(false);

  useEffect(() => {
    if (stopped) return;
    if (left === 0) {
      window.location.assign(page.url);
      return;
    }
    const timer = setTimeout(() => setLeft((n) => n - 1), 1000);
    return () => clearTimeout(timer);
  }, [left, stopped, page.url]);

  return (
    <section
      className="flex flex-col gap-3 rounded-xl border p-5 text-sm"
      aria-live="polite"
      data-testid="sync-next-step"
    >
      <p className="flex items-center gap-2 font-medium">
        <CheckIcon className="size-4 text-emerald-700 dark:text-emerald-300" />
        Passo 1 di 2 fatto: {STEP_PAGES[done].what} sono importati.
      </p>
      <p>
        Passo 2: {stopped ? "apri" : `fra ${left} s apro`} {page.label} in questa scheda. Lì clicca
        di nuovo il preferito «{LAUNCHER_NAME}» per importare {page.what}: l&apos;account è già
        scelto.
      </p>
      <div className="flex flex-wrap gap-2">
        <Button asChild>
          <a href={page.url} data-testid="sync-next-link">
            Vai ai {page.label}
            <ArrowRightIcon />
          </a>
        </Button>
        {stopped ? (
          <Button asChild variant="outline">
            <Link href={backHref} onClick={finishSync}>
              Fermati qui
            </Link>
          </Button>
        ) : (
          <Button type="button" variant="outline" onClick={() => setStopped(true)}>
            Aspetta
          </Button>
        )}
      </div>
    </section>
  );
}
