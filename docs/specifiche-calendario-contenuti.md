# Specifiche: tab "Calendario contenuti" per RDL Productivity

**Per:** RDL Productivity site builder
**Progetto:** Robotti e Robotte, canale satirico su TikTok, YouTube e Instagram
**Data:** 2026-10-30

## 1. A cosa serve

Un nuovo tab che tiene il calendario editoriale del canale. Ogni contenuto (puntata, rubrica, carosello, compilation) è una **scheda**. Ogni scheda ha un **layer per piattaforma** (TikTok, YouTube, Instagram), attivo solo dove quel contenuto esce. In ogni layer stanno i testi da pubblicare, lo stato della pubblicazione e i numeri raccolti dopo.

Il tab lo usano in due:

- **Rosario**, dal browser: guarda la settimana, copia i testi per programmare i post, segna cosa ha pubblicato.
- **Claude**, tramite MCP: crea le schede quando scrive i copioni, le aggiorna quando i video sono montati e inserisce i numeri della settimana. Per questo l'accesso MCP (sezione 7) è un requisito, non un extra.

## 2. Concetti

| Termine                 | Significato                                                                                                                                                                                                                       |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Scheda** (contributo) | un contenuto da pubblicare in una certa data e fascia oraria                                                                                                                                                                      |
| **Codice**              | identificativo stabile scelto da Claude, uguale al nome del file nel progetto: `ep002`, `conf001`, `caf001`, `rec001`, `gem001`, `car001`, `comp001`, `speciale-halloween`. È unico; tutte le operazioni MCP lo usano come chiave |
| **Rubrica**             | il format del contenuto (elenco in 3.3), ognuna con il suo colore                                                                                                                                                                 |
| **Fascia**              | `13:00 extra` o `19:00 principale`                                                                                                                                                                                                |
| **Layer**               | la parte della scheda dedicata a una piattaforma: TikTok, YouTube o Instagram                                                                                                                                                     |
| **Slot**                | un posto vuoto nel calendario settimanale (giorno + fascia) previsto dal piano ma non ancora riempito                                                                                                                             |

## 3. Dati

### 3.1 Scheda (campi comuni)

| Campo                         | Tipo                           | Note                                                                      |
| ----------------------------- | ------------------------------ | ------------------------------------------------------------------------- |
| `codice`                      | testo, unico, obbligatorio     | es. `ep002`                                                               |
| `titolo`                      | testo, obbligatorio            |                                                                           |
| `rubrica`                     | scelta dall'elenco 3.3         | determina il colore                                                       |
| `data_uscita`                 | data                           | fuso Europe/Rome                                                          |
| `fascia`                      | `13:00` \| `19:00`             |                                                                           |
| `stato`                       | scelta, vedi 3.4               |                                                                           |
| `settimana_ciclo`             | `A` \| `B` \| `C` \| `D`       | calcolata dalla data (sezione 6) e sovrascrivibile                        |
| `durata_secondi`              | numero                         |                                                                           |
| `formato_video`               | `9:16` \| `16:9` \| `immagini` | `immagini` per i caroselli                                                |
| `riassunto`                   | testo lungo                    | 1-3 frasi                                                                 |
| `file_video`                  | testo                          | percorso locale, es. `out/ep002.mp4`. Solo testo, niente caricamento file |
| `file_copertina`              | testo                          | percorso locale                                                           |
| `copione`                     | testo                          | percorso del copione, es. `episodi/ep002.json`                            |
| `domanda`                     | testo                          | per le puntate con voto, es. `PAIRING o RESET?`                           |
| `opzioni_voto`                | lista di testi                 | es. `["PAIRING", "RESET"]`                                                |
| `esito_voto`                  | testo                          | compilato alla chiusura del voto                                          |
| `voto_chiude`                 | data                           |                                                                           |
| `note`                        | testo lungo                    |                                                                           |
| `creato_da` / `modificato_da` | `rosario` \| `claude`          | impostati in automatico                                                   |
| `cronologia`                  | elenco eventi                  | chi ha cambiato cosa e quando (sezione 5.6)                               |

