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
| `v0.7.0-proposta-sospensione`  | `9f00812` | **M13 Proposta Sospensione + M6 tipografia**, collaudato |
| `v0.8.0-disposizione-rl`       | `6bea1a0` | **M15 Disposizione RL + menu riorganizzato**, collaudato |

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
| **M6** Motore DOCX | COMPLETO | v0.8.0 | HTML+DOCX; tipografia data-*; interlinea editor; vendor/ locale |
| **Verbale Riunione** | COMPLETO | v0.8.0 | Pilota Flusso B — firme 3 blocchi, protocollati, interlinea editor |
| **M13 Proposta Sospensione** | COMPLETO | v0.8.0 | Lettera art.92 c.1 lett.e — destinatari, PROPONE+caselle, firma CSE |
| **M15 Disposizione RL** | COMPLETO | v0.8.0 | Lettera RL Mod.RE.01-15 — tabella amm., VISTO/DISPONE, firme upload |

#### 3 documenti Flusso B completati (v0.8.0)
- **Verbale di Riunione** (Mod.RE.01-10): tabella dati/presenti, argomenti, firme 3 blocchi
- **Proposta di Sospensione CSE** (Mod.RE.01-14): lettera formale al RL
- **Disposizione RL** (Mod.RE.01-15): gemella della Proposta, firma RL + Visto (GoSign esterno)

Tutti condividono il pattern pilota: ciclo BOZZA→FINALIZZATO→PROTOCOLLATO, vista Protocollati toggle+link FSA, auto-save, editor ricco, attributi tipografici M6, promemorio normativo UI-only.

### 🔧 INFRASTRUTTURA

| Componente | Stato | Note |
|---|---|---|
| SW dev-off/prod-on | ✅ | localhost = no SW (IS_DEV); SW v24 su GitHub Pages |
| Server locale no-cache | ✅ | `avvia.sh` + `server.py` con Cache-Control: no-store |
| GitHub Pages | ✅ | `_config.yml` con `exclude:` per docs/moduli/shared (fix Jekyll) |
| Menu | ✅ | Operatività = documenti prodotti; Documentazione = solo Conformità Documenti |
| cantieri-service.js | ✅ | `aggiornaDatiLotto()` ricarica `ANAGRAFICA_SERVICE` dopo ogni salvataggio |

---

## ⬜ PROSSIMI PASSI (per la prossima sessione)

### (a) FATTORIZZAZIONE shared/flusso-b-helpers.js ← ORA CHE CI SONO 3 DOCUMENTI
Con Verbale, Proposta e Disposizione costruiti, è il momento di estrarre le utility comuni:
- `_scalafirma` / `_ritagliaCanvas` / `_ptCanvas` — gestione firme canvas
- `FirmaCanvas` Alpine component — canvas firma riusabile
- `_serEditor` / `_editorFromHtml` — serializzatore/loader editor ricco
- `_leggiBase64` / `_scriviFile` — utility filesystem
- `_applicaInterlinea15` — helper interlinea testi editor
- Classe/helper ciclo protocollati (`_caricaProtocollati`, `apriFileProt`, `salvaProtocollo`)

**Beneficio**: eliminare la duplicazione copia-incolla che ha causato regressioni. Con le utility in un punto solo, le future correzioni si propagano a tutti i documenti automaticamente.
**Metodo**: test di non-regressione su tutti e 3 i documenti prima e dopo la fattorizzazione.
**REGOLA**: applicare la regola anti-regressione: punti fermi espliciti + verifica automatica prima di consegnare.

### (b) Flusso B — prossimi documenti
- **M14 Non Conformità** — ciclo speciale APERTA→IN-RISOLUZIONE→CHIUSA + scadenza monitorata; nasce spesso da nc_drafts sopralluogo. Sblocca il TODO M14 nella Proposta (tendina NC).
- **M12 Verifica POS/ITP** — aggancio anagrafica + POS Documentale (M21)
- **M15 Evento Incidentale** — near-miss/infortuni, dati sensibili
- **M16 ODS Inviati** — speculare a ODS Ricevuti (M20, Flusso C)

### (c) Cruscotto Conformità Documenti
- Vista trasversale: impresa × documento atteso × stato (mancante/in scadenza/valido)
- Alimentato dall'anagrafica M4 (matrice documento×soggetto da schema v2.0 §12)
- Voce già presente nel menu Documentazione

