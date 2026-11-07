/**
 * What a message to the bot asks: a command ("/oggi", "/vendite",
 * "/fatto ep001", "/aiuto") or, for plain text, a card to capture. Pure, tested.
 */
export type BotRequest =
  | { kind: "today" }
  | { kind: "sales" }
  | { kind: "done"; code: string }
  | { kind: "help" }
  | { kind: "capture"; title: string; description: string | null }
  | { kind: "unknown"; command: string };

const COMMANDS: Record<string, BotRequest["kind"]> = {
  oggi: "today",
  today: "today",
  vendite: "sales",
  sales: "sales",
  fatto: "done",
  done: "done",
  aiuto: "help",
  help: "help",
  start: "help",
};

export function parseBotMessage(text: string): BotRequest | null {
  const trimmed = text.trim();
  if (!trimmed) return null;
  const command = /^\/([a-z]+)(?:@\w+)?(?:\s+([\s\S]*))?$/i.exec(trimmed);
  if (command) {
    const name = command[1].toLowerCase();
    const arg = (command[2] ?? "").trim();
    const kind = COMMANDS[name];
    if (!kind) return { kind: "unknown", command: name };
    if (kind === "done") return { kind: "done", code: arg.split(/\s+/)[0]?.toLowerCase() ?? "" };
    return { kind } as BotRequest;
  }
  const [first, ...rest] = trimmed.split("\n");
  let title = first.trim();
  let extra = rest.join("\n").trim();
  if (title.length > 200) {
    extra = `${title}\n${extra}`.trim();
    title = `${title.slice(0, 197)}…`;
  }
  return { kind: "capture", title, description: extra ? extra.slice(0, 10_000) : null };
}

export const HELP_TEXT = [
  "<b>Comandi</b>",
  "/oggi: scadenze delle card e «Da fare» di Robotti & Robotte",
  "/vendite: copie e royalty KDP di oggi, ieri e del mese",
  "/fatto <i>codice</i>: segna fatte le voci «Da fare» della scheda (es. /fatto ep001)",
  "",
  "Ogni altro messaggio diventa una card nella lista scelta in Integrazioni: la prima riga è il titolo, il resto la descrizione.",
].join("\n");
