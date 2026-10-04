import Link from "next/link";

import { signOut } from "@/auth";
import { Button } from "@/components/ui/button";
import { requireSession } from "@/server/session";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const session = await requireSession();

  return (
    <div className="flex min-h-screen flex-col">
      <header className="flex h-12 shrink-0 items-center justify-between border-b bg-background/95 px-4">
        <Link href="/boards" className="font-semibold tracking-tight">
          RDL Productivity
        </Link>
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
