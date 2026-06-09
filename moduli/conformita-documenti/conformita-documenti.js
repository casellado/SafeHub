/**
 * conformita-documenti.js — Vista conformità documentale imprese.
 *
 * Risponde a "chi manca di cosa": lente di completezza documentale.
 * Distinta da:
 *   - cruscotto-scadenze: "cosa scade quando" (scadenze temporali anagrafica)
 *   - cruscotto home:     "cosa devo fare oggi" (operativo: NC/eventi/ODS)
 *
 * Sola lettura — zero I/O su file.
 * Usa ANAGRAFICA_SERVICE.calcolaConformita() e i dati già in memoria.
 * Nessuna logica di calcolo aggiuntiva: solo aggregazione e presentazione.
 */

'use strict';

// ── Vocabolari locali ─────────────────────────────────────────────────────────

const _CF_TIPO_RAPPORTO = {
  APPALTO:        'Appalto',
  SUBAPPALTO:     'Subappalto',
  NOLO_CALDO:     'Nolo a caldo',
  NOLO_FREDDO:    'Nolo a freddo',
  FORNITURA:      'Fornitura mera',
  FORNITURA_POSA: 'Fornitura con posa',
  SERVIZIO:       'Servizio',
  LAV_AUTONOMO:   'Lavoratore autonomo',
};

const _CF_MOTIVO = {
  mancante:               'mancante',
  scaduto:                'scaduto',
  in_scadenza:            'in scadenza',
  condizionato_mancante:  'da verificare',
  non_inserita:           'non inserita',
  in_attesa:              'in attesa (richiesta)',
  punteggio_insufficiente:'punteggio < 15',
};

// Ordine di priorità per il sort delle righe
const _CF_ORDER_STATO = { rosso: 0, giallo: 1, verde: 2, grigio: 3 };

// ── Funzioni helper (scope modulo) ─────────────────────────────────────────────

/** Converte un valore di motivo in etichetta leggibile. */
function _cfLabelMotivo(motivo) {
  if (!motivo) return '';
  if (motivo.startsWith('stato_')) return `stato: ${motivo.slice(6)}`;
  return _CF_MOTIVO[motivo] ?? motivo.replace(/_/g, ' ');
}

/**
 * Costruisce e ordina le righe della vista da ANAGRAFICA_SERVICE.dati.
 * Zero I/O: legge solo da dati già in memoria.
 * Ritorna [{ impresa, stato, critico, problemi }] ordinate per gravità.
 */
function _cfAggrega() {
  const dati = ANAGRAFICA_SERVICE.dati;
  if (!dati) return [];

  const righe = (dati.imprese ?? [])
    .filter(i => !i._cestino)
    .map(imp => {
      const conf = ANAGRAFICA_SERVICE.calcolaConformita(imp);
      return { impresa: imp, stato: conf.stato, critico: conf.critico, problemi: conf.problemi };
    });

  // Prima le critiche (rosso_critico), poi per stato, poi alfabetico
  righe.sort((a, b) => {
    if (a.critico !== b.critico) return a.critico ? -1 : 1;
    const oa = _CF_ORDER_STATO[a.stato] ?? 4;
    const ob = _CF_ORDER_STATO[b.stato] ?? 4;
    if (oa !== ob) return oa - ob;
    return (a.impresa.ragioneSociale ?? '').localeCompare(b.impresa.ragioneSociale ?? '', 'it');
  });

  return righe;
}

// ── Helper export DOCX — conformità per singola impresa ──────────────────────

/** Intestazione standard per il documento conformità-impresa. */
function _intestazioneConformita() {
  const m   = IMPOSTAZIONI_SERVICE.modulo('conformita-documenti');
  const bad = new Set(['conformita-documenti', '']);
  const _ok = (v, def) => (!v || bad.has(v)) ? def : v;
  return {
    modulo_titolo:   _ok(m.titolo,   'Comunicazione conformità documentale'),
    modulo_codice:   _ok(m.codice,   ''),
    modulo_versione: _ok(m.versione, ''),
    logo_aziendale:  IMPOSTAZIONI_SERVICE.logo()?.png_base64 ?? null,
  };
}

