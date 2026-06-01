# Piano di Sviluppo SafeHub — Ecosistema 2026
## Quando, in che ordine, cosa decide il passaggio · riscritto 31 maggio 2026

> **Nota di versione.** Riscrive il piano originale (29 maggio) allineandolo allo stato reale del 31
> maggio: Firma e SafeCant sono online, la biblioteca di design di Archivio è completa, V3 è
> abbandonata (niente migrazione dati). Documenti correlati: `SafeHub.md` (visione), `SafeHubProcedura.md`
> (metodo), e la biblioteca di design (vedi `00-INDICE-Biblioteca-SafeHub.md`).

---

## 1. PRINCIPI DI PIANIFICAZIONE

- **Sicurezza dei dati reali sempre prima.** I cantieri hanno valore legale; in dubbio, si rallenta.
- **Pilota prima del prodotto principale.** Dentro ogni flusso si costruisce il modulo pilota, poi gli
  altri come variazioni.
- **Gate di decisione tra fasi.** Tra una fase e l'altra: "abbiamo finito davvero? vale la pena
  proseguire? è cambiato qualcosa?".
- **Tempo perso, non scadenze.** Il PO è CSE a tempo pieno; il piano stima ordini di grandezza.
- **Reversibilità.** Ogni fase termina con qualcosa di funzionante e utile da solo.
- **AI come accelerazione, non bloccante.** Si integra dopo che le basi sono solide.
- **La biblioteca di design viene prima del codice.** Ogni modulo si costruisce solo dopo che il suo
  `.md` di design è congelato (già fatto: la biblioteca è completa).

---

## 2. PANORAMICA — TRE PRODOTTI, CINQUE FASI

| Prodotto | Stato (31 mag) | Repo | Per chi |
|---|---|---|---|
| SafeHub Firma | ✅ online | `safehub-firma` | PO, utility firma |
| SafeCant | ✅ online (da completare) | `safehub-operativita` | Colleghi sopralluoghisti + PO |
| SafeHub Archivio | da costruire (design completo) | `safehub-archivio` | PO / CSE titolare |

> V3 (`cse-attuale`) è **abbandonata**, non più transitoria. Si riparte da repo pulito. Nessuna
> migrazione dati: le anagrafiche reali si ricompilano nel nuovo sistema.

Cinque fasi:
1. **Fase 1 — Deploy Firma** — ✅ FATTA
2. **Fase 2 — SafeCant** — ✅ online, da completare (integrazione anagrafica + bug nome compilatore)
3. **Fase 3 — Pre-fase AI locale** — in parallelo, quando il PO vuole
4. **Fase 4 — SafeHub Archivio** — da costruire (design completo, 26 moduli)
5. **Fase 5 — Sostituzione di V3** — semplificata (niente migrazione, solo spegnimento V3)

---

## 3. FASE 1 — DEPLOY FIRMA ✅ FATTA

App firma standalone online sul Samsung del PO. Chiusa.

---

## 4. FASE 2 — SAFECANT ✅ ONLINE, DA COMPLETARE

### Stato
SafeCant è **online e funzionante**: produce il verbale di sopralluogo (JSON di interscambio con
`corpo_html` + firme). L'audit del 31 maggio ha confermato che genera correttamente il verbale.

### Cosa resta (i due punti dell'aggancio con SafeHub)
1. **Integrazione anagrafica**: oggi i dati si inseriscono a mano (`origine: manuale`, `impresa_id:
   null`). Va agganciato l'import dell'anagrafica esportata da Archivio, così l'ispettore *seleziona*
   imprese/lavoratori/mezzi. È il lato SafeCant dell'aggancio anagrafica.
2. **Bug nome compilatore**: il redattore ha la firma ma nome/qualifica arrivano vuoti — da correggere.

> Questi due punti dipendono dall'export anagrafica di Archivio (M5). Si chiudono insieme alla
> fondazione di Archivio (Fase 4), perché serve che qualcosa PRODUCA l'anagrafica che SafeCant importa.

### Criterio di chiusura Fase 2
SafeCant importa l'anagrafica e fa selezionare i soggetti; il nome del compilatore appare nel verbale;
il giro anagrafica → SafeCant → verbale → Archivio funziona end-to-end.

---

## 5. FASE 3 — PRE-FASE AI LOCALE (in parallelo)

Allestire sul PC ufficio l'ambiente AI (Ollama + modello + RAG normativo). Indipendente dal resto, si
fa a tempo perso. Candidati: Gemma 2 9B, Qwen3 14B, Mistral Small 3.1 (Q4_K_M). Corpus: D.Lgs 81/08 +
allegati + circolari INL in ChromaDB; procedure aziendali come second brain. Stima 1-2 mesi a tempo
perso, non blocca nulla. Il codice di integrazione (bridge) si fa in Fase 4 (M26). Dettaglio:
`Moduli-Supporto-M23-M26.md`.

---

## 6. FASE 4 — COSTRUZIONE SAFEHUB ARCHIVIO

