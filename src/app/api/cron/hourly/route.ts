import { isValidCronSecret } from "@/server/content-reminder";
import { issuerOf } from "@/server/oauth";
import { runHourlyJobs } from "@/server/telegram-jobs";

/**
 * Called every hour by pg_cron (Supabase) with the bearer secret stored in
 * AppSetting `cron.secret`: the bot's daily messages (11:00 reminder, 21:00
 * sales summary, 9:00 KDP alerts), each sent once a day.
 */
export async function POST(req: Request) {
  if (!(await isValidCronSecret(req.headers.get("authorization")))) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  return Response.json(await runHourlyJobs(issuerOf(req)));
}
