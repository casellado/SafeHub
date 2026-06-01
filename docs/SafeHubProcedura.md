# SafeHub — Procedura Operativa
## Come si costruisce, modulo per modulo · riscritta 31 maggio 2026

> **Nota di versione.** Riscrive la procedura originale (29 maggio) allineandola al 31 maggio: V3 è
> abbandonata, quindi la vecchia "Fase A — audit del modulo equivalente in V3" **non esiste più**; il
> punto di partenza di ogni modulo è ora il suo documento di design, già pronto nella biblioteca.
> Complementare a `SafeHub.md` (cosa/perché) e `SafeHubPianoSviluppo.md` (quando).

---

## 1. PRINCIPIO DI BASE

I prodotti si costruiscono un **modulo alla volta**, completo e collaudato, prima del successivo.
Niente parallelismi. Un modulo per volta significa: è l'unico mentale aperto; si chiude del tutto
(codice + collaudo + commit) prima del prossimo; a ogni fine modulo si ha un sistema parziale ma
**funzionante**; se il progetto si ferma per settimane, ciò che è fatto è già usabile.

---

## 2. IL PUNTO DI PARTENZA: LA BIBLIOTECA DI DESIGN

> Cambiamento sostanziale rispetto alla procedura originale. Prima ogni modulo partiva da un audit del
> codice V3 equivalente. **V3 è abbandonata**: non si audita più nulla di V3. Ogni modulo parte dal suo
> **documento di design** (`.md`), già scritto e congelato nella biblioteca.

La biblioteca di design è completa (vedi `00-INDICE-Biblioteca-SafeHub.md`). Per ogni modulo esiste già
il `.md` che ne definisce comportamento, dati, UI, criterio di chiusura. La costruzione non inventa: traduce
in codice un design già approvato dal PO.

### 2.1 Le convenzioni tecniche (ex Modulo 0)
Restano fissate in `safehub-contratto-tecnico.md` (schema IDB, struttura cartelle, naming, pattern
Alpine, cantiere corrente, gestione errori, contratto OneDrive). Aggiornamenti del 31 maggio già
recepiti nella biblioteca:
- **Comunicazione tra prodotti via JSON** (non DOCX): SafeCant produce il JSON di interscambio.
- **Motore documenti gratuito**: docxtemplater core + `{@rawXml}` + convertitore HTML→OOXML +
  image-module-free. Niente html-module a pagamento. Tre output: HTML/DOCX/PDF (PDF dal DOCX).
- **Schema dati**: vedi `Schema-Dati-Completo.md` (file=stato canonico, IDB cache).

---

## 3. PROCEDURA PER OGNI MODULO (FASI rinumerate)

> La vecchia Fase A (audit V3) è rimossa. La procedura parte dal design già pronto.

### Fase A — Ripasso del design del modulo
**Chi**: CTO + PO. Si rilegge il `.md` di design del modulo dalla biblioteca, si verifica che sia
ancora coerente con le decisioni più recenti, si chiude ogni decisione rimasta aperta nel documento.
**Output**: design congelato (eventuali aggiornamenti al `.md`).

### Fase B — Prompt di costruzione per Claude Code
**Chi**: CTO. Scrive il prompt operativo che traduce il design in istruzioni costruttive:
- quali file creare (in `moduli/` o `shared/`), quale schema IDB, quali componenti Alpine;
- come si aggancia agli altri moduli già costruiti (es. "il DOCX lo fa M6", "il cantiere corrente da M1");
- quali test fare prima del commit, quale commit message, bump SW.
**Output**: prompt di costruzione del modulo.

### Fase C — Costruzione
**Chi**: Claude Code. Scrive il codice, crea i file, commit + push. Si ferma e torna al CTO se trova
l'imprevisto. Non prende decisioni di design.
**Output**: codice in repo, hash commit, conferma SW aggiornato.

### Fase D — Collaudo PO
**Chi**: PO, sul proprio dispositivo (PC Windows 11 per Archivio, iPad per SafeCant). Testa il modulo
nei flussi reali seguendo la checklist preparata dal CTO.
**Output**: PASS/FAIL per punto. Se FAIL → ritorno a Fase B con fix mirato. Se PASS → modulo chiuso.

### Fase E — Chiusura
Modulo ufficialmente chiuso, annotato nel registro di progetto. Si passa al successivo.

> Audit del codice **esistente** (read-only) resta uno strumento disponibile quando serve davvero —
> per esempio l'audit di SafeCant fatto il 31 maggio per capire il motore DOCX. Ma non è più un passo
> obbligato di ogni modulo: si usa solo quando c'è codice reale da capire (SafeCant), non per V3.

---

## 4. RUOLI — CHI FA COSA

**PO (Casella Dogano)**
- Decide cosa serve (scelte di prodotto); risponde ai chiarimenti; collauda (Fase D); carica gli
  output di Claude Code al CTO; mantiene la visione reale; configura l'ambiente AI sul proprio PC.

**CTO (Claude in questa chat)**
- Mantiene e aggiorna la biblioteca di design; scrive i prompt di costruzione (Fase B); prepara le
  checklist di collaudo; mantiene la coerenza architetturale; è onesto su rischi e limiti; quando i
  documenti divergono dal codice reale, fa prevalere il codice.

**Claude Code (executor)**
- Esegue audit read-only quando richiesto; costruisce il codice (Fase C); commit/push; si ferma e
  torna al CTO sull'imprevisto; non decide il design.

---

## 5. REPOSITORY E AMBIENTE

- `safehub-firma`: online.
- `safehub-operativita` (SafeCant): online, da completare (integrazione anagrafica + bug nome compilatore).
- `safehub-archivio`: **repo pulito da creare**, nessuna eredità da V3.
- `cse-attuale` (V3): **abbandonata**. Archiviata come memoria storica, non più riferimento.

Tutti i repo su GitHub del PO, GitHub Pages per servire le PWA in https.

Ambiente AI (solo PC ufficio, non in repo): Ollama + modello quantizzato 7B-14B + DB vettoriale +
corpus normativo. Raggiungibile da Archivio in localhost. Capability detection: se assente, l'app
funziona in manuale.

---

## 6. ORDINE DI COSTRUZIONE

Definito nel Piano (`SafeHubPianoSviluppo.md` §6), per dipendenze: M1 fondazione → M2/M3 config e
cantieri → **M4+M5 anagrafica+export** (priorità: chiude l'aggancio con SafeCant) → M6 motore → Flusso
C → Flusso B → supporto → Flusso A (Operatività) → M26 AI.

---

*SafeHub Procedura. Riscritta il 31 maggio 2026. Punto di partenza: la biblioteca di design (non più
l'audit di V3). Un modulo alla volta, design → prompt → costruzione → collaudo → chiusura.
Riservatezza assoluta dei riferimenti al committente.*
