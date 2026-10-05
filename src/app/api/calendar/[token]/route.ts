import { buildFeed, isValidFeedToken } from "@/server/ical-feed";
import { issuerOf } from "@/server/oauth";

/**
 * Private iCal feed of due dates. Calendar apps cannot log in, so the URL
 * itself is the credential (see `src/server/ical-feed.ts`).
 */
export async function GET(req: Request, { params }: RouteContext<"/api/calendar/[token]">) {
  const { token } = await params;
  if (!(await isValidFeedToken(token.replace(/\.ics$/, "")))) {
    return new Response("Not found", { status: 404 });
  }
  return new Response(await buildFeed(issuerOf(req)), {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": 'inline; filename="rdl-productivity.ics"',
      "Cache-Control": "private, no-store",
    },
  });
}
