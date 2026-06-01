# FLUSSO A — OPERATIVITÀ: VERBALE DI SOPRALLUOGO (M7–M10)
## L'unico documento che nasce sul campo · v1.0 · 31 maggio 2026

> **Cosa è questo documento.** Il design del Flusso A: il verbale di sopralluogo che nasce in SafeCant
> (sul campo, iPad) e arriva in SafeHub Archivio per essere rifinito, controfirmato dal CSE e
> finalizzato in PDF d'archivio. È l'**unico** documento del Flusso A e l'unico contenuto della sezione
> Operatività. Progettato sulla base della verifica reale di cosa SafeCant produce (verbale reale
> analizzato), non su ipotesi.

> **Dipendenze.** Poggia su M1 (fondazione, inbox), M2 (identità/firma CSE), M3 (cantiere corrente),
> M4 (anagrafica, per agganciare imprese/presenti), M6 (motore → HTML/DOCX/PDF). È in sospeso per
> scelta del PO: si progetta ora ma si costruisce alla fine.

---

## 1. COSA ARRIVA DA SAFECANT (verità accertata sul file reale)

Il file di interscambio JSON prodotto da SafeCant contiene (verbale reale `verbale_sopralluogo_...json`):

| Chiave | Contenuto | Note per Archivio |
|---|---|---|
| `schema_version`, `tipo_file`, `generato_da*` | intestazione | `tipo_file: verbale_sopralluogo_interscambio` |
| `id_locale_verbale` | id assegnato da SafeCant | es. `VS_1780181497654` |
| `metadati` | `cantiere_id`, `data_sopralluogo`, `oggetto`, `condizioni_meteo`, `progressiva_chilometrica` | ⚠ `cantiere_id` può essere `""` (vedi §6) |
| `redattore` | chi ha fatto il sopralluogo: `nome_cognome`, `qualifica`, `firma_png_base64`, `timestamp_firma`, `tipo_firma: permanente` | ⚠ nome/qualifica possono essere VUOTI (bug §6) ma la firma c'è |
| `presenti[]` | per ciascuno: `nome_cognome`, `qualifica`, `impresa`, `impresa_id`, `firmato`, `firma_png_base64`, `timestamp_firma`, `rifiuto_firma`, `motivo_rifiuto` | firme dei presenti, già strutturate; può esserci il rifiuto firma |
| `imprese_presenti[]` | imprese presenti | spesso vuoto |
| `nc_drafts[]` | bozze di Non Conformità rilevate | → possono diventare NC (Flusso B, M14) |
| `campi_testuali` | `stato_luoghi`, `note_prescrizioni` | testo libero |
| `corpo_html` | HTML completo del corpo (~44KB) con firme inline | il corpo già pronto per M6 |

### 1.1 Le firme che arrivano da SafeCant
- **Redattore** (il sopralluoghista): firma `permanente` configurata sul suo dispositivo. Presente.
- **Presenti**: ciascuno con la propria firma raccolta sul campo (o rifiuto motivato). Presenti.
- **CSE titolare**: ❗ **NON c'è.** SafeCant è lo strumento del sopralluoghista; il CSE non è in
  cantiere al momento del sopralluogo. La sua firma manca per costruzione — ed è il pezzo che Archivio
  deve aggiungere (§4).

---

## 2. IL CICLO DEL FLUSSO A

```
SafeCant (campo) → JSON di interscambio in SafeHub-Verbali-Ricevuti/
   │ Archivio rileva il nuovo verbale (inbox)
   ▼
RICEVUTO (inbox)            M7 — l'inbox dei verbali in arrivo
   │ il PO apre e rivede
   ▼
IN RIFINITURA              M8 — editor: corregge testo, aggancia anagrafica, gestisce nc_drafts
   │ il PO controfirma come CSE
   ▼
CONTROFIRMATO              M9 — la firma del CSE viene aggiunta al verbale
   │ il PO finalizza → M6 genera DOCX → PDF
   ▼
FINALIZZATO                PDF d'archivio immutabile in 01_Verbali-Sopralluogo/Finalizzati/
   │ foto del sopralluogo associate
   ▼
ARCHIVIATO                 M10 — associazione foto + chiusura
```

A differenza del Flusso B, **non c'è protocollo esterno**: il verbale di sopralluogo è un documento
interno del CSE. Il CSE lo controfirma e lo archivia; il PDF è il documento definitivo.

