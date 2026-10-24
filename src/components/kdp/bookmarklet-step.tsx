"use client";

import { BookmarkIcon } from "lucide-react";
import { useEffect, useRef } from "react";
import { toast } from "sonner";

import { launcherBookmarkletHref } from "@/lib/kdp-launcher";

import { ManualBookmark } from "./manual-bookmark";

export const LAUNCHER_NAME = "RDL KDP";

/** A draggable bookmarklet button. React refuses javascript: URLs in props, so the href is set directly. */
export function BookmarkletLink({
  href,
  name,
  hint,
  primary,
}: {
  href: string;
  name: string;
  hint: string;
  primary?: boolean;
}) {
  const ref = useRef<HTMLAnchorElement>(null);
  useEffect(() => {
    ref.current?.setAttribute("href", href);
  });
  return (
    <a
      ref={ref}
      onClick={(event) => {
        event.preventDefault();
        toast.info(hint);
      }}
      className={
        primary
          ? "inline-flex items-center gap-1 rounded-md bg-primary px-2 py-1 font-medium text-primary-foreground"
          : "inline-flex items-center gap-1 rounded-md border bg-background px-2 py-1 font-medium"
      }
    >
      <BookmarkIcon className="size-3.5" />
      {name}
    </a>
  );
}

/**
 * First step of the import dialogs: the one bookmarklet for both KDP pages,
 * plus the page-specific one for whoever prefers it.
 */
export function BookmarkletStep({
  origin,
  specific,
}: {
  origin: string;
  specific: { href: string; name: string; page: string };
}) {
  const launcher = launcherBookmarkletHref(origin);
  const hint = "Trascinalo nella barra dei preferiti, poi usalo sulla pagina di KDP.";
  return (
    <>
      Trascina questo pulsante nella barra dei preferiti (una volta sola):{" "}
      <BookmarkletLink href={launcher} name={LAUNCHER_NAME} hint={hint} primary />
      <span className="mt-1 block text-xs text-muted-foreground">
        Funziona sia sul Bookshelf (libri) sia sui Report (vendite): capisce da solo quale pagina
        hai aperto. In alternativa, solo per {specific.page}:{" "}
        <BookmarkletLink href={specific.href} name={specific.name} hint={hint} />
      </span>
      <ManualBookmark
        items={[
          { href: launcher, name: LAUNCHER_NAME },
          { href: specific.href, name: specific.name },
        ]}
      />
    </>
  );
}
