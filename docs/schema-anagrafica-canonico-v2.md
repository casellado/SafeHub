# SCHEMA ANAGRAFICA CANONICO — "TOP ASSOLUTO"
## SafeHub Archivio ⇄ SafeCant · Versione 2.0 · 31 maggio 2026

> **Documento canonico.** Definisce l'UNICO schema anagrafica dell'ecosistema SafeHub. È prodotto
> da SafeHub Archivio (PC ufficio del PO) e consumato da SafeCant (iPad dei colleghi). Un solo
> schema, due prodotti. Sostituisce e arricchisce la v1.0 dopo l'analisi di conformità normativa
> (D.Lgs 81/2008, All. XVII, D.M. 132/2024) e la ricerca su noli/forniture/servizi.
> **Incorpora (§12.1-12.2) la mappa documentale completa "chi deve avere cosa"** per ogni categoria
> di soggetto, con matrice sinottica documento×soggetto.

---

## 0. PRINCIPI FONDANTI (non negoziabili)

**P1 — Gerarchia a cascata, ID primario = LOTTO.** Tutto appende al lotto/cantiere. Ogni entità
subordinata risale al lotto tramite `lotto_id`. Nessun dato vive "sciolto".

**P2 — Assegnazione UNIVOCA all'impresa, mai generica al cantiere.** Lavoratori, mezzi,
attrezzature, noli appartengono a UNA impresa specifica su quel lotto, identificata da `impresa_id`.
Un escavatore non è "del cantiere": è dell'impresa X. Questo è il cuore del modello e ciò che
distingue un software "Top Assoluto" da un gestionale generico.

**P3 — Lo schema GUIDA ma non BLOCCA mai.** I documenti attesi per ogni tipo di rapporto sono un
suggerimento del sistema, non un vincolo di salvataggio. Il CSE è sovrano sul caso concreto. Nessun
campo obbligatorio impedisce di salvare; le validazioni sono warning, non errori bloccanti.

**P4 — Conformità normativa incorporata.** La tassonomia dei soggetti e i campi riflettono gli
obblighi reali del CSE (chi deve avere cosa). Lo schema rende esplicito ciò che la legge impone.

**P5 — Compatibilità con il codice V3 esistente.** I nomi-campo già presenti in V3 si CONSERVANO
(non si rinominano senza motivo). Le aggiunte sono non distruttive. Versione tracciata in
`schema_version` (riusa il meccanismo già presente in `sync-engine.js`).

---

## 1. STRUTTURA GERARCHICA A CASCATA

```
LOTTO (id primario)                         ← cantiere / lotto dell'opera
│
├── dati_lotto                              ← anagrafica del cantiere (committente, CUP, CIG, progressive…)
├── ruoli_istituzionali                     ← RUP, DL, CSE, RL, CSP (FK → persone)
│
├── IMPRESE [ ]                             ← ogni impresa con il suo tipoRapporto
│   └── (impresa_id univoco nel lotto)
│
├── LAVORATORI [ ]                          ← OGNUNO assegnato a UNA impresa (impresa_id)
├── MEZZI [ ]                               ← OGNUNO assegnato a UNA impresa (impresa_id)
├── ATTREZZATURE [ ]                        ← OGNUNA assegnata a UNA impresa (impresa_id)  [NUOVO]
├── NOLI [ ]                                ← OGNUNO assegnato a UNA impresa (impresa_id)  [NUOVO]
│
├── persone_committente [ ]                 ← persone della stazione appaltante (ex persone_anas)
└── persone_terzi [ ]                       ← enti esterni (ASL, INL, VVF, consulenti…)
```

**Regola di integrità**: ogni elemento di LAVORATORI/MEZZI/ATTREZZATURE/NOLI DEVE avere un
`impresa_id` che esiste in IMPRESE dello stesso lotto. Se l'impresa viene rimossa, i suoi
subordinati sono orfani → il sistema avvisa (non cancella in automatico: P3).

---

## 2. INTESTAZIONE FILE

