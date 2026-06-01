/**
 * imprese.js — M4 Fase 1: collezione Imprese.
 *
 * Cruscotto con alert panel, semaforo conformità, filtri.
 * Editor via drawer slide-in (lista sempre visibile come contesto).
 * Soft-delete (cestino logico) con ripristino/eliminazione definitiva.
 */

// ── Tipi di documento mostrati nel drawer (schema-anagrafica-canonico-v2 §4) ──
const TIPI_DOCUMENTO_IMPRESA = [
  { tipo: 'POS',                      label: 'POS — Piano Operativo di Sicurezza' },
  { tipo: 'DURC',                     label: 'DURC' },
  { tipo: 'CCIAA',                    label: 'Iscrizione CCIAA' },
  { tipo: 'DVR',                      label: 'DVR — Documento Valutazione Rischi' },
  { tipo: 'POLIZZA_RC',               label: 'Polizza Responsabilità Civile' },
  { tipo: 'DOMA',                     label: 'DOMA (art.90 c.9.b)' },
  { tipo: 'CONTRATTO_SUBAPPALTO',     label: 'Contratto di subappalto' },
  { tipo: 'AUTORIZZAZIONE_SUBAPPALTO',label: 'Autorizzazione al subappalto' },
  { tipo: 'DICH_ART14',               label: 'Dichiarazione art.14' },
  { tipo: 'NOMINA_RSPP',              label: 'Nomina RSPP' },
  { tipo: 'NOMINA_MEDICO',            label: 'Nomina Medico Competente' },
  { tipo: 'DESIGNAZIONE_RLS',         label: 'Designazione RLS' },
  { tipo: 'ATTESTAZIONE_BUONO_STATO', label: 'Attestazione buono stato (art.72)' },
];

// ── Etichette per tipoRapporto ──────────────────────────────────────────────
const TIPO_RAPPORTO_LABEL = {
  APPALTO:       'Appalto',
  SUBAPPALTO:    'Subappalto',
  NOLO_CALDO:    'Nolo a caldo',
  NOLO_FREDDO:   'Nolo a freddo',
  FORNITURA:     'Fornitura mera',
  FORNITURA_POSA:'Fornitura con posa',
  SERVIZIO:      'Servizio',
  LAV_AUTONOMO:  'Lavoratore autonomo',
};

// ── Utilità private ─────────────────────────────────────────────────────────

const _leggiFileBase64Imp = (file) =>
  new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload  = (e) => resolve(e.target.result);
    r.onerror = ()  => reject(new Error('Lettura file non riuscita'));
    r.readAsDataURL(file);
  });

// ── Componente Alpine ────────────────────────────────────────────────────────

