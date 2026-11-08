import "server-only";

import { type VideoStats, parseVideoStats, youtubeVideoId } from "@/lib/youtube";
import { db } from "@/server/db";
import { getSetting, setSetting } from "@/server/telegram-settings";

/**
 * Daily YouTube numbers of the published layers, through the YouTube Data
 * API (an API key saved from Integrazioni, AppSetting `youtube.apiKey`).
 * One reading per day accumulates in ContentMetric, like the ones by hand.
 */
export const YOUTUBE_KEY = "youtube.apiKey";
export const YOUTUBE_LAST_RUN = "youtube.lastRun";

const apiBase = () => process.env.YOUTUBE_API_URL ?? "https://www.googleapis.com/youtube/v3";

export class YouTubeError extends Error {}

export async function fetchVideoStats(
  key: string,
  ids: string[],
): Promise<Map<string, VideoStats>> {
  const out = new Map<string, VideoStats>();
  for (let i = 0; i < ids.length; i += 50) {
    const url = `${apiBase()}/videos?part=statistics&id=${ids.slice(i, i + 50).join(",")}&key=${encodeURIComponent(key)}`;
    let res: Response;
    try {
      res = await fetch(url, { signal: AbortSignal.timeout(15_000) });
    } catch {
      throw new YouTubeError("YouTube non risponde, riprova.");
    }
    const json = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
    if (!res.ok) {
      throw new YouTubeError(
        res.status === 400 || res.status === 403
          ? `Chiave YouTube non valida o API non attiva: ${json?.error?.message ?? res.status}`
          : `YouTube: errore ${res.status}`,
      );
    }
    for (const [id, stats] of parseVideoStats(json)) out.set(id, stats);
  }
  return out;
}

export type YouTubeRun = { at: string; ok: boolean; message: string; layers: number };

/** Reads the numbers of every published YouTube layer with a video link. */
export async function runYouTubeMetrics(now = new Date()): Promise<YouTubeRun | null> {
  const key = await getSetting(YOUTUBE_KEY);
  if (!key) return null;
  const layers = await db.contentLayer.findMany({
    where: {
      platform: "youtube",
      active: true,
      publishStatus: "pubblicato",
      url: { not: null },
      piece: { archivedAt: null },
    },
    select: { id: true, url: true },
  });
  const byVideo = new Map<string, string[]>();
  for (const layer of layers) {
    const id = youtubeVideoId(layer.url);
    if (id) byVideo.set(id, [...(byVideo.get(id) ?? []), layer.id]);
  }
  let run: YouTubeRun;
  try {
    const stats = byVideo.size ? await fetchVideoStats(key, [...byVideo.keys()]) : new Map();
    const rows = [...stats].flatMap(([id, s]) =>
      (byVideo.get(id) ?? []).map((layerId) => ({
        layerId,
        measuredAt: now,
        views: s.views,
        likes: s.likes,
        comments: s.comments,
      })),
    );
    if (rows.length) await db.contentMetric.createMany({ data: rows });
    const missing = byVideo.size - stats.size;
    run = {
      at: now.toISOString(),
      ok: true,
      layers: rows.length,
      message:
        `${rows.length} ${rows.length === 1 ? "video aggiornato" : "video aggiornati"}` +
        (missing > 0 ? `, ${missing} non trovati (privati o rimossi)` : ""),
    };
  } catch (error) {
    run = {
      at: now.toISOString(),
      ok: false,
      layers: 0,
      message: error instanceof Error ? error.message : String(error),
    };
  }
  await setSetting(YOUTUBE_LAST_RUN, JSON.stringify(run));
  return run;
}

export async function getYouTubeStatus(): Promise<{
  connected: boolean;
  lastRun: YouTubeRun | null;
}> {
  const [key, last] = await Promise.all([getSetting(YOUTUBE_KEY), getSetting(YOUTUBE_LAST_RUN)]);
  let lastRun: YouTubeRun | null = null;
  try {
    lastRun = last ? (JSON.parse(last) as YouTubeRun) : null;
  } catch {
    lastRun = null;
  }
  return { connected: !!key, lastRun };
}