### 3.2 Layer (uno per piattaforma)

Ogni scheda ha da 1 a 3 layer. Un layer **non attivo** non si mostra nella scheda e non conta nello stato. I campi comuni valgono per tutti; i campi specifici solo per quella piattaforma.

**Comuni a tutti i layer**

| Campo                    | Tipo                                                                      | Note                                                                              |
| ------------------------ | ------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| `attivo`                 | sì/no                                                                     |                                                                                   |
| `stato_pubblicazione`    | `da preparare` \| `pronto` \| `programmato` \| `pubblicato` \| `problema` |                                                                                   |
| `data_ora_prevista`      | data e ora                                                                | di default `data_uscita` + `fascia` della scheda; si può spostare per piattaforma |
| `data_ora_pubblicazione` | data e ora                                                                | quella effettiva                                                                  |
| `url`                    | link                                                                      | del post pubblicato                                                               |
| `etichetta_ia`           | sì/no                                                                     | promemoria: il contenuto è dichiarato generato con IA                             |
| `commento_fissato`       | testo                                                                     | es. `PAIRING o RESET? Il vostro voto decide la puntata 2 👇`                      |
| `commento_fissato_fatto` | sì/no                                                                     |                                                                                   |
| `voti`                   | coppie opzione → numero                                                   | conteggi raccolti su quella piattaforma                                           |
| `metriche`               | elenco di rilevazioni                                                     | sezione 3.5                                                                       |
| `note_piattaforma`       | testo                                                                     |                                                                                   |

**Solo TikTok**

| Campo               | Tipo                                                   |
| ------------------- | ------------------------------------------------------ |
| `didascalia`        | testo lungo (comprende gli hashtag)                    |
| `copertina_istante` | numero: secondi del fotogramma da usare come copertina |

**Solo YouTube**

| Campo                            | Tipo                     | Note                                                      |
| -------------------------------- | ------------------------ | --------------------------------------------------------- |
| `tipo`                           | `Short` \| `Video lungo` | le compilation sono video lunghi                          |
| `titolo_yt`                      | testo                    | max 100 caratteri                                         |
| `descrizione`                    | testo lungo              |                                                           |
| `capitoli`                       | testo lungo              | solo video lunghi, es. `0:00 Intro` una riga per capitolo |
| `playlist`                       | testo                    |                                                           |
| `contenuto_sintetico_dichiarato` | sì/no                    |                                                           |
| `non_per_bambini`                | sì/no                    | di default sì                                             |

**Solo Instagram**

| Campo             | Tipo                              |
| ----------------- | --------------------------------- |
| `tipo`            | `Reel` \| `Carosello` \| `Storia` |
| `didascalia`      | testo lungo                       |
| `numero_immagini` | numero, solo caroselli            |

### 3.3 Rubriche e colori

I colori sono indicativi; servono solo a distinguerle a colpo d'occhio.

| Rubrica (valore)              | Nome mostrato                | Colore                   |
| ----------------------------- | ---------------------------- | ------------------------ |
| `il-trono`                    | Il Trono                     | `#FF5FA2`                |
| `il-confessionale`            | Il Confessionale             | `#B57BFF`                |
| `cafoni-umani`                | Cafoni Umani                 | `#FF8A1F`                |
| `recensioni-a-una-stella`     | Recensioni a una stella      | `#FFC83D`                |
| `tg-delle-macchine`           | Il TG delle Macchine         | `#5AC8FA`                |
| `galateo-per-umani`           | Lezioni di galateo per umani | `#7BE88F`                |
| `origliana-ha-sentito`        | Origliana ha sentito         | `#3D7BFF`                |
| `consigli-di-gemma`           | I consigli di Gemma 95       | `#D9CBA3`                |
| `trono-obsoleto`              | Il Trono Obsoleto            | `#A89870`                |
| `lo-studio-esplode`           | Lo Studio Esplode            | `#FF3B30`                |
| `pov`                         | POV                          | `#E8E8F0`                |
| `indovina-l-elettrodomestico` | Indovina l'elettrodomestico  | `#2BB673`                |
| `prima-e-dopo`                | Prima e dopo l'aggiornamento | `#7B3FE4`                |
| `speed-date`                  | Speed date                   | `#FF7EB6`                |
| `compilation`                 | Compilation della settimana  | `#12051F` (testo chiaro) |
| `carosello`                   | Carosello                    | `#6B6F80`                |
| `speciale`                    | Speciale                     | `#FF7A00`                |

