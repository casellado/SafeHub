# FLUSSO C — DOCUMENTI RICEVUTI (M18–M21)
## Design di gruppo · variazioni del pilota M17 · v1.0 · 31 maggio 2026

> **Cosa è questo documento.** Chiude l'intero Flusso C. Il pattern è **identico** per tutti i moduli
> di documenti ricevuti — già progettato nel pilota `M17-Notifica-Preliminare-FlussoC.md`. Qui si
> definisce una volta il pattern comune e, per ciascun modulo (M18, M19, M20, M21), **solo ciò che
> cambia**: la cartella e qualche metadato. Niente ripetizioni: per il comportamento di dettaglio
> (upload/drag-drop, non-bloccanza, cruscotto con apri/stampa/scarica) la fonte è M17.

> **Dipendenze.** Tutti poggiano su M1 (fondazione) e M3 (cantiere corrente). Nessuno usa M6 (i
> documenti arrivano già fatti). Cartelle dal contratto tecnico §3.

---

## 1. IL PATTERN COMUNE (= M17, in sintesi)

Tutti i moduli del Flusso C condividono **esattamente** questo comportamento, definito nel pilota M17:

- **Acquisizione**: upload o **drag-and-drop** del PDF ricevuto.
- **Accompagnamenti**: numero protocollo, data, ed eventuale lettera di trasmissione (PDF), registrati
  insieme al documento.
- **Unità d'archivio**: terna documento + `.meta.json` + eventuale `.lettera.pdf` nella cartella del
  cantiere corrente. Modello "file = stato"; IDB indicizza, i file sono canonici.
- **Tutto non bloccante**: si archivia anche col solo PDF; metadati completabili dopo.
- **Cruscotto**: lista con metadati, ricerca/ordinamento, **apertura con un click (iperlink)**,
  **stampa**, **download**; modifica metadati, aggiunta lettera posticipata, eliminazione → cestino.
- **Pannello in cima**: riepilogo essenziale + promemoria gentile sui documenti senza protocollo.

> Regola di costruzione: M18–M21 **riusano il codice di M17** (stesso componente di acquisizione,
> stesso cruscotto, stesso form metadati), parametrizzato per cartella e metadati specifici. Non si
> riscrive il modulo quattro volte: si configura.

---

## 2. STRUTTURA METADATI COMUNE (base)

Tutti partono dalla stessa base `.meta.json` di M17 (`tipo`, `cantiere_id`, `protocollo`,
`data_protocollo`, `data_ricezione`, `oggetto`, `mittente`, `ha_lettera_trasmissione`,
`file_documento`, `file_lettera`, `note`, `archiviato_il`). Ogni modulo **aggiunge** i pochi campi
suoi, elencati sotto.

---

## 3. M18 — VERIFICHE ENTI ESTERNI

