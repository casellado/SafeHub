# SCHEMA DATI COMPLETO — SafeHub
## Dove vive ogni cosa e in che forma · v1.0 · 31 maggio 2026

> **Cosa è questo documento.** Il riferimento unico dello schema dati di tutto l'ecosistema SafeHub.
> Mette insieme, in un solo posto, le strutture dati sparse nei documenti di progetto: gli store
> IndexedDB (cache), la struttura file/cartelle (il vero "DB" del modello file=stato), lo schema
> anagrafica, e i metadati dei documenti per ogni flusso. Serve a Claude Code (e al PO) per sapere
> **dove vive ogni cosa e chi è canonico**, senza ricomporre da quattro fonti.

> **Principio cardine — file = stato.** SafeHub NON ha un database centrale. La fonte di verità sono i
> **file JSON/PDF in OneDrive**. IndexedDB è SOLO cache di indicizzazione, sempre rigenerabile dai
> file. Questa è la chiave di lettura di tutto il documento: ogni volta che leggi "store IDB", pensa
> "indice veloce", non "dato". Il dato è il file.

---

## 1. I TRE LIVELLI DELLO "SCHEMA DATI"

| Livello | Cos'è | Canonico? | Dove documentato in origine |
|---|---|---|---|
| **A. File/cartelle OneDrive** | i file JSON/PDF nelle 16 cartelle per cantiere | ✅ **SÌ — fonte di verità** | contratto tecnico §3 |
| **B. Schema anagrafica** | le 8 collezioni dentro `anagrafica_<id>.json` | ✅ sì (è un file) | `schema-anagrafica-canonico-v2.md` |
| **C. IndexedDB** | store di cache per ricerca/scadenze rapide | ❌ no — cache rigenerabile | contratto tecnico §5 (SafeCant) e §6 (Archivio) |

Regola: se A e C divergono, **vince A**. C si rigenera da A con `rigeneraIndice()` (M1).

---

## 2. LIVELLO A — STRUTTURA FILE/CARTELLE (il "DB" reale)

### 2.1 Radici OneDrive (mono-direzionali, contratto §2)
```
SafeHub-CSE-Lavori/        [privata PO]   ← tutti i cantieri + _config
SafeHub-Anagrafiche/       [PO scrive, colleghi leggono]   ← snapshot anagrafica per SafeCant
SafeHub-Verbali-Ricevuti/  [colleghi scrivono, PO legge]   ← verbali da SafeCant (+ _presi-in-carico/)
SafeHub-Foto-Sopralluoghi/ [colleghi scrivono, PO legge]   ← foto sopralluogo
```

### 2.2 Struttura per cantiere (16 cartelle, contratto §3)
```
SafeHub-CSE-Lavori/<cantiere>/
├── 01_Verbali-Sopralluogo/      (Bozze/ + Finalizzati/)        FLUSSO A
├── 02_Verbali-Riunione/         (Bozze/ + Protocollati/)       FLUSSO B
├── 03_Verifiche-POS/            (Bozze/ + Protocollati/)       FLUSSO B (POS+ITP)
├── 04_Proposte-Sospensione-CSE/ (Bozze/ + Protocollati/)       FLUSSO B
├── 05_Non-Conformita/           (Aperte/ In-Risoluzione/ Chiuse/)  FLUSSO B (tri-stato)
├── 06_Eventi-Incidentali/       (Bozze/ + Finalizzati/)        FLUSSO B
├── 07_ODS-Inviati/              (cartella unica)               FLUSSO B
├── 08_Diario-CSE/               (voci per data)                SUPPORTO
├── 09_Registro-PSC/             (cartella unica)               SUPPORTO
├── 10_Notifica-Preliminare/     (Originale/ + Aggiornamenti/)  FLUSSO C
├── 11_Verifiche-Enti-Esterni/   (cartella unica)               FLUSSO C
├── 12_Disposizioni-Sospensioni-RL/ (cartella unica)            FLUSSO C
├── 13_ODS-Ricevuti/             (cartella unica)               FLUSSO C
├── 14_POS-Documentale/          (per impresa)                  FLUSSO C
├── 15_Anagrafica/               (anagrafica_<id>.json)         DATI (livello B)
└── 16_Foto/                     (foto del cantiere)            SUPPORTO
```

