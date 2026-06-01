# MODULO ANAGRAFICA — Design per SafeHub Archivio
## Il cuore dell'ecosistema · v1.0 · 31 maggio 2026

> **Cosa è questo documento.** Il design del modulo Anagrafica di SafeHub Archivio: come si usa, come
> è organizzato, come gestisce scadenze e alert, come esporta verso SafeCant. Segue il livello di cura
> del design del Verbale di Riunione. **Lo schema dei DATI non è ripetuto qui**: vive in
> `schema-anagrafica-canonico-v2.md` (v2.0) ed è la fonte di verità. Questo documento progetta il
> COMPORTAMENTO del modulo sopra quello schema. Si discute e si corregge qui, prima di scrivere codice.

> **Perché si parte da qui.** L'Anagrafica è il modulo fondante: produce il dato che tutto il resto
> consuma. Verifiche POS, ITP, NC, conformità, e soprattutto **SafeCant** dipendono da questo. Se
> l'anagrafica è giusta, il resto poggia su roccia. Per questo è il primo `.md` di design.

---

## 1. INQUADRAMENTO

### 1.1 Cosa fa il modulo
Gestisce tutte le entità anagrafiche di un lotto secondo lo schema v2.0: lotto, imprese, lavoratori,
mezzi, attrezzature, noli, persone committente, persone terzi. Per ognuna: creazione, modifica,
consultazione, cestino, gestione documenti/scadenze. E **esporta** l'anagrafica nel file condiviso
che SafeCant importa.

### 1.2 Cosa NON fa (confini netti)
- **Non blocca mai** (principio P3 dello schema): i campi guida sono warning, mai errori di salvataggio.
- **Non gestisce il workflow documentale** dei Flussi B/C: quello è di altri moduli. Qui i "documenti"
  sono gli allegati di conformità delle entità (DURC, attestati, libretti), non gli atti del CSE.
- **Non è multi-utente**: è il PO sul PC ufficio. SafeCant è sola lettura sull'anagrafica.

### 1.3 Principi che il modulo deve incarnare
Sono i 5 principi dello schema, resi comportamento UI:
- **P1 cascata** → si lavora sempre dentro un lotto selezionato; ogni entità mostra a quale lotto/impresa appartiene.
- **P2 assegnazione univoca** → creare un lavoratore/mezzo/attrezzatura/nolo richiede di scegliere l'impresa. Mai "appeso al cantiere".
- **P3 guida non blocca** → warning gialli, mai blocchi rossi al salvataggio.
- **P4 conformità incorporata** → la UI evidenzia i documenti attesi per `tipoRapporto` (verde/giallo/grigio).
- **P5 compatibilità** → nomi campo dello schema rispettati alla lettera.

---

## 2. STORAGE — FILE = STATO

Coerente col modello dell'ecosistema. L'anagrafica del lotto vive come file JSON in OneDrive, l'IDB è
solo cache di indicizzazione.

### 2.1 Dove vivono i dati
**Decisione PO (31/05): un file unico per lotto** (non un file per collezione). Tutte le 8 collezioni
dello schema vivono dentro `anagrafica_CZ399.json`. Coerente con lo schema v2.0 (§2 intestazione) e
con il modello "il file è il dato": un lotto = un file leggibile e auto-contenuto.

```
SafeHub-CSE-Lavori/CZ399/15_Anagrafica/
└── anagrafica_CZ399.json              ← file di lavoro UNICO (variante COMPLETA, con blob)
                                          contiene tutte le 8 collezioni dello schema

SafeHub-Anagrafiche/                    ← cartella OneDrive CONDIVISA (PO scrive, colleghi leggono)
└── anagrafica_CZ399_2026-05-31.json   ← snapshot LEGGERO per SafeCant, scritto su comando (§7)
```

