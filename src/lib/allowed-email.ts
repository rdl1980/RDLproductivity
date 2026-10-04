/** Parses `ALLOWED_EMAIL`: one address or a comma-separated list. */
export function parseAllowedEmails(raw: string | undefined): string[] {
  return (raw ?? "")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
}

export function isEmailAllowed(email: string | null | undefined, raw: string | undefined): boolean {
  if (!email) return false;
  return parseAllowedEmails(raw).includes(email.trim().toLowerCase());
}
