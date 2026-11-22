"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { KDP_ACCOUNTS } from "@/lib/kdp";
import { type CatalogSeries, SERIES_STATUSES } from "@/lib/kdp-series-catalog";
import { saveKdpSeries } from "@/server/actions/kdp-series";

import { selectClass } from "./series-ui";

/** Create (series = null) or edit a series. */
export function SeriesDialog({
  open,
  series,
  penNames,
  onOpenChange,
  onSaved,
}: {
  open: boolean;
  series: CatalogSeries | null;
  penNames: string[];
  onOpenChange: (open: boolean) => void;
  onSaved?: (id: string) => void;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const text = (key: string) => String(form.get(key) ?? "");
    const volumes = text("plannedVolumes").trim();
    const input = {
      ...(series ? { id: series.id } : {}),
      name: text("name"),
      account: text("account"),
      penName: text("penName"),
      kdpName: text("kdpName"),
      status: text("status"),
      plannedVolumes: volumes ? Number(volumes) : null,
      language: text("language"),
      genre: text("genre"),
      description: text("description"),
      notes: text("notes"),
    };
    start(async () => {
      const result = await saveKdpSeries(input).catch(() => null);
      if (!result?.ok) {
        toast.error(result?.error ?? "Errore di rete, riprova.");
        return;
      }
      toast.success(series ? "Collana aggiornata" : "Collana creata");
      onOpenChange(false);
      router.refresh();
      onSaved?.(result.data.id);
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{series ? "Modifica collana" : "Nuova collana"}</DialogTitle>
          <DialogDescription>
            Una collana sta su un solo account KDP e usa un solo pen name.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="grid gap-3 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5 sm:col-span-2">
            <Label htmlFor="series-name">Nome</Label>
            <Input
              id="series-name"
              name="name"
              required
              maxLength={200}
              defaultValue={series?.name}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="series-account">Account KDP</Label>
            <select
              id="series-account"
              name="account"
              required
              defaultValue={series?.account ?? ""}
              className={selectClass}
            >
              <option value="" disabled>
                Scegli…
              </option>
              {KDP_ACCOUNTS.map((a) => (
                <option key={a.value} value={a.value}>
                  {a.label}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="series-pen">Pen name</Label>
            <Input
              id="series-pen"
              name="penName"
              list="series-pen-names"
              maxLength={200}
              defaultValue={series?.penName ?? ""}
            />
            <datalist id="series-pen-names">
              {penNames.map((name) => (
                <option key={name} value={name} />
              ))}
            </datalist>
          </div>
          <div className="flex flex-col gap-1.5 sm:col-span-2">
            <Label htmlFor="series-kdp">Nome della serie su KDP</Label>
            <Input
              id="series-kdp"
              name="kdpName"
              maxLength={300}
              defaultValue={series?.kdpName ?? ""}
              aria-describedby="series-kdp-hint"
            />
            <p id="series-kdp-hint" className="text-xs text-muted-foreground">
              I libri del Bookshelf dell&apos;account con questa serie entrano da soli nella
              collana. Vuoto se non è ancora su KDP.
            </p>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="series-status">Stato</Label>
            <select
              id="series-status"
              name="status"
              defaultValue={series?.status ?? "active"}
              className={selectClass}
            >
              {SERIES_STATUSES.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="series-volumes">Volumi previsti</Label>
            <Input
              id="series-volumes"
              name="plannedVolumes"
              type="number"
              min={1}
              max={999}
              defaultValue={series?.plannedVolumes ?? ""}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="series-language">Lingua</Label>
            <Input
              id="series-language"
              name="language"
              maxLength={50}
              placeholder="IT"
              defaultValue={series?.language ?? ""}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="series-genre">Genere</Label>
            <Input
              id="series-genre"
              name="genre"
              maxLength={200}
              defaultValue={series?.genre ?? ""}
            />
          </div>
          <div className="flex flex-col gap-1.5 sm:col-span-2">
            <Label htmlFor="series-description">Descrizione</Label>
            <Textarea
              id="series-description"
              name="description"
              maxLength={5000}
              rows={3}
              defaultValue={series?.description ?? ""}
            />
          </div>
          <div className="flex flex-col gap-1.5 sm:col-span-2">
            <Label htmlFor="series-notes">Note</Label>
            <Textarea
              id="series-notes"
              name="notes"
              maxLength={5000}
              rows={2}
              defaultValue={series?.notes ?? ""}
            />
          </div>
          <DialogFooter className="sm:col-span-2">
            <Button type="submit" disabled={pending}>
              {series ? "Salva" : "Crea collana"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
