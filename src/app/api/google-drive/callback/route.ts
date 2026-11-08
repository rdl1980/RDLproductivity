import { auth } from "@/auth";
import { logActivity } from "@/server/activity";
import {
  connectDrive,
  DRIVE_STATE_COOKIE as STATE_COOKIE,
  DriveError,
} from "@/server/google-drive";
import { issuerOf } from "@/server/oauth";

/** Google's redirect after the Drive consent. */
export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user) return Response.redirect(new URL("/login", req.url));
  const origin = issuerOf(req);
  const url = new URL(req.url);
  const cookie = req.headers.get("cookie") ?? "";
  const expected = new RegExp(`${STATE_COOKIE}=([a-f0-9]+)`).exec(cookie)?.[1];
  const back = (status: string) =>
    new Response(null, {
      status: 302,
      headers: {
        Location: `${origin}/connections?drive=${encodeURIComponent(status)}#backup`,
        "Set-Cookie": `${STATE_COOKIE}=; Path=/api/google-drive; Max-Age=0`,
      },
    });
  const code = url.searchParams.get("code");
  if (!code || !expected || url.searchParams.get("state") !== expected) {
    return back(url.searchParams.get("error") ?? "invalid");
  }
  try {
    await connectDrive(code, origin);
  } catch (error) {
    return back(error instanceof DriveError ? error.message : "error");
  }
  await logActivity({
    kind: "drive.connect",
    summary: "Google Drive collegato per i backup",
    entityIds: [],
  });
  return back("ok");
}
