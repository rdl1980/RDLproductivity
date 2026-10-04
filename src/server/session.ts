import "server-only";

import { redirect } from "next/navigation";

import { auth } from "@/auth";

/**
 * Proxy checks are optimistic: every Server Component and Server Action that
 * reads or writes data must call this as well.
 */
export async function requireSession() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  return session;
}