Lo snapshot leggero NON sta in una sottocartella del lotto, ma direttamente nella cartella condivisa
`SafeHub-Anagrafiche/` da cui i colleghi leggono (contratto OneDrive dell'ecosistema).

### 2.2 Due varianti, uno schema (ribadito perché è il punto critico)
- **COMPLETA**: il file di lavoro interno. `base64` pieni (PDF allegati, foto, libretti).
- **LEGGERA**: lo snapshot che va in `SafeHub-Anagrafiche` per SafeCant. `base64 = ""`, tutto il
  resto identico. **Le chiavi sono le STESSE.** Cambia solo se i blob sono pieni o vuoti.
- È questo che garantisce che "gli aggiornamenti seguano identico schema" tra Archivio e SafeCant.

### 2.3 IDB come cache
All'avvio, Archivio legge `anagrafica_CZ399.json` e popola un indice IDB per ricerche/scadenze rapide.
Se l'IDB si perde, si rigenera dal file. Il file è canonico.

---

## 3. NAVIGAZIONE DEL MODULO

### 3.1 Le sotto-sezioni (dalla mappa Archivio, area ANAGRAFICHE)
Sette voci, una per collezione dello schema:
1. **Anagrafica Cantiere** (il lotto: dati + ruoli istituzionali) — area CANTIERE, ma è la radice
2. **Imprese**
3. **Lavoratori**
4. **Mezzi e Attrezzature** — **una sola voce con due tab** (decisione PO 31/05): tab "Mezzi"
   (collezione `mezzi`, semoventi/sollevamento) + tab "Attrezzature" (collezione `attrezzature`, non
   semoventi). Due collezioni distinte nello schema, una sola voce di menu per ergonomia.
5. **Noli**
6. **Personale della Sicurezza** (persone_committente)
7. **Enti Terzi** (persone_terzi)

### 3.2 Pattern comune a tutte le sotto-sezioni
Ogni sotto-sezione è un **cruscotto** (non un elenco — §5) + un **editor** (form di dettaglio — §6).
Stesso scheletro Alpine riusato: cambia il modello dati e le colonne, non la meccanica. Questo è ciò
che rende il modulo costruibile in modo incrementale: fatta Imprese, le altre sono variazioni.

### 3.3 Il contesto "lotto corrente"
Una sola fonte autorevole del lotto selezionato (contro la frammentazione di V3). Tutte le viste
filtrano per `lotto_id` corrente. Cambiare lotto ricarica i cruscotti.

---

## 4. ORDINE DI COSTRUZIONE INTERNO (dipendenze)

Le entità hanno dipendenze di chiave esterna. L'ordine di costruzione rispetta la cascata:

```
1. LOTTO            (radice, nessuna dipendenza)
2. PERSONE COMMITT. (per popolare i ruoli istituzionali del lotto)
3. IMPRESE          (dipendono dal lotto; l'affidataria si lega al lotto)
4. LAVORATORI       (dipendono da impresa_id)
5. MEZZI            (dipendono da impresa_id; opz. nolo_id)
6. ATTREZZATURE     (dipendono da impresa_id; opz. nolo_id)
7. NOLI             (dipendono da impresa_utilizzatrice_id; legano mezzo/attrezzatura)
8. ENTI TERZI       (indipendenti, ultimi)
9. EXPORT           (quando le entità esistono → §7)
```

Si costruisce e si collauda una sotto-sezione alla volta. Lotto + Imprese + Lavoratori sono il
minimo per un export utile a SafeCant.

---

## 5. IL CRUSCOTTO DI OGNI SOTTO-SEZIONE

Applica il principio trasversale (architettura sezioni §7): ogni archivio è un cruscotto con
scadenze e alert, mai un elenco.

### 5.1 Struttura visiva (dall'alto in basso)
1. **Pannello alert** (in cima, sempre visibile): riepilogo di ciò che richiede attenzione ORA.
   Es. imprese: "🔴 2 DURC scaduti · 🟠 3 patenti crediti sotto 15 · 🟠 1 polizza in scadenza (12 gg)".
   Cliccando un alert si filtra la lista su quegli elementi.
2. **Barra strumenti**: ricerca testuale · filtri (per impresa, tipoRapporto, stato scadenze) ·
   ordinamento · pulsante "Nuovo".
3. **Lista a card o righe**: ogni elemento con i metadati chiave in colonna + **semaforo conformità**.
4. **Contatori sintetici**: totali per categoria ("18 imprese: 12 ok, 4 warning, 2 critiche").

### 5.2 Il semaforo conformità (colori = gradazione, mai bloccante)
Coerente con `documenti-obbligatori-facoltativi.md`:
- 🔴 rosso: manca un documento OBBLIGATORIO o è scaduto
- 🟠 giallo: manca un CONDIZIONATO pertinente, o documento in scadenza (entro soglia, default 30 gg)
- 🟢 verde: tutti i documenti attesi presenti e validi
- ⬜ grigio: documento non pertinente per quel `tipoRapporto`

Il colore è **calcolato**, non memorizzato: deriva dall'incrocio tra documenti presenti e tabella
"documenti attesi per tipoRapporto" (schema §12). Mai impedisce un'azione: è informazione.

### 5.3 Scadenze — cosa monitora ogni sotto-sezione
| Sotto-sezione | Campi a scadenza monitorati |
|---|---|
| Imprese | DURC, polizza RC, patente crediti (stato/punteggio), documenti[].scadenza |
| Lavoratori | attestatoFormazione.scadenza, visitaMedica.scadenza, abilitazioni[].scadenza |
| Mezzi | verifichePeriodiche[].prossima |
| Attrezzature | verifiche[].prossima, documentiSpecifici[].scadenza (PiMUS) |
| Noli | dataFine, attestazioneBuonoStato |
| Persone committente/terzi | — (nessuna scadenza) |

### 5.4 Soglia di preavviso PER DOCUMENTO (decisione PO 31/05)
Non un default unico, ma una soglia di preavviso **tarata per tipo di documento** sulla sua
criticità. Le scadenze che, se mancate, possono causare un incidente con un mezzo o una persona, sono
trattate come **CRITICHE** e hanno preavviso lungo + non si possono "spegnere".

Tabella soglie (valori iniziali, regolabili dal PO nelle impostazioni):

| Documento | Soglia preavviso | Criticità |
|---|---|---|
| Abilitazione/patentino operatore (gruista, PLE, carrellista) | 60 gg | 🔴 CRITICA |
| Verifica periodica mezzo di sollevamento (collaudo gru/PLE) | 60 gg | 🔴 CRITICA |
| Idoneità sanitaria lavoratore (visita medica) | 45 gg | 🔴 CRITICA |
| PiMUS / autorizzazione ponteggi | 60 gg | 🔴 CRITICA |
| Patente a crediti impresa (punteggio/stato) | 45 gg | 🔴 CRITICA |
| Attestato formazione (generale/specifica) | 45 gg | 🟠 alta |
| DURC | 30 gg | 🟠 alta |
| Polizza RC | 30 gg | 🟠 alta |
| Altri documenti | 30 gg (default) | 🟢 normale |

### 5.5 Trattamento speciale delle scadenze CRITICHE (la tua richiesta: "nessuna sorpresa")
Una soglia di preavviso lunga non basta: serve che una scadenza critica **non possa passare
inosservata**. Quindi, per i documenti marcati 🔴 CRITICA:

1. **Doppio canale di allerta**: compaiono nel pannello alert della loro sotto-sezione *e* in un
   **cruscotto generale scadenze** a livello di lotto (vista trasversale che aggrega le scadenze
   critiche di tutte le entità: "cosa scade nei prossimi 60 giorni su tutto il cantiere").
2. **Stato GIÀ SCADUTO sempre in cima e non silenziabile**: un patentino o un collaudo scaduto resta
   rosso fisso finché non viene aggiornato. Non si può "marcare come visto" per farlo sparire — può
   solo essere risolto caricando il documento aggiornato.
3. **Evidenza sul soggetto operativo**: se un lavoratore ha il patentino scaduto, il suo semaforo è
   rosso anche nella vista Lavoratori; se un mezzo ha il collaudo scaduto, idem nella vista Mezzi.
   La criticità "sale" fino a essere visibile ovunque quel soggetto appare.
4. **Conteggio in evidenza all'apertura del modulo**: la home dell'Anagrafica apre con un riepilogo
   "🔴 N scadenze critiche scadute · 🔴 M in scadenza nei prossimi 60 gg" — è la prima cosa che vedi.

> Nota di responsabilità: questo NON solleva il CSE dalla vigilanza (la legge resta in capo a lui),
> ma fa sì che lo strumento lavori PER lui nel ricordare ciò che non deve sfuggire. È esattamente il
> valore del cruscotto rispetto a un elenco passivo.

---

## 6. L'EDITOR (form di dettaglio)

### 6.1 Comportamento generale
- Form strutturato per l'entità, campi raggruppati per blocchi logici (identificazione, rapporto,
  conformità, documenti).
