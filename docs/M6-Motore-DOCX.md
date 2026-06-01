# MODULO M6 — MOTORE DI GENERAZIONE DOCX
## Il motore documentale condiviso · v1.0 · 31 maggio 2026

> **Cosa è questo documento.** Il design del motore che genera i documenti Word di SafeHub Archivio dal
> **template Word unico reale** (`template.docx`, fornito dal PO) + corpo HTML iniettato (come fa già SafeCant). È un modulo
> trasversale: lo usano il Flusso A (verbale sopralluogo → PDF) e tutto il Flusso B (documenti del PO).
> Si progetta prima dei moduli che lo useranno, così ognuno dirà "il DOCX lo fa M6" senza reinventarlo.
> Analizzato sul template reale caricato dal PO, non su uno ipotetico.

> **Dipendenze.** Poggia su M1 (fondazione, filesystem, errori). Pattern definito in `SafeHub.md` §4.3
> e `safehub-contratto-tecnico.md` §8.

---

## 1. ANALISI DEL TEMPLATE REALE (template.docx)

Il template fornito dal PO è stato analizzato. Contiene **esattamente** questi segnaposto:

| Segnaposto | Sintassi | Tipo | Dove | Significato |
|---|---|---|---|---|
| `{%logo_aziendale}` | `%` | immagine (ImageModule) | header | logo nell'intestazione |
| `{modulo_codice}` | `{}` | testo | header | codice del modulo qualità (es. "Mod.VS.01") |
| `{modulo_versione}` | `{}` | testo | header | versione/data del modulo (es. "Rev.2 — 05/2026") |
| `{~corpo_html}` → **`{@rawXml}`** | `~`→`@` | corpo (via convertitore HTML→OOXML, gratis) | body | tutto il corpo del documento |

### 1.1 Struttura header/footer reale
- Header **triplo** (header1/2/3 = prima pagina / pari / dispari): contiene logo + tabella "Modulo /
  Verbale di sopralluogo / codice / versione". Il titolo del documento è scritto come **testo fisso**.
- Footer **triplo** (footer1/2/3): contiene la **paginazione**.

### 1.2 ⚠ PUNTO DI DESIGN — il titolo è fisso nel template
Nel template reale il titolo **"Verbale di sopralluogo"** è testo fisso nell'header, NON un segnaposto.
Questo va deciso, perché SafeHub genera più tipi di documento (verbale riunione, verifica POS, NC…):

**Opzione A — un template per tipo di documento.** Si duplica `template.docx` in N template, ognuno col
titolo giusto fisso. Più file da mantenere, ma fedele al modulo qualità di ciascun tipo (che ha codici
e versioni diversi comunque).

**Opzione B — un template unico con titolo a segnaposto.** Si aggiunge `{modulo_titolo}` nell'header al
posto del testo fisso, così un solo template serve tutti i tipi. Più sobrio, ma il PO deve modificare il
template attuale.

> Questa è una **decisione del PO** (§9). La mia raccomandazione da CTO è più sotto. Il motore M6
> supporta entrambe: cambia solo se carica un template diverso per tipo o passa anche il titolo.

---

## 2. INQUADRAMENTO DEL MOTORE

### 2.1 Cosa fa M6 — TRE OUTPUT da una sola catena
M6 produce **tre formati** dello stesso documento, in catena lineare (decisione PO 31/05):
1. **HTML** (anteprima): il `corpo_html` reso come pagina standalone, per vedere il documento a
   schermo PRIMA di finalizzarlo. Veloce, non passa dal Word.
2. **DOCX**: documento dal template Word (header con logo/codici + corpo OOXML). È ciò che si manda
   ai superiori (Flusso B).
