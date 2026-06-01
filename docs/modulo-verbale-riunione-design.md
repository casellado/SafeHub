# Modulo Verbale di Riunione di Coordinamento — Design Finale

> **Versione**: 1.1 (riallineata 31 maggio 2026 alla biblioteca di design)
> **Stato**: design chiuso, pronto per costruzione
> **Ruolo**: modulo **pilota del Flusso B** (documenti del PO con iter esterno protocollo) in SafeHub Archivio
> **Riferimenti**: `FlussoB-Documenti-Prodotti-M12-M16.md` (gli altri 5 moduli B sono variazioni di
> questo pilota) · `M6-Motore-DOCX.md` (motore gratuito) · `Schema-Dati-Completo.md` · `SafeHub.md`
>
> **Nota di riallineamento (31 mag):** aggiornato il motore documenti da html-module (a pagamento) alla
> via gratuita `{@rawXml}` + convertitore HTML→OOXML + image-module-free. Rimossi i riferimenti operativi
> all'audit V3 (V3 abbandonata). La firma del CSE è il PNG permanente caricato da file in M2; il canvas
> resta come modalità alternativa ma sul PC ufficio (no touch) il caso normale è il PNG. Il resto del
> design — ciclo BOZZA→FINALIZZATO→PROTOCOLLATO, firme multiple dei presenti, snapshot — resta valido ed
> è il pattern che gli altri moduli del Flusso B riusano.

---

## 1. INQUADRAMENTO

Il Verbale di Riunione di Coordinamento è il primo modulo del **Flusso B** che il PO costruirà in SafeHub Archivio. È stato scelto come pilota per tre motivi:

1. È il documento del PO più frequente in cantiere (dopo il sopralluogo)
2. È il modulo che ha generato il bug più importante della V3 (bug del 27 maggio risolto col commit `db9729c`)
3. Dopo il pilota Verbale Riunione, gli altri 5 moduli del Flusso B (Verifiche POS, Sospensione CSE, NC, Eventi Incidentali, ODS Inviati) saranno variazioni dello stesso pattern: cambia il modello dati specifico e la funzione `generaCorpoHtml<Tipo>`, ma l'infrastruttura, l'UI, lo storage, il ciclo di vita restano identici

**Il pattern del Flusso B definito qui è la base per tutto il Flusso B in Archivio.**

---

## 2. CICLO DI VITA DEL DOCUMENTO

Il verbale di riunione attraversa **tre stati** nel nuovo Archivio:

```
BOZZA
  │ il PO compila il form in Archivio, salva bozze intermedie
  │ può modificare, eliminare, riprendere quando vuole
  ↓
FINALIZZATO_DA_PROTOCOLLARE
  │ il PO ha completato il verbale, ha firmato come CSE titolare
  │ Archivio ha generato il DOCX (template unico + corpo HTML)
  │ il DOCX è stato scaricato sul PC del PO
  │ il PO lo invia via mail ai superiori
  │ i superiori firmano digitalmente e mandano al protocollo del committente
  │ il protocollo restituisce: PDF protocollato + numero + data + lettera trasmissione
  ↓
PROTOCOLLATO
  │ il PO carica in Archivio: PDF protocollato + numero protocollo + data + lettera trasmissione
  │ Archivio associa univocamente i 4 elementi e sposta il record da Bozze/ a Protocollati/
  │ stato definitivo, immutabile
```

**Caratteristica chiave del Flusso B**: SafeHub Archivio **NON archivia il DOCX scaricato**. Archivia solo il **PDF protocollato** che torna dal protocollo dopo il giro mail-superiori. Quello che SafeHub produce internamente (il DOCX) è una bozza di lavoro: il documento ufficiale a valore legale è il PDF firmato e protocollato.

---

## 3. STORAGE FILESYSTEM

