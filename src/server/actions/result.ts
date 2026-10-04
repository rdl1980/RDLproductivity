import { z } from "zod";

export type ActionResult<T = void> = { ok: true; data: T } | { ok: false; error: string };

export function ok<T>(data: T): ActionResult<T> {
  return { ok: true, data };
}

export function fail(error: string): ActionResult<never> {
  return { ok: false, error };
}

/** Validates `input` with `schema`, returning a user-facing error on failure. */
export function parse<S extends z.ZodType>(schema: S, input: unknown) {
  const result = schema.safeParse(input);
  if (result.success) return { data: result.data as z.infer<S>, error: null };
  return { data: null, error: result.error.issues[0]?.message ?? "Dati non validi." };
}

export const idSchema = z.string().min(1).max(64);
export const titleSchema = z
  .string()
  .trim()
  .min(1, "Il titolo non può essere vuoto.")
  .max(200, "Il titolo è troppo lungo.");
