import { accountLabel, KDP_ACCOUNT_VALUES, type KdpAccount } from "./kdp";

/**
 * How many items of an import (Bookshelf books, or report titles) each
 * account already knows. KDP ids and ASINs belong to one account only, so the
 * counts tell which account the data comes from.
 */
export type AccountMatches = Record<KdpAccount, number>;

export const noMatches = (): AccountMatches =>
  Object.fromEntries(KDP_ACCOUNT_VALUES.map((account) => [account, 0])) as AccountMatches;

/** The account that knows the most of these items; null when undecided (none, or a tie). */
export function likelyAccount(matches: AccountMatches): KdpAccount | null {
  const [first, second] = [...KDP_ACCOUNT_VALUES].sort((a, b) => matches[b] - matches[a]);
  return matches[first] > matches[second] ? first : null;
}

/** Error message when the data clearly belongs to the other account, else null. */
export function accountMismatch(
  chosen: KdpAccount,
  matches: AccountMatches,
  what: "libri" | "titoli" | "ASIN",
): string | null {
  const wrong = KDP_ACCOUNT_VALUES.filter((a) => a !== chosen).sort(
    (a, b) => matches[b] - matches[a],
  )[0];
  if (matches[wrong] <= matches[chosen]) return null;
  return (
    `Questi dati sembrano di «${accountLabel(wrong)}»: ${matches[wrong]} ${what} sono già ` +
    `associati a quell'account (${matches[chosen]} a «${accountLabel(chosen)}»). ` +
    `Controlla con quale account sei entrato in KDP e scegli quello.`
  );
}
