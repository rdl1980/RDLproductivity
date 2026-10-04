export type Segment = { text: string; match: boolean };

/** Splits `text` into matching and non-matching segments (case-insensitive). */
export function highlight(text: string, query: string): Segment[] {
  const q = query.trim().toLowerCase();
  if (!q) return [{ text, match: false }];
  const segments: Segment[] = [];
  const lower = text.toLowerCase();
  let index = 0;
  while (index < text.length) {
    const found = lower.indexOf(q, index);
    if (found === -1) break;
    if (found > index) segments.push({ text: text.slice(index, found), match: false });
    segments.push({ text: text.slice(found, found + q.length), match: true });
    index = found + q.length;
  }
  if (index < text.length) segments.push({ text: text.slice(index), match: false });
  return segments;
}

/** A short excerpt of `text` around the first match of `query`, on a single line. */
export function snippet(text: string, query: string, radius = 60): string {
  const flat = text.replace(/\s+/g, " ").trim();
  const found = flat.toLowerCase().indexOf(query.trim().toLowerCase());
  if (found === -1 || !query.trim()) {
    return flat.length > radius * 2 ? `${flat.slice(0, radius * 2).trimEnd()}…` : flat;
  }
  const start = Math.max(0, found - radius);
  const end = Math.min(flat.length, found + query.trim().length + radius);
  return `${start > 0 ? "…" : ""}${flat.slice(start, end).trim()}${end < flat.length ? "…" : ""}`;
}
