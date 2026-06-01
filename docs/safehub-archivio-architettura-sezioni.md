# SAFEHUB ARCHIVIO — ARCHITETTURA DELLE SEZIONI
## Rimodellazione delle aree di lavoro sul modello v2.0 · 31 maggio 2026

> **Cosa fa questo documento.** Prende la mappa reale delle sezioni con cui il PO lavora (eredità
> V3) e la **rimodella** — non la ricopia — alla luce del Documento Maestro e dello schema anagrafica
> canonico v2.0. Definisce COME si organizza SafeHub Archivio: le aree del menu, cosa contiene
> ciascuna, a quale flusso documentale appartiene, e il principio trasversale che **ogni archivio ha
> un cruscotto con scadenze, alert e strumenti di consultazione**. Il "come si archivia" nel dettaglio
> (campi, metadati, workflow di ogni singolo archivio) sarà oggetto dei documenti di modulo successivi.

---

## 0. PRINCIPI DI RIMODELLAZIONE (non ricopiare V3)

1. **V3 è una miniera di conoscenza, non un modello da clonare.** La sua mappa di sezioni dice COSA
   serve al PO (è esperienza reale, preziosa). Il COME lo ridefinisce il modello v2.0: gerarchia a
   cascata col lotto, assegnazione univoca all'impresa, schema che guida ma non blocca, conformità
   normativa incorporata.

2. **Menu ≠ Flusso.** Il PO pensa per RAGGRUPPAMENTI DI MENU (Anagrafica, Sicurezza, Documentazione,
   Gestione). Il modello dati pensa per FLUSSO DOCUMENTALE (A interno, B con protocollo, C ricevuto,
   Supporto). Sono due viste della stessa cosa: il menu è l'ergonomia, il flusso è la meccanica. Ogni
   voce di menu "sa" a quale flusso appartiene. → **Navigazione ibrida** (decisione del PO).

3. **Ogni archivio ha il suo cruscotto.** Non un semplice elenco: un cruscotto con scadenze, alert,
   filtri, ricerca, indicatori di conformità. È il principio che rende l'Archivio uno strumento di
   lavoro, non un raccoglitore. Definito in modo trasversale alla §7.

4. **Riservatezza assoluta** dei riferimenti al committente (codici cantiere opachi, mai nomi reali).

---

## 1. MAPPA DELLE AREE DI MENU (vista del PO)

L'Archivio si presenta al PO con queste aree di primo livello. È la struttura di navigazione, fedele
al modo in cui il PO ragiona, ma agganciata sotto al modello a flussi.

```
SAFEHUB ARCHIVIO
│
├── ▸ CANTIERE                        (contesto: si lavora sempre dentro un lotto)
│   ├── Anagrafica del Cantiere       → dati lotto (committente, CUP, CIG, progressive, ruoli)
│   └── Registro PSC                  → aggiornamenti PSC nel tempo
│
├── ▸ ANAGRAFICHE                     (CHI/COSA è in cantiere — schema v2.0)
│   ├── Personale della Sicurezza     → persone_committente (RUP, RL, CSE, DL, DO, ispettori…)
│   ├── Imprese                       → imprese[] (con tipoRapporto, patente, figure sicurezza)
│   ├── Lavoratori                    → lavoratori[] (assegnati a impresa_id)
│   ├── Mezzi e Attrezzature          → mezzi[] + attrezzature[] (assegnati a impresa_id)
│   ├── Noli                          → noli[] (a caldo / a freddo, assegnati a impresa_id)
│   └── Enti Terzi                    → persone_terzi (ASL, INL, VVF, consulenti…)
│
├── ▸ SICUREZZA                       (eventi e criticità — Flusso B)
│   ├── Non Conformità                → Flusso B · genera da NC draft dei sopralluoghi
│   └── Eventi Incidentali            → Flusso B · near-miss / infortuni
│
├── ▸ DOCUMENTAZIONE                  (verifiche e atti — misti Flusso B e C)
│   ├── Verifica POS                  → Flusso B (PRODOTTA dal PO)
│   ├── Verifica ITP                  → Flusso B (PRODOTTA dal PO)
│   ├── Proposte di Sospensione CSE   → Flusso B (PRODOTTA dal PO)
│   ├── Sospensioni del RL            → Flusso C (RICEVUTA dal RL)
│   └── Conformità Documenti          → vista trasversale (cruscotto conformità anagrafica)
│
├── ▸ OPERATIVITÀ                     ⏸ IN SOSPESO (decisione del PO: si definirà dopo)
│   └── (Verbali di Sopralluogo — Flusso A — quando si affronta)
│
└── ▸ GESTIONE                        (strumenti del PO)
    ├── Diario CSE                    → Supporto · tracciamento attività
    ├── Archivio Documenti            → Flusso C · documenti esterni ricevuti
    ├── Impostazioni                  → impostazioni globali del PO
    └── Cestino                       → elementi rimossi, recuperabili
```

