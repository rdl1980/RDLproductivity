/** YouTube links and the API's statistics. Pure, tested. */

/** The video id of a YouTube link (watch, youtu.be, shorts, live, embed), or null. */
export function youtubeVideoId(url: string | null | undefined): string | null {
  if (!url) return null;
  let parsed: URL;
  try {
    parsed = new URL(url.trim());
  } catch {
    return null;
  }
  const host = parsed.hostname.replace(/^(www|m|music)\./, "");
  const valid = (id: string | null | undefined) => (id && /^[\w-]{11}$/.test(id) ? id : null);
  if (host === "youtu.be") return valid(parsed.pathname.slice(1).split("/")[0]);
  if (host !== "youtube.com" && host !== "youtube-nocookie.com") return null;
  if (parsed.pathname === "/watch") return valid(parsed.searchParams.get("v"));
  const m = /^\/(?:shorts|live|embed|v)\/([^/?#]+)/.exec(parsed.pathname);
  return valid(m?.[1]);
}

export type VideoStats = { views: number | null; likes: number | null; comments: number | null };

const num = (v: unknown) => (typeof v === "string" && /^\d+$/.test(v) ? Number(v) : null);

/** `videos?part=statistics` items → stats by video id. */
export function parseVideoStats(json: unknown): Map<string, VideoStats> {
  const out = new Map<string, VideoStats>();
  const items = (json as { items?: unknown[] } | null)?.items;
  if (!Array.isArray(items)) return out;
  for (const item of items) {
    const { id, statistics } = (item ?? {}) as {
      id?: string;
      statistics?: Record<string, unknown>;
    };
    if (!id || !statistics) continue;
    out.set(id, {
      views: num(statistics.viewCount),
      likes: num(statistics.likeCount),
      comments: num(statistics.commentCount),
    });
  }
  return out;
}
