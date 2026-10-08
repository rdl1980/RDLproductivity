import Link from "next/link";
import { Suspense } from "react";

import { signOut } from "@/auth";
import { AppNav } from "@/components/app-nav";
import { BrandMark, BrandName } from "@/components/brand";
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
      <header className="sticky top-0 z-40 flex h-(--header-height) shrink-0 items-center gap-2 border-b bg-background/80 px-2 backdrop-blur-md supports-[backdrop-filter]:bg-background/70 sm:gap-3 sm:px-4">
        <Link
          href="/boards"
          className="flex shrink-0 items-center gap-2 rounded-md pr-1 outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
        >
          <BrandMark />
          <BrandName className="hidden text-[15px] lg:inline" />
          <span className="sr-only lg:hidden">RDL Productivity</span>
        </Link>
        <AppNav />
        <div className="flex min-w-0 flex-1 justify-end md:justify-center">
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
