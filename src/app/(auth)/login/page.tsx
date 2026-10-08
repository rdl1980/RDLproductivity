import type { Metadata } from "next";
import { AuthError } from "next-auth";
import { redirect } from "next/navigation";

import { providerMap, signIn } from "@/auth";
import { BrandMark } from "@/components/brand";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = { title: "Accedi · RDL Productivity" };

const ERROR_MESSAGES: Record<string, string> = {
  AccessDenied: "Questo account non è autorizzato ad accedere.",
  Configuration: "Errore di configurazione dell'autenticazione.",
};

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const { error, callbackUrl } = await searchParams;
  const errorCode = typeof error === "string" ? error : undefined;
  // Auth.js's redirect callback rejects URLs outside this origin.
  const redirectTo = typeof callbackUrl === "string" ? callbackUrl : "/";

  return (
    <main className="relative flex flex-1 items-center justify-center overflow-hidden p-8">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(60%_50%_at_50%_0%,color-mix(in_oklch,var(--brand)_18%,transparent),transparent)]"
      />
      <div className="relative flex w-full max-w-sm flex-col gap-6 rounded-2xl border bg-card p-8 shadow-card-hover">
        <div className="flex flex-col items-center gap-3 text-center">
          <BrandMark className="size-11 rounded-xl [&_svg]:size-6" />
          <div className="flex flex-col gap-1">
            <h1 className="text-2xl font-semibold tracking-tight">RDL Productivity</h1>
            <p className="text-sm text-muted-foreground">Accedi per continuare</p>
          </div>
        </div>

        {errorCode && (
          <p role="alert" className="text-center text-sm text-destructive">
            {ERROR_MESSAGES[errorCode] ?? "Accesso non riuscito. Riprova."}
          </p>
        )}

        {providerMap.length === 0 ? (
          <p className="text-center text-sm text-muted-foreground">
            Nessun provider configurato. Imposta le credenziali GitHub o Google nel file .env.
          </p>
        ) : (
          <div className="flex flex-col gap-3">
            {providerMap.map((provider) => (
              <form
                key={provider.id}
                action={async () => {
                  "use server";
                  try {
                    await signIn(provider.id, { redirectTo });
                  } catch (error) {
                    if (error instanceof AuthError) {
                      redirect(`/login?error=${error.type}`);
                    }
                    throw error;
                  }
                }}
              >
                <Button type="submit" size="lg" className="w-full">
                  Accedi con {provider.name}
                </Button>
              </form>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
