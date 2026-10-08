import { createHash, randomBytes } from "node:crypto";

import type { APIRequestContext, Page } from "@playwright/test";

import { expect, test } from "./fixtures";

const REDIRECT_URI = "https://client.example/callback";

function pkce() {
  const verifier = randomBytes(32).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  return { verifier, challenge };
}

async function registerClient(request: APIRequestContext, name = "Client E2E") {
  const response = await request.post("/oauth/register", {
    data: {
      client_name: name,
      redirect_uris: [REDIRECT_URI],
      token_endpoint_auth_method: "none",
    },
  });
  expect(response.status()).toBe(201);
  return ((await response.json()) as { client_id: string }).client_id;
}

/** Goes through the consent page and returns the redirect the client receives. */
async function authorize(
  page: Page,
  clientId: string,
  challenge: string,
  decision: string,
  name = "Client E2E",
) {
  let captured: URL | null = null;
  await page.route("https://client.example/**", async (route) => {
    captured = new URL(route.request().url());
    await route.fulfill({ body: "ok" });
  });
  const params = new URLSearchParams({
    response_type: "code",
    client_id: clientId,
    redirect_uri: REDIRECT_URI,
    code_challenge: challenge,
    code_challenge_method: "S256",
    state: "xyz",
    scope: "mcp",
  });
  await page.goto(`/oauth/authorize?${params}`);
  await expect(
    page.getByRole("heading", { name: `${name} vuole accedere a RDL Productivity` }),
  ).toBeVisible();
  await page.getByRole("button", { name: decision }).click();
  await expect.poll(() => captured).not.toBeNull();
  return captured! as URL;
}

async function token(request: APIRequestContext, form: Record<string, string>) {
  return request.post("/oauth/token", { form });
}

/** Calls an MCP method over Streamable HTTP and returns the JSON-RPC result. */
async function mcp(request: APIRequestContext, accessToken: string, method: string, params = {}) {
  const response = await request.post("/api/mcp", {
    headers: {
      authorization: `Bearer ${accessToken}`,
      accept: "application/json, text/event-stream",
      "mcp-protocol-version": "2025-06-18",
    },
    data: { jsonrpc: "2.0", id: 1, method, params },
  });
  expect(response.status()).toBe(200);
  const text = await response.text();
  const payload = text.trimStart().startsWith("{")
    ? text
    : text
        .split("\n")
        .filter((line) => line.startsWith("data:"))
        .map((line) => line.slice(5))
        .join("");
  const message = JSON.parse(payload) as { result?: unknown; error?: unknown };
  expect(message.error).toBeUndefined();
  return message.result as Record<string, unknown>;
}

async function callTool(
  request: APIRequestContext,
  accessToken: string,
  name: string,
  args: Record<string, unknown>,
) {
  const result = (await mcp(request, accessToken, "tools/call", { name, arguments: args })) as {
    content: { text: string }[];
    isError?: boolean;
  };
  expect(result.isError, result.content[0]?.text).toBeFalsy();
  return JSON.parse(result.content[0].text) as Record<string, unknown>;
}

test("the MCP endpoint requires a bearer token and advertises its authorization server", async ({
  request,
}) => {
  const unauthenticated = await request.post("/api/mcp", { data: {} });
  expect(unauthenticated.status()).toBe(401);
  expect(unauthenticated.headers()["www-authenticate"]).toContain("resource_metadata=");

  const resource = await (
    await request.get("/.well-known/oauth-protected-resource/api/mcp")
  ).json();
  expect(resource.resource).toMatch(/\/api\/mcp$/);
  const metadata = await (await request.get("/.well-known/oauth-authorization-server")).json();
  expect(metadata.issuer).toBe(resource.authorization_servers[0]);
  expect(metadata.code_challenge_methods_supported).toEqual(["S256"]);
});

