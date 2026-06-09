/**
 * cruscotto-scadenze.js — M4 Fase 6: Vista aggregata delle scadenze del cantiere.
 *
 * LIVELLO A: aggrega i dati già in memoria (ANAGRAFICA_SERVICE._dati) tramite
 * le funzioni calcolaScadenze/calcolaConformita già testate nelle Fasi 1-5.
 * Zero nuova logica di calcolo. Zero letture aggiuntive.
 *
 * Ordine di priorità: no-date (patente crediti) → scadute → in-scadenza;
 * secundario: critica > alta > normale; terziario: giorni ascending.
 *
 * LIVELLO B (multi-cantiere / M25): rimandato a dopo Fase 7 quando ci sono
 * cantieri reali popolati su cui testarlo.
 *
 * Export DOCX: bottone "Esporta scadenze per impresa" → MOTORE_DOCX via
 * generaCorpoHtmlScadenzeImpresa() + ANAGRAFICA_SERVICE.calcolaScadenzePerImpresa().
 */

// ── Helper export DOCX — scadenze per singola impresa ────────────────────────

/** Intestazione standard per il documento scadenze-impresa. */
function _intestazioneScadenze() {
  const m   = IMPOSTAZIONI_SERVICE.modulo('scadenze-impresa');
  const bad = new Set(['scadenze-impresa', '']);
  const _ok = (v, def) => (!v || bad.has(v)) ? def : v;
  return {
    modulo_titolo:   _ok(m.titolo,   'Comunicazione scadenze documentali'),
    modulo_codice:   _ok(m.codice,   ''),
    modulo_versione: _ok(m.versione, ''),
    logo_aziendale:  IMPOSTAZIONI_SERVICE.logo()?.png_base64 ?? null,
  };
}