```json
{
  "schema_version": "2.0",
  "tipo_file": "anagrafica_cantiere",
  "generato_da": "SafeHub Archivio",
  "generato_da_versione": "1.0.0",
  "generato_il": "2026-05-31T10:00:00.000Z",
  "variante": "leggera | completa",        // leggera = senza blob (per SafeCant); completa = con blob (interna)

  "lotto": { ... },                          // §3 — l'ID primario
  "imprese": [ ... ],                        // §4
  "lavoratori": [ ... ],                     // §5
  "mezzi": [ ... ],                          // §6
  "attrezzature": [ ... ],                   // §7  [NUOVO]
  "noli": [ ... ],                           // §8  [NUOVO]
  "persone_committente": [ ... ],            // §9
  "persone_terzi": [ ... ]                   // §10
}
```

---

## 3. LOTTO (id primario) — da store `projects`

```json
{
  "id": "CZ399",                             // ⭐ ID PRIMARIO — tutto risale qui
  "nome": "<denominazione lavori>",          // guida: consigliato (warning se vuoto, non blocca)
  "committente": "<committente>",
  "strutturaTerritoriale": "string|null",
  "ssNumero": "string|null",
  "progressivaInizio": "km 0+000|null",
  "progressivaFine": "km 17+000|null",
  "codicePpmSil": "string|null",
  "commessaNumero": "string|null",
  "voceBudget": "string|null",
  "cup": "string|null",
  "cig": "string|null",
  "contrattoNumero": "string|null",
  "contrattoData": "YYYY-MM-DD|null",
  "importoContratto": "number|null",
  "dataConsegnaLavori": "YYYY-MM-DD|null",
  "durataContrattuale": "number|null",
  "giorniSospensione": "number (default 0)",
  "dataInizioEffettiva": "YYYY-MM-DD|null",
  "dataFineEffettiva": "YYYY-MM-DD|null",

  "ruoli_istituzionali": {                   // FK → persone_committente.id
    "rupId": "pc_…|null",
    "dlId": "pc_…|null",
    "cseTitolareId": "pc_…|null",
    "cseDelegatoId": "pc_…|null",
    "ispettoreCantiereId": "pc_…|null",
    "responsabileLavoriId": "pc_…|null"
  },
  "csp": {                                   // CSP esterno (testo libero, non FK)
    "nome": "string|null", "qualifica": "string|null", "recapito": "string|null"
  },
  "impresaAffidatariaId": "imp_…|null"        // FK → imprese.id
}
```

---

## 4. IMPRESE — da store `imprese`, ESTESO

```json
{
  "id": "imp_1780000000000",                 // univoco nel lotto
  "lotto_id": "CZ399",                       // ⭐ risale al lotto (era projectId)

  // IDENTIFICAZIONE
  "ragioneSociale": "<impresa>",             // guida: necessario
  "partitaIva": "string", "codiceFiscale": "string (UPPER)",
  "sedeLegale": "string",
  "pec": "string", "referente": "string", "telefono": "string", "email": "string",

  // ⭐ TASSONOMIA DEL RAPPORTO (cuore della conformità) — guida, non blocca
  "tipoRapporto": "APPALTO | SUBAPPALTO | NOLO_FREDDO | NOLO_CALDO | FORNITURA | FORNITURA_POSA | SERVIZIO | LAV_AUTONOMO",
  "ruolo": "AFFIDATARIA | ESECUTRICE | SUBAPPALTO",   // CONSERVATO da V3 (compat)
  "subAppaltoDi": "imp_…|null",              // valorizzato se SUBAPPALTO
  "superaSoglieSubappalto": "boolean",       // per NOLO_CALDO: se true → obblighi da subappalto
  "contrattoRiferimento": "string|null",     // n. contratto appalto/subappalto

  // ⭐ PATENTE A CREDITI (D.M. 132/2024 — obbligo dal 01/10/2024)
  "patenteCrediti": {
    "codice": "string|null",                 // codice univoco INL
    "punteggio": "number|null",              // ≥15 per operare
    "dataRilascio": "YYYY-MM-DD|null",
    "stato": "ATTIVA | SOSPESA | REVOCATA | RICHIESTA | NON_APPLICABILE | null"
  },

  // ⭐ FIGURE DI SICUREZZA DELL'IMPRESA (All. XVII / modulistica standard)
  "figureSicurezza": {
    "rspp": "string|null", "medicoCompetente": "string|null",
    "rls": "string|null", "preposti": ["string"], "direttoreTecnico": "string|null",
    "direttoreCantiere": "string|null"
  },

  // ⭐ DATI ITP / ALLEGATO XVII
  "ccnlApplicato": "string|null",
  "organicoMedioAnnuo": "number|null",

  // DOCUMENTI (tipo esteso) — blob solo in variante "completa"
  "documenti": [
    {
      "tipo": "POS | DURC | CCIAA | DVR | POLIZZA_RC | DOMA | CONTRATTO_SUBAPPALTO | AUTORIZZAZIONE_SUBAPPALTO | DICH_ART14 | NOMINA_RSPP | NOMINA_MEDICO | DESIGNAZIONE_RLS | ATTESTAZIONE_BUONO_STATO | ALTRO",
      "scadenza": "YYYY-MM-DD|null",
      "filename": "string",
      "base64": "string|'' (vuoto in variante leggera — vedi §11)"
    }
  ],

  // 💡 DOCUMENTI ATTESI (guida, calcolato dal tipoRapporto — NON memorizzato, NON blocca)
  //    Logica app, documentata in §12. Es: NOLO_FREDDO → POS non atteso.

  "modifiedAt": "ISO8601", "modifiedBy": "string"
}
```

