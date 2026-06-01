# SAFEHUB — DOCUMENTO MAESTRO DEL PROGETTO
## Visione unificata dell'ecosistema · Versione 1.0 · 31 maggio 2026

> **Cos'è questo documento.** Il punto di riferimento unico che mette insieme tutto il progetto
> SafeHub: visione, architettura, flussi documentali, schema dati anagrafica, conformità normativa,
> piano di sviluppo e metodo di lavoro. Consolida i documenti strategici (`SafeHub.md`,
> `SafeHubPianoSviluppo.md`, `SafeHubProcedura.md`, `safehub-contratto-tecnico.md`), i design di
> modulo (Diario, Verbale Riunione) e il corpus normativo prodotto (schema anagrafica v2.0, analisi
> di conformità, mappa documentale, gradazione obbligatorio/facoltativo, mappatura documenti firmati).
> Per il dettaglio operativo si rinvia ai singoli documenti; qui sta la visione d'insieme coerente.

---

## PARTE I — VISIONE E CONTESTO

### 1. Il problema reale
Il Product Owner (PO) è Coordinatore della Sicurezza in fase di Esecuzione (CSE) su un'opera
infrastrutturale del committente di grandi dimensioni: tracciato esteso, decine di cantieri
operativi, oltre mille persone impiegate, filiera di centinaia di imprese. Le anagrafiche di imprese
e lavoratori sono troppo numerose e dinamiche per essere gestite a memoria o a mano. Il lavoro del
CSE genera e raccoglie un grande volume di documenti con valore legale.

### 2. Il riconoscimento architetturale fondante
Il flusso di lavoro reale è **hub-and-spoke centralizzato**, non peer-to-peer. Esistono due modalità
operative distinte:
- **Produzione sul campo** (tattica): l'unica attività davvero sul cantiere è il *sopralluogo* —
  tempo limitato, persone attorno, firme da raccogliere, dispositivo mobile.
- **Consolidamento in ufficio** (strategica): tutto il resto — rifinitura verbali, verifiche POS,
  NC, eventi, sospensioni, archiviazione documenti, anagrafiche, registri — calma, PC, vista d'insieme.

Risposta: **strumenti distinti per modalità distinte**. Da qui i tre prodotti.

### 3. Principi guida (la bussola)
- Un attrezzo che fa una cosa bene batte un attrezzo che prova a fare tutto.
- Strumenti tattici per attività tattiche, strategici per attività strategiche. Non mescolare.
- I problemi si possono risolvere o eliminare: eliminarli (cambiando architettura) è meglio.
- Piccoli passi atomici, mai big bang. Ogni modulo si chiude prima del successivo.
- Riconoscere il sovrascalare è una virtù da CTO.
- AI come assistente, mai sostituto del giudizio professionale CSE.
- **Riservatezza assoluta**: nome del committente e riferimenti identificativi delle opere reali
  NON compaiono MAI in codice, UI, nomi file/cartelle pubblici, commit, README. Si usa "committente"
  e codici cantiere opachi (es. CZ399).

---

## PARTE II — ARCHITETTURA: TRE PRODOTTI

Tre prodotti indipendenti che comunicano via file su cartelle OneDrive condivise interne al tenant
del committente. **Niente database condiviso, niente sync conflitti, niente sovrascritture
multi-utente**: i problemi spariscono per costruzione.

### 4. SafeHub Firma (`safehub-firma`)
**Stato: costruita, da deployare.** App utility che acquisisce firme su Samsung Android (touch),
dove il PC ufficio non ha touchscreen. Produce PNG trasparente nominato data+cantiere+nome.
Usata solo dal PO, non dai colleghi.

### 5. SafeCant (`safehub-operativita`)
**Stato: da costruire.** PWA iPad per i colleghi sopralluoghisti (e il PO in cantiere). Contiene
**solo il modulo Verbale di Sopralluogo**.
- **Perché solo quello (motivazione legale):** i colleghi sono *collaboratori* del CSE titolare, non
  CSE titolari. Il CSE per legge non può delegare i suoi compiti. Il collaboratore esegue sopralluoghi;
  tutte le altre attività (POS, NC, eventi, sospensioni) restano in capo al CSE titolare in Archivio.
- Offline-first (Service Worker, IndexedDB locale), Alpine.js + vanilla JS, no build tools.
- **Non genera DOCX né PDF**: produce un *file di interscambio JSON* (corpo HTML + metadati + firme
  PNG embedded) che invia ad Archivio via Web Share API → OneDrive.
- Importa l'anagrafica del cantiere dalla cartella condivisa; redattore fisso = utente dell'iPad
  personale (no multi-utente).