---

## 3. M7 — INBOX DEI VERBALI RICEVUTI

### 3.1 Cosa fa
- Rileva i nuovi JSON in `SafeHub-Verbali-Ricevuti/` (cartella condivisa: colleghi scrivono, PO legge).
- Li mostra in una lista "da processare" (cruscotto inbox), con: data sopralluogo, redattore, oggetto,
  cantiere (se valorizzato), numero presenti, numero nc_drafts.
- Importa il verbale nell'IDB (`verbali_ricevuti_inbox` di M1) e lo apre in rifinitura.
- Dopo l'import, sposta il JSON in `_presi-in-carico/` (contratto §3.2): così l'inbox mostra a colpo
  d'occhio cosa è ancora da processare.

### 3.2 Cruscotto inbox
Coerente col principio "ogni archivio è un cruscotto": pannello in cima con "N verbali da processare",
lista ordinata per data, apertura con un click. È la porta d'ingresso del Flusso A.

---

## 4. M8 — EDITOR DI RIFINITURA + M9 CONTROFIRMA CSE

### 4.1 Rifinitura del corpo (M8)
Il PO rivede e corregge il verbale arrivato dal campo:
- **Testo**: corregge `stato_luoghi`, `note_prescrizioni`, oggetto — il sopralluoghista scrive in
  fretta sul campo, il CSE rifinisce in ufficio. (Con AI opzionale M26: "migliora testo".)
- **Aggancio anagrafica**: i presenti arrivano con `origine: manuale` e `impresa_id: null` (inseriti a
  mano sul campo). In Archivio il PO può **agganciarli all'anagrafica** (M4): collegare il presente
  all'impresa reale, il che dà coerenza ai dati e abilita la conformità. Non bloccante: se resta
  manuale, va bene comunque.
- **nc_drafts**: le NC abbozzate sul campo possono essere **promosse a Non Conformità** vere (Flusso B,
  M14) con un'azione dedicata. Aggancio A → B.

### 4.2 ❗ La controfirma del CSE (M9) — il punto che mancava
Il sopralluoghista ha firmato sul campo; i presenti hanno firmato; **manca la firma del CSE titolare**.
Archivio la aggiunge in fase di finalizzazione:

- La firma del CSE viene da **M2** (firma permanente del CSE, caricata da PNG una volta sola).
- Al momento della controfirma, il PO conferma "firmo come CSE titolare" → la firma di M2 viene
  **aggiunta al corpo del verbale** come blocco firma dedicato (sezione "Il CSE" in coda al documento,
  accanto/sotto a quella del sopralluoghista redattore).
- Da quel momento il verbale ha **due firme di responsabilità**: il sopralluoghista (chi ha eseguito il
  sopralluogo) e il CSE (che valida e si assume la titolarità). Più le firme dei presenti nel corpo.

### 4.3 Come si gestiscono le firme (decisione di design)
Tre categorie di firma nel verbale finalizzato, tutte come `<img>` nel corpo HTML (pattern SafeCant):
1. **Presenti** — raccolte sul campo da SafeCant, già nel `corpo_html`. Restano come sono (o rifiuto motivato).
2. **Sopralluoghista/redattore** — firma permanente dal suo dispositivo, già nel `corpo_html`. Resta.
3. **CSE titolare** — ❗ **aggiunta in Archivio** da M2, in fase di controfirma. È il pezzo nuovo.

Il corpo finale = corpo_html di SafeCant (presenti + redattore) + **blocco firma CSE iniettato da
Archivio** prima della generazione del documento. M6 genera HTML/DOCX/PDF da questo corpo completo.

> Nota sul redattore con nome vuoto (bug §6): in rifinitura il PO può completare nome/qualifica del
> redattore se arrivati vuoti, prima di finalizzare. Archivio non eredita il bug: lo corregge.

---

## 5. FINALIZZAZIONE E ARCHIVIAZIONE (M9→M10)

### 5.1 Generazione (via M6)
Finalizzato il corpo (rifinito + controfirma CSE), il PO finalizza:
- M6 produce **HTML** (anteprima), **DOCX**, e **PDF**.
- Il **PDF** è il documento d'archivio immutabile → `01_Verbali-Sopralluogo/Finalizzati/`.
- Naming: `<data>_<numero-verbale>.pdf` + il JSON completo affiancato (record + corpo + firme).

