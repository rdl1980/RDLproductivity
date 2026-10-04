# Architettura

## Principi

- **Mono-utente**: un solo account autorizzato (email in `ALLOWED_EMAIL`). Niente workspace, ruoli o condivisione.
- **Server-first**: Server Components per la lettura, Server Actions per le mutazioni. Niente API REST separata finché non serve.
- **UI ottimistica**: il drag & drop aggiorna subito lo stato locale, poi persiste; in caso di errore si fa rollback.
- **Semplice da deployare**: Vercel + Postgres gestito, nessun altro servizio.

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

## Struttura cartelle (prevista)

```
src/
  app/
    (auth)/login/          pagina di login
    boards/                elenco board
    boards/[boardId]/      vista board (kanban)
    calendar/              vista calendario
    search/                ricerca globale
  components/
    board/                 Board, List, Card, DnD
    card-detail/           modale dettaglio card
    ui/                    shadcn/ui
  server/
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

## Ricerca

MVP: `ILIKE` su titolo e descrizione delle card, più filtri per etichetta, scadenza (scadute / oggi / settimana / nessuna) e stato completato. Full-text Postgres (`tsvector`) solo se le prestazioni lo richiedono.

## Calendario

Vista mese e settimana delle card con `dueDate`. Trascinare una card su un altro giorno aggiorna la scadenza.
