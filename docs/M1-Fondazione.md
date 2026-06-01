# MODULO M1 — FONDAZIONE di SafeHub Archivio
## Lo scheletro su cui poggia tutto · v1.1 · 31 maggio 2026

> **Nota v1.1 — migliorie da analisi pre-costruzione di Claude Code (31 mag).** Cinque punti emersi
> confrontando il design con la realta' tecnica, tutti recepiti: (1) l'app va servita via HTTP, non da
> `file://` -> script di avvio (vedi 3.0); (2) il permesso sulla cartella scade al riavvio del browser
> -> pannello di riconnessione invece di errore (6.2); (3) primo avvio a vuoto -> onboarding esplicito
> in due passi (3.4); (4) gli indici IDB secondari seguono `Schema-Dati-Completo §4.1`, fonte canonica
> (sez. 4); (5) il Service Worker deve cachare anche i CDN Alpine e Tailwind Play (3.1).

> **Cosa è questo documento.** Il design del modulo fondante di SafeHub Archivio: lo scheletro tecnico
> (PWA desktop, accesso a OneDrive via File System Access API, IndexedDB come cache, gestione del
> "cantiere corrente", gestione errori, struttura repo). Ogni altro modulo poggia su questo. È il
> primo `.md` di costruzione perché senza fondazione non si costruisce nulla sopra. Lo schema dati di
> dettaglio vive in `safehub-contratto-tecnico.md`; qui si progetta il comportamento della fondazione.

> **Posizione nell'ecosistema.** Repo pulito `safehub-archivio`, nessuna modifica a V3. Stack: Alpine.js
> + vanilla JS + Tailwind (CDN), no build. Gira sul PC ufficio Windows 11 del PO (+ portatile
> autorizzato). Modello "file = stato": i file JSON in OneDrive sono i dati, l'IDB è solo cache.

---

## 1. INQUADRAMENTO

### 1.1 Cosa fa M1
- Avvia la PWA come app installabile su Windows (manifest + service worker).
- Aggancia la cartella radice OneDrive (`SafeHub-CSE-Lavori/`) via **File System Access API**.
- Inizializza l'IndexedDB di cache (`safehub_archivio_db`) con i suoi store.
- Stabilisce e mantiene il **cantiere corrente** (una sola fonte autorevole — lezione da V3).
- Offre lo scheletro UI condiviso: shell di navigazione, gestione errori, notifiche, stato sync.
- Espone i moduli `shared/` che tutti gli altri moduli useranno.

### 1.2 Cosa NON fa M1
- Non gestisce nessun documento specifico (lo fanno i moduli successivi).
- Non genera DOCX (è M6).
- Non contiene logica di anagrafica/flussi: solo l'impalcatura.

### 1.3 Principi che incarna
- **Una sola fonte del cantiere corrente** (contro la frammentazione su 3 fonti di V3 — debito noto).
- **File = stato**: l'IDB non è mai canonico; se perso, si rigenera dai file.
- **Resilienza**: se l'app si rompe, i dati restano leggibili in OneDrive come JSON in chiaro.
- **Capability detection**: funzioni che dipendono dall'ambiente (File System Access, Ollama) si
  attivano solo se disponibili; l'app degrada con grazia.

---

## 2. STRUTTURA DEL REPO (organizzazione per feature)

Dal `SafeHub.md` §7, fissata qui come scheletro concreto da creare in M1:

```
safehub-archivio/
├── index.html                 (shell: cruscotto generale + navigazione)
├── manifest.json              (PWA installabile Windows)
├── sw.js                      (service worker: cache asset)
├── README.md
├── shared/
│   ├── styles.css             (token CSS: colori, tipografia, spacing, animazioni)
│   ├── alpine-init.js         (store Alpine globale, registrazione componenti)
│   ├── idb.js                 (wrapper IndexedDB: open, get, put, delete, query per indice)
│   ├── filesystem.js          (File System Access API: aggancio cartella, read/write JSON, scansione)
│   ├── cantiere-corrente.js   (UNICA fonte del lotto selezionato — vedi §5)
│   ├── notifiche.js           (toast/alert UI uniformi)
│   ├── errori.js              (gestione errori centralizzata — vedi §6)
│   ├── a11y.js                (focus management, ARIA helper)
│   └── utils.js               (date, id, formattazioni)
├── moduli/
│   └── (vuoto in M1: lo riempiranno M2, M3, M4...)
└── templates/
    └── (vuoto in M1: template-safehub.docx arriva con M6)
```

M1 crea lo scheletro `shared/` e la shell. I moduli successivi aggiungono cartelle sotto `moduli/`.

---

## 3. PWA E AVVIO

