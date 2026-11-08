import { createServer, type Server } from "node:http";

import JSZip from "jszip";
import { Client } from "pg";

import { expect, test } from "./fixtures";

// Google stub (consent page, token endpoint, Drive API): see playwright.config.ts.
const STUB_PORT = 4601;

type Call = { method: string; path: string; body: Buffer };
const calls: Call[] = [];
let server: Server;

test.describe.configure({ mode: "serial" });

test.beforeAll(async () => {
  server = createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on("data", (c: Buffer) => chunks.push(c));
    req.on("end", () => {
      const url = new URL(req.url ?? "/", "http://localhost");
      calls.push({ method: req.method ?? "GET", path: url.pathname, body: Buffer.concat(chunks) });
      const json = (data: unknown) => {
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify(data));
      };
      if (url.pathname === "/o/oauth2/v2/auth") {
        // The consent: straight back to the app with a code.
        const back = new URL(url.searchParams.get("redirect_uri")!);
        back.searchParams.set("code", "e2e-code");
        back.searchParams.set("state", url.searchParams.get("state")!);
        res.statusCode = 302;
        res.setHeader("Location", back.toString());
        return res.end();
      }
      if (url.pathname === "/token") {
        const payload = Buffer.from(JSON.stringify({ email: "e2e@example.com" })).toString(
          "base64url",
        );
        return json({
          access_token: "e2e-access",
          refresh_token: "e2e-refresh",
          id_token: `x.${payload}.y`,
        });
      }
      if (url.pathname === "/drive/v3/files" && req.method === "POST")
        return json({ id: "folder1" });
      if (url.pathname === "/drive/v3/files") return json({ files: [{ id: "f1" }] });
      if (url.pathname.startsWith("/drive/v3/files/"))
        return json({ id: "folder1", trashed: false });
      if (url.pathname === "/upload/drive/v3/files") return json({ id: "file1" });
      json({});
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

test("the full backup downloads as a zip without credentials", async ({ page }) => {
  await sql(
    `INSERT INTO "AppSetting" (key, value, "updatedAt") VALUES ('google.drive.e2eSecret', 'secret-e2e', now())
     ON CONFLICT (key) DO UPDATE SET value = 'secret-e2e'`,
  );
  const res = await page.request.get("/api/backup");
  expect(res.status()).toBe(200);
  expect(res.headers()["content-type"]).toBe("application/zip");
  const zip = await JSZip.loadAsync(await res.body());
  const manifest = JSON.parse(await zip.file("manifest.json")!.async("string"));
  expect(manifest.kind).toBe("full-backup");
  expect(Object.keys(manifest.tables)).toEqual(
    expect.arrayContaining(["Board", "KdpSale", "ContentPiece"]),
  );
  expect(zip.file("OAuthToken.json")).toBeNull();
  const settings = await zip.file("AppSetting.json")!.async("string");
  expect(settings).not.toContain("secret-e2e");
  await sql(`DELETE FROM "AppSetting" WHERE key = 'google.drive.e2eSecret'`);
});

test("Google Drive connects and receives the backup", async ({ page }) => {
  await page.goto("/connections");
  const panel = page.getByTestId("backup-panel");
  const off = panel.getByRole("button", { name: "Scollega Drive" });
  if (await off.isVisible()) await off.click();

  await expect(panel).toContainText("/api/google-drive/callback");
  await panel.getByRole("link", { name: "Collega Google Drive" }).click();
  await expect(page).toHaveURL(/\/connections\?drive=ok/);
  await expect(panel.getByTestId("drive-status")).toContainText("Collegato a e2e@example.com");

  calls.length = 0;
  await panel.getByRole("button", { name: "Fai un backup ora" }).click();
  // The toast, not the status line (a previous backup may already show there).
  await expect(
    page.locator("[data-sonner-toast]").filter({ hasText: /rdlproductivity-backup-.*su Drive/ }),
  ).toBeVisible();
  const upload = calls.find((c) => c.path === "/upload/drive/v3/files");
  expect(upload?.body.toString("latin1")).toContain('"parents":["folder1"]');
  // The zip is in the multipart body.
  expect(upload?.body.includes(Buffer.from("PK"))).toBe(true);

  await panel.getByRole("button", { name: "Scollega Drive" }).click();
  await expect(panel.getByRole("link", { name: "Collega Google Drive" })).toBeVisible();
});
