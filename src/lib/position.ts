import { generateKeyBetween, generateNKeysBetween } from "fractional-indexing";

/**
 * Position strings use fractional indexing: inserting or moving an item only
 * writes that item's position, never renumbers its siblings.
 */

/** Position for an item placed between `before` and `after` (null = list edge). */
export function positionBetween(before: string | null, after: string | null): string {
  return generateKeyBetween(before, after);
}

/** Position for an item appended after the current last one. */
export function positionAfter(last: string | null): string {
  return generateKeyBetween(last, null);
}

/** `n` ascending positions, e.g. for seeding or bulk inserts. */
export function positionsFor(n: number): string[] {
  return generateNKeysBetween(null, null, n);
}