- **Salvataggio mai bloccato** (P3): si può salvare un'impresa con solo la ragione sociale. I campi
  guida mostrano un hint ("consigliato") ma non impediscono il salvataggio.
- **Validazioni = warning**: alla chiusura, un riepilogo "questa impresa ha 3 documenti attesi
  mancanti" — informativo, non bloccante.

### 6.2 Il pattern "documenti attesi" nell'editor impresa (cuore di P4)
Quando il PO seleziona il `tipoRapporto`, la sezione documenti dell'editor si **adatta**:
- mostra in evidenza (verde/giallo) i documenti attesi per quel tipo (da schema §12);
- mostra in grigio/collassati quelli non pertinenti (es. POS per NOLO_FREDDO);
- ogni documento atteso ha un pulsante "carica" + campo scadenza.
Esempio: passando un'impresa da FORNITURA a FORNITURA_POSA, compaiono POS/idoneità/patente come attesi.

### 6.3 Assegnazione univoca nell'editor (cuore di P2)
Creare lavoratore/mezzo/attrezzatura/nolo apre un selettore impresa **obbligatorio nella UX** (non
nel salvataggio): la prima cosa che si sceglie è "di quale impresa". Un lavoratore senza impresa è
possibile salvarlo (P3) ma segnalato come orfano nel cruscotto.