> **Nota su OPERATIVITÀ (in sospeso).** Il PO la lascia in sospeso per ora. Conterrà il Flusso A
> (Verbali di Sopralluogo che arrivano da SafeCant, rifinitura, finalizzazione PDF). Non è dimenticata:
> è una scelta di sequenza. La struttura la prevede ma non la dettaglia ora.
>
> **Decisione PO (31/05) — Verifica POS e Verifica ITP vanno in OPERATIVITÀ, come ibrido B→C.**
> Sono documenti che il PO **produce** su richiesta (natura Flusso B: le redige, le stampa, le firma),
> ma una volta stampate la loro **gestione in archivio segue il pattern C**: si caricano come PDF con
> protocollo/data/eventuale lettera, e si consultano dal cruscotto con apri-click/stampa/scarica
> (riuso del pattern M17). Quindi: **nascono B, si archiviano come C.** Il PO le colloca nella sezione
> Operatività (in sospeso): si progetteranno alla fine, insieme al resto dell'Operatività, riusando il
> pattern di archiviazione del Flusso C. Per ora restano elencate sotto Documentazione nella mappa, ma
> la loro collocazione operativa e il pattern di archiviazione sono questi.

---

## 2. AREA CANTIERE

Il contesto di lavoro: in Archivio si opera sempre "dentro" un lotto selezionato. Tutto il resto
(anagrafiche, documenti) è filtrato per il lotto corrente.

### 2.1 Anagrafica del Cantiere
Dati del lotto (schema v2.0 §3): identificativo, committente, struttura territoriale, CUP, CIG,
progressive, contratto, importi, date, e i **ruoli istituzionali** (FK a persone_committente:
RUP, DL, CSE titolare, Direttore Operativo, RL, ispettore, responsabile lavori). È l'ID primario di tutto.

### 2.2 Registro PSC
Registro cumulativo degli aggiornamenti del Piano di Sicurezza e Coordinamento nel tempo (art.92
c.1.b). Voci datate, ognuna con eventuale PDF allegato. Flusso: Supporto (`09_Registro-PSC/`).

---

## 3. AREA ANAGRAFICHE (lo schema v2.0 reso navigabile)

Questa è la traduzione diretta dello schema canonico v2.0 in voci di menu. Principio cardine:
**assegnazione univoca all'impresa** — lavoratori, mezzi, attrezzature, noli appendono sempre a UNA
impresa, mai genericamente al cantiere.

