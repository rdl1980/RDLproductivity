import NextAuth from "next-auth";
import type { Provider } from "next-auth/providers";
import GitHub from "next-auth/providers/github";
import Google from "next-auth/providers/google";

import { isEmailAllowed } from "@/lib/allowed-email";

// Providers are enabled only when their credentials are configured.
const providers: Provider[] = [];
if (process.env.AUTH_GITHUB_ID && process.env.AUTH_GITHUB_SECRET) providers.push(GitHub);
if (process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET) providers.push(Google);

export const providerMap = providers.map((provider) => {
  const { id, name } = typeof provider === "function" ? provider() : provider;
  return { id, name };
});

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers,
  // Single user, no adapter: the session lives in an encrypted JWT cookie.
  session: { strategy: "jwt" },
  trustHost: true,
  pages: { signIn: "/login", error: "/login" },
  callbacks: {
    signIn({ account, profile }) {
      if (account?.provider === "google" && profile?.email_verified !== true) return false;
      return isEmailAllowed(profile?.email, process.env.ALLOWED_EMAIL);
    },
    authorized({ auth: session, request }) {
      const isLoginPage = request.nextUrl.pathname.startsWith("/login");
      if (isLoginPage) {
        return session ? Response.redirect(new URL("/", request.nextUrl)) : true;
      }
      return !!session;
    },
  },
});
