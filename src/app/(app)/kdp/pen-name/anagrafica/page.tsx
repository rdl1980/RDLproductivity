import type { Metadata } from "next";

import { PenRegistryView } from "@/components/kdp/pen-registry-view";
import { getPenNameRegistry } from "@/server/queries/kdp-pen-names";
import { requireSession } from "@/server/session";

export const metadata: Metadata = { title: "Anagrafica pen name · RDL Productivity" };

export default async function PenRegistryPage() {
  await requireSession();
  return <PenRegistryView registry={await getPenNameRegistry()} />;
}
