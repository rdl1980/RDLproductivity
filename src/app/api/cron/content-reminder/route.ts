import { isValidCronSecret, runContentReminder } from "@/server/content-reminder";
import { issuerOf } from "@/server/oauth";
import { TelegramError } from "@/server/telegram";

/**
 * Called every hour by pg_cron (Supabase) with the bearer secret stored in
 * AppSetting `cron.secret`; sends the "Da fare" reminder once, from 11:00 Rome.
 */
export async function POST(req: Request) {
  if (!(await isValidCronSecret(req.headers.get("authorization")))) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  try {
    return Response.json(await runContentReminder(issuerOf(req)));
  } catch (error) {
    const message = error instanceof TelegramError ? error.message : "errore interno";
    return Response.json({ error: message }, { status: 502 });
  }
}