---

## 5. LAVORATORI — da store `lavoratori`

```json
{
  "id": "lav_…",
  "lotto_id": "CZ399",                       // ⭐ risale al lotto
  "impresa_id": "imp_…",                     // ⭐ ASSEGNAZIONE UNIVOCA — di QUALE impresa è (era impresaId)

  "nome": "string", "cognome": "string",
  "codiceFiscale": "string (UPPER)",
  "mansione": "string",
  "dataNascita": "YYYY-MM-DD", "luogoNascita": "string",
  "telefono": "string", "email": "string",

  "attestatoFormazione": { "numero":"string","scadenza":"YYYY-MM-DD","filename":"string","base64":"§11" },
  "visitaMedica":        { "ente":"string","data":"YYYY-MM-DD","scadenza":"YYYY-MM-DD","filename":"string","base64":"§11" },
  "abilitazioni": [ { "tipo":"string","numero":"string","scadenza":"YYYY-MM-DD","filename":"string","base64":"§11" } ],
  "foto": [ { "id":"string","timestamp":"ISO8601","base64":"§11" } ],

  // ⭐ IDENTIFICAZIONE IN CANTIERE (art.26 c.8 + DL 159/2025)
  "tesseraRiconoscimento": { "presente":"boolean","filename":"string","base64":"§11" },   // art.26 c.8 — foto+generalità
  "badgeCantiere": { "codice":"string|null","presente":"boolean" },                        // DL 159/2025 / Circ. INL 1/2026 — NON sostituisce la tessera
  "ruoliSpeciali": ["PREPOSTO","ADDETTO_EMERGENZE","ADDETTO_PRIMO_SOCCORSO","RLS"],         // se incaricato (art.18)

  "modifiedAt": "ISO8601", "modifiedBy": "string"
}
```

---

## 6. MEZZI — da store `mezzi` (mezzi semoventi/sollevamento)

```json
{
  "id": "mzo_…",
  "lotto_id": "CZ399",                       // ⭐
  "impresa_id": "imp_…",                     // ⭐ ASSEGNAZIONE UNIVOCA all'impresa proprietaria/utilizzatrice

  "tipologia": "GRU | ESCAVATORE | AUTOCARRO | PLE | …",
  "marca": "string", "modello": "string",
  "matricola": "string (UPPER)", "numeroSerie": "string (UPPER)", "anno": "number|null",
  "presenteInCantiere": "boolean",

  // ⭐ se il mezzo è a nolo, collegamento al record nolo (§8)
  "nolo_id": "nol_…|null",                   // null = mezzo di proprietà dell'impresa

  "libretto": { "filename":"string","base64":"§11" },
  "verifichePeriodiche": [ { "tipo":"string","data":"YYYY-MM-DD","prossima":"YYYY-MM-DD","ente":"string","filename":"string","base64":"§11" } ],
  "foto": [ { "id":"string","timestamp":"ISO8601","base64":"§11" } ],

  "modifiedAt": "ISO8601", "modifiedBy": "string"
}
```

---

## 7. ATTREZZATURE — [NUOVO] attrezzature non semoventi (utensili, opere provvisionali, DPI collettivi)

