import { createServer, type Server } from "node:http";

import { Client } from "pg";

import { expect, test } from "./fixtures";

// YouTube Data API stub: the dev server points YOUTUBE_API_URL here (playwright.config.ts).
const STUB_PORT = 4600;

let server: Server;
let views = 1234;

test.beforeAll(async () => {
  server = createServer((req, res) => {
    const url = new URL(req.url ?? "/", "http://localhost");
    const ids = (url.searchParams.get("id") ?? "").split(",").filter(Boolean);
    res.setHeader("Content-Type", "application/json");
    if (url.searchParams.get("key") === "bad-key-xxxxxxxxxxxxxxxxxxxxxxxxxxxxx") {
      res.statusCode = 400;
      return res.end(JSON.stringify({ error: { message: "API key not valid" } }));
    }
    res.end(
      JSON.stringify({
        items: ids.map((id) => ({
          id,
          statistics: { viewCount: String(views), likeCount: "56", commentCount: "7" },
        })),
      }),
    );
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

test("a YouTube key brings the daily numbers of the published videos", async ({ page }) => {
  const stamp = Date.now();
  const code = `yt${stamp}`;
  const videoId = `v${String(stamp).slice(-10)}`;
  // A published YouTube layer with its link.
  const rubric = (await sql(`SELECT value FROM "ContentRubric" LIMIT 1`)).rows[0].value as string;
  const piece = await sql(
    `INSERT INTO "ContentPiece" (id, code, title, rubric, "releaseDate", slot, "createdBy", "updatedBy", "updatedAt")
     VALUES ($1, $2, $3, $4, CURRENT_DATE - 3, '13:00', 'rosario', 'rosario', now()) RETURNING id`,
    [`p${stamp}`, code, `Video ${stamp}`, rubric],
  );
  const layerId = `l${stamp}`;
  await sql(
    `INSERT INTO "ContentLayer" (id, "pieceId", platform, "publishStatus", "publishedAt", url)
     VALUES ($1, $2, 'youtube', 'pubblicato', now() - interval '3 days', $3)`,
    [layerId, piece.rows[0].id, `https://youtube.com/shorts/${videoId}`],
  );

  await page.goto("/connections");
  const panel = page.getByTestId("youtube-panel");
  const remove = panel.getByRole("button", { name: "Rimuovi la chiave" });
  if (await remove.isVisible()) await remove.click();

  await panel.getByPlaceholder("AIza…").fill("bad-key-xxxxxxxxxxxxxxxxxxxxxxxxxxxxx");
  await panel.getByRole("button", { name: "Salva" }).click();
  await expect(page.getByText(/Chiave YouTube non valida/)).toBeVisible();

  await panel.getByPlaceholder("AIza…").fill("AIzaGoodKey-1234567890abcdefghijklmn");
  await panel.getByRole("button", { name: "Salva" }).click();
  await expect(panel.getByTestId("youtube-status")).toContainText("Chiave salvata");

  await panel.getByRole("button", { name: "Aggiorna ora" }).click();
  // The toast, not the status line (a previous run may already show there).
  await expect(
    page.locator("[data-sonner-toast]").filter({ hasText: /video aggiornat/ }),
  ).toBeVisible();
  const metric = await sql(
    `SELECT views, likes, comments FROM "ContentMetric" WHERE "layerId" = $1`,
    [layerId],
  );
  expect(metric.rows).toEqual([{ views: 1234, likes: 56, comments: 7 }]);

  // Every run adds a reading.
  views = 1500;
  await panel.getByRole("button", { name: "Aggiorna ora" }).click();
  await expect
    .poll(
      async () =>
        (await sql(`SELECT max(views) AS v FROM "ContentMetric" WHERE "layerId" = $1`, [layerId]))
          .rows[0].v,
    )
    .toBe(1500);
});
