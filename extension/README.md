# RDL KDP Sync (estensione del browser)

Aggiorna libri e vendite KDP in RDL Productivity con un clic: dal dialogo
«Aggiorna dati» (Vendite) o «Aggiorna da KDP» (Libri) l'app chiede
all'estensione di leggere il Bookshelf e i Report di KDP in schede nascoste
del browser, con la sessione KDP già aperta, e importa i risultati.

## Come funziona

- `bridge.js` (content script sulle pagine dell'app) segna il documento con
  `data-rdl-kdp-extension` e inoltra i messaggi `rdl-kdp:*` fra pagina e
  background.
- `background.js` apre le pagine KDP in schede non attive, vi inietta gli
  script di `scripts/` e rimanda all'app l'esito di ogni passo (`hash` nello
  stesso formato dei preferiti, oppure un errore). Se KDP chiede il login,
  lascia la scheda aperta e lo segnala.
- `scripts/books.js` e `scripts/sales.js` sono generati da
  `src/lib/kdp-bookmarklet.ts` e `src/lib/kdp-sales-collector.ts` con
  `pnpm extension:build` (un test unitario controlla che siano aggiornati).
  Lo stesso comando produce gli zip in `public/extension/`.
- L'account si sceglie nell'app, non nell'estensione: un browser (o profilo)
  per account.
- Vendite incrementali: l'app passa `options.salesFrom` (primo giorno da
  leggere, di norma 3 mesi fa) e il background lo mette in
  `globalThis.__rdlSalesFrom` prima di iniettare `sales.js`; `null` legge
  tutto lo storico.
- `chrome.storage.local.stepUrls` (`{ books, sales }`) sostituisce gli URL
  delle pagine KDP: lo usano i test e2e con un server finto.

## Installazione

Istruzioni nell'app: `/kdp/estensione`. In breve: Chromium (Chrome, Edge,
Brave, Vivaldi, Opera, Comet) → `chrome://extensions` → Modalità
sviluppatore → Carica estensione non pacchettizzata → questa cartella.
Firefox → `about:debugging` → componente temporaneo (`manifest.json` dello
zip Firefox) e permessi sui siti Amazon da concedere in `about:addons`.

Il content script gira su `https://rdlproductivity.vercel.app` e su
`http://localhost:3000`: per un altro dominio aggiungilo a `content_scripts`
in `manifest.json`.