3. **PDF**: generato **dal DOCX** (non dall'HTML), è l'archivio definitivo a valore legale.

```
corpo_html ──┬──► HTML standalone ........... anteprima a schermo
             │
             └──► template Word + header ──► DOCX ──► PDF (archivio)
                  (logo, codici, corpo)         │        ▲
                                           ai superiori   │
                                                     sempre dal DOCX
```

> **Punto critico (chiarito dal PO):** il PDF nasce **dal DOCX**, non dall'HTML. Così header, logo,
> codici e impaginazione sono **identici** nei tre formati. Un PDF fatto dall'HTML divergerebbe dal
> DOCX nell'aspetto — inaccettabile per un documento coerente a valore legale. Una sola fonte di
> impaginazione (il template Word) per DOCX e PDF.

Passi: carica template + logo (da M2) → riceve il corpo HTML da `generaCorpoHtml<Tipo>()` →
HTML anteprima · DOCX dal template · PDF dal DOCX.

### 2.1-bis I tre output valgono per tutti i flussi (e per l'Operatività)
- **Flusso B** (verbale riunione, verifiche, NC, eventi, sospensioni CSE): HTML per anteprima · DOCX
  da inviare ai superiori · PDF protocollato che torna in archivio.
- **Flusso A / Operatività** (sopralluogo): stessa catena, HTML anteprima · DOCX · PDF d'archivio.
- È lo stesso motore: cambia solo il `generaCorpoHtml<Tipo>()` del documento.

### 2.2 Cosa NON fa M6
- Non genera il corpo HTML: quello è responsabilità di ogni modulo (`generaCorpoHtml<Tipo>`). M6 riceve
  l'HTML già pronto e lo inietta. Questo è il confine netto che rende M6 riusabile.
- Non decide i contenuti: è un motore, non conosce la semantica dei documenti.
- Non archivia: salva dove il chiamante indica (lo fa il modulo, vedi §7).

### 2.3 Il confine chiave (perché M6 è riusabile)
```
MODULO (es. Verbale Riunione)                M6 (motore)
─────────────────────────────               ──────────────────────
genera corpo HTML del verbale  ──HTML──►     inietta nel template
fornisce codice/versione/logo  ──dati──►     compila header
                                             produce DOCX
                                ◄──DOCX──     (e PDF per Flusso A)
salva nel posto giusto         
```
Ogni modulo porta il SUO HTML; M6 fa sempre la stessa cosa. Aggiungere un tipo di documento = scrivere
una nuova `generaCorpoHtml<Tipo>()`, MAI toccare M6.

---

## 3. STACK TECNICO — MOTORE NUOVO IN ARCHIVIO, VIA GRATUITA

> **Verità accertata dall'audit di SafeCant (31/05).** SafeCant **NON genera alcun DOCX**: produce
> solo il JSON di interscambio con il campo `corpo_html` (stringa HTML). Il template Word è un asset
> di Archivio, SafeCant non lo carica né lo conosce. Quindi **il motore DOCX non esiste ancora da
> nessuna parte: nasce ex novo qui, in M6.**
>
> **Decisione PO (31/05): via gratuita, nessuna licenza.** Si usano solo strumenti open source, anche
> a costo di scrivere più codice nostro.

### 3.1 Cosa l'audit ha accertato
- SafeCant produce `corpo_html` (HTML semantico puro, senza CSS inline, firme come `<img>` base64).
- Il template `template.docx` usa quattro tag: `{modulo_codice}`, `{modulo_versione}` (semplici,
  **gratuiti**), `{~corpo_html}` (html-module, **a pagamento**), `{%logo_aziendale}` (image-module,
  **a pagamento**).
- SafeCant non usa docxtemplater né alcuna libreria DOCX: zero dipendenze documentali.

### 3.2 Lo stack scelto (tutto gratuito/MIT)
- **PizZip** (MIT): unzip/rezip del .docx.
- **docxtemplater core** (MIT, gratis): tag semplici `{modulo_codice}`, `{modulo_versione}`,
  `{modulo_titolo}` + loop/condizioni/tabelle del core.
- **`{@rawXml}`** (tag del core, **gratis**): sostituisce `{~corpo_html}`. Riceve **OOXML** generato
  da un nostro convertitore HTML→OOXML, e lo inietta nel corpo.
- **`docxtemplater-image-module-free`** (fork community, gratis): per `{%logo_aziendale}`. Supporta
  PNG/JPEG base64 (no SVG — irrilevante, il logo è PNG). Copre anche le firme se servissero come tag
  immagine; ma le firme arrivano già dentro il `corpo_html` come `<img>`, quindi passano dal
  convertitore HTML→OOXML (§3.4).
- **Conversione PDF** (solo Flusso A): libreria PDF gratuita lato app, da valutare in costruzione.

### 3.3 ⚠ Modifica al template: `{~corpo_html}` → `{@rawXml}`
Il template ha `{~corpo_html}` (sintassi html-module a pagamento). Va cambiato in **`{@rawXml}`**
(sintassi core gratuita). Stessa posizione, stessa funzione (ricevere il corpo). Modifica di 1 minuto
nel template Word.

### 3.4 Il convertitore HTML→OOXML (il vero lavoro nuovo di M6)
Poiché SafeCant produce HTML e usiamo `{@rawXml}` (che vuole OOXML), serve un **convertitore
HTML→OOXML** scritto da noi. È il cuore nuovo di M6. Deve coprire **solo** il sottoinsieme di HTML che
le funzioni `generaCorpoHtml<Tipo>()` producono — e l'audit ci dice esattamente qual è (vista da
SafeCant):

