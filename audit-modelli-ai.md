# AUDIT — Lista modelli AI selezionabili in SafeHub Archivio
## Read-only · giugno 2026

---

## 1. SINTESI ESECUTIVA

| Voce | Risposta |
|---|---|
| **Dove si definisce la lista** | La lista viene **generata a runtime** da Ollama (`GET /api/tags`), non da un array hardcoded |
| **Tipo lista** | **DINAMICA** — il `<select>` mostra TUTTI i modelli installati sul sistema |
| **Stringhe-modello nel codice oggi** | `'llama3.2:3b'` (default e fallback) · `gemma3:4b` (testo-esempio) · `llama3.2:3b` (placeholder input) |
| **Modello di default attuale** | `'llama3.2:3b'` (hardcoded in due punti) |
| **Il default è tra i 4 voluti?** | **No** — `llama3.2:3b` non è nella lista target |
| **Nessun modello tra i 4 voluti è nei sorgenti oggi** | Confermato: `gemma4`, `qwen3`, `qwen2.5` non compaiono in nessun file |

**Conseguenza per il fix:** non basta riscrivere un array. Serve un **allow-list filter** in
`ai-bridge.js:modelli()` + aggiornare il default in due file. Dettaglio al §7.

---

## 2. DEFINIZIONE LISTA MODELLI (Passo 1)

### 2.1 Dove nasce la lista

`shared/ai-bridge.js`, funzione `modelli()`, righe 54–63 (LETTO):

```javascript
const modelli = async () => {
  try {
    const res  = await fetch(`${BASE_URL}/api/tags`);    // GET http://localhost:11434/api/tags
    if (!res.ok) return [];
    const data = await res.json();
    return (data.models ?? []).map(m => m.name);          // ← array di stringhe-modello grezze
  } catch {
    return [];
  }
};
```

`AI_BRIDGE.modelli()` chiama `/api/tags` e restituisce `data.models[].name` — esattamente la stringa
tecnica (`famiglia:taglia`) che Ollama usa internamente. **Nessun filtro. Nessuna allow-list.**

### 2.2 Come viene consumata in UI

`moduli/impostazioni/impostazioni.js:57-58, 273-275` (LETTO):

```javascript
aiDisponibile: null,
modelliAi:     [],
// ...
this.aiDisponibile = await AI_BRIDGE.disponibile();
if (this.aiDisponibile) {
  this.modelliAi = await AI_BRIDGE.modelli();   // carica TUTTI i modelli Ollama
}
```

Template HTML, righe 848–856 (LETTO):

```html
<template x-if="aiDisponibile && modelliAi.length > 0">
  <select id="ai-modello" x-model="ai.modello" …>
    <template x-for="m in modelliAi" :key="m">
      <option :value="m" x-text="m"></option>   <!-- etichetta = stringa tecnica (sono la STESSA cosa) -->
    </template>
  </select>
</template>
```

### 2.3 Etichetta visualizzata vs stringa tecnica

**Sono la stessa cosa.** Non esiste un mapping `{ label: 'Gemma 4 12B', value: 'gemma4:12b' }`.
L'`<option>` mostra e usa identicamente la stringa restituita da Ollama (es. `gemma4:12b`).
Questo semplifica il fix: basta una allow-list di stringhe tecniche, senza mapping UI.

### 2.4 Stringhe-modello presenti nel codice OGGI (verbatim)

| Stringa | File:riga | Ruolo |
|---|---|---|
| `'llama3.2:3b'` | `shared/ai-bridge.js:23` | `MODELLO_FALLBACK` (costante) |
| `'llama3.2:3b'` | `shared/impostazioni-service.js:76` | `DEFAULT.ai.modello` |
| `llama3.2:3b` | `moduli/impostazioni/impostazioni.js:859` | placeholder `<input>` fallback |
| `gemma3:4b` | `moduli/impostazioni/impostazioni.js:866` | esempio in testo-aiuto UI |
| `llama3.2:3b` | `moduli/impostazioni/impostazioni.js:867` | esempio in testo-aiuto UI |
| `Gemma 2 9B/Ollama` | `moduli/verbale-sopralluogo/verbale-sopralluogo.js:487` | **commento TODO** (non è una stringa passata al runtime) |
| `gemma2:9b` | `shared/impostazioni-service.js:76` | **commento inline** al DEFAULT (non runtime) |