### (d) SafeCant allineamento + fix
- **Fix bug nome compilatore**: redattore arriva con nome/qualifica vuoti
- **Import anagrafica**: SafeCant legge il file leggero prodotto da M4 F7
- **Chiude il giro end-to-end**: Archivio → SafeCant → Verbale

### (e) M17 Flusso C — pilota (Notifica Preliminare)
- Upload PDF + metadati (protocollo, data, lettera) — nessun motore documenti
- Sblocca poi M18-M21

### (f) M25 Cruscotto generale multi-cantiere
- Aggrega scadenze critiche di tutti i cantieri in una vista

### (g) M26 AI locale (bridge Ollama)
- 3 livelli: procedure (L1), RAG D.Lgs 81/08 (L2), contesto cantiere (L3)
- Ultimo da costruire (dipende da corpus documenti generati)

---

## NOTE TECNICHE DA RICORDARE

**REGOLA DI METODO — task di modifica (MANTENERLA SEMPRE su ogni task futuro):**
Ogni task che modifica codice esistente DEVE includere:
1. **Punti fermi espliciti** — lista di ciò che NON deve essere toccato
2. **Verifica anti-regressione** — Claude Code esegue test automatici prima di consegnare e riporta l'esito punto per punto
3. **Modifiche chirurgiche** — interviene solo sulle righe strettamente necessarie, NON rigenera blocchi interi
Motivazione: le regressioni sono state causate da rigenerazioni che riportavano indietro correzioni già fatte. Questa regola le ha eliminate.

**Menu (v0.8.0):**
- **Operatività** = documenti che il PO PRODUCE (Verbale Riunione, Proposta Sospensione, Disposizione RL, Verifica POS/ITP, Sospensioni RL, Verbali Sopralluogo-in attesa)
- **Documentazione** = solo Conformità Documenti (cruscotto monitoraggio, non un documento prodotto)
- Principio: vista ≠ documento, coerente con le decisioni architetturali

**Pattern Flusso B (3 documenti completati):**
- Componente Alpine a tab, no service separato
- Auto-save debounce 8s + indicatore stato
- `generaCorpoHtml<Tipo>()` pura async → M6 per HTML+DOCX
- Firma integrata nel record presenza (no desincronizzazione)
- `<table data-border="none">` + `<td data-align="center">` per firme verbale
- `_scalafirma(src, 210, 80)`: canvas fisso per firme uniformi
- Storage: `<NN>_<Categoria>/Bozze/<uuid>.json` + `Protocollati/<numero>.json`
- Vista Protocollati: toggle, auto-switch dopo protocollazione, `apriFileProt()` FSA
- **Firma CSE/RL**: usa SOLO `nome_cognome` nel corpo (ruolo va in intestazione)
- **Titolo modulo**: `_intestazione<X>()` con `bad Set` override chiavi tecniche e placeholder
- **`_applicaInterlinea15(html)`**: aggiunge data-line=15 ai <p> dell'editor ricco

**M6 tipografia (contratto attributi):**
- `data-line="15"` → line=360 auto (1,5 righe) — testi narrativi
- `data-line="exact280"` → line=280 exact — righe oggetto compatte
- `data-indent="elenco"` → w:ind left=567 hanging=283 — voci ☑/☐
- `data-indent="destra"` → w:ind left=5529 — blocco destinatari a destra
- `data-indent="firma"` → w:ind left=5670 — firma a destra
- `data-before/after` (twip) → spacing tra sezioni
- default: line=276 auto (non-compresso); h3: before=200 after=80

**Schema anagrafica:**
- Campo: `direttoreOperativoId` (non `cseDelegatoId`) — correzione normativa 01/06/2026
- Migrazione soft attiva in `ANAGRAFICA_SERVICE.carica()` e `cantieri-service.js`
- Fonte canonica: `@docs/schema-anagrafica-canonico-v2.md`

**Drawer pattern:**
- Usare classi `.drawer/.drawer-header/.drawer-body/.drawer-footer` (in styles.css)
- MAI `display:flex` negli inline style: Alpine `x-show` lo cancella (bug noto, risolto)

**Service Worker:**
- Su localhost: **DISATTIVATO** (IS_DEV in alpine-init.js). F5 = sempre file freschi.
- Server locale: `avvia.sh` usa `server.py` con `Cache-Control: no-store`

---

*Aggiornato al 02/06/2026 — v0.8.0 taggato. 3 documenti Flusso B completi. Menu riorganizzato. Regola di metodo anti-regressione mantenuta.*