L'elenco deve essere **modificabile** (aggiungere, rinominare, cambiare colore), anche via MCP.

### 3.4 Stato della scheda

`idea` → `in scrittura` → `da approvare` → `approvato` → `pronto` (video montato) → `programmato` → `pubblicato`, più `scartato` in qualsiasi momento.

- `programmato` e `pubblicato` si **calcolano dai layer attivi**: la scheda è `programmato` quando tutti i layer attivi sono almeno `programmato`, e `pubblicato` quando lo sono tutti. Se i layer sono in stati diversi (es. TikTok pubblicato, YouTube ancora no) la scheda mostra lo stato più indietro, con un indicatore "in parte".
- Gli stati da `idea` a `pronto` si impostano a mano o via MCP.

### 3.5 Metriche

Ogni layer conserva una **serie di rilevazioni**, non un solo valore, perché i numeri si leggono più volte (dopo 48 ore, dopo una settimana).

| Campo                       | Tipo            | Piattaforme               |
| --------------------------- | --------------- | ------------------------- |
| `rilevato_il`               | data e ora      | tutte                     |
| `visualizzazioni`           | numero          | tutte                     |
| `mi_piace`                  | numero          | tutte                     |
| `commenti`                  | numero          | tutte                     |
| `condivisioni`              | numero          | tutte                     |
| `salvataggi`                | numero          | TikTok, Instagram         |
| `completamento_percentuale` | numero 0-100    | tutte (se disponibile)    |
| `nuovi_follower`            | numero          | tutte (se disponibile)    |
| `ore_di_visione`            | numero decimale | solo YouTube video lunghi |

La scheda mostra l'ultima rilevazione; la cronologia si apre a richiesta.

## 4. Quali layer per quale contenuto

Regole di default quando si crea una scheda, modificabili a mano:

| Caso                       | TikTok | YouTube       | Instagram   |
| -------------------------- | ------ | ------------- | ----------- |
| Fascia `19:00`, video 9:16 | ✓      | ✓ Short       | ✓ Reel      |
| Fascia `13:00` (extra)     | ✓      | ✓ Short       | —           |
| Rubrica `compilation`      | —      | ✓ Video lungo | —           |
| Rubrica `carosello`        | —      | —             | ✓ Carosello |

## 5. Interfaccia

### 5.1 Vista Settimana (predefinita)

- Griglia da **lunedì a domenica** × **due righe**: `13:00 extra` e `19:00 principale`.
- Ogni casella mostra la scheda: barra col colore della rubrica, titolo, codice, stato, e **tre badge piattaforma** (TikTok, YouTube, Instagram). Ogni badge indica lo stato del suo layer (icona o colore: da preparare / pronto / programmato / pubblicato / problema). I badge dei layer non attivi non si mostrano.
- Gli **slot vuoti** previsti dal piano (sezione 6) appaiono come caselle tratteggiate con il nome della rubrica prevista ("Cafoni Umani — da fare"). Cliccando si crea la scheda con data, fascia e rubrica già compilate.
- In alto: frecce settimana precedente/successiva, "oggi", e l'etichetta della settimana di ciclo (A, B, C, D).
- **Interruttori dei layer**: tre pulsanti TikTok / YouTube / Instagram per mostrare solo le schede (e i badge) di una o più piattaforme. Con solo "Instagram" acceso, per esempio, si vede il calendario di Instagram.

