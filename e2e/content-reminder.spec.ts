import { createServer, type Server } from "node:http";

import { Client } from "pg";

import { expect, test } from "./fixtures";
import { addLists, createBoard } from "./helpers";

// Telegram stub: the dev server points TELEGRAM_API_URL here (playwright.config.ts).
const STUB_PORT = 4599;
const BOT = "robotti_e2e_bot";
const CHAT = 4242;

type Call = { method: string; body: Record<string, unknown> };

test.describe.configure({ mode: "serial" });

let server: Server;
const calls: Call[] = [];

test.beforeAll(async () => {
  server = createServer((req, res) => {
    let raw = "";
    req.on("data", (chunk) => (raw += chunk));
    req.on("end", () => {
      const method = req.url?.split("/").at(-1) ?? "";
      calls.push({ method, body: raw ? JSON.parse(raw) : {} });
      const result =
        method === "getMe"
          ? { username: BOT }
          : method === "getUpdates"
            ? [{ message: { chat: { id: CHAT, type: "private" } } }]
            : { message_id: 1 };
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ ok: true, result }));
    });
  });
  await new Promise<void>((resolve) => server.listen(STUB_PORT, resolve));
});

test.afterAll(async () => {
  await new Promise((resolve) => server.close(resolve));
});

async function sql(query: string, params: unknown[] = []) {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    return await client.query(query, params);
  } finally {
    await client.end();
  }
}

test("connects the Telegram bot and sends a test reminder", async ({ page }) => {
  await page.goto("/robotti/da-fare");
  const box = page.getByTestId("reminder-settings");
  const disconnect = box.getByRole("button", { name: "Scollega" });
  if (await disconnect.isVisible()) {
    await disconnect.click();
    await expect(box.getByRole("button", { name: "Collega" })).toBeVisible();
  }

  await box.getByPlaceholder("123456789:AAE…").fill("12345678:AAEabcdefghijklmnopqrstuvwxyz0123");
  await box.getByRole("button", { name: "Collega" }).click();
  await expect(box).toContainText(`@${BOT}`);
  // Connecting also points the webhook at the app, for commands and captures.
  const hook = calls.find((c) => c.method === "setWebhook");
  expect(String(hook?.body.url)).toMatch(/\/api\/telegram\/webhook$/);
  expect(hook?.body.secret_token).toBeTruthy();

  calls.length = 0;
  await box.getByRole("button", { name: "Invia ora una prova" }).click();
  await expect(page.getByText(/^Inviato/)).toBeVisible();
  const sent = calls.find((c) => c.method === "sendMessage");
  expect(sent?.body.chat_id).toBe(String(CHAT));
  expect(sent?.body.parse_mode).toBe("HTML");
  expect(String(sent?.body.text)).toContain("Robotti &amp; Robotte");
});

test("the bot answers commands and turns messages into cards", async ({ page, request }) => {
  const stamp = Date.now();
  await createBoard(page, `Bot ${stamp}`);
  await addLists(page, ["Idee"]);
  const boardUrl = page.url();

  // Connected by the previous test; the webhook secret is the one sent to setWebhook.
  const rows = await sql(`SELECT value FROM "AppSetting" WHERE key = 'telegram.webhookSecret'`);
  const secret = rows.rows[0]?.value as string;
  expect(secret).toBeTruthy();

  await page.goto("/connections");
  const panel = page.getByTestId("telegram-panel");
  await expect(panel.getByTestId("commands-on")).toBeVisible();
  await panel.getByRole("combobox", { name: "Lista della cattura rapida" }).click();
  await page.getByRole("option", { name: `Bot ${stamp} → Idee` }).click();
  await expect(page.getByText("Lista salvata")).toBeVisible();

  const say = (text: string, chat = CHAT, header = secret) =>
    request.post("/api/telegram/webhook", {
      headers: { "x-telegram-bot-api-secret-token": header },
      data: { update_id: 1, message: { message_id: 1, chat: { id: chat, type: "private" }, text } },
    });
  const lastReply = () =>
    String(calls.filter((c) => c.method === "sendMessage").at(-1)?.body.text ?? "");

  expect((await say("/oggi", CHAT, "wrong")).status()).toBe(401);

  calls.length = 0;
  expect((await say("/oggi", 999)).status()).toBe(200);
  expect(calls.filter((c) => c.method === "sendMessage")).toHaveLength(0);

  await say("/oggi");
  expect(lastReply()).toContain("<b>Oggi</b>");
  await say("/vendite");
  expect(lastReply()).toContain("Vendite KDP");
  await say("/fatto");
  expect(lastReply()).toContain("Scrivi il codice");
  await say("/boh");
  expect(lastReply()).toContain("sconosciuto");

  await say(`Idea dal bot ${stamp}\nCon dettagli`);
  expect(lastReply()).toContain(`Card «Idea dal bot ${stamp}» creata in Bot ${stamp} → Idee`);
  await page.goto(boardUrl);
  await expect(page.getByText(`Idea dal bot ${stamp}`)).toBeVisible();

  // The evening summary, on demand.
  calls.length = 0;
  await page.goto("/connections");
  await page.getByRole("button", { name: "Invia ora il riepilogo di oggi" }).click();
  await expect(page.getByText("Riepilogo inviato")).toBeVisible();
  expect(lastReply()).toContain("Vendite KDP di oggi");
});

test("the hourly endpoint needs the secret and sends once a day", async ({ request }) => {
  expect((await request.post("/api/cron/content-reminder")).status()).toBe(401);

  const secret = `e2e-${"x".repeat(40)}`;
  await sql(
    `INSERT INTO "AppSetting" (key, value, "updatedAt") VALUES ('cron.secret', $1, now())
     ON CONFLICT (key) DO UPDATE SET value = $1, "updatedAt" = now()`,
    [secret],
  );
  await sql(`DELETE FROM "AppSetting" WHERE key = 'content.reminder.lastSent'`);

  const wrong = await request.post("/api/cron/content-reminder", {
    headers: { Authorization: `Bearer ${secret}y` },
  });
  expect(wrong.status()).toBe(401);

  const call = () =>
    request.post("/api/cron/content-reminder", {
      headers: { Authorization: `Bearer ${secret}` },
    });
  const first = await call();
  expect(first.status()).toBe(200);
  const body = (await first.json()) as { status: string; reminder: string; summary: string };
  expect(body.status).toBe("ok");
  const status = body.reminder;
  const romeHour = Number(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: "Europe/Rome",
      hour: "2-digit",
      hourCycle: "h23",
    }).format(new Date()),
  );
  if (romeHour < 11) {
    expect(status).toBe("not-yet");
  } else {
    expect(["sent", "nothing-to-do"]).toContain(status);
    expect(((await (await call()).json()) as { reminder: string }).reminder).toBe("already-sent");
  }
});
