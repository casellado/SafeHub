# TASK — Stato di avanzamento SafeHub Archivio
## Documento di sessione · aggiornato 03 giugno 2026

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
| `v0.9.0-verifiche-pos-itp`     | `ec0e03e` | **M12 Verifica POS + M-ITP Verifica ITP (5° doc)**, collaudato |

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
| **M6** Motore DOCX | COMPLETO | v0.9.0 | HTML+DOCX; tipografia data-*; interlinea editor; vendor/ locale |
| **Verbale Riunione** | COMPLETO | v0.9.0 | Pilota Flusso B — firme 3 blocchi, protocollati, interlinea editor |
| **M13 Proposta Sospensione** | COMPLETO | v0.9.0 | Lettera art.92 c.1 lett.e — destinatari, PROPONE+caselle, firma CSE |
| **M15 Disposizione RL** | COMPLETO | v0.9.0 | Lettera RL Mod.RE.01-15 — tabella amm., VISTO/DISPONE, firme upload |
| **M12 Verifica POS** | COMPLETO | v0.9.0 | Mod.RE.01-5 — DICHIARA radio, note sempre, 3 firme (CSE+Visti) |
| **M-ITP Verifica ITP** | COMPLETO | v0.9.0 | Mod.RE.01-13 — firma RL, checklist 4 blocchi, non pertinente |

#### 5 documenti Flusso B completati (v0.9.0)
- **Verbale di Riunione** (Mod.RE.01-10): tabella dati/presenti, argomenti, firme 3 blocchi
- **Proposta di Sospensione CSE** (Mod.RE.01-14): lettera formale al RL art.92 c.1 lett.e
- **Disposizione RL** (Mod.RE.01-15): gemella della Proposta, firma RL + Visto (GoSign esterno)
- **Verifica POS** (Mod.RE.01-5): DICHIARA con esito radio (idoneo/integ/non idoneo), note sempre
- **Verifica ITP** (Mod.RE.01-13): firma RL ex art.90 c.9+All.XVII, checklist 4 blocchi con "non pertinente"

Tutti condividono il pattern pilota: ciclo BOZZA→FINALIZZATO→PROTOCOLLATO, vista Protocollati toggle+link FSA, auto-save, editor ricco, attributi tipografici M6, promemorio normativo UI-only.

### 🔧 INFRASTRUTTURA

| Componente | Stato | Note |
|---|---|---|
| SW dev-off/prod-on | ✅ | localhost = no SW (IS_DEV); SW v26 su GitHub Pages |
| Server locale no-cache | ✅ | `avvia.sh` + `server.py` con Cache-Control: no-store |
| GitHub Pages | ✅ | `_config.yml` con `exclude:` per docs/moduli/shared (fix Jekyll) |
| Menu | ✅ | Operatività = documenti prodotti; Documentazione = solo Conformità Documenti |
| cantieri-service.js | ✅ | `aggiornaDatiLotto()` ricarica `ANAGRAFICA_SERVICE` dopo ogni salvataggio |

---

## ⬜ PROSSIMI PASSI (per la prossima sessione)

### (a) FATTORIZZAZIONE shared/flusso-b-helpers.js ← MATURA CON 5 DOCUMENTI
Con 5 documenti Flusso B costruiti, la fattorizzazione è **urgente e matura**.
Ogni fix sulle utility (es. `:x-model` invalido nella Verifica ITP) si deve applicare MANUALMENTE a tutti i moduli — questo è un rischio operativo reale.

Cosa estrarre in `shared/flusso-b-helpers.js`:
- `_scalafirma` / `_ritagliaCanvas` / `_ptCanvas` — gestione canvas firma
- `FirmaCanvas` Alpine component — canvas firma riusabile
- `_serEditor` / `_editorFromHtml` — serializzatore/loader editor ricco
- `_leggiBase64` / `_scriviFile` — utility filesystem
- `_applicaInterlinea15` — helper interlinea testi editor
- Pattern ciclo protocollati (`_caricaProtocollati`, `apriFileProt`, `salvaProtocollo`)

**Metodo**: test di non-regressione su TUTTI e 5 i documenti prima e dopo. Regola anti-regressione obbligatoria.

### (b) Verbale di Sopralluogo (Flusso A)
Il documento più "SafeCant-native": arriva come JSON dall'iPad dei colleghi, il PO lo rifinisce e lo controfirma. Design: `@docs/FlussoA-Operativita-Sopralluogo-M7-M10.md`.

### (c) Cruscotto Conformità Documenti
Vista trasversale: impresa × documento atteso × stato (mancante/in scadenza/valido).
Alimentato dall'anagrafica M4. Voce già presente nel menu Documentazione.

### (d) SafeCant allineamento + fix
- Fix bug nome compilatore (redattore arriva con nome/qualifica vuoti)
- Import anagrafica (legge il file leggero da M4 F7)
- Chiude il giro end-to-end: Archivio → SafeCant → Verbale

### (e) Flusso C — perimetro ridefinito (decisione definitiva)
**Notifica Preliminare: NON costruita in SafeHub** (software esterno già presente e funzionante).
Opzione futura: solo archivio copia (non generazione). Gli altri documenti Flusso C restano nel perimetro se e quando serviranno.

### (f) M25 Cruscotto generale multi-cantiere
Aggrega scadenze critiche di tutti i cantieri in una vista.

### (g) M26 AI locale (bridge Ollama)
3 livelli: procedure (L1), RAG D.Lgs 81/08 (L2), contesto cantiere (L3). Ultimo da costruire.

---

## NOTE TECNICHE DA RICORDARE

**REGOLA DI METODO — task di modifica (MANTENERLA SEMPRE su ogni task futuro):**
Ogni task che modifica codice esistente DEVE includere:
1. **Punti fermi espliciti** — lista di ciò che NON deve essere toccato
2. **Verifica anti-regressione** — Claude Code esegue test automatici prima di consegnare e riporta l'esito punto per punto
3. **Modifiche chirurgiche** — interviene solo sulle righe strettamente necessarie, NON rigenera blocchi interi

**Menu (v0.9.0):**
- **Operatività** = documenti che il PO PRODUCE (Verbale Riunione, Proposta Sospensione, Disposizione RL, Verifica POS, Verifica ITP, Sospensioni RL, Verbali Sopralluogo-in attesa)
- **Documentazione** = solo Conformità Documenti (cruscotto monitoraggio)

**Pattern Flusso B (5 documenti completati):**
- Componente Alpine a tab, no service separato
- Auto-save debounce 8s + indicatore stato
- `generaCorpoHtml<Tipo>()` pura async → M6 per HTML+DOCX
- `_intestazione<X>()` con `bad Set` che include valori M2 errati → override automatico
- Storage: `<NN>_<Categoria>/Bozze/<uuid>.json` + `Protocollati/<numero>.json`
- Vista Protocollati: toggle, auto-switch dopo protocollazione, `apriFileProt()` FSA
- **NO `:x-model`** in Alpine: usare `x-model` standard o `@change` + `:checked` espliciti
- **Firma CSE/RL**: usa SOLO `nome_cognome` nel corpo (ruolo va in intestazione)
- **`_applicaInterlinea15(html)`**: aggiunge data-line=15 ai `<p>` dell'editor ricco

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

**Service Worker:**
- Su localhost: **DISATTIVATO** (IS_DEV in alpine-init.js). F5 = sempre file freschi.
- Server locale: `avvia.sh` usa `server.py` con `Cache-Control: no-store`

---

*Aggiornato al 03/06/2026 — v0.9.0 taggato. 5 documenti Flusso B completi. Fattorizzazione matura.*
