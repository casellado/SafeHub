# SafeHub — Contratto Tecnico (convenzioni di costruzione)
## Le regole a cui ogni modulo si attiene · riscritto 31 maggio 2026

> **Nota di versione.** Riscrive il contratto tecnico originale (Modulo 0). Cambio di impostazione
> deciso dal CTO: questo documento contiene SOLO ciò che è unico — le **convenzioni di codice e di
> costruzione**. Lo **schema dati** (file/cartelle, IndexedDB, schemi JSON, formato firme) NON è più
> duplicato qui: vive in `Schema-Dati-Completo.md`, fonte di verità unica. Così i due documenti non
> possono divergere. Vale per `safehub-operativita` (SafeCant) e `safehub-archivio`.

---

## 1. PRINCIPIO DI RISERVATEZZA (primo vincolo di ogni scelta)

Il nome del committente e i riferimenti identificativi delle opere reali (nomi cantieri, codici opera)
NON compaiono MAI in: codice sorgente, file di configurazione, UI delle PWA, nomi di cartelle
pubblicamente visibili, messaggi di commit, README. Si usa "committente" come termine generico e
codici cantiere opachi (es. CZ399). I dettagli reali vivono solo nelle note private del PO e nei file
in cartelle OneDrive private. Primo vincolo di ogni decisione di naming e scrittura.

---

## 2. AMBIENTE

- **Sviluppo**: PC privato Ubuntu (no OneDrive client; accesso a OneDrive solo via browser).
- **Produzione**: PC ufficio Windows 11 (OneDrive client sincronizzato col tenant) — hub di Archivio.
- **Campo**: iPad colleghi (app OneDrive ufficiale) — SafeCant.
- **Cartella radice** configurabile al primo avvio; la struttura interna è identica in ogni ambiente,
  cambia solo il path radice.

---

## 3. SCHEMA DATI → RIMANDO UNICO

Tutto lo schema dati (struttura delle 16 cartelle, schemi dei file JSON, store IndexedDB di SafeCant e
Archivio, formato firme, mappa canonico/cache) è in **`Schema-Dati-Completo.md`**. Questo contratto NON
lo ripete. Lo schema anagrafica nel dettaglio è in `schema-anagrafica-canonico-v2.md`.

Principio cardine ribadito: **file = stato**. I file JSON/PDF in OneDrive sono la verità; IndexedDB è
cache rigenerabile. Mai trattare l'IDB come fonte di verità.

---

## 4. CANTIERE CORRENTE (una sola fonte)

Una sola fonte autorevole del cantiere selezionato: lo store Alpine globale `$store.cantiere` (M1).
Nessun modulo tiene una copia propria. Al cambio cantiere → evento `cantiere-cambiato` → i moduli
ricaricano i dati del lotto. Questo risolve per costruzione la frammentazione che affliggeva V3.

---

## 5. COMUNICAZIONE TRA PRODOTTI (via JSON)

> Aggiornamento 31 maggio: i prodotti comunicano via **file JSON** (non DOCX, come diceva la versione
> originale). Il DOCX è solo un output finale di Archivio.

Quattro cartelle OneDrive mono-direzionali (PO↔colleghi), niente conflitti. SafeCant produce il JSON di
interscambio del verbale (`corpo_html` + metadati + firme PNG). Archivio produce il JSON anagrafica
(variante leggera) che SafeCant importa. **Schema identico tra i due**: nessuna trasformazione di nomi
campo. Dettaglio cartelle e nomenclatura: `Schema-Dati-Completo.md` §2.

---

## 6. FORMATO FIRME

Tutte le firme, nei file JSON e negli store IDB, usano lo stesso formato: PNG come data URL
(`data:image/png;base64,...`), preferibilmente sfondo trasparente, con `timestamp_firma` ISO8601 e
`tipo_firma`. Le firme vivono **inline nel corpo HTML** del documento come `<img>`, non nell'header.
La firma del CSE (Archivio) si carica da file PNG nelle impostazioni globali (M2); le firme dei presenti
(SafeCant) si raccolgono col canvas sul campo.

---

## 7. PATTERN MOTORE DOCUMENTI (gratuito)

