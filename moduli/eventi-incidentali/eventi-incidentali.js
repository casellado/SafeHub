/**
 * eventi-incidentali.js — M15 pezzo b: vista Alpine completa.
 *
 * Sostituisce la vista test provvisoria del pezzo a.
 * Usa EVENTI_SERVICE per tutte le operazioni dati.
 *
 * Funzionalità:
 *   - Lista con badge categoria/gravità/stato/INAIL/allegati/NC
 *   - Filtri: categoria, stato, testo libero
 *   - Drawer form: categoria + gravità dinamica, campi condizionali infortuni
 *     (persona coinvolta, INAIL), azioni CSE, NC collegata, testo_ai, allegati
 *   - Cambio stato aperto↔chiuso dalla card
 *   - Vista cestino con ripristina e elimina definitiva
 *
 * DATI SENSIBILI: persona_coinvolta registra SOLO id+nome/mansione — MAI CF né sanitari.
 * Il form avvisa esplicitamente. Test: solo nomi fittizi.
 *
 * NON include hook diario né nota normativa (pezzo c).
 * NON usa Alpine.initTree.
 *
 * Dipende da: EVENTI_SERVICE, NC_SERVICE (opzionale, picker NC), ANAGRAFICA_SERVICE,
 *             ALLEGATI, NOTIFICHE, ERRORI, UTILS, FILESYSTEM (già caricati da shared/).
 */

'use strict';

// ── Note normative — UI only, non compaiono in alcun documento ───────────────

const NOTE_NORMATIVE_EVENTI = [
  {
    titolo: 'Obbligo di denuncia: è dell\'impresa, non del CSE (art. 18 D.Lgs. 81/08; art. 53 DPR 1124/65)',
    testo:  'La denuncia/comunicazione di infortunio all\'INAIL spetta al datore di lavoro dell\'impresa, ' +
            'non al CSE. La denuncia è dovuta per infortuni con prognosi superiore a 3 giorni (entro 2 giorni ' +
            'dal certificato medico); in caso di morte o pericolo di morte, entro 24 ore. Questo registro ' +
            'annota tali estremi a fini informativi, non li gestisce.',
  },
  {
    titolo: 'Il ruolo del CSE',
    testo:  'A fronte di un evento il CSE prende atto, valuta le ricadute sulla sicurezza del cantiere e ' +
            'adotta le azioni di sua competenza: aggiornamento del PSC, coordinamento, contestazione, ' +
            'eventuale proposta di sospensione. Documentare l\'evento e le proprie azioni è parte ' +
            'dell\'attività di alta vigilanza.',
  },
  {
    titolo: 'Near-miss e prevenzione',
    testo:  'Anche gli eventi senza conseguenze (quasi-infortuni) andrebbero registrati: sono segnali ' +
            'preziosi di un rischio non controllato. La loro analisi aiuta a prevenire l\'infortunio vero ' +
            'e a verificare l\'adeguatezza delle misure del PSC.',
  },
];

// ── Costanti e helper file ────────────────────────────────────────────────────

const _SOGLIA_GRANDE_EV = 10 * 1024 * 1024;   // 10 MB — avviso non bloccante

const _leggiBase64Ev = (file) =>
  new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload  = (e) => resolve(e.target.result);
    r.onerror = ()  => reject(new Error('Lettura file non riuscita'));
    r.readAsDataURL(file);
  });

function _formataKbEv(bytes) {
  return bytes >= 1024 * 1024
    ? (bytes / (1024 * 1024)).toFixed(1) + ' MB'
    : Math.round(bytes / 1024) + ' KB';
}

/** Converte ISO datetime → formato datetime-local (YYYY-MM-DDTHH:MM) per l'input HTML. */
function _toDatetimeLocal(iso) {
  if (!iso) return '';
  try {
    const d = new Date(iso);
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  } catch { return ''; }
}

/**
 * Legge gli eventi cestinati per il cantiere.
 * Locale a questo file (non richiede modifiche al service).
 * Parallelo a EVENTI_SERVICE.leggi() ma restituisce solo _cestino:true.
 */
const _leggiCestinoEventi = async (cantiereId) => {
  const _C  = '06_Eventi-Incidentali';
  const _LS = ['Bozze', 'Finalizzati'];
  const root    = FILESYSTEM.getHandleAttivo();
  const cantDir = await root.getDirectoryHandle(cantiereId);
  const byId    = new Map();

  for (const subPath of [[], ..._LS.map(s => [s])]) {
    let dir;
    try {
      dir = await FILESYSTEM.navigaPercorso(cantDir, [_C, ...subPath], false);
    } catch (e) {
      if (e.name === 'NotFoundError') continue;
      throw e;
    }
    for await (const [nome, fh] of dir.entries()) {
      if (fh.kind !== 'file' || !nome.endsWith('.json')) continue;
      try {
        const ev = await FILESYSTEM.leggiJson(dir, nome);
        if (!ev._cestino) continue;
        const esistente = byId.get(ev.id);
        if (!esistente || (ev.aggiornato_il ?? '') > (esistente.aggiornato_il ?? '')) {
          byId.set(ev.id, ev);
        }
      } catch { /* file corrotto — skip */ }
    }
  }
  return [...byId.values()].sort((a, b) =>
    (b._eliminato_il ?? '').localeCompare(a._eliminato_il ?? '')
  );
};

// ── Componente Alpine ─────────────────────────────────────────────────────────