### 5.2 Vista Mese

Calendario mensile compatto: per ogni giorno, pallini colorati per rubrica e numero di contenuti. Stessi interruttori dei layer.

### 5.3 Vista Elenco

Tabella con colonne: data, fascia, codice, titolo, rubrica, stato, stato per piattaforma, ultime visualizzazioni. Filtri per stato, rubrica, piattaforma e intervallo di date. Ordinabile per colonna.

### 5.4 Scheda di dettaglio

- In alto i campi comuni (3.1).
- Sotto, **una linguetta per ogni layer attivo** (TikTok / YouTube / Instagram), con i campi della sezione 3.2 e un pulsante per attivare un layer non ancora attivo.
- Accanto a ogni testo da pubblicare (didascalia, titolo YouTube, descrizione, capitoli, commento fissato) un pulsante **Copia**: è il modo in cui Rosario programma i post a mano, quindi deve essere a un clic.
- Una **mini checklist di pubblicazione** per layer: copertina scelta · etichetta IA attiva · programmato · commento fissato. Spuntarla aggiorna i campi corrispondenti.
- Sezione voti: per le schede con `domanda`, i conteggi per opzione su ogni piattaforma e il **totale calcolato**.

### 5.5 Pannello "Da fare"

Elenco sempre visibile (o vista a parte) di quello che richiede un'azione:

- layer `pronto` con uscita nei prossimi 7 giorni ma non ancora `programmato`
- layer pubblicati senza `commento_fissato_fatto`
- voti con `voto_chiude` passato e senza `esito_voto`
- layer pubblicati da più di 48 ore senza rilevazioni di metriche
- slot vuoti nei prossimi 7 giorni

### 5.6 Interazioni

- **Trascinare** una scheda su un altro giorno o fascia ne cambia `data_uscita`/`fascia` e sposta le date previste dei layer (tranne quelle modificate a mano).
- **Duplicare** una scheda (nuovo codice richiesto).
- **Archiviare**, non cancellare: le schede scartate o archiviate si possono ripristinare.
- **Cronologia**: ogni modifica registra chi (`rosario` o `claude`), quando e cosa. Visibile in fondo alla scheda.

## 6. Piano settimanale (slot ricorrenti)

Il calendario genera gli slot vuoti da un **modello settimanale configurabile** (modificabile da interfaccia e via MCP). Quello attuale:

| Giorno    | 13:00 extra                  | 19:00 principale                                                                                            |
| --------- | ---------------------------- | ----------------------------------------------------------------------------------------------------------- |
| Lunedì    | Lo Studio Esplode            | Il Trono                                                                                                    |
| Martedì   | POV                          | Il Confessionale                                                                                            |
| Mercoledì | Indovina l'elettrodomestico  | Cafoni Umani                                                                                                |
| Giovedì   | Prima e dopo l'aggiornamento | a rotazione: A Recensioni a una stella · B TG delle Macchine · C Galateo per umani · D Origliana ha sentito |
| Venerdì   | POV                          | Il Trono                                                                                                    |
| Sabato    | —                            | A e C: Consigli di Gemma · B e D: Il Trono Obsoleto                                                         |
| Domenica  | Speed date                   | Compilation (YouTube) + Carosello (Instagram): **due schede** nella stessa fascia                           |

- **Ciclo A/B/C/D:** la settimana di lunedì 2 novembre 2026 è **A**, poi B, C, D e si ricomincia.
- **Attivazione graduale:** ogni riga del modello ha una data "attivo dal", perché la fascia delle 13:00 parte più tardi (dalla terza settimana, 16 novembre 2026) e alcune rubriche ancora dopo. Prima di quella data lo slot non compare.
- Uno slot già occupato da una scheda non mostra il segnaposto.

