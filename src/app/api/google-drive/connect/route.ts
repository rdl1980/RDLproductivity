import { randomBytes } from "node:crypto";

import { auth } from "@/auth";
import { DRIVE_STATE_COOKIE as STATE_COOKIE, driveConsentUrl } from "@/server/google-drive";
import { issuerOf } from "@/server/oauth";

/** Starts the Google consent for Drive (scope drive.file). */
export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user) return Response.redirect(new URL("/login", req.url));
  const origin = issuerOf(req);
  const state = randomBytes(16).toString("hex");
  const url = driveConsentUrl(origin, state);
  if (!url) return Response.redirect(`${origin}/connections?drive=noclient#backup`);
  return new Response(null, {
    status: 302,
    headers: {
      Location: url,
      "Set-Cookie": `${STATE_COOKIE}=${state}; Path=/api/google-drive; HttpOnly; SameSite=Lax; Max-Age=600${origin.startsWith("https") ? "; Secure" : ""}`,
    },
  });
}