function EventiIncidentali() {
  return {
    // ── Stato lista / filtri
    lista:           [],
    listaCestino:    [],
    imprese:         [],
    lavoratori:      [],
    ncList:          [],
    caricamento:     true,
    vistaCorrente:   'lista',   // 'lista' | 'cestino'
    filtroCategoria: '',
    filtroStato:     '',
    cercaTesto:      '',

    // ── Drawer
    drawerAperto:              false,
    // sentinel: sub-oggetti sempre presenti finché il drawer usa x-show (non x-if)
    formDati: {
      persona_coinvolta: { lavoratore_id: null, testo: '' },
      denuncia_inail:    { effettuata: false, data: '', estremi: '' },
    },
    formDataOraInput:          '',   // formato datetime-local per <input type="datetime-local">
    formNuova:                 true,
    salvando:                  false,
    modificatoDopoCaricamento: false,
    personaLibera:             false,   // toggle "non in anagrafica"

    _cantiereId: null,
    noteAperte:  false,

    get noteEventi() { return NOTE_NORMATIVE_EVENTI; },

    // ── Computed ─────────────────────────────────────────────────────────────

    get listaFiltrata() {
      let r = this.lista;
      if (this.filtroCategoria) r = r.filter(e => e.categoria === this.filtroCategoria);
      if (this.filtroStato)     r = r.filter(e => e.stato     === this.filtroStato);
      if (this.cercaTesto.trim()) {
        const t = this.cercaTesto.toLowerCase();
        r = r.filter(e =>
          (e.descrizione              ?? '').toLowerCase().includes(t) ||
          (e.luogo                    ?? '').toLowerCase().includes(t) ||
          (e.persona_coinvolta?.testo ?? '').toLowerCase().includes(t)
        );
      }
      return r;
    },

    get nAperte() { return this.lista.filter(e => e.stato === 'aperto').length; },
    get nChiuse() { return this.lista.filter(e => e.stato === 'chiuso').length; },

    // Opzioni gravità dinamiche: ricalcolate al cambio categoria nel form
    get gravitaOptions() {
      const cat  = this.formDati.categoria ?? 'infortunio';
      const vals = EVENTI_SERVICE.gravitaPerCategoria(cat);
      return vals.map(v => ({ value: v, label: EVENTI_SERVICE.etichettaGravita(v, cat) }));
    },

    // Campi persona/INAIL visibili solo per infortuni
    get mostraPersona() { return this.formDati.categoria === 'infortunio'; },
    get mostraINAIL()   { return this.formDati.categoria === 'infortunio'; },

    // Lavoratori filtrati per impresa selezionata nel form (o tutti se impresa non scelta)
    get lavoratoriFiltrati() {
      if (!this.formDati.impresa_id) return this.lavoratori;
      return this.lavoratori.filter(l => l.impresa_id === this.formDati.impresa_id);
    },

    // ── Lifecycle ─────────────────────────────────────────────────────────────

    init() {
      this._cantiereId = Alpine.store('cantiere')?.id;
      this.caricaDati();
    },

    aggiornaSeCantiereRicambia() {
      const id = Alpine.store('cantiere')?.id;
      if (id !== this._cantiereId) {
        this._cantiereId = id;
        if (this.drawerAperto) this.chiudiDrawer(true);
        this.vistaCorrente = 'lista';
        this.caricaDati();
      }
    },

    async caricaDati() {
      this.caricamento = true;
      const cantId = this._cantiereId;
      if (!cantId) {
        this.lista = []; this.imprese = []; this.lavoratori = []; this.ncList = [];
        this.caricamento = false;
        return;
      }
      try {
        if (!ANAGRAFICA_SERVICE.isCaricato || ANAGRAFICA_SERVICE.cantiereId !== cantId) {
          await ANAGRAFICA_SERVICE.carica(cantId);
        }
        this.imprese    = [...(ANAGRAFICA_SERVICE.get('imprese')    ?? [])];
        this.lavoratori = [...(ANAGRAFICA_SERVICE.get('lavoratori') ?? [])];
        this.lista      = await EVENTI_SERVICE.leggi(cantId);
        // NC picker — best-effort: se NC_SERVICE non è disponibile resta lista vuota
        if (typeof NC_SERVICE !== 'undefined') {
          try { this.ncList = await NC_SERVICE.leggiNC(cantId); } catch { /* best-effort */ }
        }
      } catch (err) {
        ERRORI.gestisciErrore('eventi-incidentali/carica', err);
        this.lista = [];
      } finally {
        this.caricamento = false;
      }
    },

    async caricaCestino() {
      const cantId = this._cantiereId;
      if (!cantId) { this.listaCestino = []; return; }
      try {
        this.listaCestino = await _leggiCestinoEventi(cantId);
      } catch (err) {
        ERRORI.gestisciErrore('eventi-incidentali/cestino', err);
        this.listaCestino = [];
      }
    },

    // ── Drawer — apri / chiudi / salva ────────────────────────────────────────

    nuovoEvento() {
      this.formDati              = EVENTI_SERVICE.creaVuota(this._cantiereId);
      this.formDataOraInput      = _toDatetimeLocal(this.formDati.data_ora);
      this.formNuova             = true;
      this.personaLibera         = false;
      this.modificatoDopoCaricamento = false;
      this.drawerAperto          = true;
      this.$nextTick(() => document.getElementById('ev-categoria')?.focus());
    },

    modificaEvento(ev) {
      this.formDati              = JSON.parse(JSON.stringify(ev));
      this.formDataOraInput      = _toDatetimeLocal(ev.data_ora);
      this.formNuova             = false;
      this.personaLibera         = !ev.persona_coinvolta?.lavoratore_id;
      this.modificatoDopoCaricamento = false;
      this.drawerAperto          = true;
      this.$nextTick(() => document.getElementById('ev-categoria')?.focus());
    },

    chiudiDrawer(forza = false) {
      if (!forza && this.modificatoDopoCaricamento) {
        if (!confirm('Ci sono modifiche non salvate. Chiudere senza salvare?')) return;
      }
      this.drawerAperto = false;
      this.formDati = {
        persona_coinvolta: { lavoratore_id: null, testo: '' },
        denuncia_inail:    { effettuata: false, data: '', estremi: '' },
      };
    },

    async salvaEvento() {
      if (!this.formDati.descrizione?.trim()) {
        NOTIFICHE.attenzione('Evento', 'La descrizione dell\'evento è necessaria.');
        document.getElementById('ev-descrizione')?.focus();
        return;
      }
      // Converti datetime-local → ISO
      if (this.formDataOraInput) {
        try { this.formDati.data_ora = new Date(this.formDataOraInput).toISOString(); } catch {}
      }
      this.salvando = true;
      try {
        if (this.formNuova) {
          await EVENTI_SERVICE.crea(this.formDati);
          NOTIFICHE.successo('Evento registrato');
        } else {
          await EVENTI_SERVICE.aggiorna(this.formDati);
          NOTIFICHE.successo('Evento aggiornato');
        }
        await this.caricaDati();
        this.chiudiDrawer(true);
      } catch (err) {
        ERRORI.gestisciErrore('eventi-incidentali/salva', err);
      } finally {
        this.salvando = false;
      }
    },

    // ── Categoria / gravità ───────────────────────────────────────────────────

    onCategoriaChange() {
      // Gravità: resetta al primo valore valido per la nuova categoria se non compatibile
      const opts = this.gravitaOptions;
      if (opts.length > 0 && !opts.find(o => o.value === this.formDati.gravita)) {
        this.formDati.gravita = opts[0].value;
      }
      // Se si esce da 'infortuni': pulisci persona coinvolta e INAIL
      if (this.formDati.categoria !== 'infortunio') {
        this.formDati.persona_coinvolta = { lavoratore_id: null, testo: '' };
        this.formDati.denuncia_inail    = { effettuata: false, data: '', estremi: '' };
        this.personaLibera = false;
      }
      this.modificatoDopoCaricamento = true;
    },

    onImpresaChange() {
      // Se il lavoratore selezionato appartiene a un'altra impresa, deseleziona
      if (this.formDati.persona_coinvolta?.lavoratore_id) {
        const lav = this.lavoratori.find(l => l.id === this.formDati.persona_coinvolta.lavoratore_id);
        if (!lav || (this.formDati.impresa_id && lav.impresa_id !== this.formDati.impresa_id)) {
          this.formDati.persona_coinvolta = { lavoratore_id: null, testo: '' };
        }
      }
      this.modificatoDopoCaricamento = true;
    },

    // ── Persona coinvolta ─────────────────────────────────────────────────────

    // Chiamata al cambio selettore lavoratore: copia nome/mansione nel testo.
    // DATI SENSIBILI: SOLO nome+cognome+mansione — MAI codiceFiscale né dati sanitari.
    onLavoratoreChange() {
      const id = this.formDati.persona_coinvolta?.lavoratore_id;
      if (!id) {
        this.formDati.persona_coinvolta = { lavoratore_id: null, testo: '' };
        return;
      }
      const lav  = this.lavoratori.find(l => l.id === id);
      if (!lav) return;
      const nome  = [lav.cognome, lav.nome].filter(Boolean).join(' ');
      const testo = [nome, lav.mansione].filter(Boolean).join(' — ');
      this.formDati.persona_coinvolta = { lavoratore_id: id, testo };
      this.modificatoDopoCaricamento = true;
    },

    attivaPersonaLibera(val) {
      this.personaLibera = val;
      if (val) {
        // Passa al testo libero: azzera il link anagrafica, mantieni il testo già presente
        this.formDati.persona_coinvolta = {
          lavoratore_id: null,
          testo: this.formDati.persona_coinvolta?.testo ?? '',
        };
      } else {
        // Torna al selettore: resetta tutto (si sceglie di nuovo)
        this.formDati.persona_coinvolta = { lavoratore_id: null, testo: '' };
      }
      this.modificatoDopoCaricamento = true;
    },

    // ── Cambio stato dalla card ───────────────────────────────────────────────

    async cambiaStato(ev, nuovoStato) {
      if (nuovoStato === 'chiuso' && !confirm('Chiudere questo evento come concluso?')) return;
      try {
        const aggiornato = await EVENTI_SERVICE.cambiaStato(ev, nuovoStato);
        const idx = this.lista.findIndex(e => e.id === ev.id);
        if (idx >= 0) this.lista[idx] = aggiornato;
        this.lista = [...this.lista];
      } catch (err) {
        ERRORI.gestisciErrore('eventi-incidentali/cambia-stato', err);
      }
    },

    // ── Cestino ───────────────────────────────────────────────────────────────

    async cestinaEvento(ev) {
      if (!confirm('Spostare questo evento nel cestino?')) return;
      try {
        await EVENTI_SERVICE.cestina(ev);
        this.lista = this.lista.filter(e => e.id !== ev.id);
        NOTIFICHE.info('Evento', 'Spostato nel cestino.');
      } catch (err) {
        ERRORI.gestisciErrore('eventi-incidentali/cestina', err);
      }
    },

    async aprireCestino() {
      this.vistaCorrente = 'cestino';
      await this.caricaCestino();
    },

    async ripristinaEvento(ev) {
      try {
        const ripristinato = await EVENTI_SERVICE.ripristina(ev);
        this.listaCestino = this.listaCestino.filter(e => e.id !== ev.id);
        this.lista.unshift(ripristinato);
        this.lista = [...this.lista];
        NOTIFICHE.successo('Evento ripristinato');
      } catch (err) {
        ERRORI.gestisciErrore('eventi-incidentali/ripristina', err);
      }
    },

    async eliminaDefinitivaEvento(ev) {
      if (!confirm('Eliminare definitivamente? L\'operazione non è reversibile.')) return;
      try {
        await EVENTI_SERVICE.eliminaDefinitiva(ev);
        this.listaCestino = this.listaCestino.filter(e => e.id !== ev.id);
        NOTIFICHE.info('Evento', 'Eliminato definitivamente.');
      } catch (err) {
        ERRORI.gestisciErrore('eventi-incidentali/elimina', err);
      }
    },

    // ── Allegati ──────────────────────────────────────────────────────────────

    async onAllegatoFile(event) {
      const files = Array.from(event.target.files ?? []);
      if (!files.length) return;
      if (!this.formDati.allegati) this.formDati.allegati = [];
      for (const file of files) {
        if (file.size > _SOGLIA_GRANDE_EV) {
          NOTIFICHE.attenzione('Allegati',
            `${file.name}: ${_formataKbEv(file.size)} — file grande. Caricato comunque, ` +
            'potrebbe rallentare il salvataggio.', 7000);
        }
        try {
          const base64 = await _leggiBase64Ev(file);
          this.formDati.allegati.push({ filename: file.name, base64 });
        } catch {
          NOTIFICHE.errore('Allegati', `Impossibile leggere ${file.name}.`);
        }
      }
      this.formDati = { ...this.formDati };
      this.modificatoDopoCaricamento = true;
      event.target.value = '';
    },

    rimuoviAllegato(idx) {
      this.formDati.allegati.splice(idx, 1);
      this.formDati = { ...this.formDati };
      this.modificatoDopoCaricamento = true;
    },

    // ── Helper UI ─────────────────────────────────────────────────────────────

    nomeImpresa(id) {
      return this.imprese.find(i => i.id === id)?.ragioneSociale ?? null;
    },

    nomeLavoratoreBreve(id) {
      const l = this.lavoratori.find(x => x.id === id);
      return l ? [l.cognome, l.nome].filter(Boolean).join(' ') : null;
    },

    categoriaInfo(cat) {
      const MAP = {
        infortunio:              { label: 'Infortunio',          icon: '🚑', cls: 'bg-red-100   text-red-800' },
        near_miss:               { label: 'Near miss',           icon: '⚠',  cls: 'bg-amber-100 text-amber-800' },
        incidente_cose_ambiente: { label: 'Incidente cose/amb.', icon: '🔧', cls: 'bg-blue-100  text-blue-700' },
      };
      return MAP[cat] ?? { label: cat ?? '—', icon: '📋', cls: 'bg-slate-100 text-slate-600' };
    },

    gravitaCls(g)         { return EVENTI_SERVICE.gravitaCls(g); },
    gravitaLabel(g, cat)  { return EVENTI_SERVICE.etichettaGravita(g, cat); },

    statoInfo(stato) {
      return stato === 'chiuso'
        ? { label: 'Chiuso',  cls: 'bg-slate-100   text-slate-600' }
        : { label: 'Aperto',  cls: 'bg-emerald-100 text-emerald-700 font-medium' };
    },

    ncDescrizione(ncId) {
      if (!ncId) return null;
      const nc = this.ncList.find(n => n.id === ncId);
      return nc ? (nc.descrizione?.slice(0, 55) ?? ncId) : ncId;
    },

    migliora(campo) {
      if (typeof apriCorrettoreConTesto === 'undefined') return;
      const titoli = { descrizione: 'Evento Incidentale — Descrizione' };
      apriCorrettoreConTesto(this.formDati[campo] ?? '', titoli[campo] ?? campo);
    },

    _imprese()    { return this.imprese; },
    _lavoratori() { return this.lavoratoriFiltrati; },
  };
}

