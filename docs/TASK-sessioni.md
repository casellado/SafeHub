# TASK — Stato di avanzamento SafeHub Archivio
## Documento di sessione · aggiornato 02 giugno 2026

> Riferimento rapido per rientrare nel contesto a inizio sessione.
> Per il design completo: `@docs/00-INDICE-Biblioteca-SafeHub.md`.
> Per schema dati: `@docs/schema-anagrafica-canonico-v2.md` (canonico, aggiornato).

---

## PUNTI DI RIPRISTINO (tag Git)

| Tag | Commit | Contenuto |
|---|---|---|
| `v0.4.0-anagrafica-lavoratori` | `e0f9332` | M1-M3 + M4 F1-F2, drawer condiviso |
| `v0.5.0-anagrafica-completa`   | `1944bfd` | **M4 completo F1-F7**, aggancio SafeCant chiuso |
| `v0.6.0-verbale-riunione`      | `f7d1227` | **M6 + Verbale Riunione (pilota Flusso B)**, collaudato |

Per tornare a un punto: `git checkout <tag>` (detached HEAD, sola lettura).
Per sviluppare da un punto: `git checkout -b nome-branch <tag>`.

---

## STATO MODULI

### ✅ COMPLETATI E COLLAUDATI

| Modulo | Fase | Tag/commit | Note |
|---|---|---|---|
| **M1** Fondazione | — | v0.4.0 | PWA, FSA, IDB, cantiere corrente, shell |
| **M2** Impostazioni | — | v0.4.0 | Identità CSE, firma PNG, logo, codici moduli, soglie scadenza |
| **M3** Gestione Cantieri | — | v0.4.0 | Scaffolding 16 cartelle, cruscotto, scheda lotto + ruoli FK |
| **M4** Anagrafica | COMPLETO | v0.5.0 | Tutte e 7 le fasi; export SafeCant (variante leggera) |
| **M6** Motore DOCX | COMPLETO | v0.6.0 | HTML+DOCX; no-border/align tables; vendor/ locale; test-m6.html |
| **Verbale Riunione** | COMPLETO | v0.6.0 | Pilota Flusso B — vedi dettaglio sotto |

#### Dettaglio Verbale di Riunione (pilota Flusso B)
- Layout fedele al Mod.RE.01-10 ANAS: intestazione righe testo, tabella dati/tipo/presenti, argomenti, criticità, decisioni
- Firme: 3 blocchi affiancati (committente | imprese | CSE), canvas fisso 210×80px, no bordi, centrate
- Editor ricco (grassetto/corsivo/allineamento) sui campi narrativi
- Promemoria normativo UI-only (non entra nel DOCX)
- Auto-save debounce 8s + indicatore stato
- Ciclo completo BOZZA→FINALIZZATO_DA_PROTOCOLLARE→PROTOCOLLATO
- Vista Protocollati con link FSA per aprire PDF/lettera archiviati
- Pre-popolamento intestazione da `ANAGRAFICA_SERVICE.carica()` (dati freschi)
- Storage: `02_Verbali-Riunione/Bozze/` + `Protocollati/`

### 🔧 INFRASTRUTTURA

| Componente | Stato | Note |
|---|---|---|
| SW dev-off/prod-on | ✅ | localhost = no SW (IS_DEV); SW v22 su GitHub Pages |
| Server locale no-cache | ✅ | `avvia.sh` + `server.py` con Cache-Control: no-store |
| Drawer centralizzato | ✅ | `.drawer/.drawer-body` ecc. in styles.css |
| Firma autore | ✅ | "by — Geom. Dogano Casella" in sidebar |
| GitHub Pages | ✅ | https://casellado.github.io/SafeHub/ |
| cantieri-service.js | ✅ | `aggiornaDatiLotto()` ricarica `ANAGRAFICA_SERVICE` dopo ogni salvataggio |

---

## ⬜ PROSSIMI PASSI (per la prossima sessione)

### (a) Flusso B — variazioni del pilota Verbale di Riunione
Il pilota è completo. I prossimi documenti riusano lo stesso pattern (BOZZA→FINALIZZATO→PROTOCOLLATO + M6), cambia solo il `generaCorpoHtml<Tipo>()` e il modello dati specifico.
Ordine consigliato (dal design `@docs/FlussoB-Documenti-Prodotti-M12-M16.md`):
- **M13 Proposta Sospensione CSE** — simile al verbale, 2 fattispecie (lett.e e lett.f)
- **M14 Non Conformità** — ciclo speciale APERTA→IN-RISOLUZIONE→CHIUSA + scadenza monitorata; nasce spesso da nc_drafts sopralluogo
- **M15 Evento Incidentale** — near-miss/infortuni, dati sensibili
- **M16 ODS Inviati** — speculare a ODS Ricevuti (M20, Flusso C)
- **M12 Verifica POS/ITP** — aggancio anagrafica + POS Documentale (M21)

