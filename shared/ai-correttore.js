/**
 * ai-correttore.js — Helper condiviso: apre il Correttore CSE senior da qualsiasi campo testo.
 *
 * API pubblica:
 *   apriCorrettore(testoIniziale, onAccetta, opzioni?)
 *     testoIniziale : string
 *     onAccetta     : (testoRiscritto: string) => void  — chiamato su "Usa questo testo"
 *     opzioni?      : { temiIniziali?: string[], titolo?: string }
 *
 * L'helper è CIECO al tipo di campo: lavora solo su stringhe. Il chiamante estrae
 * il testo dal suo campo (x-model, innerHTML, ecc.) e lo rimette dopo l'accettazione.
 *
 * L'elemento <div id="correttore-overlay-root" x-data="CorrettoreOverlay()"> deve
 * essere presente in index.html (aggiunto prima di </body>).
 *
 * Dipende da: AI_BRIDGE, AI_RAG, AI_CERVELLO_CSE_SYSTEM_PROMPT, ERRORI, NOTIFICHE.
 */

'use strict';

// Callback corrente — NON Alpine reactive: è una funzione, non va osservata da Alpine.
let _callbackAttivo = null;

/**
 * Apre l'overlay del Correttore.
 *
 * @param {string}   testoIniziale   — testo iniziale da riscrivere
 * @param {Function} onAccetta       — callback(testoRiscritto) su "Usa questo testo"
 * @param {{temiIniziali?: string[], titolo?: string}} [opzioni]
 */
function apriCorrettore(testoIniziale, onAccetta, opzioni = {}) {
  const el = document.getElementById('correttore-overlay-root');
  if (!el) {
    console.error('ai-correttore: #correttore-overlay-root non trovato in index.html');
    return;
  }
  const comp = Alpine.$data(el);
  if (!comp) {
    console.error('ai-correttore: Alpine.$data non disponibile sull\'overlay');
    return;
  }
  _callbackAttivo = typeof onAccetta === 'function' ? onAccetta : null;
  comp.apri(testoIniziale, opzioni);
}

window.apriCorrettore = apriCorrettore;

/**
 * Apre l'overlay col testo del campo chiamante preimpostato come bozza.
 * Solo lettura dal chiamante: nessuna scrittura cross-component al ritorno.
 * @param {string} testo  — bozza iniziale (lettura dal campo del modulo)
 * @param {string} [titolo] — etichetta contestuale mostrata nell'overlay
 */
window.apriCorrettoreConTesto = function (testo, titolo = '') {
  const el   = document.getElementById('correttore-overlay-root');
  const comp = el ? Alpine.$data(el) : null;
  if (!comp) { console.error('ai-correttore: #correttore-overlay-root non trovato'); return; }
  comp.apriConTesto(testo, titolo);
};

/**
 * Apre l'overlay del Correttore in modalità standalone: non resetta lo stato,
 * non richiede callback. Usato dalla sidebar e da qualsiasi punto dell'app.
 */
window.apriCorrettoreLibero = function () {
  const el   = document.getElementById('correttore-overlay-root');
  const comp = el ? Alpine.$data(el) : null;
  if (!comp) { console.error('ai-correttore: #correttore-overlay-root non trovato'); return; }
  comp.apriLibero();
};

// ── Componente Alpine dell'overlay ────────────────────────────────────────────

