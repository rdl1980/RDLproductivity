# RDL Productivity

Un Trello personale: board, liste e card con drag & drop, dettaglio card (descrizione Markdown, date, etichette, checklist, sposta/copia), ricerca globale e filtri, vista calendario, archivio, backup JSON, tema chiaro/scuro.

In produzione: https://rdlproductivity.vercel.app

### Scorciatoie

- `/` cerca
- `n` nuova card nella lista sotto il mouse
- `Esc` chiude
- Sulla card: `Invio` apre il dettaglio, `Spazio` avvia il trascinamento da tastiera

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

## Claude (MCP)

L'app espone un server MCP remoto: Claude può leggere e modificare board, liste, card, etichette e checklist.

1. In Claude: Impostazioni → Connettori → Aggiungi connettore personalizzato.
2. URL: `https://rdlproductivity.vercel.app/api/mcp` (lo trovi anche in Menu utente → Connessioni Claude).
3. Al primo uso Claude apre la pagina di consenso: accedi con GitHub e clicca Consenti.

I client autorizzati si revocano da `/connections`. Dettagli in `docs/ARCHITECTURE.md`.

## Deploy

Progetto Vercel `rdlproductivity` collegato al repo: ogni push su `main` va in produzione, gli altri branch creano preview. Il build (`scripts/vercel-build.sh`) applica le migrazioni Prisma solo nei deploy di produzione. Per le migrazioni usa `DATABASE_URL_UNPOOLED` se presente, altrimenti `DATABASE_URL`.

### Verifica in produzione

`pnpm smoke:live` esegue controlli in sola lettura sull'istanza pubblicata (`BASE_URL`, predefinito `https://rdlproductivity.vercel.app`): redirect al login, provider GitHub attivo, export negato senza sessione. Con `SESSION_TOKEN` (un JWT di sessione Auth.js firmato con `AUTH_SECRET` di produzione, salt `__Secure-authjs.session-token`) verifica anche board, calendario, ricerca, archivio ed export, che legge il database.

Database di produzione: Supabase, progetto `RDLproductivity` (Francoforte). Dettagli in [Architettura](docs/ARCHITECTURE.md#deploy).

Controlli: `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm test:e2e`, `pnpm format`.
