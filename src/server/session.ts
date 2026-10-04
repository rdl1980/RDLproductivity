import "server-only";

import type { Session } from "next-auth";
import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { getMcpUser } from "@/server/mcp-context";

/**
 * Proxy checks are optimistic: every Server Component and Server Action that
 * reads or writes data must call this as well.
 */
export async function requireSession(): Promise<Session> {
  const mcpUser = getMcpUser();
  if (mcpUser) return { user: { email: mcpUser.email }, expires: "" };
  const session = await auth();
  if (!session?.user) redirect("/login");
  return session;
}

/** For Server Actions: returns false instead of redirecting. */
export async function isAuthenticated() {
  if (getMcpUser()) return true;
  const session = await auth();
  return !!session?.user;
}