### 3.1 Personale della Sicurezza
Le persone della stazione appaltante e i tecnici incaricati: **RUP, RL (Responsabile Lavori), CSE
titolare, DL (Direttore Lavori), Direttore Operativo, ispettori di cantiere**. (Il CSE è incarico personale non delegabile, art.89 lett.f / art.92 D.Lgs.81/08.)
→ collezione `persone_committente`, campo `ruolo`.
**Nota del PO:** il "collaboratore del CSE" e l'"ispettore di cantiere" NON sono figure distinte —
sono **ispettori di cantiere a cui viene affidato il compito** (es. il sopralluogo). Una sola figura,
un solo ruolo `ISPETTORE_CANTIERE`. Chi usa SafeCant è un ispettore di cantiere con compito di
sopralluogo. Niente categoria separata.

### 3.2 Imprese
collezione `imprese[]`. Per ognuna: identificazione, `tipoRapporto` (8 categorie), patente a crediti,
figure di sicurezza (RSPP/MC/RLS/preposti/DT/DC), CCNL, organico medio annuo, documenti.

### 3.3 Lavoratori
collezione `lavoratori[]`, ognuno con `impresa_id`. Attestati formazione, visita medica, abilitazioni,
tessera riconoscimento, badge cantiere.

### 3.4 Mezzi e Attrezzature
`mezzi[]` (semoventi/sollevamento, con verifiche periodiche INAIL) + `attrezzature[]` (non semoventi,
ponteggi con PiMUS). Ognuno con `impresa_id`. Possono collegarsi a un nolo (`nolo_id`).

### 3.5 Noli
collezione `noli[]`: contratti a caldo / a freddo, con `impresa_utilizzatrice_id`. Per il caldo, il
flag `superaSoglieSubappalto`. Distinzione che determina gli obblighi documentali.

### 3.6 Enti Terzi
collezione `persone_terzi`: ASL, INL, VVF, Provincia, consulenti esterni.

---

## 4. AREA SICUREZZA (Flusso B — eventi e criticità)

> Nota di rimodellazione: in V3 "Non Conformità" ed "Eventi" stanno sotto SICUREZZA. Nel modello
> dati sono **Flusso B** (documenti prodotti dal PO con iter di protocollo). Il menu li raggruppa
> sotto Sicurezza per ergonomia; la meccanica resta quella del Flusso B.

### 4.1 Non Conformità
Documenti di NC che il PO produce. Nascono spesso da una "NC draft" segnalata in un verbale di
sopralluogo (aggancio al Flusso A) e vengono formalizzate qui. Iter Flusso B
(`05_Non-Conformita/`). Si agganciano all'impresa interessata (`impresa_id`).

### 4.2 Eventi Incidentali
Near-miss e infortuni. Iter Flusso B (`06_Eventi-Incidentali/`). Anche questi agganciati all'impresa
e al lotto.

---

## 5. AREA DOCUMENTAZIONE (verifiche e atti — Flusso B + C misti)

Qui convivono documenti che il PO PRODUCE (Flusso B) e documenti che RICEVE (Flusso C). La distinzione
**chi firma** è esplicita in ogni voce.

### 5.1 Verifica POS — Flusso B (prodotta dal PO)
Il CSE verifica l'idoneità del POS dell'impresa (art.92 c.1.b). Si riferisce a UNA impresa
(`impresa_id` → anagrafica). `03_Verifiche-POS/`.

### 5.2 Verifica ITP — Flusso B (prodotta dal PO)
Verifica dell'idoneità tecnico-professionale (All.XVII). Usa la gradazione obbligatorio/facoltativo
per sapere QUALI documenti controllare in base al `tipoRapporto` dell'impresa. Condivide il modulo
con Verifica POS (sottotipo).

### 5.3 Proposte di Sospensione CSE — Flusso B (prodotta dal PO)
Il CSE PROPONE la sospensione al committente/RL (art.92 c.1.f), o sospende direttamente in caso di
pericolo grave. `04_Proposte-Sospensione-CSE/`.

### 5.4 Sospensioni del RL — Flusso C (ricevuta dal RL)
La DISPOSIZIONE di sospensione che il RL/committente emette. Documento ricevuto, archiviato.
`12_Disposizioni-Sospensioni-RL/`. **Da non confondere con 5.3:** la Proposta è del CSE (la produci);
la Disposizione è del RL (la ricevi). Spesso collegate, ma due atti distinti con due autori.

