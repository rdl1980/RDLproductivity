"use client";

import { useState } from "react";

import { cn } from "@/lib/utils";

type Props = {
  value: string;
  onSave: (value: string) => void;
  editing: boolean;
  onEditingChange: (editing: boolean) => void;
  label: string;
  className?: string;
  inputClassName?: string;
};

/** Text that turns into an input: Enter or blur saves, Esc cancels. */
export function InlineTitle({
  value,
  onSave,
  editing,
  onEditingChange,
  label,
  className,
  inputClassName,
}: Props) {
  if (!editing) {
    return (
      <button
        type="button"
        onClick={() => onEditingChange(true)}
        className={cn("cursor-text truncate text-left", className)}
        title="Rinomina"
      >
        {value}
      </button>
    );
  }
  return (
    <TitleInput
      initial={value}
      label={label}
      className={inputClassName}
      onDone={(next) => {
        onEditingChange(false);
        const trimmed = next?.trim();
        if (trimmed && trimmed !== value) onSave(trimmed);
      }}
    />
  );
}

function TitleInput({
  initial,
  label,
  className,
  onDone,
}: {
  initial: string;
  label: string;
  className?: string;
  onDone: (value: string | null) => void;
}) {
  const [draft, setDraft] = useState(initial);
  return (
    <input
      autoFocus
      aria-label={label}
      value={draft}
      maxLength={200}
      onFocus={(event) => event.currentTarget.select()}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={() => onDone(draft)}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          onDone(draft);
        } else if (event.key === "Escape") {
          event.preventDefault();
          event.stopPropagation();
          onDone(null);
        }
      }}
      className={cn(
        "w-full rounded-md border border-input bg-white px-2 py-1 text-sm text-neutral-900 outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50",
        className,
      )}
    />
  );
}
