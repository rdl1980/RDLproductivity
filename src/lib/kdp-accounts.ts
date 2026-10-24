import { accountLabel, type KdpAccount } from "./kdp";

/**
 * How many items of an import (Bookshelf books, or report titles) each
 * account already knows. KDP ids and ASINs belong to one account only, so the
 * counts tell which account the data comes from.
 */
export type AccountMatches = Record<KdpAccount, number>;

const other = (account: KdpAccount): KdpAccount => (account === "main" ? "secondary" : "main");

/** The account that already knows more of these items; null when undecided (e.g. a new account). */
export function likelyAccount(matches: AccountMatches): KdpAccount | null {
  if (matches.main > matches.secondary) return "main";
  if (matches.secondary > matches.main) return "secondary";
  return null;
}

/** Error message when the data clearly belongs to the other account, else null. */
export function accountMismatch(
  chosen: KdpAccount,
  matches: AccountMatches,
  what: "libri" | "titoli" | "ASIN",
): string | null {
  const wrong = other(chosen);
  if (matches[wrong] <= matches[chosen]) return null;
  return (
    `Questi dati sembrano di «${accountLabel(wrong)}»: ${matches[wrong]} ${what} sono già ` +
    `associati a quell'account (${matches[chosen]} a «${accountLabel(chosen)}»). ` +
    `Controlla con quale account sei entrato in KDP e scegli quello.`
  );
}