```json
{
  "id": "att_…",
  "lotto_id": "CZ399",                       // ⭐
  "impresa_id": "imp_…",                     // ⭐ ASSEGNAZIONE UNIVOCA

  "tipologia": "PONTEGGIO | TRABATTELLO | BETONIERA | COMPRESSORE | UTENSILE | DPI_COLLETTIVO | …",
  "descrizione": "string",
  "matricola": "string|null",
  "nolo_id": "nol_…|null",                   // se a nolo

  "dichiarazioneConformitaCE": { "presente":"boolean","filename":"string","base64":"§11" },
  "libretto": { "filename":"string|null","base64":"§11" },     // es. PiMUS per ponteggi
  "verifiche": [ { "tipo":"string","data":"YYYY-MM-DD","prossima":"YYYY-MM-DD","filename":"string","base64":"§11" } ],

  // ⭐ DOCUMENTI SPECIFICI PONTEGGI / OPERE PROVVISIONALI (artt.131-136, All.XXI-XXII)
  "documentiSpecifici": [
    { "tipo": "PIMUS | AUTORIZZAZIONE_MINISTERIALE | DISEGNO_ESECUTIVO | PROGETTO_PONTEGGIO | FORMAZIONE_MONTATORI | ALTRO",
      "scadenza": "YYYY-MM-DD|null", "filename": "string", "base64": "§11" }
  ],

  "modifiedAt": "ISO8601", "modifiedBy": "string"
}
```

---

## 8. NOLI — [NUOVO] contratti di noleggio (a caldo / a freddo)

```json
{
  "id": "nol_…",
  "lotto_id": "CZ399",                       // ⭐
  "impresa_utilizzatrice_id": "imp_…",       // ⭐ chi USA il nolo in cantiere (assegnazione univoca)
  "impresa_noleggiante_id": "imp_…|null",    // chi NOLEGGIA (può essere impresa esterna in anagrafica o testo)
  "noleggiante_nome": "string",              // se il noleggiante non è in anagrafica

  "tipoNolo": "FREDDO | CALDO",              // ⭐ determina obblighi (vedi §12)
  "oggetto": "string",                       // cosa è noleggiato (es. "autogru 50t")
  "mezzo_id": "mzo_…|null",                  // collega al mezzo (§6) se presente in anagrafica
  "attrezzatura_id": "att_…|null",           // o all'attrezzatura (§7)

  // NOLO A FREDDO: serve attestazione buono stato (art.72 c.2)
  "attestazioneBuonoStato": { "presente":"boolean","data":"YYYY-MM-DD|null","filename":"string","base64":"§11" },

  // NOLO A CALDO: c'è un operatore → potenziale subappalto
  "operatore": {
    "nome": "string|null",
    "lavoratore_id": "lav_…|null",           // se l'operatore è censito tra i lavoratori
    "superaSoglieSubappalto": "boolean"      // ⭐ se true → trattare come subappalto (POS, idoneità, patente)
  },

  "dataInizio": "YYYY-MM-DD|null", "dataFine": "YYYY-MM-DD|null",
  "contrattoRiferimento": "string|null",

  "modifiedAt": "ISO8601", "modifiedBy": "string"
}
```

---

## 9. PERSONE COMMITTENTE — da store `persone_anas` (rinominato concettualmente, prefisso `pc_`)

> Nota compat: in V3 lo store si chiama `persone_anas` con prefisso `pa_`. Per anonimizzazione
> (principio sez.11 SafeHub.md) il nome canonico diventa `persone_committente`. In fase di export
> V3 può mantenere `pa_` come prefisso ID se cambiare rompe troppo: decisione di migrazione, non di
> schema. Qui si fissa il NOME CANONICO; la migrazione prefisso è separata.

```json
{
  "id": "pc_…",
  "lotto_id": "CZ399",                       // ⭐ (era projectId)
  "nome": "string", "cognome": "string",
  "qualifica": "string",
  "ruolo": "RUP | DL | CSE_TITOLARE | CSE_DELEGATO | RL | ISPETTORE_CANTIERE | …",
  "matricola": "string",                     // (era matricolaAnas — generalizzato)
  "strutturaTerritoriale": "string",
  "email": "string", "telefono": "string",
  "modifiedAt": "ISO8601", "modifiedBy": "string"
}
```

---

## 10. PERSONE TERZI — da store `persone_terzi`