### Obiettivo
Costruire l'ambiente del CSE titolare sui tre flussi documentali. **La biblioteca di design è completa**:
ogni modulo ha già il suo `.md`. Si passa ai prompt di costruzione atomici.

### Prerequisiti
- ✅ Biblioteca di design completa (fondazione, flussi A/B/C, supporto, schema dati).
- ✅ Template Word reale fornito dal PO (analizzato; va cambiato `{~corpo_html}`→`{@rawXml}`).
- ✅ Audit SafeCant fatto (il motore DOCX nasce in Archivio, gratuito).
- Fase 3 avanzata se si vuole l'AI subito (altrimenti M26 si fa per ultimo).

### I moduli (26 — il vecchio M27 migrazione è ELIMINATO)

**Fondazione (M1-M5)** → design pronti
- M1 Fondazione · M2 Impostazioni globali · M3 Gestione cantieri · M4 Anagrafica completa · M5 Export anagrafica (in `Anagrafica.md`)

**Motore documentale (M6)** → `M6-Motore-DOCX.md`
- M6 generazione HTML/DOCX/PDF (gratuito), riusato da tutti i flussi

**Flusso A — Operatività (M7-M10)** → `FlussoA-Operativita-Sopralluogo-M7-M10.md`
- M7 inbox · M8 rifinitura · M9 controfirma CSE + finalizzazione · M10 associazione foto

**Flusso B (M11-M16)** → pilota `modulo-verbale-riunione-design.md` + `FlussoB-Documenti-Prodotti-M12-M16.md`
- M11 Verbale Riunione (pilota) · M12 Verifica POS/ITP · M13 Proposta Sospensione CSE · M14 NC (tri-stato) · M15 Eventi · M16 ODS Inviati

**Flusso C (M17-M21)** → `M17-...` + `FlussoC-Documenti-Ricevuti-M18-M21.md`
- M17 Notifica Preliminare (pilota) · M18 Verifiche Enti · M19 Disposizioni RL · M20 ODS Ricevuti · M21 POS Documentale

**Supporto (M22-M26)** → `Moduli-Supporto-M23-M26.md` (+ Diario già progettato)
- M22 Diario · M23 Registro PSC · M24 Foto · M25 Cruscotto generale · M26 AI locale

### Ordine di costruzione consigliato (per dipendenze)
1. **M1 Fondazione** (tutto poggia qui)
2. **M2 Impostazioni** + **M3 Cantieri** (config e contenitore)
3. **M4 Anagrafica + M5 Export** ← chiude l'aggancio con SafeCant (priorità: sblocca Fase 2)
4. **M6 Motore documenti**
5. **Flusso C** (il più semplice: pilota M17 → M18-M21)
6. **Flusso B** (pilota M11 → M12-M16, NC con cura per il tri-stato)
7. **Supporto** (M23-M26)
8. **Flusso A / Operatività** (M7-M10) — per ultimo, come da scelta del PO
9. **M26 AI** quando l'ambiente di Fase 3 è pronto

> Nota strategica: M4+M5 (anagrafica + export) sono in cima alla lista perché chiudono l'aggancio
> SafeHub↔SafeCant — la priorità dell'intero ecosistema. Appena pronti, SafeCant può importare
> l'anagrafica vera e la Fase 2 si completa.

### Criterio di chiusura Fase 4
Tutti i moduli completi e collaudati; il PO usa Archivio quotidianamente; il giro end-to-end
anagrafica↔verbale funziona con SafeCant.

---

## 7. FASE 5 — SPEGNIMENTO DI V3 (semplificata)

> Cambia natura rispetto al piano originale: V3 è abbandonata, non c'è migrazione dati da fare.

Non è più una "migrazione": è lo **spegnimento** di V3. Quando Archivio copre il lavoro reale del PO e
le anagrafiche sono state ricompilate nel nuovo sistema, V3 si dismette. Stima: breve, perché non c'è
codice di migrazione da scrivere (decisione del 31 maggio: i dati reali sono solo anagrafiche
ricompilabili a mano).

Criterio: il PO lavora su Archivio senza più aprire V3; V3 archiviata come memoria storica.

---

## 8. STATO E PROSSIMO PASSO

- Fase 1 ✅ · Fase 2 quasi (manca aggancio anagrafica) · Fase 3 a piacere · Fase 4 pronta a partire
  (design completo) · Fase 5 semplificata.
- **Prossimo passo concreto:** primo prompt di costruzione atomico per Claude Code, **M1 Fondazione**,
  poi a scendere secondo l'ordine per dipendenze (§6), con collaudo a ogni modulo (Fasi A-G della
  Procedura). M4+M5 in priorità alta perché chiudono l'aggancio con SafeCant.

Stato: sereno, direzione chiara, biblioteca di design completa. Si costruisce.

---

*Piano di Sviluppo SafeHub. Riscritto il 31 maggio 2026. Stima ordini di grandezza, non date. Per il
dettaglio dei moduli, la fonte è la biblioteca di design. Riservatezza assoluta dei riferimenti al committente.*
