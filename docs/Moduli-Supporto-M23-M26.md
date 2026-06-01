# MODULI DI SUPPORTO (M23–M26)
## Design di gruppo · Cruscotto generale, Registro PSC, Foto, AI locale · v1.0 · 31 maggio 2026

> **Cosa è questo documento.** Chiude i moduli di supporto di SafeHub Archivio. Quattro moduli di
> natura diversa, raggruppati perché nessuno è un "documento" nel senso dei flussi B/C: sono strumenti
> trasversali. Il **Cruscotto generale (M25)** è progettato a fondo — è il cervello d'insieme che il PO
> ha chiesto fin dall'inizio ("non voglio sorprese"). Registro PSC, Foto e AI locale sono più lineari.
> Il Diario CSE (M22) è già progettato in `modulo-diario-cse-progettazione.md` e non si ripete qui.

> **Dipendenze.** Tutti poggiano su M1 (fondazione) e M3 (cantieri). Il Cruscotto generale legge da
> M4 (anagrafica/scadenze) e M2 (soglie). L'AI locale è opzionale e indipendente.

---

## M25 — CRUSCOTTO GENERALE ⭐ (il cervello d'insieme)

> Questo è il modulo che dà senso a tutto: aggrega le scadenze e gli alert di **tutti i cantieri** in
> un'unica vista. È la risposta diretta alla richiesta del PO: nessuna scadenza critica deve sfuggire
> (patentino gruista, collaudo mezzi…). Mentre i cruscotti dei singoli archivi guardano un cantiere,
> M25 guarda l'intero lavoro del CSE dall'alto.

### 1. Cosa fa
- **Aggrega le scadenze critiche di tutti i cantieri** in una vista sola: il PO apre SafeHub e vede
  subito cosa scade ovunque, senza entrare cantiere per cantiere.
- Calcola gli alert incrociando i dati di tutte le anagrafiche (M4) con le soglie per documento (M2).
- È la **vista d'ingresso opzionale** accanto al cruscotto cantieri (M3): cantieri = "dove lavoro",
  cruscotto generale = "cosa richiede attenzione adesso, ovunque".

### 2. Cosa mostra (dall'alto in basso)
1. **Banner scadenze critiche scadute** (rosso, non silenziabile): "🔴 N scadenze critiche SCADUTE su
   M cantieri" — patentini, collaudi, idoneità sanitarie già scaduti. È la prima cosa, sempre in cima.
2. **Scadenze critiche imminenti**: cosa scade entro la soglia (per documento, da M2) nei prossimi
   giorni, ordinate per data — le più vicine in alto.
3. **Riepilogo per cantiere**: ogni cantiere con il suo conteggio di criticità (verde se a posto,
   giallo/rosso se ha scadenze). Cliccando si entra nel cantiere (→ M3 lo seleziona).
4. **Conformità documentale aggregata**: quante imprese, su tutti i cantieri, hanno documenti
   obbligatori mancanti (dato da M4, gradazione obbligatorio/facoltativo).
5. **Documenti recenti / da completare**: bozze Flusso B aperte, documenti C senza protocollo,
   NC aperte oltre scadenza — i promemoria gentili che evitano dimenticanze.

### 3. Come calcola (architettura)
- All'apertura (o su refresh), scansiona l'indice IDB (`documenti_indice`, `cache_anagrafica`) di
  tutti i cantieri — veloce perché è cache, non rilettura file.
- Per ogni entità con scadenza, applica la soglia/criticità di M2 → colore.
- Le scadenze "critiche" (M2) hanno priorità assoluta: sempre in cima, scaduto = rosso fisso non
  silenziabile (coerente con Anagrafica §5.5).
- Aggrega per cantiere e globalmente.

### 4. Interazioni
- **Click su una scadenza** → apre direttamente l'entità nel cantiere giusto (es. il lavoratore col
  patentino scaduto → vista Lavoratori di quel cantiere, M4).
