# FLUSSO B — DOCUMENTI PRODOTTI DAL PO (M12–M16)
## Design di gruppo · variazioni del pilota Verbale di Riunione · v1.0 · 31 maggio 2026

> **Cosa è questo documento.** Chiude il gruppo Flusso B. Il pattern è già definito nel pilota
> `modulo-verbale-riunione-design.md` (Verbale di Riunione di Coordinamento). Qui si richiama il pattern
> comune una volta e, per ciascun modulo (Verifica POS/ITP, Proposta Sospensione CSE, Non Conformità,
> Evento Incidentale, ODS Inviati), si definisce **solo ciò che cambia**: modello dati specifico,
> funzione `generaCorpoHtml<Tipo>()`, ed eventuali differenze di ciclo di vita. Per il comportamento
> di dettaglio (UI, storage, ciclo BOZZA→FINALIZZATO→PROTOCOLLATO) la fonte è il pilota.

> **Dipendenze.** Tutti poggiano su M1 (fondazione), M2 (firma/codici/logo), M3 (cantiere corrente),
> M4 (anagrafica, per `impresa_id`), **M6** (motore DOCX → HTML/DOCX/PDF). Cartelle dal contratto tecnico §3.

---

## 1. IL PATTERN COMUNE DEL FLUSSO B (= pilota Verbale Riunione)

Tutti i moduli del Flusso B sono documenti che il **PO produce e che vanno protocollati**. Condividono:

### 1.1 Ciclo di vita (tre stati)
```
BOZZA                          (compilazione in SafeHub; file UUID in Bozze/)
   │ il PO finalizza → M6 genera HTML (anteprima) + DOCX
   ▼
FINALIZZATO_DA_PROTOCOLLARE    (DOCX scaricato; inviato ai superiori via mail)
   │ superiori firmano + protocollo del committente
   │ ritorna: PDF protocollato + numero + data + lettera di trasmissione
   ▼
PROTOCOLLATO                   (il PO carica i 4 elementi; record spostato in Protocollati/;
                                rinominato <numero_progressivo>; stato definitivo immutabile)
```

### 1.2 Caratteristica chiave (dal pilota)
SafeHub **NON archivia il DOCX** prodotto: è una bozza di lavoro. Archivia solo il **PDF protocollato**
che torna dal giro mail-superiori — il documento a valore legale. Il DOCX è il mezzo, il PDF protocollato
è il fine.

### 1.3 Storage comune
```
<NN>_<Categoria>/
├── Bozze/            ← <uuid>.json (BOZZA e FINALIZZATO_DA_PROTOCOLLARE)
└── Protocollati/     ← <numero>.json + <numero>.pdf (protocollato) + lettera trasmissione
```
Modello file=stato; IDB indicizza. (NC = eccezione, §4.)

### 1.4 Ruolo di M6 (i tre output)
Alla finalizzazione, ogni modulo chiama M6 con il proprio `corpo_html` (da `generaCorpoHtml<Tipo>()`):
M6 produce HTML (anteprima a schermo), DOCX (da inviare), e — dove serve l'archivio interno — PDF dal
DOCX. Il PDF **protocollato** (diverso) è quello che torna dai superiori e che il PO carica.

### 1.5 Cosa cambia tra i moduli (solo questo)
- il **modello dati** specifico del documento;
- la funzione **`generaCorpoHtml<Tipo>()`** (il corpo del documento);
- i **codici modulo qualità** (da M2);
- eventuali **differenze di ciclo di vita** (le NC, §4).
Tutto il resto — UI bozza/finalizza/protocolla, storage, cruscotto, integrazione M6 — è il pilota.

---

## 2. M12 — VERIFICA POS / ITP

| Voce | Valore |
|---|---|
| **Cartella** | `03_Verifiche-POS/` (ITP = sottotipo nella stessa cartella) |
| **Cos'è** | Verifica di idoneità del POS di un'impresa (POS); verifica idoneità tecnico-professionale (ITP) |
| **Riferimento normativo** | POS: art.92 c.1.b · ITP: art.90 c.9 / All.XVII (vedi `chi-redige-firma-invia.md` §4-5) |
| **Campi specifici** | `sottotipo` (POS / ITP) · `impresa_id` (FK M4, **obbligatorio UX**) · `esito` (idoneo / da integrare / non idoneo) · `documenti_verificati[]` · `integrazioni_richieste` (testo) · `soggetto_verificante` (CSE per incarico / committente / affidataria — vedi nota ITP) |
| **Aggancio dati** | Legge dall'anagrafica (M4) i documenti attesi per `tipoRapporto` dell'impresa (gradazione obbligatorio/facoltativo) → la verifica sa cosa controllare. Si collega al POS Documentale (M21, Flusso C) che contiene il POS depositato |
| **Nota ITP** | L'ITP è giuridicamente obbligo del committente/RL (affidataria sui sub). Il campo `soggetto_verificante` lo esplicita; default CSE per incarico |
| **Ciclo** | Standard (BOZZA→FINALIZZATO→PROTOCOLLATO) |

