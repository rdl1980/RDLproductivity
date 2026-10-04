# Piano di sviluppo

Stato: `[ ]` da fare · `[~]` in corso · `[x]` fatto

## Milestone 0 — Scaffolding e infrastruttura

- [ ] Creare app Next.js (App Router, TypeScript, ESLint, Tailwind, `src/`), gestore pacchetti pnpm
- [ ] Prettier + regole ESLint, script `lint`, `typecheck`, `format`
- [ ] Installare shadcn/ui e componenti base (button, input, dialog, dropdown, popover, calendar)
- [ ] Prisma + schema iniziale da `docs/ARCHITECTURE.md`, prima migrazione, `seed.ts` con una board d'esempio
- [ ] `.env.example` completo
- [ ] Vitest per unit test, Playwright per un test e2e smoke
- [ ] GitHub Actions: lint + typecheck + test su ogni PR

## Milestone 1 — Autenticazione mono-utente

- [ ] Auth.js con provider GitHub (o magic link), accesso consentito solo a `ALLOWED_EMAIL`
- [ ] Middleware che protegge tutte le rotte tranne `/login`
- [ ] Pagina di login minimale

## Milestone 2 — Board, liste, card (nucleo)

- [ ] Pagina `/boards`: elenco, crea, rinomina, colore, archivia
- [ ] Vista board: liste orizzontali scrollabili, crea/rinomina/archivia lista
- [ ] Card: crea rapida in fondo alla lista, rinomina inline, archivia
- [ ] Drag & drop con dnd-kit: card nella lista, card tra liste, riordino liste
- [ ] Posizioni con fractional indexing, aggiornamenti ottimistici con rollback
- [ ] Scorciatoie da tastiera di base (`n` nuova card, `Esc` chiudi)

## Milestone 3 — Dettaglio card

- [ ] Modale dettaglio aperta via URL (`/boards/[id]?card=[cardId]`)
- [ ] Descrizione in markdown (editor + anteprima)
- [ ] Date di inizio e scadenza, flag completato, badge sulla card (scaduta / in scadenza)
- [ ] Etichette per board: crea, modifica colore/nome, assegna alle card
- [ ] Checklist multiple con item, progresso mostrato sulla card
- [ ] Sposta/copia card in altra lista o board

## Milestone 4 — Ricerca e filtri

- [ ] Barra di ricerca globale (`/` per focus) su titolo e descrizione
- [ ] Filtri nella vista board: etichette, scadenza, completate
- [ ] Filtri persistiti nell'URL

## Milestone 5 — Vista calendario

- [ ] Pagina `/calendar` con vista mese e settimana, card con scadenza
- [ ] Filtro per board ed etichetta
- [ ] Drag di una card su un altro giorno per cambiarne la scadenza
- [ ] Click su una card apre il dettaglio

## Milestone 6 — Rifinitura e deploy

- [ ] Responsive e uso da mobile
- [ ] Tema chiaro/scuro
- [ ] Archivio consultabile e ripristino
- [ ] Deploy su Vercel + database Neon/Supabase, migrazioni in produzione
- [ ] Backup: export JSON di tutte le board

## Dopo l'MVP (idee)

- Allegati (Vercel Blob / Supabase Storage)
- Card ricorrenti
- Import da Trello (JSON export)
- PWA e notifiche di scadenza
- Template di board
