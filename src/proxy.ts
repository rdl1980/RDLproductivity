export { auth as proxy } from "@/auth";

export const config = {
  // Everything except Auth.js routes, the bearer-token MCP and OAuth endpoints,
  // Next internals and static files. The consent page stays behind login.
  matcher: [
    "/((?!api/auth|api/mcp|api/calendar|\\.well-known|oauth/(?:token|register|revoke)|_next/static|_next/image|favicon.ico|manifest.webmanifest|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
