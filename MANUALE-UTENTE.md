# MANUALE UTENTE — SafeHub Archivio e SafeCant
## Guida operativa per il CSE e il tecnico di cantiere · giugno 2026

---

## INDICE

1. [Introduzione — cosa sono e come lavorano insieme](#1-introduzione)
2. [Primo avvio e impostazioni](#2-primo-avvio-e-impostazioni)
   - 2.1 [SafeHub Archivio — collegare la cartella OneDrive](#21-safehub-archivio--collegare-la-cartella-onedrive)
   - 2.2 [SafeHub Archivio — le impostazioni principali](#22-safehub-archivio--le-impostazioni-principali)
   - 2.3 [SafeCant — impostazioni iniziali](#23-safecant--impostazioni-iniziali)
3. [SafeHub Archivio — gestione dei cantieri](#3-safehub-archivio--gestione-dei-cantieri)
4. [SafeHub Archivio — anagrafica del cantiere](#4-safehub-archivio--anagrafica-del-cantiere)
   - 4.1 [Imprese](#41-imprese)
   - 4.2 [Lavoratori](#42-lavoratori)
   - 4.3 [Mezzi e Attrezzature](#43-mezzi-e-attrezzature)
   - 4.4 [Esportare l'anagrafica verso SafeCant](#44-esportare-lanagrafica-verso-safecant)
5. [SafeCant — preparazione prima del sopralluogo](#5-safecant--preparazione-prima-del-sopralluogo)
6. [SafeCant — compilare il verbale di sopralluogo](#6-safecant--compilare-il-verbale-di-sopralluogo)
   - 6.1 [Step 1 — Dati generali](#61-step-1--dati-generali)
   - 6.2 [Step 2 — Presenze in cantiere](#62-step-2--presenze-in-cantiere)
   - 6.3 [Step 3 — Presenti al sopralluogo](#63-step-3--presenti-al-sopralluogo)
   - 6.4 [Step 4 — Non conformità](#64-step-4--non-conformità)
   - 6.5 [Step 5 — Firme e finalizzazione](#65-step-5--firme-e-finalizzazione)
7. [SafeCant — salvare, finalizzare e sbloccare](#7-safecant--salvare-finalizzare-e-sbloccare)
8. [SafeHub Archivio — ricevere e archiviare il verbale](#8-safehub-archivio--ricevere-e-archiviare-il-verbale)
9. [Rubrica Numeri Utili](#9-rubrica-numeri-utili)
10. [Domande frequenti e problemi comuni](#10-domande-frequenti-e-problemi-comuni)
11. [Glossario](#11-glossario)

---

## 1. Introduzione

### Le due applicazioni

**SafeHub Archivio** è l'applicazione che il CSE usa in studio, sul PC. Gestisce l'anagrafica completa del cantiere (imprese, lavoratori, mezzi, attrezzature, documenti di conformità), riceve i verbali di sopralluogo compilati sul campo, li rifinisce e li archivia. Gira su **Microsoft Edge o Google Chrome** su Windows.

**SafeCant** è l'applicazione che il tecnico usa sul campo, durante il sopralluogo, su tablet o smartphone. Permette di compilare il verbale, rilevare le presenze, raccogliere le firme e inviare il file al CSE. Gira su **Safari su iPad** (consigliato) o Chrome su Android. Non funziona su Internet Explorer.

### Come lavorano insieme

```
STUDIO (PC ufficio)                    CAMPO (tablet/smartphone)
──────────────────                     ──────────────────────────

SafeHub Archivio                           SafeCant
   │                                           │
   │  1. Esporta anagrafica ─────────────────► │  2. Importa anagrafica
   │     (imprese, lavoratori, mezzi)          │     (vede gli elenchi del cantiere)
   │                                           │
   │                                           │  3. Compila verbale, rileva presenze,
   │                                           │     raccoglie firme
   │                                           │
   │  5. Importa il file JSON         ◄──────  │  4. Invia il file verbale
   │     ricevuto da SafeCant                  │     (tramite OneDrive o download)
   │
   │  6. Rifinisce il testo, controfirma come CSE,
   │     genera il DOCX, archivia il PDF
```

I dati non viaggiano via internet in modo diretto: la "lingua comune" tra le due app è una cartella **OneDrive** condivisa. SafeHub scrive lì l'anagrafica; SafeCant la legge. SafeCant deposita il file del verbale; SafeHub lo raccoglie.

---

## 2. Primo avvio e impostazioni

### 2.1 SafeHub Archivio — collegare la cartella OneDrive

Al primo avvio SafeHub mostra la schermata di benvenuto:

> *"Seleziona la cartella SafeHub-CSE-Lavori su OneDrive per iniziare a lavorare."*

**Come fare:**
1. Clicca il pulsante **"Seleziona cartella SafeHub-CSE-Lavori"**.
2. Si apre il selettore file del sistema operativo. Naviga fino alla cartella `SafeHub-CSE-Lavori` nella tua OneDrive (di solito in `C:\Users\<nome>\OneDrive\SafeHub-CSE-Lavori` oppure nella cartella sincronizzata del tenant aziendale).
3. Seleziona la cartella e clicca "Seleziona cartella" nella finestra del sistema.
4. Il browser chiede conferma: clicca **"Consenti"**.

Il collegamento viene ricordato per la sessione corrente. La prossima volta che apri SafeHub, se il browser non ricorda il permesso, compare il pannello:

> *"Riconnetti la cartella — Il browser chiede conferma per accedere alla cartella OneDrive. Succede normalmente ad ogni avvio. Un clic e sei dentro."*

Basta cliccare **"Riconnetti a SafeHub-CSE-Lavori"**: non è un errore, è il comportamento normale del browser.

> ⚠️ **Nota tecnica importante:** SafeHub richiede Edge o Chrome su Windows. Non funziona da Firefox né aprendo i file direttamente dalla cartella (protocollo `file://`). Usa sempre il server locale: avvia il file `avvia.bat` nella cartella dell'app, poi apri il browser all'indirizzo indicato.

#### Cambiare cartella (passaggio a un altro CSE)

Se lavori come sostituto o collabori con un altro CSE che ha una propria cartella `SafeHub-CSE-Lavori` distinta, puoi cambiare il collegamento senza riavviare l'app.

1. Vai in **Impostazioni** (icona ⚙ in alto a destra).
2. Nella scheda **"Preferenze"**, trova la sezione **"Cartella OneDrive"** che mostra il nome della cartella attuale.
3. Clicca **"Cambia cartella…"**.
4. Compare un pannello di conferma con l'avviso:
   > *"Il cantiere selezionato verrà deselezionato e la lista cantieri sarà ricostruita dalla nuova cartella."*
5. Clicca **"✓ Seleziona nuova cartella"** e scegli la nuova cartella nel selettore del sistema.

L'app ricollega e ricostruisce automaticamente l'elenco dei cantieri.

[SCREENSHOT: schermata di benvenuto con il pulsante "Seleziona cartella SafeHub-CSE-Lavori"]

[SCREENSHOT: pannello di riconnessione quotidiana]

---

### 2.2 SafeHub Archivio — le impostazioni principali

Clicca l'icona ⚙ **"Impostazioni"** nel menu laterale (sezione Gestione) o in alto a destra. Il modulo è organizzato in schede.

#### Scheda Identità CSE
Inserisci i tuoi dati: nome e cognome, qualifica (es. *Coordinatore Sicurezza in fase di Esecuzione*), titolo professionale, eventuali estremi dell'albo. Questi dati compaiono automaticamente come firma del CSE in tutti i documenti prodotti.

#### Scheda Firma permanente
Qui si imposta la firma grafica del CSE, usata in tutti i verbali:
- Clicca **"✏ Disegna firma"** per disegnarla sul tablet o con il mouse sul PC.
- Oppure clicca **"↑ Carica PNG"** per caricare un file immagine (PNG o JPEG) della tua firma.

La firma impostata qui viene proposta automaticamente ogni volta che devi controfirmare un verbale.

#### Scheda Logo
Carica il logo aziendale che compare nell'intestazione di tutti i documenti Word generati dall'app.

#### Scheda Moduli qualità
Definisce il codice e la versione dei moduli qualità del tuo sistema di gestione (es. Mod.VS.01 Rev.2). Questi dati compaiono nell'intestazione di ogni documento. Modificali se il tuo sistema di qualità aggiorna i codici.

#### Scheda Soglie scadenze
Imposta con quanti giorni di anticipo l'app deve avvisarti per ogni tipo di documento. Alcuni documenti critici (patentini operatore, collaudi mezzi di sollevamento, idoneità sanitarie) hanno soglie più lunghe e **non possono essere silenziati**: rimangono in rosso finché non vengono rinnovati.

#### Scheda Assistente AI
Permette di configurare e testare l'assistente AI locale (se disponibile sul PC ufficio). Se non è installato, questa scheda non ha effetto e l'app funziona normalmente senza AI.

#### Scheda Preferenze
Contiene: la sezione per cambiare la cartella OneDrive (vedi sopra), l'avviso di sincronizzazione OneDrive (in giorni) e il tema visivo (Chiaro o Scuro — il Scuro è in sviluppo).

---

### 2.3 SafeCant — impostazioni iniziali

Apri SafeCant sul tablet e tocca l'icona dell'ingranaggio ⚙ in alto a destra.

#### Dati personali
Inserisci il tuo **nome e cognome** e la tua **qualifica** (es. *Tecnico di cantiere*, *Ispettore di cantiere*). Questi dati compaiono come redattore in ogni verbale che invii.

> *Nota: se nome e qualifica sono vuoti, SafeCant ti avvisa prima di creare un verbale: "Prima di creare un verbale, imposta nome e qualifica nelle impostazioni."*

Puoi anche indicare un **Cantiere predefinito** (il codice del cantiere su cui lavori più spesso, es. `CZ399`): viene preselezionato quando crei un nuovo sopralluogo.

#### Firma permanente
Tocca **"Imposta firma"** e disegna la tua firma con il dito o con un pennino sul canvas. Questa firma viene proposta automaticamente come firma del redattore quando finalizzi un verbale, senza doverla ridisegnare ogni volta.

Tocca **"Conferma"** per salvarla, **"Cancella"** per azzerare il tratto e ricominciare.

[SCREENSHOT: schermata impostazioni SafeCant — sezione dati personali e firma]

---

## 3. SafeHub Archivio — gestione dei cantieri

Il selettore del cantiere corrente si trova sempre in alto, nella barra dell'app. Mostra il cantiere su cui stai lavorando in quel momento. Tutti i dati e i documenti sono sempre filtrati per il cantiere selezionato.

### Creare un nuovo cantiere

1. Clicca **"Cantieri"** (icona 🗂 nella barra in alto) oppure la voce **"Anagrafica Cantiere"** nel menu laterale.
2. Clicca **"+ Nuovo cantiere"**.
3. Inserisci il codice cantiere (es. `CZ399`) e il nome descrittivo. Il codice deve essere univoco e non contenere spazi o caratteri speciali.
4. Completa gli altri campi (committente, CUP, CIG, date, ruoli istituzionali) secondo disponibilità. Puoi lasciarli vuoti e compilarli dopo: il salvataggio non è mai bloccato.
5. Conferma: SafeHub crea automaticamente tutte le cartelle necessarie in OneDrive.

### Selezionare il cantiere corrente

Usa il selettore a tendina in alto, oppure clicca un cantiere dal cruscotto cantieri. Una volta selezionato, tutte le sezioni (Anagrafiche, Documenti, Verbali…) mostrano i dati di quel cantiere.

---

## 4. SafeHub Archivio — anagrafica del cantiere

L'anagrafica è il cuore del sistema. Contiene tutte le entità del cantiere: imprese, lavoratori, mezzi, attrezzature. È la fonte che SafeCant usa per mostrare gli elenchi sul campo durante il sopralluogo.

Ogni sezione dell'anagrafica ha la stessa struttura:
- Un **pannello di alert** in cima mostra i problemi più urgenti (documenti scaduti, patente crediti sospesa, idoneità sanitarie scadute).
- Una **lista a card** con un semaforo di conformità per ogni elemento.
- Un pulsante **"+ Nuovo..."** per aggiungere un nuovo elemento.

### I colori del semaforo di conformità

Ogni impresa, lavoratore o mezzo mostra un indicatore colorato:

| Colore | Significato |
|--------|-------------|
| 🟢 Verde | Tutti i documenti attesi sono presenti e validi |
| 🟠 Giallo/Arancio | Almeno un documento scade entro breve, oppure manca un documento consigliato |
| 🔴 Rosso | Almeno un documento obbligatorio è scaduto o mancante |
| ⬜ Grigio | Documento non pertinente per questo tipo di rapporto |

Il semaforo è informativo, non bloccante: puoi sempre salvare anche con elementi in rosso.

---

### 4.1 Imprese

Clicca **"Imprese"** nel menu laterale (sezione Anagrafiche).

#### Aggiungere un'impresa
1. Clicca **"+ Nuova impresa"**.
2. Nel pannello laterale che si apre, compila i dati in sezioni collassabili:
   - **Identificazione**: ragione sociale, partita IVA, codice fiscale, sede legale, contatti.
   - **Tipo di rapporto**: scegli dalla tendina (Appalto, Subappalto, Nolo a caldo, Nolo a freddo, Fornitura mera, Fornitura con posa, Servizio, Lavoratore autonomo). Questa scelta determina quali documenti sono attesi.
   - **Patente a crediti**: codice INL, punteggio (deve essere ≥ 15 per operare), data rilascio e stato. Un punteggio sotto 15 o uno stato Sospesa/Revocata compare come avviso critico.
   - **Figure di sicurezza**: RSPP, Medico Competente, RLS, Direttore Tecnico, Direttore di Cantiere.
   - **Dati ITP**: CCNL applicato, organico medio annuo.
   - **Documenti allegati**: in base al tipo di rapporto, l'app mostra i documenti attesi (con etichetta *obbligatorio* o *condizionato*) e quelli non pertinenti (in grigio). Per ogni documento: carica il file PDF, imposta la data di scadenza.
3. Clicca **"Salva impresa"**. Non ci sono campi che bloccano il salvataggio.

#### Cercare e filtrare
Usa la barra di ricerca (cerca per nome o Partita IVA) e il filtro per tipo di rapporto.

#### Modificare o eliminare
- Clicca **"✏️ Modifica"** sulla card per riaprire il pannello di modifica.
- Clicca l'icona 🗑 per spostare l'impresa nel cestino. Dal cestino è recuperabile con **"↩️ Ripristina"**.

[SCREENSHOT: lista imprese con semafori conformità]

[SCREENSHOT: pannello editor impresa — sezione documenti allegati]

---

### 4.2 Lavoratori

Clicca **"Lavoratori"** nel menu laterale.

Il funzionamento è identico alle imprese. Ogni lavoratore deve essere assegnato a un'impresa specifica (campo obbligatorio nella pratica: un lavoratore senza impresa viene segnalato come non assegnato).

I documenti monitorati per ogni lavoratore:
- Idoneità sanitaria (visita medica): data scadenza
- Attestato di formazione generale e specifica: data scadenza
- Abilitazioni specifiche (gruista, PLE, carrellista, ponteggi…): data scadenza per ciascuna
- Tessera di riconoscimento e badge di cantiere

---

### 4.3 Mezzi e Attrezzature

Clicca **"Mezzi e Attrezzature"** nel menu laterale. La sezione ha due schede:
- **Mezzi**: veicoli semoventi e attrezzature di sollevamento (gru, escavatori, autocarri, PLE…). Per ogni mezzo si registrano le verifiche periodiche con la data della prossima verifica.
- **Attrezzature**: attrezzature non semoventi (ponteggi, trabattelli, betoniere, compressori…). Per i ponteggi si allega il PiMUS e gli altri documenti specifici.

---

### 4.4 Esportare l'anagrafica verso SafeCant

Quando l'anagrafica è aggiornata e pronta, esportala per i colleghi sul campo.

1. Clicca **"Esporta SafeCant"** nel menu laterale (sezione Anagrafiche).
2. La schermata mostra un riepilogo del cantiere corrente: numero di imprese, lavoratori, mezzi, attrezzature e noli.
3. Verifica lo **stato dell'export**:
   - *"Questo cantiere non è ancora stato esportato."* → prima esportazione.
   - *"Ultimo export: (data)"* → mostra quando è stato esportato l'ultima volta.
   - Se c'è il badge *"⚠️ Ci sono modifiche successive all'ultimo export"*, i colleghi stanno lavorando con una versione precedente. Esporta di nuovo.
4. Clicca **"📤 Esporta anagrafica per SafeCant"**.
5. Compare un pannello di conferma che mostra il nome del file che verrà scritto e la cartella di destinazione (`SafeHub-Anagrafiche`). Al primo export ti verrà chiesto di selezionare la cartella `SafeHub-Anagrafiche` su OneDrive.
6. Clicca **"✓ Conferma ed esporta"**.

L'app scrive il file nella cartella condivisa. OneDrive lo sincronizza automaticamente: i colleghi lo vedranno disponibile sul tablet al prossimo aggiornamento.

> **Importante:** l'esportazione è sempre manuale e deliberata. I file PDF e le foto dei documenti **non vengono mai trasmessi**: nell'anagrafica esportata ci sono solo i dati identificativi (nomi, mansioni, scadenze, targhe). I documenti restano sul tuo PC.

[SCREENSHOT: schermata Esporta SafeCant con stato export e pulsante]

---

## 5. SafeCant — preparazione prima del sopralluogo

### Importare l'anagrafica

Prima di andare in cantiere, il tecnico importa l'anagrafica aggiornata dal CSE.

1. Tocca l'icona del **libro** (📖 in alto a destra) oppure vai nella sezione **"Anagrafica cantiere"**.
2. Se non hai ancora un'anagrafica, la schermata mostra:
   > *"Nessuna anagrafica caricata. Importa il file che trovi nella cartella condivisa del cantiere."*
3. Tocca **"Importa anagrafica"**.
4. Si apre il selettore file: cerca nella cartella `SafeHub-Anagrafiche` su OneDrive (sincronizzata sull'iPad tramite l'app OneDrive ufficiale) il file `anagrafica_<cantiere>_<data>.json` e selezionalo.
5. L'app lo carica e mostra il messaggio:
   > *"Anagrafica aggiornata. Versione del (data)."*

Da questo momento, negli step del verbale vedrai gli elenchi di imprese, lavoratori e mezzi pronti da selezionare.

Se hai già un'anagrafica ma ne è disponibile una più recente, tocca **"Importa anagrafica aggiornata"**: sostituisce la versione precedente.

#### Messaggi di errore import
- *"Il file non è un'anagrafica valida"* → hai selezionato un file sbagliato.
- *"Versione anagrafica non supportata"* → chiedi al CSE di esportare di nuovo da SafeHub Archivio aggiornato.
- *"Variante anagrafica non supportata"* → SafeCant accetta solo la variante 'leggera' generata da SafeHub Archivio.

[SCREENSHOT: schermata Anagrafica cantiere in SafeCant — con anagrafica caricata]

---

## 6. SafeCant — compilare il verbale di sopralluogo

Tocca **"Nuovo sopralluogo"** dal cruscotto principale. Se hai già dei verbali in bozza, compaiono nell'elenco con il badge **"Bozza"**: toccali per riaprirli.

> **Prima di iniziare:** SafeCant chiede su quale cantiere stai operando. Se hai un cantiere predefinito nelle impostazioni, viene proposto automaticamente. Altrimenti sceglilo dall'elenco.

Il verbale si compila in **5 passi** (stepper in cima alla schermata). Puoi tornare indietro in qualsiasi momento usando il pulsante **"Indietro"**. Il verbale viene salvato automaticamente ad ogni modifica.

---

### 6.1 Step 1 — Dati generali

Compila i dati obbligatori del sopralluogo (marcati con asterisco):

| Campo | Note |
|-------|-------|
| **Data sopralluogo** ✱ | La data del sopralluogo (non necessariamente oggi) |
| **Oggetto** ✱ | Breve descrizione, es. *"Sopralluogo coordinamento e controllo"* |
| **Condizioni meteo** ✱ | Scegli tra: ☀️ Soleggiato · ☁️ Nuvoloso · 🌧 Pioggia · ❄️ Neve · 💨 Vento |
| Progressiva inizio | Es. km 42+150 |
| Progressiva fine | Es. km 42+850 |
| **Stato dei luoghi** ✱ | Descrizione libera delle condizioni rilevate |
| **Prescrizioni impartite** ✱ | Le prescrizioni date alle imprese durante il sopralluogo |

Tocca **"Avanti"** per passare al passo successivo.

---

### 6.2 Step 2 — Presenze in cantiere

Questo step serve a **rilevare chi e cosa era presente in cantiere** al momento del sopralluogo: un'istantanea delle presenze effettive.

> *"Rileva la presenza di lavoratori, mezzi e attrezzature per impresa. Facoltativo."*

Se non hai importato un'anagrafica, lo step mostra un avviso: puoi saltarlo e aggiungere le presenze manualmente allo step successivo.

#### Come funziona

I soggetti sono raggruppati per impresa. Per ogni impresa trovi quattro sezioni: **Uomini** · **Mezzi** · **Attrezzature** · **Noli**.

Per segnare una presenza, tocca la riga del soggetto: un segno di spunta indica che è presente. Tocca di nuovo per deselezionarlo.

#### Il semaforo di regolarità

Accanto a ogni soggetto compare un indicatore colorato — il semaforo — che segnala lo stato dei suoi documenti **rispetto alla data del sopralluogo**:

| Colore | Etichetta nel verbale | Significato |
|--------|----------------------|-------------|
| 🟢 **Verde** | Regolare | Documenti presenti e validi alla data del sopralluogo |
| 🟡 **Giallo** | In scadenza | Almeno un documento scade entro breve dalla data del sopralluogo |
| 🔴 **Rosso** | Scaduto / Irregolare | Almeno un documento è scaduto prima del sopralluogo, oppure la patente crediti dell'impresa è sospesa o revocata |
| ⬜ **Grigio** | Non verificato | Dati di scadenza non disponibili nell'anagrafica, oppure soggetto aggiunto manualmente |

> ⚠️ Il semaforo si basa sulla **data del sopralluogo**, non su oggi. Se rilevi la presenza di un lavoratore con un patentino scaduto, l'app annuncia: *"Attenzione: documento scaduto o posizione irregolare."*

Il semaforo viene fissato nel momento in cui segni la presenza. Se l'anagrafica viene aggiornata in seguito, il dato già registrato nel verbale non cambia (il verbale è auto-consistente).

#### Aggiungere una presenza non in elenco

Se trovi in cantiere qualcuno che non è nell'anagrafica, tocca **"+ Aggiungi presenza non in elenco"**:
- Inserisci il **nome dichiarato** (o identificativo) e l'**impresa dichiarata**.
- Scegli il **tipo**: Uomo · Mezzo · Attrezzatura.
- Il semaforo di chi non è in anagrafica è sempre ⬜ grigio (*Non verificato*): i dati non sono verificabili.

#### Note sulla presenza

Per ogni soggetto segnato come presente puoi aggiungere una **nota** opzionale (tocca la riga per espandere il campo nota).

[SCREENSHOT: step Presenze — elenco per impresa con semafori colorati]

---

### 6.3 Step 3 — Presenti al sopralluogo

Questo step raccoglie le **persone presenti al sopralluogo** — quelle che firmeranno il verbale: il RUP, il DL, i responsabili di cantiere, l'affidataria, i rappresentanti delle imprese.

> Diverso dalle *presenze*: lo step 2 è un censimento in cantiere (quanti operai, quali mezzi); lo step 3 è la lista di chi partecipa attivamente al sopralluogo e ne sottoscrive il verbale.

#### Aggiungere un presente

Tocca **"+ Aggiungi presente"**. Si apre un pannello con due modalità:

- **Da anagrafica**: cerca per nome, qualifica o ente tra le persone dell'anagrafica importata.
- **Manuale**: inserisci nome e cognome, qualifica, impresa a mano (per chi non è in anagrafica).

#### Stato firma di ogni presente

Ogni presente nella lista mostra il suo stato:

| Badge | Significato |
|-------|-------------|
| ⏳ Da firmare | Non ha ancora firmato |
| ✍️ Firmato | Ha firmato digitalmente sul tablet |
| ⚠️ Firma rifiutata | Ha rifiutato di firmare (con motivo registrato) |

Allo step 5 si raccolgono le firme effettive.

---

### 6.4 Step 4 — Non conformità

Se durante il sopralluogo hai rilevato non conformità, aggiungile qui.

> *"Le non conformità sono facoltative. Aggiungile se ne hai rilevate."*

Tocca **"+ Aggiungi non conformità"**. Per ogni NC compila:
- **Livello**: Lieve · Media · Grave · Gravissima
- **Impresa**: seleziona dall'elenco quella a cui si riferisce la NC
- **Descrizione**: descrivi la non conformità (minimo 20 caratteri consigliati)

Una scadenza di risoluzione viene calcolata automaticamente in base al livello.

Le NC inserite qui arrivano come bozze in SafeHub Archivio (nel modulo Non Conformità) e possono essere promosse a NC formali dal CSE.

---

### 6.5 Step 5 — Firme e finalizzazione

#### Anteprima del verbale

Prima di raccogliere le firme, l'app mostra l'**anteprima completa del verbale**. Il pulsante di firma è **bloccato** finché non scorri l'anteprima fino in fondo.

> *"Scorri il verbale fino in fondo per abilitare la firma."*

Questo è intenzionale: chi firma deve aver letto — almeno scorrendo — il documento che sta sottoscrivendo.

L'anteprima riporta anche un avviso:
> *"Le parti narrative del verbale (stato dei luoghi, prescrizioni, descrizioni delle non conformità) saranno rifinite linguisticamente in fase di archiviazione, senza alterare i fatti rilevati, le presenze, le firme né i dati."*

#### Raccogliere le firme dei presenti

Per ogni persona in lista, usa i pulsanti **"Firma ora"** oppure **"Carica immagine"**:

**Firma ora** — apre un canvas di firma:
- La persona disegna la propria firma con il dito o un pennino direttamente sullo schermo.
- Il canvas mostra l'istruzione: *"Disegna con il dito o con un pennino."*
- Tocca **"Conferma"** per accettare la firma, **"Cancella"** per azzerare e ricominciare.

**Carica immagine** — permette di caricare un file JPG o PNG della firma (utile se il presenti usa un'app firma esterna).

**Rifiuto firma** — se una persona rifiuta di firmare:
1. Tocca **"Rifiuto"** accanto al suo nome.
2. Inserisci il **motivo del rifiuto** nel campo apposito (obbligatorio).
3. Tocca **"Conferma rifiuto"**.

Il rifiuto motivato è documentato nel verbale al pari di una firma: il verbale è valido anche con rifiuti registrati.

#### Firma del redattore

In fondo alla sezione firme, nella sezione **"Firma del redattore"**:
- Se hai impostato una firma permanente nelle impostazioni, tocca **"Usa firma permanente"** per applicarla senza ridisegnarla.
- Oppure tocca **"Firma ora"** per disegnarla al momento, o **"Carica immagine"** per caricarla da file.

#### Riepilogo

Prima del pulsante finale, l'app mostra un riepilogo: data, cantiere, numero di presenti, firme raccolte, rifiuti registrati.

[SCREENSHOT: step Firme — canvas firma aperto con istruzione]

[SCREENSHOT: step Firme — lista presenti con badge stato firma]

---

## 7. SafeCant — salvare, finalizzare e sbloccare

### Salvataggio automatico

Il verbale viene salvato automaticamente sul dispositivo ad ogni modifica. Non devi preoccuparti di perderlo se interrompi la compilazione: riaprendolo dal cruscotto, trovi tutto dove lo avevi lasciato.

### Finalizzare e inviare

Quando il verbale è completo (almeno i campi obbligatori compilati e la firma del redattore presente), tocca **"Finalizza e invia"** in fondo all'ultimo step.

Se mancano elementi obbligatori, l'app mostra l'elenco dei problemi da risolvere:
> *"Non puoi ancora finalizzare. Mancano:"*

Ad esempio:
- *"Indica una data di sopralluogo valida."*
- *"Inserisci la firma del redattore."*
- *"Un presente non ha né firma né rifiuto motivato."*

Se tutto è a posto, compare la conferma:
> *"Stai per finalizzare il verbale. Dopo l'invio non potrai più modificarlo."*

Tocca **"Finalizza e invia"** per procedere. L'app:
1. Compone il file JSON del verbale (con firme, presenze, corpo HTML del testo).
2. Su iPad/iPhone: usa la condivisione di iOS per inviarlo all'app OneDrive. Seleziona OneDrive nella lista e salva nella cartella `SafeHub-Verbali-Ricevuti`.
3. Su dispositivi senza condivisione file: scarica il file sul dispositivo. Il tecnico lo carica poi manualmente su OneDrive.

Il verbale passa allo stato **"Pronto invio"** (badge verde nel cruscotto).

### Sbloccare un verbale già finalizzato

Se ti accorgi di un errore dopo aver finalizzato ma prima di aver inviato, puoi sbloccare il verbale.

1. Dal cruscotto, tocca l'icona di sblocco accanto al verbale con stato "Pronto invio".
2. Compare l'avviso:
   > *"Sbloccare il verbale? Verrà riaperto come bozza. **Le firme già raccolte verranno azzerate.***"
3. Tocca **"Sblocca e azzera firme"** per confermare.

Il verbale torna in bozza e puoi modificarlo, ma dovrai raccogliere nuovamente tutte le firme. Usare questa funzione con cautela.

> **Nota:** non è possibile sbloccare un verbale già inviato (stato "Inviato"). In quel caso contatta il CSE.

---

## 8. SafeHub Archivio — ricevere e archiviare il verbale

### Importare il file da SafeCant

Vai nel menu laterale → **"Verbali Sopralluogo"** (sezione Operatività).

La schermata mostra due schede: **Inbox** e **Archivio**.

Per importare il file JSON ricevuto da SafeCant, hai due modi:

**Trascinamento:** trascina il file `.json` nell'area tratteggiata:
> *"Trascina qui un file JSON SafeCant per importarlo"*

**Upload:** clicca il pulsante **"↓ Importa JSON SafeCant"** e seleziona il file dal selettore.

Se il verbale appartiene a un cantiere diverso da quello corrente, l'app chiede conferma prima di importarlo.

Il verbale importato compare nell'**Inbox** con il suo stato: data sopralluogo, oggetto, redattore, numero di presenti, eventuale numero di NC.

### Rifinire il contenuto (scheda Contenuto)

Clicca sul verbale in Inbox per aprirlo. Nell'editor trovi quattro schede: **Contenuto** · **Controfirma CSE** · **NC** · **Archivia**.

Nella scheda **Contenuto**:
- In alto un riquadro mostra i metadati in sola lettura (data, oggetto, meteo, progressiva, redattore, numero presenti) — questi dati arrivano da SafeCant e non si modificano.
- Sotto, il **corpo del verbale** è modificabile: puoi correggere e rifinire il testo dello stato dei luoghi e delle prescrizioni. Usa la mini-barra degli strumenti per formattare: **G** (grassetto), *C* (corsivo), e i tre pulsanti di allineamento.
- Le firme dei presenti e la tabella delle presenze sono già incorporate nel corpo: **evita di cancellarle**.

#### Assistente AI (Correttore)

Se l'assistente AI è attivo (Ollama installato sul PC ufficio), puoi usare il **Correttore** per migliorare il testo:
1. Clicca **"Correttore"** nel menu laterale (sezione Assistente AI).
2. Incolla la bozza di testo da riscrivere nel campo **"Bozza da riscrivere"**.
3. Clicca **"✏️ Analizza temi e riscrivi"**.
4. L'app propone i temi normativi pertinenti (evidenziati come chip): seleziona quelli da includere.
5. Clicca **"✏️ Riscrivi con questi riferimenti"**: il testo viene riscritto con i riferimenti normativi.
6. Copia il testo riscritto (**"📋 Copia il testo riscritto"**) e incollalo nel corpo del verbale.

> ⚠️ Il testo riscritto dall'AI è una **proposta da verificare sempre**. I riferimenti normativi citati provengono dalla base normativa interna — verifica la pertinenza al caso specifico prima dell'uso ufficiale. Eventuali segnaposto `[verificare riferimento normativo]` indicano le parti da completare manualmente.

Se l'AI non è disponibile, il Correttore mostra il badge *"AI non disponibile"* e il pulsante è disabilitato. Il verbale si compila normalmente a mano.

### Gestire le NC dal sopralluogo (scheda NC)

La scheda **NC** mostra le non conformità abbozzate dal tecnico sul campo. Per ogni NC puoi:
- Cliccare **"↗ Esporta verso NC"** per creare una Non Conformità formale nel modulo NC (nel menu laterale → Non Conformità). Il verbale resta invariato; la NC viene creata come elemento indipendente.
- Se una NC è già stata esportata, compare il badge *"✓ già esportata a NC"*.

### Controfirmare come CSE (scheda Controfirma CSE)

Nella scheda **Controfirma CSE**:
1. Verifica che i dati CSE siano corretti (vengono dalle Impostazioni).
2. Se necessario, disegna o carica la firma grafica:
   - **"✏ Disegna firma"** — apre il canvas per disegnarla.
   - **"↑ Carica PNG"** — carica un file PNG o JPEG.
3. Clicca **"Controfirma come CSE"**: il verbale passa allo stato **"Controfirmato"**.

> La firma grafica CSE è facoltativa (il pulsante di controfirma funziona anche senza): la firma legale avviene tramite GoSign o sistema esterno. La firma grafica è il segno visivo di riferimento nel documento.

### Generare il documento Word

Dopo la controfirma, puoi generare il documento:

1. Clicca **"Genera DOCX"** nella barra azioni in cima.
2. Attendi la generazione (il pulsante mostra *"Generazione…"*).
3. Clicca **"Scarica DOCX"** per salvarlo sul PC.
4. Apri il file in **Microsoft Word**.
5. Da Word: **Esporta come PDF** (File → Esporta → Crea PDF/XPS) oppure usa la stampa (*Stampa → Microsoft Print to PDF*).

### Archiviare il verbale (scheda Archivia)

La scheda **Archivia** riepiloga il flusso in quattro passi:

> 1. Genera il DOCX con il pulsante "Genera DOCX" (in alto)
> 2. Scarica il DOCX e aprilo in Microsoft Word
> 3. Da Word: Esporta come PDF (o Stampa → Salva come PDF)
> 4. Carica qui il PDF e opzionalmente anche il DOCX

Per archiviare:
1. Clicca **"Scegli PDF"** e seleziona il PDF generato da Word. È l'unico file obbligatorio.
2. (Facoltativo) Clicca **"Scegli DOCX"** per allegare anche il file Word.
3. Puoi anche trascinare i file direttamente su questa scheda.
4. Clicca **"Archivia verbale"**.

Il verbale passa allo stato **"Archiviato"** e compare nella scheda **Archivio**. Da lì puoi aprire il PDF o il DOCX con un click.

[SCREENSHOT: editor verbale SafeHub — scheda Contenuto con il corpo del verbale]

[SCREENSHOT: scheda Controfirma CSE con firma grafica]

[SCREENSHOT: scheda Archivia con pulsanti Scegli PDF e Archivia verbale]

---

## 9. Rubrica Numeri Utili

Clicca **"Numeri Utili"** (☎️) nel menu laterale (sezione Gestione).

La rubrica è divisa in due parti:

### Numeri di emergenza (sempre presenti)

Questi numeri sono fissi e non si possono eliminare:

| Numero | Ente |
|--------|------|
| **112** | Numero Unico Emergenze (NUE) |
| **113** | Polizia di Stato |
| **115** | Vigili del Fuoco |
| **117** | Guardia di Finanza |
| **118** | Emergenza Sanitaria |

Clicca su un numero per chiamare direttamente (se il dispositivo supporta le telefonate dal browser).

### Rubrica personale

Contiene i tuoi contatti personali aggiuntivi: ASL territoriale, INL, enti di vigilanza, imprese di emergenza, consulenti.

**Aggiungere un contatto:**
1. Clicca **"+ Aggiungi contatto"**.
2. Compila: nome (obbligatorio), numero di telefono (obbligatorio), categoria (Ente pubblico, Sanità, Impresa, Altro), note opzionali.
3. Clicca **"Salva"**.

**Modificare:** clicca l'icona ✏️ accanto al contatto.

**Eliminare:** clicca l'icona 🗑️ e conferma nella richiesta che compare direttamente sulla card.

I contatti sono ordinati per categoria e poi per nome. I dati sono salvati localmente nell'app e non vengono condivisi con nessuno.

---

## 10. Domande frequenti e problemi comuni

### "La firma non si abilita" (SafeCant, step Firme)

Devi scorrere l'anteprima del verbale fino in fondo. Il pulsante di firma si sblocca solo dopo che hai scorso l'intero documento. È una misura intenzionale: chi firma deve aver visto il contenuto.

### "Non vedo i miei cantieri in SafeHub"

Possibili cause:
- Sei collegato alla cartella sbagliata. Vai in **Impostazioni → Preferenze** e controlla il nome della **Cartella OneDrive** mostrata. Se non è `SafeHub-CSE-Lavori`, usa **"Cambia cartella…"**.
- OneDrive non ha ancora sincronizzato i file. Aspetta qualche minuto e clicca l'icona di riscansione (♻ nella barra in alto): *"Riscansiona cartella (aggiorna se hai copiato file dall'esterno)"*.
- La cartella non è stata ancora creata: crea il primo cantiere con **"+ Nuovo cantiere"**.

### "Ho finalizzato per sbaglio in SafeCant"

Se il verbale è in stato "Pronto invio" (non ancora inviato), puoi sbloccarlo:
1. Dal cruscotto, clicca l'icona di sblocco sulla card del verbale.
2. Conferma: **"Sblocca e azzera firme"**.
3. Il verbale torna in bozza, ma le firme vengono azzerate: dovrai raccoglierle di nuovo.

Se il verbale è già stato inviato (stato "Inviato"), non è più possibile modificarlo da SafeCant. Contatta il CSE che può intervenire in SafeHub Archivio.

### "Ho aggiornato l'app ma vedo ancora la versione vecchia"

SafeHub e SafeCant usano un sistema di cache per funzionare anche senza connessione. Quando c'è un aggiornamento, compare il toast: *"↻ App aggiornata, ricarico…"* e l'app si aggiorna automaticamente.

Se non compare, **ricarica manualmente la pagina** (F5 in SafeHub, oppure chiudi e riapri SafeCant). Se il problema persiste, svuota la cache del browser.

### "L'anagrafica non si importa in SafeCant"

Messaggi di errore e cosa fare:
- *"Versione anagrafica non supportata"* → il CSE deve aggiornare SafeHub Archivio e riesportare.
- *"Variante anagrafica non supportata"* → stai importando la versione completa (con PDF allegati). Chiedi al CSE di esportare la versione per SafeCant (quella con il pulsante "Esporta anagrafica per SafeCant").
- *"Il file non è un'anagrafica valida"* → hai selezionato un file sbagliato.

### "Il verbale importato in SafeHub ha il cantiere sbagliato"

Se il tecnico non ha impostato il cantiere sul tablet o ha usato un codice diverso, SafeHub lo segnala con l'avviso: *"⚠ cantiere_id non valorizzato nel verbale SafeCant"*. Il verbale è ugualmente importabile: il CSE lo assegna manualmente al cantiere corretto.

### "L'assistente AI non risponde" (SafeHub)

L'AI è opzionale e funziona solo sul PC ufficio con Ollama installato. Se non è disponibile, il Correttore e il Consulente normativo mostrano il badge *"AI non disponibile"* e il resto dell'app funziona normalmente. Contatta chi ha configurato il PC ufficio per verificare che Ollama sia attivo.

### "Non riesco ad archiviare il verbale: il PDF è richiesto"

Il pulsante **"Archivia verbale"** è disabilitato finché non carichi almeno il file PDF. Il flusso prevede: genera DOCX → apri in Word → esporta PDF da Word → carica il PDF in SafeHub → archivia. Il DOCX da solo non è sufficiente per l'archiviazione.

---

## 11. Glossario

| Termine | Significato nell'app |
|---------|---------------------|
| **Anagrafica** | L'insieme dei dati del cantiere: imprese, lavoratori, mezzi, attrezzature, persone. SafeHub la gestisce; SafeCant la usa in sola lettura |
| **Anagrafica leggera** | La versione dell'anagrafica inviata a SafeCant: contiene tutti i dati identificativi (nomi, scadenze) ma non i file PDF allegati |
| **Archivio** | In SafeHub, la scheda che contiene i verbali già archiviati definitivamente. In SafeCant, il termine indica i file salvati localmente |
| **Bozza** | Verbale (in SafeCant) o documento (in SafeHub) ancora in compilazione, non finalizzato |
| **Cantiere corrente** | Il cantiere selezionato su cui si sta lavorando. Tutti i dati mostrati sono filtrati per questo cantiere |
| **Corpo del verbale** | La parte narrativa del verbale: stato dei luoghi, prescrizioni, descrizione delle presenze. Può essere rifinita in SafeHub dopo il sopralluogo |
| **Controfirma CSE** | La firma del Coordinatore per la Sicurezza in fase di Esecuzione aggiunta in SafeHub al verbale prodotto dal tecnico sul campo |
| **DOCX** | Documento Word. SafeHub genera il DOCX dal verbale; il CSE lo apre in Word per esportarlo come PDF |
| **Export SafeCant** | L'operazione con cui SafeHub invia l'anagrafica aggiornata ai tecnici sul campo (il file viene scritto nella cartella OneDrive condivisa) |
| **File di interscambio** | Il file `.json` che SafeCant produce alla fine del sopralluogo e che SafeHub importa. Contiene tutte le informazioni del verbale, incluse le firme |
| **Inbox** | In SafeHub, la scheda dei verbali ricevuti da SafeCant e non ancora archiviati |
| **NC (Non Conformità)** | Una irregolarità o mancanza rilevata in cantiere. In SafeCant si annotano come bozze; in SafeHub si formalizzano e si segue il loro iter di risoluzione |
| **NC draft** | La bozza di non conformità compilata dal tecnico durante il sopralluogo in SafeCant, prima della formalizzazione da parte del CSE |
| **OneDrive** | Il servizio di archiviazione cloud usato per condividere i file tra SafeHub (PC ufficio) e SafeCant (tablet). Non è un database: è la cartella condivisa |
| **Patente a crediti** | Documento obbligatorio per le imprese che operano in cantiere (D.M. 132/2024). Deve avere un punteggio ≥ 15 per essere operativa. Monitorata da SafeHub |
| **PiMUS** | Piano di Montaggio, Uso e Smontaggio dei ponteggi. Documento specifico per i ponteggi, monitorato nella sezione Attrezzature |
| **Pronto invio** | Stato di un verbale SafeCant che è stato finalizzato ma non ancora inviato tramite OneDrive |
| **Semaforo** | L'indicatore colorato (verde/giallo/rosso/grigio) che mostra a colpo d'occhio lo stato di conformità di un soggetto (impresa, lavoratore, mezzo) |
| **Step** | Ognuno dei 5 passi dell'editor verbale in SafeCant: Dati generali · Presenze · Presenti · Non conformità · Firme e finalizzazione |
| **tipoRapporto** | La classificazione del rapporto contrattuale di un'impresa (Appalto, Subappalto, Nolo a caldo, ecc.). Determina quali documenti sono attesi |

---

## ⚠️ Elementi DA VERIFICARE

I seguenti punti non erano completamente chiari dal codice e richiedono verifica diretta dell'interfaccia:

1. **Picker cantiere in SafeCant**: non è chiaro se la scelta del cantiere al momento di creare un nuovo sopralluogo avvenga automaticamente (da cantiere predefinito) oppure mostri sempre un elenco. Da verificare: cosa vede l'utente alla creazione del primo sopralluogo.

2. **Modalità invio verbale su dispositivi non iOS**: il codice implementa un fallback a download se la Web Share API non è disponibile, ma il testo esatto del messaggio e il flusso preciso per l'utente (es. su Android) non erano nei file letti. Da verificare su Android il comportamento dopo "Finalizza e invia".

3. **Schede Impostazioni SafeHub**: il numero esatto di schede nel modulo Impostazioni potrebbe essere maggiore di quelle descritte. Alcune schede (es. AI, Firma permanente) potrebbero avere layout o nomi leggermente diversi da quanto descritto. Da verificare aprendo le Impostazioni.

4. **Flusso anteprima HTML**: il pulsante "Anteprima HTML" nel modulo Verbali Sopralluogo apre l'anteprima in una nuova scheda del browser. Il comportamento esatto (cosa viene mostrato e come viene chiusa la scheda) da verificare.

5. **Numeri Utili — conferma eliminazione**: la conferma di eliminazione appare direttamente sulla card (inline) senza modale separato. Da verificare la visualizzazione esatta su schermi piccoli.

---

*Manuale redatto sulla base del codice sorgente di SafeHub Archivio e SafeCant — giugno 2026.
Tutti i nomi di pulsanti e messaggi corrispondono al testo effettivo dell'interfaccia.
I segnaposto `[SCREENSHOT: …]` indicano i punti in cui aggiungere immagini.*
