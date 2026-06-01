# 00 — INDICE DELLA BIBLIOTECA DI DESIGN SAFEHUB
## Da leggere prima di tutto · 31 maggio 2026

> Questa cartella contiene la documentazione di design completa di **SafeHub Archivio**. Leggere n
> l'ordine sotto. Principio generale: i `.md` sono la fonte di verità del design; si costruisce solo
> dopo che un modulo è congelato. Repo pulito, nessuna modifica a V3 (abbandonata).

---

## ORDINE DI LETTURA

### 1. Visione e governo (leggere per primi)
- **SafeHub-Documento-Maestro.md** — porta d'ingresso: unifica visione, architettura, flussi, piano.
- **safehub-archivio-architettura-sezioni.md** — mappa delle sezioni del menu + principi trasversali
  (ogni archivio è un cruscotto con scadenze/alert; ogni modulo ha il promemoria normativo).

### 2. Schema dati (i riferimenti dati — consultare sempre prima di costruire)
- **Schema-Dati-Completo.md** — vista unica: file/cartelle (canonico) + IndexedDB (cache) + metadati.
- **schema-anagrafica-canonico-v2.md** — schema anagrafica v2.0, le 8 collezioni. La versione BUONA.

### 3. Moduli di fondazione (ordine di costruzione)
- **M1-Fondazione.md** — scheletro PWA, filesystem OneDrive, IDB cache, cantiere corrente.
- **M2-Impostazioni-Globali.md** — identità/firma CSE, logo, codici moduli, soglie scadenze.
- **M3-Gestione-Cantieri.md** — creazione lotti (scaffolding 16 cartelle), selezione cantiere.
- **Anagrafica.md** — modulo M4, il cuore dati; cruscotti, scadenze, export verso SafeCant.
- **M6-Motore-DOCX.md** — motore documenti: corpo HTML → HTML/DOCX/PDF (via gratuita, no licenze).

### 4. I tre flussi documentali
- **FlussoA-Operativita-Sopralluogo-M7-M10.md** — verbale di sopralluogo da SafeCant + controfirma CSE.
- **FlussoB-Documenti-Prodotti-M12-M16.md** — i documenti che il PO produce e protocolla.
- **M17-Notifica-Preliminare-FlussoC.md** — pilota Flusso C (documento ricevuto: upload + metadati).
- **FlussoC-Documenti-Ricevuti-M18-M21.md** — gli altri documenti ricevuti (variazioni del pilota).

### 5. Moduli di supporto
- **Moduli-Supporto-M23-M26.md** — Registro PSC, Foto, Cruscotto generale, AI locale.

### 6. Conoscenza normativa (il "perché" delle scelte — consultare quando serve)
- **chi-redige-firma-invia.md** — matrice RACI: chi redige/firma/riceve ogni documento. Alimenta il
  promemoria normativo che compare in ogni modulo.
- **documenti-obbligatori-facoltativi.md** — gradazione obbligatorio/condizionato/facoltativo.
- **flusso-documentale-confronto-standard.md** — allineamento allo standard nazionale UNI/PdR 168.

---

## MAPPA MODULI → DOCUMENTO

| Modulo | Documento |
|---|---|
| M1 Fondazione | M1-Fondazione.md |
| M2 Impostazioni | M2-Impostazioni-Globali.md |
| M3 Cantieri | M3-Gestione-Cantieri.md |
| M4 Anagrafica (+ M5 export) | Anagrafica.md |
| M6 Motore DOCX | M6-Motore-DOCX.md |
| M7-M10 Flusso A (sopralluogo) | FlussoA-Operativita-Sopralluogo-M7-M10.md |
| M11 Verbale Riunione (pilota B) | (design già nel progetto: modulo-verbale-riunione-design.md) |
| M12-M16 Flusso B | FlussoB-Documenti-Prodotti-M12-M16.md |
| M17 Notifica Preliminare (pilota C) | M17-Notifica-Preliminare-FlussoC.md |
| M18-M21 Flusso C | FlussoC-Documenti-Ricevuti-M18-M21.md |
| M22 Diario | (design già nel progetto: modulo-diario-cse-progettazione.md) |
| M23-M26 Supporto | Moduli-Supporto-M23-M26.md |

---

## DOCUMENTI DI BASE GIÀ NEL PROGETTO (non in questa biblioteca, ma fondamentali)
SafeHub.md (visione) · SafeHubPianoSviluppo.md · SafeHubProcedura.md · safehub-contratto-tecnico.md
(convenzioni tecniche, schema IDB, struttura cartelle) · modulo-verbale-riunione-design.md (pilota B) ·
modulo-diario-cse-progettazione.md.

---

## STATO
Biblioteca di design **completa**. Tutti i flussi (A/B/C), fondazione, supporto e schema dati sono
progettati. Prossima fase: prompt di costruzione atomici per Claude Code, partendo da M1, un modulo
alla volta, con collaudo (Fasi A-G della Procedura).

---

*Indice v1.0 — 31 maggio 2026.*