### 6. SafeHub Archivio (`safehub-archivio`)
**Stato: da costruire. Sostituirà la SafeHub attuale.** Ambiente completo del CSE titolare, solo PC
desktop (Windows 11 ufficio + portatile autorizzato). Gestisce tutto il resto del lavoro CSE,
organizzato sui tre flussi documentali (Parte III). Stack completo: docxtemplater + html-module per
DOCX, libreria PDF, File System Access API per OneDrive locale, AI locale opzionale.

---

## PARTE III — I TRE FLUSSI DOCUMENTALI

Cuore organizzativo di SafeHub Archivio. Ogni documento appartiene a uno dei tre flussi, secondo
**chi lo produce e che iter segue**.

### 7. Flusso A — Verbale di Sopralluogo (unico iter interno completo)
L'unico documento il cui ciclo si chiude dentro SafeHub. Arriva da SafeCant come JSON di
interscambio → il PO rifinisce il corpo HTML (con AI opzionale) → finalizza → Archivio genera DOCX
(template unico + corpo HTML) → converte in **PDF d'archivio definitivo** in `01_Verbali-Sopralluogo/
Finalizzati/`. Niente protocollo esterno: il CSE titolare firma e il documento è completo.

### 8. Flusso B — Documenti prodotti dal PO con iter esterno di protocollo
Documenti che il **CSE PRODUCE e FIRMA**, con iter: compila in Archivio (form) → salva bozze →
"Scarica Word" (DOCX) → invia via mail ai superiori → superiori firmano e protocollano → il
protocollo restituisce **PDF protocollato + numero + data + lettera di trasmissione** → il PO carica
i 4 elementi in `<NN>_<categoria>/Protocollati/`.
**Tipi:** Verbale di Riunione di Coordinamento · Verifica POS (incl. Verifica POS ITP) · Proposta di
Sospensione CSE · Non Conformità · Evento Incidentale · ODS Inviati.
**Regola chiave:** Archivio NON conserva il DOCX scaricato; archivia solo il PDF protocollato (il
documento a valore legale).

### 9. Flusso C — Documenti esterni ricevuti (archivio puro)
Documenti prodotti da **terzi**, che il PO riceve e archivia senza modificare: upload PDF + metadati.
**Tipi:** Notifica Preliminare (da Committente/RL, art.99) · Verifiche Enti Esterni (ASL, INL…) ·
Disposizioni e Sospensioni del RL · ODS Ricevuti · POS Documentale (depositati dalle imprese).

### 10. Supporto e configurazione
Anagrafica completa · Esportazione anagrafica → cartella condivisa · Registro PSC · Diario CSE ·
Foto cantiere · Impostazioni globali del PO · AI locale.

> **Mappatura dei 7 documenti firmati indicati dal PO** (verifica: tutti già previsti):
> Verbale riunione (B, Mod.11) · Verifica idoneità POS (B, Mod.12) · Verifica ITP (B, Mod.12,
> sottotipo) · Proposta sospensione CSE (B, Mod.13) · Notifica preliminare (C, Mod.17) ·
> Disposizione sospensione RL (C, Mod.19) · Registro aggiornamenti PSC (Supporto, Mod.23).
> Distinzione da non confondere: la *Proposta* di sospensione è del CSE (Flusso B, la firmi tu); la
> *Disposizione* è del RL (Flusso C, la ricevi). Dettaglio in `mappatura-documenti-firmati.md`.

---

## PARTE IV — LINGUA COMUNE: ONEDRIVE E MODELLO DATI

### 11. Distribuzione via OneDrive (quattro cartelle mono-direzionali)
Tutta la comunicazione tra prodotti passa per cartelle OneDrive condivise interne al tenant. Sono
mono-direzionali → niente conflitti:
- `SafeHub-Anagrafiche`: PO scrive, colleghi leggono (file `anagrafica_<lotto>_AAAA-MM-GG.json`)
- `SafeHub-Verbali-Ricevuti`: colleghi scrivono, PO legge (`verbale_sopralluogo_<cantiere>_<data>_<ora>.json`)
- `SafeHub-Foto-Sopralluoghi`: colleghi scrivono, PO legge (foto fuori dal record verbale)
- `SafeHub-Documenti-Distribuiti` (eventuale futura): PO scrive, colleghi leggono

### 12. Modello "file = stato"
In SafeHub Archivio **i file SONO i dati**: niente database centralizzato, la fonte di verità è la
cartella OneDrive sincronizzata da OneDrive client. Un file per documento. IndexedDB locale solo
come cache di indicizzazione (rigenerabile), MAI canonico. Vantaggi: niente sync bidirezionale,
niente conflitti, versioning OneDrive automatico, file leggibili senza l'app (resilienza per dati
legali), filesystem auto-esplicativo.

Struttura cartelle per cantiere (prefissi numerici 01–16 per ordinamento logico):
`01_Verbali-Sopralluogo` · `02_Verbali-Riunione` · `03_Verifiche-POS` · `04_Proposte-Sospensione-CSE`
· `05_Non-Conformita` · `06_Eventi-Incidentali` · `07_ODS-Inviati` · `08_Diario-CSE` ·
`09_Registro-PSC` · `10_Notifica-Preliminare` · `11_Verifiche-Enti-Esterni` ·
`12_Disposizioni-Sospensioni-RL` · `13_ODS-Ricevuti` · `14_POS-Documentale` · `15_Anagrafica` · `16_Foto`.

### 13. Template Word unico + corpo HTML
Un solo `template-safehub.docx` per tutto l'ecosistema. Segnaposto docxtemplater SOLO in header/footer
(logo, titolo, codice modulo, versione); tutto il corpo è HTML iniettato nel placeholder
`{~corpo_html}` via html-module. Una funzione `generaCorpoHtml<Tipo>()` per tipo di documento. Le
impostazioni globali del PO (firma, logo, nome, qualifica, codici moduli) si configurano una volta
e alimentano tutti i generatori. Nota licenza: html-module è a pagamento per uso commerciale.

---

## PARTE V — SCHEMA DATI ANAGRAFICA (canonico v2.0)

> Lo schema anagrafica è la base del progetto nuovo. È UN solo schema condiviso: SafeHub Archivio lo
> PRODUCE, SafeCant lo CONSUMA. Dettaglio completo in `schema-anagrafica-canonico-v2.md`.

### 14. Principi dello schema
- **P1 — Gerarchia a cascata, ID primario = LOTTO.** Tutto risale al lotto via `lotto_id`.
- **P2 — Assegnazione UNIVOCA all'impresa.** Lavoratori, mezzi, attrezzature, noli appartengono a UNA
  impresa specifica (`impresa_id`), mai genericamente al cantiere. Un escavatore è dell'impresa X.
- **P3 — Lo schema GUIDA ma non BLOCCA mai.** Documenti attesi = suggerimento, non vincolo. Warning,
  mai errori bloccanti. Il CSE resta sovrano.
- **P4 — Conformità normativa incorporata.** La tassonomia e i campi riflettono gli obblighi reali.
- **P5 — Compatibilità.** I campi storici si conservano; le aggiunte sono non distruttive.

### 15. Struttura (8 collezioni sotto il lotto)
`lotto` (id primario + ruoli istituzionali) → `imprese[]` · `lavoratori[]` · `mezzi[]` ·
`attrezzature[]` (nuovo) · `noli[]` (nuovo) · `persone_committente[]` · `persone_terzi[]`.
Intestazione con `schema_version: "2.0"` e `variante: "leggera|completa"` (leggera = blob base64
svuotati per SafeCant; completa = con blob, interna ad Archivio).

### 16. Tassonomia dei soggetti (`tipoRapporto`) — il cuore della conformità
Otto categorie con obblighi di verifica diversi: **APPALTO · SUBAPPALTO · NOLO_FREDDO · NOLO_CALDO ·
FORNITURA · FORNITURA_POSA · SERVIZIO · LAV_AUTONOMO**. Il `ruolo` storico (AFFIDATARIA/ESECUTRICE/
SUBAPPALTO) si conserva per compatibilità. Per il nolo a caldo, il flag `superaSoglieSubappalto`
attiva gli obblighi da subappalto.

---

## PARTE VI — CONFORMITÀ NORMATIVA

> Sintesi del corpus normativo prodotto. Dettagli in `analisi-conformita-anagrafica.md`,
> `mappa-documentale-soggetti.md` (integrata nello schema §12), `documenti-obbligatori-facoltativi.md`.

### 17. La regola d'oro
I documenti che il CSE deve pretendere dipendono da **cosa il soggetto fa** in cantiere, non da come
si chiama. La stessa impresa può cumulare ruoli (affidataria + esecutrice).

### 18. Cosa cambia in base alla categoria (esempi chiave)
- **Nolo a freddo**: mera locazione, MAI subappalto → niente POS, solo attestazione buono stato (art.72).
- **Nolo a caldo**: zona grigia → sopra soglia = subappalto (POS, idoneità, patente); sotto soglia =
  documenti dell'operatore.
- **Mera fornitura**: esonerata da POS *e* DUVRI (art.96 c.1-bis, art.26 c.3-bis).
- **Fornitura con posa**: trattata come esecutrice (POS).
- **Lavoratore autonomo**: documenti propri (All.XVII p.2), non redige POS.

### 19. Obblighi recenti incorporati (V3 non li conosceva)
- **Patente a crediti** (D.M. 132/2024, dal 1/10/2024): codice INL univoco, ≥15 crediti, per chi
  opera fisicamente in cantiere. Campo `patenteCrediti` sull'impresa.
- **Badge di cantiere** (DL 159/2025, Circ. INL 1/2026): si aggiunge alla tessera art.26 c.8, non la
  sostituisce. Campo `badgeCantiere` sul lavoratore.

### 19-bis. Altri campi di conformità incorporati nello schema
- **DOMA** — dichiarazione organico medio annuo + denunce INPS/INAIL/Cassa Edile + CCNL applicato
  (art.90 c.9.b): campi `organicoMedioAnnuo` e `ccnlApplicato` sull'impresa.
- **Figure di sicurezza dell'impresa** — RSPP, Medico Competente, RLS, preposti, Direttore Tecnico,
  Direttore di Cantiere (All.XVII / modulistica standard): oggetto `figureSicurezza` sull'impresa.
- **Verifiche periodiche INAIL** — attrezzature di sollevamento (gru, autogru, PLE, argani/paranchi
  >200kg) soggette a verifica periodica obbligatoria (All.VII, art.71 c.11, D.M.11/04/2011) con
  matricola INAIL e periodicità per tipo: campo `verifichePeriodiche[]` (con `prossima`) abilita il
  monitoraggio scadenza. Per i ponteggi: PiMUS + autorizzazione ministeriale (`documentiSpecifici[]`).

### 20. La gradazione obbligatorio / facoltativo (logica della UI)
Tre gradi che la UI tratta diversamente, **senza mai bloccare**:
- 🔴 **OBBLIGATORIO** (imposto per legge) → warning forte se manca.
- 🟠 **CONDIZIONATO** (obbligatorio solo se ricorre una condizione: ruolo, soglia, tipo lavoro) →
  warning attivo solo se la condizione è vera.
- 🟢 **FACOLTATIVO** (il CSE può esigerlo come clausola) → suggerimento blando.

**Soglia cardine (art.90 c.9):** cantiere ≥200 uomini-giorno o con rischi All.XI → idoneità COMPLETA;
<200 u/g e senza rischi All.XI → semplificata (CCIAA + DURC + autocertificazione). *Per la grande
opera del progetto vale sistematicamente il regime COMPLETO.* CCIAA e DURC non sono mai
autocertificabili. Punto sottile: la formazione è obbligatoria per il dipendente (art.37) ma
facoltativa per il lavoratore autonomo (art.21, Interpello 7/2013), salvo amianto/funi/ponteggi.

---

## PARTE VII — AI LOCALE (strumento del PO)

### 21. Cos'è e cosa non è
L'AI **non è un prodotto SafeHub**: è una capacità del PC ufficio del PO (8 GB VRAM + 64 GB RAM),
serve solo a lui, non si distribuisce. Vive in SafeHub Archivio, supporta la rifinitura del verbale
(Flusso A) e la revisione dei documenti del PO (Flusso B). Non sostituisce il giudizio CSE, non ha
valore di firma, non è in SafeCant.

### 22. Architettura a tre livelli
- **Livello 1 — Second brain** (system prompt): procedure aziendali, checklist, terminologia.
- **Livello 2 — RAG legislativo** (DB vettoriale): D.Lgs 81/08, allegati, circolari INL.
- **Livello 3 — Contesto dinamico**: cantiere corrente, anagrafica, NC aperte, scadenze.
Inferenza via Ollama su `localhost:11434`. Capability detection: se Ollama non c'è, l'app funziona in
manuale. Candidati modello: Gemma 2 9B, Qwen3 14B, Mistral Small 3.1.

---

## PARTE VIII — STACK TECNOLOGICO

### 23. Comune
Alpine.js (UI) + Tailwind CSS (CDN) + vanilla JS modulare + IndexedDB. No build tools (no Vite per ora).

### 24. Specifico
- **SafeCant** (leggero): Service Worker, Web Share API, Canvas firme. NON usa docxtemplater, PDF, AI.
- **SafeHub Archivio** (completo): docxtemplater + html-module + ImageModule, libreria PDF (pdf-lib),
  File System Access API, AI bridge Ollama opzionale.
- **Organizzazione per feature** con cartella `shared/` per il codice comune.

---

## PARTE IX — PIANO DI SVILUPPO (cinque fasi)

### 25. Le fasi
| Fase | Cosa | Stima |
|---|---|---|
| 1 | Deploy SafeHub Firma | ore |
| 2 | Costruzione SafeCant (solo Verbale Sopralluogo) | 3-4 mesi |
| 3 | Pre-fase AI locale (in parallelo) | 1-2 mesi |
| 4 | Costruzione SafeHub Archivio (27 moduli) | 7-9 mesi |
| 5 | Migrazione e sostituzione SafeHub attuale | 1-2 mesi |

Ogni fase ha valore da sola: fermarsi in qualunque punto lascia comunque uno strumento utile.

### 26. I 27 moduli di SafeHub Archivio (Fase 4)
Fondazione (1-5): fondazione · impostazioni globali · cantieri · anagrafica completa · esportazione
anagrafica. Sistema documentale (6): generazione DOCX. Flusso A (7-10): inbox · editor rifinitura ·
finalizzazione · associazione foto. Flusso B (11-16): riunione *(pilota)* · verifica POS · sospensione
CSE · NC · eventi · ODS inviati. Flusso C (17-21): notifica preliminare *(pilota)* · verifiche enti ·
disposizioni RL · ODS ricevuti · POS documentale. Supporto (22-27): diario · registro PSC · foto ·
cruscotto generale · AI locale · migrazione dati.
**Strategia:** costruito il modulo pilota di un flusso, gli altri dello stesso flusso sono variazioni.

---

## PARTE X — METODO DI LAVORO

### 27. Tre ruoli
- **PO (Casella Dogano):** decide cosa serve, risponde ai chiarimenti, collauda, mantiene la visione
  reale dello strumento, configura l'AI sul proprio PC.
- **CTO (Claude in chat):** scrive i prompt di audit/costruzione, propone i design, prepara le
  checklist di collaudo, mantiene la coerenza architetturale, è onesto su rischi e limiti.
- **Claude Code (executor):** esegue audit read-only, costruisce il codice, fa commit/push, si ferma
  e torna al CTO se trova l'imprevisto. Non decide il design.

### 28. Procedura per ogni modulo (Fasi A→G)
A audit del modulo equivalente V3 (read-only) · B design col CTO · C decisioni del PO · D prompt di
costruzione per Claude Code · E costruzione · F collaudo PO · G chiusura. Un modulo alla volta,
completo e collaudato, prima del successivo.

---

## PARTE XI — STATO E PROSSIMI PASSI

### 29. Cosa è fissato
Visione, architettura tre prodotti, tre flussi documentali, pattern OneDrive, modello file=stato,
template unico, schema anagrafica canonico v2.0 con conformità normativa completa, piano a 5 fasi,
metodo a 3 ruoli. SafeHub attuale stabile (`v2.2.70-stable`) resta in produzione durante la
transizione. **V3 è archiviata come miniera di conoscenza**: il progetto nuovo nasce sullo schema v2.0.

### 30. Prossimo passo concreto
Sul piano: deploy SafeHub Firma (Fase 1) e avvio costruzione SafeCant (Fase 2). Sul dato: l'unico
pezzo mancante perché il giro anagrafica funzioni end-to-end è la **funzione di export anagrafica**
(che materializza lo schema v2.0 dai dati nel file condiviso) e il relativo **import lato SafeCant**.

---

## APPENDICE — INDICE DEI DOCUMENTI DI PROGETTO

**Strategici:** `SafeHub.md` (visione) · `SafeHubPianoSviluppo.md` (fasi) · `SafeHubProcedura.md`
(metodo) · `safehub-contratto-tecnico.md` (Modulo 0, convenzioni tecniche).
**Design moduli:** `modulo-verbale-riunione-design.md` (pilota Flusso B) ·
`modulo-diario-cse-progettazione.md`.
**Corpus dati/normativo:** `schema-anagrafica-canonico-v2.md` (schema + mappa documentale) ·
`analisi-conformita-anagrafica.md` · `documenti-obbligatori-facoltativi.md` ·
`mappatura-documenti-firmati.md`.
**Tracking:** `nota-avanzamento-safecant.md` · `safehub-cose-da-fare.md`.

---

*Documento maestro v1.0 — 31 maggio 2026. Consolida la documentazione di progetto SafeHub alla data.
Per ogni argomento, la fonte di dettaglio è il documento specifico citato. Principio trasversale:
riservatezza assoluta dei riferimenti al committente.*
