# SafeCant — Allineamento con SafeHub e Fix del Bug Compilatore
## Specifica + prompt di audit/fix per Claude Code · 31 maggio 2026

> **Cosa è questo documento.** Diversamente dagli altri documenti della biblioteca (design per il repo
> pulito `safehub-archivio`), questo riguarda **SafeCant, che è codice REALE già online**. Definisce
> due interventi su SafeCant: (1) **allineare l'import anagrafica** allo schema esatto che SafeHub
> Archivio esporta; (2) **risolvere il bug del nome compilatore**. Per il bug, Claude Code deve PRIMA
> accertare la causa nel codice (audit read-only), POI correggere — non si indovina.

> **Repo:** `safehub-operativita` (SafeCant). **Dipende da:** schema anagrafica `schema-anagrafica-canonico-v2.md`
> (variante leggera) e dall'export prodotto da SafeHub Archivio (M5). **Principio guida:** SafeCant legge
> le STESSE chiavi che Archivio scrive, nessuna trasformazione di nomi campo.

---

## 1. I FATTI (dal verbale reale prodotto da SafeCant)

Verbale reale analizzato (`verbale_sopralluogo__2026-05-31_0055_nlz2.json`):

**Il bug compilatore:**
- `redattore.nome_cognome` = `""` (VUOTO)
- `redattore.qualifica` = `""` (VUOTO)
- `redattore.firma_png_base64` = presente (~23KB), `tipo_firma: "permanente"`
- **Diagnosi preliminare:** la firma permanente viene caricata, ma nome e qualifica del redattore NON
  vengono scritti nel verbale. Probabile disallineamento tra dove è salvata l'identità dell'ispettore
  (impostazioni utente) e dove viene letta al momento di comporre il file di interscambio. Da accertare.

