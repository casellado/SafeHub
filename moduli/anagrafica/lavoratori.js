/**
 * lavoratori.js — M4 Fase 2: collezione Lavoratori.
 *
 * Pattern identico a imprese.js: cruscotto + drawer 40% fixed right.
 * Il selettore impresa (FK impresa_id) pesca dalle imprese della Fase 1.
 * Conformità interamente scadenziale (no matrice §12).
 * I tipi di abilitazione e la logica di criticità vivono in anagrafica-service.js
 * (TIPI_ABILITAZIONE_OPERATORE) — modificare lì per aggiungere/togliere tipi.
 */

// ── Utilità private ─────────────────────────────────────────────────────────

const _leggiFileBase64Lav = (file) =>
  new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload  = (e) => resolve(e.target.result);
    r.onerror = ()  => reject(new Error('Lettura file non riuscita'));
    r.readAsDataURL(file);
  });

// ── Componente Alpine ────────────────────────────────────────────────────────

function ListaLavoratori() {
  return {
    // Lista
    lavoratori:      [],
    imprese:         [],
    caricamento:     true,
    cercaTesto:      '',
    filtroImpresaId: '',
    mostraCestino:   false,

    // Drawer
    drawerAperto:              false,
    formDati:                  {},
    formNuova:                 true,
    salvando:                  false,
    modificatoDopoCaricamento: false,

    _cantiereId: null,

    // ── Computed ─────────────────────────────────────────────────────────────

    get lavFiltrati() {
      const t = this.cercaTesto.toLowerCase();
      return this.lavoratori
        .filter(l => !l._cestino)
        .filter(l => !this.filtroImpresaId || l.impresa_id === this.filtroImpresaId)
        .filter(l => !t || [l.nome, l.cognome, l.codiceFiscale, l.mansione]
          .some(v => v?.toLowerCase().includes(t)));
    },

    get lavCestino() { return this.lavoratori.filter(l => l._cestino); },

    get contatori() {
      const attivi = this.lavoratori.filter(l => !l._cestino);
      const conf   = attivi.map(l => ANAGRAFICA_SERVICE.calcolaConformitaLavoratore(l));
      return {
        totale: attivi.length,
        verde:  conf.filter(c => c.stato === 'verde').length,
        giallo: conf.filter(c => c.stato === 'giallo').length,
        rosso:  conf.filter(c => c.stato === 'rosso').length,
      };
    },

    // Alert rossi critici (scadenze già scadute con criticità 'critica')
    get alertCritici() {
      return this.lavoratori.filter(l => !l._cestino).flatMap(l => {
        const conf = ANAGRAFICA_SERVICE.calcolaConformitaLavoratore(l);
        return conf.scadenze
          .filter(s => s.stato === 'scaduto' && s.criticita === 'critica')
          .map(s => ({ lavoratoreId: l.id, nominativo: `${l.cognome ?? ''} ${l.nome ?? ''}`.trim() || l.id, ...s }));
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

    aggiornaSeCantiereRicambia() {
      const id = Alpine.store('cantiere')?.id;
      if (id !== this._cantiereId) {
        this._cantiereId   = id;
        this.filtroImpresaId = '';   // reset filtro: impresa_id del vecchio cantiere non esiste qui
        if (!id) { this.lavoratori = []; this.imprese = []; this.caricamento = false; return; }
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
      this.lavoratori = [...(ANAGRAFICA_SERVICE.get('lavoratori', { inclCestino: true }) ?? [])];
      this.imprese    = [...(ANAGRAFICA_SERVICE.get('imprese') ?? [])];
      this.caricamento = false;
    },

    // ── Drawer ───────────────────────────────────────────────────────────────

    nuovoLavoratore() {
      this.formDati  = ANAGRAFICA_SERVICE.creaEntitaVuota('lavoratori');
      this.formNuova = true;
      this.modificatoDopoCaricamento = false;
      this.drawerAperto = true;
      this.$nextTick(() => document.getElementById('lav-cognome')?.focus());
    },

    modificaLavoratore(id) {
      const lav = this.lavoratori.find(l => l.id === id);
      if (!lav) return;
      this.formDati = JSON.parse(JSON.stringify(lav));
      this.formDati.abilitazioni           ??= [];
      this.formDati.visitaMedica           ??= {};
      this.formDati.attestatoFormazione    ??= {};
      this.formDati.tesseraRiconoscimento  ??= { presente: false };
      this.formDati.badgeCantiere          ??= { codice: null, presente: false };
      this.formDati.ruoliSpeciali          ??= [];
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

    async salvaLavoratore() {
      this.salvando = true;
      try {
        if (this.formNuova) {
          await ANAGRAFICA_SERVICE.aggiungi('lavoratori', this.formDati);
        } else {
          await ANAGRAFICA_SERVICE.aggiorna('lavoratori', this.formDati.id, this.formDati);
        }
        this.caricaDati();
        this.chiudiDrawer(true);
        NOTIFICHE.successo(this.formNuova ? 'Lavoratore aggiunto' : 'Lavoratore aggiornato');
      } catch (err) {
        ERRORI.gestisciErrore('lavoratori/salva', err);
      } finally {
        this.salvando = false;
      }
    },

    // ── Cestino ──────────────────────────────────────────────────────────────

    async cestinaLavoratore(id) {
      try {
        await ANAGRAFICA_SERVICE.cestina('lavoratori', id);
        this.caricaDati();
        NOTIFICHE.info('Lavoratore spostato nel cestino');
      } catch (err) { ERRORI.gestisciErrore('lavoratori/cestina', err); }
    },

    async ripristinaLavoratore(id) {
      try {
        await ANAGRAFICA_SERVICE.ripristina('lavoratori', id);
        this.caricaDati();
        NOTIFICHE.successo('Lavoratore ripristinato');
      } catch (err) { ERRORI.gestisciErrore('lavoratori/ripristina', err); }
    },

    async eliminaDefinitivamente(id) {
      if (!confirm('Eliminare definitivamente questo lavoratore? Non è reversibile.')) return;
      try {
        await ANAGRAFICA_SERVICE.eliminaDefinitivamente('lavoratori', id);
        this.caricaDati();
      } catch (err) { ERRORI.gestisciErrore('lavoratori/elimina', err); }
    },

    // ── Abilitazioni (lista dinamica) ─────────────────────────────────────

    aggiungiAbilitazione() {
      if (!this.formDati.abilitazioni) this.formDati.abilitazioni = [];
      this.formDati.abilitazioni.push({ tipo: '', numero: '', scadenza: null, filename: null, base64: null });
      this.formDati = { ...this.formDati };
      this.modificatoDopoCaricamento = true;
    },

    rimuoviAbilitazione(idx) {
      this.formDati.abilitazioni.splice(idx, 1);
      this.formDati = { ...this.formDati };
      this.modificatoDopoCaricamento = true;
    },

    async onAbilitazioneFile(idx, event) {
      const file = event.target.files?.[0];
      if (!file) return;
      const base64 = await _leggiFileBase64Lav(file);
      this.formDati.abilitazioni[idx] = { ...this.formDati.abilitazioni[idx], filename: file.name, base64 };
      this.formDati = { ...this.formDati };
      this.modificatoDopoCaricamento = true;
    },

    // Upload generico (visita medica, formazione)
    async onDocumentoFile(campo, event) {
      const file = event.target.files?.[0];
      if (!file) return;
      const base64 = await _leggiFileBase64Lav(file);
      this.formDati[campo] = { ...(this.formDati[campo] ?? {}), filename: file.name, base64 };
      this.formDati = { ...this.formDati };
      this.modificatoDopoCaricamento = true;
    },

    // ── Ruoli speciali ────────────────────────────────────────────────────

    toggleRuolo(ruolo) {
      if (!this.formDati.ruoliSpeciali) this.formDati.ruoliSpeciali = [];
      const idx = this.formDati.ruoliSpeciali.indexOf(ruolo);
      if (idx >= 0) { this.formDati.ruoliSpeciali.splice(idx, 1); }
      else           { this.formDati.ruoliSpeciali.push(ruolo); }
      this.formDati = { ...this.formDati };
      this.modificatoDopoCaricamento = true;
    },

    hasRuolo(ruolo) { return this.formDati.ruoliSpeciali?.includes(ruolo) ?? false; },

    // ── Helper UI ─────────────────────────────────────────────────────────

    nomeImpresa(impresaId) {
      return this.imprese.find(i => i.id === impresaId)?.ragioneSociale ?? null;
    },

    conformita(lav)     { return ANAGRAFICA_SERVICE.calcolaConformitaLavoratore(lav); },

    semaforoClass(stato) {
      if (stato === 'verde') return 'bg-green-100 text-green-700';
      if (stato === 'giallo') return 'bg-yellow-100 text-yellow-700';
      if (stato === 'rosso')  return 'bg-red-100 text-red-700';
      return 'bg-slate-100 text-slate-500';
    },

    // Controlla se il tipo di abilitazione è uno di quelli predefiniti
    tipoInLista(tipo) {
      return ANAGRAFICA_SERVICE.TIPI_ABILITAZIONE_OPERATORE.some(t => t.valore === tipo);
    },

    // Espone la lista al template Alpine (non può accedere a variabili di modulo direttamente)
    _tipiAbilitazione() { return ANAGRAFICA_SERVICE.TIPI_ABILITAZIONE_OPERATORE; },
    _imprese()          { return this.imprese; },
  };
}

// ── Template HTML ─────────────────────────────────────────────────────────────

const _TEMPLATE_LAVORATORI = `
<div x-data="ListaLavoratori()" x-init="init()" x-effect="aggiornaSeCantiereRicambia()" class="max-w-5xl">

  <!-- Header -->
  <div class="flex items-center justify-between mb-5">
    <div>
      <h1 class="text-xl font-semibold text-slate-800">👷 Lavoratori</h1>
      <p class="text-xs text-slate-400 mt-0.5"
         x-text="contatori.totale + ' lavoratori: ' + contatori.verde + ' ✓  ' + contatori.giallo + ' ⚠  ' + contatori.rosso + ' ✕'">
      </p>
    </div>
    <button @click="nuovoLavoratore()" x-show="$store.cantiere.id"
            class="bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium
                   px-4 py-2 rounded-lg transition-colors
                   focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2">
      + Nuovo lavoratore
    </button>
  </div>

  <!-- Nessun cantiere -->
  <div x-show="!$store.cantiere.id" class="placeholder-modulo">
    <div class="text-3xl" aria-hidden="true">👷</div>
    <p class="text-slate-500">Seleziona un cantiere per gestire i lavoratori.</p>
  </div>

  <div x-show="$store.cantiere.id">
    <div x-show="caricamento" class="flex items-center gap-3 py-10 text-slate-400 text-sm">
      <div class="w-5 h-5 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
      Caricamento lavoratori…
    </div>

    <div x-show="!caricamento">

      <!-- ── Alert critici ─────────────────────────────────────── -->
      <div x-show="alertCritici.length > 0"
           class="mb-4 border border-red-200 bg-red-50 rounded-xl p-4" role="alert">
        <p class="text-sm font-semibold text-red-800 mb-2">
          🔴 <span x-text="alertCritici.length"></span> scadenza/e critica/e (non silenziabile/e)
        </p>
        <ul class="space-y-1">
          <template x-for="a in alertCritici" :key="a.lavoratoreId + '_' + a.tipo">
            <li class="text-xs text-red-700">
              <button @click="modificaLavoratore(a.lavoratoreId)"
                      class="font-semibold underline hover:no-underline mr-1
                             focus:outline-none focus:ring-1 focus:ring-red-600 rounded"
                      x-text="a.nominativo"></button>
              — <span x-text="a.label"></span>
              <span x-show="a.giorni < 0"> (scaduta <span x-text="Math.abs(a.giorni)"></span> gg fa)</span>
              <span x-show="a.giorni >= 0"> (scade tra <span x-text="a.giorni"></span> gg)</span>
            </li>
          </template>
        </ul>
      </div>

      <!-- ── Barra strumenti ───────────────────────────────────── -->
      <div class="flex flex-wrap gap-3 mb-4">
        <input type="search" x-model="cercaTesto"
               placeholder="Cerca per nome, cognome o C.F.…"
               class="flex-1 min-w-48 border border-slate-300 rounded-md px-3 py-2 text-sm
                      focus:outline-none focus:ring-2 focus:ring-blue-500">
        <select x-model="filtroImpresaId"
                class="border border-slate-300 rounded-md px-3 py-2 text-sm
                       focus:outline-none focus:ring-2 focus:ring-blue-500">
          <option value="">Tutte le imprese</option>
          <template x-for="imp in _imprese()" :key="imp.id">
            <option :value="imp.id" x-text="imp.ragioneSociale"></option>
          </template>
        </select>
      </div>

      <!-- ── Lista lavoratori ──────────────────────────────────── -->
      <div role="list" aria-label="Lista lavoratori" class="space-y-2">

        <div x-show="lavFiltrati.length === 0"
             class="py-12 text-center text-slate-400">
          <div class="text-3xl mb-2" aria-hidden="true">👷</div>
          <p x-show="!cercaTesto && !filtroImpresaId">
            Nessun lavoratore. Clicca "+ Nuovo lavoratore" per iniziare.
          </p>
          <p x-show="cercaTesto || filtroImpresaId">
            Nessun lavoratore corrisponde ai filtri applicati.
          </p>
        </div>

        <template x-for="lav in lavFiltrati" :key="lav.id">
          <div role="listitem"
               class="border border-slate-200 bg-white hover:border-slate-300
                      rounded-xl px-4 py-3 flex items-center gap-4 transition-all">

            <!-- Semaforo -->
            <span :class="semaforoClass(conformita(lav).stato)"
                  class="flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold"
                  :title="conformita(lav).scadenze.length + ' problema/i'"
                  aria-hidden="true">
              <span x-text="conformita(lav).stato === 'verde' ? '✓' : conformita(lav).stato === 'giallo' ? '⚠' : conformita(lav).stato === 'rosso' ? '✕' : '—'"></span>
            </span>

            <!-- Info -->
            <div class="flex-1 min-w-0">
              <div class="flex items-center gap-2 flex-wrap">
                <span class="font-medium text-slate-800"
                      x-text="[lav.cognome, lav.nome].filter(Boolean).join(' ') || '(senza nome)'">
                </span>
                <span x-show="lav.mansione"
                      class="text-xs text-slate-500" x-text="lav.mansione"></span>
                <!-- Badge impresa -->
                <template x-if="nomeImpresa(lav.impresa_id)">
                  <span class="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full flex-shrink-0"
                        x-text="nomeImpresa(lav.impresa_id)"></span>
                </template>
                <template x-if="!lav.impresa_id">
                  <span class="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full flex-shrink-0">
                    ⚠ Non assegnato
                  </span>
                </template>
              </div>
              <!-- Scadenza più urgente -->
              <template x-if="conformita(lav).scadenze.length > 0">
                <p class="text-xs mt-0.5"
                   :class="conformita(lav).scadenze[0].stato === 'scaduto' ? 'text-red-600' : 'text-amber-600'"
                   x-text="conformita(lav).scadenze[0].label + ': ' + (conformita(lav).scadenze[0].giorni < 0 ? 'scaduta ' + Math.abs(conformita(lav).scadenze[0].giorni) + ' gg fa' : 'tra ' + conformita(lav).scadenze[0].giorni + ' gg')">
                </p>
              </template>
            </div>

            <!-- Azioni -->
            <div class="flex gap-2 flex-shrink-0">
              <button @click="modificaLavoratore(lav.id)"
                      class="text-sm text-slate-600 hover:text-slate-900 px-3 py-1.5
                             border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors
                             focus:outline-none focus:ring-2 focus:ring-slate-400"
                      :aria-label="'Modifica ' + lav.cognome">✏ Modifica</button>
              <button @click="cestinaLavoratore(lav.id)"
                      class="text-sm text-red-400 hover:text-red-700 px-2 py-1.5
                             rounded-lg hover:bg-red-50 transition-colors
                             focus:outline-none focus:ring-2 focus:ring-red-400"
                      title="Sposta nel cestino">🗑</button>
            </div>
          </div>
        </template>
      </div>

      <!-- ── Cestino ─────────────────────────────────────────────── -->
      <div class="mt-6">
        <button @click="mostraCestino = !mostraCestino"
                class="text-xs text-slate-400 hover:text-slate-600 underline
                       focus:outline-none focus:ring-2 focus:ring-slate-400 rounded">
          <span x-text="(mostraCestino ? '▾ Nascondi' : '▸ Mostra') + ' cestino (' + lavCestino.length + ')'"></span>
        </button>
        <div x-show="mostraCestino && lavCestino.length > 0" class="mt-3 space-y-2">
          <template x-for="lav in lavCestino" :key="lav.id">
            <div class="border border-slate-200 bg-slate-50 rounded-xl px-4 py-3
                        flex items-center gap-4 opacity-60 hover:opacity-80 transition-opacity">
              <div class="flex-1 min-w-0">
                <span class="text-sm text-slate-600 line-through"
                      x-text="[lav.cognome, lav.nome].filter(Boolean).join(' ') || '(senza nome)'"></span>
                <p class="text-xs text-slate-400"
                   x-text="'Eliminato il ' + UTILS.formatData(lav._eliminato_il)"></p>
              </div>
              <div class="flex gap-2">
                <button @click="ripristinaLavoratore(lav.id)"
                        class="text-xs text-green-700 px-2 py-1 border border-green-300
                               rounded-lg hover:bg-green-50 transition-colors
                               focus:outline-none focus:ring-2 focus:ring-green-400">
                  ↩ Ripristina
                </button>
                <button @click="eliminaDefinitivamente(lav.id)"
                        class="text-xs text-red-500 px-2 py-1 rounded-lg hover:bg-red-50 transition-colors
                               focus:outline-none focus:ring-2 focus:ring-red-400">
                  Elimina definitivamente
                </button>
              </div>
            </div>
          </template>
        </div>
        <p x-show="mostraCestino && lavCestino.length === 0"
           class="text-xs text-slate-400 mt-2">Il cestino è vuoto.</p>
      </div>

    </div><!-- /!caricamento -->
  </div><!-- /$store.cantiere.id -->

  <!-- ═══════════════════════════════════════════════════════════════
       DRAWER: Editor lavoratore — stesso pattern di Imprese.
       position:fixed top:--header-height right:0 bottom:0 width:44%
       Tre fasce flex: header fisso / corpo scrollabile / footer Salva.
       ═══════════════════════════════════════════════════════════════ -->
  <div x-show="drawerAperto" x-cloak
       @input="modificatoDopoCaricamento = true"
       @keydown.escape.window="chiudiDrawer(false)"
       style="position:fixed;top:var(--header-height);right:0;bottom:0;
              width:44%;max-width:640px;min-width:320px;z-index:100;
              display:flex;flex-direction:column;
              background:white;box-shadow:-4px 0 32px rgba(0,0,0,0.15);
              border-left:1px solid rgba(0,0,0,0.07)"
       role="dialog" aria-modal="true" aria-label="Editor lavoratore">

    <!-- Fascia 1: header fisso -->
    <div class="flex items-center justify-between px-5 py-4 border-b border-slate-200 bg-white"
         style="flex-shrink:0">
      <h2 class="text-base font-semibold text-slate-800">
        <span x-text="formNuova ? 'Nuovo lavoratore' : ([formDati.cognome, formDati.nome].filter(Boolean).join(' ') || 'Modifica lavoratore')"></span>
      </h2>
      <button @click="chiudiDrawer(false)" aria-label="Chiudi"
              class="p-1.5 rounded hover:bg-slate-100 text-slate-500 text-lg
                     focus:outline-none focus:ring-2 focus:ring-slate-400">✕</button>
    </div>

    <!-- Fascia 2: corpo scrollabile -->
    <div class="px-5 py-4 space-y-3" style="flex:1;overflow-y:auto;min-height:0">

      <!-- ── 1. Assegnazione impresa ────────────────────────────── -->
      <details open class="border border-slate-200 rounded-xl overflow-hidden">
        <summary class="px-4 py-3 bg-slate-50 cursor-pointer text-sm font-medium text-slate-700
                        hover:bg-slate-100 list-none flex items-center justify-between">
          Impresa di appartenenza <span class="text-slate-400 text-xs" aria-hidden="true">▾</span>
        </summary>
        <div class="p-4">
          <label for="lav-impresa" class="block text-xs font-medium text-slate-600 mb-1">
            Impresa <span class="text-slate-400 font-normal">(FK a collezione imprese)</span>
          </label>
          <select id="lav-impresa" x-model="formDati.impresa_id"
                  class="w-full border border-slate-300 rounded-md px-3 py-2 text-sm
                         focus:outline-none focus:ring-2 focus:ring-blue-500">
            <option value="">— Nessuna impresa assegnata —</option>
            <template x-for="imp in _imprese()" :key="imp.id">
              <option :value="imp.id" x-text="imp.ragioneSociale"></option>
            </template>
          </select>
          <!-- Guida gentile: nessuna impresa disponibile -->
          <p x-show="_imprese().length === 0"
             class="mt-2 text-xs text-amber-700 bg-amber-50 border border-amber-200
                    rounded-lg px-3 py-1.5">
            ℹ Nessuna impresa disponibile in questo cantiere.
            Aggiungi prima un'impresa dalla sezione Anagrafiche → Imprese.
            Il lavoratore può essere salvato comunque.
          </p>
          <p x-show="_imprese().length > 0 && !formDati.impresa_id"
             class="mt-1 text-xs text-slate-400">
            Il lavoratore può essere salvato senza impresa — apparirà come "Non assegnato".
          </p>
        </div>
      </details>

      <!-- ── 2. Dati anagrafici ─────────────────────────────────── -->
      <details open class="border border-slate-200 rounded-xl overflow-hidden">
        <summary class="px-4 py-3 bg-slate-50 cursor-pointer text-sm font-medium text-slate-700
                        hover:bg-slate-100 list-none flex items-center justify-between">
          Dati anagrafici <span class="text-slate-400 text-xs" aria-hidden="true">▾</span>
        </summary>
        <div class="p-4 grid gap-3 sm:grid-cols-2">
          <div>
            <label for="lav-cognome" class="block text-xs font-medium text-slate-600 mb-1">Cognome</label>
            <input id="lav-cognome" type="text" x-model="formDati.cognome" placeholder="ROSSI"
                   class="w-full border border-slate-300 rounded-md px-3 py-2 text-sm
                          focus:outline-none focus:ring-2 focus:ring-blue-500">
          </div>
          <div>
            <label for="lav-nome" class="block text-xs font-medium text-slate-600 mb-1">Nome</label>
            <input id="lav-nome" type="text" x-model="formDati.nome" placeholder="Mario"
                   class="w-full border border-slate-300 rounded-md px-3 py-2 text-sm
                          focus:outline-none focus:ring-2 focus:ring-blue-500">
          </div>
          <div>
            <label for="lav-cf" class="block text-xs font-medium text-slate-600 mb-1">Codice fiscale</label>
            <input id="lav-cf" type="text" x-model="formDati.codiceFiscale"
                   @input="formDati.codiceFiscale = $event.target.value.toUpperCase()"
                   placeholder="RSSMRA80A01H501Z"
                   class="w-full border border-slate-300 rounded-md px-3 py-2 text-sm font-mono
                          focus:outline-none focus:ring-2 focus:ring-blue-500">
          </div>
          <div>
            <label for="lav-mansione" class="block text-xs font-medium text-slate-600 mb-1">Mansione</label>
            <input id="lav-mansione" type="text" x-model="formDati.mansione"
                   placeholder="es. Carpentiere, Ferraiolo"
                   class="w-full border border-slate-300 rounded-md px-3 py-2 text-sm
                          focus:outline-none focus:ring-2 focus:ring-blue-500">
          </div>
          <div>
            <label for="lav-nascita" class="block text-xs font-medium text-slate-600 mb-1">Data di nascita</label>
            <input id="lav-nascita" type="date" x-model="formDati.dataNascita"
                   class="w-full border border-slate-300 rounded-md px-3 py-2 text-sm
                          focus:outline-none focus:ring-2 focus:ring-blue-500">
          </div>
          <div>
            <label for="lav-luogo" class="block text-xs font-medium text-slate-600 mb-1">Luogo di nascita</label>
            <input id="lav-luogo" type="text" x-model="formDati.luogoNascita"
                   class="w-full border border-slate-300 rounded-md px-3 py-2 text-sm
                          focus:outline-none focus:ring-2 focus:ring-blue-500">
          </div>
          <div>
            <label for="lav-tel" class="block text-xs font-medium text-slate-600 mb-1">Telefono</label>
            <input id="lav-tel" type="tel" x-model="formDati.telefono"
                   class="w-full border border-slate-300 rounded-md px-3 py-2 text-sm
                          focus:outline-none focus:ring-2 focus:ring-blue-500">
          </div>
          <div>
            <label for="lav-email" class="block text-xs font-medium text-slate-600 mb-1">Email</label>
            <input id="lav-email" type="email" x-model="formDati.email"
                   class="w-full border border-slate-300 rounded-md px-3 py-2 text-sm
                          focus:outline-none focus:ring-2 focus:ring-blue-500">
          </div>
        </div>
      </details>

      <!-- ── 3. Idoneità sanitaria ──────────────────────────────── -->
      <details open class="border border-slate-200 rounded-xl overflow-hidden">
        <summary class="px-4 py-3 bg-slate-50 cursor-pointer text-sm font-medium text-slate-700
                        hover:bg-slate-100 list-none flex items-center justify-between">
          <span>Idoneità sanitaria</span>
          <span x-show="formDati.visitaMedica?.scadenza"
                class="text-xs font-normal"
                :class="UTILS.giorniAllaScadenza(formDati.visitaMedica?.scadenza) < 0 ? 'text-red-600 font-semibold' : 'text-slate-400'"
                x-text="'scad. ' + UTILS.formatData(formDati.visitaMedica?.scadenza)">
          </span>
        </summary>
        <div class="p-4 grid gap-3 sm:grid-cols-2">
          <div class="sm:col-span-2">
            <label for="lav-vm-ente" class="block text-xs font-medium text-slate-600 mb-1">Medico / Ente</label>
            <input id="lav-vm-ente" type="text"
                   :value="formDati.visitaMedica?.ente ?? ''"
                   @input="(formDati.visitaMedica ??= {}).ente = $event.target.value || null"
                   class="w-full border border-slate-300 rounded-md px-3 py-2 text-sm
                          focus:outline-none focus:ring-2 focus:ring-blue-500">
          </div>
          <div>
            <label for="lav-vm-data" class="block text-xs font-medium text-slate-600 mb-1">Data visita</label>
            <input id="lav-vm-data" type="date"
                   :value="formDati.visitaMedica?.data ?? ''"
                   @input="(formDati.visitaMedica ??= {}).data = $event.target.value || null"
                   class="w-full border border-slate-300 rounded-md px-3 py-2 text-sm
                          focus:outline-none focus:ring-2 focus:ring-blue-500">
          </div>
          <div>
            <label for="lav-vm-scad" class="block text-xs font-medium text-slate-600 mb-1">
              Scadenza idoneità 🔴
            </label>
            <input id="lav-vm-scad" type="date"
                   :value="formDati.visitaMedica?.scadenza ?? ''"
                   @input="(formDati.visitaMedica ??= {}).scadenza = $event.target.value || null"
                   class="w-full border border-slate-300 rounded-md px-3 py-2 text-sm
                          focus:outline-none focus:ring-2 focus:ring-blue-500"
                   :class="UTILS.giorniAllaScadenza(formDati.visitaMedica?.scadenza) < 0 ? 'border-red-400 bg-red-50' : ''">
          </div>
          <div class="sm:col-span-2">
            <label class="flex items-center gap-2 text-xs font-medium text-slate-600 mb-1 cursor-pointer">
              <input type="file" accept=".pdf,.png,.jpg" class="sr-only"
                     @change="onDocumentoFile('visitaMedica', $event)">
              <span x-text="formDati.visitaMedica?.filename ? '📎 ' + formDati.visitaMedica.filename : '📎 Allega documento'">
              </span>
            </label>
          </div>
        </div>
      </details>

      <!-- ── 4. Formazione ──────────────────────────────────────── -->
      <details open class="border border-slate-200 rounded-xl overflow-hidden">
        <summary class="px-4 py-3 bg-slate-50 cursor-pointer text-sm font-medium text-slate-700
                        hover:bg-slate-100 list-none flex items-center justify-between">
          <span>Attestato formazione</span>
          <span x-show="formDati.attestatoFormazione?.scadenza"
                class="text-xs font-normal"
                :class="UTILS.giorniAllaScadenza(formDati.attestatoFormazione?.scadenza) < 0 ? 'text-red-600 font-semibold' : 'text-slate-400'"
                x-text="'scad. ' + UTILS.formatData(formDati.attestatoFormazione?.scadenza)">
          </span>
        </summary>
        <div class="p-4 grid gap-3 sm:grid-cols-2">
          <div>
            <label for="lav-af-num" class="block text-xs font-medium text-slate-600 mb-1">N. attestato</label>
            <input id="lav-af-num" type="text"
                   :value="formDati.attestatoFormazione?.numero ?? ''"
                   @input="(formDati.attestatoFormazione ??= {}).numero = $event.target.value || null"
                   class="w-full border border-slate-300 rounded-md px-3 py-2 text-sm
                          focus:outline-none focus:ring-2 focus:ring-blue-500">
          </div>
          <div>
            <label for="lav-af-scad" class="block text-xs font-medium text-slate-600 mb-1">
              Scadenza 🟠
            </label>
            <input id="lav-af-scad" type="date"
                   :value="formDati.attestatoFormazione?.scadenza ?? ''"
                   @input="(formDati.attestatoFormazione ??= {}).scadenza = $event.target.value || null"
                   class="w-full border border-slate-300 rounded-md px-3 py-2 text-sm
                          focus:outline-none focus:ring-2 focus:ring-blue-500">
          </div>
          <div class="sm:col-span-2">
            <label class="flex items-center gap-2 text-xs font-medium text-slate-600 mb-1 cursor-pointer">
              <input type="file" accept=".pdf,.png,.jpg" class="sr-only"
                     @change="onDocumentoFile('attestatoFormazione', $event)">
              <span x-text="formDati.attestatoFormazione?.filename ? '📎 ' + formDati.attestatoFormazione.filename : '📎 Allega documento'">
              </span>
            </label>
          </div>
        </div>
      </details>

      <!-- ── 5. Abilitazioni (lista dinamica) ──────────────────── -->
      <details class="border border-slate-200 rounded-xl overflow-hidden">
        <summary class="px-4 py-3 bg-slate-50 cursor-pointer text-sm font-medium text-slate-700
                        hover:bg-slate-100 list-none flex items-center justify-between">
          <span>Abilitazioni / patentini
            <span x-show="(formDati.abilitazioni ?? []).length > 0"
                  class="ml-1 text-xs font-normal text-slate-400"
                  x-text="'(' + (formDati.abilitazioni ?? []).length + ')'"></span>
          </span>
          <span class="text-slate-400 text-xs" aria-hidden="true">▾</span>
        </summary>
        <div class="p-4 space-y-3">
          <p class="text-xs text-slate-400">
            🔴 = critica (Accordo Stato-Regioni 22/02/2012) — operatore non può condurre quel mezzo se scaduta.
          </p>

          <template x-for="(ab, idx) in (formDati.abilitazioni ?? [])" :key="idx">
            <div class="border border-slate-200 rounded-lg p-3 space-y-2 relative">
              <button @click="rimuoviAbilitazione(idx)" type="button"
                      class="absolute top-2 right-2 text-red-400 hover:text-red-700
                             text-sm focus:outline-none" aria-label="Rimuovi abilitazione">×</button>

              <!-- Select tipo + input libero per ALTRO -->
              <div class="grid gap-2 sm:grid-cols-2">
                <div>
                  <label class="block text-xs text-slate-500 mb-1">Tipo</label>
                  <select
                    :value="tipoInLista(ab.tipo) ? ab.tipo : (ab.tipo ? 'ALTRO' : '')"
                    @change="if($event.target.value !== 'ALTRO') { formDati.abilitazioni[idx].tipo = $event.target.value } else { formDati.abilitazioni[idx].tipo = '' }; formDati={...formDati}"
                    class="w-full border border-slate-300 rounded px-2 py-1.5 text-xs
                           focus:outline-none focus:ring-2 focus:ring-blue-500">
                    <option value="">— Seleziona —</option>
                    <template x-for="t in _tipiAbilitazione()" :key="t.valore">
                      <option :value="t.valore"
                              x-text="t.etichetta + (t.critica ? ' 🔴' : '')"></option>
                    </template>
                  </select>
                  <!-- Testo libero per ALTRO -->
                  <input x-show="!tipoInLista(ab.tipo)"
                         type="text"
                         :value="ab.tipo"
                         @input="formDati.abilitazioni[idx].tipo = $event.target.value; formDati={...formDati}"
                         placeholder="Descrivi l'abilitazione"
                         class="mt-1.5 w-full border border-slate-300 rounded px-2 py-1.5 text-xs
                                focus:outline-none focus:ring-2 focus:ring-blue-500">
                </div>
                <div>
                  <label class="block text-xs text-slate-500 mb-1">N. attestato</label>
                  <input type="text"
                         :value="ab.numero ?? ''"
                         @input="formDati.abilitazioni[idx].numero = $event.target.value; formDati={...formDati}"
                         class="w-full border border-slate-300 rounded px-2 py-1.5 text-xs
                                focus:outline-none focus:ring-2 focus:ring-blue-500">
                </div>
              </div>

              <div class="grid gap-2 sm:grid-cols-2">
                <div>
                  <label class="block text-xs text-slate-500 mb-1">
                    Scadenza
                    <span x-show="tipoInLista(ab.tipo) && ab.tipo !== 'ALTRO'"
                          class="text-red-500">🔴</span>
                  </label>
                  <input type="date"
                         :value="ab.scadenza ?? ''"
                         @input="formDati.abilitazioni[idx].scadenza = $event.target.value || null; formDati={...formDati}"
                         class="w-full border border-slate-300 rounded px-2 py-1.5 text-xs
                                focus:outline-none focus:ring-2 focus:ring-blue-500"
                         :class="ab.scadenza && UTILS.giorniAllaScadenza(ab.scadenza) < 0 ? 'border-red-400 bg-red-50' : ''">
                </div>
                <div class="flex items-end">
                  <label class="cursor-pointer text-xs text-blue-600 hover:text-blue-800">
                    <input type="file" accept=".pdf,.png,.jpg" class="sr-only"
                           @change="onAbilitazioneFile(idx, $event)">
                    <span x-text="ab.filename ? '📎 ' + ab.filename : '📎 Allega'"></span>
                  </label>
                </div>
              </div>
            </div>
          </template>

          <button @click="aggiungiAbilitazione()" type="button"
                  class="text-sm text-blue-600 hover:text-blue-800 border border-blue-300
                         px-3 py-1.5 rounded-lg hover:bg-blue-50 transition-colors
                         focus:outline-none focus:ring-2 focus:ring-blue-500">
            + Aggiungi abilitazione
          </button>
        </div>
      </details>

      <!-- ── 6. Identificazione cantiere ───────────────────────── -->
      <details class="border border-slate-200 rounded-xl overflow-hidden">
        <summary class="px-4 py-3 bg-slate-50 cursor-pointer text-sm font-medium text-slate-700
                        hover:bg-slate-100 list-none flex items-center justify-between">
          Identificazione in cantiere <span class="text-slate-400 text-xs" aria-hidden="true">▾</span>
        </summary>
        <div class="p-4 space-y-4">
          <!-- Tessera riconoscimento (art.26 c.8) -->
          <div>
            <p class="text-xs font-semibold text-slate-600 mb-2">
              Tessera di riconoscimento (art.26 c.8 D.Lgs 81/08)
            </p>
            <label class="flex items-center gap-2 text-sm cursor-pointer mb-2">
              <input type="checkbox"
                     :checked="formDati.tesseraRiconoscimento?.presente"
                     @change="(formDati.tesseraRiconoscimento ??= {}).presente = $event.target.checked; formDati={...formDati}"
                     class="w-4 h-4 rounded border-slate-300 text-blue-600
                            focus:ring-2 focus:ring-blue-500">
              Tessera presente
            </label>
            <label x-show="formDati.tesseraRiconoscimento?.presente"
                   class="cursor-pointer text-xs text-blue-600 hover:text-blue-800">
              <input type="file" accept=".pdf,.png,.jpg" class="sr-only"
                     @change="onDocumentoFile('tesseraRiconoscimento', $event)">
              <span x-text="formDati.tesseraRiconoscimento?.filename ? '📎 ' + formDati.tesseraRiconoscimento.filename : '📎 Allega copia'"></span>
            </label>
          </div>
          <!-- Badge cantiere (DL 159/2025) -->
          <div class="border-t border-slate-100 pt-3">
            <p class="text-xs font-semibold text-slate-600 mb-2">
              Badge cantiere (DL 159/2025 / Circ. INL 1/2026)
              <span class="font-normal text-slate-400"> — NON sostituisce la tessera</span>
            </p>
            <label class="flex items-center gap-2 text-sm cursor-pointer mb-2">
              <input type="checkbox"
                     :checked="formDati.badgeCantiere?.presente"
                     @change="(formDati.badgeCantiere ??= {}).presente = $event.target.checked; formDati={...formDati}"
                     class="w-4 h-4 rounded border-slate-300 text-blue-600
                            focus:ring-2 focus:ring-blue-500">
              Badge presente
            </label>
            <label for="lav-badge-codice"
                   class="block text-xs text-slate-500 mb-1"
                   x-show="formDati.badgeCantiere?.presente">Codice badge</label>
            <input x-show="formDati.badgeCantiere?.presente"
                   id="lav-badge-codice" type="text"
                   :value="formDati.badgeCantiere?.codice ?? ''"
                   @input="(formDati.badgeCantiere ??= {}).codice = $event.target.value || null"
                   class="w-48 border border-slate-300 rounded px-2 py-1.5 text-sm
                          focus:outline-none focus:ring-2 focus:ring-blue-500">
          </div>
        </div>
      </details>

      <!-- ── 7. Ruoli speciali ───────────────────────────────────── -->
      <details class="border border-slate-200 rounded-xl overflow-hidden">
        <summary class="px-4 py-3 bg-slate-50 cursor-pointer text-sm font-medium text-slate-700
                        hover:bg-slate-100 list-none flex items-center justify-between">
          Ruoli speciali <span class="text-slate-400 text-xs" aria-hidden="true">▾</span>
        </summary>
        <div class="p-4 space-y-2">
          <p class="text-xs text-slate-400 mb-3">
            Seleziona se il lavoratore riveste uno o più ruoli speciali (art.18 D.Lgs 81/08).
          </p>
          <template x-for="[valore, etichetta] in [
            ['PREPOSTO','Preposto (art.19)'],
            ['ADDETTO_EMERGENZE','Addetto emergenze'],
            ['ADDETTO_PRIMO_SOCCORSO','Addetto primo soccorso'],
            ['RLS','RLS — Rappresentante lavoratori sicurezza']
          ]" :key="valore">
            <label class="flex items-center gap-3 text-sm cursor-pointer">
              <input type="checkbox"
                     :checked="hasRuolo(valore)"
                     @change="toggleRuolo(valore)"
                     class="w-4 h-4 rounded border-slate-300 text-blue-600
                            focus:ring-2 focus:ring-blue-500">
              <span x-text="etichetta"></span>
            </label>
          </template>
        </div>
      </details>

    </div><!-- /corpo -->

    <!-- Fascia 3: footer con Salva sempre visibile -->
    <div class="px-5 py-4 border-t border-slate-200 bg-slate-50" style="flex-shrink:0">
      <p class="text-xs text-slate-400 mb-3">
        Il salvataggio non è mai bloccato. I campi mancanti generano avvisi, non errori.
      </p>
      <div class="flex gap-3 justify-end">
        <button @click="chiudiDrawer(false)"
                class="text-sm text-slate-500 hover:text-slate-700 px-4 py-2
                       border border-slate-300 rounded-lg transition-colors
                       focus:outline-none focus:ring-2 focus:ring-slate-400">
          Annulla
        </button>
        <button @click="salvaLavoratore()" :disabled="salvando"
                class="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white
                       text-sm font-medium px-5 py-2 rounded-lg transition-colors
                       focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2">
          <span x-text="salvando ? 'Salvataggio…' : 'Salva lavoratore'"></span>
        </button>
      </div>
    </div>

  </div><!-- /drawer -->

</div>
`;

// ── Registrazione ──────────────────────────────────────────────────────────

window.MODULI_REGISTRATI = window.MODULI_REGISTRATI ?? {};
window.MODULI_REGISTRATI['lavoratori'] = {
  monta(contenitore) { contenitore.innerHTML = _TEMPLATE_LAVORATORI; },
};
