# Architettura

## Principi

- **Mono-utente**: un solo account autorizzato (email in `ALLOWED_EMAIL`). Niente workspace, ruoli o condivisione.
- **Server-first**: Server Components per la lettura, Server Actions per le mutazioni. Niente API REST separata finché non serve.
- **UI ottimistica**: il drag & drop aggiorna subito lo stato locale, poi persiste; in caso di errore si fa rollback.
- **Semplice da deployare**: Vercel + Postgres gestito, nessun altro servizio.

## Autenticazione

- Auth.js v5 (`src/auth.ts`) con provider GitHub e Google, attivati solo se le rispettive credenziali sono nel `.env`.
- Sessione JWT in cookie cifrato, nessun adapter e nessuna tabella utenti: l'app è mono-utente.
- Il callback `signIn` accetta solo gli indirizzi in `ALLOWED_EMAIL` (uno o più, separati da virgola); per Google l'email deve essere verificata.
- `src/proxy.ts` (il middleware di Next 16) reindirizza a `/login` chi non è autenticato. È un controllo ottimistico: Server Components e Server Actions chiamano comunque `requireSession()` da `src/server/session.ts`.

## Modello dati (Prisma)

Schema definitivo in `prisma/schema.prisma`; quello sotto è il riferimento logico.

```prisma
model Board {
  id         String   @id @default(cuid())
  title      String
  color      String?
  position   String          // fractional index
  archived   Boolean  @default(false)
  lists      List[]
  labels     Label[]
  createdAt  DateTime @default(now())
  updatedAt  DateTime @updatedAt
}

model List {
  id        String   @id @default(cuid())
  boardId   String
  board     Board    @relation(fields: [boardId], references: [id], onDelete: Cascade)
  title     String
  position  String          // fractional index
  archived  Boolean  @default(false)
  cards     Card[]
  @@index([boardId, position])
}

model Card {
  id          String      @id @default(cuid())
  listId      String
  list        List        @relation(fields: [listId], references: [id], onDelete: Cascade)
  title       String
  description String?     // markdown
  position    String      // fractional index
  startDate   DateTime?
  dueDate     DateTime?
  completed   Boolean     @default(false)
  archived    Boolean     @default(false)
  labels      CardLabel[]
  checklists  Checklist[]
  createdAt   DateTime    @default(now())
  updatedAt   DateTime    @updatedAt
  @@index([listId, position])
  @@index([dueDate])
}

model Label {
  id      String      @id @default(cuid())
  boardId String
  board   Board       @relation(fields: [boardId], references: [id], onDelete: Cascade)
  name    String
  color   String
  cards   CardLabel[]
}

model CardLabel {
  cardId  String
  labelId String
  card    Card  @relation(fields: [cardId], references: [id], onDelete: Cascade)
  label   Label @relation(fields: [labelId], references: [id], onDelete: Cascade)
  @@id([cardId, labelId])
}

model Checklist {
  id       String          @id @default(cuid())
  cardId   String
  card     Card            @relation(fields: [cardId], references: [id], onDelete: Cascade)
  title    String
  position String
  items    ChecklistItem[]
}

model ChecklistItem {
  id          String    @id @default(cuid())
  checklistId String
  checklist   Checklist @relation(fields: [checklistId], references: [id], onDelete: Cascade)
  text        String
  done        Boolean   @default(false)
  position    String
}
```

### Ordinamento

Le posizioni usano **fractional indexing** (libreria `fractional-indexing`): spostare una card aggiorna una sola riga, senza rinumerare la lista.

Le chiavi vanno confrontate byte per byte: le colonne `position` hanno collation `"C"` (migrazione `position_c_collation`), perché con `en_US.UTF-8`, il default di Supabase, `"a0"` finirebbe prima di `"Zz"`. Nel codice il confronto usa `<` sulle stringhe, che è coerente.

Le Server Actions di spostamento ricevono gli id dei vicini (`beforeId`, `afterId`) e calcolano la posizione dal database.

### Aggiornamenti ottimistici

