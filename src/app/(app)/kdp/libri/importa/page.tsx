import type { Metadata } from "next";

import { KdpImportView } from "@/components/kdp/kdp-import-view";
import { requireSession } from "@/server/session";

export const metadata: Metadata = { title: "Importa libri KDP · RDL Productivity" };

/** Landing page of the bookmarklet: the books are in the URL fragment, read in the browser. */
export default async function KdpImportPage() {
  await requireSession();
  return <KdpImportView />;
}
