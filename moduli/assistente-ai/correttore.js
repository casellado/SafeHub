/**
 * correttore.js — M26 Passo 2: Correttore CSE senior.
 *
 * Campo di prova generico (non ancora integrato nei moduli).
 * Il PO incolla una bozza informale → il Correttore la riscrive in italiano
 * tecnico-istituzionale da CSE senior → vista affiancata originale|riscritto.
 *
 * Principio cardine (AI_CERVELLO_CSE_SYSTEM_PROMPT):
 *   riscrivi la FORMA, mai la SOSTANZA. NON aggiungere fatti.
 *
 * Usa AI_BRIDGE.genera() (Passo 1) e AI_CERVELLO_CSE_SYSTEM_PROMPT.
 * Dipende da: AI_BRIDGE, AI_CERVELLO_CSE_SYSTEM_PROMPT, NOTIFICHE, ERRORI.
 */

'use strict';

// ── Componente Alpine ─────────────────────────────────────────────────────────

function Correttore() {
  return {

    // Stato disponibilità AI (null = verifica in corso)
    aiDisponibile:  null,

    // Campi del form
    bozza:          '',

    // Output streaming
    riscritto:      '',
    generando:      false,
    _controller:    null,

    // ── Lifecycle ─────────────────────────────────────────────────────────────

    async init() {
      if (typeof AI_BRIDGE === 'undefined') {
        this.aiDisponibile = false;
        return;
      }
      this.aiDisponibile = await AI_BRIDGE.disponibile();
    },

    aggiornaSeCantiereRicambia() {
      // Il Correttore è indipendente dal cantiere: nessuna azione.
    },

    // ── Azioni ────────────────────────────────────────────────────────────────

    async riscrivi() {
      if (!this.bozza.trim() || this.generando) return;

      this._controller = new AbortController();
      this.generando   = true;
      this.riscritto   = '';

      try {
        await AI_BRIDGE.genera({
          prompt:  this.bozza,
          system:  AI_CERVELLO_CSE_SYSTEM_PROMPT,
          onToken: (tok) => { this.riscritto += tok; },
          signal:  this._controller.signal,
        });
      } catch (err) {
        if (err.name === 'AbortError') {
          // Interruzione volontaria — mantieni il testo parziale
        } else {
          ERRORI.gestisciErrore('correttore/genera', err);
          if (!this.riscritto) {
            this.riscritto = `⚠ ${err.message}`;
          }
        }
      } finally {
        this.generando   = false;
        this._controller = null;
      }
    },

    interrompi() {
      this._controller?.abort();
      this.generando = false;
    },

    async copia() {
      if (!this.riscritto) return;
      try {
        await navigator.clipboard.writeText(this.riscritto);
        NOTIFICHE.successo('Copiato', 'Testo riscritto copiato negli appunti.');
      } catch {
        NOTIFICHE.attenzione('Correttore', 'Impossibile copiare. Seleziona il testo manualmente.');
      }
    },

    azzera() {
      if (this.generando) this.interrompi();
      this.bozza     = '';
      this.riscritto = '';
    },
  };
}

// ── Template HTML ─────────────────────────────────────────────────────────────