### 3.0 L'app va servita via HTTP (non da file://)
File System Access API e Service Worker NON funzionano aprendo l'app da `file://`: il browser li
rifiuta. L'app va servita via HTTP locale. Soluzione senza build tools: due script inclusi nel repo,
`avvia.bat` (Windows) e `avvia.sh` (Ubuntu), che lanciano `python -m http.server 8080` nella cartella
del repo. E' un semplice server di file statici (una riga), non un build tool: non compila ne'
trasforma nulla. Il README spiega il passo unico. (Verificare la presenza di Python sul PC ufficio
Windows; su Ubuntu e' garantita.)

### 3.1 Installabilità Windows
- `manifest.json`: nome, icone, `display: standalone`, `start_url`. Installabile come app desktop.
- `sw.js`: cache degli asset statici (HTML, CSS, JS) E dei CDN usati a runtime (Alpine, Tailwind Play
  CDN), altrimenti l'app non si stila offline. Includere gli URL CDN precisi nella lista di cache.
  Nota: il Tailwind Play CDN e' adatto alla fase di costruzione; per la produzione si valutera' piu'
  avanti (non blocca ora).
- Niente offline-first spinto come SafeCant: l'Archivio gira su PC con OneDrive sempre presente. Il SW
  serve avvio veloce e robustezza, non lavoro offline sul campo.

### 3.2 Sequenza di avvio (boot)
```
1. Carica shell + Alpine + shared/
2. Apre IDB (safehub_archivio_db); se assente, lo crea con tutti gli store (§4)
3. Verifica capability: File System Access API disponibile?
   • sì  → procede
   • no  → messaggio chiaro ("apri con Edge/Chrome su desktop"), modalità lettura-limitata
4. Recupera handle cartella radice OneDrive (se già concesso in sessione precedente → IndexedDB
   handle persistente; altrimenti chiede al PO di selezionare la cartella)
5. Scansiona SafeHub-CSE-Lavori/ → popola cantieri_cache
6. Ripristina ultimo cantiere corrente (da impostazioni_archivio) o chiede di sceglierne uno
7. Mostra il cruscotto generale
```

---

### 3.4 Primo avvio e onboarding (caso a vuoto)
Se l'IDB e' vuoto e non esiste alcun cantiere, M1 mostra un onboarding esplicito nella `<main>`, non
una schermata vuota:
- **Step 1** — se non c'e' un handle cartella valido: "Seleziona la cartella SafeHub-CSE-Lavori".
- **Step 2** — se la cartella e' agganciata ma non contiene cantieri: "Nessun cantiere trovato - vai
  in Gestione > Cantieri per creare il primo".
- Poi il normale cruscotto cantieri.

## 4. INDEXEDDB — INIZIALIZZAZIONE CACHE

Database `safehub_archivio_db` v1. Store creati in M1 (schema dal contratto tecnico §6):

| Store | keyPath | Scopo |
|---|---|---|
| `cantieri_cache` | `cantiere_id` | indice dei cantieri letti dalla cartella radice |
| `documenti_indice` | `id_documento` | indice di tutti i documenti per ricerca rapida |
| `verbali_ricevuti_inbox` | `id` | verbali sopralluogo arrivati da SafeCant (per M7) |
| `impostazioni_archivio` | `key` | cache della config che vive in `_config/` |
| `cache_anagrafica` | `cantiere_id` | cache anagrafica per ricerche nei moduli |

> **Indici secondari**: gli store hanno indici secondari (per cantiere, tipo, stato, data...) che NON
> sono elencati qui: la fonte canonica e' `Schema-Dati-Completo §4.1`. M1 li crea secondo quel
> documento (in caso di lacuna o differenza, vince Schema-Dati-Completo).

**Regola d'oro**: ogni store è cache. La verità sono i file. M1 fornisce in `idb.js` anche una
funzione `rigeneraIndice()` che ri-scansiona la cartella e ricostruisce gli store da zero. Questo è il
recupero quando l'IDB è incoerente o perso.

---

## 5. IL CANTIERE CORRENTE (una sola fonte — lezione da V3)

> In V3 il "cantiere corrente" era frammentato su 3 fonti diverse e `window.appState.currentProject`
> non era aggiornato da navigation.js (debito noto). M1 risolve questo per costruzione.

### 5.1 Fonte unica
Un solo store Alpine globale `$store.cantiere` espone il lotto corrente. Nessun altro punto del codice
tiene una copia propria. Tutti i moduli leggono da qui.

### 5.2 Comportamento
- Selezione del cantiere: un selettore nella shell (sempre visibile, in alto).
- Al cambio: `$store.cantiere.seleziona(id)` → aggiorna lo store → emette evento `cantiere-cambiato`
  → i moduli in ascolto ricaricano i loro dati filtrati per `lotto_id`.
- Persistenza: l'ultimo cantiere scelto si salva in `impostazioni_archivio` e si ripristina al boot.
- Nessun modulo può "indovinare" il cantiere: lo chiede sempre allo store.

### 5.3 Contratto per gli altri moduli
Ogni modulo, all'attivazione, fa: leggi `$store.cantiere.id` → carica i tuoi dati di quel lotto. In
ascolto su `cantiere-cambiato` per ricaricare. Questo è il pattern che M3 (gestione cantieri) e M4
(anagrafica) useranno per primi.

---

## 6. GESTIONE ERRORI (centralizzata)

### 6.1 Pattern
Un modulo `errori.js` con una funzione unica `gestisciErrore(contesto, err, opzioni)` che:
- logga in console con contesto leggibile;
- mostra un toast utente comprensibile (non lo stack trace grezzo);
- distingue errori **recuperabili** (file momentaneamente non accessibile → riprova) da **fatali**
  (cartella radice non agganciata → blocca con istruzioni).

### 6.2 Casi specifici della fondazione
- **File System Access negato/non disponibile**: messaggio guida, non crash.
- **Permesso cartella scaduto al riavvio del browser**: l'handle resta salvato in IDB ma il permesso
  torna a `'prompt'` (non `'granted'`) a ogni riavvio. NON e' un errore: M1 mostra un **pannello di
  riconnessione** chiaro e rassicurante ("Clicca per riconnettere la cartella OneDrive"), un clic,
  nessun allarme. E' il caso normale di inizio giornata, non un guasto.
- **Cartella OneDrive non in sync** (file in stato "cloud-only"): rileva e avvisa ("OneDrive sta
  ancora scaricando, riprova tra poco").
- **JSON corrotto/illeggibile**: isola il file problematico, avvisa, continua col resto (non blocca
  l'intero avvio per un file rotto).
- **IDB non apribile**: tenta ricreazione; se fallisce, modalità sola-lettura-da-file.

---

## 7. SHELL UI CONDIVISA

### 7.1 Layout
- **Barra superiore**: logo/nome app · selettore cantiere corrente · stato sync OneDrive · impostazioni.
- **Menu laterale**: le aree della mappa sezioni (Cantiere, Anagrafiche, Sicurezza, Documentazione,
  Operatività ⏸, Gestione). In M1 le voci esistono ma puntano a moduli non ancora costruiti
  (placeholder "in costruzione").
- **Area centrale**: il modulo attivo si monta qui.

### 7.2 Stato sync OneDrive (indicatore trasversale)
Poiché i dati sono file su OneDrive, la shell mostra sempre lo stato: ✓ allineato / ⏳ in sync /
⚠ file cloud-only da scaricare. È informazione, non blocco.

### 7.3 Accessibilità (a11y) dalla fondazione
ARIA roles sulla navigazione, focus management ai cambi vista, tabindex logici. Impostati in M1 così
tutti i moduli li ereditano invece di rincorrerli dopo.

---

## 8. COSA EREDITA OGNI MODULO SUCCESSIVO

M1 è la base. Quando si costruirà M2/M3/M4/..., ognuno troverà già pronto:
- lo store `$store.cantiere` (cantiere corrente);
- `idb.js` per la cache e `rigeneraIndice()`;
- `filesystem.js` per leggere/scrivere JSON in OneDrive;
- `errori.js` e `notifiche.js` per UX uniforme;
- la shell in cui montarsi e il menu in cui comparire;
- i token CSS di `styles.css`.
Nessun modulo reimplementa queste cose: le usa.

---

## 9. CRITERIO DI CHIUSURA DI M1

M1 è chiuso quando:
- la PWA si installa su Windows e si avvia;
- l'app e' servita via HTTP (script avvia.bat/avvia.sh) e NON tenta di girare da file://;
- la sequenza di boot funziona, incluso l'aggancio cartella OneDrive e la sua persistenza tra sessioni;
- al riavvio del browser, se il permesso e' 'prompt', compare il pannello di riconnessione (non un errore);
- al primo avvio a vuoto, l'onboarding in due passi guida fino alla creazione del primo cantiere;
- l'IDB si crea con tutti gli store e `rigeneraIndice()` ricostruisce dalla cartella;
- il cantiere corrente è selezionabile, persistente, e propaga l'evento `cantiere-cambiato`;
- la gestione errori intercetta i 4 casi di §6.2 senza crash;
- la shell mostra navigazione, selettore cantiere e stato sync;
- un modulo placeholder dimostra che può montarsi nella shell e leggere il cantiere corrente.

---

## 10. PROSSIMI PASSI

1. Il PO rivede questo design.
2. Congelato M1 → prompt di costruzione atomico per Claude Code (solo la fondazione, niente moduli).
3. Collaudo M1 sul PC ufficio (Fase F della Procedura).
4. Poi si procede con M6 (motore DOCX) — il secondo pilastro trasversale.

---

*Design M1 Fondazione v1.0 — 31 maggio 2026. Poggia su `safehub-contratto-tecnico.md` (schema IDB,
File System) e `SafeHub.md` (architettura, file=stato). Repo pulito, nessuna modifica a V3.*