> Aggancio chiave: M12 è il punto dove il POS Documentale ricevuto (M21) viene esaminato. Dal POS
> depositato si può avviare la relativa Verifica POS (decisione aperta del Flusso C §10.1 — qui si
> conferma: **sì, pulsante "Verifica questo POS" da M21 che apre una bozza M12 con impresa precompilata**).

---

## 3. M13 — PROPOSTA DI SOSPENSIONE CSE

| Voce | Valore |
|---|---|
| **Cartella** | `04_Proposte-Sospensione-CSE/` |
| **Cos'è** | Proposta del CSE di sospendere lavorazioni/allontanare impresa (art.92 c.1.e), o sospensione diretta in pericolo grave (lett.f) |
| **Campi specifici** | `fattispecie` (PROPOSTA art.92e / SOSPENSIONE_DIRETTA art.92f) · `impresa_id` (FK M4) · `lavorazioni` (testo) · `motivazione` · `contestazione_scritta` (rif. alla contestazione preventiva all'impresa) · `destinatario` (Committente/RL) |
| **Distinzione critica** | **PROPOSTA** (lett.e): va al Committente/RL che poi *dispone* (la disposizione del RL è Flusso C, M19). **SOSPENSIONE DIRETTA** (lett.f): atto immediato del CSE in pericolo grave. Vedi `chi-redige-firma-invia.md` §6 |
| **Collegamento** | Campo opzionale per legare la proposta alla successiva Disposizione RL (M19) che ne consegue, per tracciare proposta→disposizione |
| **Ciclo** | Standard. (La sospensione diretta lett.f può avere urgenza: il PO la finalizza e la comunica subito; il protocollo segue) |

---

## 4. M14 — NON CONFORMITÀ ⚠ (ciclo di vita diverso)

| Voce | Valore |
|---|---|
| **Cartella** | `05_Non-Conformita/` con sottocartelle **`Aperte/` · `In-Risoluzione/` · `Chiuse/`** |
| **Cos'è** | Non conformità rilevate (spesso nate da una "NC draft" di un verbale di sopralluogo) e formalizzate dal PO |
| **Campi specifici** | `impresa_id` (FK M4) · `gravita` (lieve/grave/gravissima) · `descrizione` · `scadenza_risoluzione` · `azioni_correttive` · `stato_nc` (aperta/in-risoluzione/chiusa) · `data_chiusura` · `verifica_chiusura` |
| **⚠ CICLO DI VITA DIVERSO** | Le NC **non** seguono BOZZA→FINALIZZATO→PROTOCOLLATO. Seguono un **workflow tri-stato di risoluzione**: **APERTA → IN-RISOLUZIONE → CHIUSA** (dal contratto tecnico §3). Il file si sposta tra le tre sottocartelle al cambio di stato |
| **Scadenza** | La NC ha una `scadenza_risoluzione`: è una **scadenza monitorata** nel cruscotto (a differenza degli altri B). La gravità "gravissima" → trattamento prioritario. Collegamento con le soglie di M2 |
| **Origine da sopralluogo** | Una NC può nascere da `nc_drafts[]` di un verbale SafeCant (Flusso A): il dato arriva, il PO la formalizza qui. Aggancio Flusso A → Flusso B |
| **Documento** | Può comunque generare un documento (via M6) da inviare all'impresa/affidataria; ma il suo *stato* è quello di risoluzione, non di protocollo |

> Le NC sono la variazione più sostanziosa del gruppo B: workflow di risoluzione invece che di
> protocollo, scadenza monitorata, origine dai sopralluoghi. Vanno progettate con cura a sé quando si
> costruisce M14, pur riusando UI/storage/M6 del pilota dove coincidono.

---

## 5. M15 — EVENTO INCIDENTALE

| Voce | Valore |
|---|---|
| **Cartella** | `06_Eventi-Incidentali/` (Bozze/ + Finalizzati/ → qui "Finalizzati" = archiviati) |
| **Cos'è** | Registrazione di near-miss e infortuni occorsi in cantiere |
| **Campi specifici** | `tipo_evento` (near-miss / infortunio) · `impresa_id` (FK M4) · `data_ora_evento` · `luogo` (progressiva) · `persone_coinvolte` · `dinamica` · `conseguenze` · `azioni_immediate` · `gravita` |
| **Sensibilità dati** | Coinvolge dati personali/sanitari di lavoratori → trattamento riservato; il documento resta interno/comunicato secondo necessità |
| **Ciclo** | Standard (bozza → finalizzato/archiviato). Può non richiedere protocollo esterno: spesso è registrazione interna + eventuali comunicazioni dovute |

---

## 6. M16 — ODS INVIATI

| Voce | Valore |
|---|---|
| **Cartella** | `07_ODS-Inviati/` |
| **Cos'è** | Ordini di Servizio che il PO emette/invia |
| **Campi specifici** | `numero_ods` · `destinatario` (impresa/i, FK M4) · `oggetto` · `disposizioni` (testo) · `data_invio` |
| **Simmetria** | Speculare a ODS Ricevuti (M20, Flusso C): stessi concetti, direzione opposta (qui si producono e inviano) |
| **Ciclo** | Standard. Può seguire protocollo o essere invio diretto all'impresa, secondo prassi |

---

## 7. QUADRO SINOTTICO DEL FLUSSO B

| Modulo | Cartella | Ciclo di vita | Campi distintivi | Scadenza? |
|---|---|---|---|:-:|
| Verbale Riunione (pilota) | `02_` | BOZZA→FINALIZ→PROTOCOLLATO | presenti + firme multiple | no |
| M12 Verifica POS/ITP | `03_` | standard | sottotipo, impresa, esito, verificante | no |
| M13 Proposta Sospensione CSE | `04_` | standard | fattispecie e/f, impresa, lavorazioni | no |
| M14 Non Conformità | `05_` | **APERTA→IN-RISOL→CHIUSA** | gravità, scadenza_risoluzione, azioni | **sì** |
| M15 Evento Incidentale | `06_` | standard | tipo, dinamica, persone (dati sensibili) | no |
| M16 ODS Inviati | `07_` | standard | numero, destinatario, disposizioni | no |

Firme: il **Verbale Riunione** è l'unico con firme multiple (CSE + presenti). Gli altri B: firma del
CSE (da M2). (Dal documento RACI `chi-redige-firma-invia.md`.)

---

## 8. COSA È UGUALE PER TUTTI (da non riprogettare)

UI compilazione bozza · finalizzazione con anteprima HTML + DOCX (M6) · scaricamento DOCX da inviare ·
caricamento PDF protocollato + numero + data + lettera · spostamento Bozze→Protocollati · cruscotto con
apri-click/stampa/download · firma CSE da M2 · `impresa_id` da M4 · file=stato + IDB. **Tutto questo è
il pilota Verbale Riunione.** Le eccezioni: NC (ciclo tri-stato + scadenza), firme multiple del Verbale.

---

## 9. CRITERIO DI CHIUSURA DEL FLUSSO B

Il Flusso B è chiuso quando, per ciascun modulo:
- la compilazione bozza salva in `Bozze/` (UUID);
- la finalizzazione genera anteprima HTML + DOCX via M6 col corpo specifico del documento;
- il caricamento del PDF protocollato + metadati sposta il record in `Protocollati/` (immutabile);
- M12 si aggancia all'anagrafica (documenti attesi) e al POS Documentale (M21);
- M13 distingue proposta (e) da sospensione diretta (f) e si lega alla disposizione RL (M19);
- **M14 segue il ciclo APERTA→IN-RISOLUZIONE→CHIUSA con scadenza monitorata, nasce anche da NC draft dei sopralluoghi**;
- M15 tratta i dati sensibili con riservatezza; M16 è speculare a M20;
- il cruscotto di ogni modulo consulta, apre, stampa, scarica;
- tutti riusano il pilota tranne le eccezioni dichiarate (NC, firme multiple).

---

## 10. DECISIONI APERTE PER IL PO

1. **NC — workflow**: confermi APERTA→IN-RISOLUZIONE→CHIUSA come i tre stati? Serve uno stato
   intermedio "verifica in corso" o bastano i tre?
2. **Proposta/Sospensione diretta (M13)**: la sospensione diretta (lett.f, urgente) ha una procedura
   accelerata in UI (finalizza e comunica subito), o stesso flusso della proposta?
3. **ODS e protocollo (M16)**: gli ODS che invii seguono sempre il protocollo come gli altri B, o a
   volte sono invii diretti all'impresa senza protocollo?

---

## 11. PROSSIMI PASSI

1. Il PO rivede questo design di gruppo.
2. Congelato → prompt di costruzione per Claude Code: prima il pilota (Verbale Riunione, già
   progettato), poi i moduli come variazioni; **M14 (NC) progettata con cura a sé** per il ciclo diverso.
3. Restano i moduli di supporto: Registro PSC, Foto, Cruscotto generale, AI locale (il Diario è già progettato).

---

*Design di gruppo Flusso B (M12–M16) v1.0 — 31 maggio 2026. Variazioni del pilota Verbale di Riunione.
Pattern: documento prodotto dal PO → BOZZA→FINALIZZATO(DOCX via M6)→PROTOCOLLATO. Eccezione NC:
ciclo APERTA→IN-RISOLUZIONE→CHIUSA con scadenza. Poggia su M1, M2, M3, M4, M6.*