### 6.4 Gestione documenti e blob
Upload PDF → salvato come base64 nel file COMPLETO. Foto idem. Questi blob vengono **svuotati**
nell'export leggero (§7). L'editor mostra anteprima/download del documento caricato.

---

## 7. EXPORT VERSO SAFECANT — il ponte

> È il pezzo che mancava per chiudere il giro end-to-end. Lo progettiamo qui perché è parte
> integrante dell'anagrafica, non un modulo separato.

### 7.1 Cosa fa
Genera lo snapshot LEGGERO dell'anagrafica del lotto e lo scrive in `SafeHub-Anagrafiche/` (cartella
OneDrive condivisa, PO scrive → colleghi leggono).

### 7.1-bis Quando — EXPORT MANUALE (decisione PO 31/05)
**L'export è un'azione manuale del PO, attivata da un pulsante "Esporta per SafeCant".** Non
automatico. Motivazione da CTO: l'anagrafica è dato a valore legale che va a persone terze (i
colleghi); è il PO che decide quando una versione è "pronta da distribuire", non un automatismo.
Evita di spargere stati intermedi/incompleti e tempeste di sync OneDrive.

UX del pulsante:
- Posizione: in cima alla sezione Anagrafica (a livello di lotto, non di sotto-sezione: esporta TUTTE
  le collezioni del lotto in un colpo).
- Indicatore di stato accanto al pulsante: *"Ultimo export per SafeCant: 31/05 ore 14:32"* +
  eventuale badge *"modifiche non ancora esportate"* se l'anagrafica è cambiata dall'ultimo export
  (promemoria gentile, non blocco).
- Al click: conferma rapida ("Esportare l'anagrafica del lotto CZ399 per i colleghi?") → genera →
  scrive il file → conferma ("✓ Esportato. I colleghi vedranno l'aggiornamento al prossimo sync.").

### 7.2 Trasformazione COMPLETA → LEGGERA
1. Prende `anagrafica_CZ399.json` (completa).
2. Svuota tutti i `base64` → `""` (mantiene filename, scadenza, metadati).
3. Imposta intestazione: `variante: "leggera"`, `generato_il`, `generato_da_versione`.
4. Scrive `anagrafica_CZ399_AAAA-MM-GG.json` in `SafeHub-Anagrafiche/`.
5. OneDrive sincronizza → i colleghi vedono il file aggiornato sull'iPad.

### 7.3 Cosa serve a SafeCant (e quindi cosa NON svuotare)
SafeCant sul campo deve sapere CHI/COSA c'è e mostrare le scadenze. Quindi nello snapshot leggero
restano pieni: anagrafiche testuali (nomi, ragioni sociali, tipoRapporto), assegnazioni
(`impresa_id`), scadenze, metadati documenti. Si svuotano solo i contenuti binari (PDF/foto), che sul
campo non servono.

### 7.4 Versionamento
Il file export è datato (`anagrafica_CZ399_AAAA-MM-GG.json`). SafeCant, importando, confronta
`generato_il` e tiene il più recente. Poiché l'export è manuale, ogni file corrisponde a una
decisione consapevole del PO di distribuire quella versione. Ri-esportare lo stesso giorno
sovrascrive il file del giorno (idempotente per data).

---

## 8. INTEGRAZIONE LATO SAFECANT (cosa cambia là)