```
SafeHub-CSE-Lavori/
└── CZ399/
    └── 02_Verbali-Riunione/
        ├── Bozze/
        │   ├── <uuid-1>.json          ← stato BOZZA
        │   └── <uuid-2>.json          ← stato FINALIZZATO_DA_PROTOCOLLARE
        └── Protocollati/
            ├── 20260530_RC01.json     ← record completo + dati protocollo
            ├── 20260530_RC01.pdf      ← PDF protocollato
            └── 20260530_RC01_lettera.pdf  ← lettera di trasmissione
```

**Note**:
- I file in `Bozze/` hanno nomi UUID (es. `a3f5b2e9-...json`) finché non sono finalizzati
- Quando si protocolla, il file viene rinominato `<numero_progressivo>.json` e spostato in `Protocollati/`
- Il numero progressivo segue il pattern `YYYYMMDD_RCNN` (`RC` = Riunione di Coordinamento, `NN` = ordinale del giorno)
- I PDF protocollati e le lettere trasmissione sono affiancati al JSON con nomi correlati per univocità

---

## 4. MODELLO DATI

```javascript
{
  // METADATI BASE
  id: String,                              // UUID v4
  cantiereId: String,                      // riferimento al cantiere
  schemaVersion: "1.0",                    // versionamento schema

  // DATI RIUNIONE
  dataRiunione: "YYYY-MM-DD",              // OBBLIGATORIO

  // Tipi riunione (CHECKBOX MULTIPLI — un verbale può essere insieme
  // "corso opera" e "nuove imprese", per esempio)
  tipiRiunione: [
    "preliminare" |
    "corso_opera" |
    "nuove_imprese" |
    "rls"
  ],                                       // almeno 1 obbligatorio

  labelPresentiSicurezza: String,          // letta da anagrafica cantiere
                                           // override possibile per il singolo verbale

  // PRESENTI PER LA SICUREZZA
  // Da anagrafica del cantiere, oppure ospiti liberi aggiunti al volo
  presentiSicurezza: [
    {
      personaId: String | null,            // FK anagrafica, null se ospite libero
      nomeCognome: String,
      ruolo: String,                       // es. "Ingegnere", "Direzione Lavori"
      isOspite: Boolean,                   // true = ospite libero non in anagrafica
      firma: String | null                 // Base64 PNG (canvas o file selezionato)
    }
  ],                                       // almeno 1 obbligatorio

  // PRESENTI IMPRESE
  presentiImprese: [
    {
      impresaId: String | null,
      ragioneSociale: String,
      nomeFirmatario: String,
      ruoloFirmatario: String,             // es. "Direttore Tecnico Cantiere"
      isOspite: Boolean,
      firma: String | null
    }
  ],                                       // almeno 1 obbligatorio

  // ARGOMENTI DISCUSSI
  argomentiChecklist: [                    // chiavi degli 8 STANDARD selezionati
    "illustrazione_psc",
    "layout_cantiere",
    "pos_impresa",
    "incarichi",
    "responsabili",
    "servizi_impianti",
    "sorveglianza_sanitaria",
    "coordinamento_rls"
  ],
  argomentiCustom: [                       // argomenti CUSTOM per questo verbale
    {
      id: String,                          // UUID locale
      testo: String                        // testo libero dell'argomento
    }
  ],
  impresaPos: String,                      // ragione sociale se "pos_impresa" selezionato
  noteArgomenti: String,                   // testo libero aggiuntivo

  // CONTENUTO VERBALE
  // Almeno uno dei due seguenti è obbligatorio
  criticitaOsservazioni: String,
  istruzioniOperative: String,

  aggiornaPsc: Boolean,                    // flag: comporta aggiornamento PSC?

  // FIRMA CSE TITOLARE
  // (UNA SOLA: niente Delegato, niente atto delega — il CSE non delega per legge)
  firmaCseImage: String,                   // Base64 PNG
                                           // Default: firma permanente da Impostazioni Globali
                                           // Override: canvas live
  timestampFirmaCse: ISO8601,              // quando è stata acquisita

  // METADATI DOCUMENTO
  numeroProgressivo: String | null,        // "YYYYMMDD_RCNN" — null finché BOZZA
  dataCreazione: ISO8601,
  dataFinalizzazione: ISO8601 | null,
  dataProtocollazione: ISO8601 | null,
  stato: "BOZZA" |
         "FINALIZZATO_DA_PROTOCOLLARE" |
         "PROTOCOLLATO",

  // SNAPSHOT POST-FINALIZZAZIONE (BLOCCO 5)
  // Congelano i dati al momento della finalizzazione per integrità documentale legale
  snapshotPresentiSicurezza: Array,        // deep copy di presentiSicurezza
  snapshotPresentiImprese: Array,          // deep copy di presentiImprese
  snapshotNomeCse: String,                 // nome+qualifica CSE titolare congelato

  // PROTOCOLLAZIONE (Flusso B, feature nuova)
  protocollo: {
    numero: String,                        // numero protocollo (digitato dal PO)
    data: "YYYY-MM-DD",                    // data protocollazione
    pdfProtocollato: String,               // nome file PDF salvato in Protocollati/
    letteraTrasmissione: String            // nome file PDF lettera
  } | null
}
```

