/**
 * correttore.js — M26 Passo 3: Correttore CSE senior con RAG normativo.
 *
 * Flusso:
 *   1. PO scrive bozza → "Analizza temi e riscrivi"
 *   2. AI_RAG propone temi per parole-chiave → chip selezionabili
 *   3. PO conferma/modifica temi → "Riscrivi con questi riferimenti"
 *   4. Retrieval per tag → contesto RAG iniettato nel prompt
 *   5. AI_BRIDGE.genera() con contesto → streaming → vista affiancata
 *   6. Pannello tracciabilità: riferimenti usati visibili al PO
 *
 * Dipende da: AI_BRIDGE, AI_RAG, AI_CERVELLO_CSE_SYSTEM_PROMPT, NOTIFICHE, ERRORI.
 */

'use strict';

// ── Componente Alpine ─────────────────────────────────────────────────────────

function Correttore() {
  return {

    // ── Stato AI / RAG ────────────────────────────────────────────────────────
    aiDisponibile:   null,
    ragCaricato:     false,
    ragTotaleChunk:  0,

    // ── Stato bozza + flusso ─────────────────────────────────────────────────
    bozza:           '',
    // 'input' | 'temi' | 'generando' | 'fatto'
    fase:            'input',

    // ── Selezione temi ────────────────────────────────────────────────────────
    temiDisponibili: [],
    temiSelezionati: [],

    // ── Risultato ─────────────────────────────────────────────────────────────
    riscritto:       '',
    chunkRecuperati: [],
    tracciaAperta:   false,
    _controller:     null,

    // ── Lifecycle ─────────────────────────────────────────────────────────────

    async init() {
      if (typeof AI_BRIDGE === 'undefined') { this.aiDisponibile = false; return; }
      this.aiDisponibile = await AI_BRIDGE.disponibile();

      if (typeof AI_RAG !== 'undefined') {
        this.ragCaricato = await AI_RAG.carica();
        if (this.ragCaricato) {
          this.temiDisponibili = AI_RAG.temiDisponibili();
          this.ragTotaleChunk  = AI_RAG.totale();
        }
      }
    },

    aggiornaSeCantiereRicambia() { /* indipendente dal cantiere */ },

    // ── Fase: analisi temi (input → temi) ────────────────────────────────────

    analizzaTemi() {
      if (!this.bozza.trim()) return;
      this.temiSelezionati = this.ragCaricato
        ? AI_RAG.proponiTemi(this.bozza)
        : [];
      this.fase = 'temi';
    },

    toggleTema(tema) {
      const idx = this.temiSelezionati.indexOf(tema);
      if (idx >= 0) this.temiSelezionati.splice(idx, 1);
      else          this.temiSelezionati.push(tema);
    },

    temaScelto(tema) { return this.temiSelezionati.includes(tema); },

    // Conteggio chunk trovati per i temi correnti (preview live)
    chunkTrovatiCorrente() {
      if (!this.ragCaricato || !this.temiSelezionati.length) return 0;
      return AI_RAG.recupera(this.temiSelezionati, 999).length;
    },

    _etichettaTema(tema) {
      const et = {
        psc:                           'Piano di Sicurezza (PSC)',
        pos:                           'Piano Operativo (POS)',
        contestazione:                 'Contestazione',
        vigilanza:                     'Vigilanza',
        sospensione:                   'Sospensione lavori',
        coordinamento:                 'Coordinamento',
        lavori_in_quota:               'Lavori in quota',
        ponteggi:                      'Ponteggi',
        scavi:                         'Scavi',
        dpi:                           'DPI',
        rischio_elettrico:             'Rischio elettrico',
        rischio_interferenziale:       'Interferenze',
        notifica_preliminare:          'Notifica preliminare',
        idoneita_tecnico_professionale:'Idoneità tecnico-prof.',
        infortuni:                     'Infortuni',
        formazione:                    'Formazione',
        costi_sicurezza:               'Costi sicurezza',
        patente_a_crediti:             'Patente a crediti',
      };
      return et[tema] ?? tema;
    },

    // ── Fase: riscrittura (temi → generando → fatto) ─────────────────────────

    async eseguiRiscrittura() {
      this._controller     = new AbortController();
      this.fase            = 'generando';
      this.riscritto       = '';
      this.chunkRecuperati = [];
      this.tracciaAperta   = false;

      let prompt = this.bozza;
      if (this.ragCaricato && this.temiSelezionati.length > 0) {
        this.chunkRecuperati = AI_RAG.recupera(this.temiSelezionati);   // usa il default max=5
        if (this.chunkRecuperati.length > 0) {
          prompt = AI_RAG.costruisciContesto(this.chunkRecuperati) + this.bozza;
        }
      }

      try {
        await AI_BRIDGE.genera({
          prompt,
          system:  AI_CERVELLO_CSE_SYSTEM_PROMPT,
          onToken: (tok) => { this.riscritto += tok; },
          signal:  this._controller.signal,
        });
      } catch (err) {
        if (err.name !== 'AbortError') {
          ERRORI.gestisciErrore('correttore/genera', err);
          if (!this.riscritto) this.riscritto = `⚠ ${err.message}`;
        }
      } finally {
        this.fase        = 'fatto';
        this._controller = null;
      }
    },

    interrompi() {
      this._controller?.abort();
      this.fase = 'fatto';
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

    torna() {
      this.fase          = 'input';
      this.riscritto     = '';
      this.chunkRecuperati = [];
    },

    azzera() {
      if (this.fase === 'generando') this.interrompi();
      this.bozza           = '';
      this.riscritto       = '';
      this.temiSelezionati = [];
      this.chunkRecuperati = [];
      this.fase            = 'input';
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
          ? ragTotaleChunk + ' riferimenti normativi'
          : 'Base normativa non caricata'"></span>
      </span>
    </div>
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

    <!-- ══════════════════════════════════════════════
         FASE: INPUT
         ══════════════════════════════════════════════ -->
    <div x-show="fase === 'input'" class="space-y-3">
      <div>
        <label for="corr-bozza" class="block text-sm font-medium text-slate-700 mb-1">
          La tua bozza
          <span class="text-slate-400 font-normal text-xs">— incolla o scrivi il testo da riscrivere</span>
        </label>
        <textarea id="corr-bozza" rows="6" x-model="bozza"
                  placeholder="Es: oggi ho visto che mancavano i parapetti sul ponteggio lato nord, ho detto al capocantiere di sistemare prima di riprendere i lavori in quota."
                  class="w-full border border-slate-300 rounded-xl px-4 py-3 text-sm resize-y
                         focus:outline-none focus:ring-2 focus:ring-blue-500
                         placeholder:text-slate-400 leading-relaxed"></textarea>
      </div>
      <div class="flex flex-wrap gap-2 items-center">
        <button @click="analizzaTemi()"
                :disabled="!bozza.trim()"
                class="bg-violet-600 hover:bg-violet-700 disabled:opacity-50 text-white
                       text-sm font-medium px-5 py-2 rounded-lg transition-colors
                       focus:outline-none focus:ring-2 focus:ring-violet-500 focus:ring-offset-2">
          ✍ Analizza temi e riscrivi
        </button>
        <span class="text-xs text-slate-400" x-show="ragCaricato">
          I temi normativi pertinenti verranno proposti automaticamente.
        </span>
        <span class="text-xs text-amber-600" x-show="!ragCaricato">
          ⚠ Base normativa non disponibile: i riferimenti non saranno recuperati.
        </span>
      </div>
    </div>

    <!-- ══════════════════════════════════════════════
         FASE: TEMI — selezione e conferma
         ══════════════════════════════════════════════ -->
    <div x-show="fase === 'temi'" class="space-y-5">

      <!-- Anteprima bozza -->
      <div class="bg-slate-50 border border-slate-200 rounded-xl px-5 py-4">
        <p class="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Bozza</p>
        <p class="text-sm text-slate-600 whitespace-pre-wrap line-clamp-4" x-text="bozza"></p>
      </div>

      <!-- Chip temi -->
      <div>
        <div class="flex items-center justify-between mb-2">
          <div>
            <p class="text-sm font-semibold text-slate-800">Temi normativi da includere</p>
            <p class="text-xs text-slate-400 mt-0.5">
              Chip blu = inclusi nel recupero norme. Clicca per selezionare/deselezionare.
            </p>
          </div>
          <span class="text-xs bg-slate-100 text-slate-500 px-2.5 py-1 rounded-full ml-3 flex-shrink-0">
            <span x-text="temiSelezionati.length"></span> selezionati
          </span>
        </div>

        <!-- Avviso nessun tema proposto -->
        <div x-show="ragCaricato && temiSelezionati.length === 0"
             class="mb-3 flex items-start gap-2 text-xs text-amber-700 bg-amber-50
                    border border-amber-200 rounded-lg px-3 py-2">
          <span aria-hidden="true">💡</span>
          <span>Nessun tema proposto per questa bozza. Selezionane uno, oppure procedi senza:
                il modello userà
                <code class="bg-amber-100 px-1 rounded">[verificare riferimento normativo]</code>
                dove non trova norme.</span>
        </div>

        <!-- Griglia chip -->
        <div class="flex flex-wrap gap-2" x-show="temiDisponibili.length > 0">
          <template x-for="tema in temiDisponibili" :key="tema">
            <button @click="toggleTema(tema)"
                    :class="temaScelto(tema)
                            ? 'bg-violet-600 text-white border-violet-600 shadow-sm'
                            : 'bg-white text-slate-600 border-slate-300 hover:border-violet-400'"
                    class="px-3 py-1.5 text-xs font-medium rounded-full border transition-all
                           focus:outline-none focus:ring-2 focus:ring-violet-400 focus:ring-offset-1">
              <span x-text="_etichettaTema(tema)"></span>
              <span x-show="temaScelto(tema)" class="ml-1 opacity-75" aria-hidden="true">✓</span>
            </button>
          </template>
        </div>
        <p x-show="!ragCaricato" class="text-sm text-slate-400 italic">
          Base normativa non caricata. Si procederà senza riferimenti normativi.
        </p>
      </div>

      <!-- Conteggio chunk trovati -->
      <p x-show="ragCaricato && temiSelezionati.length > 0" class="text-xs text-slate-500">
        📎 <span x-text="chunkTrovatiCorrente()"></span> riferimenti normativi trovati
        (max 5 inviati al modello, ordinati per pertinenza).
      </p>

      <!-- Pulsanti azione -->
      <div class="flex flex-wrap gap-3 items-center pt-1">
        <button @click="eseguiRiscrittura()"
                class="bg-violet-600 hover:bg-violet-700 text-white text-sm font-medium
                       px-5 py-2 rounded-lg transition-colors
                       focus:outline-none focus:ring-2 focus:ring-violet-500 focus:ring-offset-2">
          ✍ Riscrivi con questi riferimenti
        </button>
        <button @click="torna()"
                class="text-sm text-slate-500 hover:text-slate-700 px-4 py-2 rounded-lg
                       border border-slate-200 hover:bg-slate-50 transition-colors
                       focus:outline-none focus:ring-2 focus:ring-slate-400">
          ← Modifica bozza
        </button>
      </div>
    </div>

    <!-- ══════════════════════════════════════════════
         FASE: GENERANDO / FATTO — vista affiancata
         ══════════════════════════════════════════════ -->
    <div x-show="fase === 'generando' || fase === 'fatto'" class="space-y-4">

      <!-- Barra azioni -->
      <div class="flex flex-wrap gap-2 items-center">
        <span x-show="fase === 'generando'" class="text-sm text-slate-500 mr-auto flex items-center gap-2">
          <span class="inline-block w-2 h-2 bg-violet-400 rounded-full animate-pulse"
                aria-hidden="true"></span>
          Riscrittura in corso…
        </span>
        <button @click="interrompi()" x-show="fase === 'generando'"
                class="bg-red-50 hover:bg-red-100 text-red-700 border border-red-200
                       text-sm font-medium px-4 py-2 rounded-lg transition-colors
                       focus:outline-none focus:ring-2 focus:ring-red-400">
          ■ Interrompi
        </button>
        <button x-show="riscritto && fase === 'fatto'" @click="copia()"
                class="text-sm text-blue-600 hover:text-blue-800 flex items-center gap-1
                       px-3 py-2 rounded-lg border border-blue-200 hover:bg-blue-50
                       transition-colors focus:outline-none focus:ring-2 focus:ring-blue-400">
          📋 Copia
        </button>
        <button x-show="fase === 'fatto'" @click="torna()"
                class="text-sm text-slate-500 hover:text-slate-700 px-4 py-2 rounded-lg
                       border border-slate-200 hover:bg-slate-50 transition-colors
                       focus:outline-none focus:ring-2 focus:ring-slate-400">
          ← Modifica bozza
        </button>
        <button x-show="fase === 'fatto'" @click="azzera()"
                class="text-sm text-slate-400 hover:text-slate-600 px-4 py-2 rounded-lg
                       transition-colors focus:outline-none focus:ring-2 focus:ring-slate-300">
          ✕ Azzera
        </button>
      </div>

      <!-- Vista affiancata -->
      <div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div>
          <p class="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">
            Originale <span class="text-slate-300 font-normal normal-case">(invariato)</span>
          </p>
          <div class="bg-slate-50 border border-slate-200 rounded-xl px-4 py-3
                      text-sm text-slate-600 whitespace-pre-wrap leading-relaxed min-h-[10rem]"
               x-text="bozza"></div>
        </div>
        <div>
          <p class="text-xs font-semibold text-violet-600 uppercase tracking-wide mb-2">
            Riscritto da CSE senior
          </p>
          <div class="bg-white border border-violet-200 rounded-xl px-4 py-3
                      text-sm text-slate-800 whitespace-pre-wrap leading-relaxed min-h-[10rem]"
               :class="fase === 'generando' ? 'border-violet-400' : ''"
               x-text="riscritto || '…'"
               aria-live="polite"></div>
        </div>
      </div>

      <!-- Tracciabilità riferimenti -->
      <div x-show="chunkRecuperati.length > 0"
           class="border border-slate-200 rounded-xl overflow-hidden">
        <button @click="tracciaAperta = !tracciaAperta"
                class="w-full flex items-center justify-between px-4 py-3
                       bg-slate-50 hover:bg-slate-100 text-left transition-colors
                       focus:outline-none focus:ring-2 focus:ring-slate-400 focus:ring-inset">
          <span class="text-sm font-medium text-slate-700">
            📎 Riferimenti normativi utilizzati
            <span class="ml-1.5 text-xs text-slate-400 font-normal">
              (<span x-text="chunkRecuperati.length"></span> fonti)
            </span>
          </span>
          <span class="text-xs text-slate-400"
                x-text="tracciaAperta ? '▲ chiudi' : '▼ mostra'"></span>
        </button>
        <div x-show="tracciaAperta" class="divide-y divide-slate-100">
          <template x-for="c in chunkRecuperati" :key="c.id">
            <div class="px-4 py-2.5">
              <p class="text-xs font-semibold font-mono text-slate-700" x-text="c.riferimento"></p>
              <p class="text-xs text-slate-500 mt-0.5" x-text="c.titolo"></p>
              <p class="text-xs text-slate-400 mt-0.5" x-text="'Fonte: ' + c.fonte"></p>
            </div>
          </template>
        </div>
      </div>

      <!-- Nessun chunk recuperato ma temi selezionati -->
      <p x-show="fase === 'fatto' && chunkRecuperati.length === 0 && temiSelezionati.length > 0"
         class="text-xs text-slate-400 italic">
        ℹ Nessun riferimento normativo trovato per i temi selezionati:
        i segnaposto <code class="bg-slate-100 px-1 rounded">[verificare riferimento normativo]</code>
        indicano le parti da completare manualmente.
      </p>

      <!-- Avvertenza sempre visibile dopo la generazione -->
      <div x-show="fase === 'fatto' && riscritto"
           class="flex items-start gap-3 bg-amber-50 border border-amber-200
                  rounded-xl px-4 py-3 text-xs text-amber-800">
        <span class="text-base flex-shrink-0" aria-hidden="true">⚠</span>
        <div>
          <strong>Proposta da verificare.</strong>
          I riferimenti normativi citati provengono dalla base normativa RAG curata —
          verificarne la pertinenza al caso specifico prima dell'uso ufficiale.
          I segnaposto
          <code class="bg-amber-100 px-1 rounded">[verificare riferimento normativo]</code>
          e <code class="bg-amber-100 px-1 rounded">[…]</code>
          indicano parti da completare manualmente. L'AI non sostituisce il giudizio del CSE.
        </div>
      </div>

    </div><!-- /generando|fatto -->

  </div><!-- /aiDisponibile -->
</div>
`;

// ── Registrazione ─────────────────────────────────────────────────────────────

window.MODULI_REGISTRATI = window.MODULI_REGISTRATI ?? {};
window.MODULI_REGISTRATI['correttore-ai'] = {
  monta(contenitore) { contenitore.innerHTML = _TEMPLATE_CORRETTORE; },
};
