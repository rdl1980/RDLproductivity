import { accountLabel, type KdpAccount } from "@/lib/kdp";
import type { AccountMatches } from "@/lib/kdp-accounts";

/** Says which account the data was recognised in, or that it is new to both. */
export function AccountHint({
  detected,
  what,
}: {
  detected: { account: KdpAccount | null; matches: AccountMatches } | null;
  what: string;
}) {
  if (!detected) return null;
  const { account, matches } = detected;
  return (
    <p className="text-xs text-muted-foreground" data-testid="account-hint">
      {account
        ? `Riconosciuto: ${matches[account]} ${what} già associati a «${accountLabel(account)}».`
        : matches.main === 0 && matches.secondary === 0
          ? `Nessuno di questi ${what} è già in archivio: se stai collegando un account per la prima volta, scegli quale.`
          : `I ${what} risultano in entrambi gli account: scegli tu quello giusto.`}
    </p>
  );
}
