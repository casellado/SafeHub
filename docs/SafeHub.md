# SafeHub — Visione e Decisioni Strategiche
## Documento di riferimento dell'ecosistema CSE SafeHub · riscritto 31 maggio 2026

> **Nota di versione.** Questo documento riscrive la visione strategica originale (sessioni 27-30
> maggio) allineandola al progetto come è diventato dopo il consolidamento del 31 maggio: SafeCant è
> online, la lingua comune tra i prodotti è il JSON di interscambio, il motore documenti è gratuito,
> V3 è abbandonata e si riparte da repo pulito sullo schema anagrafica v2.0. Il filo conduttore di
> tutto l'ecosistema è **l'aggancio SafeHub ↔ SafeCant tramite anagrafiche e verbale di sopralluogo.**

---

## 1. IL PROBLEMA REALE

Il PO (Geom. Casella Dogano) è CSE su un'opera infrastrutturale del committente di grandi dimensioni:
tracciato esteso, decine di cantieri, oltre mille persone, filiera di centinaia di imprese. Le
anagrafiche di imprese e lavoratori sono troppo numerose e dinamiche per essere gestite a memoria o a
mano. Il lavoro del CSE genera e raccoglie un grande volume di documenti a valore legale.

### Ambienti del PO
- **PC privato (Ubuntu)**: ambiente di sviluppo del codice. Niente OneDrive client (separazione
  privato/aziendale); accesso a OneDrive del committente solo via browser quando serve.
- **PC ufficio (Windows 11, 8GB VRAM + 64GB RAM)**: il vero hub operativo. OneDrive client sincronizzato
  col tenant del committente. Qui gira SafeHub Archivio e l'AI locale.
- **iPad dei colleghi sopralluoghisti**: app OneDrive ufficiale, account `@committente.it`. Qui gira SafeCant.
- **Samsung Android del PO**: per l'app firma.

---

## 2. RICONOSCIMENTO ARCHITETTURALE FONDANTE

Il flusso reale è **hub-and-spoke centralizzato**, non peer-to-peer. Due modalità distinte:
- **Produzione sul campo** (tattica): l'unica attività davvero sul cantiere è il *sopralluogo* — tempo
  limitato, persone attorno, firme da raccogliere, dispositivo mobile.
- **Consolidamento in ufficio** (strategica): tutto il resto — rifinitura verbali, verifiche, NC,
  eventi, sospensioni, archiviazione, anagrafiche, registri — con calma, su PC, con vista d'insieme.

Risposta: **strumenti distinti per modalità distinte**. Da qui i tre prodotti.

---

## 3. ARCHITETTURA: TRE PRODOTTI

Tre prodotti indipendenti che comunicano via **file JSON e PDF** su cartelle OneDrive condivise interne
al tenant del committente. Niente database condiviso, niente conflitti di sync: i problemi spariscono
per costruzione.

### 3.1 SafeHub Firma (`safehub-firma`)
**Stato: online.** App utility che acquisisce firme su Samsung Android (PNG trasparente), dove il PC
ufficio non ha touchscreen. Usata solo dal PO.

### 3.2 SafeCant (`safehub-operativita`)
**Stato: ONLINE.** PWA iPad per i colleghi sopralluoghisti (e il PO in cantiere). Contiene **solo il
modulo Verbale di Sopralluogo**.
- **Motivazione legale dello scope ridotto:** i colleghi sono *collaboratori* del CSE titolare, non CSE
  titolari. Il CSE per legge non può delegare i suoi compiti; il collaboratore esegue sopralluoghi, il
  resto resta in capo al CSE titolare in Archivio.
- Offline-first (Service Worker, IndexedDB), Alpine.js + vanilla JS, no build.
- **Non genera DOCX/PDF**: produce un **file di interscambio JSON** (`corpo_html` + metadati + firme PNG
  embedded) che deposita su OneDrive per Archivio.
- Importa l'anagrafica del cantiere dalla cartella condivisa; redattore fisso = ispettore configurato
  sull'iPad personale.