```json
{
  "id": "pt_…",
  "lotto_id": "CZ399",                       // ⭐
  "nome": "string", "cognome": "string",
  "qualifica": "string",
  "tipoEnte": "SPRESAL | ASL | INL | VVF | PROVINCIA | CONSULENTE | ALTRO",
  "ente": "string",
  "email": "string", "telefono": "string",
  "modifiedAt": "ISO8601", "modifiedBy": "string"
}
```

---

## 11. GESTIONE BLOB — variante leggera vs completa

Tutti i campi `base64` (documenti, foto, libretti, attestati, attestazioni, conformità CE):

- **Variante COMPLETA** (interna a SafeHub, resta sul PC del PO): `base64` pieni.
- **Variante LEGGERA** (SafeHub → SafeCant): `base64` = `""`. Si conservano `filename`, `scadenza`,
  `tipo`/metadati. SafeCant sul campo non ha bisogno dei PDF: gli serve sapere CHI/COSA c'è e le
  scadenze. Lo schema (le chiavi) è IDENTICO: cambia solo se i base64 sono pieni o vuoti.

Il campo `variante` nell'intestazione (§2) dichiara quale delle due è il file.

---

## 12. LOGICA "GUIDA NON BLOCCA" — documenti attesi per tipoRapporto

Tabella di riferimento per la UI (mostra cosa serve, NON impedisce il salvataggio — P3):

| tipoRapporto | POS atteso | Patente crediti | Idoneità All.XVII | Note |
|---|---|---|---|---|
| APPALTO / affidataria | sì | sì | completa | + DOMA, figure sicurezza |
| SUBAPPALTO | sì | sì | completa | + contratto subappalto |
| FORNITURA_POSA | sì | sì | completa | trattata come esecutrice |
| NOLO_CALDO (sopra soglia) | sì | sì | completa | `superaSoglieSubappalto=true` → come subappalto |
| NOLO_CALDO (sotto soglia) | no | dipende | idoneità operatore | verifica operatore |
| NOLO_FREDDO | **no** | no | no | solo attestazione buono stato (art.72) |
| FORNITURA (mera) | **no** | no | no | obblighi cooperazione art.26 |
| SERVIZIO (intellettuale) | **no** | no | no | esonerato anche DUVRI |
| LAV_AUTONOMO | no (ha doc. propri) | sì (se opera in cantiere) | All.XVII p.2 | doc. diversi dall'impresa |

La UI usa questa tabella per evidenziare in VERDE i documenti pertinenti e in GRIGIO quelli non
attesi. Mai un blocco: il CSE può sempre aggiungere/omettere. Se manca un documento atteso, è un
WARNING giallo, non un errore rosso.

### 12.1 — MAPPA DOCUMENTALE COMPLETA "chi deve avere cosa"

Riferimento operativo che alimenta la logica guida-non-blocca. I documenti dipendono da COSA il
soggetto FA in cantiere, non da come si chiama (Cass. + Circ. Min. 4/2007): la stessa impresa può
essere affidataria ED esecutrice insieme, cumulando gli obblighi.

**LIVELLO IMPRESA — per tipoRapporto:**

*APPALTO (affidataria)* — Idoneità All.XVII (CCIAA, DVR, DURC 120gg, dich.art.14) + patente crediti
+ POS (solo per parti eseguite direttamente) + obblighi art.97 (verifica idoneità sub, verifica
congruenza POS esecutrici, indicazione soggetti incaricati formati) + DOMA (art.90 c.9.b) + figure
sicurezza (RSPP/MC/RLS/preposti/DT/DC) + polizza RC + nomine (RSPP, Medico, RLS).

*ESECUTRICE* — Idoneità All.XVII + patente + **POS sempre** (art.96 c.1.g) + figure sicurezza +
polizza. Riceve il PSC. NON ha obblighi di verifica-sub.

*SUBAPPALTO* — come esecutrice + contratto di subappalto + autorizzazione al subappalto del
committente; idoneità verificata dall'affidataria (art.97 c.2); POS trasmesso via affidataria→CSE
(art.101 c.3).

*NOLO_FREDDO* (senza operatore) — mera locazione, MAI subappalto. **No POS, no idoneità All.XVII.**
Solo: attestazione buono stato conservazione/efficienza (art.72 c.2) + conformità attrezzatura +
documenti del mezzo (§3 sotto).

