/**
 * cruscotto.js — Home dell'app: Cruscotto Operativo.
 *
 * Risponde a "cosa devo fare oggi": vista di sola lettura che aggrega
 * dati operativi del cantiere corrente da più sorgenti.
 *
 * Distinto da:
 *   - cruscotto-scadenze: "cosa scade quando" (scadenze anagrafica)
 *   - conformita-documenti: "chi manca di cosa" (completezza imprese)
 *
 * Letture in Promise.all() con .catch per fonte: un modulo assente non
 * rompe il resto. Cantiere CORRENTE — no multi-cantiere.
 * Zero Alpine.initTree. Zero logica AI (slot predisposto per M26).
 */

'use strict';

// ── Helpers modulo ────────────────────────────────────────────────────────────

/** Periodo {anno, mese} del mese corrente (per DIARIO_SERVICE). */
function _cruscottoMeseCorrente() {
  const ora = new Date();
  return [{ anno: String(ora.getFullYear()), mese: String(ora.getMonth() + 1).padStart(2, '0') }];
}

// ── Componente Alpine ─────────────────────────────────────────────────────────

function CruscottoPrincipale() {
  return {

    caricamento:    true,
    _cantiereId:    null,

    // Dati per pannello (null = non caricato o errore)
    pannelloNc:     null,  // { totale, gravissime, gravi, inScadenza }
    pannelloEventi: null,  // { totale, infortuni, nearMiss }
    pannelloOds:    null,  // { riscontri, adempimenti }
    pannelloPsc:    null,  // { nDoc }
    pannelloDiario: null,  // { voci: [{ titolo, data_ora, creato_il, tipo }] }

    // ── Computed in-memory (zero I/O) ─────────────────────────────────────────

    get nomeCantiereDisplay() {
      const c = Alpine.store('cantiere');
      if (!c?.id) return '';
      return c.nome ? `${c.nome} · ${c.id}` : c.id;
    },

    get dataOggi() {
      return UTILS.formatData(new Date().toISOString());
    },

    get nImprese() {
      if (!ANAGRAFICA_SERVICE.isCaricato || ANAGRAFICA_SERVICE.cantiereId !== this._cantiereId) return null;
      return (ANAGRAFICA_SERVICE.dati?.imprese ?? []).filter(i => !i._cestino).length;
    },

    // Contatore totale ODS in sospeso
    get odsTotale() {
      if (!this.pannelloOds) return null;
      return this.pannelloOds.riscontri + this.pannelloOds.adempimenti;
    },

    // ── Lifecycle ─────────────────────────────────────────────────────────────

    init() {
      this._cantiereId = Alpine.store('cantiere')?.id;
      this._carica();
    },

    aggiornaSeCantiereRicambia() {
      const id = Alpine.store('cantiere')?.id;
      if (id === this._cantiereId) return;
      this._cantiereId = id;
      this._carica();
    },

    async _carica() {
      this.caricamento    = true;
      this.pannelloNc     = null;
      this.pannelloEventi = null;
      this.pannelloOds    = null;
      this.pannelloPsc    = null;
      this.pannelloDiario = null;

      const cantId = this._cantiereId;
      if (!cantId) { this.caricamento = false; return; }

      const [ncAll, eventiAll, odsInv, odsRic, pscCorpus, diarioVoci] = await Promise.all([
        NC_SERVICE.leggiNC(cantId).catch(() => null),
        EVENTI_SERVICE.leggi(cantId).catch(() => null),
        ODS_SERVICE.leggiOds(cantId, 'inviati').catch(() => null),
        ODS_SERVICE.leggiOds(cantId, 'ricevuti').catch(() => null),
        CORPUS_PSC_SERVICE.leggiCorpus(cantId).catch(() => null),
        (typeof DIARIO_SERVICE !== 'undefined'
          ? DIARIO_SERVICE.leggiVoci(cantId, _cruscottoMeseCorrente()).catch(() => null)
          : Promise.resolve(null)),
      ]);

      // ── NC ────────────────────────────────────────────────────────────────
      if (ncAll !== null) {
        const attive     = ncAll.filter(nc => nc.stato_risoluzione !== 'CHIUSA');
        const gravissime = attive.filter(nc => nc.livello === 'gravissima').length;
        const gravi      = attive.filter(nc => nc.livello === 'grave').length;
        const inScadenza = attive.filter(nc => {
          if (!nc.scadenza_risoluzione) return false;
          const gg = UTILS.giorniAllaScadenza(nc.scadenza_risoluzione);
          return gg !== null && gg <= 7;
        }).length;
        this.pannelloNc = { totale: attive.length, gravissime, gravi, inScadenza };
      }

      // ── EVENTI ────────────────────────────────────────────────────────────
      if (eventiAll !== null) {
        const aperti   = eventiAll.filter(ev => ev.stato === 'aperto');
        const infortuni = aperti.filter(ev => ev.categoria === 'infortunio').length;
        const nearMiss  = aperti.filter(ev => ev.categoria === 'near_miss').length;
        this.pannelloEventi = { totale: aperti.length, infortuni, nearMiss };
      }

      // ── ODS ───────────────────────────────────────────────────────────────
      if (odsInv !== null && odsRic !== null) {
        const riscontri   = (odsInv.documenti ?? []).filter(d => !d._cestino && d.richiede_riscontro).length;
        const adempimenti = (odsRic.documenti ?? []).filter(d => !d._cestino && d.richiede_adempimento).length;
        this.pannelloOds = { riscontri, adempimenti };
      }

      // ── PSC ───────────────────────────────────────────────────────────────
      if (pscCorpus !== null) {
        const nDoc = (pscCorpus.documenti ?? []).filter(d => !d._cestino).length;
        this.pannelloPsc = { nDoc };
      }

      // ── DIARIO ────────────────────────────────────────────────────────────
      if (diarioVoci !== null) {
        this.pannelloDiario = { voci: diarioVoci.slice(0, 3) };
      }

      this.caricamento = false;
    },

    // ── Helper UI ─────────────────────────────────────────────────────────────

    classeCardNc() {
      if (!this.pannelloNc || this.pannelloNc.totale === 0)
        return 'border-green-200 bg-green-50';
      if (this.pannelloNc.gravissime > 0)
        return 'border-red-300 bg-red-50 ring-1 ring-red-200';
      if (this.pannelloNc.gravi > 0 || this.pannelloNc.inScadenza > 0)
        return 'border-amber-300 bg-amber-50';
      return 'border-amber-200 bg-amber-50';
    },

    classeCardEventi() {
      if (!this.pannelloEventi || this.pannelloEventi.totale === 0)
        return 'border-green-200 bg-green-50';
      if (this.pannelloEventi.infortuni > 0)
        return 'border-red-200 bg-red-50';
      return 'border-amber-200 bg-amber-50';
    },

    classeCardOds() {
      if (!this.pannelloOds) return 'border-slate-200 bg-white';
      const totale = this.pannelloOds.riscontri + this.pannelloOds.adempimenti;
      return totale > 0 ? 'border-amber-200 bg-amber-50' : 'border-green-200 bg-green-50';
    },

    classeCardPsc() {
      if (!this.pannelloPsc) return 'border-slate-200 bg-white';
      return this.pannelloPsc.nDoc === 0
        ? 'border-amber-300 bg-amber-50'
        : 'border-slate-200 bg-white';
    },

    // Formatta data dalla voce diario (data_ora o creato_il)
    formatDataVoce(voce) {
      const dt = voce.data_ora ?? voce.creato_il ?? '';
      return dt ? UTILS.formatData(dt) : '';
    },
  };
}

