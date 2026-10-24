import type { Metadata } from "next";
import { headers } from "next/headers";

import { KdpBooksView } from "@/components/kdp/kdp-books-view";
import { getKdpBooks } from "@/server/queries/kdp-books";
import { issuerFromHeaders } from "@/server/oauth";
import { requireSession } from "@/server/session";

export const metadata: Metadata = { title: "Libri KDP · RDL Productivity" };

export default async function KdpBooksPage({ searchParams }: PageProps<"/kdp/libri">) {
  await requireSession();
  const [books, requestHeaders, params] = await Promise.all([
    getKdpBooks(),
    headers(),
    searchParams,
  ]);
  const q = typeof params.q === "string" ? params.q.slice(0, 200) : "";
  return (
    <KdpBooksView
      key={q}
      books={books}
      origin={issuerFromHeaders(requestHeaders)}
      initialQuery={q}
    />
  );
}
