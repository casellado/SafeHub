# MODULO M3 — GESTIONE CANTIERI
## Creare, selezionare e governare i lotti · v1.0 · 31 maggio 2026

> **Cosa è questo documento.** Il design del modulo che crea i cantieri (lotti), li elenca, ne
> permette la selezione come "cantiere corrente", e prepara la struttura di cartelle su cui tutti gli
> altri moduli scrivono. È il modulo che dà sostanza al "cantiere corrente" predisposto da M1: M1
> fornisce il meccanismo (lo store), M3 fornisce i cantieri veri e la loro creazione.

> **Dipendenze.** Poggia su M1 (fondazione, filesystem, store cantiere, IDB). È prerequisito di M4
> (anagrafica) e di ogni modulo documento (che scrivono nelle cartelle del cantiere). Struttura
> cartelle dal contratto tecnico §3.

---

## 1. INQUADRAMENTO

### 1.1 Cosa fa M3
- **Crea un nuovo cantiere**: genera l'`id` del lotto + lo scaffolding completo delle 16 cartelle
  tipizzate in OneDrive + il file anagrafica iniziale.
- **Elenca i cantieri** esistenti (cruscotto), letti dalla cartella radice.
- **Seleziona il cantiere corrente** (alimenta lo store di M1).
- **Mostra/modifica i dati identificativi** del lotto (committente, CUP, CIG, date, ruoli istituzionali).
- **Archivia/chiude** un cantiere concluso (senza cancellarlo).

### 1.2 Cosa NON fa M3
- Non gestisce le anagrafiche interne del cantiere (imprese, lavoratori…): quello è M4. M3 gestisce
  il *contenitore* lotto e i suoi dati di testa, non il contenuto.
- Non genera documenti.

### 1.3 Il cantiere è la radice di tutto (principio P1 dello schema)
Coerente con lo schema v2.0: l'ID primario è il lotto. Ogni dato, documento, anagrafica risale a un
cantiere. M3 è il punto dove i cantieri nascono e si selezionano; da lì tutto il resto è "dentro" il
cantiere corrente.

---

## 2. STORAGE

### 2.1 Struttura creata alla nascita di un cantiere
Creare un cantiere significa creare in OneDrive l'intero albero (dal contratto tecnico §3):
```
SafeHub-CSE-Lavori/<ID_CANTIERE>/
├── 01_Verbali-Sopralluogo/   (Bozze/ + Finalizzati/)
├── 02_Verbali-Riunione/      (Bozze/ + Finalizzati/)
├── 03_Verifiche-POS/         (Bozze/ + Finalizzati/)
├── 04_Proposte-Sospensione-CSE/ (Bozze/ + Finalizzati/)
├── 05_Non-Conformita/        (Aperte/ + In-Risoluzione/ + Chiuse/)
├── 06_Eventi-Incidentali/    (Bozze/ + Finalizzati/)
├── 07_ODS-Inviati/
├── 08_Diario-CSE/
├── 09_Registro-PSC/
├── 10_Notifica-Preliminare/  (Originale/ + Aggiornamenti/)
├── 11_Verifiche-Enti-Esterni/
├── 12_Disposizioni-Sospensioni-RL/
├── 13_ODS-Ricevuti/
├── 14_POS-Documentale/
├── 15_Anagrafica/            (anagrafica_<ID>.json iniziale)
└── 16_Foto/
```