### 5.5 Conformità Documenti — vista trasversale
Non è un documento ma un **cruscotto di conformità**: legge l'anagrafica del lotto e mostra, impresa
per impresa, quali documenti attesi (per `tipoRapporto`) sono presenti/mancanti/in scadenza, con la
gradazione obbligatorio/facoltativo. È la materializzazione della matrice documento×soggetto.

---

## 6. AREA GESTIONE (strumenti del PO)

### 6.1 Diario CSE
Tracciamento attività (art.92). Voci AUTO (generate dagli altri moduli alla finalizzazione) + voci
MANUALI. Per-cantiere. Supporto (`08_Diario-CSE/`). Già progettato in `modulo-diario-cse-progettazione.md`.

### 6.2 Archivio Documenti
I documenti esterni ricevuti del Flusso C non già coperti altrove: Notifica Preliminare, Verifiche
Enti Esterni, ODS Ricevuti, POS Documentale. Upload PDF + metadati.

### 6.3 Impostazioni
Impostazioni globali del PO (firma CSE, logo, nome, qualifica, codici e versioni moduli qualità),
configurate una volta, usate da tutti i generatori di documenti.

### 6.4 Cestino
Elementi rimossi (anagrafiche, documenti, voci diario manuali) — recuperabili. Cancellazione logica
(tombstone), non fisica immediata. Tutela contro la perdita accidentale di dati con valore legale.

---

## 7. PRINCIPIO TRASVERSALE — IL CRUSCOTTO DI OGNI ARCHIVIO

> Questo è il requisito che il PO ha posto come centrale: **ogni archivio non è un elenco, è un
> cruscotto** che facilita lavoro e consultazione. Vale per tutte le sezioni. I dettagli per singolo
> archivio si definiranno nei documenti di modulo; qui si fissa lo standard comune.

Ogni cruscotto di sezione deve offrire:

**Consultazione**
- Lista degli elementi con metadati visibili in colonna (data, numero/protocollo, oggetto, stato,
  impresa associata se pertinente)
- Ricerca testuale e filtri (per impresa, per stato, per intervallo date, per tipo)
- Apertura/visualizzazione con un click (PDF inline o nuova scheda)
- Ordinamento per colonna (più recente, scadenza più vicina, alfabetico…)

**Scadenze e alert** (il cuore del valore)
- Indicatore visivo di scadenza per ogni elemento che ne ha una (DURC, attestati, visite mediche,
  verifiche periodiche, patente crediti, polizze…)
- Codifica a colori coerente con la gradazione: 🔴 scaduto/mancante-obbligatorio · 🟠 in scadenza
  (entro soglia configurabile, es. 30 gg) o mancante-condizionato · 🟢 valido · ⬜ non pertinente
- **Pannello alert in cima**: riepilogo di ciò che richiede attenzione adesso (documenti scaduti,
  in scadenza nei prossimi N giorni, obbligatori mancanti) — la prima cosa che il PO vede aprendo
  la sezione
- Conteggi sintetici (es. "3 DURC scaduti, 5 attestati in scadenza questo mese")