---

## 5. INTERFACCIA UTENTE

### 5.1 Cruscotto della categoria — Tab a 3 stati

Il cruscotto del modulo Verbale Riunione mostra **3 tab** che corrispondono ai 3 stati del documento:

**Tab "In compilazione"** (BOZZA)
- Bottone "+ Nuovo Verbale" in alto a destra
- Lista verbali in stato BOZZA, ordinata per data desc
- Per ogni verbale: data, tipo (badge multipli), numero presenti, ultima modifica
- Azioni: ✏️ Modifica · 🗑️ Elimina

**Tab "Da protocollare"** (FINALIZZATO_DA_PROTOCOLLARE)
- Lista verbali finalizzati in attesa del PDF protocollato di ritorno
- Per ogni verbale: numero progressivo, data, tipo, data finalizzazione
- Azioni: 👁 Visualizza · 📥 Ri-scarica DOCX · ✅ Carica PDF protocollato

**Tab "Protocollati"** (PROTOCOLLATO)
- Archivio completo, sola consultazione
- Per ogni verbale: numero protocollo, data protocollazione, numero progressivo interno, data riunione
- Azioni: 👁 Visualizza PDF · 📥 Scarica PDF + lettera trasmissione

### 5.2 Form Editor (stato BOZZA)

Form a pagina intera (no modal), stack Alpine.js + Tailwind, sezioni in ordine:

1. **Intestazione cantiere** (read-only, da anagrafica cantiere)
2. **Data riunione** (date input, obbligatorio)
3. **Tipi riunione** (4 checkbox multipli, almeno 1 obbligatorio)
4. **Label presenti sicurezza** (text input, default da profilo cantiere, override possibile)
5. **Presenti per la sicurezza** (bottone "📋 Seleziona presenti" → modal multi-select da anagrafica + ospiti liberi inline)
6. **Presenti imprese** (stesso pattern)
7. **Argomenti discussi**:
   - 8 checkbox standard
   - Bottone "+ Aggiungi argomento" → aggiunge riga custom inline
   - Lista argomenti custom modificabili/eliminabili
8. **Impresa POS** (text input, visibile solo se "pos_impresa" selezionato)
9. **Note argomenti** (textarea libera)
10. **Criticità/osservazioni** (textarea)
11. **Istruzioni operative** (textarea — almeno una tra 10 e 11 obbligatoria)
12. **Aggiorna PSC** (checkbox)
13. **Firma CSE Titolare**:
    - Default: firma permanente caricata automaticamente dalle Impostazioni Globali
    - Bottone "✏️ Disegna firma" → canvas live (sovrascrive il default)

**Footer sticky** (sempre visibile):

```
[Annulla] ─────── [💾 Salva Bozza] [👁 Anteprima] [✅ Finalizza]
```

### 5.3 Sezione "Protocollazione" (stato FINALIZZATO_DA_PROTOCOLLARE)