| Voce | Valore |
|---|---|
| **Cartella** | `11_Verifiche-Enti-Esterni/` |
| **Cos'è** | Verbali/verifiche ricevuti da enti di controllo: ASL, Ispettorato del Lavoro (INL), VVF, ecc. |
| **Mittente tipico** | ASL · INL · VVF · altri enti |
| **Chi firma/produce** | L'ente esterno (documento di terzi, ricevuto) |
| **Campi aggiunti** | `ente` (ASL/INL/VVF/altro) · `esito` (favorevole / prescrizioni / sanzione) · `prescrizioni` (testo) · `scadenza_adempimento` (se l'ente impone un termine) |
| **Nota cruscotto** | Se è presente `scadenza_adempimento`, il cruscotto la evidenzia (a differenza della notifica, qui può esserci un termine da rispettare) — alert gentile, non bloccante |

> Differenza rilevante dal pilota: una verifica con prescrizioni può avere una **scadenza di
> adempimento**. È l'unico modulo C con una componente di scadenza; il cruscotto la mostra.

---

## 4. M19 — DISPOSIZIONI E SOSPENSIONI DEL RL

| Voce | Valore |
|---|---|
| **Cartella** | `12_Disposizioni-Sospensioni-RL/` |
| **Cos'è** | Disposizioni e ordini di sospensione emessi dal Responsabile dei Lavori / Committente, ricevuti dal PO |
| **Mittente tipico** | RL · Committente |
| **Chi firma/produce** | Il RL / Committente (vedi `chi-redige-firma-invia.md` §7: la *disposizione* è del RL, da non confondere con la *proposta* del CSE che è Flusso B) |
| **Campi aggiunti** | `sotto_tipo` (disposizione / sospensione) · `impresa_id` (impresa destinataria, FK anagrafica M4) · `lavorazioni_sospese` (testo) · `data_efficacia` |
| **Nota** | Collegamento logico opzionale a una eventuale Proposta di Sospensione CSE (Flusso B) che l'ha originata: campo `riferimento_proposta_cse` (id del documento B), per tracciare proposta→disposizione |

> Punto da non sbagliare (già fissato nel documento RACI): qui si archivia ciò che **il RL dispone**.
> La *proposta* del CSE sta nel Flusso B (modulo che il PO produce). Due atti, due autori, due flussi.

---

## 5. M20 — ODS RICEVUTI

| Voce | Valore |
|---|---|
| **Cartella** | `13_ODS-Ricevuti/` |
| **Cos'è** | Ordini di Servizio ricevuti dal Committente / RL / Direzione Lavori |
| **Mittente tipico** | Committente · RL · DL |
| **Chi firma/produce** | L'emittente (DL/RL/Committente) |
| **Campi aggiunti** | `numero_ods` · `emittente` (DL/RL/Committente) · `oggetto_ods` · `richiede_riscontro` (sì/no) |
| **Nota** | Simmetrico agli ODS Inviati (Flusso B, `07_ODS-Inviati/`): stessi concetti, direzione opposta. Qui si **ricevono**, là si **producono** |

---

## 6. M21 — POS DOCUMENTALE

| Voce | Valore |
|---|---|
| **Cartella** | `14_POS-Documentale/` |
| **Cos'è** | I POS (Piani Operativi di Sicurezza) depositati dalle imprese, archiviati come documenti ricevuti |
| **Mittente tipico** | Impresa esecutrice (via affidataria per i subappalti) |
| **Chi firma/produce** | L'impresa che redige il POS |
| **Campi aggiunti** | `impresa_id` (FK anagrafica M4 — **obbligatorio nella UX**: un POS è sempre di un'impresa) · `revisione_pos` · `data_deposito` |
| **Collegamento chiave** | Il POS archiviato qui è il documento che la **Verifica POS** (Flusso B, M12) esamina. Aggancio: dal POS documentale si può avviare/collegare la relativa Verifica POS. È il punto dove Flusso C e Flusso B si toccano |

> Differenza rilevante: il POS documentale è **sempre associato a un'impresa** (`impresa_id`). A
> differenza degli altri C (dove il mittente è un ente/RL), qui il cruscotto raggruppa per impresa e
> il semaforo "POS presente/assente" alimenta la conformità anagrafica (M4 §5.5 / "Conformità Documenti").

---

## 7. QUADRO SINOTTICO DEL FLUSSO C

| Modulo | Cartella | Mittente | Campi specifici | Particolarità |
|---|---|---|---|---|
| M17 Notifica Preliminare | `10_` | Committente/RL | — (base) | pilota; varianti in Aggiornamenti/ |
| M18 Verifiche Enti | `11_` | ASL/INL/VVF | ente, esito, prescrizioni, scadenza_adempimento | unico con scadenza |
| M19 Disposizioni/Sospensioni RL | `12_` | RL/Committente | sotto_tipo, impresa_id, lavorazioni_sospese | non confondere con proposta CSE (B) |
| M20 ODS Ricevuti | `13_` | Committente/RL/DL | numero_ods, emittente, richiede_riscontro | simmetrico a ODS Inviati (B) |
| M21 POS Documentale | `14_` | Impresa | impresa_id (obbl.), revisione_pos | si aggancia a Verifica POS (B) e a Conformità (M4) |

---

## 8. COSA È UGUALE PER TUTTI (da non riprogettare)

Acquisizione upload/drag-drop · gestione lettera di trasmissione · metadati base · non-bloccanza ·
cruscotto con apri-click/stampa/download · modifica metadati posticipata · cestino · file=stato ·
indicizzazione IDB. **Tutto questo è M17.** M18–M21 = M17 + (cartella diversa) + (pochi campi in più).

---

## 9. CRITERIO DI CHIUSURA DEL FLUSSO C

Il Flusso C è chiuso quando, per ciascuno dei quattro moduli:
- l'acquisizione (upload + drag-drop) deposita il PDF nella cartella giusta;
- i metadati base + i campi specifici si registrano (non bloccante);
- il cruscotto consulta, apre con un click, stampa, scarica;
- M18 evidenzia la scadenza di adempimento quando presente;
- M19 distingue disposizione/sospensione e lega l'impresa (+ eventuale riferimento alla proposta CSE);
- M20 registra numero/emittente/riscontro;
- M21 associa sempre l'impresa e si collega alla Verifica POS e alla Conformità anagrafica;
- tutti riusano il codice del pilota M17 (nessuna duplicazione).

---

## 10. DECISIONI APERTE PER IL PO

1. **Aggancio POS documentale → Verifica POS**: vuoi che dal POS depositato (M21) si possa avviare
   direttamente la Verifica POS (M12, Flusso B) con un pulsante, o li tieni separati e fai la verifica
   dall'apposito modulo? (è il punto dove i due flussi si toccano — lo decidiamo quando progettiamo M12)
2. **Scadenza adempimento (M18)**: la trattiamo come le scadenze critiche dell'anagrafica (con soglia
   di preavviso da M2) o come semplice data evidenziata nel cruscotto?

---

## 11. PROSSIMI PASSI

1. Il PO rivede questo design di gruppo.
2. Congelato → un unico prompt di costruzione per Claude Code che realizza il modulo C parametrico
   (M17 come base) e lo istanzia per le 5 cartelle.
3. Flusso C completo. Si passa al Flusso B (Verifica POS/ITP, ecc.).

---

*Design di gruppo Flusso C (M18–M21) v1.0 — 31 maggio 2026. Variazioni del pilota M17. Pattern unico:
documento ricevuto → upload/drag-drop + metadati → cruscotto apri/stampa/scarica, non bloccante.
Poggia su M1 e M3. Differenze: solo cartella e pochi campi per modulo.*
