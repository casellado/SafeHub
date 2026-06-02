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
| `v0.7.0-proposta-sospensione`  | `9f00812` | **M13 Proposta Sospensione + fix regressioni + M6 tipografia**, collaudato |

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
| **M6** Motore DOCX | COMPLETO | v0.7.0 | HTML+DOCX; tipografia (data-line/indent/spacing); vendor/ locale |
| **Verbale Riunione** | COMPLETO | v0.7.0 | Pilota Flusso B — firme 3 blocchi, promemoria normativo, protocollati |
| **M13 Proposta Sospensione** | COMPLETO | v0.7.0 | Lettera formale art.92 c.1 lett.e — vedi dettaglio sotto |

#### Dettaglio M13 Proposta di Sospensione (Mod.RE.01-14)
- Lettera formale al RL (art.92 c.1 lett.e D.Lgs 81/08): destinatari da anagrafica, oggetto, frase introduttiva con contestazione, PROPONE con 4 caselle ☑/☐, gravi inosservanze 5 caselle, "relativamente a" con editor ricco
- Attributi tipografici M6: destinatari `data-indent=destra`, righe oggetto `data-line=exact280`, narrativi `data-line=15`, voci caselle `data-indent=elenco`, firma `data-indent=firma`
- Firma CSE: blocco a destra senza colonne, schema centrato
- Promemoria normativo (lett.e vs lett.f, trasmissione)
- Pattern identico al verbale: ciclo BOZZA→FINALIZZATO→PROTOCOLLATO, vista Protocollati con toggle+link FSA, auto-save, editor ricco
- Contestazione manuale con TODO M14 (tendina NC quando esisterà il modulo)
- Storage: `04_Proposte-Sospensione-CSE/Bozze/` + `Protocollati/`

#### M6 Estensione tipografica (da v0.7.0)
- `_pPrFromNode(node)`: legge data-line, data-before/after, data-indent, data-left/hanging, data-align → produce w:pPr completo
- Default non-compresso su tutti i paragrafi: line=276 auto (≈1,15 righe)
- h2/h3: spacing strutturale hardcoded (before/after) per stacchi automatici
- CSS preview aggiornato con equivalenti CSS per tutti gli attributi data-*
- Contratto attributi: vedi `@docs/M6-Estensione-Tipografia.md`

### 🔧 INFRASTRUTTURA

| Componente | Stato | Note |
|---|---|---|
| SW dev-off/prod-on | ✅ | localhost = no SW (IS_DEV); SW v23 su GitHub Pages |
| Server locale no-cache | ✅ | `avvia.sh` + `server.py` con Cache-Control: no-store |
| GitHub Pages | ✅ | `_config.yml` con `exclude:` per docs/moduli/shared (fix Jekyll) |
| Drawer centralizzato | ✅ | `.drawer/.drawer-body` ecc. in styles.css |
| Firma autore | ✅ | "by — Geom. Dogano Casella" in sidebar |
| cantieri-service.js | ✅ | `aggiornaDatiLotto()` ricarica `ANAGRAFICA_SERVICE` dopo ogni salvataggio |

---

## ⬜ PROSSIMI PASSI (per la prossima sessione)

### INTERVENTO PRIORITARIO — Tipografia M6 (⚠ NON ancora fatto)
**Spec**: `@docs/M6-Estensione-Tipografia.md` — valori reali estratti da Mod.RE.01-14 ANAS.
**Stato**: la struttura dell'estensione è implementata in M6 (v0.7.0). I documenti (proposta, verbale) usano già alcuni attributi. Ma l'intervento completo di calibrazione — passare da "un po' meglio" a "documento che respira davvero" — richiede un giro dedicato con confronto PDF ufficiale e ricollaudo del verbale.
- Ricollaudo verbale OBBLIGATORIO dopo modifiche a M6
- Valori da applicare sistematicamente: interlinea 1,5 sui narrativi, stacchi sezioni, rientri elenco
- **NON toccare** M6 senza "punti fermi" + "verifica anti-regressione" (vedi regola metodo)

### (a) Flusso B — prossimi documenti (variazioni del pilota)
Riusano il pattern verbale/proposta. Cambia solo `generaCorpoHtml<Tipo>()`.
- **M14 Non Conformità** — ciclo speciale APERTA→IN-RISOLUZIONE→CHIUSA + scadenza monitorata; nasce spesso da nc_drafts sopralluogo. Sblocca il TODO M14 nella proposta (tendina NC).
- **M15 Evento Incidentale** — near-miss/infortuni, dati sensibili
- **M16 ODS Inviati** — speculare a ODS Ricevuti (M20, Flusso C)
- **M12 Verifica POS/ITP** — aggancio anagrafica + POS Documentale (M21)