// ── Template HTML ─────────────────────────────────────────────────────────────

const _TEMPLATE_EI = `
<div x-data="EventiIncidentali()" x-init="init()" x-effect="aggiornaSeCantiereRicambia()"
     class="max-w-4xl">

  <!-- === HEADER === -->
  <div class="flex items-center justify-between mb-4">
    <div>
      <h1 class="text-xl font-semibold text-slate-800">🚨 Eventi Incidentali</h1>
      <p class="text-xs text-slate-400 mt-0.5"
         x-text="lista.length + ' eventi · ' + nAperte + ' aperti · ' + nChiuse + ' chiusi'"></p>
    </div>
    <div class="flex items-center gap-2">
      <!-- Note normative (pezzo c) -->
      <button @click="noteAperte = !noteAperte"
              :aria-expanded="String(noteAperte)"
              class="text-xs text-sky-700 bg-sky-50 border border-sky-200
                     px-2.5 py-1 rounded-full hover:bg-sky-100 transition-colors
                     focus:outline-none focus:ring-2 focus:ring-sky-400">
        &#x2139; Note normative
      </button>
      <!-- Vista cestino -->
      <button @click="vistaCorrente === 'cestino' ? (vistaCorrente = 'lista') : aprireCestino()"
              class="text-xs text-slate-500 bg-slate-50 border border-slate-200
                     px-2.5 py-1 rounded-full hover:bg-slate-100 transition-colors
                     focus:outline-none focus:ring-2 focus:ring-slate-400"
              x-text="vistaCorrente === 'cestino' ? '← Torna alla lista' : '🗑 Cestino'">
      </button>
      <!-- Nuovo evento -->
      <button @click="nuovoEvento()" x-show="$store.cantiere.id && vistaCorrente === 'lista'"
              class="bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium
                     px-4 py-2 rounded-lg transition-colors
                     focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2">
        + Nuovo evento
      </button>
    </div>
  </div>

  <!-- NOTE NORMATIVE -->
  <div x-show="noteAperte" x-transition class="nota-normativa-panel mb-4" role="note">
    <p class="text-xs text-sky-500 mb-2 italic">Promemoria per il CSE — non compare nel documento.</p>
    <template x-for="nota in noteEventi" :key="nota.titolo">
      <div><h4 x-text="nota.titolo"></h4><p x-text="nota.testo"></p></div>
    </template>
  </div>

  <!-- Nessun cantiere -->
  <div x-show="!$store.cantiere.id" class="placeholder-modulo">
    <div class="text-3xl" aria-hidden="true">🚨</div>
    <p class="text-slate-500">Seleziona un cantiere per gestire gli eventi incidentali.</p>
  </div>

  <div x-show="$store.cantiere.id">

    <!-- Spinner caricamento -->
    <div x-show="caricamento" class="flex items-center gap-3 py-10 text-slate-400 text-sm">
      <div class="w-5 h-5 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"
           role="status" aria-label="Caricamento in corso"></div>
      Caricamento…
    </div>

    <!-- ═══════════════════════════════════════════════════════════
         VISTA LISTA
         ═══════════════════════════════════════════════════════════ -->
    <div x-show="!caricamento && vistaCorrente === 'lista'">

      <!-- Filtri -->
      <div class="flex flex-wrap gap-2 mb-4 items-center">

        <!-- Categoria -->
        <select x-model="filtroCategoria"
                class="border border-slate-300 rounded-md px-2.5 py-1.5 text-sm
                       focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                aria-label="Filtra per categoria">
          <option value="">Tutte le categorie</option>
          <option value="infortunio">🚑 Infortuni</option>
          <option value="near_miss">⚠ Near miss</option>
          <option value="incidente_cose_ambiente">🔧 Incidenti cose/amb.</option>
        </select>

        <!-- Stato -->
        <select x-model="filtroStato"
                class="border border-slate-300 rounded-md px-2.5 py-1.5 text-sm
                       focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                aria-label="Filtra per stato">
          <option value="">Tutti gli stati</option>
          <option value="aperto">Aperti</option>
          <option value="chiuso">Chiusi</option>
        </select>

        <!-- Testo libero -->
        <input type="search" x-model="cercaTesto" placeholder="Cerca descrizione, luogo…"
               class="flex-1 min-w-[180px] border border-slate-300 rounded-md
                      px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
               aria-label="Ricerca testo">

        <!-- Azzera filtri -->
        <button x-show="filtroCategoria || filtroStato || cercaTesto"
                @click="filtroCategoria = ''; filtroStato = ''; cercaTesto = ''"
                class="text-xs text-slate-400 hover:text-slate-600 px-2 py-1 rounded
                       focus:outline-none focus:ring-2 focus:ring-slate-400">
          × Azzera
        </button>
      </div>

      <!-- Lista vuota (globale) -->
      <div x-show="lista.length === 0"
           class="py-16 text-center text-slate-400">
        <div class="text-4xl mb-3" aria-hidden="true">🚨</div>
        <p class="font-medium text-slate-500">Nessun evento registrato per questo cantiere.</p>
        <p class="text-sm mt-1">Usa "+ Nuovo evento" per registrare il primo.</p>
      </div>

      <!-- Lista vuota (filtri attivi) -->
      <div x-show="lista.length > 0 && listaFiltrata.length === 0"
           class="py-12 text-center text-slate-400">
        <div class="text-3xl mb-2" aria-hidden="true">🔍</div>
        <p>Nessun evento corrisponde ai filtri attivi.</p>
      </div>

      <!-- === CARDS EVENTI === -->
      <div role="list" aria-label="Eventi incidentali" class="space-y-3">
        <template x-for="ev in listaFiltrata" :key="ev.id">
          <div role="listitem"
               class="border border-slate-200 bg-white rounded-xl px-4 py-3 space-y-2
                      hover:border-slate-300 transition-all">

            <!-- Riga 1: badge categoria + gravità + estratto descrizione -->
            <div class="flex items-start gap-2 flex-wrap">

              <!-- Badge categoria -->
              <span :class="categoriaInfo(ev.categoria).cls"
                    class="flex-shrink-0 text-xs px-2 py-0.5 rounded-full mt-0.5 whitespace-nowrap">
                <span aria-hidden="true" x-text="categoriaInfo(ev.categoria).icon"></span>
                <span x-text="categoriaInfo(ev.categoria).label"></span>
              </span>

              <!-- Badge gravità -->
              <span :class="gravitaCls(ev.gravita)"
                    class="flex-shrink-0 text-xs px-2 py-0.5 rounded-full mt-0.5 whitespace-nowrap"
                    x-text="gravitaLabel(ev.gravita, ev.categoria)"></span>

              <!-- Descrizione -->
              <p class="text-sm font-medium text-slate-800 leading-snug min-w-0"
                 x-text="ev.descrizione || '(nessuna descrizione)'"></p>
            </div>

            <!-- Riga 2: metadati -->
            <div class="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">

              <!-- Data/ora -->
              <span x-show="ev.data_ora" class="text-slate-500"
                    x-text="UTILS.formatDataOra ? UTILS.formatDataOra(ev.data_ora) : UTILS.formatData(ev.data_ora)"></span>

              <!-- Luogo -->
              <span x-show="ev.luogo" class="italic"
                    x-text="ev.luogo"></span>

              <!-- Impresa -->
              <template x-if="nomeImpresa(ev.impresa_id)">
                <span class="bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full"
                      x-text="nomeImpresa(ev.impresa_id)"></span>
              </template>

              <!-- Persona (solo infortuni) -->
              <span x-show="ev.persona_coinvolta?.testo"
                    class="text-slate-500"
                    x-text="'👤 ' + (ev.persona_coinvolta?.testo ?? '')"></span>

              <!-- Badge stato -->
              <span :class="statoInfo(ev.stato).cls"
                    class="px-2 py-0.5 rounded-full text-xs"
                    x-text="statoInfo(ev.stato).label"></span>

              <!-- Badge INAIL -->
              <span x-show="ev.denuncia_inail?.effettuata"
                    class="bg-teal-50 text-teal-700 px-2 py-0.5 rounded-full text-xs font-medium">
                INAIL ✓
              </span>

              <!-- Badge allegati -->
              <span x-show="(ev.allegati ?? []).length > 0"
                    class="bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full"
                    x-text="'📎 ' + (ev.allegati ?? []).length"></span>

              <!-- Badge NC collegata -->
              <span x-show="ev.nc_collegata_id"
                    class="bg-rose-50 text-rose-600 px-2 py-0.5 rounded-full"
                    :title="'NC: ' + ncDescrizione(ev.nc_collegata_id)"
                    x-text="'⚠ NC: ' + (ncDescrizione(ev.nc_collegata_id) ?? ev.nc_collegata_id).slice(0,30)">
              </span>
            </div>

            <!-- Riga 3: azioni -->
            <div class="flex flex-wrap items-center gap-2 pt-1">

              <!-- Modifica -->
              <button @click="modificaEvento(ev)"
                      class="text-xs text-slate-600 hover:text-slate-900 px-2.5 py-1
                             border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors
                             focus:outline-none focus:ring-2 focus:ring-slate-400"
                      :aria-label="'Modifica evento: ' + (ev.descrizione || ev.id).slice(0,40)">
                ✏ Modifica
              </button>

              <!-- Cambia stato: aperto → chiuso -->
              <button x-show="ev.stato === 'aperto'"
                      @click="cambiaStato(ev, 'chiuso')"
                      class="text-xs text-slate-600 bg-slate-50 border border-slate-200
                             px-2.5 py-1 rounded-lg hover:bg-slate-100 transition-colors
                             focus:outline-none focus:ring-2 focus:ring-slate-400">
                ✓ Chiudi
              </button>

              <!-- Cambia stato: chiuso → aperto -->
              <button x-show="ev.stato === 'chiuso'"
                      @click="cambiaStato(ev, 'aperto')"
                      class="text-xs text-emerald-700 bg-emerald-50 border border-emerald-200
                             px-2.5 py-1 rounded-lg hover:bg-emerald-100 transition-colors
                             focus:outline-none focus:ring-2 focus:ring-emerald-400">
                ↩ Riapri
              </button>

              <!-- Cestina -->
              <button @click="cestinaEvento(ev)"
                      class="text-xs text-red-400 hover:text-red-700 px-2 py-1
                             rounded-lg hover:bg-red-50 transition-colors ml-auto
                             focus:outline-none focus:ring-2 focus:ring-red-400"
                      title="Sposta nel cestino">🗑</button>
            </div>

          </div>
        </template>
      </div>

    </div><!-- /lista -->

    <!-- ═══════════════════════════════════════════════════════════
         VISTA CESTINO
         ═══════════════════════════════════════════════════════════ -->
    <div x-show="!caricamento && vistaCorrente === 'cestino'">

      <div class="flex items-center gap-3 mb-4">
        <button @click="vistaCorrente = 'lista'"
                class="text-sm text-slate-500 hover:text-slate-700 flex items-center gap-1
                       focus:outline-none focus:ring-2 focus:ring-slate-400 rounded">
          ← Torna alla lista
        </button>
        <h2 class="text-base font-semibold text-slate-700">🗑 Cestino — eventi incidentali</h2>
      </div>

      <div x-show="listaCestino.length === 0"
           class="py-12 text-center text-slate-400">
        <p>Nessun evento nel cestino.</p>
      </div>

      <div role="list" class="space-y-2">
        <template x-for="ev in listaCestino" :key="ev.id">
          <div role="listitem"
               class="border border-slate-200 bg-slate-50 rounded-xl px-4 py-3 opacity-80">
            <div class="flex items-start gap-2 mb-2">
              <span :class="categoriaInfo(ev.categoria).cls"
                    class="text-xs px-2 py-0.5 rounded-full flex-shrink-0"
                    x-text="categoriaInfo(ev.categoria).icon + ' ' + categoriaInfo(ev.categoria).label"></span>
              <p class="text-sm text-slate-600 line-through"
                 x-text="ev.descrizione || '(nessuna descrizione)'"></p>
            </div>
            <div class="flex flex-wrap items-center gap-2 text-xs text-slate-400">
              <span x-text="UTILS.formatData(ev.data_ora)"></span>
              <span x-show="ev._eliminato_il"
                    x-text="'Cestinato: ' + UTILS.formatData(ev._eliminato_il)"></span>
            </div>
            <div class="flex gap-2 mt-2">
              <button @click="ripristinaEvento(ev)"
                      class="text-xs text-blue-600 bg-blue-50 border border-blue-200
                             px-2.5 py-1 rounded-lg hover:bg-blue-100 transition-colors
                             focus:outline-none focus:ring-2 focus:ring-blue-400">
                ↩ Ripristina
              </button>
              <button @click="eliminaDefinitivaEvento(ev)"
                      class="text-xs text-red-600 bg-red-50 border border-red-200
                             px-2.5 py-1 rounded-lg hover:bg-red-100 transition-colors
                             focus:outline-none focus:ring-2 focus:ring-red-400">
                🗑 Elimina definitivamente
              </button>
            </div>
          </div>
        </template>
      </div>

    </div><!-- /cestino -->

  </div><!-- /$store.cantiere.id -->


  <!-- ════════════════════════════════════════════════════════════════
       DRAWER: form nuovo/modifica evento
       ════════════════════════════════════════════════════════════════ -->
  <div x-show="drawerAperto" x-cloak
       class="drawer-backdrop"
       @click="chiudiDrawer(false)"
       aria-hidden="true"></div>

  <div x-show="drawerAperto" x-cloak
       @input="modificatoDopoCaricamento = true"
       @keydown.escape.window="chiudiDrawer(false)"
       class="drawer"
       role="dialog" aria-modal="true" aria-label="Registrazione evento incidentale">

    <!-- header fisso -->
    <div class="drawer-header flex items-center justify-between px-5 py-4 border-b border-slate-200 bg-white">
      <h2 class="text-base font-semibold text-slate-800"
          x-text="formNuova ? 'Nuovo evento incidentale' : 'Modifica evento'"></h2>
      <button @click="chiudiDrawer(false)" aria-label="Chiudi"
              class="p-1.5 rounded hover:bg-slate-100 text-slate-500 text-lg
                     focus:outline-none focus:ring-2 focus:ring-slate-400">✕</button>
    </div>

    <!-- corpo scrollabile -->
    <div class="drawer-body px-5 py-4 space-y-4">

      <!-- ── Classificazione ───────────────────────────────────────── -->

      <!-- Categoria -->
      <div>
        <label for="ev-categoria" class="block text-xs font-medium text-slate-700 mb-1">
          Categoria <span class="text-red-500">*</span>
        </label>
        <select id="ev-categoria" x-model="formDati.categoria"
                @change="onCategoriaChange()"
                class="w-full border border-slate-300 rounded-md px-3 py-2 text-sm
                       focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white">
          <option value="infortunio">🚑 Infortunio</option>
          <option value="near_miss">⚠ Near miss</option>
          <option value="incidente_cose_ambiente">🔧 Incidente (cose / ambiente)</option>
        </select>
        <p class="mt-1 text-xs text-slate-400">
          <span x-show="formDati.categoria === 'infortunio'">
            Persona fisica coinvolta. La denuncia INAIL è in capo al datore di lavoro dell'impresa.
          </span>
          <span x-show="formDati.categoria === 'near_miss'">
            Evento senza danni: indica la gravità POTENZIALE (cosa sarebbe potuto accadere).
          </span>
          <span x-show="formDati.categoria === 'incidente_cose_ambiente'">
            Danno a mezzi, attrezzature o ambiente — nessuna persona coinvolta.
          </span>
        </p>
      </div>

      <!-- Gravità + Data/ora -->
      <div class="grid grid-cols-2 gap-3">
        <div>
          <label for="ev-gravita" class="block text-xs font-medium text-slate-700 mb-1">
            Gravità
          </label>
          <select id="ev-gravita" x-model="formDati.gravita"
                  class="w-full border border-slate-300 rounded-md px-3 py-2 text-sm
                         focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white">
            <template x-for="opt in gravitaOptions" :key="opt.value">
              <option :value="opt.value" x-text="opt.label"></option>
            </template>
          </select>
        </div>
        <div>
          <label for="ev-data-ora" class="block text-xs font-medium text-slate-700 mb-1">
            Data e ora dell'evento
          </label>
          <input id="ev-data-ora" type="datetime-local"
                 x-model="formDataOraInput"
                 class="w-full border border-slate-300 rounded-md px-3 py-2 text-sm
                        focus:outline-none focus:ring-2 focus:ring-blue-500">
        </div>
      </div>

      <!-- Luogo -->
      <div>
        <label for="ev-luogo" class="block text-xs font-medium text-slate-700 mb-1">
          Luogo <span class="text-slate-400 font-normal">(progressiva, zona o area)</span>
        </label>
        <input id="ev-luogo" type="text" x-model="formDati.luogo"
               placeholder="Es. km 3+450, Tratto A-B, area deposito"
               class="w-full border border-slate-300 rounded-md px-3 py-2 text-sm
                      focus:outline-none focus:ring-2 focus:ring-blue-500
                      placeholder:text-slate-400">
      </div>

      <!-- Impresa coinvolta -->
      <div>
        <label for="ev-impresa" class="block text-xs font-medium text-slate-700 mb-1">
          Impresa coinvolta <span class="text-slate-400 font-normal">(facoltativa)</span>
        </label>
        <select id="ev-impresa" x-model="formDati.impresa_id"
                @change="onImpresaChange()"
                class="w-full border border-slate-300 rounded-md px-3 py-2 text-sm
                       focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white">
          <option value="">— Nessuna impresa assegnata —</option>
          <template x-for="imp in _imprese()" :key="imp.id">
            <option :value="imp.id" x-text="imp.ragioneSociale"></option>
          </template>
        </select>
      </div>

      <!-- Descrizione -->
      <div>
        <div class="flex items-center justify-between mb-1">
          <label for="ev-descrizione" class="block text-xs font-medium text-slate-700">
            Descrizione / dinamica dell'evento <span class="text-red-500">*</span>
          </label>
          <button @click="migliora('descrizione')" type="button"
                  class="flex items-center gap-1 text-xs text-violet-600 hover:text-violet-800
                         px-2.5 py-1 rounded-lg border border-violet-200 hover:bg-violet-50
                         transition-colors focus:outline-none focus:ring-2 focus:ring-violet-400"
                  title="Apre il Correttore AI con questo testo — il campo resta invariato">
            &#x2728; Migliora con l'AI
          </button>
        </div>
        <textarea id="ev-descrizione" rows="4"
                  x-model="formDati.descrizione"
                  placeholder="Descrivi la dinamica del fatto: cosa è successo, in quale circostanza, sequenza degli eventi…"
                  class="w-full border border-slate-300 rounded-md px-3 py-2 text-sm resize-none
                         focus:outline-none focus:ring-2 focus:ring-blue-500
                         placeholder:text-slate-400"></textarea>
      </div>

      <!-- ── Campi condizionali INFORTUNI ──────────────────────────── -->
      <div x-show="mostraPersona"
           class="rounded-xl border border-red-100 bg-red-50/40 px-4 py-3 space-y-3">

        <p class="text-xs font-semibold text-red-700 uppercase tracking-wide">
          Persona coinvolta
        </p>

        <!-- Avviso dati sensibili -->
        <div class="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-3 py-2">
          <strong>⚠ Dati sensibili.</strong>
          Registrare SOLO nome/mansione. MAI codice fiscale, diagnosi o dati sanitari.
        </div>

        <!-- Toggle "non in anagrafica" -->
        <label class="flex items-center gap-2 cursor-pointer select-none text-xs text-slate-600">
          <input type="checkbox"
                 :checked="personaLibera"
                 @change="attivaPersonaLibera($event.target.checked)"
                 class="rounded border-slate-300 focus:ring-blue-500">
          Persona non in anagrafica (testo libero)
        </label>

        <!-- Selettore anagrafica -->
        <div x-show="!personaLibera">
          <label for="ev-lavoratore" class="block text-xs font-medium text-slate-700 mb-1">
            Lavoratore (da anagrafica)
          </label>
          <select id="ev-lavoratore"
                  x-model="formDati.persona_coinvolta.lavoratore_id"
                  @change="onLavoratoreChange()"
                  class="w-full border border-slate-300 rounded-md px-3 py-2 text-sm
                         focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white">
            <option value="">— Seleziona lavoratore (opzionale) —</option>
            <template x-for="lav in _lavoratori()" :key="lav.id">
              <option :value="lav.id"
                      x-text="[lav.cognome, lav.nome].filter(Boolean).join(' ')
                               + (lav.mansione ? ' — ' + lav.mansione : '')"></option>
            </template>
          </select>
          <p class="mt-1 text-xs text-slate-400">
            Vengono registrati solo nome e mansione — nessun codice fiscale né dato sanitario.
          </p>
          <!-- Testo derivato (sola lettura informativo) -->
          <p x-show="formDati.persona_coinvolta?.testo"
             class="mt-1 text-xs text-slate-600 bg-white border border-slate-200
                    rounded px-2 py-1"
             x-text="'Annotato: ' + formDati.persona_coinvolta.testo"></p>
        </div>

        <!-- Testo libero -->
        <div x-show="personaLibera">
          <label for="ev-persona-testo" class="block text-xs font-medium text-slate-700 mb-1">
            Persona (testo breve)
          </label>
          <input id="ev-persona-testo" type="text"
                 x-model="formDati.persona_coinvolta.testo"
                 placeholder="Es. Addetto ponteggi, Impresa X — solo nome/mansione"
                 class="w-full border border-slate-300 rounded-md px-3 py-2 text-sm
                        focus:outline-none focus:ring-2 focus:ring-blue-500
                        placeholder:text-slate-400">
          <p class="mt-1 text-xs text-amber-700">
            Solo nome/mansione. MAI codice fiscale, diagnosi o dati sanitari.
          </p>
        </div>
      </div><!-- /persona coinvolta -->

      <!-- Denuncia INAIL (solo infortuni) -->
      <div x-show="mostraINAIL"
           class="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 space-y-2">

        <p class="text-xs font-semibold text-slate-600 uppercase tracking-wide">
          Denuncia INAIL — estremi informativi
        </p>
        <p class="text-xs text-slate-400">
          Obbligo del datore di lavoro dell'impresa (art.18 D.Lgs.81/08 + DPR 1124/65).
          Il CSE annota solo se è a conoscenza della denuncia.
        </p>

        <label class="flex items-center gap-2 cursor-pointer select-none text-sm text-slate-700">
          <input type="checkbox" x-model="formDati.denuncia_inail.effettuata"
                 class="rounded border-slate-300 focus:ring-blue-500">
          Denuncia effettuata dall'impresa
        </label>

        <div x-show="formDati.denuncia_inail?.effettuata" class="grid grid-cols-2 gap-3 pt-1">
          <div>
            <label for="ev-inail-data" class="block text-xs font-medium text-slate-700 mb-1">
              Data denuncia
            </label>
            <input id="ev-inail-data" type="date"
                   x-model="formDati.denuncia_inail.data"
                   class="w-full border border-slate-300 rounded-md px-3 py-1.5 text-sm
                          focus:outline-none focus:ring-2 focus:ring-blue-500">
          </div>
          <div>
            <label for="ev-inail-estremi" class="block text-xs font-medium text-slate-700 mb-1">
              Estremi (n. pratica o riferimento)
            </label>
            <input id="ev-inail-estremi" type="text"
                   x-model="formDati.denuncia_inail.estremi"
                   placeholder="N. pratica, riferimento…"
                   class="w-full border border-slate-300 rounded-md px-3 py-1.5 text-sm
                          focus:outline-none focus:ring-2 focus:ring-blue-500
                          placeholder:text-slate-400">
          </div>
        </div>
      </div><!-- /INAIL -->

      <!-- ── Azioni CSE ──────────────────────────────────────────────── -->
      <div>
        <label for="ev-azioni" class="block text-xs font-medium text-slate-700 mb-1">
          Azioni conseguenti del CSE
          <span class="text-slate-400 font-normal">(cosa ha fatto il CSE dopo l'evento)</span>
        </label>
        <textarea id="ev-azioni" rows="3"
                  x-model="formDati.azioni_conseguenti"
                  placeholder="Es. sopralluogo straordinario, contestazione scritta all'impresa, apertura NC, convocazione riunione di coordinamento…"
                  class="w-full border border-slate-300 rounded-md px-3 py-2 text-sm resize-none
                         focus:outline-none focus:ring-2 focus:ring-blue-500
                         placeholder:text-slate-400"></textarea>
      </div>

      <!-- NC collegata -->
      <div>
        <label for="ev-nc-select" class="block text-xs font-medium text-slate-700 mb-1">
          Non Conformità collegata
          <span class="text-slate-400 font-normal">(opzionale — link unidirezionale)</span>
        </label>

        <!-- Se ci sono NC: select -->
        <select id="ev-nc-select" x-show="ncList.length > 0"
                x-model="formDati.nc_collegata_id"
                class="w-full border border-slate-300 rounded-md px-3 py-2 text-sm
                       focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white">
          <option value="">— Nessuna NC collegata —</option>
          <template x-for="nc in ncList" :key="nc.id">
            <option :value="nc.id"
                    x-text="'[' + (nc.livello ?? '?') + '] ' + (nc.descrizione || nc.id).slice(0, 55)"></option>
          </template>
        </select>

        <!-- Se non ci sono NC: testo -->
        <input id="ev-nc-id" type="text" x-show="ncList.length === 0"
               x-model="formDati.nc_collegata_id"
               placeholder="ID non conformità (opzionale — se già esistente)"
               class="w-full border border-slate-300 rounded-md px-3 py-2 text-sm
                      focus:outline-none focus:ring-2 focus:ring-blue-500
                      placeholder:text-slate-400">

        <p class="mt-1 text-xs text-slate-400">
          Collega l'evento a una NC già aperta, se l'evento ne ha causato o richiesto l'apertura.
        </p>
      </div>

      <!-- Testo AI -->
      <div>
        <label for="ev-testo-ai" class="block text-xs font-medium text-slate-700 mb-1">
          Testo AI-ready
          <span class="text-slate-400 font-normal">(per futura correlazione AI locale — facoltativo)</span>
        </label>
        <!-- Avviso prominente dati sensibili -->
        <p class="text-xs bg-amber-50 border border-amber-200 text-amber-700
                  rounded-md px-3 py-2 mb-1.5">
          <strong>⚠ Attenzione:</strong> questo campo sarà letto dall'AI locale.
          NON inserire codici fiscali, diagnosi, referti o qualsiasi dato sanitario/personale.
          Inserire solo contesto tecnico (rischi PSC, lavorazioni, condizioni del cantiere).
        </p>
        <textarea id="ev-testo-ai" rows="3"
                  x-model="formDati.testo_ai"
                  placeholder="Es. 'Ponteggio di tipo X non completamente montato — rischio caduta dall'alto §3.2 PSC. Lavorazioni in quota senza corretta protezione perimetrale.' — Nessun dato personale."
                  class="w-full border border-slate-300 rounded-md px-3 py-2 text-sm resize-none
                         focus:outline-none focus:ring-2 focus:ring-blue-500
                         placeholder:text-slate-400"></textarea>
      </div>

      <!-- Allegati -->
      <div>
        <div class="flex items-center justify-between mb-1">
          <label class="text-xs font-medium text-slate-700">
            Allegati
            <span class="text-slate-400 font-normal">(foto, verbali, referti tecnici)</span>
          </label>
          <label class="cursor-pointer text-xs text-blue-600 hover:text-blue-800
                        focus-within:ring-2 focus-within:ring-blue-400 rounded">
            <input type="file" multiple accept=".pdf,.png,.jpg,.jpeg"
                   class="sr-only" @change="onAllegatoFile($event)">
            📎 Aggiungi file
          </label>
        </div>
        <p class="text-xs text-slate-400 mb-1.5">
          Formati: PDF, PNG, JPG. File &gt;10 MB: avviso non bloccante.
        </p>
        <div x-show="(formDati.allegati ?? []).length === 0"
             class="text-xs text-slate-400">Nessun allegato.</div>
        <ul class="space-y-1">
          <template x-for="(all, idx) in (formDati.allegati ?? [])" :key="idx">
            <li class="flex items-center gap-2 text-xs bg-slate-50 rounded px-2 py-1.5">
              <button x-show="all.base64" type="button"
                      @click="ALLEGATI.apriAllegato(all.base64, all.filename)"
                      class="text-blue-700 hover:text-blue-900 truncate text-left flex-1
                             focus:outline-none focus:ring-1 focus:ring-blue-400 rounded"
                      :title="all.filename" x-text="'📎 ' + all.filename"></button>
              <span x-show="!all.base64"
                    class="text-slate-400 truncate flex-1"
                    x-text="'📎 ' + all.filename"></span>
              <button x-show="all.base64" type="button"
                      @click="ALLEGATI.scaricaAllegato(all.base64, all.filename)"
                      class="text-slate-400 hover:text-blue-600 flex-shrink-0
                             focus:outline-none focus:ring-1 focus:ring-slate-400 rounded"
                      title="Scarica">⬇</button>
              <button type="button" @click="rimuoviAllegato(idx)"
                      class="text-red-400 hover:text-red-700 flex-shrink-0
                             focus:outline-none focus:ring-1 focus:ring-red-400 rounded"
                      title="Rimuovi">×</button>
            </li>
          </template>
        </ul>
      </div>

      <!-- Note -->
      <div>
        <label for="ev-note" class="block text-xs font-medium text-slate-700 mb-1">
          Note <span class="text-slate-400 font-normal">(opzionali)</span>
        </label>
        <textarea id="ev-note" rows="2"
                  x-model="formDati.note"
                  placeholder="Note aggiuntive…"
                  class="w-full border border-slate-300 rounded-md px-3 py-2 text-sm resize-none
                         focus:outline-none focus:ring-2 focus:ring-blue-500
                         placeholder:text-slate-400"></textarea>
      </div>

      <!-- Stato (solo modifica) -->
      <div x-show="!formNuova"
           class="rounded-xl border border-slate-200 p-3 bg-slate-50">
        <p class="text-xs font-medium text-slate-600 mb-2">Stato dell'evento</p>
        <div class="flex gap-2">
          <template x-for="[val, label, cls] in [
            ['aperto', 'Aperto',  'border-emerald-300 text-emerald-700 bg-emerald-50'],
            ['chiuso', 'Chiuso',  'border-slate-300   text-slate-600   bg-white']
          ]" :key="val">
            <button type="button"
                    @click="formDati.stato = val; modificatoDopoCaricamento = true"
                    :class="formDati.stato === val
                      ? cls + ' font-semibold ring-1 ring-offset-1'
                      : 'border-slate-200 text-slate-500 bg-white hover:bg-slate-100'"
                    class="flex-1 px-2 py-1.5 rounded-lg border text-xs transition-all
                           focus:outline-none focus:ring-2 focus:ring-slate-400"
                    x-text="label"></button>
          </template>
        </div>
      </div>

    </div><!-- /corpo -->

    <!-- footer fisso -->
    <div class="drawer-footer px-5 py-4 border-t border-slate-200 bg-slate-50">
      <p class="text-xs text-slate-400 mb-3">
        Il salvataggio non è bloccato. La descrizione è l'unico campo richiesto.
        I campi condizionali (persona, INAIL) compaiono solo per gli infortuni.
      </p>
      <div class="flex gap-3 justify-end">
        <button @click="chiudiDrawer(false)"
                class="text-sm text-slate-500 hover:text-slate-700 px-4 py-2
                       border border-slate-300 rounded-lg transition-colors
                       focus:outline-none focus:ring-2 focus:ring-slate-400">
          Annulla
        </button>
        <button @click="salvaEvento()" :disabled="salvando"
                class="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white
                       text-sm font-medium px-5 py-2 rounded-lg transition-colors
                       focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2">
          <span x-text="salvando ? 'Salvataggio…' : (formNuova ? 'Registra evento' : 'Salva modifiche')"></span>
        </button>
      </div>
    </div>

  </div><!-- /drawer -->

</div>
`;

// ── Registrazione ─────────────────────────────────────────────────────────────

window.MODULI_REGISTRATI = window.MODULI_REGISTRATI ?? {};
window.MODULI_REGISTRATI['eventi-incidentali'] = {
  monta(contenitore) { contenitore.innerHTML = _TEMPLATE_EI; },
};
