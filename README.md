# RDL Productivity

Un Trello personale: board, liste e card con drag & drop, dettaglio card (descrizione, scadenze, etichette, checklist), ricerca e filtri, vista calendario.

Progetto mono-utente, pensato per un solo proprietario.

## Stack

- **Next.js** (App Router) + **TypeScript**
- **PostgreSQL** (Neon o Supabase) con **Prisma** ORM
- **Tailwind CSS** + componenti **shadcn/ui**
- **dnd-kit** per il drag & drop
- **Auth.js** con un solo utente autorizzato
- Deploy su **Vercel**

## Documentazione

- [Piano di sviluppo](docs/PLAN.md): milestone e task
- [Architettura](docs/ARCHITECTURE.md): modello dati, scelte tecniche
- [CLAUDE.md](CLAUDE.md): istruzioni per Claude Code

## Avvio in locale

Requisiti: Node 22, pnpm 10, PostgreSQL 16.

```bash
pnpm install                 # genera anche il client Prisma
cp .env.example .env         # imposta DATABASE_URL e le variabili di auth
pnpm prisma migrate dev      # applica le migrazioni
pnpm db:seed                 # crea una board d'esempio
pnpm dev
```

### Login

Crea le credenziali OAuth e mettile nel `.env`, insieme alla tua email in `ALLOWED_EMAIL` e a `AUTH_SECRET` (`pnpm dlx auth secret`).

- **GitHub**: Settings → Developer settings → OAuth Apps. Callback URL: `http://localhost:3000/api/auth/callback/github`.
- **Google**: Google Cloud Console → API e servizi → Credenziali → ID client OAuth (applicazione web). URI di reindirizzamento: `http://localhost:3000/api/auth/callback/google`.

In produzione aggiungi gli stessi URL con il dominio Vercel (`https://rdlproductivity.vercel.app/api/auth/callback/...`).

## Deploy

Progetto Vercel `rdlproductivity` collegato al repo: ogni push su `main` va in produzione, gli altri branch creano preview. Il build (`scripts/vercel-build.sh`) applica le migrazioni Prisma solo nei deploy di produzione. Per le migrazioni usa `DATABASE_URL_UNPOOLED` se presente, altrimenti `DATABASE_URL`.

Controlli: `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm test:e2e`, `pnpm format`.