### (b) Fattorizzazione shared/flusso-b-helpers.js
Dopo il 3° documento Flusso B: estrarre `_scalafirma`, `FirmaCanvas`, `_serEditor`, `_editorFromHtml`, `_leggiBase64`, `_scriviFile` in un file condiviso per eliminare la duplicazione accettata per ora.
Prerequisito: avere almeno 3 moduli B costruiti per validare il pattern.

### (c) SafeCant allineamento + fix
- **Fix bug nome compilatore**: redattore arriva con nome/qualifica vuoti
- **Import anagrafica**: SafeCant deve leggere il file leggero prodotto da M4 F7
- **Chiude il giro end-to-end**: Archivio → SafeCant → Verbale
- Design: `@docs/SafeHub.md §5.2`

### (d) M17 Flusso C — pilota (Notifica Preliminare)
- Upload PDF + metadati (protocollo, data, lettera) — nessun motore documenti
- Sblocca poi M18-M21

### (e) M25 Cruscotto generale multi-cantiere
- Aggrega scadenze critiche di tutti i cantieri in una vista

### (f) M26 AI locale (bridge Ollama)
- 3 livelli: procedure (L1), RAG D.Lgs 81/08 (L2), contesto cantiere (L3)
- Ultimo da costruire (dipende da corpus documenti generati)

---

## NOTE TECNICHE DA RICORDARE

**REGOLA DI METODO — task di modifica (introdotta v0.7.0, MANTENERLA SEMPRE):**
Ogni task che modifica codice esistente DEVE includere:
1. **Punti fermi espliciti** — lista di ciò che NON deve essere toccato
2. **Verifica anti-regressione** — Claude Code esegue test automatici prima di consegnare e riporta l'esito punto per punto
3. **Modifiche chirurgiche** — interviene solo sulle righe strettamente necessarie, NON rigenera blocchi interi
Motivazione: le regressioni in questa sessione sono state causate da rigenerazioni che hanno riportato indietro correzioni già fatte. Questa regola ha risolto il problema.

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

**Pattern pilota Flusso B (dal Verbale Riunione, confermato su M13):**
- Componente Alpine a tab, no service separato
- Auto-save debounce 8s + indicatore stato
- `generaCorpoHtml<Tipo>()` pura async → M6 per HTML+DOCX
- Firma integrata nel record presenza (no desincronizzazione)
- `<table data-border="none">` + `<td data-align="center">` per firme verbale
- `_scalafirma(src, 210, 80)`: canvas fisso per firme uniformi
- Storage: `<NN>_<Categoria>/Bozze/<uuid>.json` + `Protocollati/<numero>.json`
- Vista Protocollati: toggle nella lista, auto-switch dopo protocollazione, `apriFileProt()` FSA
- **Firma CSE**: usa SOLO `nome_cognome` nel corpo della firma (il RUOLO va in intestazione)
- **Titolo modulo**: leggere da M2 con override placeholder via `_VECCHI_PLACEHOLDER` Set

**M6 tipografia (contratto attributi):**
- `data-line="15"` → line=360 auto (1,5 righe)
- `data-line="exact280"` → line=280 exact (oggetto compatto)
- `data-indent="elenco"` → w:ind left=567 hanging=283 (voci ☑/☐)
- `data-indent="destra"` → w:ind left=5529 (blocco a destra)
- `data-indent="firma"` → w:ind left=5670 (firma a destra)
- default: line=276 auto (non-compresso); h3: before=200 after=80

**Fattorizzazione Flusso B (da fare dopo 3° documento):**
- Utility da spostare in `shared/flusso-b-helpers.js`: `_scalafirma`, `FirmaCanvas`, `_serEditor`, `_editorFromHtml`, `_leggiBase64`, `_scriviFile`
- Per ora duplicazione accettata, zero rischio regressione verbale/proposta

**Export SafeCant:**
- Handle `SafeHub-Anagrafiche/` in IDB key `anagrafiche_handle`
- Funzione: `ANAGRAFICA_SERVICE.esportaLeggera()` — ricorsiva, un solo passo

---

*Aggiornato al 02/06/2026 — v0.7.0 taggato. M13 Proposta Sospensione COMPLETO. Regola di metodo anti-regressione introdotta e mantenuta.*
