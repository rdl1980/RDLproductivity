"use client";

import { useIsClient } from "@/lib/use-is-client";

const format = new Intl.DateTimeFormat("it-IT", { dateStyle: "medium", timeStyle: "short" });

/** A date-time in the browser's timezone (rendered after hydration). */
export function LocalDateTime({ value }: { value: Date }) {
  const isClient = useIsClient();
  return <time dateTime={value.toISOString()}>{isClient ? format.format(value) : ""}</time>;
}
