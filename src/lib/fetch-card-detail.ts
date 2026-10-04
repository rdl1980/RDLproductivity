import type { CardDetail } from "@/server/actions/card-details";
import type { ActionResult } from "@/server/actions/result";

export async function fetchCardDetail(cardId: string): Promise<ActionResult<CardDetail>> {
  try {
    const response = await fetch(`/api/cards/${encodeURIComponent(cardId)}`, { cache: "no-store" });
    const body = await response.json();
    if (!response.ok)
      return { ok: false, error: body.error ?? "Errore nel caricamento della card." };
    return { ok: true, data: body as CardDetail };
  } catch {
    return { ok: false, error: "Errore di rete." };
  }
}
