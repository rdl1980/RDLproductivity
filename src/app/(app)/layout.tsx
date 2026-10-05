import { CalendarDaysIcon, FlameIcon, LayoutGridIcon, SunIcon } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";

import { signOut } from "@/auth";
import { SearchBox } from "@/components/search/search-box";
import { UserMenu } from "@/components/user-menu";
import { requireSession } from "@/server/session";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const session = await requireSession();

  async function logout() {
    "use server";
    await signOut({ redirectTo: "/login" });
  }

  return (
    <div className="flex min-h-screen flex-col">
      <header className="flex h-12 shrink-0 items-center gap-2 border-b bg-background/95 px-2 sm:px-4">
        <Link href="/boards" className="shrink-0 font-semibold tracking-tight">
          <span className="sm:hidden">RDL</span>
          <span className="hidden sm:inline">RDL Productivity</span>
        </Link>
        <nav aria-label="Principale" className="flex shrink-0 items-center text-sm">
          <Link
            href="/boards"
            className="flex items-center gap-1.5 rounded-md px-2 py-1 hover:bg-muted"
          >
            <LayoutGridIcon className="size-4" />
            <span className="hidden md:inline">Board</span>
            <span className="sr-only md:hidden">Board</span>
          </Link>
          <Link
            href="/today"
            className="flex items-center gap-1.5 rounded-md px-2 py-1 hover:bg-muted"
          >
            <SunIcon className="size-4" />
            <span className="hidden md:inline">Oggi</span>
            <span className="sr-only md:hidden">Oggi</span>
          </Link>
          <Link
            href="/priority"
            className="flex items-center gap-1.5 rounded-md px-2 py-1 hover:bg-muted"
          >
            <FlameIcon className="size-4" />
            <span className="hidden md:inline">Priorità</span>
            <span className="sr-only md:hidden">Priorità</span>
          </Link>
          <Link
            href="/calendar"
            className="flex items-center gap-1.5 rounded-md px-2 py-1 hover:bg-muted"
          >
            <CalendarDaysIcon className="size-4" />
            <span className="hidden md:inline">Calendario</span>
            <span className="sr-only md:hidden">Calendario</span>
          </Link>
        </nav>
        <div className="flex min-w-0 flex-1 justify-center">
          <Suspense>
            <SearchBox />
          </Suspense>
        </div>
        <UserMenu name={session.user?.name ?? session.user?.email ?? "Utente"} signOut={logout} />
      </header>
      <div className="flex flex-1 flex-col">{children}</div>
    </div>
  );
}
