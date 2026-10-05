"use client";

import { upload } from "@vercel/blob/client";
import { DownloadIcon, ImageIcon, PaperclipIcon, Trash2Icon } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";

import { LocalDateTime } from "@/components/local-date-time";
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
  ATTACHMENT_STORAGE,
  formatBytes,
  isImage,
  MAX_ATTACHMENT_BYTES,
  storageKey,
} from "@/lib/attachments";
import { cn } from "@/lib/utils";
import { type AttachmentItem, registerAttachment } from "@/server/actions/attachments";

export const attachmentUrl = (id: string) => `/api/attachments/${id}`;

/** Uploads one file (direct to Vercel Blob, or to our route locally). */
async function uploadFile(cardId: string, file: File): Promise<string> {
  const key = storageKey(cardId, file.name, crypto.randomUUID());
  if (ATTACHMENT_STORAGE === "local") {
    const form = new FormData();
    form.set("cardId", cardId);
    form.set("file", file);
    const response = await fetch("/api/attachments/upload", { method: "POST", body: form });
    const body = (await response.json().catch(() => ({}))) as { url?: string; error?: string };
    if (!response.ok || !body.url) throw new Error(body.error ?? "Upload non riuscito.");
    return body.url;
  }
  const blob = await upload(key, file, {
    access: "private",
    handleUploadUrl: "/api/attachments/upload",
    clientPayload: JSON.stringify({ cardId }),
    contentType: file.type || undefined,
  });
  return blob.url;
}

export function AttachmentsSection({
  cardId,
  attachments,
  coverId,
  onAdded,
  onDelete,
  onSetCover,
}: {
  cardId: string;
  attachments: AttachmentItem[];
  coverId: string | null;
  onAdded: (attachment: AttachmentItem) => void;
  onDelete: (attachment: AttachmentItem) => void;
  onSetCover: (attachmentId: string | null) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(0);

  async function addFiles(files: FileList | File[]) {
    for (const file of Array.from(files)) {
      if (file.size > MAX_ATTACHMENT_BYTES) {
        toast.error(`${file.name}: il limite è ${formatBytes(MAX_ATTACHMENT_BYTES)}.`);
        continue;
      }
      setUploading((count) => count + 1);
      try {
        const url = await uploadFile(cardId, file);
        const result = await registerAttachment({
          cardId,
          url,
          name: file.name,
          contentType: file.type,
        });
        if (result.ok) onAdded(result.data);
        else toast.error(result.error);
      } catch (error) {
        toast.error(
          `${file.name}: ${error instanceof Error ? error.message : "upload non riuscito"}`,
        );
      } finally {
        setUploading((count) => count - 1);
      }
    }
  }

  return (
    <section
      className="flex flex-col gap-2"
      aria-label="Allegati"
      onDragOver={(event) => {
        if (event.dataTransfer.types.includes("Files")) event.preventDefault();
      }}
      onDrop={(event) => {
        if (event.dataTransfer.files.length === 0) return;
        event.preventDefault();
        void addFiles(event.dataTransfer.files);
      }}
    >
      <div className="flex items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 font-semibold">
          <PaperclipIcon className="size-4 text-muted-foreground" />
          Allegati
          {attachments.length > 0 && (
            <span className="text-sm font-normal text-muted-foreground">
              ({attachments.length})
            </span>
          )}
        </h3>
        <Button
          variant="secondary"
          size="sm"
          disabled={uploading > 0}
          onClick={() => input.current?.click()}
        >
          {uploading > 0 ? "Caricamento…" : "Aggiungi"}
        </Button>
        <input
          ref={input}
          type="file"
          multiple
          hidden
          aria-label="Scegli i file da allegare"
          data-testid="attachment-input"
          onChange={(event) => {
            if (event.target.files) void addFiles(event.target.files);
            event.target.value = "";
          }}
        />
      </div>
      {attachments.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Trascina qui dei file o usa &quot;Aggiungi&quot; (max {formatBytes(MAX_ATTACHMENT_BYTES)}{" "}
          ciascuno).
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {attachments.map((attachment) => {
            const image = isImage(attachment.contentType);
            const isCover = attachment.id === coverId;
            return (
              <li
                key={attachment.id}
                data-testid="attachment"
                className="flex items-center gap-3 rounded-md border p-2"
              >
                <a
                  href={attachmentUrl(attachment.id)}
                  target="_blank"
                  rel="noreferrer"
                  className="flex size-14 shrink-0 items-center justify-center overflow-hidden rounded bg-muted"
                  aria-label={`Apri ${attachment.name}`}
                >
                  {image ? (
                    // eslint-disable-next-line @next/next/no-img-element -- private, auth-gated file
                    <img
                      src={attachmentUrl(attachment.id)}
                      alt=""
                      className="size-full object-cover"
                      loading="lazy"
                    />
                  ) : (
                    <span className="text-xs font-semibold text-muted-foreground uppercase">
                      {attachment.name.split(".").pop()?.slice(0, 4) || "file"}
                    </span>
                  )}
                </a>
                <div className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-sm font-medium">{attachment.name}</span>
                  <span className="text-xs text-muted-foreground">
                    {formatBytes(attachment.size)} ·{" "}
                    <LocalDateTime value={new Date(attachment.createdAt)} />
                    {isCover && " · copertina"}
                  </span>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  {image && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className={cn("size-8", isCover && "text-primary")}
                      aria-label={
                        isCover
                          ? `Rimuovi ${attachment.name} come copertina`
                          : `Usa ${attachment.name} come copertina`
                      }
                      aria-pressed={isCover}
                      onClick={() => onSetCover(isCover ? null : attachment.id)}
                    >
                      <ImageIcon />
                    </Button>
                  )}
                  <Button variant="ghost" size="icon" className="size-8" asChild>
                    <a
                      href={`${attachmentUrl(attachment.id)}?download`}
                      aria-label={`Scarica ${attachment.name}`}
                    >
                      <DownloadIcon />
                    </a>
                  </Button>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-8"
                        aria-label={`Elimina ${attachment.name}`}
                      >
                        <Trash2Icon />
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Eliminare l&apos;allegato?</AlertDialogTitle>
                        <AlertDialogDescription>
                          “{attachment.name}” verrà eliminato definitivamente.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Annulla</AlertDialogCancel>
                        <AlertDialogAction
                          className="bg-destructive text-white hover:bg-destructive/90"
                          onClick={() => onDelete(attachment)}
                        >
                          Elimina
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