// ── Template HTML ─────────────────────────────────────────────────────────────

const _TEMPLATE_CRUSCOTTO_OPERATIVO = `
<div x-data="CruscottoPrincipale()" x-init="init()" x-effect="aggiornaSeCantiereRicambia()"
     class="max-w-5xl">

  <!-- === HEADER === -->
  <div class="flex items-start justify-between mb-6 gap-4 flex-wrap">
    <div>
      <h1 class="text-xl font-semibold text-slate-800">🏗 Cruscotto Operativo</h1>
      <p class="text-sm text-slate-500 mt-0.5"
         x-text="nomeCantiereDisplay || 'Nessun cantiere selezionato'"></p>
    </div>
    <div class="text-right flex-shrink-0">
      <p class="text-xs text-slate-400" x-text="dataOggi"></p>
      <button @click="_carica()" x-show="$store.cantiere.id && !caricamento"
              class="mt-1 text-xs text-slate-400 hover:text-slate-600 transition-colors
                     focus:outline-none focus:ring-2 focus:ring-slate-400 rounded">
        ↻ Aggiorna
      </button>
    </div>
  </div>

  <!-- Nessun cantiere — installazione nuova: invito a creare il primo -->
  <div x-show="!$store.cantiere.id && $store.cantieri.lista.filter(c => c.stato !== 'cestinato').length === 0"
       class="placeholder-modulo">
    <div class="text-3xl mb-3" aria-hidden="true">🏗</div>
    <p class="font-medium text-slate-700 mb-1">Nessun cantiere ancora.</p>
    <p class="text-sm text-slate-500 mb-4">Crea il primo cantiere per iniziare a lavorare.</p>
    <button @click="navigaA('gestione-cantieri')"
            class="bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium
                   px-5 py-2 rounded-lg transition-colors
                   focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2">
      + Crea il tuo primo cantiere
    </button>
  </div>
  <!-- Cantieri presenti ma nessuno selezionato -->
  <div x-show="!$store.cantiere.id && $store.cantieri.lista.filter(c => c.stato !== 'cestinato').length > 0"
       class="placeholder-modulo">
    <div class="text-3xl" aria-hidden="true">🏗</div>
    <p class="text-slate-500">Seleziona un cantiere per vedere il cruscotto operativo.</p>
  </div>

  <div x-show="$store.cantiere.id">

    <!-- Spinner -->
    <div x-show="caricamento" class="flex items-center gap-3 py-14 text-slate-400 text-sm">
      <div class="w-5 h-5 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"
           role="status" aria-label="Caricamento"></div>
      Raccolta dati in corso…
    </div>

    <div x-show="!caricamento">

      <!-- ═══════════════════════════════════════════════════════════
           PANNELLI PRINCIPALI (2×2)
           ═══════════════════════════════════════════════════════════ -->
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">

        <!-- ── PANNELLO NON CONFORMITÀ ─────────────────────────── -->
        <button type="button" @click="navigaA('non-conformita')"
                :class="classeCardNc()"
                class="border rounded-2xl px-5 py-4 text-left transition-all
                       hover:shadow-md focus:outline-none focus:ring-2 focus:ring-blue-400
                       active:scale-95">
          <div class="flex items-start justify-between mb-3">
            <div>
              <p class="text-xs font-semibold text-slate-500 uppercase tracking-wide">Non Conformità</p>
              <div class="text-4xl font-bold mt-1"
                   :class="pannelloNc && pannelloNc.gravissime > 0 ? 'text-red-700'
                         : pannelloNc && pannelloNc.totale > 0    ? 'text-amber-700'
                         : 'text-green-700'"
                   x-text="pannelloNc === null ? '—' : pannelloNc.totale">
              </div>
              <p class="text-xs text-slate-500 mt-0.5">attive (non chiuse)</p>
            </div>
            <span class="text-3xl" aria-hidden="true">⚠️</span>
          </div>
          <!-- Dettaglio -->
          <div x-show="pannelloNc && pannelloNc.totale > 0"
               class="space-y-1 border-t border-black/10 pt-2">
            <p x-show="pannelloNc && pannelloNc.gravissime > 0"
               class="text-xs text-red-800 font-semibold flex items-center gap-1">
              <span>🔴</span>
              <span x-text="(pannelloNc?.gravissime ?? 0) + ' gravissim' + ((pannelloNc?.gravissime ?? 0) === 1 ? 'a' : 'e')"></span>
            </p>
            <p x-show="pannelloNc && pannelloNc.gravi > 0"
               class="text-xs text-amber-800 flex items-center gap-1">
              <span>🟠</span>
              <span x-text="(pannelloNc?.gravi ?? 0) + ' grav' + ((pannelloNc?.gravi ?? 0) === 1 ? 'e' : 'i')"></span>
            </p>
            <p x-show="pannelloNc && pannelloNc.inScadenza > 0"
               class="text-xs text-amber-700 flex items-center gap-1">
              <span>⏰</span>
              <span x-text="(pannelloNc?.inScadenza ?? 0) + ' con scadenza ≤ 7 giorni'"></span>
            </p>
          </div>
          <p x-show="pannelloNc && pannelloNc.totale === 0"
             class="text-xs text-green-700 border-t border-green-200 pt-2">✓ Nessuna NC aperta</p>
          <p x-show="pannelloNc === null" class="text-xs text-slate-400 border-t border-slate-200 pt-2">
            Dati non disponibili
          </p>
          <p class="text-xs text-slate-400 mt-2 text-right">→ Apri modulo</p>
        </button>

        <!-- ── PANNELLO EVENTI INCIDENTALI ─────────────────────── -->
        <button type="button" @click="navigaA('eventi-incidentali')"
                :class="classeCardEventi()"
                class="border rounded-2xl px-5 py-4 text-left transition-all
                       hover:shadow-md focus:outline-none focus:ring-2 focus:ring-blue-400
                       active:scale-95">
          <div class="flex items-start justify-between mb-3">
            <div>
              <p class="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                Eventi Incidentali
              </p>
              <div class="text-4xl font-bold mt-1"
                   :class="pannelloEventi && pannelloEventi.totale > 0
                     ? (pannelloEventi.infortuni > 0 ? 'text-red-700' : 'text-amber-700')
                     : 'text-green-700'"
                   x-text="pannelloEventi === null ? '—' : pannelloEventi.totale">
              </div>
              <p class="text-xs text-slate-500 mt-0.5">aperti</p>
            </div>
            <span class="text-3xl" aria-hidden="true">🚨</span>
          </div>
          <!-- Dettaglio -->
          <div x-show="pannelloEventi && pannelloEventi.totale > 0"
               class="space-y-1 border-t border-black/10 pt-2">
            <p x-show="pannelloEventi && pannelloEventi.infortuni > 0"
               class="text-xs text-red-800 flex items-center gap-1">
              <span>🔴</span>
              <span x-text="(pannelloEventi?.infortuni ?? 0) + ' infortun' + ((pannelloEventi?.infortuni ?? 0) === 1 ? 'io' : 'i')"></span>
            </p>
            <p x-show="pannelloEventi && pannelloEventi.nearMiss > 0"
               class="text-xs text-amber-700 flex items-center gap-1">
              <span>🟡</span>
              <span x-text="(pannelloEventi?.nearMiss ?? 0) + ' near-miss'"></span>
            </p>
          </div>
          <p x-show="pannelloEventi && pannelloEventi.totale === 0"
             class="text-xs text-green-700 border-t border-green-200 pt-2">✓ Nessun evento aperto</p>
          <p x-show="pannelloEventi === null" class="text-xs text-slate-400 border-t border-slate-200 pt-2">
            Dati non disponibili
          </p>
          <p class="text-xs text-slate-400 mt-2 text-right">→ Apri modulo</p>
        </button>

        <!-- ── PANNELLO ODS IN SOSPESO ─────────────────────────── -->
        <button type="button" @click="navigaA('ods')"
                :class="classeCardOds()"
                class="border rounded-2xl px-5 py-4 text-left transition-all
                       hover:shadow-md focus:outline-none focus:ring-2 focus:ring-blue-400
                       active:scale-95">
          <div class="flex items-start justify-between mb-3">
            <div>
              <p class="text-xs font-semibold text-slate-500 uppercase tracking-wide">ODS in sospeso</p>
              <div class="text-4xl font-bold mt-1"
                   :class="odsTotale > 0 ? 'text-amber-700' : odsTotale === 0 ? 'text-green-700' : 'text-slate-400'"
                   x-text="odsTotale === null ? '—' : odsTotale">
              </div>
              <p class="text-xs text-slate-500 mt-0.5">in attesa di risposta</p>
            </div>
            <span class="text-3xl" aria-hidden="true">📋</span>
          </div>
          <!-- Dettaglio -->
          <div x-show="pannelloOds !== null" class="space-y-1 border-t border-black/10 pt-2">
            <p x-show="pannelloOds && pannelloOds.riscontri > 0"
               class="text-xs text-amber-700 flex items-center gap-1">
              <span>↩</span>
              <span x-text="(pannelloOds?.riscontri ?? 0) + ' riscontr' + ((pannelloOds?.riscontri ?? 0) === 1 ? 'o atteso' : 'i attesi')"></span>
            </p>
            <p x-show="pannelloOds && pannelloOds.adempimenti > 0"
               class="text-xs text-amber-700 flex items-center gap-1">
              <span>⚡</span>
              <span x-text="(pannelloOds?.adempimenti ?? 0) + ' adempiment' + ((pannelloOds?.adempimenti ?? 0) === 1 ? 'o pendente' : 'i pendenti')"></span>
            </p>
            <p x-show="pannelloOds && pannelloOds.riscontri === 0 && pannelloOds.adempimenti === 0"
               class="text-xs text-green-700">✓ Nessun ODS in sospeso</p>
          </div>
          <p x-show="pannelloOds === null" class="text-xs text-slate-400 border-t border-slate-200 pt-2">
            Dati non disponibili
          </p>
          <p class="text-xs text-slate-400 mt-2 text-right">→ Apri modulo</p>
        </button>

        <!-- ── PANNELLO PSC ────────────────────────────────────── -->
        <button type="button" @click="navigaA('registro-psc')"
                :class="classeCardPsc()"
                class="border rounded-2xl px-5 py-4 text-left transition-all
                       hover:shadow-md focus:outline-none focus:ring-2 focus:ring-blue-400
                       active:scale-95">
          <div class="flex items-start justify-between mb-3">
            <div>
              <p class="text-xs font-semibold text-slate-500 uppercase tracking-wide">Registro PSC</p>
              <div class="text-4xl font-bold mt-1 text-slate-700"
                   x-text="pannelloPsc === null ? '—' : pannelloPsc.nDoc">
              </div>
              <p class="text-xs text-slate-500 mt-0.5">documenti nel corpus</p>
            </div>
            <span class="text-3xl" aria-hidden="true">📄</span>
          </div>
          <!-- Stato corpus -->
          <div x-show="pannelloPsc !== null" class="border-t border-black/10 pt-2">
            <p x-show="pannelloPsc && pannelloPsc.nDoc === 0"
               class="text-xs text-amber-800 font-medium flex items-center gap-1">
              <span aria-hidden="true">⚠</span> Corpus PSC da caricare
            </p>
            <p x-show="pannelloPsc && pannelloPsc.nDoc > 0"
               class="text-xs text-slate-500">
              Corpus popolato
            </p>
          </div>
          <p x-show="pannelloPsc === null" class="text-xs text-slate-400 border-t border-slate-200 pt-2">
            Dati non disponibili
          </p>
          <p class="text-xs text-slate-400 mt-2 text-right">→ Apri modulo</p>
        </button>

      </div><!-- /grid pannelli principali -->

      <!-- ═══════════════════════════════════════════════════════════
           DIARIO CSE — ultime voci del mese corrente (se presenti)
           ═══════════════════════════════════════════════════════════ -->
      <div x-show="pannelloDiario && pannelloDiario.voci.length > 0"
           class="border border-slate-200 bg-white rounded-2xl px-5 py-4 mb-4">
        <div class="flex items-center justify-between mb-3">
          <p class="text-xs font-semibold text-slate-500 uppercase tracking-wide">
            📓 Diario CSE — mese corrente
          </p>
          <button type="button" @click="navigaA('diario-cse')"
                  class="text-xs text-blue-600 hover:underline
                         focus:outline-none focus:ring-2 focus:ring-blue-400 rounded">
            Apri →
          </button>
        </div>
        <div role="list" class="space-y-2">
          <template x-for="(voce, idx) in (pannelloDiario?.voci ?? [])" :key="idx">
            <div role="listitem" class="flex items-start gap-3 text-xs">
              <span class="text-slate-400 flex-shrink-0 font-mono"
                    x-text="formatDataVoce(voce)"></span>
              <span class="text-slate-700 leading-snug line-clamp-1"
                    x-text="voce.titolo || '(senza titolo)'"></span>
            </div>
          </template>
        </div>
      </div>

      <!-- ═══════════════════════════════════════════════════════════
           LINK RAPIDI — alle altre due viste riassuntive
           ═══════════════════════════════════════════════════════════ -->
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
        <button type="button" @click="navigaA('cruscotto-scadenze')"
                class="border border-slate-200 bg-slate-50 hover:bg-slate-100 rounded-xl
                       px-4 py-3 text-left transition-all
                       focus:outline-none focus:ring-2 focus:ring-blue-400">
          <p class="text-sm font-medium text-slate-700">📊 Cruscotto Scadenze</p>
          <p class="text-xs text-slate-400 mt-0.5">Cosa scade quando — scadenze anagrafica</p>
        </button>
        <button type="button" @click="navigaA('conformita-documenti')"
                class="border border-slate-200 bg-slate-50 hover:bg-slate-100 rounded-xl
                       px-4 py-3 text-left transition-all
                       focus:outline-none focus:ring-2 focus:ring-blue-400">
          <p class="text-sm font-medium text-slate-700">📋 Conformità Documenti</p>
          <p class="text-xs text-slate-400 mt-0.5">Chi manca di cosa — completezza imprese</p>
        </button>
      </div>

      <!-- ═══════════════════════════════════════════════════════════
           SLOT AI FUTURO (M26) — predisposto, non implementato
           Solo un placeholder che sparirà quando M26 sarà attivo.
           ═══════════════════════════════════════════════════════════ -->
      <section aria-label="Segnalazioni AI"
               class="border border-dashed border-slate-200 rounded-xl px-4 py-3">
        <p class="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1.5">
          🤖 Segnalazioni AI (M26)
        </p>
        <p class="text-xs text-slate-400 italic"
           x-text="typeof OLLAMA_BRIDGE !== 'undefined'
             ? 'Assistente disponibile — segnalazioni non ancora implementate.'
             : 'Assistente non disponibile (M26 non attivo).'">
        </p>
      </section>

    </div><!-- /!caricamento -->
  </div><!-- /$store.cantiere.id -->

</div>
`;

// ── Registrazione ─────────────────────────────────────────────────────────────

window.MODULI_REGISTRATI = window.MODULI_REGISTRATI ?? {};
window.MODULI_REGISTRATI['cruscotto'] = {
  monta(contenitore) { contenitore.innerHTML = _TEMPLATE_CRUSCOTTO_OPERATIVO; },
};