| Tag HTML in input | Output OOXML |
|---|---|
| `<section>`, `<article>` | contenitori → si appiattiscono in sequenze di paragrafi |
| `<h2>`, `<h3>` | `<w:p>` con stile Heading |
| `<p>` | `<w:p>` con run `<w:r><w:t>` |
| `<strong>` | run con `<w:b/>` |
| `<em>` | run con `<w:i/>` (corsivo) |
| `<p data-align="...">` | `<w:p>` con `<w:jc w:val="left|center|right"/>` (allineamento) |
| `<br>` | `<w:br/>` dentro il run |
| `<table>/<thead>/<tbody>/<tr>/<th>/<td>` | `<w:tbl>` con righe/celle OOXML |
| `<img src="data:image/png;base64,...">` | immagine OOXML (drawing) — firme e immagini inline |

Il convertitore è limitato e prevedibile perché l'input è limitato e prevedibile (lo controlliamo noi,
generandolo). Non è un convertitore HTML generico: è tarato sul nostro sottoinsieme. Questo lo rende
fattibile e robusto. Si scrive una volta in M6, lo usano tutti i moduli.

> **Trade-off accettato dal PO:** più codice nostro (il convertitore) in cambio di zero costi e zero
> dipendenze a pagamento. Mitigazione: l'input HTML è ristretto e sotto il nostro controllo, quindi il
> convertitore copre pochi casi noti, non l'universo HTML.

### 3.5 Riuso dal pattern SafeCant (regalo dell'audit)
La funzione `generaCorpoHtmlSopralluogo()` di SafeCant è il **modello esatto** per ogni
`generaCorpoHtml<Tipo>()` di Archivio: funzione pura (dati → stringa HTML), array `parti[]` + `push` +
`join('')`, escape sistematico dei valori, sezioni condizionali, `<img>` inline per le firme, nessun
CSS inline. Questo pattern NON si reinventa: si copia da SafeCant. M6 fornisce il convertitore; i
moduli forniscono l'HTML con questo pattern.

---

### 3.6 Il motore è identico in tutta l'Operatività (principio PO 31/05)
**Il motore di generazione del verbale di sopralluogo sarà identico in tutta la sezione Operatività.**
Stesso template, stesso pattern (`generaCorpoHtml<Tipo>()` → convertitore HTML→OOXML → `{@rawXml}` →
DOCX), cambiano solo i documenti. Un solo motore (M6), N tipi di corpo. Quando si affronterà
l'Operatività (alla fine), non si costruirà nulla di nuovo: si riusa M6 con le funzioni dei documenti
operativi.

## 4. CONVENZIONI DEL CORPO HTML

