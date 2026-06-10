/**
 * consulente.js — M26 SecondBrain: Consulente normativo CSE.
 *
 * Chat che risponde a domande di sicurezza basandosi ESCLUSIVAMENTE
 * sui chunk RAG disponibili. Anti-allucinazione rigoroso: se la
 * risposta non è nei chunk, il modello lo dichiara esplicitamente.
 *
 * Flusso per ogni domanda:
 *   1. proponiTemi(domanda) → recupera(temi) → costruisciContesto
 *   2. Storia conversazionale (ultimi 3 turni) serializzata nel prompt
 *   3. AI_BRIDGE.genera() streaming → rispostaCorrente
 *   4. Append storia; chunk usati mostrati nel pannello riferimenti
 *
 * Dipende da: AI_BRIDGE, AI_RAG, AI_CONSULENTE_NORMATIVO_SYSTEM_PROMPT,
 *             ERRORI (tutti globali, caricati prima in index.html).
 */

'use strict';

const _MAX_STORIA_TURNI = 3; // coppie cse+consulente da includere nel prompt

// ── Componente Alpine ─────────────────────────────────────────────────────────

function Consulente() {
  return {

    // ── Stato AI / RAG ────────────────────────────────────────────────────────
    aiDisponibile:  null,
    ragCaricato:    false,
    ragTotaleChunk: 0,

    // ── Stato chat ────────────────────────────────────────────────────────────
    storia:              [],   // [{ruolo:'cse'|'consulente', testo}]
    inputCorrente:       '',
    rispostaCorrente:    '',   // accumulato token per token durante streaming
    generando:           false,
    _controller:         null,
    chunkUltimaRisposta: [],   // chunk usati nell'ultima risposta
    rifAperto:           false,

    // ── Lifecycle ─────────────────────────────────────────────────────────────

    async init() {
      if (typeof AI_BRIDGE === 'undefined') { this.aiDisponibile = false; return; }
      this.aiDisponibile = await AI_BRIDGE.disponibile();
      if (typeof AI_RAG !== 'undefined') {
        this.ragCaricato = await AI_RAG.carica();
        if (this.ragCaricato) this.ragTotaleChunk = AI_RAG.totale();
      }
    },

    aggiornaSeCantiereRicambia() { /* indipendente dal cantiere */ },

    // ── Invio domanda ─────────────────────────────────────────────────────────

    async invia() {
      const domanda = this.inputCorrente.trim();
      if (!domanda || this.generando) return;

      this.inputCorrente       = '';
      this.rispostaCorrente    = '';
      this.chunkUltimaRisposta = [];
      this.rifAperto           = false;

      this.storia.push({ ruolo: 'cse', testo: domanda });
      this.generando = true;
      this._scrollGiu();

      // RAG: cerca norme pertinenti alla domanda
      const temi   = this.ragCaricato ? AI_RAG.proponiTemi(domanda) : [];
      const chunks = temi.length ? AI_RAG.recupera(temi) : [];

      // Prompt: contesto norme + storia + domanda corrente
      const contesto  = chunks.length
        ? AI_RAG.costruisciContesto(chunks) + '\n'
        : 'Nessuna norma pertinente disponibile per questa domanda.\n\n';
      const storiaStr = this._serializaStoria();
      const prompt    = contesto + storiaStr + 'CSE: ' + domanda;

      this._controller = new AbortController();
      try {
        await AI_BRIDGE.genera({
          prompt,
          system:  AI_CONSULENTE_NORMATIVO_SYSTEM_PROMPT,
          onToken: (tok) => {
            this.rispostaCorrente += tok;
            this._scrollGiu();
          },
          signal: this._controller.signal,
        });
      } catch (err) {
        if (err.name !== 'AbortError') {
          ERRORI.gestisciErrore('consulente/genera', err);
          if (!this.rispostaCorrente) this.rispostaCorrente = `⚠ ${err.message}`;
        }
      } finally {
        if (this.rispostaCorrente) {
          this.storia.push({ ruolo: 'consulente', testo: this.rispostaCorrente });
          this.chunkUltimaRisposta = chunks;
          // Tronca la storia oltre N turni per non sforare il contesto
          if (this.storia.length > _MAX_STORIA_TURNI * 2) {
            this.storia = this.storia.slice(-(_MAX_STORIA_TURNI * 2));
          }
        }
        this.rispostaCorrente = '';
        this.generando        = false;
        this._controller      = null;
        this._scrollGiu();
      }
    },

    interrompi() {
      this._controller?.abort();
    },

    azzera() {
      if (this.generando) this.interrompi();
      this.storia              = [];
      this.inputCorrente       = '';
      this.rispostaCorrente    = '';
      this.chunkUltimaRisposta = [];
      this.rifAperto           = false;
    },

    // ── Helper: serializza storia per il prompt ───────────────────────────────

    _serializaStoria() {
      // Tutto tranne l'ultimo elemento (la domanda corrente appena pushata)
      const precedenti = this.storia.slice(0, -1);
      if (!precedenti.length) return '';
      const ultimi = precedenti.slice(-(_MAX_STORIA_TURNI * 2));
      const righe  = ultimi.map(m =>
        (m.ruolo === 'cse' ? 'CSE: ' : 'Consulente: ') + m.testo
      );
      return 'Conversazione precedente:\n' + righe.join('\n') + '\n\n';
    },

    _scrollGiu() {
      this.$nextTick(() => {
        const el = this.$refs?.messaggi;
        if (el) el.scrollTop = el.scrollHeight;
      });
    },
  };
}