function ListaImprese() {
  return {
    // Lista
    imprese:       [],
    caricamento:   true,
    cercaTesto:    '',
    filtroTipo:    '',
    mostraCestino: false,

    // Drawer
    drawerAperto:              false,
    formDati:                  {},
    formNuova:                 true,
    salvando:                  false,
    modificatoDopoCaricamento: false,

    // Tracking cantiere per x-effect
    _cantiereId: null,

    // ── Computed ─────────────────────────────────────────────────────────────

    get impreseFiltrate() {
      return this.imprese
        .filter(i => !i._cestino)
        .filter(i => !this.cercaTesto || (i.ragioneSociale ?? '').toLowerCase().includes(this.cercaTesto.toLowerCase()) || (i.partitaIva ?? '').includes(this.cercaTesto))
        .filter(i => !this.filtroTipo || i.tipoRapporto === this.filtroTipo);
    },

    get impreseCestino() {
      return this.imprese.filter(i => i._cestino);
    },

    get contatori() {
      const attive = this.imprese.filter(i => !i._cestino);
      const conf   = attive.map(i => ANAGRAFICA_SERVICE.calcolaConformita(i));
      return {
        totale: attive.length,
        verde:  conf.filter(c => c.stato === 'verde').length,
        giallo: conf.filter(c => c.stato === 'giallo').length,
        rosso:  conf.filter(c => c.stato === 'rosso').length,
      };
    },

    // Alert rossi non silenziabili (patente critica + docs obbligatori scaduti)
    get alertCritici() {
      return this.imprese
        .filter(i => !i._cestino)
        .flatMap(i => {
          const conf = ANAGRAFICA_SERVICE.calcolaConformita(i);
          return conf.problemi
            .filter(p => p.livello === 'rosso_critico' || (conf.critico && p.livello === 'rosso'))
            .map(p => ({ ragioneSociale: i.ragioneSociale ?? i.id, id: i.id, ...p }));
        });
    },

    // ── Lifecycle ────────────────────────────────────────────────────────────

    init() {
      this._cantiereId = Alpine.store('cantiere')?.id;
      if (ANAGRAFICA_SERVICE.isCaricato && ANAGRAFICA_SERVICE.cantiereId === this._cantiereId) {
        this.caricaDati();
      } else {
        this.caricamento = true;
        document.addEventListener('anagrafica-caricata', () => this.caricaDati(), { once: true });
      }
    },

    // x-effect: si riesegue quando $store.cantiere.id cambia
    aggiornaSeCantiereRicambia() {
      const id = Alpine.store('cantiere')?.id;
      if (id !== this._cantiereId) {
        this._cantiereId = id;
        if (!id) { this.imprese = []; this.caricamento = false; return; }
        this.caricamento = true;
        if (ANAGRAFICA_SERVICE.cantiereId === id) {
          this.caricaDati();
        } else {
          document.addEventListener('anagrafica-caricata', (e) => {
            if (e.detail?.cantiereId === id) this.caricaDati();
          }, { once: true });
        }
      }
    },

    caricaDati() {
      this.imprese     = [...(ANAGRAFICA_SERVICE.get('imprese', { inclCestino: true }) ?? [])];
      this.caricamento = false;
    },

    // ── Drawer ───────────────────────────────────────────────────────────────

    nuovaImpresa() {
      this.formDati = ANAGRAFICA_SERVICE.creaEntitaVuota('imprese');
      this.formNuova = true;
      this.modificatoDopoCaricamento = false;
      this.drawerAperto = true;
      this.$nextTick(() => document.getElementById('imp-ragione-sociale')?.focus());
    },

    modificaImpresa(id) {
      const imp = this.imprese.find(i => i.id === id);
      if (!imp) return;
      this.formDati  = JSON.parse(JSON.stringify(imp));  // copia profonda per editing locale
      this.formNuova = false;
      this.modificatoDopoCaricamento = false;
      this.drawerAperto = true;
    },

    chiudiDrawer(forza = false) {
      if (!forza && this.modificatoDopoCaricamento) {
        if (!confirm('Ci sono modifiche non salvate. Chiudere senza salvare?')) return;
      }
      this.drawerAperto = false;
      this.formDati = {};
    },

    async salvaImpresa() {
      this.salvando = true;
      try {
        if (this.formNuova) {
          await ANAGRAFICA_SERVICE.aggiungi('imprese', this.formDati);
        } else {
          await ANAGRAFICA_SERVICE.aggiorna('imprese', this.formDati.id, this.formDati);
        }
        this.caricaDati();
        this.chiudiDrawer(true);
        NOTIFICHE.successo(this.formNuova ? 'Impresa aggiunta' : 'Impresa aggiornata');
        await Alpine.store('cantieri').ricarica();
      } catch (err) {
        ERRORI.gestisciErrore('imprese/salva', err);
      } finally {
        this.salvando = false;
      }
    },

    // ── Cestino impresa ──────────────────────────────────────────────────────

    async cestinaImpresa(id) {
      try {
        await ANAGRAFICA_SERVICE.cestina('imprese', id);
        this.caricaDati();
        NOTIFICHE.info('Impresa spostata nel cestino');
        await Alpine.store('cantieri').ricarica();
      } catch (err) {
        ERRORI.gestisciErrore('imprese/cestina', err);
      }
    },

    async ripristinaImpresa(id) {
      try {
        await ANAGRAFICA_SERVICE.ripristina('imprese', id);
        this.caricaDati();
        NOTIFICHE.successo('Impresa ripristinata');
      } catch (err) {
        ERRORI.gestisciErrore('imprese/ripristina', err);
      }
    },

    async eliminaDefinitivamenteImpresa(id) {
      if (!confirm('Eliminare definitivamente questa impresa dal file? Questa azione non è reversibile.')) return;
      try {
        await ANAGRAFICA_SERVICE.eliminaDefinitivamente('imprese', id);
        this.caricaDati();
      } catch (err) {
        ERRORI.gestisciErrore('imprese/elimina', err);
      }
    },

    // ── Documenti nel drawer (base64 inline nel JSON) ─────────────────────

    async onDocumentoFile(tipo, event) {
      const file = event.target.files?.[0];
      if (!file) return;
      const base64 = await _leggiFileBase64Imp(file);

      if (!this.formDati.documenti) this.formDati.documenti = [];

      // Cestina il documento precedente dello stesso tipo (non cancella — P3)
      const idx = this.formDati.documenti.findIndex(d => d.tipo === tipo && !d._cestino);
      if (idx >= 0) {
        this.formDati.documenti[idx] = { ...this.formDati.documenti[idx], _cestino: true, _eliminato_il: new Date().toISOString() };
      }

      this.formDati.documenti.push({ tipo, scadenza: null, filename: file.name, base64 });
      this.formDati = { ...this.formDati };   // trigger reattività Alpine
      this.modificatoDopoCaricamento = true;
    },

    cestinaDocumento(tipo) {
      const idx = this.formDati.documenti?.findIndex(d => d.tipo === tipo && !d._cestino) ?? -1;
      if (idx < 0) return;
      this.formDati.documenti[idx] = { ...this.formDati.documenti[idx], _cestino: true, _eliminato_il: new Date().toISOString() };
      this.formDati = { ...this.formDati };
      this.modificatoDopoCaricamento = true;
    },

    // ── Helper per template ──────────────────────────────────────────────────

    getDocumento(tipo) {
      return this.formDati.documenti?.find(d => d.tipo === tipo && !d._cestino) ?? null;
    },

    // Ritorna 'obbligatorio'|'condizionato'|'non_pertinente' per il tipo documento
    // dato il tipoRapporto corrente nel form.
    categoriaDoc(tipo) {
      const tipoRap = this.formDati?.tipoRapporto;
      if (!tipoRap) return 'non_pertinente';
      const conf = (tipoRap === 'NOLO_CALDO' && this.formDati?.superaSoglieSubappalto)
        ? ANAGRAFICA_SERVICE.CONFORMITA_MATRIX.SUBAPPALTO
        : (ANAGRAFICA_SERVICE.CONFORMITA_MATRIX[tipoRap] ?? { obbligatori: [], condizionati: [] });
      if (conf.obbligatori?.includes(tipo)) return 'obbligatorio';
      if (conf.condizionati?.includes(tipo)) return 'condizionato';
      return 'non_pertinente';
    },

    get patenteStatusClass() {
      const pat = this.formDati?.patenteCrediti;
      if (!pat?.stato) return '';
      if (['SOSPESA', 'REVOCATA'].includes(pat.stato))               return 'bg-red-50 border-red-300 text-red-700';
      if (pat.punteggio != null && pat.punteggio < 15)               return 'bg-red-50 border-red-300 text-red-700';
      if (pat.stato === 'RICHIESTA')                                  return 'bg-yellow-50 border-yellow-300 text-yellow-700';
      if (pat.stato === 'ATTIVA' && (pat.punteggio ?? 999) >= 15)    return 'bg-green-50 border-green-300 text-green-700';
      return '';
    },

    get patenteBadgeText() {
      const pat = this.formDati?.patenteCrediti;
      if (['SOSPESA', 'REVOCATA'].includes(pat?.stato)) return `⛔ Patente ${pat.stato.toLowerCase()}`;
      if (pat?.punteggio != null && pat.punteggio < 15) return `⛔ Punteggio ${pat.punteggio} < 15 — non operabile`;
      if (pat?.stato === 'RICHIESTA')                   return '⏳ Patente in attesa di rilascio';
      return '';
    },

    conformita(impresa) { return ANAGRAFICA_SERVICE.calcolaConformita(impresa); },

    // Espone le costanti di modulo al template Alpine (che non può accedere a const di modulo)
    _tipoLabel()    { return TIPO_RAPPORTO_LABEL; },
    _tipiDocumento(){ return TIPI_DOCUMENTO_IMPRESA; },

    semaforoClass(stato) {
      if (stato === 'verde') return 'bg-green-100 text-green-700';
      if (stato === 'giallo') return 'bg-yellow-100 text-yellow-700';
      if (stato === 'rosso')  return 'bg-red-100 text-red-700';
      return 'bg-slate-100 text-slate-500';
    },
  };
}