**L'aggancio anagrafica mancante:**
- `metadati.cantiere_id` = `""` (VUOTO) → rompe anche il naming del file
- `presenti[0].origine` = `"manuale"` (non da anagrafica)
- `presenti[0].anagrafica_ref` = `null`
- `presenti[0].impresa_id` = `null` (non agganciato a un'impresa reale)
→ Oggi i dati si inseriscono a mano; l'anagrafica non viene importata/usata.

---

## 2. INTERVENTO 1 — IMPORT ANAGRAFICA ALLINEATO

### 2.1 Obiettivo
SafeCant importa l'anagrafica esportata da Archivio (variante leggera) e fa **selezionare** all'ispettore
imprese / lavoratori / mezzi, invece di farglieli scrivere a mano. Questo riempie `impresa_id`,
`anagrafica_ref`, e fa sì che `origine` diventi `"anagrafica"` quando il soggetto è selezionato.

### 2.2 Contratto di import (deve combaciare con l'export di Archivio M5)
- File: `anagrafica_<lotto>_AAAA-MM-GG.json` nella cartella OneDrive `SafeHub-Anagrafiche`.
- Intestazione: `schema_version: "2.0"`, `variante: "leggera"` (blob base64 svuotati: sul campo non servono).
- Otto collezioni sotto il lotto (vedi `schema-anagrafica-canonico-v2.md`): lotto, imprese, lavoratori,
  mezzi, attrezzature, noli, persone_committente, persone_terzi.
- SafeCant importa nell'IDB store `anagrafica_corrente` (keyPath `cantiereId`), confrontando `generato_il`
  e tenendo la versione più recente.

### 2.3 Cosa cambia nella compilazione del verbale
- `metadati.cantiere_id`: impostato selezionando il cantiere dall'anagrafica importata (NON più vuoto).
  Risolve anche il naming del file (niente più doppio underscore).
- Presenti: selettore che pesca da `lavoratori[]` / `persone_*` dell'anagrafica → compila
  `nome_cognome`, `qualifica`, `impresa`, **`impresa_id`**, imposta `origine: "anagrafica"` e
  `anagrafica_ref`. Resta possibile l'inserimento manuale (ospite non in anagrafica) → `origine: "manuale"`.
- **Non bloccante:** se l'anagrafica non è ancora stata importata, SafeCant funziona come oggi (manuale).
  L'aggancio è un miglioramento, non un vincolo.

### 2.4 Identità di schema (la regola d'oro)
SafeCant legge esattamente i nomi campo dello schema v2.0. Nessuna rinomina. Se lo schema crescerà,
crescerà in un punto solo (il documento schema) e entrambi i prodotti si adeguano.

---

## 3. INTERVENTO 2 — FIX BUG NOME COMPILATORE (prima audit, poi fix)

> Claude Code: NON correggere a indovinare. Prima accerta la causa (3.1), poi applica il fix (3.2).

### 3.1 Audit della causa (read-only)
Trova nel codice di SafeCant:
- DOVE è salvata l'identità dell'ispettore/redattore (probabile store IDB `impostazioni_utente`,
  record `key: "current"`): quali campi (`nome_cognome`? `qualifica`? nomi diversi?).
- DOVE viene letta l'identità al momento di comporre il file di interscambio (funzione
  `componiFileInterscambio` o `generaCorpoHtmlSopralluogo` o l'editor): come popola `redattore.nome_cognome`
  e `redattore.qualifica`.
- Verifica l'ipotesi: la firma permanente viene letta correttamente ma nome/qualifica no? Allora c'è
  un disallineamento di chiavi tra dove si SALVA l'identità e dove si LEGGE. Documenta i nomi campo esatti.
- Controlla se l'identità viene mai effettivamente impostata: esiste una schermata impostazioni dove
  l'ispettore inserisce nome e qualifica? Se sì, vengono salvati con le stesse chiavi che il compositore legge?

**Output dell'audit:** la causa esatta (con i nomi campo coinvolti e il punto del codice), senza
modificare nulla.

### 3.2 Fix (dopo l'audit)
In base alla causa accertata, allinea SALVATAGGIO e LETTURA dell'identità sulle stesse chiavi, così
`redattore.nome_cognome` e `redattore.qualifica` vengono popolati come lo è già la firma. Coerenza con
il pattern di SafeHub Archivio (M2): identità + firma permanente configurate una volta, usate ovunque.

### 3.3 Collaudo del fix
- Impostare nome e qualifica dell'ispettore nelle impostazioni di SafeCant.
- Compilare e finalizzare un verbale.
- Verificare nel JSON di interscambio: `redattore.nome_cognome` e `redattore.qualifica` valorizzati,
  firma presente. Nel `corpo_html`, la sezione "Il Redattore" mostra nome e qualifica.

---

## 4. ALTRI DEBITI MINORI DA SISTEMARE (dall'audit del 31 mag, contestualmente)

- **Scadenza NC "gravissima" come datetime grezzo**: nel `corpo_html` la scadenza gravissima appare
  come ISO (`2026-06-01T00:00:00.000Z`) invece di data italiana, perché il test accetta solo `AAAA-MM-GG`.
  Allineare la formattazione a tutte le gravità.
- **`impresa_id: ""` vs `null`**: uniformare a `null` quando non assegnato (oggi a volte `""`).
- Questi sono ritocchi, non bloccanti; si fanno insieme agli interventi 1-2.

---

## 5. CRITERIO DI CHIUSURA

SafeCant è allineato quando:
- importa l'anagrafica v2.0 leggera esportata da Archivio (M5) senza errori, schema identico;
- l'ispettore seleziona cantiere e presenti dall'anagrafica → `cantiere_id`, `impresa_id`,
  `anagrafica_ref`, `origine: "anagrafica"` valorizzati; inserimento manuale ancora possibile;
- **il nome e la qualifica del compilatore compaiono nel verbale** (bug risolto, causa accertata);
- il naming del file non ha più il buco da `cantiere_id` vuoto;
- il giro end-to-end funziona: Archivio esporta anagrafica → SafeCant importa → ispettore compila
  selezionando → verbale completo → Archivio lo riceve con i dati agganciati.

---

## 6. ORDINE E DIPENDENZA

L'intervento 1 (import anagrafica) dipende dall'**export di Archivio (M5)**: serve che Archivio
PRODUCA l'anagrafica leggera. Quindi: prima si costruisce M4+M5 in Archivio, poi si allinea SafeCant.
L'intervento 2 (fix bug compilatore) è **indipendente** e si può fare subito, anche prima di M5.

> Suggerimento CTO: fai SUBITO il fix del bug compilatore (intervento 2, indipendente e veloce), e
> rimanda l'import anagrafica (intervento 1) a quando M5 è pronto. Così SafeCant migliora subito senza
> aspettare Archivio.

---

*SafeCant — Allineamento e Fix. 31 maggio 2026. SafeCant è codice reale: per il bug, audit prima del
fix. Schema identico ad Archivio, nessuna trasformazione di nomi campo. Riservatezza assoluta dei
riferimenti al committente.*
