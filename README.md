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

Controlli: `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm test:e2e`, `pnpm format`.