**Cosa resta da fare su SafeCant** (è online ma incompleto su due punti, ed è qui che si gioca
l'aggancio con SafeHub):
1. **Integrazione anagrafica**: oggi i dati del verbale si inseriscono a mano (`origine: manuale`,
   `impresa_id: null`). Va agganciato l'import dell'anagrafica esportata da Archivio, così l'ispettore
   *seleziona* imprese/lavoratori invece di scriverli.
2. **Bug nome compilatore**: il redattore ha la firma ma nome/qualifica arrivano vuoti — da correggere
   (probabilmente legato all'identità configurata in impostazioni).

### 3.3 SafeHub Archivio (`safehub-archivio`)
**Stato: da costruire da repo pulito.** Ambiente completo del CSE titolare, solo PC desktop. Gestisce
tutto il resto del lavoro CSE sui tre flussi documentali (sez. 4). Stack completo, motore documenti
gratuito, AI locale opzionale. **Sostituisce V3, che è abbandonata** (vedi sez. 9).

---

## 4. I TRE FLUSSI DOCUMENTALI

### Flusso A — Verbale di Sopralluogo (unico iter interno)
L'unico documento il cui ciclo si chiude dentro SafeHub. Arriva da SafeCant come JSON → il PO rifinisce
il corpo, **aggancia i presenti all'anagrafica**, **controfirma come CSE** → finalizza → DOCX → PDF
d'archivio in `01_Verbali-Sopralluogo/Finalizzati/`. Niente protocollo esterno. Sta nella sezione
**Operatività** (e ne è l'unico contenuto). Dettaglio: `FlussoA-Operativita-Sopralluogo-M7-M10.md`.

### Flusso B — Documenti prodotti dal PO con protocollo
Documenti che il CSE produce e firma: compila in Archivio → finalizza (DOCX) → invia ai superiori →
tornano protocollati (PDF + numero + data + lettera) → il PO carica il PDF protocollato. Archivia
**solo il PDF protocollato**, mai il DOCX. Tipi: Verbale Riunione, Verifica POS/ITP, Proposta
Sospensione CSE, NC (ciclo tri-stato), Eventi, ODS Inviati. Dettaglio: `FlussoB-Documenti-Prodotti-M12-M16.md`.

### Flusso C — Documenti ricevuti
Documenti di terzi: upload/drag-drop PDF + metadati (protocollo, data, lettera). Tipi: Notifica
Preliminare, Verifiche Enti, Disposizioni RL, ODS Ricevuti, POS Documentale. Dettaglio: `M17-...` e
`FlussoC-Documenti-Ricevuti-M18-M21.md`.

---

## 5. LA LINGUA COMUNE: ONEDRIVE E IL JSON DI INTERSCAMBIO

> Aggiornamento chiave rispetto alla visione originale: i prodotti comunicano via **file JSON** (non
> DOCX). Il DOCX è solo un output finale di Archivio, non un mezzo di comunicazione tra prodotti.

### 5.1 Quattro cartelle OneDrive mono-direzionali (niente conflitti)
- `SafeHub-Anagrafiche`: **PO scrive, colleghi leggono** — `anagrafica_<lotto>_AAAA-MM-GG.json`
- `SafeHub-Verbali-Ricevuti`: colleghi scrivono, PO legge — `verbale_sopralluogo_<cantiere>_<data>_<ora>.json`
- `SafeHub-Foto-Sopralluoghi`: colleghi scrivono, PO legge — foto fuori dal record verbale
- (`SafeHub-Documenti-Distribuiti`: eventuale futura, PO scrive, colleghi leggono)

### 5.2 L'AGGANCIO SAFEHUB ↔ SAFECANT (il cuore dell'ecosistema)
Questo è il punto più importante dell'intero progetto, e merita di essere esplicito:

**Anagrafica (PO → colleghi):** SafeHub Archivio è l'unico che PRODUCE l'anagrafica (modulo M4). La
esporta in versione *leggera* (blob svuotati) nella cartella `SafeHub-Anagrafiche`. SafeCant la importa
e la usa per far selezionare imprese/lavoratori/mezzi all'ispettore sul campo. **Schema identico:** ciò
che Archivio scrive è esattamente ciò che SafeCant legge (`schema-anagrafica-canonico-v2.md`, variante
leggera). Nessuna trasformazione di nomi campo tra i due.

**Verbale di sopralluogo (colleghi → PO):** SafeCant produce il JSON di interscambio con il `corpo_html`
e le firme. SafeHub Archivio lo riceve, lo rifinisce, aggancia i presenti all'anagrafica, **aggiunge la
controfirma del CSE**, e lo finalizza in PDF.

Questi due flussi — anagrafica in andata, verbale al ritorno — sono il legame che fa dei due prodotti
un unico ecosistema. Se questo aggancio funziona, l'ecosistema funziona. È la priorità.

### 5.3 Modello "file = stato"
In Archivio i file SONO i dati: niente database centrale, la fonte di verità è la cartella OneDrive.
Un file per documento. IndexedDB è solo cache di indicizzazione, rigenerabile. Dettaglio completo:
`Schema-Dati-Completo.md`. Struttura delle 16 cartelle per cantiere: idem.

---

## 6. IL MOTORE DOCUMENTI — GRATUITO (aggiornamento importante)

> Aggiornamento rispetto alla visione originale: **niente librerie a pagamento.** Il PO non è retribuito
> per la PWA; non si acquista l'html-module. L'audit di SafeCant ha inoltre accertato che SafeCant non
> genera alcun DOCX (produce solo JSON) — quindi il motore nasce interamente in Archivio.

Il motore (M6) produce **tre output** da un unico corpo HTML: **HTML** (anteprima a schermo), **DOCX**
(da inviare ai superiori, Flusso B), **PDF** (archivio, generato *dal DOCX* per coerenza
d'impaginazione). Stack gratuito: docxtemplater core + `{@rawXml}` (con convertitore HTML→OOXML nostro)
+ `docxtemplater-image-module-free`. Template Word unico con segnaposto header (`{modulo_codice}`,
`{modulo_versione}`, logo) + corpo iniettato. Lo stesso motore vale per tutti i flussi, inclusa
l'Operatività. Dettaglio: `M6-Motore-DOCX.md`.

---

## 7. AI LOCALE (strumento opzionale del PO)

Non è un prodotto: è una capacità del PC ufficio. Tre livelli — second brain (procedure), RAG
legislativo (D.Lgs 81/08), contesto dinamico (cantiere corrente). Inferenza via Ollama, capability
detection (se assente, l'app funziona in manuale). Supporta la rifinitura dei testi. Non sostituisce il
giudizio CSE, non ha valore di firma, non è in SafeCant. Dettaglio: `Moduli-Supporto-M23-M26.md` (M26).

---

## 8. STACK E ORGANIZZAZIONE

Comune: Alpine.js + Tailwind (CDN) + vanilla JS + IndexedDB, no build. Organizzazione per feature con
`shared/`. SafeCant leggero (no docx/pdf/AI); Archivio completo (motore documenti gratuito, File System
Access API, AI bridge opzionale). Dettaglio convenzioni: `safehub-contratto-tecnico.md`.

---

## 9. V3 È ABBANDONATA (decisione 31 maggio)

> Aggiornamento sostanziale rispetto alla visione originale, che prevedeva V3 stabile in produzione
> durante una transizione.

V3 (`cse-attuale`, `v2.2.70-stable`) è **abbandonata**. Non è più riferimento, nemmeno per gli audit.
Si riparte da **repo pulito** sui documenti di design e sullo schema anagrafica v2.0. I dati reali sono
solo anagrafiche che il PO ricompila nel nuovo sistema: **niente migrazione**, niente codice di import
da V3. I debiti noti di V3 (doppia pipeline OneDrive, frammentazione cantiere corrente, ecc.) spariscono
per costruzione nei nuovi prodotti.

---

## 10. PRINCIPI GUIDA

- Un attrezzo che fa una cosa bene batte un attrezzo che prova a fare tutto.
- Strumenti tattici per attività tattiche, strategici per attività strategiche. Non mescolare.
- I problemi si possono risolvere o eliminare: eliminarli (cambiando architettura) è meglio.
- Piccoli passi atomici, mai big bang. Un modulo alla volta, chiuso e collaudato.
- Riconoscere il sovrascalare è una virtù da CTO.
- AI come assistente, mai sostituto del giudizio CSE.
- **La fonte di verità è il codice che funziona, non i documenti.** (Lezione del 31 maggio: l'audit di
  SafeCant ha corretto assunzioni dei documenti di progetto. Quando divergono, vince il codice.)
- **Riservatezza assoluta**: nome del committente e riferimenti identificativi delle opere NON compaiono
  MAI in codice, UI, nomi file/cartelle pubblici, commit, README. Si usa "committente" e codici cantiere
  opachi (es. CZ399).

---

## 11. STATO E PROSSIMI PASSI (31 maggio 2026)

**Fatto:**
- SafeHub Firma online; SafeCant online (da completare: integrazione anagrafica + bug nome compilatore).
- Biblioteca di design di SafeHub Archivio **completa**: fondazione (M1, M2, M3, M4 Anagrafica, M6),
  Flusso A, Flusso B, Flusso C, supporto (M23-M26), schema dati completo, conformità normativa, RACI,
  confronto standard UNI/PdR 168, promemoria normativo contestuale.
- V3 abbandonata; si riparte da repo pulito sullo schema v2.0.
- Motore documenti gratuito definito; audit SafeCant fatto.

**Prossimo passo:** uscire dalla progettazione ed entrare nella costruzione, con prompt atomici per
Claude Code, un modulo alla volta con collaudo (Fasi A-G della Procedura), **partendo dalla fondazione
(M1)**. Sul piano dell'aggancio SafeHub↔SafeCant, il pezzo che chiude il giro end-to-end è la funzione
di **export anagrafica** (M5, in Anagrafica.md) + il relativo **import lato SafeCant**.

Stato: sereno, nessuna urgenza, direzione chiara. Si procede con metodo.

---

*SafeHub — Visione e Decisioni Strategiche. Riscritto il 31 maggio 2026 allineandolo al progetto
consolidato. Per il dettaglio di ogni argomento, la fonte è il documento specifico della biblioteca di
design (vedi `00-INDICE-Biblioteca-SafeHub.md`). Riservatezza assoluta dei riferimenti al committente.*