### 2.3 Sottocartelle speciali (contratto §3.2)
- `_config/` (in SafeHub-CSE-Lavori): `impostazioni-archivio.json` (M2).
- `_archivio/` (in SafeHub-Anagrafiche): versioni vecchie di anagrafica.
- `_presi-in-carico/` (in SafeHub-Verbali-Ricevuti): verbali già importati da Archivio.

---

## 3. LIVELLO B — SCHEMA ANAGRAFICA (sintesi; dettaglio nel suo documento)

> Fonte di verità completa: `schema-anagrafica-canonico-v2.md`. Qui solo la mappa, per completezza.

File unico per lotto `anagrafica_<id>.json`, `schema_version: "2.0"`, `variante: leggera|completa`.
Otto collezioni sotto il lotto:
```
lotto (id primario + ruoli_istituzionali FK→persone_committente)
├── imprese[]            (tipoRapporto, patenteCrediti, figureSicurezza, organicoMedioAnnuo, documenti[])
├── lavoratori[]         (impresa_id, formazione, visitaMedica, abilitazioni, tessera, badge)
├── mezzi[]              (impresa_id, nolo_id?, verifichePeriodiche[])
├── attrezzature[]       (impresa_id, nolo_id?, documentiSpecifici[] es. PiMUS)
├── noli[]               (impresa_utilizzatrice_id, caldo/freddo, superaSoglieSubappalto)
├── persone_committente[] (pc_, ruolo: RUP/RL/CSE/DL/DO/ISPETTORE_CANTIERE)
└── persone_terzi[]      (ASL, INL, VVF, consulenti)
```
Principi: P1 cascata (id=lotto) · P2 assegnazione univoca all'impresa · P3 guida-non-blocca · P4
conformità incorporata · P5 compatibilità. Variante leggera = blob base64 svuotati (per SafeCant).

---

## 4. LIVELLO C — INDEXEDDB (cache, rigenerabile)

### 4.1 IDB Archivio — `safehub_archivio_db` (contratto §6)
| Store | keyPath | Indici | Scopo |
|---|---|---|---|
| `cantieri_cache` | `cantiere_id` | attivo, ultimo_aggiornamento_at | elenco cantieri |
| `documenti_indice` | `id_documento` | cantiere_id, tipo_documento, stato, data_documento, path_file (unique) | ricerca documenti |
| `verbali_ricevuti_inbox` | `id` | cantiere_id, stato_lavorazione, ricevuto_at | inbox Flusso A (M7) |
| `impostazioni_archivio` | `key` | — | cache di `_config/impostazioni-archivio.json` (M2) |
| `cache_anagrafica` | `cantiere_id` | — | anagrafica per ricerche/scadenze (M4, M25) |

### 4.2 IDB SafeCant — (contratto §5)
| Store | keyPath | Indici | Scopo |
|---|---|---|---|
| `verbali` | `id` | cantiereId, data_sopralluogo, stato, created_at | verbali di sopralluogo locali |
| `anagrafica_corrente` | `cantiereId` | data_versione | anagrafica importata (variante leggera) |
| `impostazioni_utente` | `key` | — | config del sopralluoghista (singleton `key:"current"`) |
| `coda_invio` | `verbale_id` | stato, ultimo_tentativo_at | coda invio verso OneDrive |

> Nota: gli store IDB sono **cache**. Persi, si rigenerano: Archivio da OneDrive (`rigeneraIndice()`),
> SafeCant dai propri verbali locali. Mai trattare l'IDB come fonte di verità.

---

## 5. METADATI DEI DOCUMENTI PER FLUSSO

