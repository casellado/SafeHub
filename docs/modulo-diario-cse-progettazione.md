# MODULO DIARIO CSE — Design per SafeHub Archivio

> **Versione**: 2.1 (riallineata 31 maggio 2026 alla biblioteca di design)
> **Versione precedente**: 1.0 del 27 maggio (prompt per V3, superata)
> **Stato**: design concettuale chiuso, pronto per costruzione
> **Ruolo**: modulo di consultazione e supporto in SafeHub Archivio. Non è un Flusso A/B/C ma una vista trasversale che osserva tutto.
> **Riferimenti**: biblioteca di design (vedi `00-INDICE-Biblioteca-SafeHub.md`) · `M6-Motore-DOCX.md` (export PDF) · `Schema-Dati-Completo.md`
>
> **Nota di riallineamento (31 mag):** rimosso il passo "audit V3" (V3 abbandonata); export PDF via
> motore gratuito M6. Il design concettuale del diario resta valido.

---

## 1. INQUADRAMENTO

Il **Diario CSE** è uno strumento di tracciamento dell'attività quotidiana del Coordinatore della Sicurezza in fase di Esecuzione. Riferimento normativo: D.Lgs 81/08 art. 92 — il diario è strumento di tutela documentale del CSE.

In SafeHub Archivio il Diario è:
- **Per-cantiere** (un diario indipendente per ogni cantiere)
- **Sola consultazione e produzione interna** del PO: niente protocollo, niente iter esterno (non è Flusso A né B né C)
- **Composto da voci tipizzate**: alcune sono **automatiche** (generate quando il PO finalizza/protocolla un documento in altri moduli), altre sono **manuali** (telefonate, decisioni, osservazioni, ecc.)
- **Immutabile per voci AUTO**: una voce AUTO è una fotografia del momento in cui è stata creata. Se il documento sorgente cambia, la voce diario NON si aggiorna (eccetto cestinazione automatica quando il sorgente viene eliminato)
- **Modificabile per voci MANUALI**: il PO può modificare le voci che ha scritto a mano, finché non sono firmate

**Decisioni PO storiche (sessione 27 maggio sera, ancora valide)**:
- Diario tipizzato (non testo libero unico)
- Auto-popolamento da moduli + voci manuali
- **No popolamento retroattivo**: le voci AUTO partono dall'attivazione del modulo in avanti
- Firma CSE opzionale, mai obbligatoria
- Diario per-cantiere, non globale

---

## 2. STORAGE — ARCHITETTURA FILE = STATO

Il Diario non vive in IndexedDB. Segue il pattern **file = stato** di SafeHub Archivio: ogni voce è un file JSON su filesystem dentro la cartella del cantiere.

```
SafeHub-CSE-Lavori/
└── CZ399/
    └── 08_Diario-CSE/
        ├── 2026/
        │   ├── 05/
        │   │   ├── 2026-05-27_14-30_TELEFONATA_<uuid>.json
        │   │   ├── 2026-05-27_15-12_SOPRALLUOGO_<uuid>.json    (AUTO)
        │   │   ├── 2026-05-28_09-45_RIUNIONE_<uuid>.json       (AUTO)
        │   │   └── ...
        │   └── 06/
        │       └── ...
        ├── _allegati/
        │   ├── <uuid-voce>/
        │   │   ├── allegato1.pdf
        │   │   └── allegato2.jpg
        │   └── ...
        └── _cestino/
            └── 2026-05-29_11-20_OSSERVAZIONE_<uuid>.json
```

**Pattern di naming**:
- Cartelle annuali e mensili per evitare migliaia di file in una sola directory
- File: `<data>_<ora>_<TIPO>_<uuid>.json`
- Allegati: in sottocartella per voce, identificata dall'uuid della voce
- Cestino: file spostati interi in `_cestino/` mantenendo la data originale nel nome

**Vantaggi**:
- Browsable da filesystem anche senza app aperta
- Ordinamento alfabetico = ordinamento cronologico automatico
- Backup banale (zip della cartella)
- Sync via OneDrive client integrato senza logica custom

---

## 3. MODELLO DATI

Ogni voce è un file JSON con questa struttura:

