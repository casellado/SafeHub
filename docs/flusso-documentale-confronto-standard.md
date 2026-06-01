# FLUSSO DOCUMENTALE — Confronto con lo standard di settore (UNI/PdR 168 e prassi appalti)
## SafeHub · 31 maggio 2026

> **Scopo.** Verificare come una grande stazione appaltante e lo standard di settore strutturano il
> flusso documentale della sicurezza cantieri, e confrontarlo col modello SafeHub. Esito sintetico:
> **il modello che abbiamo costruito è allineato — e in alcuni punti anticipa — lo standard nazionale
> di riferimento (UNI/PdR 168:2024).** Non abbiamo inventato nulla di arbitrario: abbiamo ricostruito,
> per via di ragionamento, ciò che la prassi formalizza.

---

## 1. LA SCOPERTA: esiste uno standard, ed è UNI/PdR 168:2024

Cercando il flusso documentale tipo delle stazioni appaltanti (ANAS e simili), la fonte più
autorevole non è un capitolato di un singolo committente, ma una **prassi di riferimento nazionale**
pubblicata da UNI il 26 settembre 2024: **UNI/PdR 168:2024 — "Gestione digitale della documentazione
in materia di tutela della salute e sicurezza del lavoro nei cantieri temporanei o mobili"**.

Alla sua stesura hanno collaborato **INL, INAIL, ANCE, CISL, AIAS, ATS** e altri — cioè gli enti che
governano davvero la sicurezza cantieri in Italia. È il documento che le grandi stazioni appaltanti
adottano come riferimento per i loro sistemi documentali. Non è una norma cogente, ma è LO standard
condiviso di settore.

---

## 2. COSA DICE LA UNI/PdR 168 (e quanto somiglia a SafeHub)

### 2.1 Ambiente di Condivisione Dati (ACDat)
La prassi struttura tutto attorno a un **ACDat** (Common Data Environment): una "fonte informativa
concordata" per raccogliere, gestire e inoltrare i documenti per tutta la durata della commessa.
→ **In SafeHub è il modello "file = stato" su OneDrive**: la cartella condivisa È l'ambiente di
condivisione dati. Stessa idea, strumento sobrio.

### 2.2 Tre livelli di sviluppo crescente (LS1 → LS2 → LS3)
- **LS1**: sistema base, **cartelle standardizzate su piattaforme web (Google Drive, OneDrive)**.
- **LS2**: aggiunge gestione metadati per ricerca e tracciabilità.
- **LS3**: sistemi avanzati integrati (BIM, blockchain, Digital Twin).
→ **SafeHub Archivio è esattamente un LS1-LS2 fatto bene**: cartelle standardizzate su OneDrive
(LS1) + indice/metadati per ricerca e scadenze (LS2). Lo standard CONFERMA che partire da cartelle
OneDrive strutturate non è un ripiego: è il primo livello formalmente previsto. La nostra scelta
"non sovradimensionare" coincide con la scala dello standard.

### 2.3 Stati di lavorazione e di approvazione (UNI 11337)
I documenti nell'ambiente condiviso sono classificati per **stato di lavorazione** (in elaborazione,
in attesa di approvazione, in pubblicazione, archiviato) e **stato di approvazione** (da approvare,
approvato, approvato con commenti, non approvato).
→ **In SafeHub sono i tre stati del Flusso B**: BOZZA → FINALIZZATO_DA_PROTOCOLLARE → PROTOCOLLATO.
Stessa logica di progressione di stato legata allo sviluppo del cantiere.

### 2.4 Matrice RACI per i flussi documentali ⭐
Il cuore della prassi: una **Matrice di Responsabilità RACI** dove le righe sono i documenti previsti
dal D.Lgs 81/08 e le colonne sono gli attori (committente, RL, CSE, affidataria, esecutrici, ecc.).
Negli incroci si indica chi è **R**esponsible, **A**ccountable, **C**onsulted, **I**nformed per ogni
documento.
→ **È esattamente il documento `chi-redige-firma-invia.md` che abbiamo prodotto ieri**: chi redige,
chi firma, a chi va. La nostra tabella "redige/firma/destinatario" È una matrice RACI applicata ai 7
documenti del PO. Abbiamo ricostruito lo strumento dello standard senza conoscerlo.