const _TEMPLATE_CORRETTORE = `
<div x-data="Correttore()" x-init="init()" class="max-w-6xl">

  <!-- === HEADER === -->
  <div class="flex items-start justify-between mb-5 flex-wrap gap-3">
    <div>
      <h1 class="text-xl font-semibold text-slate-800">✍ Correttore CSE senior</h1>
      <p class="text-xs text-slate-400 mt-0.5">
        Riscrive una bozza in italiano tecnico-istituzionale — proposta da verificare sempre.
      </p>
    </div>
    <!-- Badge AI disponibile -->
    <span class="flex items-center gap-2 text-xs px-3 py-1.5 rounded-full border flex-shrink-0"
          :class="aiDisponibile === null ? 'border-slate-200 bg-slate-50 text-slate-500'
                : aiDisponibile         ? 'border-green-200 bg-green-50 text-green-700'
                :                         'border-amber-200 bg-amber-50 text-amber-700'">
      <span aria-hidden="true"
            x-text="aiDisponibile === null ? '⏳' : aiDisponibile ? '🟢' : '🟡'"></span>
      <span x-text="aiDisponibile === null ? 'Verifica AI…'
                  : aiDisponibile         ? 'Assistente disponibile'
                  :                         'Assistente non disponibile'"></span>
    </span>
  </div>

  <!-- Assistente non disponibile -->
  <div x-show="aiDisponibile === false"
       class="bg-amber-50 border border-amber-200 rounded-xl px-5 py-4 text-sm text-amber-800 mb-5">
    <strong>Ollama non raggiungibile.</strong>
    Verifica che il servizio sia in esecuzione, poi vai in
    <button @click="navigaA('impostazioni')"
            class="underline hover:no-underline focus:outline-none focus:ring-2 focus:ring-amber-400 rounded">
      Impostazioni → Assistente AI
    </button> per configurarlo.
  </div>

  <div x-show="aiDisponibile === true">

    <!-- === AREA INPUT (bozza) + CONTROLLI === -->
    <div class="mb-4 space-y-3">
      <div>
        <label for="corr-bozza" class="block text-sm font-medium text-slate-700 mb-1">
          La tua bozza
          <span class="text-slate-400 font-normal text-xs">
            — incolla o scrivi il testo da riscrivere
          </span>
        </label>
        <textarea id="corr-bozza" rows="5" x-model="bozza"
                  placeholder="Es: oggi ho visto che mancavano i parapetti sul ponteggio lato nord, ho detto al capocantiere di sistemare prima di riprendere i lavori in quota."
                  class="w-full border border-slate-300 rounded-xl px-4 py-3 text-sm resize-y
                         focus:outline-none focus:ring-2 focus:ring-blue-500
                         placeholder:text-slate-400 leading-relaxed"></textarea>
      </div>

      <!-- Controlli -->
      <div class="flex flex-wrap gap-2 items-center">
        <button @click="riscrivi()"
                :disabled="generando || !bozza.trim()"
                class="bg-violet-600 hover:bg-violet-700 disabled:opacity-50 text-white
                       text-sm font-medium px-5 py-2 rounded-lg transition-colors
                       focus:outline-none focus:ring-2 focus:ring-violet-500 focus:ring-offset-2">
          <span x-text="generando ? '⏳ Riscrittura…' : '✍ Riscrivi da CSE senior'"></span>
        </button>

        <button @click="interrompi()" x-show="generando"
                class="bg-red-50 hover:bg-red-100 text-red-700 border border-red-200
                       text-sm font-medium px-4 py-2 rounded-lg transition-colors
                       focus:outline-none focus:ring-2 focus:ring-red-400">
          ■ Interrompi
        </button>

        <button @click="azzera()" x-show="bozza || riscritto"
                :disabled="generando"
                class="text-sm text-slate-400 hover:text-slate-600 px-4 py-2 rounded-lg
                       border border-slate-200 hover:bg-slate-50 transition-colors
                       focus:outline-none focus:ring-2 focus:ring-slate-400">
          Azzera
        </button>
      </div>
    </div>

    <!-- === VISTA AFFIANCATA (originale | riscritto) === -->
    <div x-show="riscritto || generando"
         class="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">

      <!-- Colonna SINISTRA: originale -->
      <div>
        <p class="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">
          Originale <span class="text-slate-300 font-normal normal-case">(invariato)</span>
        </p>
        <div class="bg-slate-50 border border-slate-200 rounded-xl px-4 py-3
                    text-sm text-slate-600 whitespace-pre-wrap leading-relaxed min-h-[8rem]"
             x-text="bozza">
        </div>
      </div>

      <!-- Colonna DESTRA: riscritto in streaming -->
      <div>
        <div class="flex items-center justify-between mb-2">
          <p class="text-xs font-semibold text-violet-600 uppercase tracking-wide">
            Riscritto da CSE senior
            <span x-show="generando"
                  class="ml-1 inline-block w-2 h-2 bg-violet-400 rounded-full animate-pulse"
                  aria-label="generazione in corso"></span>
          </p>
          <button x-show="riscritto && !generando" @click="copia()"
                  class="text-xs text-blue-600 hover:text-blue-800 flex items-center gap-1
                         px-2.5 py-1 rounded-lg border border-blue-200 hover:bg-blue-50
                         transition-colors focus:outline-none focus:ring-2 focus:ring-blue-400">
            📋 Copia
          </button>
        </div>

        <!-- Testo riscritto -->
        <div class="bg-white border border-violet-200 rounded-xl px-4 py-3
                    text-sm text-slate-800 whitespace-pre-wrap leading-relaxed min-h-[8rem]"
             :class="generando ? 'border-violet-300' : ''"
             x-text="riscritto || '…'"
             aria-live="polite">
        </div>
      </div>
    </div>

    <!-- === AVVERTENZA VERIFICARE === -->
    <div x-show="riscritto && !generando"
         class="flex items-start gap-3 bg-amber-50 border border-amber-200
                rounded-xl px-4 py-3 text-xs text-amber-800">
      <span class="text-base flex-shrink-0" aria-hidden="true">⚠</span>
      <div>
        <strong>Proposta da verificare.</strong>
        Il testo riscritto è una bozza formale generata dall'AI, da esaminare e approvare prima
        dell'uso ufficiale. I segnaposto
        <code class="bg-amber-100 px-1 rounded">[verificare riferimento normativo]</code>
        e <code class="bg-amber-100 px-1 rounded">[…]</code>
        indicano parti da completare manualmente.
        L'AI non sostituisce il giudizio del CSE.
      </div>
    </div>

  </div><!-- /aiDisponibile -->
</div>
`;

// ── Registrazione ─────────────────────────────────────────────────────────────

window.MODULI_REGISTRATI = window.MODULI_REGISTRATI ?? {};
window.MODULI_REGISTRATI['correttore-ai'] = {
  monta(contenitore) { contenitore.innerHTML = _TEMPLATE_CORRETTORE; },
};