### 2.2 Lo "scaffolding" come operazione atomica
La creazione cartelle è un'operazione sola, gestita da M3 via `filesystem.js` di M1. Se OneDrive non è
pronto o una cartella esiste già, M3 gestisce con grazia (riusa l'esistente, non duplica). L'obiettivo:
dopo "Crea cantiere", la struttura è completa e ogni modulo successivo trova la sua cartella pronta.

### 2.3 Cache
Store IDB `cantieri_cache` (da M1 §4): indice dei cantieri per elenco rapido. Rigenerabile scansionando
la cartella radice (`rigeneraIndice()` di M1). I file sono canonici.

---

## 3. DATI IDENTIFICATIVI DEL LOTTO

Vivono nel file anagrafica del cantiere (`15_Anagrafica/anagrafica_<ID>.json`), nodo `lotto` dello
schema v2.0. M3 ne gestisce la testa; M4 gestisce le collezioni interne. Campi (da schema v2.0 §3):
- **id** (primario, opaco — es. CZ399), **denominazione interna** (etichetta leggibile per il PO)
- **committente** (riferito genericamente, riservatezza), struttura territoriale
- **CUP, CIG**, estremi contratto, importi, date (consegna, ultimazione)
- **ruoli istituzionali**: FK a `persone_committente` (RUP, RL, CSE titolare, DL, Direttore Operativo,
  ispettori). M3 li imposta scegliendo tra le persone committente (che si inseriscono in M4).
- **stato**: attivo / sospeso / concluso-archiviato

> Nota riservatezza: l'`id` cantiere è opaco (CZ399), nessun riferimento identificativo reale del
> committente nei nomi. La denominazione leggibile resta interna al file del PO.

---

## 4. INTERFACCIA

### 4.1 Cruscotto cantieri (vista iniziale dell'app)
Coerente col principio "ogni archivio è un cruscotto":
- **Pannello in cima**: cantieri attivi, eventuali alert globali (es. "3 cantieri con scadenze critiche").
- **Lista cantieri**: card per cantiere con id/denominazione, stato (attivo/sospeso/concluso),
  conteggi sintetici (n. imprese, scadenze critiche aperte, documenti recenti).
- **Pulsante "Nuovo cantiere"**.
- **Selezione**: cliccare un cantiere lo rende "corrente" e apre il suo spazio di lavoro.

### 4.2 Creazione nuovo cantiere
Form minimo per partire (P3 guida-non-blocca: si parte con poco):
- id/denominazione (obbligatori nella UX per identificarlo)
- committente, CUP/CIG e il resto: compilabili dopo
- al conferma: M3 crea lo scaffolding 16 cartelle + il file anagrafica iniziale + registra in cache.

### 4.3 Scheda dati cantiere
Modifica dei dati identificativi (§3) e assegnazione dei ruoli istituzionali (selezione da
persone_committente di M4). Salvataggio mai bloccante.

### 4.4 Chiusura/archiviazione cantiere
Un cantiere concluso si marca "concluso-archiviato": resta leggibile e consultabile, esce dalla vista
principale dei cantieri attivi. Mai cancellato (dati a valore legale).

---

## 5. IL CANTIERE CORRENTE (aggancio a M1)

M3 è il produttore principale di eventi sullo store `$store.cantiere` di M1:
- selezione cantiere → `$store.cantiere.seleziona(id)` → evento `cantiere-cambiato`;
- gli altri moduli (M4, documenti) in ascolto ricaricano i dati del nuovo lotto;
- l'ultimo cantiere selezionato si persiste in `_config` (M2 preferenze_app) e si ripristina al boot.

Questo è il contratto già previsto in M1 §5: M3 lo riempie di cantieri reali.

---

## 6. CASI PARTICOLARI

- **Cartella radice cambiata** (nuovo PC, nuovo path OneDrive): M3 ri-scansiona e re-indicizza, i
  cantieri ricompaiono (i dati sono nei file, non nell'app).
- **Cantiere creato fuori dall'app** (cartella aggiunta a mano): la scansione lo rileva; se manca lo
  scaffolding completo, M3 offre di completarlo.
- **id duplicato**: M3 impedisce di creare due cantieri con lo stesso id (controllo in fase di creazione).
- **OneDrive non sincronizzato**: M3 usa la gestione errori di M1 (avvisa, non crasha).

---

## 7. CRITERIO DI CHIUSURA DI M3

M3 è chiuso quando:
- "Nuovo cantiere" crea l'intero scaffolding 16 cartelle + file anagrafica iniziale, in modo atomico e idempotente;
- il cruscotto elenca i cantieri letti dalla cartella radice, con conteggi sintetici;
- la selezione di un cantiere aggiorna lo store di M1 ed emette `cantiere-cambiato`;
- i dati identificativi del lotto si modificano e si salvano nel file anagrafica;
- l'assegnazione dei ruoli istituzionali pesca da persone_committente (M4);
- la chiusura/archiviazione marca lo stato senza cancellare;
- la scansione gestisce cantieri creati fuori dall'app e cartelle radice cambiate.

---

## 8. DECISIONI PRESE (31/05)

1. **id cantiere LIBERO**: lo sceglie il PO (es. CZ399), nessuno schema imposto. Resta opaco per
   riservatezza (nessun riferimento identificativo reale del committente). Unico vincolo: univoco
   (M3 impedisce duplicati) e valido come nome cartella (no spazi/caratteri proibiti — M3 lo valida
   con un avviso gentile, non blocca la digitazione).
2. **Cruscotto cantieri come ingresso**: aprendo SafeHub si vede il cruscotto con tutti i cantieri
   (stato, conteggi, alert), e da lì si seleziona quello su cui lavorare. Il selettore in alto resta
   disponibile per cambiare cantiere senza tornare al cruscotto. Vista d'ingresso = cruscotto; cambio
   rapido = selettore.

---

## 9. PROSSIMI PASSI

1. Il PO rivede questo design.
2. Congelato M3 → è il terzo modulo di fondazione (dopo M1, prima/insieme a M2), perché senza cantieri
   non c'è dove mettere le anagrafiche.
3. Poi M4 (anagrafica completa), che vive dentro il cantiere corrente che M3 fornisce.

---

*Design M3 Gestione cantieri v1.0 — 31 maggio 2026. Poggia su M1 (store cantiere, filesystem) e usa lo
schema v2.0 (nodo lotto). Crea lo scaffolding 16 cartelle del contratto tecnico §3. Prerequisito di M4.*
