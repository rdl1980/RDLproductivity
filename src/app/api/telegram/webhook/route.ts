import { issuerOf } from "@/server/oauth";
import { handleUpdate, isValidWebhookSecret } from "@/server/telegram-bot";

/**
 * Telegram's webhook: commands and captured messages from the owner's chat.
 * The secret header is the one set with `setWebhook` (AppSetting
 * `telegram.webhookSecret`). Always 200 once authenticated, or Telegram retries.
 */
export async function POST(req: Request) {
  if (!(await isValidWebhookSecret(req.headers.get("x-telegram-bot-api-secret-token")))) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  const update = await req.json().catch(() => null);
  try {
    if (update) await handleUpdate(update, issuerOf(req));
  } catch (error) {
    console.error("Telegram update not handled", error);
  }
  return Response.json({ ok: true });
}