test("an MCP client authorizes via OAuth and edits boards through tools", async ({
  page,
  request,
}) => {
  const clientName = `Client E2E ${Date.now()}`;
  const clientId = await registerClient(request, clientName);
  const { verifier, challenge } = pkce();
  const redirect = await authorize(page, clientId, challenge, "Consenti", clientName);
  expect(redirect.searchParams.get("state")).toBe("xyz");
  expect(redirect.searchParams.get("iss")).toBeTruthy();
  const code = redirect.searchParams.get("code")!;

  // A wrong verifier burns nothing but fails; codes are single use.
  const exchange = {
    grant_type: "authorization_code",
    client_id: clientId,
    code,
    redirect_uri: REDIRECT_URI,
  };
  const issued = await token(request, { ...exchange, code_verifier: verifier });
  expect(issued.status()).toBe(200);
  const tokens = (await issued.json()) as { access_token: string; refresh_token: string };
  expect((await token(request, { ...exchange, code_verifier: verifier })).status()).toBe(400);

  const init = await mcp(request, tokens.access_token, "initialize", {
    protocolVersion: "2025-06-18",
    capabilities: {},
    clientInfo: { name: "e2e", version: "1.0.0" },
  });
  expect(init.serverInfo).toMatchObject({ name: "rdl-productivity" });
  const { tools } = (await mcp(request, tokens.access_token, "tools/list")) as {
    tools: { name: string }[];
  };
  expect(tools.map((tool) => tool.name)).toEqual(
    expect.arrayContaining(["list_boards", "get_board", "create_card", "update_card", "move_card"]),
  );

  const title = `MCP ${Date.now()}`;
  const board = await callTool(request, tokens.access_token, "create_board", {
    title,
    color: "Verde",
  });
  const list = await callTool(request, tokens.access_token, "create_list", {
    boardId: board.id,
    title: "Da fare",
  });
  const card = await callTool(request, tokens.access_token, "create_card", {
    listId: list.id,
    title: "Scritta da Claude",
    description: "Creata via **MCP**",
    dueDate: "2026-12-01T09:00:00+01:00",
  });
  expect(card).toMatchObject({ title: "Scritta da Claude", dueDate: "2026-12-01T08:00:00.000Z" });
  await callTool(request, tokens.access_token, "create_checklist", {
    cardId: card.id,
    title: "Passi",
    items: ["Uno", "Due"],
  });
  const done = await callTool(request, tokens.access_token, "update_card", {
    cardId: card.id,
    completed: true,
  });
  expect(done).toMatchObject({ completed: true });
  const found = (await callTool(request, tokens.access_token, "search_cards", {
    query: "Scritta da Claude",
  })) as unknown as { id: string }[];
  expect(found.map((result) => result.id)).toContain(card.id);

  // KDP calendar: a far week, so it does not clutter the current month.
  const kdp = await callTool(request, tokens.access_token, "create_kdp_task", {
    title: `KDP ${title}`,
    week: "2030-03-14",
    account: "main",
  });
  expect(kdp).toMatchObject({ week: "2030-03-11", account: "main", done: false });
  await callTool(request, tokens.access_token, "update_kdp_task", {
    taskId: kdp.id,
    done: true,
    account: "secondary",
  });
  const kdpTasks = (await callTool(request, tokens.access_token, "list_kdp_tasks", {
    month: "2030-03",
  })) as unknown as { id: string; account: string; done: boolean }[];
  expect(kdpTasks.find((task) => task.id === kdp.id)).toMatchObject({
    account: "secondary",
    done: true,
  });
  await callTool(request, tokens.access_token, "delete_kdp_task", { taskId: kdp.id });

  // Claude's changes are logged with Claude as the actor.
  const log = (await callTool(request, tokens.access_token, "list_activity", {
    cardId: card.id,
  })) as unknown as { actor: string; summary: string }[];
  expect(log[0]).toMatchObject({ actor: "claude", summary: expect.stringContaining("completata") });

  // The changes are visible in the app.
  await page.unroute("https://client.example/**");
  await page.goto(`/boards/${board.id}`);
  await expect(page.getByText("Scritta da Claude")).toBeVisible();

  // Refresh tokens rotate: the old one stops working.
  const refreshed = await token(request, {
    grant_type: "refresh_token",
    client_id: clientId,
    refresh_token: tokens.refresh_token,
  });
  expect(refreshed.status()).toBe(200);
  const reused = await token(request, {
    grant_type: "refresh_token",
    client_id: clientId,
    refresh_token: tokens.refresh_token,
  });
  expect(reused.status()).toBe(400);
  const { access_token } = (await refreshed.json()) as { access_token: string };
  await callTool(request, access_token, "update_board", { boardId: board.id, archived: true });

  // Revoking the connection from the app invalidates its tokens.
  await page.goto("/connections");
  const connection = page.getByRole("listitem").filter({ hasText: clientName });
  await connection.getByRole("button", { name: "Revoca" }).click();
  await expect(connection).toHaveCount(0);
  const revoked = await request.post("/api/mcp", {
    headers: { authorization: `Bearer ${access_token}` },
    data: { jsonrpc: "2.0", id: 1, method: "tools/list" },
  });
  expect(revoked.status()).toBe(401);
});

test("denying consent sends access_denied back to the client", async ({ page, request }) => {
  const clientId = await registerClient(request);
  const redirect = await authorize(page, clientId, pkce().challenge, "Annulla");
  expect(redirect.searchParams.get("error")).toBe("access_denied");
  expect(redirect.searchParams.get("code")).toBeNull();
});

test("unregistered redirect URIs are refused without redirecting", async ({ page, request }) => {
  const clientId = await registerClient(request);
  const params = new URLSearchParams({
    response_type: "code",
    client_id: clientId,
    redirect_uri: "https://evil.example/steal",
    code_challenge: pkce().challenge,
    code_challenge_method: "S256",
  });
  await page.goto(`/oauth/authorize?${params}`);
  await expect(
    page.getByText("redirect_uri non registrato per questa applicazione."),
  ).toBeVisible();
});