```javascript
{
  // METADATI BASE
  "schema_version": "1.0",
  "tipo_file": "voce_diario_cse",
  "id": "uuid-v4",
  "cantiere_id": "CZ399",

  // ORIGINE
  "origine": "AUTO" | "MANUALE",
  "fonte_tipo": "verbale_sopralluogo" | "verbale_riunione" | "nc" | "evento_incidentale" | "verifica_pos" | "proposta_sospensione_cse" | "ods_inviato" | "registro_psc" | "ods_ricevuto" | "disposizione_rl" | null,
  "fonte_riferimento": "<numero_progressivo o uuid del record sorgente>" | null,
  "fonte_path_relativo": "02_Verbali-Riunione/Protocollati/20260530_RC01.json" | null,

  // CONTENUTO
  "tipo": "<chiave tipologia, vedi sez. 4>",
  "data_ora": "2026-05-27T14:30:00.000+02:00",   // ISO 8601 con timezone
  "soggetti": ["Direzione Lavori", "<IMPRESA_X>"], // array di soggetti coinvolti
  "titolo": "<max 120 char>",
  "descrizione": "<testo libero>",

  // ALLEGATI E RIFERIMENTI
  "allegati": [
    {
      "nome": "allegato1.pdf",
      "mime": "application/pdf",
      "size": 145320,
      "path_relativo": "_allegati/<uuid>/allegato1.pdf"
    }
  ],
  "riferimenti_url": [
    "https://link-a-pec.it/xyz"
  ],

  // FIRMA CSE (OPZIONALE)
  "firma_cse": {
    "nome_cognome": "<COGNOME>",
    "qualifica": "<QUALIFICA>",
    "data_firma": "2026-05-27T14:35:00.000+02:00",
    "firma_png_base64": "data:image/png;base64,..."
  } | null,

  // STATO
  "stato": "NORMALE" | "CESTINATO",
  "cestinato_il": "2026-05-29T11:20:00.000+02:00" | null,

  // AUDIT
  "creato_il": "2026-05-27T14:30:00.000+02:00",
  "creato_da": "<COGNOME>",
  "modificato_il": "2026-05-27T14:32:15.000+02:00",
  "modificato_da": "<COGNOME>"
}
```

---

## 4. CATEGORIE VOCI

### 4.1 Voci AUTO (generate dagli altri moduli)

Quando il PO completa un'azione in un altro modulo (es. finalizza un verbale di riunione, chiude una NC), SafeHub Archivio **crea automaticamente** una voce diario corrispondente.

| Modulo sorgente | Evento trigger | Tipo voce | Esempio titolo |
|---|---|---|---|
| Verbale Sopralluogo (Flusso A) | finalizzazione | `SOPRALLUOGO` | "Sopralluogo cantiere — N. NC rilevate: X" |
| Verbale Riunione (Flusso B) | protocollazione | `RIUNIONE` | "Riunione coordinamento — Tipo: corso opera" |
| NC (Flusso B) | apertura | `NC_APERTA` | "Non conformità: <titolo> — impresa X" |
| NC (Flusso B) | chiusura | `NC_CHIUSA` | "NC risolta: <titolo>" |
| Evento Incidentale (Flusso B) | protocollazione | `EVENTO_NEAR_MISS` o `EVENTO_INFORTUNIO` | "Near-miss: <descrizione>" |
| Verifica POS (Flusso B) | protocollazione | `POS_VERIFICATO` | "POS impresa X: idoneo/non idoneo" |
| Proposta Sospensione CSE (Flusso B) | protocollazione | `PROPOSTA_SOSPENSIONE` | "Proposta sospensione al committente" |
| ODS Inviati (Flusso B) | protocollazione | `ODS_INVIATO` | "ODS n.<N> inviato a <destinatario>" |
| Registro PSC (modulo trasversale) | aggiornamento PSC | `PSC_AGGIORNATO` | "PSC aggiornato — Motivo: X" |
| ODS Ricevuti (Flusso C) | upload | `ODS_RICEVUTO` | "Ricevuto ODS n.<N> dal DL" |
| Disposizioni RL (Flusso C) | upload | `SOSPENSIONE_RL` o `DISPOSIZIONE_RL` | "Sospensione comunicata dal RL" |