*NOLO_CALDO* (con operatore) — governato da `superaSoglieSubappalto`:
  • SOPRA soglia → trattare come SUBAPPALTO (POS, idoneità, patente, contratto).
  • SOTTO soglia → attestazione buono stato (come freddo) + documenti dell'OPERATORE (formazione,
    abilitazione al mezzo, idoneità sanitaria) + attestazione istruzione sui rischi del cantiere.

*FORNITURA (mera, senza posa)* — art.96 c.1-bis + art.26 c.3-bis: **esonerata da POS E da DUVRI.**
Solo scambio informazioni rischi + cooperazione/coordinamento (art.26 c.2). Nessuna idoneità,
nessuna patente. (Fornitura cls: procedura Circ. Min. 10/02/2011.)

*FORNITURA_POSA* — trattata come ESECUTRICE: POS + idoneità + patente. Discriminante: se mette in
opera/recupera in opera → esecutrice; se solo scarica → mera fornitura.

*SERVIZIO (intellettuale)* — art.26 c.3-bis: esonerato anche da DUVRI. Verifica minima: qualifica,
eventuale polizza. Fuori Titolo IV se non comporta lavori edili.

*LAV_AUTONOMO* — documenti propri (All.XVII p.2): iscrizione CCIAA, conformità macchine/attrezzature,
elenco DPI, attestati formazione + idoneità sanitaria (ove previsti), DURC, patente crediti (se opera
fisicamente), tessera riconoscimento (art.21 c.1.c). NON redige POS.

**LIVELLO LAVORATORE — per persona (assegnata a `impresa_id`):**
Attestato formazione generale+specifica (aggiornamento quinquennale, art.37); attestato preposto se
preposto (aggiornamento biennale dal 2022); abilitazioni specifiche (carrellista/gruista/PLE/
ponteggi, art.73 c.5); idoneità sanitaria (art.41); tessera riconoscimento foto (art.26 c.8); badge
di cantiere (DL 159/2025, NON sostituisce la tessera); nomine ruoli speciali (art.18).
Nota 2026: libretto formativo → fascicolo elettronico del lavoratore (SIISL).

**LIVELLO MEZZO/ATTREZZATURA — per bene (assegnato a `impresa_id`):**
  • SOLLEVAMENTO (gru, autogru, PLE, argani/paranchi >200kg, montacarichi): conformità CE + libretto/
    manuale + matricola INAIL (portale CIVA) + **verifiche periodiche** (1ª INAIL poi soggetto
    abilitato; periodicità annuale/biennale/triennale per All.VII, art.71 c.11, D.M.11/04/2011) +
    registro controlli + indagine supplementare se >20 anni.
  • NON sollevamento (betoniere, compressori, utensili): conformità CE + libretto + registro manut.
  • PONTEGGI/opere provvisionali: PiMUS (art.136, All.XXII) + autorizzazione ministeriale + libretto
    + disegno esecutivo (progetto se >24m o config. non standard) + formazione montatori (All.XXI).

### 12.2 — MATRICE SINOTTICA documento × soggetto

| Documento ↓ / Soggetto → | Affid. | Esec. | Subapp. | NoloFreddo | NoloCaldo>s | NoloCaldo<s | MeraForn. | Forn.Posa | Lav.Auton. |
|---|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|
| Iscrizione CCIAA | ✅ | ✅ | ✅ | — | ✅ | ○ | ○ | ✅ | ✅ |
| DVR | ✅ | ✅ | ✅ | — | ✅ | — | — | ✅ | — |
| DURC (120gg) | ✅ | ✅ | ✅ | — | ✅ | ○ | — | ✅ | ✅ |
| Dich. art.14 | ✅ | ✅ | ✅ | — | ✅ | — | — | ✅ | — |
| Patente crediti | ✅ | ✅ | ✅ | — | ✅ | ○ | — | ✅ | ✅ |
| POS | ✅* | ✅ | ✅ | — | ✅ | — | — | ✅ | —** |
| Contratto + autoriz. subappalto | — | — | ✅ | — | ✅ | — | — | — | — |
| DOMA | ✅ | ✅ | ✅ | — | ✅ | — | — | ✅ | — |
| Polizza RC | ✅ | ✅ | ✅ | ○ | ✅ | ○ | ○ | ✅ | ○ |
| Attestazione buono stato (art.72) | — | — | — | ✅ | — | ✅ | — | — | — |
| Doc. operatore (form.+abilit.+sanit.) | — | — | — | — | ✅ | ✅ | — | — | ✅ |
| Figure sicurezza + nomine | ✅ | ✅ | ✅ | — | ✅ | — | — | ✅ | — |