---

## 3. STATICA vs DINAMICA (Passo 2 — il discrimine del fix)

### 3.1 Verdetto: **DINAMICA**

Prova: `ai-bridge.js:56` esegue `fetch('http://localhost:11434/api/tags')` a ogni apertura del tab AI
in Impostazioni. Il risultato (`data.models[].name`) popola `modelliAi[]` senza alcun filtro o
intersezione con una lista interna. Se Ollama ha 10 modelli installati, il `<select>` ne mostra 10.

### 3.2 Fallback statico (caso Ollama offline)

Se `aiDisponibile === false` oppure `modelliAi.length === 0`, il template mostra un `<input type="text">`
libero (`impostazioni.js:857-861`). In quel caso il PO può digitare qualsiasi stringa.
La stringa digitata viene persistita identicamente alla stringa selezionata dal `<select>`.

### 3.3 Non esiste lista statica di default

Non c'è un array `MODELLI_DISPONIBILI = [...]` da nessuna parte nel codice. La sola costante statica
è `MODELLO_FALLBACK = 'llama3.2:3b'` usata quando le impostazioni non hanno ancora un valore salvato.

### 3.4 Conseguenza per il fix

Poiché la lista è dinamica, il fix **non può essere** "riscrivi l'array". Deve essere un
**allow-list filter** applicato all'output di `/api/tags` prima che popoli il `<select>`.
Se il sistema ha installato modelli extra (es. `llama3.2:3b`, `phi4`, ecc.), questi non devono
comparire nella UI — vengono usati solo i 4 autorizzati che risultano presenti su Ollama.

---

## 4. SELEZIONE / PERSISTENZA / USO (Passo 3)

### 4.1 Dove viene salvata la scelta

Doppia persistenza (LETTO da `impostazioni-service.js:123-124`):
1. **File canonico**: `SafeHub-CSE-Lavori/_config/impostazioni-archivio.json`, campo `ai.modello`
2. **Cache IDB**: store `impostazioni_archivio`, chiave `'config'`, campo `dati.ai.modello`

La scrittura avviene al click "Salva" nel tab AI (`impostazioni.js:279`):
```javascript
async salvaAi() {
  await this.eseguiSalvataggio({ ai: { ...this.ai } }, 'Impostazioni AI');
}
```

### 4.2 Come la stringa arriva alla chiamata Ollama

Catena completa (LETTO):

```
impostazioni-service.js:76   DEFAULT.ai.modello = 'llama3.2:3b'
          ↓ (deep-merge al boot)
_config/impostazioni-archivio.json  → ai.modello = <stringa scelta dal PO>
          ↓
IMPOSTAZIONI_SERVICE.dati?.ai?.modello     (ai-bridge.js:79)
          ↓ (fallback se null/undefined)
MODELLO_FALLBACK = 'llama3.2:3b'          (ai-bridge.js:23)
          ↓
body.model = modello                       (ai-bridge.js:87)
          ↓
POST http://localhost:11434/api/generate   { model, prompt, system, stream:true }
```

Il campo esatto nel payload JSON è `model` (minuscolo), riga 87 di `ai-bridge.js`. Nessun altro
file tocca questo campo.

### 4.3 Gestione errore "modello non installato"

`ai-bridge.js:105-106` (LETTO):

```javascript
if (res.status === 404 || /not found|not load/i.test(ollamaErr)) {
  errMsg = 'Modello AI non trovato. Vai in Impostazioni → Assistente AI e seleziona un modello installato…';
}
```

Ollama risponde 404 se il modello non è installato; SafeHub intercetta e mostra un messaggio
comprensibile che rimanda alle Impostazioni. Non c'è auto-fallback a un altro modello: il PO deve
agire esplicitamente. Comportamento corretto (non da cambiare).

---

## 5. TUTTI I PUNTI CON NOMI MODELLO (Passo 4)

Elenco completo — ogni punto da toccare quando si imposteranno i 4 modelli:

| # | File | Riga | Tipo | Contenuto verbatim | Da toccare? |
|---|---|---|---|---|---|
| 1 | `shared/ai-bridge.js` | 23 | costante runtime | `'llama3.2:3b'` (MODELLO_FALLBACK) | **SÌ** |
| 2 | `shared/impostazioni-service.js` | 76 | costante default | `'llama3.2:3b'` (DEFAULT.ai.modello) | **SÌ** |
| 3 | `moduli/impostazioni/impostazioni.js` | 859 | placeholder UI | `es. llama3.2:3b` | SÌ (UX) |
| 4 | `moduli/impostazioni/impostazioni.js` | 866 | testo-aiuto UI | `gemma3:4b` (esempio) | SÌ (UX) |
| 5 | `moduli/impostazioni/impostazioni.js` | 867 | testo-aiuto UI | `llama3.2:3b` (esempio) | SÌ (UX) |
| 6 | `shared/impostazioni-service.js` | 76 | **commento inline** | `gemma2:9b` (commento, non runtime) | opzionale |
| 7 | `moduli/verbale-sopralluogo/verbale-sopralluogo.js` | 487 | **commento TODO** | `Gemma 2 9B/Ollama` (testo libero) | opzionale |

Punti #1 e #2 sono i soli che impattano il comportamento a runtime. I punti #3-5 impattano la UX
(cosa vede il PO). I punti #6-7 sono commenti redazionali, non influenzano il comportamento.

**Modello di default attuale:** `'llama3.2:3b'` — **non è tra i 4 target**. Il fix deve cambiarlo.

---

## 6. NOTE SUI NOMI RISPETTO ALLE RELEASE REALI (Passo 5)

### Stringhe tecniche Ollama dei 4 modelli target — tutte DA VERIFICARE

⚠️ **Nessuna delle stringhe dei 4 modelli target compare nei sorgenti oggi.** Le stringhe seguenti
sono ipotesi basate sulle convenzioni di tagging Ollama e sulle release note pubbliche — NON sono
fatti letti dal codice. La verità è `ollama list` sulla macchina del PO.

| Modello desiderato | Stringa probabile per Ollama | Note |
|---|---|---|
| Gemma 4 12B | `gemma4:12b` | ⚠️ DA VERIFICARE — Gemma 4 è stato rilasciato apr 2025; su Ollama il tag famiglia è `gemma4` |
| Gemma 4 26B | `gemma4:27b` oppure `gemma4:26b` | ⚠️ DA VERIFICARE — il modello MoE della famiglia Gemma 4 ha 27B parametri totali ma spesso è indicato come "26B attivi"; il tag Ollama esatto è incerto |
| Qwen 14B | `qwen3:14b` oppure `qwen2.5:14b` | ⚠️ DA VERIFICARE — Qwen3 (apr 2025) e Qwen2.5 coesistono su Ollama con tag distinti; `qwen:14b` da solo è Qwen 1.x (molto vecchio) |
| Qwen 8B | `qwen3:8b` oppure `qwen2.5:7b` | ⚠️ DA VERIFICARE — Qwen3 usa la taglia `8b`; Qwen2.5 usa `7b`. Sono modelli diversi con tag diversi |

**Rischio principale:** se si hardcoda la allow-list con stringhe sbagliate (es. `gemma4:26b` invece
di `gemma4:27b`), il filtro non farà passare quel modello e il `<select>` sarà vuoto anche se il
modello è installato. L'unico modo sicuro è leggere prima l'output di `ollama list`.

---

## 7. RACCOMANDAZIONE PER IL FIX

### 7.1 Scenario: lista DINAMICA → serve un allow-list filter

Il fix ha **tre componenti**:

**A) Allow-list in `shared/ai-bridge.js`** — unica modifica runtime necessaria

```
// APPROCCIO (non codice di produzione):
// Aggiungere una costante MODELLI_CONSENTITI prima di "modelli()"
// e filtrare il risultato di /api/tags in base ad essa.
// Esempio di struttura:
//   const MODELLI_CONSENTITI = ['<stringa1>', '<stringa2>', '<stringa3>', '<stringa4>'];
//   return (data.models ?? []).map(m => m.name).filter(n => MODELLI_CONSENTITI.includes(n));
// Punto esatto: riga 59 di ai-bridge.js (dentro la funzione modelli())
```

Punti da toccare:
- `shared/ai-bridge.js` righe 23 (MODELLO_FALLBACK) e 59 (filter su `.map(m => m.name)`)

**B) Nuovo default in `shared/impostazioni-service.js:76`**

Cambiare `DEFAULT.ai.modello` da `'llama3.2:3b'` al modello preferito tra i 4.
Suggerimento: il più leggero tra quelli installati (es. Qwen 8B o Gemma 4 12B).