> Aggiornamento 31 maggio: niente html-module a pagamento. Dettaglio completo in `M6-Motore-DOCX.md`.

- SafeCant NON genera documenti: produce solo il JSON con `corpo_html`.
- Archivio genera HTML/DOCX/PDF dal template Word unico: docxtemplater core (segnaposto header) +
  `{@rawXml}` con convertitore HTML→OOXML nostro (corpo) + `docxtemplater-image-module-free` (logo).
- Template: segnaposto SOLO in header (`{modulo_codice}`, `{modulo_versione}`, eventuale
  `{modulo_titolo}`, logo); il corpo è iniettato. Il PDF si genera DAL DOCX (coerenza d'impaginazione).
- Funzioni `generaCorpoHtml<Tipo>()` per ogni documento: pure (dati → stringa HTML), array `parti[]` +
  join, escape sistematico, sezioni condizionali, `<img>` inline per firme, nessun CSS inline. Pattern
  ereditato da SafeCant (`generaCorpoHtmlSopralluogo`).

---

## 8. CONVENZIONI DI CODICE

### 8.1 Naming
- File JS: kebab-case (`firme-canvas.js`)
- Componenti Alpine: PascalCase via `x-data` (`x-data="VerbaleEditor()"`)
- Store/chiavi IDB: snake_case (`cache_anagrafica`)
- Variabili JS: camelCase · Costanti: SCREAMING_SNAKE_CASE
- Classi CSS: kebab-case con prefisso modulo (`archivio-cruscotto-card`)

### 8.2 Stile HTML
- HTML5 semantico (`<header>`, `<main>`, `<section>`, `<article>`, `<nav>`); `<html lang="it">`
- Form con `<label for>`; bottoni `<button>` non `<div onclick>`; ARIA solo dove la semantica non basta.

### 8.3 Stile JS
- ES2022+, `const` preferito, mai `var`, async/await; funzioni piccole a responsabilità singola;
  niente inline handler (`onclick=`), tutto Alpine o `addEventListener`.

### 8.4 Commenti (il perché, non il cosa)
- Commenti spiegano il **perché** di una scelta (performance, accessibilità, micro-UX), non l'ovvio.
- JSDoc per le funzioni pubbliche di `shared/`. Niente `console.log` in produzione (solo `error`/`warn`
  intenzionali).

---

## 9. GESTIONE ERRORI

Modulo `errori.js` centralizzato (M1): una funzione `gestisciErrore(contesto, err, opzioni)` che logga
con contesto leggibile, mostra un toast comprensibile (non lo stack grezzo), e distingue errori
recuperabili (riprova) da fatali (blocca con istruzioni). Casi tipici OneDrive: file cloud-only non
ancora scaricato, JSON corrotto (isola e continua), File System Access negato.

---

## 10. VALIDAZIONI E INTEGRITÀ (principio guida-non-blocca)

Le validazioni sono **warning, mai blocchi** (principio P3 dello schema anagrafica). Si può sempre
salvare; i campi mancanti generano suggerimenti gentili. Eccezioni dure solo dove un dato è
indispensabile all'integrità del file (es. id cantiere valido come nome cartella). Integrità nomi file
e idempotenza delle operazioni (ri-eseguire non duplica): regole in `Schema-Dati-Completo.md`.

---

## 11. EVOLUZIONE DEL CONTRATTO

Il contratto cambia solo per decisione esplicita del PO+CTO, annotata con data. Quando una convenzione
cambia, si aggiorna QUI e i moduli si adeguano. Le decisioni del 31 maggio già recepite: comunicazione
JSON, motore gratuito, schema dati spostato in documento dedicato, V3 abbandonata.

> Principio sovraordinato (lezione 31 maggio): **quando un documento diverge dal codice che funziona,
> vince il codice.** Il contratto descrive le convenzioni, ma la realtà del codice reale (es. SafeCant)
> ha sempre la precedenza; in caso di conflitto si aggiorna il contratto, non si forza il codice.

---

*SafeHub Contratto Tecnico (convenzioni). Riscritto il 31 maggio 2026. Contiene le convenzioni di
codice/costruzione; lo schema dati vive in `Schema-Dati-Completo.md`. Riservatezza assoluta dei
riferimenti al committente.*