Per ogni voce AUTO: `origine="AUTO"`, `fonte_tipo` valorizzato, `fonte_riferimento` valorizzato, `fonte_path_relativo` valorizzato (per aprire il documento sorgente con un click), `firma_cse=null` (la firma c'è già nel documento sorgente).

### 4.2 Voci MANUALI (scritte dal PO)

| Tipo | Etichetta UI | Esempio d'uso |
|---|---|---|
| `TELEFONATA` | 📞 Telefonata | "Tel. con DL alle 14:30: chiede chiarimento POS impresa X" |
| `EMAIL_PEC` | 📧 Email/PEC | "Inviata PEC a impresa Y con contestazione [riferimento]" |
| `COMUNICAZIONE_VERBALE` | 🗣️ Comunicazione verbale | "Richiamo verbale al capocantiere su uso DPI" |
| `DECISIONE` | ⚖️ Decisione CSE | "Decisione: anticipare riunione coord. del XX/XX" |
| `OSSERVAZIONE` | 👁️ Osservazione | "Notato che le impalcature mostrano usura..." |
| `PROMEMORIA` | 📌 Promemoria | "Da verificare al prossimo sopralluogo: scadenza DPI impresa Z" |
| `COMUNICAZIONE_AUTORITA` | 🏛️ Comunicazione ITL/ASL | "Inviata segnalazione a ITL su [argomento]" |
| `ALTRO` | 📝 Altro | tipologia libera |

Per ogni voce MANUALE: `origine="MANUALE"`, `fonte_tipo=null`, `fonte_riferimento=null`, `firma_cse` opzionale (bottone "Firma" abilitabile dal PO).

---

## 5. UI/UX

### 5.1 Posizione nel menu di SafeHub Archivio

Il modulo Diario è una voce della **sidebar del cantiere selezionato**, accanto agli altri moduli del cantiere (Verbali, NC, Diario, Registro PSC, ecc.). Stesso pattern delle altre cartelle 01-16: visibile solo quando un cantiere è selezionato.

### 5.2 Vista principale Diario

Layout:

```
┌────────────────────────────────────────────────────────────────┐
│ 📔 Diario CSE — Cantiere CZ399      [+ Nuova annotazione]     │
├────────────────────────────────────────────────────────────────┤
│ Filtri: [Origine ▼] [Tipo ▼] [Soggetto ▼] [Da ___ A ___]      │
│ Ricerca: [_______________________________________ 🔍]          │
├────────────────────────────────────────────────────────────────┤
│ ┌──────────────────────────────────────────────────────────┐   │
│ │ 🤖 AUTO  🏗️ Sopralluogo   2026-05-27 15:12              │   │
│ │ Sopralluogo cantiere — N. NC rilevate: 2                 │   │
│ │ Soggetti: <IMPRESA_X>, capocantiere                      │   │
│ │ ↗ Vai al documento sorgente · 📎 0 allegati              │   │
│ └──────────────────────────────────────────────────────────┘   │
│ ┌──────────────────────────────────────────────────────────┐   │
│ │ ✍️ MANUALE  📞 Telefonata   2026-05-27 14:30  ✍️ Firmato │   │
│ │ Tel. con DL: chiede chiarimento POS impresa X            │   │
│ │ Soggetti: Direzione Lavori                               │   │
│ │ "Concordata risposta scritta entro venerdì..."           │   │
│ │ ✏️ Modifica · 🗑️ Cestina                                  │   │
│ └──────────────────────────────────────────────────────────┘   │
│ ...                                                            │
└────────────────────────────────────────────────────────────────┘
```

**Filtri disponibili**:
- Origine: Tutte / AUTO / MANUALI
- Tipo: dropdown con tutte le tipologie (auto + manuali)
- Soggetto: dropdown popolato dinamicamente dai soggetti delle voci esistenti
- Range date (da / a)
- Ricerca testo libero su `titolo`, `descrizione`, `soggetti`

**Ordinamento**: cronologico discendente di default (`data_ora` desc), inversione possibile.

### 5.3 Card voce diario

Ogni voce mostra:
- Badge origine: 🤖 AUTO (azzurro) / ✍️ MANUALE (viola)
- Badge tipo: icona + etichetta (es. 📞 Telefonata)
- Data e ora
- Titolo in grassetto
- Soggetti coinvolti (chip)
- Descrizione (troncata a 3 righe, espandibile su click)
- Allegati: icona graffetta + conteggio (se > 0)
- Se voce AUTO: link "↗ Vai al documento sorgente" che apre il documento originale (es. il verbale di riunione protocollato)
- Badge "✍️ Firmato" se `firma_cse` presente
- Azioni:
  - Voci MANUALI: ✏️ Modifica · ✍️ Firma (se non firmata) · 🗑️ Cestina
  - Voci AUTO: 🗑️ Cestina (modificare = no, vedi sez. 6)

### 5.4 Modal "Nuova annotazione" (solo per voci MANUALI)

Form:
- **Tipo** (dropdown obbligatorio, 8 tipologie manuali)
- **Data/ora** (default: now, modificabile dal PO)
- **Soggetti coinvolti** (chip input multi-valore, autocompletamento dai soggetti dell'anagrafica cantiere — imprese, persone committente, persone terzi)
- **Titolo** (text input obbligatorio, max 120 char)
- **Descrizione** (textarea obbligatoria, no limite)
- **Riferimenti URL** (campo opzionale per link esterni, multi-valore)
- **Allegati** (upload multipli, riusa pattern degli altri moduli)
- **Bottoni**: `[Salva]` / `[Salva e firma]` / `[Annulla]`

### 5.5 Modal "Modifica" (solo voci MANUALI non ancora firmate)

Stesso form di "Nuova", precompilato con i valori esistenti.

**Importante**: una voce MANUALE già firmata NON è più modificabile (la firma sigilla il contenuto). Per correggere serve una nuova voce di rettifica.

### 5.6 Cestino

Vista separata accessibile da pulsante "🗑️ Cestino diario":
- Lista voci con `stato="CESTINATO"`, ordinata per `cestinato_il` desc
- Per ogni voce: stessi metadati della lista principale + data cestinazione
- Azioni: ♻️ Ripristina · ❌ Elimina definitivamente

### 5.7 Esportazione PDF "Estratto diario"

Pulsante in toolbar: "📄 Esporta diario PDF". Genera un PDF estratto del diario per un range di date e filtri attivi:
- Intestazione: dati cantiere, range date, firma CSE (presa da Impostazioni Globali)
- Tabella cronologica delle voci nel range
- Una pagina per voce, oppure densità alta selezionabile
- Allegati: lista (nome + dimensione), non incorporati

**Nota**: questa è funzionalità **opzionale**, fa parte dello Step 3 di costruzione (vedi sez. 8).

---

## 6. GESTIONE EVENTI AUTO QUANDO IL DOCUMENTO SORGENTE CAMBIA

Regola di design per evitare voci diario obsolete senza renderle "vive" (e quindi contestabili in giudizio):

- Quando un documento sorgente viene **eliminato**, la voce diario AUTO collegata va in **cestino automaticamente**. Il PO può ripristinarla se è stata cancellata per errore.
- Quando un documento sorgente viene **modificato** (es. errata corrige post-protocollazione), la voce diario AUTO **NON si aggiorna automaticamente**. Il diario è una fotografia del momento. Se serve registrare la modifica, il PO aggiunge una **nuova voce manuale** che descrive la variazione.
- **NC che passa da APERTA a CHIUSA**: crea una **nuova voce** `NC_CHIUSA`, lascia la `NC_APERTA` precedente intatta. Il diario contiene quindi traccia di entrambi gli eventi.

Conseguenza: ogni voce è una **traccia temporale immutabile**, modificabile solo finché è MANUALE non firmata.

---

## 7. INTEGRAZIONE CON GLI ALTRI MODULI (HOOK)

I moduli del Flusso A, B, C, e i moduli trasversali (Registro PSC) creano voci AUTO al verificarsi di eventi specifici.

**Pattern dell'hook** (riusabile, da definire nel Modulo 6 del piano di costruzione SafeHub Archivio):

```javascript
// Pseudocodice
async function aggiungiVoceDiarioAuto(opts) {
  // opts: { cantiereId, fonteTipo, fonteRiferimento, fontePath, tipo, titolo, descrizione, soggetti, dataOra }
  const voce = creaVoceDiarioAuto(opts);
  const path = costruisciPathVoceDiario(opts.cantiereId, opts.dataOra, opts.tipo, voce.id);
  await scriviFile(path, JSON.stringify(voce));
  return voce;
}
```

Ogni modulo Flusso A/B/C, al momento della finalizzazione/protocollazione, chiama questa utility con i parametri specifici del tipo di documento. L'hook è 5-10 righe nel codice di finalizzazione del modulo sorgente.

**Hook per modulo (riepilogo)**:
- Verbale Sopralluogo (Flusso A) → al "finalizza"
- Verbale Riunione (Flusso B) → al "PROTOCOLLATO"
- NC (Flusso B) → all'apertura E alla chiusura
- Evento Incidentale (Flusso B) → al "PROTOCOLLATO"
- Verifica POS (Flusso B) → al "PROTOCOLLATO"
- Proposta Sospensione CSE (Flusso B) → al "PROTOCOLLATO"
- ODS Inviati (Flusso B) → al "PROTOCOLLATO"
- Registro PSC → ad ogni aggiornamento PSC
- ODS Ricevuti (Flusso C) → all'upload
- Disposizioni RL (Flusso C) → all'upload

---

## 8. PIANO DI COSTRUZIONE A STEP

La costruzione del Diario è suddivisa in **3 step indipendenti**:

### Step 1 — Modulo Diario base, SOLO voci MANUALI

Costruzione del modulo Diario in SafeHub Archivio, capacità CRUD per le voci manuali.

**Contenuto**:
- Creazione cartella `08_Diario-CSE/<YYYY>/<MM>/` automatica al primo uso per cantiere
- Sidebar con voce "📔 Diario" nel menu del cantiere
- Vista principale con lista cronologica + filtri + ricerca
- Modal "Nuova annotazione" per voci manuali
- Modal "Modifica" per voci manuali non firmate
- Cestino con ripristino e eliminazione definitiva
- Firma CSE opzionale (canvas + firma permanente da Impostazioni Globali)
- Gestione allegati (upload multipli in `_allegati/<uuid-voce>/`)
- ZERO hook nei moduli esistenti

**Output Step 1**: il PO può scrivere annotazioni manuali nel diario, sincronizzate via OneDrive client. Niente automazione ancora.

### Step 2 — Hook AUTO modulo per modulo

Aggiunta degli hook AUTO nei moduli sorgente, uno alla volta. Ogni sub-step è indipendente:

- 2.1 Verbale Sopralluogo → voce `SOPRALLUOGO`
- 2.2 Verbale Riunione → voce `RIUNIONE`
- 2.3 NC → voci `NC_APERTA` / `NC_CHIUSA`
- 2.4 Evento Incidentale → voci `EVENTO_NEAR_MISS` / `EVENTO_INFORTUNIO`
- 2.5 Verifica POS → voce `POS_VERIFICATO`
- 2.6 Proposta Sospensione CSE → voce `PROPOSTA_SOSPENSIONE`
- 2.7 ODS Inviati → voce `ODS_INVIATO`
- 2.8 Registro PSC → voce `PSC_AGGIORNATO`
- 2.9 ODS Ricevuti → voce `ODS_RICEVUTO`
- 2.10 Disposizioni RL → voce `SOSPENSIONE_RL` / `DISPOSIZIONE_RL`

Ogni hook è 5-10 righe nel codice di finalizzazione/protocollazione del modulo sorgente + uso dell'utility `aggiungiVoceDiarioAuto`.

### Step 3 — Esportazione PDF (opzionale)

Funzionalità di esportazione PDF dell'estratto diario per range di date. Riusa il motore documenti gratuito M6 (HTML/DOCX/PDF) di SafeHub Archivio.

### Step 4 — Funzionalità avanzate (futuro, non urgente)

- Notifiche su promemoria scaduti
- Tag custom oltre le tipologie standard
- Ricerca full-text avanzata su tutti i campi
- Vista grafica timeline cronologica

---

## 9. SICUREZZA E VALORE LEGALE

Il Diario è uno strumento di tutela del CSE in caso di contenzioso. Caratteristiche di sicurezza:

- **Voci firmate sono immutabili**: una volta apposta la firma CSE, il contenuto non si modifica più (la firma sigilla il record)
- **Voci AUTO sono immutabili by design**: si crea una nuova voce per registrare variazioni
- **Cestino con ripristino**: nessuna eliminazione accidentale definitiva senza doppia conferma
- **Audit trail completo**: ogni voce ha `creato_il`, `creato_da`, `modificato_il`, `modificato_da`
- **Backup via OneDrive**: il client OneDrive integrato mantiene versioning su tutti i file modificati

---

## 10. POSIZIONE NEL PIANO DI COSTRUZIONE SAFEHUB ARCHIVIO

Il Diario è il **Modulo 22** del piano di costruzione (vedi `SafeHubProcedura.md` sez. 3 e `SafeHubPianoSviluppo.md` sez. 6 Fase 6).

**Prerequisiti**:
- Modulo 1 (Fondazione PWA Windows + File System Access API)
- Modulo 2 (Impostazioni Globali del PO — per firma e dati CSE)
- Modulo 3 (Gestione Cantieri)
- Modulo 4 (Anagrafica Completa — per autocompletamento soggetti)

**Dipendenze degli hook AUTO (Step 2)**:
Ogni hook richiede che il modulo sorgente sia già stato costruito e funzionante. Quindi:
- Step 2.1 (sopralluogo) richiede Moduli 7-10 (Flusso A)
- Step 2.2 (riunione) richiede Modulo 11 (Verbale Riunione)
- E così via per gli altri sub-step

In pratica lo Step 2 si completa modulo per modulo, in parallelo alla costruzione degli altri moduli SafeHub Archivio.

---

## 11. CRITERIO DI CHIUSURA DEL MODULO

Il modulo Diario CSE si considera "chiuso" in SafeHub Archivio quando:

1. ✅ Step 1 completato: il PO può scrivere voci manuali, allegare file, firmare opzionalmente, cestinare e ripristinare
2. ✅ Cartella `08_Diario-CSE/<YYYY>/<MM>/` creata correttamente al primo uso per cantiere
3. ✅ File JSON scritti con schema corretto (vedi sez. 3)
4. ✅ Vista principale con filtri funzionanti (origine, tipo, soggetto, range date, ricerca testo)
5. ✅ Cestino con ripristino e eliminazione definitiva
6. ✅ Almeno 1 modulo del Flusso B (Verbale Riunione, modulo pilota) integrato con hook AUTO (Step 2.2)
7. ✅ Sync via OneDrive client integrato funziona senza interventi manuali
8. ✅ Il PO usa il Diario per almeno **30 voci reali** distribuite su 1-2 mesi senza richiedere modifiche al design

Lo Step 2 completo (tutti gli hook) e lo Step 3 (PDF) sono incrementali e si chiudono nei rispettivi sub-criteri quando saranno costruiti.

---

## 12. PROSSIMI PASSI

Per essere pronti alla costruzione effettiva del Diario serve **prima**:

1. ✅ (V3 abbandonata: nessun audit V3 — si parte dal design)
2. ⏳ Costruzione delle fondamenta SafeHub Archivio (Moduli 1-5: Fondazione, Impostazioni Globali, Cantieri, Anagrafica, Esportazione)
3. ⏳ Costruzione del sistema generazione DOCX (Modulo 6) per lo Step 3 PDF
4. ⏳ Documento di progettazione SafeHub Archivio (equivalente a `progettazione-safecant.md` ma per Archivio)
5. ⏳ Prompt di costruzione per Claude Code del Modulo 22 (Diario CSE)
6. ⏳ Costruzione Step 1, collaudo
7. ⏳ Step 2 modulo per modulo (in parallelo con la costruzione dei moduli sorgente)
8. ⏳ Step 3 (PDF) quando il sistema generazione documenti è maturo

---

## NOTE STORICHE

Questo documento è la **versione 2.0**, riscritta il 30 maggio 2026 sera per adattarla alla nuova architettura SafeHub Archivio (file = stato, niente IDB centrale, niente sync custom).

La versione 1.0 (27 maggio sera) era un prompt di implementazione per la SafeHub V3 attuale, con riferimenti a `DB_VERSION`, `STORES_CONFIG`, `sync-engine.js`, store IDB `eventi_diario`. È stata superata dalla decisione architetturale del 30 maggio mattina di ricostruire SafeHub da zero in 3 prodotti (SafeCant + SafeHub Archivio + SafeHub Firma).

Le **decisioni di design** del 27 maggio (categorie auto/manuali, gestione eventi sorgente, immutabilità delle voci firmate, firma opzionale) restano valide. È cambiata solo l'**implementazione**.

---

*Documento prodotto a fine sessione 30 maggio 2026 sera, pronto per essere ripreso a freddo.*