⚠️ **Rischio migrazione**: se il PO ha già salvato `ai.modello: 'llama3.2:3b'` in
`_config/impostazioni-archivio.json`, il deep-merge al boot preserva il valore salvato (non lo
sovrascrive col nuovo default). Dopo il fix, alla prima apertura il `<select>` non troverà
`llama3.2:3b` nella lista filtrata → il campo mostrerà una selezione vuota/incoerente.
Soluzione nel fix: aggiungere una guardia in `_verificaAi()` di `impostazioni.js` che, se il
`ai.modello` salvato non è nella nuova allow-list, lo resetta al primo modello disponibile.

**C) Aggiornamento testi UI in `moduli/impostazioni/impostazioni.js`**

Senza impatto funzionale ma necessario per coerenza UX:
- riga 859: `placeholder` dell'input fallback → mettere una delle 4 stringhe reali
- righe 866-867: sostituire gli esempi (`gemma3:4b`, `llama3.2:3b`) con i 4 modelli target

### 7.2 Punti esatti da toccare (riepilogo)

| File | Riga | Cosa cambia |
|---|---|---|
| `shared/ai-bridge.js` | 23 | `MODELLO_FALLBACK` → stringa del nuovo default |
| `shared/ai-bridge.js` | 54–63 | aggiungere `MODELLI_CONSENTITI` + `.filter()` in `modelli()` |
| `shared/impostazioni-service.js` | 76 | `DEFAULT.ai.modello` → nuovo default |
| `moduli/impostazioni/impostazioni.js` | 859 | placeholder input → stringa reale |
| `moduli/impostazioni/impostazioni.js` | 865–868 | testo-aiuto → 4 modelli target |
| (opzionale) `moduli/impostazioni/impostazioni.js` | `_verificaAi()` | guardia reset se modello salvato non in allow-list |

File intoccabili per il fix: `ai-cervello-cse.js`, `ai-correttore.js`, `ai-rag.js`, `alpine-init.js`
(nessuno di essi contiene stringhe-modello runtime).

### 7.3 Rischio complessivo: BASSO

La modifica è confinata a 2 file funzionali e 1 file UI. Il meccanismo di generazione
(`ai-bridge.js:genera()`) non cambia. Il payload `{ model: modello }` non cambia. L'unico
rischio concreto è la migrazione del valore salvato (§7.1-B), risolvibile con la guardia.

---

## 8. DOMANDE APERTE

| # | ⚠️ DA VERIFICARE | Come risolverlo |
|---|---|---|
| 1 | Stringhe esatte Ollama dei 4 modelli (`gemma4:12b`? `gemma4:27b`? `qwen3:8b`? ecc.) | `ollama list` sulla macchina del PC ufficio Windows e copiare i valori dalla colonna **NAME** |
| 2 | Quale dei 4 modelli diventa il **default** (il pre-selezionato al primo avvio) | Decisione del PO: quale modello preferisce come punto di partenza? |
| 3 | Il PO ha già un `ai.modello` salvato in `_config/impostazioni-archivio.json`? | Aprire il file e verificare il campo `ai.modello`: se è `llama3.2:3b`, serve la guardia di reset |
| 4 | Sul sistema Windows sono installati modelli extra oltre ai 4 target? | `ollama list` — se sì, il filter li esclude dalla UI ma restano installati (nessun impatto operativo) |
| 5 | La 26B di Gemma 4 è la variante MoE (27B totali)? | `ollama show gemma4:27b` oppure `ollama show gemma4:26b` — verifica che sia lo stesso modello |

**Azione prioritaria consigliata**: eseguire `ollama list` sul PC ufficio e incollare l'output
prima della build. Senza le stringhe esatte dalla colonna NAME, qualsiasi allow-list costruita
a priori rischia di filtrare fuori i modelli voluti invece di filtrarli dentro.

---

*Audit read-only completato. Nessun file modificato. Fonti: lettura diretta di
`shared/ai-bridge.js`, `shared/impostazioni-service.js`, `moduli/impostazioni/impostazioni.js`,
`shared/ai-cervello-cse.js`, `shared/ai-correttore.js`, `shared/ai-rag.js`,
`moduli/verbale-sopralluogo/verbale-sopralluogo.js`. Grep su tutto il repo per stringhe-modello.*
