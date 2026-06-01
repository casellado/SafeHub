# MODULO M17 — NOTIFICA PRELIMINARE (PILOTA FLUSSO C)
## Il pattern dei documenti ricevuti · v1.0 · 31 maggio 2026

> **Cosa è questo documento.** Il design del pilota del Flusso C — i documenti che il PO **riceve** da
> terzi e archivia. La Notifica Preliminare è il primo; una volta definito questo pattern, gli altri
> moduli del Flusso C (Verifiche Enti, Disposizioni RL, ODS Ricevuti, POS Documentale) sono variazioni.
> Principio di fondo del Flusso C: **il documento mi viene inviato** — io lo ricevo, lo carico con ciò
> che lo accompagna (protocollo, data, lettera di trasmissione), lo archivio, lo consulto.

> **Dipendenze.** Poggia su M1 (fondazione, filesystem, errori) e M3 (cantiere corrente). Non usa M6
> (non genera documenti: li riceve già fatti). Vive in `10_Notifica-Preliminare/` (contratto tecnico §3).

---

## 1. INQUADRAMENTO

### 1.1 Cosa fa il modulo
- **Riceve** un documento (PDF) via **upload o drag-and-drop**.
- Permette di registrare ciò che accompagna il documento: **numero di protocollo**, **data**, e la
  **lettera di trasmissione** (PDF) associata.
- **Archivia** documento + metadati + lettera insieme, nella cartella del cantiere corrente.
- Offre un **cruscotto** per consultare: apertura con un click (come iperlink), **stampa**, **download**.
- **Tutto non bloccante**: si può archiviare un documento anche senza protocollo/data/lettera, e
  completarli dopo.

### 1.2 Cosa NON fa
- Non genera né modifica il documento ricevuto (è di terzi, resta integro).
- Non produce DOCX/PDF (M6 non è coinvolto).

### 1.3 Il principio del Flusso C
Il documento **arriva già fatto**. Il modulo non lo crea: lo accoglie, lo correda di metadati, lo
rende trovabile e consultabile. È archivio puro, ma "intelligente" (cruscotto, non cartella morta).

---

## 2. STORAGE

### 2.1 Dove vivono i dati
```
SafeHub-CSE-Lavori/<cantiere>/10_Notifica-Preliminare/
├── Originale/
│   ├── notifica_<cantiere>_<data>.pdf            ← il documento ricevuto
│   ├── notifica_<cantiere>_<data>.lettera.pdf    ← lettera di trasmissione (se presente)
│   └── notifica_<cantiere>_<data>.meta.json      ← metadati (protocollo, data, note, riferimenti)
└── Aggiornamenti/                                 ← varianti per modifiche cantiere
    └── ...
```

### 2.2 Modello "file = stato"
Il PDF ricevuto è il dato. Accanto, un `.meta.json` con i metadati e un eventuale `.lettera.pdf`. La
terna (documento + lettera + meta) è l'unità archiviata. L'IDB (`documenti_indice` di M1) indicizza i
metadati per ricerca rapida; i file sono canonici.

### 2.3 Metadati (.meta.json)
```jsonc
{
  "tipo": "notifica-preliminare",
  "cantiere_id": "CZ399",
  "protocollo": "<numero protocollo>",      // dato che accompagna il documento ricevuto
  "data_protocollo": "2026-05-20",
  "data_ricezione": "2026-05-22",           // quando il PO l'ha ricevuto/archiviato
  "oggetto": "<descrizione breve>",
  "mittente": "<Committente / RL>",         // chi l'ha inviato
  "ha_lettera_trasmissione": true,
  "file_documento": "notifica_CZ399_....pdf",
  "file_lettera": "notifica_CZ399_....lettera.pdf",
  "note": "<libere>",
  "archiviato_il": "2026-05-22T..."
}
```
Tutti i campi sono **facoltativi** tranne il riferimento al file documento: si archivia il PDF e si
completano i metadati quando si hanno (non bloccante).

---

## 3. ACQUISIZIONE DEL DOCUMENTO (upload + drag-and-drop)

### 3.1 Due modi, stesso esito
- **Upload**: pulsante "Carica documento" → file picker → seleziona il PDF.
- **Drag-and-drop**: trascina il PDF (o più PDF) sull'area del cruscotto → vengono acquisiti.
Entrambi portano allo stesso form di archiviazione (§4).

### 3.2 La lettera di trasmissione
Nello stesso form, un secondo slot "Lettera di trasmissione (PDF)" — anch'esso upload o drag-drop.
Facoltativo: se il documento è arrivato con la lettera, la si allega; altrimenti si lascia vuoto e si
aggiunge dopo.

### 3.3 Robustezza
- Accetta PDF (tipo principale). Se si trascina un file non-PDF, avviso gentile (non blocca il resto).
- Più file trascinati insieme: il modulo li elenca e si archiviano uno per uno (o in blocco con
  metadati comuni, se è una serie).

---

## 4. FORM DI ARCHIVIAZIONE (non bloccante)

