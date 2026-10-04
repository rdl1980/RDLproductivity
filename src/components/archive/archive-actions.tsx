"use client";

import { ArchiveRestoreIcon, Trash2Icon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  deleteArchivedBoard,
  deleteArchivedCard,
  deleteArchivedList,
  restoreBoard,
  restoreList,
} from "@/server/actions/archive";
import { restoreCard } from "@/server/actions/card-details";
import type { ActionResult } from "@/server/actions/result";

type Kind = "board" | "list" | "card";

const RESTORE: Record<Kind, (id: string) => Promise<ActionResult<unknown>>> = {
  board: restoreBoard,
  list: restoreList,
  card: restoreCard,
};

const REMOVE: Record<Kind, (id: string) => Promise<ActionResult>> = {
  board: deleteArchivedBoard,
  list: deleteArchivedList,
  card: deleteArchivedCard,
};

const NOUN: Record<Kind, string> = { board: "la board", list: "la lista", card: "la card" };

export function ArchiveActions({ kind, id, title }: { kind: Kind; id: string; title: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function run(action: () => Promise<ActionResult<unknown>>, success: string) {
    startTransition(async () => {
      const result = await action().catch(() => null);
      if (!result?.ok) {
        toast.error(result?.error ?? "Errore di rete.");
        return;
      }
      toast.success(success);
      router.refresh();
    });
  }

  return (
    <div className="flex shrink-0 gap-1">
      <Button
        variant="secondary"
        size="sm"
        disabled={pending}
        aria-label={`Ripristina ${title}`}
        onClick={() => run(() => RESTORE[kind](id), `"${title}" ripristinata`)}
      >
        <ArchiveRestoreIcon />
        <span className="hidden sm:inline">Ripristina</span>
      </Button>
      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button variant="ghost" size="sm" disabled={pending} aria-label={`Elimina ${title}`}>
            <Trash2Icon />
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminare definitivamente {NOUN[kind]}?</AlertDialogTitle>
            <AlertDialogDescription>
              “{title}”{kind === "board" && " e tutto il suo contenuto (liste, card, etichette)"}
              {kind === "list" && " e tutte le sue card"} verranno eliminati. L&apos;operazione non
              si può annullare.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annulla</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-white hover:bg-destructive/90"
              onClick={() => run(() => REMOVE[kind](id), `"${title}" eliminata`)}
            >
              Elimina
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
