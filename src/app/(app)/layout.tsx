import Link from "next/link";
import { Suspense } from "react";

import { signOut } from "@/auth";
import { SearchBox } from "@/components/search/search-box";
import { Button } from "@/components/ui/button";
import { requireSession } from "@/server/session";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const session = await requireSession();

  return (
    <div className="flex min-h-screen flex-col">
      <header className="flex h-12 shrink-0 items-center justify-between border-b bg-background/95 px-4">
        <div className="flex shrink-0 items-center gap-4">
          <Link href="/boards" className="font-semibold tracking-tight">
            RDL Productivity
          </Link>
          <nav aria-label="Principale" className="hidden items-center gap-1 text-sm sm:flex">
            <Link href="/boards" className="rounded-md px-2 py-1 hover:bg-muted">
              Board
            </Link>
            <Link href="/calendar" className="rounded-md px-2 py-1 hover:bg-muted">
              Calendario
            </Link>
          </nav>
        </div>
        <div className="flex flex-1 justify-center px-4">
          <Suspense>
            <SearchBox />
          </Suspense>
        </div>
        <div className="flex items-center gap-3">
          <span className="hidden text-sm text-muted-foreground sm:inline">
            {session.user?.name ?? session.user?.email}
          </span>
          <form
            action={async () => {
              "use server";
              await signOut({ redirectTo: "/login" });
            }}
          >
            <Button type="submit" variant="ghost" size="sm">
              Esci
            </Button>
          </form>
        </div>
      </header>
      <div className="flex flex-1 flex-col">{children}</div>
    </div>
  );
}
