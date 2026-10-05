# Piano di sviluppo

Stato: `[ ]` da fare · `[~]` in corso · `[x]` fatto

## Milestone 0 — Scaffolding e infrastruttura

- [x] Creare app Next.js (App Router, TypeScript, ESLint, Tailwind, `src/`), gestore pacchetti pnpm
- [x] Prettier + regole ESLint, script `lint`, `typecheck`, `format`
- [x] Installare shadcn/ui e componenti base (button, input, dialog, dropdown, popover, calendar)
- [x] Prisma + schema iniziale da `docs/ARCHITECTURE.md`, prima migrazione, `seed.ts` con una board d'esempio
- [x] `.env.example` completo
- [x] Vitest per unit test, Playwright per un test e2e smoke
- [x] GitHub Actions: lint + typecheck + test su ogni PR

## Milestone 1 — Autenticazione mono-utente

- [x] Auth.js con provider GitHub e Google, accesso consentito solo a `ALLOWED_EMAIL`
- [x] Proxy (ex middleware) che protegge tutte le rotte tranne `/login`
- [x] Pagina di login minimale

## Milestone 2 — Board, liste, card (nucleo)

- [x] Pagina `/boards`: elenco, crea, rinomina, colore, archivia
- [x] Vista board: liste orizzontali scrollabili, crea/rinomina/archivia lista
- [x] Card: crea rapida in fondo alla lista, rinomina inline, archivia
- [x] Drag & drop con dnd-kit: card nella lista, card tra liste, riordino liste
- [x] Posizioni con fractional indexing, aggiornamenti ottimistici con rollback
- [x] Scorciatoie da tastiera di base (`n` nuova card, `Esc` chiudi)

## Milestone 3 — Dettaglio card

- [x] Modale dettaglio aperta via URL (`/boards/[id]?card=[cardId]`)
- [x] Descrizione in markdown (editor + anteprima)
- [x] Date di inizio e scadenza, flag completato, badge sulla card (scaduta / in scadenza)
- [x] Etichette per board: crea, modifica colore/nome, assegna alle card
- [x] Checklist multiple con item, progresso mostrato sulla card
- [x] Sposta/copia card in altra lista o board

## Milestone 4 — Ricerca e filtri

- [x] Barra di ricerca globale (`/` per focus) su titolo e descrizione
- [x] Filtri nella vista board: etichette, scadenza, completate
- [x] Filtri persistiti nell'URL

## Milestone 5 — Vista calendario

- [x] Pagina `/calendar` con vista mese e settimana, card con scadenza
- [x] Filtro per board ed etichetta
- [x] Drag di una card su un altro giorno per cambiarne la scadenza
- [x] Click su una card apre il dettaglio

## Milestone 6 — Rifinitura e deploy

- [x] Responsive e uso da mobile
- [x] Tema chiaro/scuro
- [x] Archivio consultabile e ripristino
- [x] Deploy su Vercel + database Supabase, migrazioni in produzione
- [x] Backup: export JSON di tutte le board

## Milestone 7 — Server MCP per Claude

- [x] Endpoint MCP remoto `/api/mcp` (Streamable HTTP) con tool di lettura e scrittura
- [x] Authorization server OAuth 2.1: metadata, registrazione dinamica, client ID metadata document, PKCE, refresh token a rotazione, revoca
- [x] Pagina di consenso dietro login GitHub, solo `ALLOWED_EMAIL`
- [x] Pagina `/connections` con URL del connettore e revoca dei client
- [x] Test unitari ed e2e del flusso OAuth + tool

## Miglioramenti

- [x] Contatore delle card nell'intestazione di ogni lista (`visibili/totali` con i filtri attivi)
- [x] Board alta quanto la finestra: le liste scorrono al loro interno e la barra di scorrimento orizzontale resta sempre visibile

## Milestone 8 — Pianificazione e produttività

- [x] Priorità delle card da P0 (massima) a P4, opzionale; badge, filtro della board, tool MCP
- [x] Super board `/priority`: card P0 e P1 di tutte le board, colonne per lista di origine (unite per nome), righe per priorità (P0 = expedite lane), drag per cambiare priorità o lista
- [x] Vista `/today`: scadute, oggi, prossimi 7 giorni, completamento con un click
- [ ] Card ricorrenti
- [ ] Feed iCal privato delle scadenze
- [ ] Allegati e immagini nelle card
- [ ] Storico attività con undo
- [ ] Template di board e card
- [ ] Dashboard statistiche

## Dopo l'MVP (idee)

- Allegati (Vercel Blob / Supabase Storage)
- Card ricorrenti
- Import da Trello (JSON export)
- PWA e notifiche di scadenza
- Template di board
