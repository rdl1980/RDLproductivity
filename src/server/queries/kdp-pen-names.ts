import "server-only";

import type { KdpAccount } from "@/lib/kdp";
import { mainTitle } from "@/lib/kdp-books";
import { type PenProfile, penRegistry, type RegistryEntry } from "@/lib/kdp-pen-names";
import { db } from "@/server/db";
import { parseFormats } from "@/server/queries/kdp-books";

const profileSelect = {
  name: true,
  owner: true,
  website: true,
  email: true,
  amazonUrl: true,
  instagram: true,
  facebook: true,
  tiktok: true,
  languages: true,
  genres: true,
  bio: true,
  notes: true,
} as const;

/** Every pen name with its saved details and its books (formats included). */
export async function getPenNameRegistry(): Promise<RegistryEntry[]> {
  const [books, profiles] = await Promise.all([
    db.kdpBook.findMany({
      select: {
        id: true,
        title: true,
        account: true,
        series: true,
        author: true,
        formats: true,
        missingSince: true,
      },
    }),
    db.kdpPenName.findMany({ select: profileSelect }),
  ]);
  return penRegistry(
    books.map((b) => ({
      id: b.id,
      title: mainTitle(b.title),
      account: b.account as KdpAccount,
      series: b.series,
      author: b.author,
      formats: parseFormats(b.formats),
      missing: b.missingSince !== null,
    })),
    profiles satisfies PenProfile[],
  );
}