Nella vista board lo stato client (`BoardView`) è la fonte di verità finché la pagina è aperta: le azioni su liste e card non rivalidano la pagina. Ogni mutazione applica subito una trasformazione funzionale dello stato e, se la Server Action fallisce, applica la trasformazione inversa (ripristino di titolo, posizione o elemento) e mostra un toast. Le trasformazioni sono funzionali, non snapshot, così due mutazioni concorrenti non si sovrascrivono. Gli elementi appena creati hanno id `temp-…` e non sono trascinabili finché il server non restituisce l'id reale.

## Struttura cartelle (prevista)

```
src/
  app/
    (auth)/login/          pagina di login
    api/auth/[...nextauth]/ route handler di Auth.js
    boards/                elenco board
    boards/[boardId]/      vista board (kanban)
    calendar/              vista calendario
    search/                ricerca globale
  components/
    board/                 Board, List, Card, DnD
    card-detail/           modale dettaglio card
    ui/                    shadcn/ui
  auth.ts                  configurazione Auth.js
  proxy.ts                 protezione rotte (ex middleware)
  server/
    session.ts             requireSession()
    actions/               Server Actions (board, list, card, label, checklist)
    db.ts                  client Prisma (adapter pg)
  lib/                     utilità (validazione zod, date, posizioni)
  generated/prisma/        client Prisma generato (non versionato)
prisma/
  schema.prisma
  migrations/
  seed.ts
prisma.config.ts           config Prisma 7 (schema, migrazioni, seed)
e2e/                       test Playwright
```

## Dettaglio card

- La modale (`CardDetailDialog`) si apre con `?card=<id>` nell'URL, aggiornato con `history.pushState` senza ricaricare la pagina: il link è condivisibile e il tasto indietro la chiude.
- I dati del dettaglio arrivano dalla Server Action `getCardDetail`, chiamata dal client all'apertura. La modale ha uno stato proprio con aggiornamenti ottimistici e notifica la board (o il calendario) con callback (`onCardChange`, `onCardPlaced`, `onCardRemoved`, `onLabelsChange`), così il riepilogo sulla card resta allineato anche dopo un rollback.
- Le etichette appartengono alla board: spostando una card in un'altra board le sue etichette vengono rimosse; copiandola si mantengono solo nella stessa board.
- La descrizione è Markdown (GFM) renderizzato con `react-markdown`, senza HTML grezzo, quindi senza rischio XSS.
- Le operazioni su una checklist appena creata (ancora con id `temp-…`) vengono accodate finché il server non restituisce l'id reale.
- Le date sono salvate in UTC e mostrate nel fuso del browser. Il badge di scadenza viene renderizzato solo lato client per evitare differenze di idratazione; "in scadenza" significa entro 24 ore.
- Nei campi di testo dentro la modale, Esc annulla l'editing senza chiudere la modale; un secondo Esc la chiude.

## Archivio e backup

- Board, liste e card si archiviano (flag `archived`) e si consultano in `/archive`, raggiungibile dal menu utente. Ripristinare una lista o una card ripristina anche i contenitori archiviati. L'eliminazione definitiva è possibile solo per elementi già archiviati e chiede conferma.
- `GET /api/export` (menu utente → "Esporta backup") scarica un JSON con tutte le board, archiviate comprese: liste, card, etichette, checklist. Richiede la sessione.

## Tema, mobile e accessibilità

- Tema chiaro, scuro o di sistema con `next-themes` (classe `dark` su `<html>`); le superfici di liste e card usano i token `--list` e `--list-card`.
- Su touch il drag parte con una pressione prolungata (250 ms), così lo scorrimento resta libero; la board scorre in orizzontale dentro il proprio contenitore.
- Colori di board ed etichette con contrasto WCAG AA: il testo delle etichette è bianco o scuro in base allo sfondo (`labelTextColor`), verificato da test unitari.
- Niente controlli annidati: card e header delle liste ricevono i listener di mouse e touch, mentre il drag da tastiera parte dal bottone del titolo (Spazio sposta, Invio apre o rinomina).
- Gli e2e eseguono axe-core (WCAG 2 A/AA) sulle pagine principali, in tema chiaro e scuro, e falliscono su violazioni serie o critiche.

## Test

- Vitest per la logica pura (`src/lib`).
- Playwright per i flussi end-to-end. I test autenticati (`e2e/fixtures.ts`) creano un cookie di sessione Auth.js valido firmato con `AUTH_SECRET`, senza codice di test nell'app. Coprono login e redirect, board, liste e card con drag & drop, dettaglio card, ricerca e filtri, calendario, archivio, export, tema, layout mobile e accessibilità.
- La CI usa Postgres 16 con collation `en_US.utf8`, come Supabase.

