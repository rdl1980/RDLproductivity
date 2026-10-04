import "server-only";

import { AsyncLocalStorage } from "node:async_hooks";

type McpUser = { email: string };

const storage = new AsyncLocalStorage<McpUser>();

/**
 * Runs `fn` on behalf of a user authenticated with an MCP access token, so the
 * existing Server Actions accept the call without a session cookie.
 */
export function runAsMcpUser<T>(user: McpUser, fn: () => Promise<T>): Promise<T> {
  return storage.run(user, fn);
}

export function getMcpUser(): McpUser | undefined {
  return storage.getStore();
}