Quando il verbale è in stato `FINALIZZATO_DA_PROTOCOLLARE`, il form è readonly. Si apre invece la sezione **Protocollazione**:

**Campi**:
1. **PDF protocollato** (file input, obbligatorio) — il PDF firmato dai superiori e protocollato
2. **Numero protocollo** (text input, obbligatorio) — digitato a mano dal PO
3. **Data protocollazione** (date input, obbligatorio)
4. **Lettera di trasmissione** (file input, obbligatorio) — PDF della lettera che accompagna il documento

**Bottone**: `[✅ Conferma archiviazione]`

Al click:
- I 2 file PDF vengono copiati in `Protocollati/` con naming corretto
- Il record JSON viene aggiornato con il blocco `protocollo`
- Lo stato passa a `PROTOCOLLATO`
- Il file JSON viene rinominato da UUID a `<numero_progressivo>.json` e spostato da `Bozze/` a `Protocollati/`

### 5.4 Vista Verbale Protocollato (stato PROTOCOLLATO)

Vista a sola lettura con:
- Riepilogo metadati (numero protocollo, data, numero progressivo interno, data riunione, tipi)
- Anteprima PDF protocollato inline (o apertura in nuova scheda)
- Bottoni: 📥 Scarica PDF · 📥 Scarica lettera trasmissione

**Nessuna possibilità di de-finalizzare o modificare**. Una volta protocollato, il verbale è immutabile.

---

## 6. GESTIONE FIRME

### 6.1 Firma CSE Titolare

**Modalità disponibili** (2):
1. **Firma permanente** — PNG salvato nelle Impostazioni Globali del PO, caricato automaticamente come default quando si apre il form
2. **Canvas** — l'utente disegna una firma live che sovrascrive il default

### 6.2 Firme presenti (sicurezza + imprese)