// ── Template HTML ─────────────────────────────────────────────────────────────

const _TEMPLATE_CONSULENTE = `
<div x-data="Consulente()" x-init="init()" class="max-w-4xl flex flex-col h-full">

  <!-- === HEADER === -->
  <div class="flex items-start justify-between mb-4 flex-wrap gap-3">
    <div>
      <h1 class="text-xl font-semibold text-slate-800">💬 Consulente normativo</h1>
      <p class="text-xs text-slate-400 mt-0.5">
        Rispondi solo dal RAG normativo — se la risposta non è nelle norme, lo dice.
      </p>
    </div>
    <div class="flex flex-col items-end gap-1.5 flex-shrink-0">
      <!-- Badge AI -->
      <span class="flex items-center gap-2 text-xs px-3 py-1.5 rounded-full border"
            :class="aiDisponibile === null ? 'border-slate-200 bg-slate-50 text-slate-500'
                  : aiDisponibile         ? 'border-green-200 bg-green-50 text-green-700'
                  :                         'border-amber-200 bg-amber-50 text-amber-700'">
        <span aria-hidden="true"
              x-text="aiDisponibile === null ? '⏳' : aiDisponibile ? '🟢' : '🟡'"></span>
        <span x-text="aiDisponibile === null ? 'Verifica AI…'
                    : aiDisponibile         ? 'Assistente disponibile'
                    :                         'Assistente non disponibile'"></span>
      </span>
      <!-- Badge RAG -->
      <span x-show="aiDisponibile === true"
            class="flex items-center gap-2 text-xs px-3 py-1.5 rounded-full border"
            :class="ragCaricato ? 'border-violet-200 bg-violet-50 text-violet-700'
                                : 'border-slate-200 bg-slate-50 text-slate-400'">
        <span aria-hidden="true" x-text="ragCaricato ? '📚' : '⚠'"></span>
        <span x-text="ragCaricato
          ? ragTotaleChunk + ' norme caricate'
          : 'Base normativa non disponibile'"></span>
      </span>
    </div>
  </div>

  <!-- Assistente non disponibile -->
  <div x-show="aiDisponibile === false"
       class="bg-amber-50 border border-amber-200 rounded-xl px-5 py-4 text-sm text-amber-800 mb-4">
    <strong>Ollama non raggiungibile.</strong>
    Avvia Ollama, poi vai in
    <button @click="navigaA('impostazioni')"
            class="underline hover:no-underline focus:outline-none focus:ring-2 focus:ring-amber-400 rounded">
      Impostazioni → Assistente AI
    </button> per configurarlo.
  </div>

  <div x-show="aiDisponibile === true" class="flex flex-col gap-3 flex-1 min-h-0">

    <!-- === AREA MESSAGGI === -->
    <div x-ref="messaggi"
         class="flex-1 overflow-y-auto space-y-3 min-h-[20rem] max-h-[60vh] pr-1"
         role="log" aria-live="polite" aria-label="Conversazione con il Consulente">

      <!-- Placeholder chat vuota -->
      <div x-show="storia.length === 0 && !generando"
           class="flex flex-col items-center justify-center h-full py-16 text-slate-400">
        <div class="text-4xl mb-3" aria-hidden="true">💬</div>
        <p class="text-sm font-medium">Fai una domanda normativa</p>
        <p class="text-xs mt-1">Es: "Quando serve il PiMUS?" — "Posso sospendere senza preavviso?"</p>
      </div>

      <!-- Messaggi della storia — unico nodo radice richiesto da Alpine v3 x-for -->
      <template x-for="(m, idx) in storia" :key="idx">
        <div :class="m.ruolo === 'cse' ? 'flex justify-end' : 'flex justify-start'">
          <div :class="m.ruolo === 'cse'
            ? 'max-w-[70%] bg-blue-50 border border-blue-100 rounded-2xl rounded-br-sm px-4 py-2.5 text-sm text-slate-800'
            : 'max-w-[82%] bg-white border border-slate-200 rounded-2xl rounded-bl-sm px-4 py-2.5 text-sm text-slate-800 shadow-sm'">
            <p class="whitespace-pre-wrap leading-relaxed" x-text="m.testo"></p>
          </div>
        </div>
      </template>

      <!-- Risposta in streaming (sinistra, bordo animato) -->
      <div x-show="generando" class="flex justify-start">
        <div class="max-w-[82%] bg-white border border-violet-300 rounded-2xl
                    rounded-bl-sm px-4 py-2.5 text-sm text-slate-800 shadow-sm">
          <p class="whitespace-pre-wrap leading-relaxed"
             x-text="rispostaCorrente || '…'"
             aria-live="polite"></p>
        </div>
      </div>

    </div><!-- /messaggi -->

    <!-- === PANNELLO RIFERIMENTI (dopo risposta) === -->
    <div x-show="chunkUltimaRisposta.length > 0 && !generando"
         class="border border-slate-200 rounded-xl overflow-hidden text-sm">
      <button @click="rifAperto = !rifAperto"
              class="w-full flex items-center justify-between px-4 py-2.5
                     bg-slate-50 hover:bg-slate-100 text-left transition-colors
                     focus:outline-none focus:ring-2 focus:ring-slate-400 focus:ring-inset">
        <span class="text-sm font-medium text-slate-700">
          📎 Riferimenti normativi usati
          <span class="ml-1.5 text-xs text-slate-400 font-normal">
            (<span x-text="chunkUltimaRisposta.length"></span> fonti)
          </span>
        </span>
        <span class="text-xs text-slate-400"
              x-text="rifAperto ? '▲ chiudi' : '▼ mostra'"></span>
      </button>
      <div x-show="rifAperto" class="divide-y divide-slate-100">
        <template x-for="c in chunkUltimaRisposta" :key="c.id">
          <div x-data="{ aperto: false }" class="px-4 py-2.5">
            <div class="flex items-start justify-between gap-3">
              <div class="min-w-0">
                <p class="text-xs font-semibold font-mono text-slate-700 break-words"
                   x-text="c.riferimento"></p>
                <p class="text-xs text-slate-600 mt-0.5" x-text="c.titolo"></p>
                <p class="text-xs text-slate-400" x-text="'Fonte: ' + c.fonte"></p>
              </div>
              <button @click="aperto = !aperto"
                      class="flex-shrink-0 text-xs text-violet-600 hover:text-violet-800
                             px-2 py-0.5 rounded border border-violet-200 hover:bg-violet-50
                             transition-colors focus:outline-none focus:ring-1 focus:ring-violet-400"
                      x-text="aperto ? '▲ chiudi' : '▼ testo'"></button>
            </div>
            <div x-show="aperto" class="mt-2 space-y-1.5">
              <div class="bg-slate-50 border-l-2 border-slate-300 pl-3 py-1.5 rounded-r">
                <p class="text-xs text-slate-700 whitespace-pre-wrap leading-relaxed"
                   x-text="c.testo"></p>
              </div>
              <div x-show="c.note_cse"
                   class="bg-violet-50 border-l-2 border-violet-300 pl-3 py-1.5 rounded-r">
                <p class="text-xs font-semibold text-violet-600 mb-0.5">💡 Nota CSE</p>
                <p class="text-xs text-violet-900 leading-relaxed" x-text="c.note_cse"></p>
              </div>
            </div>
          </div>
        </template>
      </div>
    </div><!-- /riferimenti -->

    <!-- === INPUT === -->
    <div class="border border-slate-200 rounded-xl bg-white overflow-hidden shadow-sm">
      <textarea x-model="inputCorrente"
                @keydown.enter.exact.prevent="invia()"
                :disabled="generando"
                rows="2"
                placeholder="Fai una domanda normativa… (Invio per inviare, Shift+Invio per andare a capo)"
                class="w-full px-4 py-3 text-sm resize-none border-0 focus:outline-none
                       placeholder:text-slate-400 disabled:bg-slate-50"
                aria-label="Domanda al Consulente normativo"></textarea>
      <div class="flex items-center justify-between px-3 py-2 border-t border-slate-100 bg-slate-50">
        <div class="flex gap-2">
          <button x-show="!generando"
                  @click="invia()"
                  :disabled="!inputCorrente.trim()"
                  class="bg-violet-600 hover:bg-violet-700 disabled:opacity-50
                         text-white text-xs font-medium px-4 py-1.5 rounded-lg
                         transition-colors focus:outline-none focus:ring-2 focus:ring-violet-500">
            Invia
          </button>
          <button x-show="generando"
                  @click="interrompi()"
                  class="bg-red-50 hover:bg-red-100 text-red-700 border border-red-200
                         text-xs font-medium px-4 py-1.5 rounded-lg transition-colors
                         focus:outline-none focus:ring-2 focus:ring-red-400">
            ■ Interrompi
          </button>
        </div>
        <button x-show="storia.length > 0 && !generando"
                @click="azzera()"
                class="text-xs text-slate-400 hover:text-slate-600 px-3 py-1.5 rounded-lg
                       transition-colors focus:outline-none focus:ring-2 focus:ring-slate-300">
          ✕ Nuova chat
        </button>
      </div>
    </div><!-- /input -->

  </div><!-- /aiDisponibile -->
</div>
`;

// ── Registrazione ─────────────────────────────────────────────────────────────

window.MODULI_REGISTRATI = window.MODULI_REGISTRATI ?? {};
window.MODULI_REGISTRATI['consulente-normativo'] = {
  monta(contenitore) { contenitore.innerHTML = _TEMPLATE_CONSULENTE; },
};