### 2.5 Requisiti dell'ambiente documentale
La prassi richiede: **univocità** (documenti identificabili univocamente), **interoperabilità**
(formati diversi), **facilità di accesso** (vari dispositivi), **sicurezza e privacy** (accesso solo
ad autorizzati).
→ SafeHub: univocità (nomenclatura file + ID), interoperabilità (JSON/PDF/DOCX), accesso multi-device
(PWA), privacy (riservatezza committente, cartelle mono-direzionali). Tutti e quattro coperti.

---

## 3. CONFRONTO PUNTO-PUNTO

| Elemento UNI/PdR 168 (standard) | Equivalente in SafeHub | Stato |
|---|---|---|
| ACDat / Common Data Environment | Modello "file = stato" su OneDrive condiviso | ✅ allineato |
| LS1 (cartelle standardizzate web) | Struttura cartelle 01–16 su OneDrive | ✅ è il nostro livello base |
| LS2 (metadati, ricerca, tracciabilità) | Indice IDB + cruscotti con scadenze/alert | ✅ allineato |
| LS3 (BIM, blockchain, Digital Twin) | — (non necessario per il caso d'uso) | ⏸ fuori scope, giustamente |
| Stati di lavorazione/approvazione | Stati Flusso B (Bozza→Finalizzato→Protocollato) | ✅ allineato |
| Matrice RACI documento×attore | `chi-redige-firma-invia.md` | ✅ ricostruito |
| Univocità / interoperabilità / accesso / privacy | Nomenclatura, JSON/PDF, PWA, riservatezza | ✅ coperti |
| Modulistica digitalizzabile | Template Word unico + corpo HTML | ✅ allineato |

---

## 4. PUNTO SPECIFICO SUGLI APPALTI PUBBLICI (ANAS e simili)

Dalla ricerca su modulistica e prassi degli appalti pubblici emergono conferme su due punti del
nostro modello:

### 4.1 L'ispettore di cantiere negli appalti pubblici (art. 126 Codice)
Conferma diretta della tua nota: negli appalti pubblici **"gli assistenti con funzioni di ispettori
di cantiere collaborano con il direttore dei lavori nella sorveglianza dei lavori"** (art. 126).
L'ispettore di cantiere è una figura del Codice dei contratti, con funzioni di sorveglianza
quotidiana. → Conferma la scelta: una figura `ISPETTORE_CANTIERE` a cui viene affidato un compito
(es. il sopralluogo), non una categoria separata "collaboratore CSE". Lo standard pubblico la inquadra
proprio così.

### 4.2 La modulistica tipo del CSE negli appalti
La modulistica standard degli appalti pubblici comprende esattamente i documenti del nostro modello:
affidamento incarico CSE, verbale di coordinamento, verbale di sopralluogo/visita, **ordine/verbale
di sospensione delle lavorazioni**, verifica POS, dichiarazioni All.XVII, consegna PSC/Fascicolo,
notifica preliminare. → I 7 documenti del PO sono esattamente il nucleo della modulistica CSE
standard. Nessuno è anomalo o mancante.

### 4.3 La catena della sospensione confermata
La modulistica distingue **"Ordine di sospensione di alcune lavorazioni"** (atto dispositivo) dal
verbale di visita in cui il CSE rileva il pericolo e *propone/sospende*. → Conferma la distinzione
che abbiamo fissato: proposta del CSE (art.92 lett.e) vs sospensione diretta (lett.f) vs disposizione
del RL. La prassi le tiene separate come noi.

---

## 4-bis. RISCONTRO DIRETTO SU ANAS

Cercando la documentazione ANAS specifica, emerge (dagli atti pubblici di ANAS SpA reperibili nei
portali di valutazione ambientale del Ministero) che ANAS struttura la documentazione di sicurezza
con una **nomenclatura codificata dei file** del tipo `0003-0300_01_PRIME-INDICAZIONI-SULLA-SICUREZZA`
— cioè codice commessa/opera + codice documento + progressivo + descrizione. → Conferma diretta del
nostro principio di **nomenclatura univoca dei file** e dei **prefissi numerici** della struttura
cartelle 01–16. ANAS fa esattamente questo: codifica ogni documento con un identificativo stabile.

Inoltre i documenti ANAS aprono con un glossario delle figure (committente, RL, CSE, impresa
affidataria, POS, PSC, RLS, RSPP, VVF…) che è **lo stesso insieme di entità del nostro schema
anagrafica v2.0** (`persone_committente`, `imprese`, `persone_terzi`). La stazione appaltante reale
modella gli stessi soggetti che abbiamo modellato noi.

Infine, sulla **catena del POS** ANAS e la prassi confermano il percorso che abbiamo previsto nel
documento RACI: l'impresa esecutrice consegna il POS all'**affidataria**, che lo trasmette al **CSE**
per la verifica di idoneità. → Coincide con la voce "Verifica POS" (#4) del nostro `chi-redige-firma-invia.md`.

Nota di scopo: ANAS, come grande stazione appaltante, su opere maggiori spinge verso la **gestione
informativa digitale / BIM** (art. 43 Codice Contratti, modelli informativi di cantiere associati al
PSC). È il livello LS3 della UNI/PdR 168 — fuori dallo scope di SafeHub, che resta uno strumento
personale del CSE (LS1-LS2), non la piattaforma BIM della stazione appaltante. La distinzione è netta
e va tenuta: SafeHub non compete con i sistemi BIM del committente, li affianca dal lato del CSE.

---

## 5. COSA IMPARIAMO PER SAFEHUB (azioni concrete)

1. **Validazione del modello.** SafeHub Archivio è, nei fatti, un'implementazione LS1-LS2 della
   UNI/PdR 168. Possiamo dirlo: il progetto è conforme allo standard di settore senza averlo inseguito.

2. **La matrice RACI come strumento stabile.** Conviene estendere `chi-redige-firma-invia.md` da 7
   documenti a una **matrice RACI completa** di tutti i documenti gestiti (anche NC, eventi, ODS,
   POS documentale): diventa la tabella di verità di "chi fa cosa" per ogni modulo, in linea con lo
   standard. È un piccolo investimento che ripaga.

3. **Stati di approvazione come vocabolario.** Adottare esplicitamente, nei metadati dei documenti
   Flusso B, gli stati della UNI 11337 (da approvare / approvato / approvato con commenti / non
   approvato) accanto ai nostri (Bozza/Finalizzato/Protocollato) rende SafeHub "parlante" lo stesso
   linguaggio di un'eventuale piattaforma del committente.

4. **Non serve salire a LS3.** BIM/blockchain/Digital Twin sono fuori scopo per il caso d'uso del PO.
   Lo standard stesso li colloca come livello avanzato opzionale. Conferma il principio "non
   sovradimensionare".

5. **Riferimento citabile.** Se mai servisse giustificare l'architettura SafeHub al committente o in
   sede di audit, la UNI/PdR 168:2024 è il riferimento che legittima l'approccio "cartelle
   strutturate + metadati + matrice responsabilità".

---

## 6. NOTA DI METODO (perché questo confronto conta)

Non abbiamo copiato la UNI/PdR 168 (non la conoscevamo mentre costruivamo il modello). Ci siamo
arrivati per ragionamento sul flusso reale del CSE. Il fatto che il risultato **coincida con lo
standard nazionale** è la conferma più forte che il modello è solido: due percorsi indipendenti — il
nostro ragionamento e il lavoro di INL/INAIL/ANCE — sono arrivati alla stessa struttura. Quando
accade, di solito vuol dire che la struttura è quella giusta.

> Suggerimento operativo: il PO può scaricare gratuitamente la UNI/PdR 168:2024 dal sito UNI (previa
> registrazione) per avere sottomano l'Appendice A (Matrice RACI) e l'Appendice B (Modulistica), utili
> come riscontro quando costruiremo i singoli moduli.

---

*Fonti: UNI/PdR 168:2024 (gestione digitale documentazione sicurezza cantieri; firmatari INL, INAIL,
ANCE, CISL, AIAS); UNI 11337 (stati di lavorazione/approvazione); atti pubblici ANAS SpA
(nomenclatura documentale codificata, glossario figure sicurezza); D.Lgs 81/2008 artt. 90, 92, 99,
100, 101, All. XV/XVII; D.Lgs 36/2023 Codice Contratti artt. 43 (gestione informativa digitale/BIM) e
126 (ispettore di cantiere); modulistica CSE standard appalti pubblici. Ricerca 31/05/2026.*