**Modalità disponibili** (2):
1. **Canvas** — disegna a mano con mouse o touch
2. **Seleziona file** — upload PNG/JPG già pronto (es. firma generata dall'app SafeHub Firma standalone, oppure firma scansionata)

### 6.3 Pattern Modal Multi-Select Presenti

Mantenuto da V3 (pattern UX maturo):
- Modal con 2 sezioni: **Anagrafica** (checkbox list persone del cantiere) + **Ospiti liberi** (input nome + ruolo + bottone "+" per aggiungere)
- Al "Conferma": merge dei selezionati da anagrafica + ospiti aggiunti
- **Preservazione firme**: se una persona era già nella lista del verbale e aveva firmato, la firma viene mantenuta quando si riapre la selezione

### 6.4 SignatureCanvas

Riusato dal componente già esistente in SafeCant (`shared/firme-canvas.js`):
- Canvas 340×140 px, eventi mouse + touch
- Cleanup esplicito alla chiusura del modal per evitare memory leak

---

## 7. GENERAZIONE DOCX

### 7.1 Pattern template unico + corpo HTML

L'Archivio usa **un solo template Word** (`templates/template-safehub.docx`) per TUTTI i documenti dell'ecosistema. Per il verbale di riunione, il pattern è:

```javascript
// Pseudocodice
async function generaDocxVerbaleRiunione(verbale) {
  // 1. Carica template unico
  const tplBuffer = await fetch('templates/template-safehub.docx').then(r => r.arrayBuffer());

  // 2. Carica impostazioni globali del PO
  const impostazioni = await caricaImpostazioniGlobali();

  // 3. Genera il corpo HTML del verbale
  const corpoHtml = generaCorpoHtmlRiunione(verbale, impostazioni);

  // 4. dataObject con segnaposto header/footer + corpo HTML
  const dataObj = {
    // Header
    logo: impostazioni.logo_aziendale,
    titolo_verbale: "Verbale di Riunione di Coordinamento",
    codice: "Mod.VR.02",                          // letto da impostazioni.codici_moduli
    versione_data: "Rev.2.0 — " + formatDataIt(new Date()),

    // Corpo (HTML → OOXML iniettato via {@rawXml}, gratuito)
    corpo_html: corpoHtml,

    // Footer (eventuali segnaposto specifici)
    footer_html: generaFooterHtml(impostazioni)
  };

  // 5. Render con docxtemplater core + {@rawXml} + image-module-free (tutto gratuito)
  const zip = new PizZip(tplBuffer);
  const doc = new Docxtemplater(zip, {
    modules: [creaImageModule(), creaHtmlModule()],
    paragraphLoop: true,
    linebreaks: true
  });
  doc.setData(dataObj);
  doc.render();

  return doc.getZip().generate({ type: 'blob' });
}
```

### 7.2 Funzione `generaCorpoHtmlRiunione(verbale, impostazioni)`

Funzione JavaScript pura, vive in `moduli/riunione/genera-corpo-html.js`, produce stringa HTML del corpo. Schema concettuale:

```javascript
function generaCorpoHtmlRiunione(verbale, imp) {
  // Sceglie snapshot vs live (BLOCCO 5)
  const isFinalizzato = verbale.stato !== 'BOZZA';
  const presentiSic = isFinalizzato
    ? verbale.snapshotPresentiSicurezza
    : verbale.presentiSicurezza;
  const presentiImp = isFinalizzato
    ? verbale.snapshotPresentiImprese
    : verbale.presentiImprese;
  const nomeCse = isFinalizzato
    ? verbale.snapshotNomeCse
    : `${imp.qualifica_cse} ${imp.nome_cse_titolare}`;

  // Costruisce HTML
  return `
    <h1>VERBALE DI RIUNIONE DI COORDINAMENTO</h1>

    <p><strong>Data:</strong> ${formatDataIt(verbale.dataRiunione)}</p>
    <p><strong>Cantiere:</strong> ${verbale.cantiereId}</p>
    <p><strong>Numero progressivo:</strong> ${verbale.numeroProgressivo || 'BOZZA'}</p>

    <h2>Tipo riunione</h2>
    <ul>
      ${verbale.tipiRiunione.map(t => `<li>${labelTipo(t)}</li>`).join('')}
    </ul>

    <h2>Presenti per la sicurezza (${verbale.labelPresentiSicurezza})</h2>
    <table>
      <thead><tr><th>Nome</th><th>Ruolo</th><th>Firma</th></tr></thead>
      <tbody>
        ${presentiSic.map(p => `
          <tr>
            <td>${p.nomeCognome}</td>
            <td>${p.ruolo}</td>
            <td>${p.firma ? `<img src="${p.firma}" />` : '—'}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>

    <h2>Presenti imprese</h2>
    <table>
      ${presentiImp.map(p => `
        <tr>
          <td>${p.ragioneSociale}</td>
          <td>${p.nomeFirmatario} (${p.ruoloFirmatario})</td>
          <td>${p.firma ? `<img src="${p.firma}" />` : '—'}</td>
        </tr>
      `).join('')}
    </table>

    <h2>Argomenti discussi</h2>
    <ul>
      ${verbale.argomentiChecklist.map(a => `<li>${labelArgomento(a)}</li>`).join('')}
      ${verbale.argomentiCustom.map(a => `<li>${a.testo}</li>`).join('')}
    </ul>

    ${verbale.impresaPos ? `<p><strong>Impresa POS:</strong> ${verbale.impresaPos}</p>` : ''}
    ${verbale.noteArgomenti ? `<p>${verbale.noteArgomenti}</p>` : ''}

    ${verbale.criticitaOsservazioni ? `
      <h2>Criticità e osservazioni</h2>
      <p>${verbale.criticitaOsservazioni}</p>
    ` : ''}

    ${verbale.istruzioniOperative ? `
      <h2>Istruzioni operative</h2>
      <p>${verbale.istruzioniOperative}</p>
    ` : ''}

    ${verbale.aggiornaPsc ? `<p><em>Il presente verbale comporta aggiornamento del PSC.</em></p>` : ''}

    <h2>Firma del CSE Titolare</h2>
    <p><strong>${nomeCse}</strong></p>
    <img src="${verbale.firmaCseImage}" />
  `;
}
```

**Vantaggio**: tutta la logica di rendering è JavaScript puro. Testabile, modificabile senza toccare XML Word, niente loop docxtemplater fragili.

---

## 8. PATTERN ESTRATTI DA V3 (RIUSO)

### 8.1 BLOCCO 5 — Snapshot Congelamento

Pattern eccellente per immutabilità documentale legale. Estratto in modulo `shared/snapshot.js`:

```javascript
// Al momento della finalizzazione
async function congelaSnapshot(verbale, impostazioni) {
  verbale.snapshotPresentiSicurezza =
    (verbale.presentiSicurezza || []).map(p => ({...p}));
  verbale.snapshotPresentiImprese =
    (verbale.presentiImprese || []).map(p => ({...p}));
  verbale.snapshotNomeCse =
    `${impostazioni.qualifica_cse} ${impostazioni.nome_cse_titolare}`;
  return verbale;
}
```

Replicato per tutti i moduli del Flusso B che hanno presenti + firme.

### 8.2 Numero Progressivo Idempotente

Estratto in modulo `shared/progressive-number.js`:

```javascript
async function assegnaNumeroProgressivo(verbale, prefisso = 'RC') {
  if (verbale.numeroProgressivo) return verbale.numeroProgressivo;

  const dataPrefix = verbale.dataRiunione.replace(/-/g, '');
  // Legge filesystem per trovare verbali stesso giorno
  const altriOggi = await leggiVerbaliStessoGiorno(verbale.cantiereId, verbale.dataRiunione);
  const numeri = altriOggi
    .filter(v => v.stato !== 'BOZZA' && v.numeroProgressivo)
    .map(v => parseInt(v.numeroProgressivo.split('_')[1].replace(prefisso, '')) || 0);
  const maxNum = Math.max(0, ...numeri);
  verbale.numeroProgressivo = `${dataPrefix}_${prefisso}${String(maxNum + 1).padStart(2, '0')}`;
  return verbale.numeroProgressivo;
}
```

Riusabile per tutti i flussi B con prefisso configurabile (RC, VP, NC, EI, SC, OS).

### 8.3 Modal Multi-Select Presenti con Preservazione Firme

Componente Alpine.js riusabile, mantiene logica V3 ma con stato locale invece di variabili globali.

### 8.4 Validazione Pre-Finalizzazione

Pattern errori bloccanti + warning non bloccanti separati. Estratto in helper `shared/validation.js`.

### 8.5 SignatureCanvas

Riusato direttamente da SafeCant (`shared/firme-canvas.js`).

---

## 9. COSA È CAMBIATO RISPETTO A V3

Tabella sintetica:

| Aspetto | V3 attuale | Nuovo Archivio |
|---|---|---|
| Storage primario | IDB store `verbali_riunione` | File JSON in `02_Verbali-Riunione/` |
| ID | autoIncrement IDB | UUID v4 |
| Tipi riunione | Radio (1 solo selezionabile) | **Checkbox multipli** |
| Argomenti checklist | 8 fissi hard-coded | 8 standard + **custom aggiungibili per verbale** |
| Atto delega CSE | `ruoloCse` (Titolare/Delegato) + `attoDelega` | **ELIMINATI** (CSE non delega per legge) |
| Snapshot CSE | `snapshotNomeCse` + `snapshotRuoloCse` + `snapshotAttoDelega` | Solo `snapshotNomeCse` |
| Firma CSE | 3 modalità (canvas, permanente, paste) | **2 modalità** (canvas + permanente) |
| Firme ospiti | Solo canvas | Canvas + **Seleziona file** |
| Wrapper impostazioni | `{chiave, data, modifiedAt}` (causa bug 27 mag) | **ELIMINATO** — JSON puro |
| Template DOCX | Template dedicato con placeholder e loop | **Template unico** + corpo HTML via {@rawXml} + convertitore HTML→OOXML (gratuito) |
| Foto allegate | Base64 inline (causa OOM) | **Nessuna foto** nel verbale riunione (decisione PO) |
| labelPresentiSicurezza | Per ogni verbale | **Spostata in profilo cantiere** (override per verbale possibile) |
| Variabili globali sessione | `window._rcFirmaCse`, `_ospitiTempSic` etc | **ELIMINATE** — stato locale Alpine.js |
| Ciclo di vita | BOZZA → FINALIZZATO | **BOZZA → FINALIZZATO_DA_PROTOCOLLARE → PROTOCOLLATO** |
| Protocollazione | Assente | **Sezione dedicata**: PDF protocollato + numero + data + lettera trasmissione |
| Cruscotto | Lista unica | **3 tab** per stato (In compilazione / Da protocollare / Protocollati) |
| Anteprima DOCX | `docxPreview` CDN esterno | Da definire in costruzione (renderer locale o offerta solo download) |
| De-finalizzazione | Assente | Resta assente (decisione PO) |

---

## 10. RISPOSTE ALLE 14 DOMANDE APERTE DELL'AUDIT

| # | Domanda audit | Decisione PO |
|---|---|---|
| Q1 | Upload PDF protocollato: manuale o sync? | **Manuale** via `<input type="file">` |
| Q2 | Numero protocollo: digitato o integrato? | **Digitato a mano** dal PO |
| Q3 | Stato dopo upload PDF? | Nuovo stato `PROTOCOLLATO` |
| Q4 | Timestamp firme presenti individuali? | **NO**, solo CSE redattore ha timestamp |
| Q5 | Presente senza firma: bloccante? | **No bloccante**, solo warning |
| Q6 | labelPresentiSicurezza fissa o per verbale? | **Default per cantiere** (in anagrafica), override possibile per singolo verbale |
| Q7 | Tipi riunione mutuamente esclusivi? | **NO — checkbox multipli** |
| Q8 | RLS ha campi speciali? | **No**, solo label diversa |
| Q9 | 8 argomenti fissi o personalizzabili? | **8 standard + custom aggiungibili per verbale** |
| Q10 | noteArgomenti sufficiente? | **Sì sufficiente** |
| Q11 | Dati cantiere congelati? | **NO**, anagrafica viva; solo presenti e nome CSE congelati |
| Q12 | De-finalizzazione possibile? | **NO** — errata corrige se serve |
| Q13 | Struttura cartelle Bozze/Protocollati? | **Confermata** |
| Q14 | Firme inline JSON o separate? | **Inline JSON Base64** (le foto invece sarebbero file separati ma in questo modulo non ci sono) |

---

## 11. BUG E ANOMALIE V3 RISOLTI ARCHITETTURALMENTE

### BUG-OOM — Foto Base64 inline (priorità ALTA in V3)
**V3**: foto allegate salvate come Base64 dentro il record IDB principale. `getByIndex('verbali_riunione', 'projectId')` carica tutto in RAM. Con 100+ verbali × 10 foto × 5 MB → potenziale OOM.
**Nuovo Archivio**: nessuna foto nel verbale di riunione (decisione PO). Bug eliminato by design.

### BUG-8 — Wrapper impostazioni (risolto in V3 col commit `db9729c`)
**V3**: `caricaImpostazioni()` ritornava `{chiave, data, modifiedAt}` invece di `data`. Risolto verificando `if (item && item.data)`.
**Nuovo Archivio**: il wrapper non esiste. Le impostazioni vivono in `_config/impostazioni-archivio.json` come JSON puro. Bug eliminato by design.

### BUG-OSPITI — UX confusa ospiti liberi (priorità BASSA in V3)
**V3**: input nome+ruolo nel modal, l'utente deve cliccare "+" per confermare; se non lo fa, l'ospite si perde alla conferma del modal.
**Nuovo Archivio**: pattern in-place con Alpine.js reactive — l'ospite digitato è già in lista (draft) finché il form non viene salvato. Nessuna variabile temporanea.

### BUG-PSC-SILENT — Hook PSC silenzioso (priorità INFO in V3)
**V3**: `proponiAggiornamentoPSCDaVerbale()` chiamato in try-catch silenzioso. Se fallisce, utente non riceve feedback.
**Nuovo Archivio**: l'hook PSC viene aggiunto solo quando il Modulo 23 (Registro PSC) sarà implementato, con feedback esplicito all'utente.

### BUG-FOTO-UX — Foto non nel Word ma in ZIP separato (priorità INFO in V3)
Non rilevante nel nuovo Archivio: niente foto nel verbale riunione.

---

## 12. CRITERIO DI CHIUSURA DEL MODULO

Il modulo Verbale Riunione si considera "chiuso" in Archivio quando:

1. ✅ Il PO può creare nuovi verbali in stato BOZZA dal cruscotto
2. ✅ Il form editor permette di compilare tutti i campi del modello dati
3. ✅ Tipi riunione gestiti come checkbox multipli
4. ✅ Argomenti standard 8 + possibilità di aggiungere argomenti custom per verbale
5. ✅ Modal multi-select presenti funziona da anagrafica + ospiti liberi inline
6. ✅ Firme: canvas funziona, seleziona file funziona per ospiti, firma permanente CSE viene precaricata
7. ✅ Validazione pre-finalizzazione lista errori bloccanti + warning
8. ✅ Numero progressivo idempotente assegnato correttamente alla finalizzazione
9. ✅ BLOCCO 5 snapshot congelamento applicato post-finalizzazione
10. ✅ Generazione DOCX funzionante (template unico + corpo HTML iniettato via {@rawXml} + convertitore HTML→OOXML (gratuito))
11. ✅ Sezione "Protocollazione" permette upload PDF + numero + data + lettera trasmissione
12. ✅ Stato passa correttamente BOZZA → FINALIZZATO_DA_PROTOCOLLARE → PROTOCOLLATO
13. ✅ File JSON spostato da `Bozze/` a `Protocollati/` con rinomina corretta
14. ✅ PDF e lettera trasmissione copiati in `Protocollati/`
15. ✅ Cruscotto a 3 tab (In compilazione / Da protocollare / Protocollati) funziona
16. ✅ Visualizzazione verbale protocollato (PDF inline o nuova scheda)
17. ✅ Il PO usa il modulo per **almeno 5 verbali reali** senza tornare a V3

---

## 13. PROSSIMI PASSI PER QUESTO MODULO

Per essere pronti alla costruzione effettiva del modulo serve **prima**:

1. ✅ Audit V3 completato
2. ⏳ Audit degli altri moduli del Flusso B (per non scoprire pattern mancanti durante la costruzione del pilota)
3. ⏳ Costruzione delle fondamenta Archivio (Modulo 1 Fondazione, Modulo 2 Impostazioni Globali, Modulo 3 Gestione Cantieri, Modulo 4 Anagrafica, Modulo 5 Esportazione anagrafica, Modulo 6 Sistema Generazione DOCX)
4. ⏳ Template Word definitivo `template-safehub.docx` con i segnaposto fissati
5. ⏳ Documento di progettazione SafeHub Archivio (equivalente a `progettazione-safecant.md` ma per Archivio)
6. ⏳ Prompt di costruzione per Claude Code del Modulo 11 (Verbale Riunione, pilota Flusso B)
7. ⏳ Costruzione, test, collaudo
8. ⏳ Chiusura modulo

**Riferimenti per il prompt di costruzione futuro**:
- Questo documento per le specifiche del modulo
- `safehub-contratto-tecnico.md` sezione 8 per il pattern template Word
- `safehub-contratto-tecnico.md` sezione 9 per i cicli di vita
- `audit-verbale-riunione.md` per i frammenti di codice V3 da riusare/adattare

---

*Documento prodotto a fine sessione 30 maggio 2026, pronto per essere ripreso a freddo.*