M6 definisce QUALI tag HTML il corpo può usare, perché il **convertitore HTML→OOXML** (§3.4) ne
gestisce un sottoinsieme controllato. Questo è il **contratto** che ogni `generaCorpoHtml<Tipo>()`
deve rispettare — ed è esattamente il set che SafeCant già produce (accertato dall'audit):

- Struttura: `<section>`, `<article>` (contenitori), `<h2>`-`<h3>`, `<p>`, `<table>/<thead>/<tbody>/<tr>/<th>/<td>`, `<strong>`, `<em>`, `<br>`.
- Allineamento del paragrafo: attributo `data-align="left|center|right"` su `<p>` (tradotto in `<w:jc>` OOXML).
- Immagini inline (firme, foto): `<img src="data:image/png;base64,...">`.
- **Nessun CSS inline arbitrario**: gli stili li dà il template Word. Il corpo è HTML semantico pulito.
- Le **firme** (CSE redattore + presenti) vanno nel corpo come `<img>`, non nell'header (come SafeCant).

M6 fornisce un **validatore del corpo HTML** che, prima della conversione, verifica che l'HTML usi
solo i costrutti supportati dal convertitore e segnala (warning) quelli fuori set. Poiché l'HTML lo
generiamo noi (e l'editor ricco produce solo tag puliti — §4.1) in pratica non dovrebbe mai scattare:
è una rete di sicurezza, e protegge la stampa da stili sporchi (es. da copia-incolla da Word).

### 4.1 Editor di testo ricco sui campi liberi (decisione PO 31/05)
Nei campi dove il PO scrive testo libero (stato luoghi, prescrizioni, descrizioni NC, ecc.), una
**mini-barra di formattazione** con: **grassetto** (`<strong>`), *corsivo* (`<em>`), e **allineamento**
sinistra / centro / destra. Serve a evitare risultati strani nella stampa, dando controllo
sull'impaginazione direttamente mentre si scrive.

Vincolo di pulizia (cruciale per la stampa): l'editor produce **solo** questi comandi, mappati 1:1 sul
set di tag che il convertitore HTML→OOXML sa tradurre. Niente stili liberi, niente HTML arbitrario,
niente residui da copia-incolla esterno (un incolla da Word viene "ripulito" ai soli tag ammessi). Così
ciò che vedi è esattamente ciò che il convertitore produce nel Word — nessuna sorpresa in stampa.

Implementazione: un piccolo componente riusabile (`editor-ricco`) usato da tutti i campi liberi di
tutti i moduli. Si scrive una volta, vale ovunque. Niente librerie pesanti: rich text minimale su
`contenteditable` con whitelist di comandi.

### 4.2 Anteprima PDF su richiesta (decisione PO 31/05)
Il PO vuole vedere il **PDF vero** prima di salvare. Poiché generare il PDF è il passo più pesante
(template → DOCX → PDF), l'anteprima è **su richiesta**, non continua:
- mentre si scrive/formatta: anteprima **HTML** istantanea (l'output HTML di M6), per vedere subito il testo;
- pulsante **"Anteprima PDF"**: genera il PDF reale (via la catena DOCX→PDF) e lo mostra impaginato
  esattamente come verrà archiviato/stampato;
- da lì il PO conferma il salvataggio, oppure torna a modificare.

Così il PDF si genera una volta, quando serve davvero (anteprima o finalizzazione), non a ogni tasto:
il PO vede il PDF reale prima di salvare, ma lo strumento resta veloce.

---

## 5. API DEL MOTORE (come i moduli lo chiamano)

Funzione unica, contratto stabile:

```
generaDocumento({
  tipo: "verbale-sopralluogo" | "verbale-riunione" | "verifica-pos" | ...,
  templatePath: "templates/template.docx",   // o template per-tipo (vedi §1.2)
  header: {
    modulo_codice: "Mod.VS.01",
    modulo_versione: "Rev.2 — 05/2026",
    modulo_titolo: "Verbale di sopralluogo",  // usato solo se template a titolo variabile
    logo_aziendale: <PNG base64 da impostazioni globali M2>
  },
  corpo_html: "<h2>...</h2>...",              // prodotto da generaCorpoHtml<Tipo> del modulo
  formati: { html: true, docx: true, pdf: true }   // quali output servono in questa chiamata
})
→ restituisce { htmlString?, docxBlob?, pdfBlob? }   // solo i formati richiesti
```

I tre formati sono indipendentemente richiedibili: l'anteprima a schermo chiede solo `html`; la
finalizzazione chiede `docx` + `pdf` (e il PDF è sempre derivato dal DOCX, mai dall'HTML). Il motore
non sa cosa sia un "verbale": riceve header + HTML, produce i formati. Semantica tutta nel chiamante.

---

## 6. FLUSSO DI GENERAZIONE (passi interni)

```
1. Carica template DOCX (da templates/, via filesystem M1)
2. Carica logo da impostazioni globali (M2)
3. Valida il corpo HTML ricevuto (§4) → warning se costrutti fuori set
4. Se formati.html: rendi corpo_html come pagina HTML standalone → htmlString (ANTEPRIMA)
5. Se formati.docx o formati.pdf:
   5a. Converti il corpo HTML in OOXML (convertitore §3.4)
   5b. Inizializza docxtemplater core + image-module-free
   5c. Compila: header (codice/versione/titolo) + logo + {@rawXml} (corpo OOXML)
   5d. Genera DOCX (Blob)
6. Se formati.pdf: converti il DOCX → PDF (MAI dall'HTML — §2.1)
7. Restituisci { htmlString?, docxBlob?, pdfBlob? } al chiamante (che decide dove salvare — §8)
8. Errori → gestiti via errori.js di M1 (template mancante, HTML fuori set, conversione PDF fallita)
```

> Nota sulla conversione DOCX→PDF: è il passo tecnicamente più delicato lato client. Da valutare in
> costruzione la soluzione gratuita migliore (rendering del DOCX → PDF). Se nessuna soluzione
> client-side gratuita desse risultati fedeli, si valuta un fallback (es. stampa-PDF dall'anteprima
> HTML come ripiego), ma l'obiettivo resta PDF dal DOCX per coerenza d'impaginazione.

---

## 7. DOVE FINISCE IL FILE — UNA CARTELLA PER TIPOLOGIA (nota del PO)

> Il PO ha ricordato: **una cartella per ogni tipologia di documento archiviato**. È già il modello
> dell'ecosistema (struttura 01–16), lo si ribadisce qui perché M6 produce i file che vi finiscono.

M6 NON archivia: restituisce il Blob al modulo chiamante, che lo salva nella **sua** cartella tipizzata
secondo lo schema già fissato (`safehub-contratto-tecnico.md` §3 e `SafeHub.md` §4.2):

```
SafeHub-CSE-Lavori/CZ399/
├── 01_Verbali-Sopralluogo/   ← Flusso A: M6 genera DOCX → PDF, salvato qui (Finalizzati/)
├── 02_Verbali-Riunione/      ← Flusso B: M6 genera DOCX (bozza scaricata; PDF protocollato torna qui)
├── 03_Verifiche-POS/
├── 04_Proposte-Sospensione-CSE/
├── 05_Non-Conformita/
├── 06_Eventi-Incidentali/
├── 07_ODS-Inviati/
│   ... (una cartella per tipologia, prefissi 01–16) ...
```

Ogni tipo di documento ha la sua cartella. M6 è indifferente alla destinazione: è il modulo che conosce
la propria cartella e ci salva il Blob ricevuto. Questo mantiene M6 puro (un motore) e il filesystem
auto-esplicativo (una cartella = una tipologia).

---

## 8. CRITERIO DI CHIUSURA DI M6

M6 è chiuso quando:
- carica `template.docx` e compila i segnaposto header (`modulo_codice`, `modulo_versione`, `modulo_titolo`);
- il logo dalle impostazioni globali (M2) appare nell'header via image-module-free;
- il **convertitore HTML→OOXML** rende correttamente nel DOCX un corpo di prova con: titoli, paragrafi,
  `<strong>`, `<br>`, una tabella (presenti), e una firma `<img>` base64;
- il segnaposto `{@rawXml}` riceve l'OOXML del corpo e lo inietta senza errori;
- **i tre output funzionano**: HTML anteprima a schermo · DOCX dal template · PDF generato dal DOCX
  (non dall'HTML), con header/logo/codici identici nei tre formati;
- l'**editor ricco** (grassetto, corsivo, allineamento) produce solo tag puliti tradotti correttamente
  nel DOCX, senza residui da copia-incolla;
- l'**anteprima PDF su richiesta** mostra il PDF reale impaginato prima del salvataggio;
- il validatore del corpo HTML (§4) segnala eventuali costrutti fuori set senza bloccare;
- per il Flusso A, la conversione DOCX → PDF produce un PDF fedele;
- l'API `generaDocumento()` è stabile e un modulo di prova la chiama con successo;
- tutto lo stack è gratuito/MIT (nessuna libreria a pagamento), verificato.

---

## 9. DECISIONE APERTA PER IL PO

**Titolo del documento nel template** (§1.2): tieni un template per tipo (titolo fisso) o un template
unico con `{modulo_titolo}` a segnaposto?

> **Raccomandazione CTO:** template unico con `{modulo_titolo}` a segnaposto. Motivo: hai già deciso
> "un solo template per tutto l'ecosistema" (SafeHub.md §4.3). Aggiungere un segnaposto titolo costa una
> modifica di 2 minuti al template attuale e ti evita di mantenere N template Word allineati a mano nel
> tempo. Codice e versione modulo restano segnaposto come ora. Se però i moduli qualità del committente
> impongono layout di header diversi per tipo (non solo il titolo), allora servono template per tipo: in
> quel caso M6 li gestisce uguale, carica quello giusto via `templatePath`.

---

## 10. PROSSIMI PASSI

1. ✅ Audit SafeCant fatto: SafeCant non genera DOCX, il motore nasce in Archivio. Stack deciso: via
   gratuita (`{@rawXml}` + convertitore HTML→OOXML + image-module-free).
2. Il PO decide sul titolo del template (§9) ed eventualmente lo modifica (`{~corpo_html}`→`{@rawXml}`,
   ed eventuale `{modulo_titolo}`).
3. Congelato M6 → prompt di costruzione atomico per Claude Code (con focus sul convertitore HTML→OOXML
   tarato sul set di tag che l'audit ha documentato).
4. Collaudo M6 con un corpo HTML di prova (lo stesso set che SafeCant produce).
5. Poi: M2 (impostazioni globali, che forniscono logo/codici a M6) e M3 (cantieri).

---

*Design M6 Motore DOCX v1.0 — 31 maggio 2026. Analizzato sul template reale del PO. Poggia su M1
(fondazione) e impostazioni globali M2 (logo/codici). Pattern da SafeHub.md §4.3 e contratto tecnico §8.*