### 5.2 M10 — Associazione foto
Le foto del sopralluogo arrivano separate (`SafeHub-Foto-Sopralluoghi/`, naming
`<data>_<cantiere>_<numero-verbale>_<NN>.jpg`). M10 le associa al verbale tramite il numero verbale.
Le foto vivono in `16_Foto/` (M24) e sono referenziate, non duplicate nel file.

### 5.3 Stato finale
Verbale FINALIZZATO + ARCHIVIATO: PDF immutabile, foto associate, eventuali NC promosse al Flusso B,
presenti agganciati all'anagrafica dove possibile. Chiuso.

---

## 6. DEBITI DA SAFECANT DA GESTIRE IN ARCHIVIO (dall'audit)

L'import in Archivio deve gestire con grazia i debiti noti di SafeCant (senza ereditarli):
- **`cantiere_id` vuoto** (`""`): in inbox il PO assegna il cantiere corretto prima di processare (M7).
  Rompe anche il naming se resta vuoto → Archivio lo richiede in fase di presa in carico.
- **redattore nome/qualifica vuoti** ma firma presente: il PO li completa in rifinitura (§4.2).
- **`impresa_id: null` / `origine: manuale`** sui presenti: agganciabili all'anagrafica in rifinitura.
- **scadenza NC "gravissima" come datetime grezzo** (debito SafeCant): se una nc_draft viene promossa a
  NC, Archivio formatta correttamente la data.
- **`impresa_id: ""` vs `null`**: Archivio gestisce entrambi come "non assegnato".

> Questi debiti vanno anche segnalati per la correzione futura di SafeCant (e l'integrazione anagrafica
> che li elimina alla radice), ma Archivio non aspetta: li gestisce all'import.

---

## 7. CRITERIO DI CHIUSURA DEL FLUSSO A

Il Flusso A è chiuso quando:
- M7 rileva i verbali in `SafeHub-Verbali-Ricevuti/`, li mostra in inbox, li importa e sposta in `_presi-in-carico/`;
- in inbox si assegna il cantiere se `cantiere_id` è vuoto;
- M8 rifinisce testo, aggancia presenti all'anagrafica, completa il redattore se vuoto;
- le nc_drafts si promuovono a NC del Flusso B (M14);
- **M9 aggiunge la controfirma del CSE (da M2) al corpo del verbale** — il pezzo nuovo rispetto a SafeCant;
- M6 genera HTML/DOCX/PDF dal corpo completo (presenti + redattore + CSE);
- il PDF immutabile va in `01_Verbali-Sopralluogo/Finalizzati/`;
- M10 associa le foto via numero verbale;
- i debiti SafeCant (§6) sono gestiti all'import senza essere ereditati.

---

## 8. DECISIONI APERTE PER IL PO

1. **Posizione della firma CSE nel documento**: la controfirma del CSE va in coda (sezione "Il CSE
   valida") sotto la firma del sopralluoghista, o accanto ad essa in un blocco firme congiunto
   (sopralluoghista | CSE)? È una scelta di layout del documento finale.
2. **La controfirma è sempre obbligatoria?** Immagino di sì (il CSE si assume la titolarità di ogni
   verbale), ma confermi che nessun verbale di sopralluogo si archivia senza la tua controfirma?
3. **Aggancio presenti→anagrafica**: lo vuoi come passo suggerito in rifinitura o del tutto opzionale
   lasciato alla tua discrezione caso per caso?

---

## 9. PROSSIMI PASSI

1. Il PO rivede questo design.
2. Congelato → con questo la biblioteca di design di SafeHub Archivio è **completa** (tutti i flussi A/B/C + fondazione + supporto).
3. La costruzione del Flusso A resta per ultima (scelta del PO): si farà dopo la fondazione e gli altri flussi, riusando M6 e il pattern già collaudato.

---

*Design Flusso A / Operatività (M7–M10) v1.0 — 31 maggio 2026. Unico documento: verbale di sopralluogo
da SafeCant. Pattern: inbox → rifinitura → controfirma CSE → finalizzazione PDF. La controfirma del CSE
(da M2) è il pezzo che Archivio aggiunge a ciò che arriva dal campo. Poggia su M1, M2, M3, M4, M6.*
