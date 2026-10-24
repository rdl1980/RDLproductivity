import type { Metadata } from "next";

import { AdsImportView } from "@/components/sales/ads-import-view";
import { getFxRates } from "@/server/queries/kdp-ads";
import { requireSession } from "@/server/session";

export const metadata: Metadata = { title: "Importa spesa Ads · RDL Productivity" };

export default async function AdsImportPage() {
  await requireSession();
  return <AdsImportView fx={await getFxRates()} />;
}
