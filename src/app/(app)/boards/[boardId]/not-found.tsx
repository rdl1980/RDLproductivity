import Link from "next/link";

import { Button } from "@/components/ui/button";

export default function BoardNotFound() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-4 p-8">
      <h1 className="text-xl font-semibold">Board non trovata</h1>
      <p className="text-sm text-muted-foreground">Potrebbe essere stata archiviata o eliminata.</p>
      <Button asChild variant="outline">
        <Link href="/boards">Torna alle board</Link>
      </Button>
    </main>
  );
}
