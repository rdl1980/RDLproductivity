export { auth as proxy } from "@/auth";

export const config = {
  // Everything except Auth.js routes, Next internals and static files.
  matcher: [
    "/((?!api/auth|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