// ── Template HTML ─────────────────────────────────────────────────────────────

const _TEMPLATE_IMPRESE = `
<div x-data="ListaImprese()" x-init="init()" x-effect="aggiornaSeCantiereRicambia()" class="max-w-5xl">

  <!-- Header -->
  <div class="flex items-center justify-between mb-5">
    <div>
      <h1 class="text-xl font-semibold text-slate-800">🏢 Imprese</h1>
      <p class="text-xs text-slate-400 mt-0.5"
         x-text="contatori.totale + ' imprese: ' + contatori.verde + ' ✓  ' + contatori.giallo + ' ⚠  ' + contatori.rosso + ' ✕'">
      </p>
    </div>
    <button @click="nuovaImpresa()" x-show="$store.cantiere.id"
            class="bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium
                   px-4 py-2 rounded-lg transition-colors
                   focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2">
      + Nuova impresa
    </button>
  </div>

  <!-- Nessun cantiere -->
  <div x-show="!$store.cantiere.id" class="placeholder-modulo">
    <div class="text-3xl" aria-hidden="true">🏢</div>
    <p class="text-slate-500">Seleziona un cantiere per gestire le imprese.</p>
  </div>

  <div x-show="$store.cantiere.id">

    <!-- Spinner caricamento -->
    <div x-show="caricamento" class="flex items-center gap-3 py-10 text-slate-400 text-sm">
      <div class="w-5 h-5 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
      Caricamento imprese…
    </div>

    <div x-show="!caricamento">

      <!-- ── Alert panel: critici non silenziabili ─────────────── -->
      <div x-show="alertCritici.length > 0"
           class="mb-4 border border-red-200 bg-red-50 rounded-xl p-4"
           role="alert">
        <p class="text-sm font-semibold text-red-800 mb-2">
          🔴 <span x-text="alertCritici.length"></span> problema/i critico/i (non silenziabile/i)
        </p>
        <ul class="space-y-1">
          <template x-for="a in alertCritici" :key="a.id + '_' + a.tipo">
            <li class="text-xs text-red-700">
              <button @click="modificaImpresa(a.id)"
                      class="font-semibold underline hover:no-underline mr-1
                             focus:outline-none focus:ring-1 focus:ring-red-600 rounded"
                      x-text="a.ragioneSociale"></button>
              — <span x-text="a.label"></span>
              (<span x-text="a.motivo.replace(/_/g,' ')"></span>)
            </li>
          </template>
        </ul>
      </div>

      <!-- ── Barra strumenti ────────────────────────────────────── -->
      <div class="flex flex-wrap gap-3 mb-4">
        <input type="search" x-model="cercaTesto"
               placeholder="Cerca per nome o P.IVA…"
               class="flex-1 min-w-48 border border-slate-300 rounded-md px-3 py-2 text-sm
                      focus:outline-none focus:ring-2 focus:ring-blue-500">
        <select x-model="filtroTipo"
                class="border border-slate-300 rounded-md px-3 py-2 text-sm
                       focus:outline-none focus:ring-2 focus:ring-blue-500">
          <option value="">Tutti i tipi</option>
          <template x-for="[k, v] in Object.entries($data._tipoLabel())" :key="k">
            <option :value="k" x-text="v"></option>
          </template>
        </select>
      </div>

      <!-- ── Lista imprese ──────────────────────────────────────── -->
      <div role="list" aria-label="Lista imprese" class="space-y-2">

        <div x-show="impreseFiltrate.length === 0 && !mostraCestino"
             class="py-12 text-center text-slate-400">
          <div class="text-3xl mb-2" aria-hidden="true">🏢</div>
          <p x-show="!cercaTesto && !filtroTipo">Nessuna impresa. Clicca "+ Nuova impresa" per iniziare.</p>
          <p x-show="cercaTesto || filtroTipo">Nessuna impresa corrisponde ai filtri applicati.</p>
        </div>

        <template x-for="imp in impreseFiltrate" :key="imp.id">
          <div role="listitem"
               class="border border-slate-200 bg-white hover:border-slate-300
                      rounded-xl px-4 py-3 flex items-center gap-4 transition-all">

            <!-- Semaforo conformità -->
            <span :class="semaforoClass(conformita(imp).stato)"
                  class="flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold"
                  :title="conformita(imp).problemi.length + ' problema/i'"
                  aria-hidden="true">
              <span x-text="conformita(imp).stato === 'verde' ? '✓' : conformita(imp).stato === 'giallo' ? '⚠' : conformita(imp).stato === 'rosso' ? '✕' : '—'"></span>
            </span>

            <!-- Info principale -->
            <div class="flex-1 min-w-0">
              <div class="flex items-center gap-2 flex-wrap">
                <span class="font-medium text-slate-800 truncate" x-text="imp.ragioneSociale || '(senza nome)'"></span>
                <span x-show="imp.tipoRapporto"
                      class="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full flex-shrink-0"
                      x-text="$data._tipoLabel()[imp.tipoRapporto] ?? imp.tipoRapporto"></span>
                <span x-show="imp.patenteCrediti?.punteggio != null && imp.patenteCrediti.punteggio < 15"
                      class="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded-full font-medium flex-shrink-0">
                  ⛔ Patente &lt;15
                </span>
              </div>
              <p x-show="imp.partitaIva || imp.codiceFiscale"
                 class="text-xs text-slate-400 mt-0.5">
                <span x-text="[imp.partitaIva ? 'PI ' + imp.partitaIva : '', imp.codiceFiscale ? 'CF ' + imp.codiceFiscale : ''].filter(Boolean).join(' · ')"></span>
              </p>
            </div>

            <!-- Azioni -->
            <div class="flex gap-2 flex-shrink-0">
              <button @click="modificaImpresa(imp.id)"
                      class="text-sm text-slate-600 hover:text-slate-900 px-3 py-1.5
                             border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors
                             focus:outline-none focus:ring-2 focus:ring-slate-400"
                      :aria-label="'Modifica ' + imp.ragioneSociale">
                ✏ Modifica
              </button>
              <button @click="cestinaImpresa(imp.id)"
                      class="text-sm text-red-400 hover:text-red-700 px-2 py-1.5
                             rounded-lg hover:bg-red-50 transition-colors
                             focus:outline-none focus:ring-2 focus:ring-red-400"
                      :aria-label="'Cestina ' + imp.ragioneSociale"
                      title="Sposta nel cestino">
                🗑
              </button>
            </div>
          </div>
        </template>
      </div>

      <!-- ── Cestino ────────────────────────────────────────────── -->
      <div class="mt-6">
        <button @click="mostraCestino = !mostraCestino"
                class="text-xs text-slate-400 hover:text-slate-600 underline
                       focus:outline-none focus:ring-2 focus:ring-slate-400 rounded">
          <span x-text="(mostraCestino ? '▾ Nascondi' : '▸ Mostra') + ' cestino (' + impreseCestino.length + ')'"></span>
        </button>

        <div x-show="mostraCestino && impreseCestino.length > 0" class="mt-3 space-y-2">
          <template x-for="imp in impreseCestino" :key="imp.id">
            <div class="border border-slate-200 bg-slate-50 rounded-xl px-4 py-3
                        flex items-center gap-4 opacity-60 hover:opacity-80 transition-opacity">
              <div class="flex-1 min-w-0">
                <span class="text-sm text-slate-600 line-through" x-text="imp.ragioneSociale || '(senza nome)'"></span>
                <p class="text-xs text-slate-400" x-text="'Eliminato il ' + UTILS.formatData(imp._eliminato_il)"></p>
              </div>
              <div class="flex gap-2">
                <button @click="ripristinaImpresa(imp.id)"
                        class="text-xs text-green-700 hover:text-green-900 px-2 py-1
                               border border-green-300 rounded-lg hover:bg-green-50 transition-colors
                               focus:outline-none focus:ring-2 focus:ring-green-400">
                  ↩ Ripristina
                </button>
                <button @click="eliminaDefinitivamenteImpresa(imp.id)"
                        class="text-xs text-red-500 hover:text-red-700 px-2 py-1
                               rounded-lg hover:bg-red-50 transition-colors
                               focus:outline-none focus:ring-2 focus:ring-red-400">
                  Elimina definitivamente
                </button>
              </div>
            </div>
          </template>
        </div>

        <p x-show="mostraCestino && impreseCestino.length === 0"
           class="text-xs text-slate-400 mt-2">Il cestino è vuoto.</p>
      </div>

    </div><!-- /!caricamento -->

  </div><!-- /$store.cantiere.id -->

  <!-- ═══════════════════════════════════════════════════════════════
       DRAWER: Editor impresa
       position:fixed dentro #contenuto-modulo — si monta e smonta
       col modulo; ciclo di vita Alpine pulito, nessun listener orfano.
       ═══════════════════════════════════════════════════════════════ -->
  <!-- ═══════════════════════════════════════════════════════════════
       DRAWER: pannello laterale a destra, senza backdrop.
       La lista e il menu laterale restano visibili e interagibili a sinistra.
       Pattern da riusare per Lavoratori, Mezzi, Noli, Persone (fasi 2-5).
       Chiusura: pulsante ✕ o tasto Escape.

       Layout a tre fasce flex:
         - header:  flex-shrink:0           → fisso in cima
         - corpo:   flex:1 + overflow-y:auto + min-height:0  → scrollabile
         - footer:  flex-shrink:0           → Salva sempre visibile in fondo
       ═══════════════════════════════════════════════════════════════ -->
  <div x-show="drawerAperto" x-cloak
       @input="modificatoDopoCaricamento = true"
       @keydown.escape.window="chiudiDrawer(false)"
       style="position:fixed;
              top:var(--header-height);right:0;bottom:0;
              width:44%;max-width:640px;min-width:320px;
              z-index:100;
              display:flex;flex-direction:column;
              background:white;
              box-shadow:-4px 0 32px rgba(0,0,0,0.15);
              border-left:1px solid rgba(0,0,0,0.07)"
       role="dialog" aria-modal="true" aria-label="Editor impresa">

      <!-- Intestazione drawer -->
      <!-- Fascia 1: header — flex-shrink:0 → resta sempre visibile in cima -->
      <div class="flex items-center justify-between px-5 py-4 border-b border-slate-200 bg-white" style="flex-shrink:0">
        <h2 class="text-base font-semibold text-slate-800">
          <span x-text="formNuova ? 'Nuova impresa' : (formDati.ragioneSociale || 'Modifica impresa')"></span>
        </h2>
        <button @click="chiudiDrawer(false)" aria-label="Chiudi"
                class="p-1.5 rounded hover:bg-slate-100 text-slate-500 text-lg
                       focus:outline-none focus:ring-2 focus:ring-slate-400">✕</button>
      </div>

      <!-- Corpo form -->
      <!-- Fascia 2: corpo scrollabile.
           flex:1 occupa lo spazio residuo; min-height:0 è essenziale —
           senza di esso flex impedisce la compressione e overflow-y:auto non scatta mai. -->
      <div class="px-5 py-4 space-y-3" style="flex:1;overflow-y:auto;min-height:0">

        <!-- ── 1. Identificazione ──────────────────────────────── -->
        <details open class="border border-slate-200 rounded-xl overflow-hidden">
          <summary class="px-4 py-3 bg-slate-50 cursor-pointer text-sm font-medium text-slate-700
                          hover:bg-slate-100 list-none flex items-center justify-between">
            Identificazione <span class="text-slate-400 text-xs" aria-hidden="true">▾</span>
          </summary>
          <div class="p-4 grid gap-3 sm:grid-cols-2">

            <div class="sm:col-span-2">
              <label for="imp-ragione-sociale" class="block text-xs font-medium text-slate-600 mb-1">
                Ragione sociale <span class="text-slate-400 font-normal">(consigliata)</span>
              </label>
              <input id="imp-ragione-sociale" type="text" x-model="formDati.ragioneSociale"
                     placeholder="Impresa Esempio S.r.l."
                     class="w-full border border-slate-300 rounded-md px-3 py-2 text-sm
                            focus:outline-none focus:ring-2 focus:ring-blue-500">
            </div>

            <div>
              <label for="imp-piva" class="block text-xs font-medium text-slate-600 mb-1">Partita IVA</label>
              <input id="imp-piva" type="text" x-model="formDati.partitaIva"
                     class="w-full border border-slate-300 rounded-md px-3 py-2 text-sm
                            focus:outline-none focus:ring-2 focus:ring-blue-500">
            </div>

            <div>
              <label for="imp-cf" class="block text-xs font-medium text-slate-600 mb-1">Codice fiscale</label>
              <input id="imp-cf" type="text" x-model="formDati.codiceFiscale"
                     class="w-full border border-slate-300 rounded-md px-3 py-2 text-sm
                            focus:outline-none focus:ring-2 focus:ring-blue-500">
            </div>

            <div class="sm:col-span-2">
              <label for="imp-sede" class="block text-xs font-medium text-slate-600 mb-1">Sede legale</label>
              <input id="imp-sede" type="text" x-model="formDati.sedeLegale"
                     class="w-full border border-slate-300 rounded-md px-3 py-2 text-sm
                            focus:outline-none focus:ring-2 focus:ring-blue-500">
            </div>

            <div>
              <label for="imp-pec" class="block text-xs font-medium text-slate-600 mb-1">PEC</label>
              <input id="imp-pec" type="email" x-model="formDati.pec"
                     class="w-full border border-slate-300 rounded-md px-3 py-2 text-sm
                            focus:outline-none focus:ring-2 focus:ring-blue-500">
            </div>

            <div>
              <label for="imp-ref" class="block text-xs font-medium text-slate-600 mb-1">Referente</label>
              <input id="imp-ref" type="text" x-model="formDati.referente"
                     class="w-full border border-slate-300 rounded-md px-3 py-2 text-sm
                            focus:outline-none focus:ring-2 focus:ring-blue-500">
            </div>

            <div>
              <label for="imp-tel" class="block text-xs font-medium text-slate-600 mb-1">Telefono</label>
              <input id="imp-tel" type="tel" x-model="formDati.telefono"
                     class="w-full border border-slate-300 rounded-md px-3 py-2 text-sm
                            focus:outline-none focus:ring-2 focus:ring-blue-500">
            </div>

            <div>
              <label for="imp-email" class="block text-xs font-medium text-slate-600 mb-1">Email</label>
              <input id="imp-email" type="email" x-model="formDati.email"
                     class="w-full border border-slate-300 rounded-md px-3 py-2 text-sm
                            focus:outline-none focus:ring-2 focus:ring-blue-500">
            </div>
          </div>
        </details>

        <!-- ── 2. Tipo di rapporto ──────────────────────────────── -->
        <details open class="border border-slate-200 rounded-xl overflow-hidden">
          <summary class="px-4 py-3 bg-slate-50 cursor-pointer text-sm font-medium text-slate-700
                          hover:bg-slate-100 list-none flex items-center justify-between">
            Tipo di rapporto <span class="text-slate-400 text-xs" aria-hidden="true">▾</span>
          </summary>
          <div class="p-4 grid gap-3 sm:grid-cols-2">

            <div class="sm:col-span-2">
              <label for="imp-tipo-rapporto" class="block text-xs font-medium text-slate-600 mb-1">
                Tipo rapporto <span class="text-slate-400 font-normal">(determina i documenti attesi)</span>
              </label>
              <select id="imp-tipo-rapporto" x-model="formDati.tipoRapporto"
                      class="w-full border border-slate-300 rounded-md px-3 py-2 text-sm
                             focus:outline-none focus:ring-2 focus:ring-blue-500">
                <option value="">— Scegli tipo —</option>
                <template x-for="[k, v] in Object.entries($data._tipoLabel())" :key="k">
                  <option :value="k" x-text="v"></option>
                </template>
              </select>
            </div>

            <div>
              <label for="imp-ruolo" class="block text-xs font-medium text-slate-600 mb-1">Ruolo (V3 compat)</label>
              <select id="imp-ruolo" x-model="formDati.ruolo"
                      class="w-full border border-slate-300 rounded-md px-3 py-2 text-sm
                             focus:outline-none focus:ring-2 focus:ring-blue-500">
                <option value="">—</option>
                <option value="AFFIDATARIA">Affidataria</option>
                <option value="ESECUTRICE">Esecutrice</option>
                <option value="SUBAPPALTO">Subappalto</option>
              </select>
            </div>

            <div>
              <label for="imp-contratto-rif" class="block text-xs font-medium text-slate-600 mb-1">N. contratto rif.</label>
              <input id="imp-contratto-rif" type="text" x-model="formDati.contrattoRiferimento"
                     class="w-full border border-slate-300 rounded-md px-3 py-2 text-sm
                            focus:outline-none focus:ring-2 focus:ring-blue-500">
            </div>

            <!-- Campo condizionale: sopra soglia subappalto (solo NOLO_CALDO) -->
            <div x-show="formDati.tipoRapporto === 'NOLO_CALDO'" class="sm:col-span-2">
              <label class="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
                <input type="checkbox" x-model="formDati.superaSoglieSubappalto"
                       class="w-4 h-4 rounded border-slate-300 text-blue-600
                              focus:ring-2 focus:ring-blue-500">
                Supera le soglie di subappalto (trattare come subappalto)
              </label>
            </div>

          </div>
        </details>

        <!-- ── 3. Patente a crediti ───────────────────────────────── -->
        <details open class="border border-slate-200 rounded-xl overflow-hidden">
          <summary class="px-4 py-3 bg-slate-50 cursor-pointer text-sm font-medium text-slate-700
                          hover:bg-slate-100 list-none flex items-center justify-between">
            <span>Patente a crediti</span>
            <!-- Badge critico (non silenziabile) -->
            <span x-show="patenteBadgeText"
                  class="text-xs font-medium px-2 py-0.5 rounded-full border"
                  :class="patenteStatusClass"
                  x-text="patenteBadgeText">
            </span>
          </summary>
          <div class="p-4 grid gap-3 sm:grid-cols-2">

            <div>
              <label for="imp-pat-codice" class="block text-xs font-medium text-slate-600 mb-1">Codice INL</label>
              <input id="imp-pat-codice" type="text"
                     :value="formDati.patenteCrediti?.codice ?? ''"
                     @input="(formDati.patenteCrediti ??= {}).codice = $event.target.value || null"
                     class="w-full border border-slate-300 rounded-md px-3 py-2 text-sm
                            focus:outline-none focus:ring-2 focus:ring-blue-500">
            </div>

            <div>
              <label for="imp-pat-punteggio" class="block text-xs font-medium text-slate-600 mb-1">
                Punteggio
                <span x-show="formDati.patenteCrediti?.punteggio != null && formDati.patenteCrediti.punteggio < 15"
                      class="text-red-600 font-semibold"> ⛔ &lt;15 non operabile</span>
              </label>
              <input id="imp-pat-punteggio" type="number" min="0" max="100"
                     :value="formDati.patenteCrediti?.punteggio ?? ''"
                     @input="(formDati.patenteCrediti ??= {}).punteggio = $event.target.value !== '' ? +$event.target.value : null"
                     class="w-full border border-slate-300 rounded-md px-3 py-2 text-sm
                            focus:outline-none focus:ring-2 focus:ring-blue-500"
                     :class="formDati.patenteCrediti?.punteggio < 15 ? 'border-red-400 bg-red-50' : ''">
            </div>

            <div>
              <label for="imp-pat-rilascio" class="block text-xs font-medium text-slate-600 mb-1">Data rilascio</label>
              <input id="imp-pat-rilascio" type="date"
                     :value="formDati.patenteCrediti?.dataRilascio ?? ''"
                     @input="(formDati.patenteCrediti ??= {}).dataRilascio = $event.target.value || null"
                     class="w-full border border-slate-300 rounded-md px-3 py-2 text-sm
                            focus:outline-none focus:ring-2 focus:ring-blue-500">
            </div>

            <div>
              <label for="imp-pat-stato" class="block text-xs font-medium text-slate-600 mb-1">Stato</label>
              <select id="imp-pat-stato"
                      :value="formDati.patenteCrediti?.stato ?? ''"
                      @change="(formDati.patenteCrediti ??= {}).stato = $event.target.value || null"
                      class="w-full border border-slate-300 rounded-md px-3 py-2 text-sm
                             focus:outline-none focus:ring-2 focus:ring-blue-500"
                      :class="['SOSPESA','REVOCATA'].includes(formDati.patenteCrediti?.stato) ? 'border-red-400 bg-red-50' : ''">
                <option value="">— Scegli stato —</option>
                <option value="ATTIVA">ATTIVA</option>
                <option value="RICHIESTA">RICHIESTA</option>
                <option value="SOSPESA">SOSPESA ⛔</option>
                <option value="REVOCATA">REVOCATA ⛔</option>
                <option value="NON_APPLICABILE">NON APPLICABILE</option>
              </select>
            </div>
          </div>
        </details>

        <!-- ── 4. Figure di sicurezza ───────────────────────────── -->
        <details class="border border-slate-200 rounded-xl overflow-hidden">
          <summary class="px-4 py-3 bg-slate-50 cursor-pointer text-sm font-medium text-slate-700
                          hover:bg-slate-100 list-none flex items-center justify-between">
            Figure di sicurezza <span class="text-slate-400 text-xs" aria-hidden="true">▾</span>
          </summary>
          <div class="p-4 grid gap-3 sm:grid-cols-2">
            <template x-for="[campo, etich] in [
              ['rspp','RSPP'],['medicoCompetente','Medico Competente'],
              ['rls','RLS'],['direttoreTecnico','Direttore Tecnico'],
              ['direttoreCantiere','Direttore di Cantiere']
            ]" :key="campo">
              <div>
                <label :for="'imp-fig-' + campo"
                       class="block text-xs font-medium text-slate-600 mb-1"
                       x-text="etich"></label>
                <input :id="'imp-fig-' + campo" type="text"
                       :value="formDati.figureSicurezza?.[campo] ?? ''"
                       @input="(formDati.figureSicurezza ??= {})[campo] = $event.target.value || null"
                       class="w-full border border-slate-300 rounded-md px-3 py-2 text-sm
                              focus:outline-none focus:ring-2 focus:ring-blue-500">
              </div>
            </template>
          </div>
        </details>

        <!-- ── 5. Dati ITP ──────────────────────────────────────── -->
        <details class="border border-slate-200 rounded-xl overflow-hidden">
          <summary class="px-4 py-3 bg-slate-50 cursor-pointer text-sm font-medium text-slate-700
                          hover:bg-slate-100 list-none flex items-center justify-between">
            Dati ITP <span class="text-slate-400 text-xs" aria-hidden="true">▾</span>
          </summary>
          <div class="p-4 grid gap-3 sm:grid-cols-2">
            <div class="sm:col-span-2">
              <label for="imp-ccnl" class="block text-xs font-medium text-slate-600 mb-1">CCNL applicato</label>
              <input id="imp-ccnl" type="text" x-model="formDati.ccnlApplicato"
                     class="w-full border border-slate-300 rounded-md px-3 py-2 text-sm
                            focus:outline-none focus:ring-2 focus:ring-blue-500">
            </div>
            <div>
              <label for="imp-organico" class="block text-xs font-medium text-slate-600 mb-1">Organico medio annuo</label>
              <input id="imp-organico" type="number" min="1"
                     :value="formDati.organicoMedioAnnuo ?? ''"
                     @input="formDati.organicoMedioAnnuo = $event.target.value ? +$event.target.value : null"
                     class="w-full border border-slate-300 rounded-md px-3 py-2 text-sm
                            focus:outline-none focus:ring-2 focus:ring-blue-500">
            </div>
          </div>
        </details>

        <!-- ── 6. Documenti ─────────────────────────────────────── -->
        <details open class="border border-slate-200 rounded-xl overflow-hidden">
          <summary class="px-4 py-3 bg-slate-50 cursor-pointer text-sm font-medium text-slate-700
                          hover:bg-slate-100 list-none flex items-center justify-between">
            <span>Documenti allegati</span>
            <span x-show="!formDati.tipoRapporto" class="text-xs text-slate-400 font-normal">
              (seleziona tipo rapporto per vedere i documenti attesi)
            </span>
          </summary>
          <div class="p-4 space-y-3">

            <template x-for="docDef in $data._tipiDocumento()" :key="docDef.tipo">
              <div :class="{
                     'border-l-4 border-blue-400':   categoriaDoc(docDef.tipo) === 'obbligatorio',
                     'border-l-4 border-yellow-400':  categoriaDoc(docDef.tipo) === 'condizionato',
                     'border-l-2 border-slate-200':   categoriaDoc(docDef.tipo) === 'non_pertinente',
                   }"
                   class="pl-3 py-2 rounded-r-lg"
                   :style="categoriaDoc(docDef.tipo) === 'non_pertinente' ? 'opacity:0.55' : ''">

                <div class="flex items-start justify-between gap-2">
                  <div class="flex-1">
                    <!-- Label + badge categoria -->
                    <div class="flex items-center gap-2 flex-wrap">
                      <span class="text-xs font-medium text-slate-700" x-text="docDef.label"></span>
                      <span x-show="categoriaDoc(docDef.tipo) === 'obbligatorio' && !getDocumento(docDef.tipo)"
                            class="text-xs bg-red-100 text-red-700 px-1.5 rounded">obbligatorio</span>
                      <span x-show="categoriaDoc(docDef.tipo) === 'condizionato' && !getDocumento(docDef.tipo)"
                            class="text-xs bg-yellow-100 text-yellow-700 px-1.5 rounded">condizionato</span>
                      <span x-show="categoriaDoc(docDef.tipo) === 'non_pertinente'"
                            class="text-xs bg-slate-100 text-slate-400 px-1.5 rounded">non pertinente</span>
                    </div>

                    <!-- Documento presente: mostra nome + scadenza + cestina -->
                    <template x-if="getDocumento(docDef.tipo)">
                      <div class="mt-1.5 flex items-center gap-3 flex-wrap">
                        <span class="text-xs text-blue-700 bg-blue-50 border border-blue-200 px-2 py-0.5 rounded"
                              x-text="'📎 ' + getDocumento(docDef.tipo)?.filename"></span>
                        <div class="flex items-center gap-1">
                          <label :for="'scad-' + docDef.tipo" class="text-xs text-slate-400">Scadenza:</label>
                          <input :id="'scad-' + docDef.tipo" type="date"
                                 :value="getDocumento(docDef.tipo)?.scadenza ?? ''"
                                 @input="getDocumento(docDef.tipo).scadenza = $event.target.value || null; formDati = {...formDati}"
                                 class="border border-slate-200 rounded px-2 py-0.5 text-xs
                                        focus:outline-none focus:ring-2 focus:ring-blue-500">
                        </div>
                        <button @click="cestinaDocumento(docDef.tipo)"
                                class="text-xs text-red-400 hover:text-red-600 underline
                                       focus:outline-none focus:ring-1 focus:ring-red-400 rounded">
                          Rimuovi
                        </button>
                      </div>
                    </template>
                  </div>

                  <!-- Upload: input file nascosto, pulsante accessibile -->
                  <div class="flex-shrink-0">
                    <input type="file" accept=".pdf,.png,.jpg,.jpeg"
                           :id="'upload-' + docDef.tipo"
                           @change="onDocumentoFile(docDef.tipo, $event)"
                           class="sr-only" tabindex="-1" aria-hidden="true">
                    <button type="button"
                            @click="document.getElementById('upload-' + docDef.tipo)?.click()"
                            class="text-xs text-blue-600 hover:text-blue-800 border border-blue-300
                                   px-2 py-1 rounded hover:bg-blue-50 transition-colors
                                   focus:outline-none focus:ring-2 focus:ring-blue-500"
                            :aria-label="(getDocumento(docDef.tipo) ? 'Sostituisci ' : 'Carica ') + docDef.label">
                      <span x-text="getDocumento(docDef.tipo) ? '↑ Sostituisci' : '📎 Carica'"></span>
                    </button>
                  </div>
                </div>
              </div>
            </template>

          </div>
        </details>

      </div><!-- /corpo form -->

      <!-- Footer drawer: note warning + Salva -->
      <!-- Fascia 3: footer — flex-shrink:0 → Salva sempre visibile in fondo -->
      <div class="px-5 py-4 border-t border-slate-200 bg-slate-50" style="flex-shrink:0">
        <p class="text-xs text-slate-400 mb-3">
          Il salvataggio non è mai bloccato: i campi contrassegnati come "consigliati" generano
          solo avvisi, non errori.
        </p>
        <div class="flex gap-3 justify-end">
          <button @click="chiudiDrawer(false)"
                  class="text-sm text-slate-500 hover:text-slate-700 px-4 py-2
                         border border-slate-300 rounded-lg transition-colors
                         focus:outline-none focus:ring-2 focus:ring-slate-400">
            Annulla
          </button>
          <button @click="salvaImpresa()" :disabled="salvando"
                  class="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white
                         text-sm font-medium px-5 py-2 rounded-lg transition-colors
                         focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2">
            <span x-text="salvando ? 'Salvataggio…' : 'Salva impresa'"></span>
          </button>
        </div>
      </div>

  </div><!-- /drawer -->

</div>
`;

// ── Registrazione ──────────────────────────────────────────────────────────

window.MODULI_REGISTRATI = window.MODULI_REGISTRATI ?? {};
window.MODULI_REGISTRATI['imprese'] = {
  monta(contenitore) { contenitore.innerHTML = _TEMPLATE_IMPRESE; },
};