### 5.1 Flusso A — Verbale di Sopralluogo (file di interscambio SafeCant)
JSON con: `schema_version`, `tipo_file`, `generato_da*`, `id_locale_verbale`, `metadati` (cantiere_id,
data, oggetto, meteo, progressiva), `redattore` (nome, qualifica, firma_png_base64, tipo_firma),
`presenti[]` (nome, qualifica, impresa, impresa_id, firmato, firma_png, rifiuto_firma, motivo),
`imprese_presenti[]`, `nc_drafts[]`, `campi_testuali`, `corpo_html`. In Archivio si aggiunge la
**controfirma CSE** (da M2) prima della finalizzazione. Vedi `FlussoA-Operativita-Sopralluogo-M7-M10.md`.

### 5.2 Flusso B — documenti prodotti dal PO (ciclo bozza→protocollato)
Record JSON con (dal pilota Verbale Riunione): `id` (UUID in Bozze/), `tipo`, `cantiere_id`, `stato`
(BOZZA/FINALIZZATO_DA_PROTOCOLLARE/PROTOCOLLATO), `numeroProgressivo` (null finché bozza),
`dataFinalizzazione`, dati specifici del documento, `corpo_html`, e — a protocollazione — `protocollo`
(numero, data, file PDF protocollato, lettera trasmissione). Archivia il PDF protocollato, non il DOCX.
Eccezione NC: stato `aperta/in-risoluzione/chiusa` + `scadenza_risoluzione`. Vedi `FlussoB-...M12-M16.md`.

### 5.3 Flusso C — documenti ricevuti (upload + metadati)
Terna documento PDF + `.meta.json` + eventuale `.lettera.pdf`. Meta: `tipo`, `cantiere_id`,
`protocollo`, `data_protocollo`, `data_ricezione`, `oggetto`, `mittente`, `ha_lettera_trasmissione`,
`file_documento`, `file_lettera`, `note`. Campi extra per modulo (es. M21 POS: `impresa_id`,
`revisione_pos`; M18 Verifiche Enti: `ente`, `esito`, `scadenza_adempimento`). Vedi `FlussoC-...M17`/`M18-M21`.

### 5.4 Formato firme (comune, contratto §)
Tutte le firme, nei file JSON e negli store IDB, usano lo stesso formato: `data:image/png;base64,...`
(PNG, preferibilmente sfondo trasparente), con `timestamp_firma` ISO8601 e `tipo_firma`.

---

## 6. MAPPA CANONICO vs CACHE (la chiave di tutto)

```
CANONICO (fonte di verità)              CACHE (rigenerabile)
─────────────────────────               ────────────────────
File JSON/PDF in OneDrive          →     store IndexedDB
anagrafica_<id>.json (livello B)   →     cache_anagrafica
file documenti nelle 16 cartelle   →     documenti_indice
struttura cartelle                 →     cantieri_cache
_config/impostazioni-archivio.json →     impostazioni_archivio
```
Se la cache si perde o diverge: `rigeneraIndice()` ricostruisce tutto dai file. I file restano leggibili
anche senza l'app (JSON/PDF in chiaro) — resilienza per dati a valore legale.

---

## 7. STATO DELLO SCHEMA DATI

✅ **Completo.** Tutti i livelli sono documentati:
- Livello A (file/cartelle): contratto §2-3, qui §2.
- Livello B (anagrafica): `schema-anagrafica-canonico-v2.md`, qui §3.
- Livello C (IDB): contratto §5-6, qui §4.
- Metadati documenti per flusso: nei design di flusso, qui §5 in sintesi.

Questo documento è la **vista unica**; per il dettaglio di ciascun livello, la fonte è il documento citato.

---

## 8. PROSSIMI PASSI

1. Il PO rivede questa vista unica.
2. È il riferimento dati per i prompt di costruzione: ogni modulo, costruendo, sa da qui dove leggere/
   scrivere (quale file canonico) e quale store IDB aggiornare (cache).
3. Con questo, lo schema dati di SafeHub è consolidato in un solo posto.

---

*Schema Dati Completo v1.0 — 31 maggio 2026. Vista unica dei tre livelli: file/cartelle (canonico),
anagrafica (canonico), IndexedDB (cache). Principio: file = stato, IDB = indice rigenerabile. Per il
dettaglio, le fonti sono il contratto tecnico e lo schema anagrafica v2.0.*
