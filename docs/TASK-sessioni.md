# TASK — Stato di avanzamento SafeHub Archivio
## Documento di sessione · aggiornato 01 giugno 2026

> Riferimento rapido per rientrare nel contesto a inizio sessione.
> Per il design completo: `@docs/00-INDICE-Biblioteca-SafeHub.md`.
> Per schema dati: `@docs/schema-anagrafica-canonico-v2.md` (canonico, aggiornato).

---

## PUNTI DI RIPRISTINO (tag Git)

| Tag | Commit | Contenuto |
|---|---|---|
| `v0.4.0-anagrafica-lavoratori` | `e0f9332` | M1-M3 + M4 F1-F2, drawer condiviso |
| `v0.5.0-anagrafica-completa`   | `1944bfd` | **M4 completo F1-F7**, aggancio SafeCant chiuso |

Per tornare a un punto: `git checkout <tag>` (detached HEAD, sola lettura).
Per sviluppare da un punto: `git checkout -b nome-branch <tag>`.

---

## STATO MODULI

### ✅ COMPLETATI E COLLAUDATI

| Modulo | Fase | Commit/tag | Note |
|---|---|---|---|
| **M1** Fondazione | — | v0.4.0 | PWA, FSA, IDB, cantiere corrente, shell |
| **M2** Impostazioni | — | v0.4.0 | Identità CSE, firma PNG, logo, codici moduli, soglie scadenza |
| **M3** Gestione Cantieri | — | v0.4.0 | Scaffolding 16 cartelle, cruscotto, scheda lotto + ruoli FK |
| **M4** Anagrafica | **COMPLETO** | v0.5.0 | Tutte e 7 le fasi: |
| └─ F1 Imprese | | | Conformità §12, patente crediti, drawer centralizzato |
| └─ F2 Lavoratori | | | Scadenze idoneità/formazione/abilitazioni ASR |
| └─ F3 Mezzi/Attrezzature | | | Verifiche INAIL, PiMUS, 2 tab |
| └─ F4 Noli | | | Freddo/caldo, collegamento bidirezionale nolo↔mezzo |
| └─ F5 Persone | | | Committente + Terzi; aggancio M3 ruoli istituzionali |
| └─ F6 Cruscotto Scadenze | | | Vista aggregata cantiere corrente |
| └─ F7 Export SafeCant | | | Variante leggera, badge modifiche, schema identico |

### 🔧 INFRASTRUTTURA

| Componente | Stato | Note |
|---|---|---|
| SW dev-off/prod-on | ✅ | localhost = no SW; GitHub Pages = SW v18 |
| Drawer centralizzato | ✅ | `.drawer/.drawer-body` ecc. in styles.css (no inline display:flex) |
| Firma autore | ✅ | "by — Geom. Dogano Casella" in sidebar |
| GitHub Pages | ✅ | https://casellado.github.io/SafeHub/ |

---

## ⬜ PROSSIMI PASSI (ordine consigliato)

### Opzione A — SafeCant allineamento + fix (aggancio immediato)
- **Dipende da:** M4 F7 ✅ — il lato Archivio è pronto
- **Fix bug nome compilatore:** indipendente, si può fare subito (audit + fix veloce)
- **Import anagrafica:** legge il file leggero prodotto da M4 F7
- **Design:** `@docs/SafeCant-Allineamento-e-Fix.md`
- **Risultato:** giro end-to-end funzionante Archivio → SafeCant → Verbale

### Opzione B — M6 Motore DOCX
- Sblocca tutti i Flussi A/B/C
- È il pezzo tecnicamente più complesso rimasto (convertitore HTML→OOXML)
- **Design:** `@docs/M6-Motore-DOCX.md`
- Stack: docxtemplater core + `{@rawXml}` + `docxtemplater-image-module-free` (tutto MIT)
- Dipende da: M2 (logo/codici) ✅
- **Template Word UNICO** per tutti i documenti Flusso B — per ogni tipo cambia solo `generaCorpoHtml<Tipo>()`
- **⚠ IMPORTANTE:** quando si costruisce M6 e i documenti Flusso B, il PO fornirà il testo/layout reale di ciascun modulo ufficiale, documento per documento. I documenti generati devono riprodurre i modelli veri del PO, NON fac-simili inventati.

#### Perimetro Operatività — vista trasversale AI M26 (definito dal PO)
I documenti del 'lavoro vivo' su cui l'AI assisterà. Restano archiviati nei rispettivi flussi, questa è la lista di riferimento per M6 e M26:

| # | Documento | Flusso | Modulo | Note |
|---|---|---|---|---|
| 1 | Verbale di sopralluogo | Flusso A | M7-M10 | Arriva da SafeCant |
| 2 | Verbale riunione coordinamento | Flusso B | M11 (pilota) | Il PO lo produce |
| 3 | Verifica idoneità POS | Flusso B | M12 | Il PO la produce |
| 4 | Verifica ITP | Flusso B | M12 (sottotipo) | Il PO la produce |
| 5 | Proposta sospensione CSE | Flusso B | M13 | Il PO la produce |
| 6 | Notifica preliminare | Flusso C | M17 | Il PO la prepara, archiviata in C |
| 7 | Disposizione/sospensione RL | Flusso C | M19 | La emette il RL, il PO la riceve |

### Opzione C — Flusso C (documenti ricevuti)
- M17 pilota (Notifica Preliminare): upload PDF + metadati, nessun motore documenti
- Buono per avanzare velocemente su un flusso reale
- **Design:** `@docs/M17-Notifica-Preliminare-FlussoC.md`

### Opzione D — M25 Cruscotto generale multi-cantiere (Livello B)
- Rimandato a dopo avere cantieri reali popolati
- **Design:** `@docs/Moduli-Supporto-M23-M26.md` (M25)

---

## NOTE TECNICHE DA RICORDARE

**Schema anagrafica:**
- Campo: `direttoreOperativoId` (non `cseDelegatoId`) — correzione normativa 01/06/2026
- Migrazione soft attiva: file vecchi con `cseDelegatoId` vengono autocorretti alla prima lettura
- Fonte canonica: `@docs/schema-anagrafica-canonico-v2.md`

**Drawer pattern:**
- Usare classi `.drawer/.drawer-header/.drawer-body/.drawer-footer` (in styles.css)
- MAI `display:flex` negli inline style: Alpine `x-show` lo cancella (bug noto, risolto)
- Backdropclick per chiudere: `<div class="drawer-backdrop" @click="chiudi()">`

**Service Worker:**
- Su localhost: **DISATTIVATO** (IS_DEV in alpine-init.js). F5 = sempre file freschi.
- Su GitHub Pages: SW v18 attivo, aggiornamento automatico via `controllerchange`

**Export SafeCant:**
- Handle `SafeHub-Anagrafiche/` in IDB key `anagrafiche_handle` (separato da `root_handle`)
- File: `anagrafica_<cantiereId>_YYYY-MM-DD.json`
- Funzione: `ANAGRAFICA_SERVICE.esportaLeggera()` — ricorsiva, un solo passo

**Merge parziale:**
- Ogni salvataggio M4 tocca SOLO la collezione indicata (`salvaCollezione('imprese', ...)`)
- Il file ha sempre tutte le 8 collezioni

---

*Aggiornato al 01/06/2026 — v0.5.0 taggato, M4 completo. Perimetro Operatività definito dal PO.*
