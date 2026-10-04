import { signOut } from "@/auth";
import { Button } from "@/components/ui/button";
import { requireSession } from "@/server/session";

export default async function Home() {
  const session = await requireSession();

  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-6 p-8">
      <h1 className="text-3xl font-semibold tracking-tight">RDL Productivity</h1>
      <p className="max-w-md text-center text-muted-foreground">
        Ciao {session.user?.name ?? session.user?.email}. Le board arrivano con la Milestone 2.
      </p>
      <form
        action={async () => {
          "use server";
          await signOut({ redirectTo: "/login" });
        }}
      >
        <Button type="submit" variant="outline">
          Esci
        </Button>
      </form>
    </main>
  );
}
