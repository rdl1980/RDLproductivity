"use client";

import { XIcon } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";

type Props = {
  placeholder: string;
  submitLabel: string;
  onSubmit: (title: string) => void;
  onClose: () => void;
};

/** Quick-add form: Enter adds and stays open, Esc closes. */
export function Composer({ placeholder, submitLabel, onSubmit, onClose }: Props) {
  const [draft, setDraft] = useState("");

  function submit() {
    const title = draft.trim();
    if (!title) return;
    onSubmit(title);
    setDraft("");
  }

  return (
    <form
      className="flex flex-col gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
    >
      <textarea
        autoFocus
        rows={2}
        value={draft}
        maxLength={200}
        aria-label={placeholder}
        placeholder={placeholder}
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter" && !event.shiftKey) {
            event.preventDefault();
            submit();
          } else if (event.key === "Escape") {
            event.preventDefault();
            onClose();
          }
        }}
        className="w-full resize-none rounded-md border border-input bg-white px-2 py-1.5 text-sm text-neutral-900 shadow-sm outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
      />
      <div className="flex items-center gap-1">
        <Button type="submit" size="sm">
          {submitLabel}
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-8"
          aria-label="Chiudi"
          onClick={onClose}
        >
          <XIcon />
        </Button>
      </div>
    </form>
  );
}