## 7. Accesso MCP per Claude (obbligatorio)

Claude aggiorna il calendario dal suo ambiente di lavoro tramite il server MCP di RDL Productivity. Servono questi strumenti, o equivalenti:

| Strumento                                                       | Cosa fa                                                                                                            |
| --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `calendario_elenco(dal, al, piattaforma?, stato?, rubrica?)`    | schede in un intervallo di date, con layer e ultima rilevazione                                                    |
| `calendario_slot_vuoti(dal, al)`                                | gli slot previsti dal piano e non ancora riempiti                                                                  |
| `contributo_leggi(codice)`                                      | scheda completa, layer, metriche e cronologia                                                                      |
| `contributo_salva(codice, campi, layers?)`                      | **crea o aggiorna** in base al codice (idempotente). Aggiornamento parziale: i campi non passati restano com'erano |
| `layer_aggiorna(codice, piattaforma, campi)`                    | aggiorna un solo layer; lo attiva se non lo è                                                                      |
| `metriche_aggiungi(codice, piattaforma, rilevazione)`           | aggiunge una rilevazione alla serie                                                                                |
| `voto_registra(codice, conteggi_per_piattaforma, esito?)`       | salva i conteggi e, se dato, l'esito                                                                               |
| `contributo_archivia(codice)` / `contributo_ripristina(codice)` | niente cancellazione definitiva via MCP                                                                            |
| `rubriche_elenco()` / `rubrica_salva(valore, nome, colore)`     | gestione dell'elenco 3.3                                                                                           |
| `piano_leggi()` / `piano_salva(modello)`                        | il modello settimanale della sezione 6                                                                             |

Regole:

- Date in ISO 8601; le date-ora con fuso esplicito (Europe/Rome).
- Ogni scrittura via MCP registra `claude` come autore nella cronologia.
- Ogni strumento restituisce la scheda aggiornata, così Claude verifica subito cosa è stato salvato.
- Errori chiari e specifici: codice inesistente, rubrica sconosciuta, piattaforma non valida.

### Esempio: `contributo_salva` per una puntata del Trono

```json
{
  "codice": "ep002",
  "titolo": "Il Trono ep. 2",
  "rubrica": "il-trono",
  "data_uscita": "2026-11-02",
  "fascia": "19:00",
  "stato": "pronto",
  "durata_secondi": 78,
  "formato_video": "9:16",
  "file_video": "out/ep002.mp4",
  "copione": "episodi/ep002.json",
  "domanda": "PAIRING o RESET?",
  "opzioni_voto": ["PAIRING", "RESET"],
  "voto_chiude": "2026-11-04",
  "layers": {
    "tiktok": {
      "attivo": true,
      "stato_pubblicazione": "pronto",
      "didascalia": "… #robottierobotte",
      "etichetta_ia": false
    },
    "youtube": {
      "attivo": true,
      "stato_pubblicazione": "pronto",
      "tipo": "Short",
      "titolo_yt": "…",
      "descrizione": "…",
      "non_per_bambini": true
    },
    "instagram": {
      "attivo": true,
      "stato_pubblicazione": "pronto",
      "tipo": "Reel",
      "didascalia": "…"
    }
  }
}
```

### Esempio: carosello della domenica (solo Instagram)

```json
{
  "codice": "car001",
  "titolo": "Chi è chi",
  "rubrica": "carosello",
  "data_uscita": "2026-11-08",
  "fascia": "19:00",
  "stato": "da approvare",
  "formato_video": "immagini",
  "file_video": "out/car001/",
  "layers": {
    "instagram": { "attivo": true, "tipo": "Carosello", "numero_immagini": 9, "didascalia": "…" }
  }
}
```

## 8. Come lo useremo (flusso)