## Deploy

- Vercel (progetto `rdlproductivity`, regione funzioni `fra1`) collegato al repo.
- Database Supabase (progetto `RDLproductivity`, `eu-central-1`), con un utente `prisma` dedicato. `DATABASE_URL` punta al transaction pooler (porta 6543) per il runtime serverless; `DATABASE_URL_UNPOOLED` punta al session pooler (porta 5432) per `prisma migrate deploy`, eseguito dal build solo in produzione.
- Le tabelle non sono esposte dalla Data API di Supabase: nessun permesso per i ruoli `anon` e `authenticated`.

## Ricerca

- Barra di ricerca nell'header (`/` per il focus) che porta a `/search?q=`.
- `ILIKE` (Prisma `contains`, `mode: "insensitive"`) su titolo e descrizione delle card non archiviate di board e liste non archiviate, massimo 50 risultati, più le board il cui titolo corrisponde. I risultati evidenziano le occorrenze e aprono la card nella sua board (`?card=`).
- Full-text Postgres (`tsvector`) solo se le prestazioni lo richiederanno.

## Filtri della board

- Etichette (OR, con l'opzione "Senza etichette"), scadenza (scadute, oggi, entro 7 giorni, senza scadenza) e stato (completate, da completare); le categorie si combinano in AND.
- Lo stato è nell'URL (`?labels=…&due=…&status=…`), aggiornato con `history.replaceState`: sopravvive al reload e si può condividere.
- Il filtro è solo lato client sulle card già caricate. I filtri di scadenza dipendono da orologio e fuso del browser, quindi si applicano dopo l'idratazione.
- Con un filtro attivo il drag & drop è disattivato: le posizioni si calcolano dai vicini visibili, e con card nascoste sarebbero sbagliate.

## Calendario

- `/calendar?view=month|week&date=YYYY-MM-DD&board=…&label=…`: viste mese e settimana (lunedì come primo giorno) delle card con scadenza.
- Il server non conosce il fuso del browser: carica le card in un intervallo UTC allargato di due giorni per lato rispetto alle settimane visibili (`serverRange`), mentre la griglia e il raggruppamento per giorno vengono calcolati nel browser dopo l'idratazione.
- Trascinando una card su un altro giorno cambia la data e resta invariata l'ora locale (`moveToDay`), con aggiornamento ottimistico e rollback. Il server rifiuta lo spostamento se la scadenza finisce prima della data di inizio.
- Il click su una card apre la stessa `CardDetailDialog` della board (`?card=`), sincronizzata con il calendario tramite le stesse callback.

## Server MCP (Claude)

Claude (claude.ai, app desktop e mobile) si collega come connettore personalizzato all'URL `https://<dominio>/api/mcp`.

- **Endpoint**: `src/app/api/mcp/route.ts` con `mcp-handler` 2.x e SDK MCP v2 (Streamable HTTP stateless, protocollo 2026-07-28 e fallback 2025). Tool in `src/server/mcp/tools.ts`.
- **Riuso delle Server Actions**: ogni tool gira dentro `runAsMcpUser()` (`src/server/mcp-context.ts`, `AsyncLocalStorage`); `requireSession()` e `isAuthenticated()` accettano quel contesto, quindi validazione zod, fractional indexing e regole restano in un solo posto.
- **Authorization server** (stesso dominio, issuer = origine pubblica):
  - `/.well-known/oauth-protected-resource[/api/mcp]` (RFC 9728) e `/.well-known/oauth-authorization-server` (RFC 8414);
  - `/oauth/register` (registrazione dinamica RFC 7591) e client ID metadata document (`client_id` = URL https, scaricato e validato);
  - `/oauth/authorize`: pagina di consenso dietro il login Auth.js (GitHub), quindi solo `ALLOWED_EMAIL`; protetta da framing; la Server Action rivalida tutta la richiesta;
  - `/oauth/token`: `authorization_code` con PKCE S256 obbligatorio, `refresh_token` con rotazione; `/oauth/revoke` (RFC 7009).
- **Token**: opachi (256 bit), salvati solo come hash SHA-256 (`OAuthCode`, `OAuthToken`, `OAuthClient`, RLS attiva). Access token 1 h, refresh 60 giorni, codici 5 min monouso. Ogni token è legato alla risorsa `/api/mcp` (RFC 8707) e all'email, ricontrollata contro `ALLOWED_EMAIL` a ogni richiesta.
- **Revoca**: pagina `/connections` (menu utente → Integrazioni).

## Priorità, super board e vista Oggi

- `Card.priority`: intero 0-4 nullable (0 = massima), vincolo `CHECK` nel database. Costanti ed etichette in `src/lib/priority.ts`; filtro della board via parametro `priority=0,1,none`.
- Le viste trasversali (`/priority`, `/today`) leggono card "aggregate" (`AggregateCard`: riepilogo + board, lista ed etichette risolte) da `src/server/queries/aggregate.ts` e riusano il dialog della card tramite il parametro `?card=`.
- Super board: colonne = nomi di lista normalizzati (trim, minuscole) delle board che hanno card P0/P1, ordinate per posizione della lista nella sua board; righe = P0 (expedite lane) e P1. Il drag cambia priorità e/o sposta la card nella lista omonima della sua board, in un'unica Server Action (`moveCardToList` con `priority`).
- Vista Oggi: il server restituisce un intervallo largo (il fuso del browser non è noto); le sezioni si calcolano nel client dopo l'idratazione (`src/lib/agenda.ts`).

## Card ricorrenti

- `Card.recurrence` (JSONB): `{ rule, interval, timeZone }`, validato con zod (`src/lib/recurrence.ts`). Richiede una scadenza; togliendo la scadenza la regola viene rimossa.
- Completare una card ricorrente (dialog, vista Oggi o MCP) crea nella stessa transazione la prossima occorrenza subito dopo di essa nella lista: stessi titolo, descrizione, priorità, etichette e checklist (con elementi non spuntati), scadenza successiva e inizio traslato dello stesso intervallo. La regola passa alla nuova card, quella completata non si ripete più.
- La data successiva mantiene l'ora locale nel fuso salvato nella regola (cambio dell'ora legale compreso) e salta le occorrenze già passate.