Dopo l'acquisizione, un form per registrare ciò che accompagna il documento:
- **Documento** (già caricato, con anteprima/nome)
- **Numero protocollo** — testo libero
- **Data** (protocollo / ricezione)
- **Lettera di trasmissione** — slot PDF
- **Oggetto / mittente / note** — testo libero

**Principio non bloccante (ribadito):** il pulsante "Archivia" è sempre attivo. Si può salvare con il
solo PDF e tutti i metadati vuoti. I campi mancanti generano al più un suggerimento gentile
("protocollo non inserito"), mai un blocco. Il PO completa quando vuole, riaprendo la voce dal cruscotto.

---

## 5. IL CRUSCOTTO (consultazione, apertura, stampa, download)

Coerente col principio trasversale "ogni archivio è un cruscotto", e con le richieste esplicite del PO.

### 5.1 Lista
Righe/card dei documenti archiviati, con metadati in colonna: data, protocollo, oggetto, mittente,
indicatore "ha lettera di trasmissione". Ordinabile e ricercabile (per protocollo, data, oggetto).

### 5.2 Apertura con un click (come iperlink) ⭐ richiesta PO
Cliccando sul documento (o su un'icona "apri"), il PDF si apre **immediatamente** per la
visualizzazione — come un iperlink. Niente passaggi: click → vedi il documento. Sia il documento sia
la lettera di trasmissione si aprono così.

### 5.3 Stampa ⭐ richiesta PO
Pulsante "Stampa" su ogni voce: apre il PDF nel flusso di stampa del sistema. Vale per documento e lettera.

### 5.4 Download ⭐ richiesta PO
Pulsante "Scarica" su ogni voce: salva il PDF (documento o lettera) dove il PO vuole.

### 5.5 Azioni di gestione
- **Modifica metadati**: riapre il form (§4) per completare/correggere protocollo, data, lettera.
- **Aggiungi/sostituisci lettera di trasmissione**: se è arrivata dopo, si allega senza rifare tutto.
- **Sposta in Aggiornamenti/**: per varianti della notifica dovute a modifiche del cantiere.
- **Elimina** → cestino (cancellazione logica, recuperabile — dati a valore legale).

### 5.6 Pannello in cima
Riepilogo essenziale: presenza/assenza della notifica per il cantiere corrente, eventuali documenti
senza protocollo (promemoria gentile da completare). Non allarmi: è archivio ricevuto, non scadenzato.

---

## 6. PERCHÉ È IL PILOTA DEL FLUSSO C

Gli altri moduli del Flusso C riusano questo identico pattern, cambiando solo cartella e qualche
metadato:

| Modulo | Cartella | Differenze dal pilota |
|---|---|---|
| Notifica Preliminare (questo) | `10_Notifica-Preliminare/` | pilota |
| Verifiche Enti Esterni | `11_Verifiche-Enti-Esterni/` | mittente = ASL/INL; campo "esito" |
| Disposizioni/Sospensioni RL | `12_Disposizioni-Sospensioni-RL/` | mittente = RL; tipo (disposizione/sospensione) |
| ODS Ricevuti | `13_ODS-Ricevuti/` | mittente = Committente/RL |
| POS Documentale | `14_POS-Documentale/` | associazione a impresa (impresa_id) |

Costruito M17, gli altri quattro sono variazioni: stesso upload/drag-drop, stessi metadati base, stesso
cruscotto con apri/stampa/scarica, stessa non-bloccanza. Si progetteranno in un solo documento di
gruppo (Flusso C) che richiama questo pilota.

---

## 7. CRITERIO DI CHIUSURA DI M17

M17 è chiuso quando:
- si acquisisce un PDF via upload E via drag-and-drop;
- si allega una lettera di trasmissione (PDF) come secondo file;
- si registrano protocollo, data e metadati, tutto **non bloccante** (archiviabile anche vuoto);
- il cruscotto elenca i documenti con i metadati e permette ricerca/ordinamento;
- **apertura con un click** del documento e della lettera (come iperlink);
- **stampa** e **download** funzionano su documento e lettera;
- modifica metadati, aggiunta lettera posticipata, spostamento in Aggiornamenti/, eliminazione → cestino;
- tutto vive in `10_Notifica-Preliminare/` ed è leggibile anche fuori dall'app (file in chiaro).

---

## 8. DECISIONE APERTA PER IL PO

1. **Più documenti in blocco**: se trascini più PDF insieme (es. notifica + suoi allegati), li vuoi
   come voci separate o come un'unica voce con allegati multipli? (per il pilota va bene anche solo
   "uno per volta"; lo chiedo perché potrebbe servirti per gli altri moduli C).

---

## 9. PROSSIMI PASSI

1. Il PO rivede questo design.
2. Congelato M17 → prompt di costruzione atomico per Claude Code.
3. Poi il documento di gruppo "Flusso C" (M18-M21) come variazioni di questo pilota.

---

*Design M17 Notifica Preliminare (pilota Flusso C) v1.0 — 31 maggio 2026. Poggia su M1 e M3. Pattern:
documento ricevuto → upload/drag-drop + metadati (protocollo/data/lettera) → cruscotto con apri/stampa/
scarica. Tutto non bloccante. Apre la strada a M18-M21.*