/** Download DOCX con link temporaneo (pattern identico a PSC/Diario). */
function _scaricaBlobScadenze(blob, nome) {
  const url = URL.createObjectURL(blob);
  const a   = document.createElement('a');
  a.href = url; a.download = nome; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

/**
 * Genera il corpo HTML per la comunicazione scadenze di una singola impresa.
 * Pattern identico a generaCorpoHtmlCorpusPsc: funzione asincrona pura,
 * array di parti p[], join finale. _scalafirma da flusso-b-helpers.js (globale).
 * @param {string} impresaId
 * @param {string} cantiereId
 * @returns {Promise<string>}
 */
async function generaCorpoHtmlScadenzeImpresa(impresaId, cantiereId) {
  const esc   = (s) => UTILS.escapeHtml(s ?? '');
  const lotto = ANAGRAFICA_SERVICE.dati?.lotto ?? {};
  const p     = [];

  const result = ANAGRAFICA_SERVICE.calcolaScadenzePerImpresa(impresaId);
  if (!result) {
    p.push(`<p><em>Impresa non trovata.</em></p>`);
    return p.join('\n');
  }

  const cse    = IMPOSTAZIONI_SERVICE.cse();
  const firm   = IMPOSTAZIONI_SERVICE.firma();
  const cseImg = await _scalafirma(firm?.firma_png_base64 ?? null);

  // ── 1. Intestazione documento ────────────────────────────────────────────
  const codCant  = esc(cantiereId || lotto.id || '');
  const nomeCant = esc(lotto.nome ?? '');

  p.push(`<p data-line="exact280"><strong>Cantiere:</strong> ${codCant}${nomeCant ? ' — ' + nomeCant : ''}</p>`);
  if (lotto.committente) p.push(`<p data-line="exact280"><strong>Committente:</strong> ${esc(lotto.committente)}</p>`);
  p.push(`<p data-line="exact280"><strong>Impresa:</strong> ${esc(result.impresaLabel)}</p>`);
  p.push(`<p data-line="exact280"><strong>Data:</strong> ${esc(UTILS.formatData(new Date().toISOString()))}</p>`);
  p.push(`<p data-after="200">&nbsp;</p>`);

  p.push(`<h2>Comunicazione scadenze documentali</h2>`);
  p.push(`<p>Si segnalano le seguenti scadenze documentali scadute o prossime alla scadenza, ` +
         `relative all'impresa e al suo personale/mezzi operanti sul cantiere. ` +
         `Si richiede di provvedere al rinnovo e di trasmettere la relativa documentazione aggiornata.</p>`);
  p.push(`<p data-after="160">&nbsp;</p>`);

  // ── 2. Una sezione per categoria ─────────────────────────────────────────
  let haAlcunaVoce = false;

  for (const sez of result.sezioni) {
    if (sez.voci.length === 0) continue;
    haAlcunaVoce = true;

    p.push(`<h3>${sez.icona} ${esc(sez.label)}</h3>`);
    p.push(`<table>`);
    p.push(`<thead><tr>` +
           `<th>Nominativo / Bene</th>` +
           `<th>Documento / Adempimento</th>` +
           `<th>Scadenza</th>` +
           `<th>Giorni</th>` +
           `<th>Stato</th>` +
           `</tr></thead>`);
    p.push(`<tbody>`);

    // Ordine: no-date → scadute → in-scadenza, poi per urgenza
    const ordinate = [...sez.voci].sort((a, b) => {
      const aNoDate = a.giorni === null, bNoDate = b.giorni === null;
      if (aNoDate !== bNoDate) return aNoDate ? -1 : 1;
      return (a.giorni ?? 0) - (b.giorni ?? 0);
    });

    for (const v of ordinate) {
      const scadStr   = v.scadenza ? esc(UTILS.formatData(v.scadenza + 'T12:00:00Z')) : '—';
      const giorniStr = v.giorni === null          ? '—'
                      : v.giorni < 0               ? `${Math.abs(v.giorni)} gg fa`
                      :                              `tra ${v.giorni} gg`;
      const statoStr  = v.stato === 'scaduto'      ? 'SCADUTO'
                      : v.stato === 'in_scadenza'   ? 'In scadenza'
                      :                              '⛔ Verifica stato';
      p.push(`<tr>` +
             `<td>${esc(v.entitaLabel)}</td>` +
             `<td>${esc(v.label)}</td>` +
             `<td>${scadStr}</td>` +
             `<td>${giorniStr}</td>` +
             `<td>${statoStr}</td>` +
             `</tr>`);
    }

    p.push(`</tbody></table>`);
    p.push(`<p data-after="120">&nbsp;</p>`);
  }

  if (!haAlcunaVoce) {
    p.push(`<p><em>Nessuna scadenza problematica rilevata per questa impresa alla data odierna.</em></p>`);
  }

  // ── 3. Firma CSE in calce (pattern identico a PSC) ───────────────────────
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

function CruscottoScadenze() {
  return {
    entries:          [],
    caricamento:      true,

    // Filtri
    filtroCriticita:  '',      // '' | 'critica' | 'alta' | 'normale'
    filtroTipoEntita: '',      // '' | 'impresa' | 'lavoratore' | 'mezzo' | 'attrezzatura' | 'nolo'
    filtroFinestra:   'tutte', // 'scadute' | '30' | '60' | '90' | 'tutte'
    cercaTesto:       '',

    // Export DOCX per singola impresa
    impresaExportId: '',
    exportando:      false,

    _cantiereId: null,

    // ── Computed ─────────────────────────────────────────────────────────────

    get entriesFiltrate() {
      let res = this.entries;

      if (this.filtroCriticita) {
        res = res.filter(e => e.criticita === this.filtroCriticita);
      }
      if (this.filtroTipoEntita) {
        res = res.filter(e => e.tipo === this.filtroTipoEntita);
      }
      if (this.filtroFinestra === 'scadute') {
        // Null (patente) + già scadute
        res = res.filter(e => e.giorni === null || e.giorni < 0);
      } else if (this.filtroFinestra !== 'tutte') {
        const gg = parseInt(this.filtroFinestra, 10);
        // Null (patente) + entro N giorni
        res = res.filter(e => e.giorni === null || e.giorni < gg);
      }
      if (this.cercaTesto) {
        const t = this.cercaTesto.toLowerCase();
        res = res.filter(e =>
          e.entitaLabel.toLowerCase().includes(t) ||
          e.label.toLowerCase().includes(t)
        );
      }
      return res;
    },

    get contatori() {
      const critScadute    = this.entries.filter(e => e.criticita === 'critica' && (e.giorni === null || e.giorni < 0));
      const critInScadenza = this.entries.filter(e => e.criticita === 'critica' && e.giorni !== null && e.giorni >= 0);
      const altaScaduta    = this.entries.filter(e => e.criticita === 'alta'    && e.giorni !== null && e.giorni < 0);
      return {
        critScadute:    critScadute.length,
        critInScadenza: critInScadenza.length,
        altaScaduta:    altaScaduta.length,
        totale:         this.entries.length,
      };
    },

    // ── Lifecycle ─────────────────────────────────────────────────────────────

    init() {
      this._cantiereId = Alpine.store('cantiere')?.id;
      if (ANAGRAFICA_SERVICE.isCaricato && ANAGRAFICA_SERVICE.cantiereId === this._cantiereId) {
        this.caricaDati();
      } else {
        this.caricamento = !!this._cantiereId;
        document.addEventListener('anagrafica-caricata', () => this.caricaDati(), { once: true });
      }
    },

    aggiornaSeCantiereRicambia() {
      const id = Alpine.store('cantiere')?.id;
      if (id !== this._cantiereId) {
        this._cantiereId = id;
        if (!id) { this.entries = []; this.caricamento = false; return; }
        this.caricamento = true;
        if (ANAGRAFICA_SERVICE.isCaricato && ANAGRAFICA_SERVICE.cantiereId === id) {
          this.caricaDati();
        } else {
          document.addEventListener('anagrafica-caricata', (e) => {
            if (e.detail?.cantiereId === id) this.caricaDati();
          }, { once: true });
        }
      }
    },

    caricaDati() {
      this.entries     = this._aggrega();
      this.caricamento = false;
    },

    aggiorna() {
      this.entries = this._aggrega();
    },

    // ── Aggregazione (funzione pura, zero I/O) ────────────────────────────────

    _aggrega() {
      const dati = ANAGRAFICA_SERVICE.dati;
      if (!dati) return [];

      const entries = [];

      const _add = (scadenze, tipo, entitaLabel, moduloTarget) => {
        for (const s of scadenze) {
          entries.push({
            tipo, entitaLabel,
            label:     s.label,
            motivo:    s.motivo ?? s.stato ?? '',
            scadenza:  s.scadenza,
            giorni:    s.giorni,
            stato:     s.stato,
            criticita: s.criticita,
            moduloTarget,
          });
        }
      };

      // ── IMPRESE ────────────────────────────────────────────────────────────
      for (const imp of (dati.imprese ?? []).filter(i => !i._cestino)) {
        const label = imp.ragioneSociale || imp.id;

        // Patente crediti (conformità permanente, no scadenza temporale)
        const conf = ANAGRAFICA_SERVICE.calcolaConformita(imp);
        for (const p of conf.problemi.filter(pr => pr.tipo === 'patente_crediti' && pr.livello === 'rosso_critico')) {
          entries.push({
            tipo: 'impresa', entitaLabel: label,
            label:     'Patente a crediti',
            motivo:    p.motivo.replace(/_/g, ' '),
            scadenza:  null, giorni: null, stato: null,
            criticita: 'critica',
            moduloTarget: 'imprese',
          });
        }

        // Documenti con scadenza temporale
        _add(ANAGRAFICA_SERVICE.calcolaScadenzeImpresa(imp), 'impresa', label, 'imprese');
      }

      // ── LAVORATORI ─────────────────────────────────────────────────────────
      for (const lav of (dati.lavoratori ?? []).filter(l => !l._cestino)) {
        const label = [lav.cognome, lav.nome].filter(Boolean).join(' ') || lav.id;
        _add(ANAGRAFICA_SERVICE.calcolaScadenzeLavoratore(lav), 'lavoratore', label, 'lavoratori');
      }

      // ── MEZZI ──────────────────────────────────────────────────────────────
      for (const m of (dati.mezzi ?? []).filter(m => !m._cestino)) {
        const label = [m.marca, m.modello].filter(Boolean).join(' ') || m.tipologia || m.id;
        _add(ANAGRAFICA_SERVICE.calcolaScadenzeMezzo(m), 'mezzo', label, 'mezzi-attrezzature');
      }

      // ── ATTREZZATURE ───────────────────────────────────────────────────────
      for (const a of (dati.attrezzature ?? []).filter(a => !a._cestino)) {
        const label = a.descrizione || a.tipologia || a.id;
        _add(ANAGRAFICA_SERVICE.calcolaScadenzeAttrezzatura(a), 'attrezzatura', label, 'mezzi-attrezzature');
      }

      // ── NOLI ───────────────────────────────────────────────────────────────
      for (const n of (dati.noli ?? []).filter(n => !n._cestino)) {
        const label = n.oggetto || n.id;
        _add(ANAGRAFICA_SERVICE.calcolaScadenzeNolo(n), 'nolo', label, 'noli');
      }

      // Ordinamento: no-date → scadute → in-scadenza; poi criticità; poi urgenza; poi label
      const CRIT = { critica: 0, alta: 1, normale: 2 };
      return entries.sort((a, b) => {
        const aNoDate = a.giorni === null, bNoDate = b.giorni === null;
        if (aNoDate !== bNoDate) return aNoDate ? -1 : 1;           // no-date sempre prima
        if (a.giorni < 0 !== b.giorni < 0) return a.giorni < 0 ? -1 : 1; // scadute prima
        if (a.giorni !== b.giorni)          return a.giorni - b.giorni;    // più urgente prima
        if (CRIT[a.criticita] !== CRIT[b.criticita]) return CRIT[a.criticita] - CRIT[b.criticita];
        return a.entitaLabel.localeCompare(b.entitaLabel, 'it');
      });
    },

    // ── Export DOCX per singola impresa ──────────────────────────────────────

    get imprese() {
      return (ANAGRAFICA_SERVICE.dati?.imprese ?? [])
        .filter(i => !i._cestino)
        .sort((a, b) => (a.ragioneSociale ?? '').localeCompare(b.ragioneSociale ?? '', 'it'));
    },

    async esportaScadenzeImpresa() {
      if (!this.impresaExportId || this.exportando) return;
      this.exportando = true;
      try {
        const corpo = await generaCorpoHtmlScadenzeImpresa(this.impresaExportId, this._cantiereId);
        const out   = await MOTORE_DOCX.generaDocumento({
          tipo:       'scadenze-impresa',
          header:     _intestazioneScadenze(),
          corpo_html: corpo,
          formati:    { docx: true },
        });
        const imp      = this.imprese.find(i => i.id === this.impresaExportId);
        const nomeSlug = (imp?.ragioneSociale ?? this.impresaExportId)
          .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
        _scaricaBlobScadenze(out.docxBlob, `scadenze-${this._cantiereId}-${nomeSlug}.docx`);
        NOTIFICHE.successo('Esportato', `DOCX scadenze scaricato per ${imp?.ragioneSociale ?? this.impresaExportId}.`);
      } catch (err) {
        ERRORI.gestisciErrore('cruscotto-scadenze/esporta-impresa', err);
      } finally {
        this.exportando = false;
      }
    },

    // ── Helper UI ─────────────────────────────────────────────────────────────

    tipoIcona(tipo) {
      return { impresa:'🏢', lavoratore:'👷', mezzo:'🚜', attrezzatura:'🔧', nolo:'🔗' }[tipo] ?? '📋';
    },
    tipoLabel(tipo) {
      return { impresa:'Impresa', lavoratore:'Lavoratore', mezzo:'Mezzo', attrezzatura:'Attrezzatura', nolo:'Nolo' }[tipo] ?? tipo;
    },
    moduloLabel(m) {
      return { imprese:'Imprese', lavoratori:'Lavoratori', 'mezzi-attrezzature':'Mezzi/Att.', noli:'Noli' }[m] ?? m;
    },
    critClass(c) {
      if (c === 'critica') return 'bg-red-100 text-red-800';
      if (c === 'alta')    return 'bg-amber-100 text-amber-800';
      return 'bg-yellow-100 text-yellow-800';
    },
  };
}

// ── Template HTML ─────────────────────────────────────────────────────────────

const _TEMPLATE_CRUSCOTTO_SCADENZE = `
<div x-data="CruscottoScadenze()" x-init="init()" x-effect="aggiornaSeCantiereRicambia()" class="max-w-5xl">

  <!-- Header -->
  <div class="flex items-center justify-between mb-5">
    <div>
      <h1 class="text-xl font-semibold text-slate-800">📊 Cruscotto Scadenze</h1>
      <p class="text-xs text-slate-400 mt-0.5" x-text="$store.cantiere.nome ? 'Cantiere: ' + $store.cantiere.nome : 'Nessun cantiere selezionato'"></p>
    </div>
    <button @click="aggiorna()" x-show="$store.cantiere.id"
            class="text-xs text-slate-500 hover:text-slate-800 px-3 py-1.5 border border-slate-200 rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-slate-400">
      ↻ Aggiorna
    </button>
  </div>

  <!-- Placeholder: nessun cantiere -->
  <div x-show="!$store.cantiere.id" class="placeholder-modulo">
    <div class="text-3xl" aria-hidden="true">📊</div>
    <p class="text-slate-500">Seleziona un cantiere per vedere le scadenze.</p>
  </div>

  <div x-show="$store.cantiere.id">

    <!-- Spinner -->
    <div x-show="caricamento" class="flex items-center gap-3 py-10 text-slate-400 text-sm">
      <div class="w-5 h-5 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
      Aggregazione scadenze…
    </div>

    <div x-show="!caricamento">

      <!-- ── Banner numerico ─────────────────────────────────────────────── -->
      <div x-show="entries.length > 0" class="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">

        <div class="border border-red-200 bg-red-50 rounded-xl p-3 text-center">
          <div class="text-2xl font-bold text-red-700" x-text="contatori.critScadute"></div>
          <div class="text-xs text-red-600 mt-0.5">🔴 Critiche scadute</div>
        </div>
        <div class="border border-red-200 bg-red-50 rounded-xl p-3 text-center">
          <div class="text-2xl font-bold text-red-500" x-text="contatori.critInScadenza"></div>
          <div class="text-xs text-red-500 mt-0.5">🔴 Critiche in scadenza</div>
        </div>
        <div class="border border-amber-200 bg-amber-50 rounded-xl p-3 text-center">
          <div class="text-2xl font-bold text-amber-700" x-text="contatori.altaScaduta"></div>
          <div class="text-xs text-amber-600 mt-0.5">🟠 Alta priorità scadute</div>
        </div>
        <div class="border border-slate-200 bg-slate-50 rounded-xl p-3 text-center">
          <div class="text-2xl font-bold text-slate-600" x-text="contatori.totale"></div>
          <div class="text-xs text-slate-500 mt-0.5">Totale problemi</div>
        </div>
      </div>

      <!-- ── Tutto OK ────────────────────────────────────────────────────── -->
      <div x-show="entries.length === 0" class="text-center py-16">
        <div class="text-5xl mb-4" aria-hidden="true">✅</div>
        <p class="text-lg font-semibold text-green-700 mb-1">Nessuna scadenza problematica</p>
        <p class="text-sm text-slate-400">Tutte le entità del cantiere sono in regola con le soglie configurate.</p>
      </div>

      <div x-show="entries.length > 0">

        <!-- ── Barra filtri ─────────────────────────────────────────────── -->
        <div class="flex flex-wrap gap-3 mb-4">
          <input type="search" x-model="cercaTesto" placeholder="Cerca entità o tipo scadenza…"
                 class="flex-1 min-w-48 border border-slate-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">

          <select x-model="filtroFinestra" class="border border-slate-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
            <option value="tutte">Tutte</option>
            <option value="scadute">Solo scadute</option>
            <option value="30">Entro 30 gg</option>
            <option value="60">Entro 60 gg</option>
            <option value="90">Entro 90 gg</option>
          </select>

          <select x-model="filtroCriticita" class="border border-slate-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
            <option value="">Tutte le criticità</option>
            <option value="critica">🔴 Critiche</option>
            <option value="alta">🟠 Alta</option>
            <option value="normale">🟢 Normale</option>
          </select>

          <select x-model="filtroTipoEntita" class="border border-slate-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
            <option value="">Tutti i tipi</option>
            <option value="impresa">🏢 Imprese</option>
            <option value="lavoratore">👷 Lavoratori</option>
            <option value="mezzo">🚜 Mezzi</option>
            <option value="attrezzatura">🔧 Attrezzature</option>
            <option value="nolo">🔗 Noli</option>
          </select>
        </div>

        <!-- ── Lista entries ────────────────────────────────────────────── -->
        <div role="list" aria-label="Scadenze del cantiere" class="space-y-2">

          <p x-show="entriesFiltrate.length === 0" class="py-8 text-center text-sm text-slate-400">
            Nessuna scadenza corrisponde ai filtri applicati.
          </p>

          <template x-for="(e, idx) in entriesFiltrate" :key="idx">
            <div role="listitem"
                 @click="navigaA(e.moduloTarget)"
                 class="border rounded-xl px-4 py-3 flex items-center gap-4 cursor-pointer transition-all"
                 :class="e.criticita==='critica' && (e.giorni===null||e.giorni<0)
                   ? 'border-red-200 bg-red-50 hover:bg-red-100'
                   : e.criticita==='critica'
                   ? 'border-red-200 bg-white hover:bg-red-50'
                   : e.criticita==='alta'
                   ? 'border-amber-200 bg-white hover:bg-amber-50'
                   : 'border-slate-200 bg-white hover:bg-slate-50'">

              <!-- Tipo icona -->
              <span class="text-2xl flex-shrink-0" aria-hidden="true" x-text="tipoIcona(e.tipo)"></span>

              <!-- Contenuto principale -->
              <div class="flex-1 min-w-0">
                <div class="flex items-center gap-2 flex-wrap">
                  <span class="font-semibold text-slate-800" x-text="e.entitaLabel"></span>
                  <span class="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full flex-shrink-0"
                        x-text="tipoLabel(e.tipo)"></span>
                </div>
                <p class="text-sm text-slate-600 mt-0.5">
                  <span x-text="e.label"></span>
                  <span x-show="e.motivo" class="text-slate-400"
                        x-text="' — ' + e.motivo.replace(/_/g,' ')"></span>
                </p>
              </div>

              <!-- Metadati destra -->
              <div class="flex items-center gap-2 flex-shrink-0">

                <!-- Giorni -->
                <span x-show="e.giorni !== null"
                      class="text-xs font-semibold px-2 py-0.5 rounded font-mono"
                      :class="e.giorni < 0 ? 'text-red-700 bg-red-100' : 'text-amber-700 bg-amber-100'"
                      x-text="e.giorni < 0 ? Math.abs(e.giorni) + ' gg fa' : 'tra ' + e.giorni + ' gg'">
                </span>

                <!-- Entry senza data (patente crediti) -->
                <span x-show="e.giorni === null"
                      class="text-xs font-semibold text-red-700 bg-red-100 px-2 py-0.5 rounded">
                  ⛔ stato
                </span>

                <!-- Criticità badge -->
                <span :class="critClass(e.criticita)"
                      class="text-xs px-2 py-0.5 rounded-full font-medium uppercase hidden sm:inline"
                      x-text="e.criticita">
                </span>

                <!-- Modulo destinazione -->
                <span class="text-xs text-slate-400 hidden md:inline"
                      x-text="'→ ' + moduloLabel(e.moduloTarget)">
                </span>

                <!-- Freccia click -->
                <span class="text-slate-300 text-sm" aria-hidden="true">›</span>
              </div>
            </div>
          </template>

        </div><!-- /lista entries -->

        <!-- Contatore risultati filtrati -->
        <p x-show="entriesFiltrate.length < entries.length" class="mt-3 text-xs text-slate-400 text-center">
          Mostrate <span x-text="entriesFiltrate.length"></span> di <span x-text="entries.length"></span> scadenze totali
        </p>

      </div><!-- /entries.length > 0 -->

      <!-- ── Export DOCX per singola impresa ──────────────────────────────── -->
      <div x-show="!caricamento && imprese.length > 0"
           class="mt-8 border border-slate-200 rounded-xl p-4 bg-slate-50">

        <h2 class="text-sm font-semibold text-slate-700 mb-3">
          📋 Esporta scadenze per impresa
        </h2>
        <p class="text-xs text-slate-400 mb-3">
          Genera un DOCX con le scadenze scadute/in&nbsp;scadenza dell'impresa selezionata
          (documenti aziendali, lavoratori, mezzi, attrezzature, noli), pronto da allegare alla mail.
        </p>

        <div class="flex flex-wrap gap-3 items-end">

          <div class="flex-1 min-w-48">
            <label for="cs-export-impresa" class="block text-xs font-medium text-slate-600 mb-1">
              Impresa
            </label>
            <select id="cs-export-impresa"
                    x-model="impresaExportId"
                    class="w-full border border-slate-300 rounded-md px-3 py-2 text-sm
                           focus:outline-none focus:ring-2 focus:ring-blue-500">
              <option value="">— Seleziona impresa —</option>
              <template x-for="imp in imprese" :key="imp.id">
                <option :value="imp.id" x-text="imp.ragioneSociale || imp.id"></option>
              </template>
            </select>
          </div>

          <button @click="esportaScadenzeImpresa()"
                  :disabled="!impresaExportId || exportando"
                  type="button"
                  class="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium
                         bg-blue-600 text-white hover:bg-blue-700
                         disabled:opacity-50 disabled:cursor-not-allowed
                         transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500">
            <span x-show="!exportando" aria-hidden="true">📥</span>
            <span x-show="exportando"
                  class="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"
                  aria-hidden="true"></span>
            <span x-text="exportando ? 'Generazione…' : 'Genera DOCX'"></span>
          </button>

        </div>
      </div><!-- /export impresa -->

    </div><!-- /!caricamento -->
  </div><!-- /$store.cantiere.id -->

</div>
`;

// ── Registrazione ──────────────────────────────────────────────────────────

window.MODULI_REGISTRATI = window.MODULI_REGISTRATI ?? {};
window.MODULI_REGISTRATI['cruscotto-scadenze'] = {
  monta(contenitore) { contenitore.innerHTML = _TEMPLATE_CRUSCOTTO_SCADENZE; },
};