## Feed iCal

- `GET /api/calendar/<token>.ics` (fuori dal proxy di Auth.js): le app di calendario non fanno login, quindi l'URL è la credenziale.
- Il token è `HMAC-SHA256(AUTH_SECRET, "ical-feed:<versione>")`: nel database c'è solo la versione (`AppSetting` `ical.version`, positiva = attivo, negativa = disattivato). "Rigenera" incrementa la versione e invalida l'URL precedente; il confronto è a tempo costante.
- Eventi: card attive con scadenza dagli ultimi 90 giorni in poi, 30 minuti dalla scadenza, titolo con `✓` se completata e `[P0]`…`[P4]`, link alla card. Writer RFC 5545 in `src/lib/ical.ts` (escape e folding a 75 ottetti).

## Storico attività e undo

- Ogni Server Action che modifica dati chiama `logActivity()` (`src/server/activity.ts`): tipo, riepilogo in italiano, board/card, `entityIds` toccati e le operazioni inverse (`UndoOp[]`, JSON). L'attore è `claude` quando la chiamata arriva dal server MCP (contesto `runAsMcpUser`), altrimenti `user`.
- Operazioni inverse: ripristino di campi (`update`), eliminazione di ciò che è stato creato (etichette, checklist, elementi) o archiviazione (board, liste, card), riassegnazione di etichette, ricreazione con gli stessi id di etichette/checklist/elementi eliminati. Le eliminazioni definitive dall'archivio non si annullano.
- Un'attività si annulla solo se nessuna attività successiva non annullata tocca gli stessi `entityIds` (evita di sovrascrivere modifiche più recenti); l'annullamento è a sua volta registrato. Retention: 180 giorni.
- UI: pagina `/activity` (menu utente), sezione "Attività" nel dettaglio card, Ctrl/Cmd+Z sulla board annulla l'ultima modifica di quella board. MCP: `list_activity`, `undo_activity`.
- e2e: `settle()` aspetta che non ci siano Server Action in corso (POST contate dal fixture `page`), perché `networkidle` si risolve subito se già raggiunto.