function CorrettoreOverlay() {
  return {

    // ── Visibilità e contesto ─────────────────────────────────────────────
    visibile:       false,
    titoloCampo:    '',

    // ── Stato AI / RAG ────────────────────────────────────────────────────
    aiDisponibile:   null,
    ragCaricato:     false,
    ragTotaleChunk:  0,
    temiDisponibili: [],

    // ── Stato flusso ──────────────────────────────────────────────────────
    bozza:           '',
    // 'input' | 'temi' | 'generando' | 'fatto'
    fase:            'input',

    // ── Selezione temi ────────────────────────────────────────────────────
    temiSelezionati: [],

    // ── Risultato ─────────────────────────────────────────────────────────
    riscritto:       '',
    chunkRecuperati: [],
    tracciaAperta:   false,
    copiatoAuto:     false,
    _controller:     null,

    // ── Lifecycle ─────────────────────────────────────────────────────────

    async init() {
      if (typeof AI_BRIDGE !== 'undefined') {
        this.aiDisponibile = await AI_BRIDGE.disponibile();
      } else {
        this.aiDisponibile = false;
      }
      if (typeof AI_RAG !== 'undefined') {
        this.ragCaricato = await AI_RAG.carica();
        if (this.ragCaricato) {
          this.temiDisponibili = AI_RAG.temiDisponibili();
          this.ragTotaleChunk  = AI_RAG.totale();
        }
      }
    },

    // ── API chiamata da apriCorrettore() ──────────────────────────────────

    apri(testoIniziale, opzioni = {}) {
      this.bozza           = testoIniziale ?? '';
      this.titoloCampo     = opzioni.titolo ?? '';
      this.riscritto       = '';
      this.chunkRecuperati = [];
      this.tracciaAperta   = false;
      this._controller     = null;

      if (opzioni.temiIniziali?.length > 0) {
        this.temiSelezionati = [...opzioni.temiIniziali];
        this.fase            = 'temi';
      } else {
        this.temiSelezionati = [];
        this.fase            = 'input';
      }

      this.visibile = true;
      this.$nextTick(() => {
        if (this.fase === 'input') {
          document.getElementById('corr-ov-bozza')?.focus();
        } else {
          this.$el.querySelector('button:not([disabled])')?.focus();
        }
      });
    },

    // Apre l'overlay con un testo preimpostato e temi auto-proposti dal RAG.
    // Solo lettura: non scrive nei campi del chiamante.
    apriConTesto(testo, titolo = '') {
      this.bozza           = testo ?? '';
      this.titoloCampo     = titolo;
      this.riscritto       = '';
      this.chunkRecuperati = [];
      this.tracciaAperta   = false;
      this._controller     = null;
      this.copiatoAuto     = false;

      if (this.bozza.trim() && this.ragCaricato && typeof AI_RAG !== 'undefined') {
        this.temiSelezionati = AI_RAG.proponiTemi(this.bozza);
        this.fase            = this.temiSelezionati.length > 0 ? 'temi' : 'input';
      } else {
        this.temiSelezionati = [];
        this.fase            = 'input';
      }

      this.visibile = true;
      this.$nextTick(() => {
        if (this.fase === 'input') {
          document.getElementById('corr-ov-bozza')?.focus();
        } else {
          this.$el.querySelector('button:not([disabled])')?.focus();
        }
      });
    },

    // Apre l'overlay senza resettare lo stato: riapre dove era rimasto.
    apriLibero() {
      this.visibile = true;
      this.$nextTick(() => {
        if (this.fase === 'input' || this.fase === 'temi') {
          document.getElementById('corr-ov-bozza')?.focus();
        } else {
          this.$el.querySelector('button:not([disabled])')?.focus();
        }
      });
    },

    chiudi(forza = false) {
      if (this.fase === 'generando' && !forza) {
        if (!confirm('Riscrittura in corso. Interrompere e chiudere?')) return;
        this.interrompi();
      } else if (this.fase === 'generando') {
        this.interrompi();
      }
      this.visibile      = false;
      _callbackAttivo    = null;
    },

    usaTesto() {
      if (!this.riscritto || this.fase !== 'fatto') return;
      if (typeof _callbackAttivo === 'function') _callbackAttivo(this.riscritto);
      this.visibile   = false;
      _callbackAttivo = null;
    },

    async copia() {
      if (!this.riscritto) return;
      try {
        await navigator.clipboard.writeText(this.riscritto);
        this.copiatoAuto = true;
        NOTIFICHE.successo('Copiato', 'Testo riscritto copiato negli appunti.');
      } catch {
        NOTIFICHE.attenzione('Correttore', 'Impossibile copiare — seleziona il testo manualmente.');
      }
    },

    // ── Flusso: analisi temi ──────────────────────────────────────────────

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

    chunkTrovatiCorrente() {
      if (!this.ragCaricato || !this.temiSelezionati.length) return 0;
      return AI_RAG.recupera(this.temiSelezionati, 999).length;
    },

    _etichettaTema(tema) {
      const et = {
        psc:                            'Piano di Sicurezza (PSC)',
        pos:                            'Piano Operativo (POS)',
        contestazione:                  'Contestazione',
        vigilanza:                      'Vigilanza',
        sospensione:                    'Sospensione lavori',
        coordinamento:                  'Coordinamento',
        lavori_in_quota:                'Lavori in quota',
        ponteggi:                       'Ponteggi',
        scavi:                          'Scavi',
        dpi:                            'DPI',
        rischio_elettrico:              'Rischio elettrico',
        rischio_interferenziale:        'Interferenze',
        notifica_preliminare:           'Notifica preliminare',
        idoneita_tecnico_professionale: 'Idoneità tecnico-prof.',
        infortuni:                      'Infortuni',
        formazione:                     'Formazione',
        costi_sicurezza:                'Costi sicurezza',
        patente_a_crediti:              'Patente a crediti',
      };
      return et[tema] ?? tema;
    },

    // ── Flusso: riscrittura ───────────────────────────────────────────────

    async eseguiRiscrittura() {
      this._controller     = new AbortController();
      this.fase            = 'generando';
      this.riscritto       = '';
      this.chunkRecuperati = [];
      this.tracciaAperta   = false;
      this.copiatoAuto     = false;

      let prompt = this.bozza;
      if (this.ragCaricato && this.temiSelezionati.length > 0) {
        this.chunkRecuperati = AI_RAG.recupera(this.temiSelezionati);
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
          ERRORI.gestisciErrore('correttore-overlay/genera', err);
          if (!this.riscritto) this.riscritto = `⚠ ${err.message}`;
        }
      } finally {
        this.fase        = 'fatto';
        this._controller = null;
        if (this.riscritto) {
          try {
            await navigator.clipboard.writeText(this.riscritto);
            this.copiatoAuto = true;
          } catch {
            this.copiatoAuto = false;
          }
        }
      }
    },

    interrompi() {
      this._controller?.abort();
      this.fase = 'fatto';
    },

    torna() {
      if (this.fase === 'generando') this.interrompi();
      this.fase            = 'temi';
      this.riscritto       = '';
      this.chunkRecuperati = [];
    },
  };
}
