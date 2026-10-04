# CLAUDE.md

Trello personale mono-utente. Leggi `docs/PLAN.md` (milestone e task) e `docs/ARCHITECTURE.md` (modello dati e scelte) prima di iniziare.

## Stack

Next.js (App Router) · TypeScript strict · Prisma + PostgreSQL · Tailwind + shadcn/ui · dnd-kit · Auth.js · pnpm · Vitest + Playwright

## Comandi

```bash
pnpm dev            # server di sviluppo
pnpm lint           # ESLint
pnpm typecheck      # tsc --noEmit
pnpm test           # Vitest
pnpm test:e2e       # Playwright
pnpm prisma migrate dev --name <nome>
pnpm db:seed        # board d'esempio
pnpm format         # Prettier
pnpm smoke:live     # controlli in sola lettura sull'istanza in produzione
```

## Note tecniche

- Next.js 16: leggi `AGENTS.md` e la documentazione in `node_modules/next/dist/docs/` prima di usare API di Next.
- Prisma 7: config in `prisma.config.ts`, client generato in `src/generated/prisma` (non versionato, `postinstall`), connessione tramite `@prisma/adapter-pg`. Importa il client solo da `src/server/db.ts`.
- shadcn/ui: stile `new-york`, base color `neutral` (`components.json`). Se `ui.shadcn.com` non è raggiungibile, copia i sorgenti da `apps/v4/registry/new-york-v4/ui/` del repo `shadcn-ui/ui` sostituendo `"cn"` con `"@/lib/utils"`.
- Playwright: se il browser incluso non è installato, imposta `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH`.

## Convenzioni

- Ogni Server Component o Server Action che tocca dati chiama `requireSession()` (`src/server/session.ts`): il proxy non basta.
- Lettura dati nei Server Components; mutazioni tramite Server Actions in `src/server/actions/`, input validato con zod.
- Ordinamento con fractional indexing (campo `position` stringa, collation `"C"`), mai rinumerare intere liste. Ogni nuova colonna `position` va portata a `COLLATE "C"` nella migrazione.
- Drag & drop e mutazioni con aggiornamento ottimistico tramite trasformazioni funzionali e rollback inverso in caso di errore (vedi `BoardView`).
- Componenti UI da shadcn/ui in `src/components/ui/`; niente altre librerie di componenti.
- Date salvate in UTC, mostrate nel fuso del browser.
- Testo dell'interfaccia in italiano; codice, nomi e commenti in inglese.

## Workflow

- Un branch e una PR per task o gruppo di task di `docs/PLAN.md`; aggiorna lo stato delle checkbox nella stessa PR.
- Prima di aprire una PR: `pnpm lint && pnpm typecheck && pnpm test` devono passare.
- Commit in stile Conventional Commits (`feat:`, `fix:`, `chore:`, `docs:`).