> SafeCant è già online. Questo modulo definisce il contratto; i fix di SafeCant sono lavoro separato
> ma vincolato a questo schema. Qui si fissa cosa SafeCant deve fare con l'anagrafica.

### 8.1 Import
SafeCant importa lo snapshot leggero nell'IDB locale (store `cache_anagrafica`). Da quel momento, in
fase di compilazione verbale, l'ispettore **seleziona** imprese/lavoratori/mezzi dall'anagrafica
invece di scriverli a mano. Questo aggancia i campi oggi vuoti (`impresa_id`, `anagrafica_ref`,
`origine`) ai dati reali.

### 8.2 Il bug del nome compilatore (collegato)
Il nome del compilatore che non compare è probabilmente legato al redattore configurato in
impostazioni: l'ispettore di cantiere. Va verificato sul codice, ma l'ipotesi è che si risolva
nello stesso lavoro di aggancio dati (il redattore è una persona, idealmente coerente con lo schema).
**Da confermare leggendo il codice di SafeCant prima di dare per certa la causa.**

### 8.3 Identità di schema
La regola d'oro: SafeCant legge le STESSE chiavi che Archivio scrive. Nessuna trasformazione di nomi
campo tra i due. Se un domani lo schema cresce, cresce in un punto solo (`schema-anagrafica-canonico-v2.md`)
e entrambi i prodotti si adeguano.

---

## 9. DECISIONI PRESE (design congelato il 31/05)

Tutte le decisioni di merito sono state prese. Il design è pronto per il prompt di costruzione.

1. **File unico per lotto** (§2.1).
2. **Mezzi e Attrezzature**: voce unica a due tab (§3.1).
3. **Export manuale** con pulsante "Esporta per SafeCant" (§7.1-bis).
4. **Nessuna migrazione da V3**: i dati reali sono solo anagrafiche compilate, il PO le ricompila nel
   nuovo SafeHub. Niente import una-tantum, niente codice di migrazione. Si nasce puliti con schema
   v2.0 e prefissi nuovi (`pc_`, `imp_`, ecc.). ✅ Semplifica: il Modulo 27 "migrazione dati" del
   piano Archivio, per l'anagrafica, non serve.
5. **Soglia preavviso scadenze PER DOCUMENTO** (non un default unico) — vedi §5.4. Motivazione del PO:
   nessuna sorpresa su scadenze critiche di sicurezza (patentino gruista, collaudo mezzo di
   sollevamento). Ogni tipo di documento ha la sua soglia di preavviso, tarata sulla criticità.

---

## 10. CRITERIO DI CHIUSURA DEL MODULO

Il modulo Anagrafica è chiuso quando:
- Tutte e 7 le sotto-sezioni creano/modificano/cestinano correttamente, rispettando lo schema v2.0;
- I cruscotti mostrano scadenze e semaforo conformità corretti per tipoRapporto;
- **Le scadenze critiche di sicurezza** (patentini operatore, collaudi sollevamento, idoneità
  sanitarie, PiMUS, patente crediti) sono monitorate con soglia per documento, evidenziate nel
  cruscotto generale scadenze del lotto, e gli stati "già scaduto" restano rossi non silenziabili;
- L'assegnazione univoca funziona (no entità orfane non segnalate);
- L'export leggero produce un file che SafeCant importa senza errori, con schema identico;
- Il giro end-to-end è dimostrato: PO crea anagrafica → esporta → SafeCant importa → ispettore
  seleziona impresa/lavoratore in un verbale.

---

## 11. PROSSIMI PASSI

1. Il PO rivede questo design e risponde alle 5 domande aperte (§9).
2. Si corregge il documento fino a congelarlo.
3. Solo allora: prompt di costruzione per Claude Code, sotto-sezione per sotto-sezione, partendo da
   Lotto → Persone Committente → Imprese (il minimo per un export utile).
4. In parallelo, audit leggero del codice SafeCant esistente per confermare la causa del bug nome
   compilatore e progettare l'aggancio import.

---

*Design modulo Anagrafica v1.0 — 31 maggio 2026. Poggia su `schema-anagrafica-canonico-v2.md` (dati) e
`safehub-archivio-architettura-sezioni.md` (navigazione). Progetta il comportamento, non ripete lo
schema. Repo pulito, nessuna modifica a V3. Da discutere e congelare prima del codice.*