**Azioni**
- Nuovo elemento (Flusso B: nuova bozza · Flusso C: upload PDF + metadati · Anagrafiche: nuovo record)
- Per Flusso B: "Riprendi bozza" per documenti in compilazione
- Modifica / Elimina (→ cestino) con conferma
- Esportazione/stampa di una vista (es. estratto conformità di un'impresa)

**Conformità (dove pertinente)**
- Per le anagrafiche e per "Conformità Documenti": vista a matrice documento×soggetto con la
  gradazione obbligatorio/facoltativo, mai bloccante (principio P3 dello schema)

**Stato di sincronizzazione**
- Poiché il modello è "file = stato" su OneDrive, indicazione se l'archivio è allineato con i file
  su disco (l'IDB è solo cache di indicizzazione: si può forzare un re-scan)

---

## 8. MAPPA SINOTTICA — SEZIONE → FLUSSO → CARTELLA

| Area menu | Voce | Flusso | Cartella / Collezione | Chi firma/produce |
|---|---|:-:|---|---|
| Cantiere | Anagrafica Cantiere | Dati | `15_Anagrafica` (lotto) | PO |
| Cantiere | Registro PSC | Supporto | `09_Registro-PSC` | PO |
| Anagrafiche | Personale Sicurezza | Dati | `persone_committente` | PO |
| Anagrafiche | Imprese | Dati | `imprese[]` | PO |
| Anagrafiche | Lavoratori | Dati | `lavoratori[]` | PO |
| Anagrafiche | Mezzi e Attrezzature | Dati | `mezzi[]`+`attrezzature[]` | PO |
| Anagrafiche | Noli | Dati | `noli[]` | PO |
| Anagrafiche | Enti Terzi | Dati | `persone_terzi` | PO |
| Sicurezza | Non Conformità | B | `05_Non-Conformita` | 🖊️ PO |
| Sicurezza | Eventi Incidentali | B | `06_Eventi-Incidentali` | 🖊️ PO |
| Documentazione | Verifica POS | B | `03_Verifiche-POS` | 🖊️ PO |
| Documentazione | Verifica ITP | B | `03_Verifiche-POS` (sottotipo) | 🖊️ PO |
| Documentazione | Proposte Sospensione CSE | B | `04_Proposte-Sospensione-CSE` | 🖊️ PO |
| Documentazione | Sospensioni del RL | C | `12_Disposizioni-Sospensioni-RL` | 📥 RL |
| Documentazione | Conformità Documenti | Vista | (calcolata da anagrafica) | — |
| Operatività ⏸ | Verbali Sopralluogo | A | `01_Verbali-Sopralluogo` | 🖊️ PO (da SafeCant) |
| Gestione | Diario CSE | Supporto | `08_Diario-CSE` | PO |
| Gestione | Archivio Documenti | C | `10`-`14` (esterni) | 📥 terzi |
| Gestione | Impostazioni | Config | `_config/` | PO |
| Gestione | Cestino | — | (tombstone) | — |

Legenda: 🖊️ prodotto/firmato dal PO · 📥 ricevuto da terzi

---

## 9. COSA RESTA DA DEFINIRE (i prossimi documenti di dettaglio)

Questo documento fissa l'ARCHITETTURA delle sezioni. Restano da dettagliare, archivio per archivio
(nei rispettivi documenti di modulo):
1. **Schema dati specifico** di ogni documento di Flusso B (NC, eventi, verifiche, sospensioni):
   campi, stati, workflow. Il pilota è il Verbale di Riunione (`modulo-verbale-riunione-design.md`).
2. **Metadati di archiviazione** per ogni Flusso C (cosa si chiede all'upload).
3. **Logica scadenze/alert** per tipo di documento (quali campi data, quali soglie di preavviso).
4. **Cruscotto Conformità Documenti** (§5.5): l'algoritmo che incrocia anagrafica × gradazione.
5. **Area Operatività** (Flusso A): quando il PO deciderà di affrontarla.
6. **Funzione export anagrafica** (il ponte verso SafeCant): unico pezzo dati ancora mancante.

---

*Documento architettura sezioni SafeHub Archivio v1.0 — 31 maggio 2026. Rimodella la mappa V3 sul
modello a flussi del Documento Maestro e sullo schema anagrafica canonico v2.0. Non ricopia V3:
ne usa l'esperienza. Principio trasversale: ogni archivio è un cruscotto con scadenze e alert, mai
un semplice elenco. Riservatezza assoluta dei riferimenti al committente.*
