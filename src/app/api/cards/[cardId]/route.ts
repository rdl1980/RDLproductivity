import { auth } from "@/auth";
import { loadCardDetail } from "@/server/queries/card-detail";

// A GET route instead of a Server Action: actions run one at a time, so reads
// would otherwise wait behind pending mutations.
export async function GET(_request: Request, { params }: RouteContext<"/api/cards/[cardId]">) {
  const session = await auth();
  if (!session?.user) return Response.json({ error: "Non autorizzato" }, { status: 401 });

  const { cardId } = await params;
  const detail = await loadCardDetail(cardId);
  if (!detail) return Response.json({ error: "Card non trovata." }, { status: 404 });
  return Response.json(detail, { headers: { "Cache-Control": "no-store" } });
}