1. **Claude scrive i copioni** della settimana → crea le schede con stato `da approvare` e i testi già nei layer.
2. **Rosario approva** (in conversazione con Claude) → Claude monta i video e porta le schede a `pronto`, con percorsi dei file e durata.
3. **Rosario programma i post** dalle piattaforme copiando i testi dalla scheda, e porta i layer a `programmato` (o lo dice a Claude, che li aggiorna).
4. **Dopo l'uscita** → layer `pubblicato` con l'URL; il pannello "Da fare" ricorda il commento fissato.
5. **Alla chiusura del voto** → Claude registra conteggi ed esito.
6. **Ogni domenica** → Claude inserisce le metriche della settimana e propone le modifiche al piano.

## 9. Dati iniziali

Il primo popolamento lo fa Claude via MCP appena il tab esiste. Contenuti già presenti:

| Codice               | Rubrica                      | Uscita           | Layer                      | Stato                                 |
| -------------------- | ---------------------------- | ---------------- | -------------------------- | ------------------------------------- |
| `ep001`              | Il Trono                     | 30/10/2026 19:00 | TikTok, YouTube, Instagram | pubblicato                            |
| `speciale-halloween` | Speciale                     | 31/10/2026 19:00 | TikTok, YouTube, Instagram | pronto                                |
| `conf001`            | Il Confessionale             | 03/11/2026 19:00 | TikTok, YouTube, Instagram | approvato                             |
| `caf001`             | Cafoni Umani                 | 04/11/2026 19:00 | TikTok, YouTube, Instagram | pronto                                |
| `rec001`             | Recensioni a una stella      | 05/11/2026 19:00 | TikTok, YouTube, Instagram | pronto                                |
| `gem001`             | Consigli di Gemma            | 07/11/2026 19:00 | TikTok, YouTube, Instagram | pronto                                |
| `car001`             | Carosello                    | 08/11/2026 19:00 | Instagram                  | da approvare                          |
| `studio001`          | Lo Studio Esplode            | 02/11/2026 13:00 | TikTok, YouTube            | da approvare                          |
| `pov001`             | POV                          | 03/11/2026 13:00 | TikTok, YouTube            | da approvare                          |
| `ind001`             | Indovina l'elettrodomestico  | 04/11/2026 13:00 | TikTok, YouTube            | da approvare                          |
| `agg001`             | Prima e dopo l'aggiornamento | 05/11/2026 13:00 | TikTok, YouTube            | da approvare                          |
| `pov002`             | POV                          | 06/11/2026 13:00 | TikTok, YouTube            | da approvare                          |
| `spd001`             | Speed date                   | 08/11/2026 13:00 | TikTok, YouTube            | da approvare                          |
| `comp001`            | Compilation YouTube          | 08/11/2026 19:00 | YouTube                    | da preparare (dopo il Trono del 6/11) |

Gli slot del Trono del 2 e del 6 novembre restano vuoti finché non chiude il voto della puntata 1.

## 10. Criteri di accettazione

1. Dalla vista Settimana si vedono le due fasce di ogni giorno, con colore della rubrica e badge di stato per ogni piattaforma attiva.
2. Gli interruttori TikTok / YouTube / Instagram filtrano schede e badge.
3. Gli slot vuoti del piano compaiono come segnaposto e, cliccati, creano la scheda già compilata.
4. Nella scheda ogni layer attivo ha la sua linguetta con i campi della sezione 3.2 e i pulsanti Copia.
5. Lo stato della scheda passa a `programmato`/`pubblicato` da solo quando tutti i layer attivi ci arrivano, con "in parte" se sono disallineati.
6. Le metriche si accumulano come rilevazioni datate, senza sovrascrivere le precedenti.
7. Via MCP, `contributo_salva` con un codice esistente aggiorna senza duplicare, e uno nuovo crea; la cronologia registra `claude`.
8. Il modello settimanale con rotazione A/B/C/D e date di attivazione genera gli slot giusti per le settimane dal 2 novembre 2026.
9. Niente si cancella definitivamente: archiviare e ripristinare funziona da interfaccia e da MCP.