### (b) SafeCant allineamento + fix
- **Fix bug nome compilatore**: redattore arriva con nome/qualifica vuoti (causa: identità configurata sul device)
- **Import anagrafica**: SafeCant deve leggere il file leggero prodotto da M4 F7 (`SafeHub-Anagrafiche/`)
- **Chiude il giro end-to-end**: Archivio produce anagrafica → SafeCant importa → ispettore seleziona imprese/lavoratori
- Design: `@docs/SafeHub.md §5.2`

### (c) M17 Flusso C — pilota (Notifica Preliminare)
- Upload PDF + metadati (protocollo, data, lettera) — nessun motore documenti
- Pattern semplice: cruscotto con apri/stampa/download
- Sblocca poi M18-M21 (variazioni) — design: `@docs/M17-Notifica-Preliminare-FlussoC.md`

### (d) M25 Cruscotto generale multi-cantiere
- Aggrega scadenze critiche di tutti i cantieri in una vista
- Dipende da cantieri reali popolati — rimandato a dopo (b)
- Design: `@docs/Moduli-Supporto-M23-M26.md`

### (e) M26 AI locale (bridge Ollama)
- 3 livelli: procedure (L1), RAG D.Lgs 81/08 (L2), contesto cantiere (L3)
- Dipende da corpus di documenti generati (Flusso B/C) — ultimo da costruire
- Design: `@docs/Moduli-Supporto-M23-M26.md`

---

## NOTE TECNICHE DA RICORDARE

**Schema anagrafica:**
- Campo: `direttoreOperativoId` (non `cseDelegatoId`) — correzione normativa 01/06/2026
- Migrazione soft attiva in `ANAGRAFICA_SERVICE.carica()` e `cantieri-service.js`
- Fonte canonica: `@docs/schema-anagrafica-canonico-v2.md`

**Drawer pattern:**
- Usare classi `.drawer/.drawer-header/.drawer-body/.drawer-footer` (in styles.css)
- MAI `display:flex` negli inline style: Alpine `x-show` lo cancella (bug noto, risolto)
- Backdropclick per chiudere: `<div class="drawer-backdrop" @click="chiudi()">`

**Service Worker:**
- Su localhost: **DISATTIVATO** (IS_DEV in alpine-init.js). F5 = sempre file freschi.
- Server locale: `avvia.sh` usa `server.py` con `Cache-Control: no-store`
- Su GitHub Pages: SW v22 attivo, aggiornamento automatico via `controllerchange`

**Pattern pilota Flusso B (dal Verbale Riunione):**
- Componente Alpine a tab (Dati / Presenti / Contenuti / Firme), no service separato
- Auto-save debounce 8s + indicatore stato
- `generaCorpoHtml<Tipo>()` pura async → M6 per HTML+DOCX
- Firma integrata nel record presenza (no desincronizzazione)
- `<table data-border="none">` + `<td data-align="center">` per la sezione firme
- `_scalafirma(src, 210, 80)`: canvas fisso per firme uniformi e non distorte
- Storage: `<NN>_<Categoria>/Bozze/<uuid>.json` + `Protocollati/<numero>.json`
- Vista Protocollati: toggle nella lista, `apriFileProt()` via FSA object URL

**Export SafeCant:**
- Handle `SafeHub-Anagrafiche/` in IDB key `anagrafiche_handle`
- File: `anagrafica_<cantiereId>_YYYY-MM-DD.json`
- Funzione: `ANAGRAFICA_SERVICE.esportaLeggera()` — ricorsiva, un solo passo

**Merge parziale:**
- Ogni salvataggio M4 tocca SOLO la collezione indicata (`salvaCollezione('imprese', ...)`)

**"Operatività" = raggruppamento di MENU, non struttura dati (02/06/2026):**
- "Metti in Operatività" = voce di menu. Cartelle e pattern di salvataggio NON cambiano.

**Firme nel Verbale (02/06/2026):**
- In SafeHub TUTTI i firmatari: canvas O upload PNG (firma differita ammessa)
- Possibilità futura (non ora): tracciare canvas vs upload per valore probatorio

---

*Aggiornato al 02/06/2026 — v0.6.0 taggato. M6 + Verbale Riunione completi e collaudati.*
