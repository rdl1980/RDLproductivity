import type { Metadata } from "next";

import { SalesImportView } from "@/components/sales/sales-import-view";
import { requireSession } from "@/server/session";

export const metadata: Metadata = { title: "Importa vendite KDP · RDL Productivity" };

/** Landing page of the sales bookmarklet: the rows are in the URL fragment, read in the browser. */
export default async function SalesImportPage() {
  await requireSession();
  return <SalesImportView />;
}
