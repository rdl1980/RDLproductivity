"use client";

import { useSearchParams } from "next/navigation";

/** The card dialog is driven by the `card` URL parameter, as on the board. */
export function useCardParam() {
  const searchParams = useSearchParams();
  const openCardId = searchParams.get("card");

  function setCardParam(cardId: string | null) {
    const params = new URLSearchParams(window.location.search);
    if (cardId) params.set("card", cardId);
    else params.delete("card");
    const query = params.toString();
    window.history.pushState(null, "", query ? `?${query}` : window.location.pathname);
  }

  return { openCardId, setCardParam };
}