- **Filtri**: per cantiere, per tipo di scadenza, per criticità, per finestra temporale.
- **Ricerca** trasversale (un'impresa, un lavoratore, un mezzo su tutti i cantieri).
- **Niente azioni distruttive** qui: il cruscotto è una lente, le modifiche si fanno nei moduli.

### 5. Perché è centrale (nota CTO)
Tutti gli altri cruscotti sono per-cantiere. M25 è l'unico che vede l'insieme. Per un CSE con decine
di cantieri e migliaia di scadenze, è la differenza tra "controllo tutto a mano sperando di non
dimenticare" e "lo strumento mi dice dove guardare". È il valore di SafeHub condensato in una vista.

### 6. Criterio di chiusura M25
- aggrega scadenze critiche di tutti i cantieri, con scaduto in cima non silenziabile;
- calcola i colori dalle soglie di M2; click su scadenza → apre l'entità nel cantiere;
- filtri e ricerca trasversali funzionano; nessuna azione distruttiva;
- si comporta da vista d'ingresso alternativa al cruscotto cantieri.

---

## M23 — REGISTRO PSC

### 1. Cosa fa
Registro cumulativo degli aggiornamenti del Piano di Sicurezza e Coordinamento nel tempo (art.92
c.1.b). Voci datate, ognuna con motivo dell'aggiornamento ed eventuale PDF allegato.

### 2. Storage
`09_Registro-PSC/` (cartella unica, senza sottocartelle — dal contratto §3: documenti senza ciclo).
Voci come file datati. File=stato, IDB indicizza.

### 3. Dati per voce
`data` · `motivo_aggiornamento` · `riferimento` (es. verbale di riunione che l'ha generato) ·
`allegato_pdf` (opzionale) · `note`.

### 4. Collegamento chiave
Un **Verbale di Riunione** (M11, Flusso B) che contiene decisioni sul PSC **costituisce aggiornamento
del PSC** (giurisprudenza). Quindi: dalla finalizzazione di un verbale di riunione si può generare una
voce nel Registro PSC (aggancio B → supporto). Campo `riferimento` traccia il legame.

### 5. UI
Cruscotto cronologico: lista voci per data, apri-click sull'allegato, ricerca. "Nuova voce" manuale +
voci generate da verbali. Non bloccante.

### 6. Criterio di chiusura M23
Voci datate create/consultate, allegato apribile con un click, collegamento dal verbale di riunione,
ricerca cronologica.

---

## M24 — ARCHIVIO FOTO

### 1. Cosa fa
Gestisce le foto del cantiere, principalmente quelle dei sopralluoghi (che arrivano separate dai
verbali, dalla cartella condivisa `SafeHub-Foto-Sopralluoghi/`).

### 2. Storage e naming
`16_Foto/`. Naming preciso (dal contratto §6): `<AAAA-MM-GG>_<cantiere>_<numero-verbale>_<NN>.jpg`,
`NN` sequenziale da 01. Le foto **vivono una sola volta** qui e sono referenziate dai verbali via
naming (non duplicate dentro i file).

### 3. Collegamento ai verbali
Una foto è collegata a un verbale di sopralluogo tramite il `<numero-verbale>` nel nome. M24 permette
di vedere le foto di un verbale e, viceversa, a quale verbale appartiene una foto.

### 4. UI
Galleria per cantiere, raggruppabile per verbale/data. Anteprima, apertura a piena risoluzione,
download. Import dalle foto condivise dei colleghi (`SafeHub-Foto-Sopralluoghi/`).

### 5. Criterio di chiusura M24
Galleria per cantiere, naming rispettato, collegamento foto↔verbale, import dalle foto condivise,
apertura/download.

---

## M26 — AI LOCALE (bridge Ollama)

> Strumento opzionale del PO, non un prodotto. Vive solo sul PC ufficio. Se assente, l'app funziona in
> manuale. Dettaglio in SafeHub.md §5.

### 1. Cosa fa
Fornisce assistenza AI (rifinitura testi, revisione documenti) chiamando un LLM locale via Ollama su
`localhost:11434`. **Capability detection**: se Ollama risponde, i bottoni AI compaiono; se no
(es. portatile autorizzato senza Ollama), spariscono e tutto funziona in manuale.

### 2. Architettura a tre livelli (da SafeHub.md §5)
- **L1 — Second brain**: procedure aziendali, checklist, terminologia, nel system prompt (regole rigide).
- **L2 — RAG legislativo**: D.Lgs 81/08, allegati, circolari INL in un DB vettoriale locale (ChromaDB/FAISS).
- **L3 — Contesto dinamico**: cantiere corrente, anagrafica, NC aperte, scadenze del momento.
Modello 7B-14B quantizzato (Q4_K_M) su 8GB VRAM + 64GB RAM. Candidati: Gemma2 9B, Qwen3 14B, Mistral Small 3.1.

### 3. Dove si aggancia
- Rifinitura del `corpo_html` nei moduli documento (Flusso A/B): bottone "Migliora testo" che chiama
  l'AI con L1+L2+L3.
- Mai valore di firma, mai sostituzione del giudizio CSE. Suggerisce, il PO decide.

### 4. Come è costruito (bridge)
Un modulo `shared/ai-bridge.js`: rileva Ollama, costruisce il prompt (L1 fisso + L2 recuperato + L3
dinamico), fa la chiamata HTTP, restituisce il testo. I moduli lo usano solo se disponibile.

### 5. Criterio di chiusura M26
Capability detection (bottoni AI compaiono/spariscono); chiamata a Ollama con i tre livelli; rifinitura
testo in un modulo documento; degrado in manuale senza Ollama; nessun dato esce dal PC (tutto locale).

---

## QUADRO DEI MODULI DI SUPPORTO

| Modulo | Cartella/Sede | Natura | Particolarità |
|---|---|---|---|
| M22 Diario CSE | `08_Diario-CSE/` | registrazione | già progettato a parte |
| M23 Registro PSC | `09_Registro-PSC/` | registro datato | si alimenta dai verbali riunione |
| M24 Archivio Foto | `16_Foto/` | galleria | naming, collegamento ai verbali |
| M25 Cruscotto generale | (vista, no cartella) | aggregatore | ⭐ cervello d'insieme, scadenze di tutti i cantieri |
| M26 AI locale | `localhost:11434` | strumento opzionale | Ollama, 3 livelli, capability detection |

---

## DECISIONI APERTE PER IL PO

1. **Cruscotto generale come home?** Vuoi che SafeHub apra sul Cruscotto generale (scadenze di tutto)
   o sul cruscotto cantieri (M3)? Si possono avere entrambi con un toggle; quale come default?
2. **AI locale — quando**: resta in pre-fase parallela (Blocco C del piano), la costruiamo solo dopo
   che i moduli documento esistono (serve il `corpo_html` da rifinire). Confermi che M26 è l'ultimo?
3. **Registro PSC automatico**: la voce generata da un verbale di riunione è automatica alla
   finalizzazione, o il PO la crea manualmente quando decide che quel verbale aggiorna il PSC?

---

## PROSSIMI PASSI

1. Il PO rivede questo design di gruppo.
2. Congelato → restano da progettare in `.md` solo: **M7-M10 (Flusso A / Operatività)**, in sospeso
   per scelta del PO, da affrontare alla fine.
3. Con questo, la biblioteca di design di SafeHub Archivio è completa tranne l'Operatività.

---

*Design di gruppo Moduli di Supporto (M23–M26) v1.0 — 31 maggio 2026. Il Cruscotto generale (M25) è il
cervello d'insieme delle scadenze su tutti i cantieri. Registro PSC, Foto, AI locale completano il
supporto. Poggia su M1, M3, M4, M2. Diario (M22) già progettato a parte.*
