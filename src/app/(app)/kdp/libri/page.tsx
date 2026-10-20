import type { Metadata } from "next";
import { headers } from "next/headers";

import { KdpBooksView } from "@/components/kdp/kdp-books-view";
import { getKdpBooks } from "@/server/queries/kdp-books";
import { issuerFromHeaders } from "@/server/oauth";
import { requireSession } from "@/server/session";

export const metadata: Metadata = { title: "Libri KDP · RDL Productivity" };

export default async function KdpBooksPage() {
  await requireSession();
  const [books, requestHeaders] = await Promise.all([getKdpBooks(), headers()]);
  return <KdpBooksView books={books} origin={issuerFromHeaders(requestHeaders)} />;
}