/** Download DOCX con link temporaneo (pattern identico a PSC/scadenze). */
function _scaricaBlobConformita(blob, nome) {
  const url = URL.createObjectURL(blob);
  const a   = document.createElement('a');
  a.href = url; a.download = nome; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

/**
 * Genera il corpo HTML per la comunicazione conformità di una singola impresa.
 * Riusa ANAGRAFICA_SERVICE.calcolaConformita() — non ricalcola nulla.
 * Pattern identico a generaCorpoHtmlScadenzeImpresa: p[], join, firma CSE.
 * _cfLabelMotivo e _CF_TIPO_RAPPORTO: già in scope di modulo.
 * @param {string} impresaId
 * @returns {Promise<string>}
 */
async function generaCorpoHtmlConformitaImpresa(impresaId) {
  const esc   = (s) => UTILS.escapeHtml(s ?? '');
  const lotto = ANAGRAFICA_SERVICE.dati?.lotto ?? {};
  const p     = [];

  const imp = (ANAGRAFICA_SERVICE.dati?.imprese ?? []).find(i => i.id === impresaId);
  if (!imp) {
    p.push(`<p><em>Impresa non trovata.</em></p>`);
    return p.join('\n');
  }

  const conf   = ANAGRAFICA_SERVICE.calcolaConformita(imp);
  const cse    = IMPOSTAZIONI_SERVICE.cse();
  const firm   = IMPOSTAZIONI_SERVICE.firma();
  const cseImg = await _scalafirma(firm?.firma_png_base64 ?? null);

  // ── 1. Intestazione documento ────────────────────────────────────────────
  const codCant     = esc(Alpine.store('cantiere')?.id ?? lotto.id ?? '');
  const nomeCant    = esc(lotto.nome ?? '');
  const impresaNome = esc(imp.ragioneSociale?.trim() || imp.id);
  const tipoRapp    = esc(_CF_TIPO_RAPPORTO[imp.tipoRapporto] ?? (imp.tipoRapporto ?? '—'));

  p.push(`<p data-line="exact280"><strong>Cantiere:</strong> ${codCant}${nomeCant ? ' — ' + nomeCant : ''}</p>`);
  if (lotto.committente) p.push(`<p data-line="exact280"><strong>Committente:</strong> ${esc(lotto.committente)}</p>`);
  p.push(`<p data-line="exact280"><strong>Impresa:</strong> ${impresaNome}</p>`);
  p.push(`<p data-line="exact280"><strong>Tipo di rapporto:</strong> ${tipoRapp}</p>`);
  p.push(`<p data-line="exact280"><strong>Data:</strong> ${esc(UTILS.formatData(new Date().toISOString()))}</p>`);
  p.push(`<p data-after="200">&nbsp;</p>`);

  p.push(`<h2>Comunicazione conformità documentale</h2>`);

  // ── 2. Corpo: in regola o tabella problemi ───────────────────────────────
  if (conf.problemi.length === 0) {
    p.push(`<p>La verifica dei documenti dell'impresa non ha rilevato criticità. ` +
           `I documenti risultano conformi al tipo di rapporto contrattuale.</p>`);
  } else {
    p.push(`<p>Si evidenziano le seguenti non conformità documentali. ` +
           `Si richiede di provvedere al completamento/aggiornamento della documentazione ` +
           `e di trasmettere i documenti aggiornati al CSE.</p>`);
    p.push(`<p data-after="120">&nbsp;</p>`);

    p.push(`<h3>Criticità rilevate</h3>`);
    p.push(`<table>`);
    p.push(`<thead><tr>` +
           `<th>Documento</th>` +
           `<th>Motivo</th>` +
           `<th>Priorità</th>` +
           `<th>Giorni</th>` +
           `</tr></thead>`);
    p.push(`<tbody>`);

    // Ordine: rosso_critico → rosso → giallo
    const ORD = { rosso_critico: 0, rosso: 1, giallo: 2 };
    const ordinati = [...conf.problemi].sort((a, b) => (ORD[a.livello] ?? 3) - (ORD[b.livello] ?? 3));

    for (const pr of ordinati) {
      const motivoStr  = _cfLabelMotivo(pr.motivo);
      const livelloStr = pr.livello === 'rosso_critico' ? '⛔ CRITICO'
                       : pr.livello === 'rosso'         ? 'Obbligatorio'
                       :                                  'Da verificare';
      const giorniStr  = pr.giorni == null        ? '—'
                       : pr.giorni < 0             ? `${Math.abs(pr.giorni)} gg fa`
                       :                             `tra ${pr.giorni} gg`;
      p.push(`<tr>` +
             `<td>${esc(pr.label || pr.tipo)}</td>` +
             `<td>${esc(motivoStr)}</td>` +
             `<td>${esc(livelloStr)}</td>` +
             `<td>${giorniStr}</td>` +
             `</tr>`);
    }

    p.push(`</tbody></table>`);
    p.push(`<p data-after="120">&nbsp;</p>`);
    p.push(`<p>Si richiede di regolarizzare i documenti indicati e di trasmetterli al CSE ` +
           `nei termini previsti dal Piano di Sicurezza e Coordinamento e dai vigenti contratti.</p>`);
  }

  // ── 3. Firma CSE in calce (pattern identico a PSC/scadenze) ─────────────
  const pr      = 'data-align="center" style="padding-left:52%;text-align:center"';
  const cseNome = esc(cse?.nome_cognome ?? '');
  p.push(`<p data-before="300">&nbsp;</p>`);
  p.push(`<p ${pr}>Il Coordinatore per l'Esecuzione</p>`);
  if (cseNome) p.push(`<p ${pr}>${cseNome}</p>`);
  if (cseImg)  p.push(`<p ${pr}><img src="${cseImg}" alt="firma CSE"></p>`);
  p.push(`<p ${pr}>${esc(UTILS.formatData(new Date().toISOString()))}</p>`);

  return p.join('\n');
}

// ── Componente Alpine ─────────────────────────────────────────────────────────

function ConformitaDocumenti() {
  return {

    righe:        [],
    caricamento:  true,
    filtroStato:  '',        // '' | 'rosso' | 'giallo' | 'verde' | 'grigio'
    _cantiereId:  null,

    // Export DOCX per singola impresa
    impresaExportId: '',
    exportando:      false,

    // ── Computed ──────────────────────────────────────────────────────────────

    get righeFiltrate() {
      if (!this.filtroStato) return this.righe;
      return this.righe.filter(r => r.stato === this.filtroStato);
    },

    get contatori() {
      return {
        rosso:   this.righe.filter(r => r.stato === 'rosso').length,
        giallo:  this.righe.filter(r => r.stato === 'giallo').length,
        verde:   this.righe.filter(r => r.stato === 'verde').length,
        grigio:  this.righe.filter(r => r.stato === 'grigio').length,
        critici: this.righe.filter(r => r.critico).length,
      };
    },

    // ── Lifecycle ─────────────────────────────────────────────────────────────

    init() {
      this._cantiereId = Alpine.store('cantiere')?.id;
      if (ANAGRAFICA_SERVICE.isCaricato && ANAGRAFICA_SERVICE.cantiereId === this._cantiereId) {
        this._calcolaRighe();
      } else {
        this.caricamento = !!this._cantiereId;
        document.addEventListener('anagrafica-caricata', () => this._calcolaRighe(), { once: true });
      }
    },

    aggiornaSeCantiereRicambia() {
      const id = Alpine.store('cantiere')?.id;
      if (id === this._cantiereId) return;
      this._cantiereId = id;
      this.filtroStato  = '';
      this.righe        = [];
      if (!id) { this.caricamento = false; return; }
      this.caricamento = true;
      if (ANAGRAFICA_SERVICE.isCaricato && ANAGRAFICA_SERVICE.cantiereId === id) {
        this._calcolaRighe();
      } else {
        document.addEventListener('anagrafica-caricata', (e) => {
          if (e.detail?.cantiereId === id) this._calcolaRighe();
        }, { once: true });
      }
    },

    _calcolaRighe() {
      this.righe       = _cfAggrega();
      this.caricamento = false;
    },

    // ── Helper UI ─────────────────────────────────────────────────────────────

    labelTipoRapporto(tipo) {
      return _CF_TIPO_RAPPORTO[tipo] ?? (tipo ?? '—');
    },

    labelMotivo: _cfLabelMotivo,

    labelGiorni(livello, giorni) {
      if (giorni == null) return '';
      if (giorni < 0) return `(${Math.abs(giorni)} gg fa)`;
      return `(tra ${giorni} gg)`;
    },

    async esportaConformitaImpresa(impresaId) {
      if (!impresaId || this.exportando) return;
      this.impresaExportId = impresaId;
      this.exportando      = true;
      try {
        const corpo = await generaCorpoHtmlConformitaImpresa(impresaId);
        const out   = await MOTORE_DOCX.generaDocumento({
          tipo:       'conformita-documenti',
          header:     _intestazioneConformita(),
          corpo_html: corpo,
          formati:    { docx: true },
        });
        const imp      = (ANAGRAFICA_SERVICE.dati?.imprese ?? []).find(i => i.id === impresaId);
        const nomeSlug = (imp?.ragioneSociale ?? impresaId)
          .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
        _scaricaBlobConformita(out.docxBlob, `conformita-${this._cantiereId}-${nomeSlug}.docx`);
        NOTIFICHE.successo('Esportato', `DOCX conformità scaricato per ${imp?.ragioneSociale ?? impresaId}.`);
      } catch (err) {
        ERRORI.gestisciErrore('conformita-documenti/esporta-impresa', err);
      } finally {
        this.exportando      = false;
        this.impresaExportId = '';
      }
    },

    classeCard(stato, critico) {
      if (stato === 'rosso' && critico) return 'border-red-300 bg-red-100 hover:bg-red-200';
      if (stato === 'rosso')            return 'border-red-200 bg-red-50 hover:bg-red-100';
      if (stato === 'giallo')           return 'border-amber-200 bg-amber-50 hover:bg-amber-100';
      if (stato === 'verde')            return 'border-green-200 bg-green-50 hover:bg-green-100';
      return 'border-slate-200 bg-slate-50 hover:bg-slate-100';
    },

    classeBadgeStato(stato) {
      if (stato === 'rosso')  return 'bg-red-200 text-red-900';
      if (stato === 'giallo') return 'bg-amber-200 text-amber-900';
      if (stato === 'verde')  return 'bg-green-200 text-green-900';
      return 'bg-slate-200 text-slate-700';
    },

    iconaStato(stato, critico) {
      if (stato === 'rosso' && critico) return '🔴';
      if (stato === 'rosso')            return '🔴';
      if (stato === 'giallo')           return '🟡';
      if (stato === 'verde')            return '🟢';
      return '⬜';
    },

    classeBadgeProblema(livello) {
      if (livello === 'rosso_critico') return 'bg-red-200 text-red-900 font-semibold';
      if (livello === 'rosso')         return 'bg-red-100 text-red-800';
      return 'bg-amber-100 text-amber-800';
    },

    classeFiltro(stato) {
      const base = 'px-3 py-1 rounded-full text-xs font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-offset-1';
      if (this.filtroStato === stato) {
        if (stato === 'rosso')  return base + ' bg-red-600 text-white focus:ring-red-400';
        if (stato === 'giallo') return base + ' bg-amber-500 text-white focus:ring-amber-400';
        if (stato === 'verde')  return base + ' bg-green-600 text-white focus:ring-green-400';
        if (stato === 'grigio') return base + ' bg-slate-600 text-white focus:ring-slate-400';
        return base + ' bg-slate-800 text-white focus:ring-slate-400';
      }
      return base + ' bg-white border border-slate-300 text-slate-600 hover:bg-slate-50 focus:ring-slate-400';
    },
  };
}

// ── Template HTML ─────────────────────────────────────────────────────────────

const _TEMPLATE_CONFORMITA = `
<div x-data="ConformitaDocumenti()" x-init="init()" x-effect="aggiornaSeCantiereRicambia()"
     class="max-w-4xl">

  <!-- === HEADER === -->
  <div class="mb-5">
    <h1 class="text-xl font-semibold text-slate-800">📋 Conformità Documenti</h1>
    <p class="text-xs text-slate-400 mt-0.5">
      Chi manca di cosa — completezza documentale delle imprese per questo cantiere
    </p>
  </div>

  <!-- Nessun cantiere -->
  <div x-show="!$store.cantiere.id" class="placeholder-modulo">
    <div class="text-3xl" aria-hidden="true">📋</div>
    <p class="text-slate-500">Seleziona un cantiere per vedere la conformità documentale.</p>
  </div>

  <div x-show="$store.cantiere.id">

    <!-- Spinner -->
    <div x-show="caricamento" class="flex items-center gap-3 py-10 text-slate-400 text-sm">
      <div class="w-5 h-5 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"
           role="status" aria-label="Caricamento"></div>
      Calcolo conformità in corso…
    </div>

    <div x-show="!caricamento">

      <!-- Nessuna impresa -->
      <div x-show="righe.length === 0" class="py-14 text-center text-slate-400">
        <div class="text-3xl mb-2" aria-hidden="true">🏢</div>
        <p class="text-sm">Nessuna impresa in anagrafica per questo cantiere.</p>
        <p class="text-xs mt-1">
          Aggiungi le imprese in
          <button @click="navigaA('imprese')"
                  class="text-blue-600 hover:underline focus:outline-none focus:ring-2 focus:ring-blue-400 rounded">
            Anagrafiche → Imprese
          </button>.
        </p>
      </div>

      <div x-show="righe.length > 0">

        <!-- === RIEPILOGO CONTATORI === -->
        <div class="grid grid-cols-2 sm:grid-cols-5 gap-2 mb-5">

          <div class="border border-red-200 bg-red-50 rounded-xl p-3 text-center">
            <div class="text-2xl font-bold text-red-700" x-text="contatori.rosso"></div>
            <div class="text-xs text-red-600 mt-0.5">🔴 Non conformi</div>
          </div>

          <div class="border border-amber-200 bg-amber-50 rounded-xl p-3 text-center">
            <div class="text-2xl font-bold text-amber-700" x-text="contatori.giallo"></div>
            <div class="text-xs text-amber-600 mt-0.5">🟡 Da verificare</div>
          </div>

          <div class="border border-green-200 bg-green-50 rounded-xl p-3 text-center">
            <div class="text-2xl font-bold text-green-700" x-text="contatori.verde"></div>
            <div class="text-xs text-green-600 mt-0.5">🟢 In regola</div>
          </div>

          <div class="border border-slate-200 bg-slate-50 rounded-xl p-3 text-center">
            <div class="text-2xl font-bold text-slate-500" x-text="contatori.grigio"></div>
            <div class="text-xs text-slate-400 mt-0.5">⬜ Senza tipo</div>
          </div>

          <div x-show="contatori.critici > 0"
               class="border border-red-300 bg-red-100 rounded-xl p-3 text-center sm:col-span-1 col-span-2">
            <div class="text-2xl font-bold text-red-900" x-text="contatori.critici"></div>
            <div class="text-xs text-red-800 mt-0.5">⛔ Critiche</div>
          </div>

        </div>

        <!-- === FILTRO STATO === -->
        <div class="flex flex-wrap gap-2 mb-4" role="group" aria-label="Filtra per stato">
          <button @click="filtroStato = ''" :class="classeFiltro('')">
            Tutte (<span x-text="righe.length"></span>)
          </button>
          <button x-show="contatori.rosso > 0"
                  @click="filtroStato = filtroStato === 'rosso' ? '' : 'rosso'"
                  :class="classeFiltro('rosso')">
            🔴 Non conformi (<span x-text="contatori.rosso"></span>)
          </button>
          <button x-show="contatori.giallo > 0"
                  @click="filtroStato = filtroStato === 'giallo' ? '' : 'giallo'"
                  :class="classeFiltro('giallo')">
            🟡 Da verificare (<span x-text="contatori.giallo"></span>)
          </button>
          <button x-show="contatori.verde > 0"
                  @click="filtroStato = filtroStato === 'verde' ? '' : 'verde'"
                  :class="classeFiltro('verde')">
            🟢 In regola (<span x-text="contatori.verde"></span>)
          </button>
          <button x-show="contatori.grigio > 0"
                  @click="filtroStato = filtroStato === 'grigio' ? '' : 'grigio'"
                  :class="classeFiltro('grigio')">
            ⬜ Senza tipo (<span x-text="contatori.grigio"></span>)
          </button>
        </div>

        <!-- Zero risultati filtrati -->
        <div x-show="righeFiltrate.length === 0 && filtroStato"
             class="py-8 text-center text-slate-400 text-sm">
          Nessuna impresa corrisponde al filtro selezionato.
        </div>

        <!-- === LISTA IMPRESE === -->
        <div role="list" aria-label="Conformità imprese" class="space-y-2">
          <template x-for="riga in righeFiltrate" :key="riga.impresa.id">

            <article role="listitem"
                     @click="navigaA('imprese')"
                     :class="classeCard(riga.stato, riga.critico)"
                     class="border rounded-xl px-4 py-3 cursor-pointer transition-all"
                     :title="'Apri Imprese per ' + (riga.impresa.ragioneSociale ?? '')">

              <!-- Riga 1: icona stato + nome + tipo rapporto + badge critico -->
              <div class="flex items-center gap-2 flex-wrap mb-1">

                <span class="text-xl flex-shrink-0 select-none" aria-hidden="true"
                      x-text="iconaStato(riga.stato, riga.critico)"></span>

                <span class="font-semibold text-slate-800 text-sm"
                      x-text="riga.impresa.ragioneSociale || '(senza nome)'"></span>

                <span x-show="riga.impresa.tipoRapporto"
                      class="text-xs bg-white border border-slate-200 text-slate-600
                             px-2 py-0.5 rounded-full flex-shrink-0"
                      x-text="labelTipoRapporto(riga.impresa.tipoRapporto)"></span>

                <span x-show="riga.critico"
                      class="text-xs bg-red-700 text-white px-2 py-0.5 rounded-full
                             flex-shrink-0 font-semibold">
                  ⛔ CRITICO
                </span>

                <!-- Export DOCX per questa impresa -->
                <button @click.stop="esportaConformitaImpresa(riga.impresa.id)"
                        :disabled="exportando"
                        type="button"
                        class="ml-auto flex items-center gap-1 text-xs px-2 py-1 rounded-lg border
                               border-slate-200 bg-white text-slate-500 hover:text-slate-800
                               hover:border-slate-300 transition-colors flex-shrink-0
                               focus:outline-none focus:ring-2 focus:ring-slate-400
                               disabled:opacity-50 disabled:cursor-not-allowed"
                        title="Esporta DOCX conformità per questa impresa">
                  <span x-show="!(exportando && impresaExportId === riga.impresa.id)"
                        aria-hidden="true">📋</span>
                  <span x-show="exportando && impresaExportId === riga.impresa.id"
                        class="w-3 h-3 border-2 border-slate-500 border-t-transparent
                               rounded-full animate-spin" aria-hidden="true"></span>
                </button>

                <!-- Link di navigazione (lato destro) -->
                <span class="text-slate-300 text-sm select-none" aria-hidden="true">›</span>
              </div>

              <!-- Verde: tutto a posto, messaggio positivo -->
              <p x-show="riga.stato === 'verde'"
                 class="text-xs text-green-700 mt-0.5">
                ✓ Documenti in regola secondo il tipo di rapporto
              </p>

              <!-- Grigio: tipo rapporto non impostato -->
              <p x-show="riga.stato === 'grigio'"
                 class="text-xs text-slate-400 mt-0.5">
                Tipo di rapporto non impostato — nessun controllo applicabile.
                Imposta il tipo in Anagrafiche → Imprese.
              </p>

              <!-- Rosso / Giallo: elenco problemi -->
              <ul x-show="riga.problemi && riga.problemi.length > 0"
                  class="mt-2 space-y-1" role="list" aria-label="Problemi conformità">
                <template x-for="(p, idx) in riga.problemi" :key="idx">
                  <li class="flex items-center gap-2 flex-wrap text-xs">

                    <!-- Badge livello problema -->
                    <span :class="classeBadgeProblema(p.livello)"
                          class="px-1.5 py-0.5 rounded text-xs flex-shrink-0"
                          x-text="p.livello === 'rosso_critico' ? '⛔ CRITICO' : p.livello === 'rosso' ? '🔴' : '🟡'">
                    </span>

                    <!-- Label documento -->
                    <span class="text-slate-700 font-medium" x-text="p.label || p.tipo"></span>

                    <!-- Motivo -->
                    <span class="text-slate-500"
                          x-text="'— ' + labelMotivo(p.motivo)"></span>

                    <!-- Giorni rimanenti/trascorsi -->
                    <span x-show="p.giorni != null"
                          class="font-mono text-slate-500"
                          x-text="labelGiorni(p.livello, p.giorni)"></span>

                  </li>
                </template>
              </ul>

            </article>
          </template>
        </div>

        <!-- Nota esplicativa in calce -->
        <p class="mt-5 text-xs text-slate-400">
          La conformità è calcolata sui documenti presenti in anagrafica per il tipo di rapporto
          dell'impresa. Per aggiornare, vai in
          <button @click="navigaA('imprese')"
                  class="text-blue-600 hover:underline focus:outline-none focus:ring-2 focus:ring-blue-400 rounded">
            Anagrafiche → Imprese
          </button>.
          Questa vista si aggiorna al cambio cantiere o reload dell'anagrafica.
        </p>

      </div><!-- /righe.length > 0 -->
    </div><!-- /!caricamento -->
  </div><!-- /$store.cantiere.id -->

</div>
`;

// ── Registrazione ─────────────────────────────────────────────────────────────

window.MODULI_REGISTRATI = window.MODULI_REGISTRATI ?? {};
window.MODULI_REGISTRATI['conformita-documenti'] = {
  monta(contenitore) { contenitore.innerHTML = _TEMPLATE_CONFORMITA; },
};