Legenda: ✅ atteso · ○ eventuale/su richiesta · — non atteso · * solo parti eseguite direttamente ·
** lav. autonomo: documenti propri All.XVII p.2, non POS.

La matrice è la sorgente diretta della UI: verde (atteso) / giallo (atteso ma mancante = warning) /
grigio (non pertinente). Mai rosso bloccante — il CSE resta sovrano (P3).

---

## 13. RIEPILOGO MODIFICHE vs SCHEMA V1.0 / CODICE V3

**Strutturali:**
- `projectId` → `lotto_id` ovunque (ID primario esplicito, gerarchia a cascata)
- `impresaId` → `impresa_id` (assegnazione univoca, leggibilità)
- Nuove collezioni: `attrezzature[]`, `noli[]`
- `persone_anas` → `persone_committente` (anonimizzazione; migrazione prefisso separata)

**Conformità normativa (nuovi campi imprese):**
- `tipoRapporto` (tassonomia 8 categorie) — la più importante
- `patenteCrediti` (D.M. 132/2024)
- `figureSicurezza` (RSPP/MC/RLS/preposti/DT/DC)
- `ccnlApplicato`, `organicoMedioAnnuo` (DOMA art.90)
- `documenti[].tipo` esteso (POLIZZA_RC, DOMA, CONTRATTO_SUBAPPALTO, AUTORIZZAZIONE_SUBAPPALTO,
  DICH_ART14, NOMINA_RSPP, NOMINA_MEDICO, DESIGNAZIONE_RLS, ATTESTAZIONE_BUONO_STATO)

**Conformità normativa (lavoratori e attrezzature):**
- `lavoratori`: `tesseraRiconoscimento` (art.26 c.8), `badgeCantiere` (DL 159/2025), `ruoliSpeciali`
- `attrezzature`: `documentiSpecifici[]` per ponteggi (PiMUS, autorizzazione ministeriale, ecc.)

**Mappa documentale incorporata (§12.1-12.2):** "chi deve avere cosa" per ogni soggetto, con matrice
sinottica documento×soggetto come sorgente diretta della UI guida-non-blocca.

**Infrastruttura:**
- `schema_version: "2.0"` + `variante` (leggera/completa)
- Blob estratti in variante leggera per SafeCant

**Conservato da V3 (compat):** tutti i campi esistenti restano; `ruolo` convive con `tipoRapporto`.

---

## 14. COSA SERVE COSTRUIRE (lavoro, non correzione)

1. **Funzione export anagrafica** in SafeHub V3 (oggi NON esiste — c'è solo `salvaImprese()` che fa
   1/6). Legge i 6→8 store per `lotto_id`, monta l'oggetto, svuota base64 (variante leggera), scrive
   `anagrafica_<lotto>_<data>.json`.
2. **UI nuovi campi** imprese (tipoRapporto, patente, figure sicurezza) + nuove sezioni
   (attrezzature, noli) — guida non bloccante.
3. **Logica documenti-attesi** (§12) come supporto visivo.
4. **Lato SafeCant**: import che legge le 8 collezioni e popola gli agganci del verbale
   (`cantiere_id`←lotto, `presenti[].anagrafica_ref`←lavoratori/persone, `impresa_id`).

---

*Schema canonico v2.0. Fonti normative: D.Lgs 81/2008 (artt. 18, 21, 26, 37, 41, 71, 72, 73, 89, 90,
92, 94, 96, 97, 101, 131, 133, 136; All. VII, XV, XVII, XXI, XXII); D.M. 132/2024 (patente crediti);
D.M. 11/04/2011 (verifiche periodiche attrezzature); DL 159/2025 + Circ. INL 1/2026 (badge cantiere);
Circ. Min. 4/2007 (mere forniture). Verificato sul codice V3 reale il 31/05/2026.
Principio guida: lo schema GUIDA, non BLOCCA.*
