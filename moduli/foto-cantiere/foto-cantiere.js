/**
 * foto-cantiere.js — M24: Archivio foto di cantiere.
 *
 * Storage: file-per-foto in 16_Foto/<uuid>.json (cartella già in scaffolding).
 * Ogni foto viene SEMPRE ridimensionata lato client prima del salvataggio
 * (_ridimensionaFoto da flusso-b-helpers.js) per tenere i file a ~300 KB.
 *
 * Differenze rispetto al pattern Archivio Documenti:
 *   - File separato per foto (non file unico), per scalare a decine di immagini
 *   - Griglia anteprima inline (<img :src=base64>) invece di lista con "apri"
 *   - NESSUN campo testo_ai (per le foto l'AI conosce solo tag+descrizione)
 *   - Ridimensionamento automatico al caricamento del file
 *
 * NON usa Alpine.initTree.
 * Dipende da: _ridimensionaFoto (flusso-b-helpers.js), ALLEGATI, FILESYSTEM,
 *             UTILS, NOTIFICHE, ERRORI (già caricati).
 */

'use strict';

// ── Vocabolario tag ───────────────────────────────────────────────────────────

const TAG_FOTO = [
  { valore: 'avanzamento_lavori',  etichetta: 'Avanzamento lavori' },
  { valore: 'non_conformita',      etichetta: 'Non conformità' },
  { valore: 'dpi_sicurezza',       etichetta: 'DPI / Sicurezza' },
  { valore: 'attrezzature',        etichetta: 'Attrezzature / Mezzi' },
  { valore: 'ponteggio',           etichetta: 'Ponteggio / Opere provvisionali' },
  { valore: 'area_cantiere',       etichetta: 'Area cantiere / Layout' },
  { valore: 'dettaglio_tecnico',   etichetta: 'Dettaglio tecnico' },
  { valore: 'evento',              etichetta: 'Evento incidentale' },
  { valore: 'altro',               etichetta: 'Altro' },
];

// ── Service ───────────────────────────────────────────────────────────────────

const FOTO_SERVICE = (() => {

  const _CARTELLA = '16_Foto';

  const _getDirFoto = async (cantiereId, crea = false) => {
    const root = FILESYSTEM.getHandleAttivo();
    const cantDir = await root.getDirectoryHandle(cantiereId);
    return FILESYSTEM.navigaPercorso(cantDir, [_CARTELLA], crea);
  };

  /**
   * Scansiona 16_Foto/ e restituisce le foto che soddisfano il predicato.
   * @param {string}   cantiereId
   * @param {Function} predicato  (foto) => boolean — es. f => !f._cestino
   */
  const _scansiona = async (cantiereId, predicato) => {
    let dir;
    try {
      dir = await _getDirFoto(cantiereId, false);
    } catch (e) {
      if (e.name === 'NotFoundError') return [];
      throw e;
    }
    const risultati = [];
    for await (const [nome, fh] of dir.entries()) {
      if (fh.kind !== 'file' || !nome.endsWith('.json')) continue;
      try {
        const foto = await FILESYSTEM.leggiJson(dir, nome);
        if (predicato(foto)) risultati.push(foto);
      } catch { /* file corrotto o temporaneamente non leggibile */ }
    }
    return risultati;
  };

  /**
   * Legge tutte le foto non cestinate, ordinate per data desc.
   * @param {string} cantiereId
   * @returns {Promise<object[]>}
   */
  const leggi = async (cantiereId) => {
    const lista = await _scansiona(cantiereId, f => !f._cestino);
    lista.sort((a, b) =>
      (b.data ?? b.creato_il ?? '').localeCompare(a.data ?? a.creato_il ?? '')
    );
    return lista;
  };

  /**
   * Legge le foto cestinate (_cestino:true), ordinate per data eliminazione desc.
   * @param {string} cantiereId
   * @returns {Promise<object[]>}
   */
  const leggiCestino = async (cantiereId) => {
    const lista = await _scansiona(cantiereId, f => !!f._cestino);
    lista.sort((a, b) =>
      (b._eliminato_il ?? '').localeCompare(a._eliminato_il ?? '')
    );
    return lista;
  };

  /**
   * Scrive (crea o aggiorna) il file 16_Foto/<uuid>.json.
   * Crea la cartella al volo se necessario (primo avvio su cantiere esistente).
   * @param {object} foto
   * @returns {Promise<object>}
   */
  const scrivi = async (foto) => {
    foto.aggiornato_il = new Date().toISOString();
    const dir = await _getDirFoto(foto.cantiere_id, true);
    await FILESYSTEM.scriviJson(dir, `${foto.id}.json`, foto);
    return foto;
  };

  /**
   * Schema vuoto per una nuova foto.
   * @param {string} cantiereId
   * @returns {object}
   */
  const creaVuota = (cantiereId) => ({
    id:                   UTILS.uuid(),
    tipo_file:            'foto_cantiere',
    cantiere_id:          cantiereId ?? '',
    tag:                  'avanzamento_lavori',
    tag_personalizzato:   '',
    descrizione:          '',
    data:                 UTILS.oggi(),
    filename:             null,
    base64:               null,          // JPEG ridimensionata (~300 KB tipico)
    larghezza_px:         null,
    altezza_px:           null,
    nc_collegata_id:      '',
    evento_collegato_id:  '',
    creato_il:            new Date().toISOString(),
    aggiornato_il:        new Date().toISOString(),
  });

  return { leggi, leggiCestino, scrivi, creaVuota };

})();

// ── Helper dimensione ─────────────────────────────────────────────────────────

function _formataDimensioneFoto(base64) {
  if (!base64) return null;
  const kb = Math.round(base64.length * 0.75 / 1024);
  return kb >= 1024 ? (kb / 1024).toFixed(1) + ' MB' : kb + ' KB';
}

// ── Componente Alpine ─────────────────────────────────────────────────────────

function FotoCantiere() {
  return {
    // ── Stato lista
    lista:         [],
    listaCestino:  [],
    caricamento:   false,
    vistaCorrente: 'lista',   // 'lista' | 'cestino'

    // Filtri
    filtroTag:     '',
    cercaTesto:    '',
    filtroPeriodo: '',

    // Drawer
    drawerAperto:    false,
    formDati:        {},
    formNuova:       true,
    caricamentoFoto: false,   // spinner durante ridimensionamento
    salvando:        false,
    _modificato:     false,

    _cantiereId: null,

    // ── Computed ─────────────────────────────────────────────────────────────

    get listaFiltrata() {
      let r = this.lista;
      if (this.filtroTag) r = r.filter(f => f.tag === this.filtroTag);
      if (this.cercaTesto.trim()) {
        const t = this.cercaTesto.toLowerCase();
        r = r.filter(f =>
          (f.descrizione ?? '').toLowerCase().includes(t) ||
          (f.filename    ?? '').toLowerCase().includes(t)
        );
      }
      if (this.filtroPeriodo) {
        const cutoff = new Date();
        if      (this.filtroPeriodo === 'settimana') cutoff.setDate(cutoff.getDate() - 7);
        else if (this.filtroPeriodo === 'mese')      cutoff.setDate(cutoff.getDate() - 30);
        const cutoffStr = cutoff.toISOString().slice(0, 10);
        r = r.filter(f => (f.data ?? f.creato_il?.slice(0, 10) ?? '') >= cutoffStr);
      }
      return r;
    },

    get nFoto()    { return this.lista.length; },
    get tagLibero(){ return this.formDati.tag === 'altro'; },

    get formDimensione() {
      return _formataDimensioneFoto(this.formDati.base64);
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
        this.filtroTag     = '';
        this.cercaTesto    = '';
        this.filtroPeriodo = '';
        this.caricaDati();
      }
    },

    async caricaDati() {
      this.caricamento = true;
      const cantId = this._cantiereId;
      if (!cantId) { this.lista = []; this.caricamento = false; return; }
      try {
        this.lista = await FOTO_SERVICE.leggi(cantId);
      } catch (err) {
        ERRORI.gestisciErrore('foto-cantiere/carica', err);
        this.lista = [];
      } finally {
        this.caricamento = false;
      }
    },

    async caricaCestino() {
      const cantId = this._cantiereId;
      if (!cantId) { this.listaCestino = []; return; }
      try {
        this.listaCestino = await FOTO_SERVICE.leggiCestino(cantId);
      } catch (err) {
        ERRORI.gestisciErrore('foto-cantiere/cestino', err);
        this.listaCestino = [];
      }
    },

    // ── Drawer ────────────────────────────────────────────────────────────────

    apriNuovaFoto() {
      this.formDati    = FOTO_SERVICE.creaVuota(this._cantiereId);
      this.formNuova   = true;
      this._modificato = false;
      this.drawerAperto = true;
      this.$nextTick(() => document.getElementById('foto-file-label')?.focus());
    },

    apriModificaFoto(foto) {
      this.formDati    = JSON.parse(JSON.stringify(foto));
      this.formNuova   = false;
      this._modificato = false;
      this.drawerAperto = true;
    },

    chiudiDrawer(forza = false) {
      if (!forza && this._modificato) {
        if (!confirm('Ci sono modifiche non salvate. Chiudere senza salvare?')) return;
      }
      this.drawerAperto = false;
      this.formDati     = {};
    },

    async salvaFoto() {
      if (!this.formDati.base64) {
        NOTIFICHE.attenzione('Foto', 'Seleziona un\'immagine prima di salvare.');
        return;
      }
      this.salvando = true;
      try {
        const saved = await FOTO_SERVICE.scrivi(this.formDati);
        if (this.formNuova) {
          this.lista.unshift({ ...saved });
        } else {
          const idx = this.lista.findIndex(f => f.id === saved.id);
          if (idx >= 0) this.lista[idx] = { ...saved };
        }
        this.lista = [...this.lista];
        NOTIFICHE.successo(this.formNuova ? 'Foto aggiunta' : 'Foto aggiornata');
        this.chiudiDrawer(true);
      } catch (err) {
        ERRORI.gestisciErrore('foto-cantiere/salva', err);
      } finally {
        this.salvando = false;
      }
    },

    // ── File immagine ─────────────────────────────────────────────────────────

    async onFileSelezionato(event) {
      const file = event.target.files?.[0];
      if (!file) return;
      this.caricamentoFoto = true;
      try {
        const { base64, larghezza_px, altezza_px } = await _ridimensionaFoto(file);
        this.formDati.base64       = base64;
        this.formDati.filename     = file.name;
        this.formDati.larghezza_px = larghezza_px;
        this.formDati.altezza_px   = altezza_px;
        this.formDati = { ...this.formDati };
        this._modificato = true;
      } catch {
        NOTIFICHE.errore('Foto', 'Impossibile elaborare l\'immagine. Verifica che sia un JPEG o PNG valido.');
      } finally {
        this.caricamentoFoto = false;
      }
      event.target.value = '';
    },

    // ── Cestina / ripristina / elimina ────────────────────────────────────────

    async cestinaFoto(foto) {
      if (!confirm('Spostare questa foto nel cestino?')) return;
      try {
        const tombstone = { ...foto, _cestino: true, _eliminato_il: new Date().toISOString() };
        await FOTO_SERVICE.scrivi(tombstone);
        this.lista = this.lista.filter(f => f.id !== foto.id);
        NOTIFICHE.info('Foto', 'Spostata nel cestino.');
      } catch (err) {
        ERRORI.gestisciErrore('foto-cantiere/cestina', err);
      }
    },

    async aprireCestino() {
      this.vistaCorrente = 'cestino';
      await this.caricaCestino();
    },

    async ripristinaFoto(foto) {
      try {
        // eslint-disable-next-line no-unused-vars
        const { _cestino, _eliminato_il, ...ripristinata } = foto;
        ripristinata.aggiornato_il = new Date().toISOString();
        await FOTO_SERVICE.scrivi(ripristinata);
        this.listaCestino = this.listaCestino.filter(f => f.id !== foto.id);
        this.lista.unshift(ripristinata);
        this.lista = [...this.lista];
        NOTIFICHE.successo('Foto ripristinata');
      } catch (err) {
        ERRORI.gestisciErrore('foto-cantiere/ripristina', err);
      }
    },

    async eliminaDefinitivaFoto(foto) {
      if (!confirm('Eliminare definitivamente questa foto? L\'operazione non è reversibile.')) return;
      try {
        const dir = await (() => {
          const root = FILESYSTEM.getHandleAttivo();
          return root.getDirectoryHandle(foto.cantiere_id)
            .then(c => FILESYSTEM.navigaPercorso(c, ['16_Foto'], false));
        })();
        const fh = await dir.getFileHandle(`${foto.id}.json`);
        await fh.remove?.();
        this.listaCestino = this.listaCestino.filter(f => f.id !== foto.id);
        NOTIFICHE.info('Foto', 'Eliminata definitivamente.');
      } catch (err) {
        ERRORI.gestisciErrore('foto-cantiere/elimina', err);
      }
    },

    // ── Helper UI ─────────────────────────────────────────────────────────────

    tagEtichetta(tag, tagPers) {
      if (tag === 'altro') return tagPers || 'Altro';
      return TAG_FOTO.find(t => t.valore === tag)?.etichetta ?? tag;
    },

    tagCls(tag) {
      const MAP = {
        non_conformita: 'bg-red-100 text-red-700',
        dpi_sicurezza:  'bg-orange-100 text-orange-700',
        ponteggio:      'bg-amber-100 text-amber-700',
        evento:         'bg-rose-100 text-rose-700',
      };
      return MAP[tag] ?? 'bg-slate-100 text-slate-600';
    },

    _tagFoto() { return TAG_FOTO; },
  };
}

// ── Template HTML ─────────────────────────────────────────────────────────────

const _TEMPLATE_FC = `
<div x-data="FotoCantiere()" x-init="init()" x-effect="aggiornaSeCantiereRicambia()"
     class="max-w-5xl">

  <!-- === HEADER === -->
  <div class="flex items-center justify-between mb-4">
    <div>
      <h1 class="text-xl font-semibold text-slate-800">📷 Foto Cantiere</h1>
      <p class="text-xs text-slate-400 mt-0.5"
         x-text="nFoto + (nFoto === 1 ? ' foto' : ' foto') + ' · ridimensionate automaticamente per il salvataggio'"></p>
    </div>
    <div class="flex items-center gap-2">
      <button @click="vistaCorrente === 'cestino' ? (vistaCorrente = 'lista') : aprireCestino()"
              class="text-xs text-slate-500 bg-slate-50 border border-slate-200
                     px-2.5 py-1 rounded-full hover:bg-slate-100 transition-colors
                     focus:outline-none focus:ring-2 focus:ring-slate-400"
              x-text="vistaCorrente === 'cestino' ? '← Torna alla griglia' : '🗑 Cestino'">
      </button>
      <button @click="apriNuovaFoto()"
              x-show="$store.cantiere.id && vistaCorrente === 'lista'"
              class="bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium
                     px-4 py-2 rounded-lg transition-colors
                     focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2">
        + Aggiungi foto
      </button>
    </div>
  </div>

  <!-- Nessun cantiere -->
  <div x-show="!$store.cantiere.id" class="placeholder-modulo">
    <div class="text-3xl" aria-hidden="true">📷</div>
    <p class="text-slate-500">Seleziona un cantiere per gestire le foto.</p>
  </div>

  <div x-show="$store.cantiere.id">

    <!-- Spinner -->
    <div x-show="caricamento" class="flex items-center gap-3 py-10 text-slate-400 text-sm">
      <div class="w-5 h-5 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"
           role="status" aria-label="Caricamento in corso"></div>
      Caricamento foto…
    </div>

    <!-- ═══════════════ VISTA GRIGLIA ═══════════════ -->
    <div x-show="!caricamento && vistaCorrente === 'lista'">

      <!-- Filtri -->
      <div class="flex flex-wrap gap-2 mb-4 items-center">
        <select x-model="filtroTag"
                class="border border-slate-300 rounded-md px-2.5 py-1.5 text-sm bg-white
                       focus:outline-none focus:ring-2 focus:ring-blue-500"
                aria-label="Filtra per tag">
          <option value="">Tutti i tag</option>
          <template x-for="t in _tagFoto()" :key="t.valore">
            <option :value="t.valore" x-text="t.etichetta"></option>
          </template>
        </select>

        <select x-model="filtroPeriodo"
                class="border border-slate-300 rounded-md px-2.5 py-1.5 text-sm bg-white
                       focus:outline-none focus:ring-2 focus:ring-blue-500"
                aria-label="Filtra per periodo">
          <option value="">Tutto il periodo</option>
          <option value="settimana">Ultima settimana</option>
          <option value="mese">Ultimo mese</option>
        </select>

        <input type="search" x-model="cercaTesto"
               placeholder="Cerca in descrizione o nome file…"
               class="flex-1 min-w-[160px] border border-slate-300 rounded-md
                      px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
               aria-label="Ricerca testo">

        <button x-show="filtroTag || filtroPeriodo || cercaTesto"
                @click="filtroTag = ''; filtroPeriodo = ''; cercaTesto = ''"
                class="text-xs text-slate-400 hover:text-slate-600 px-2 py-1 rounded
                       focus:outline-none focus:ring-2 focus:ring-slate-400">
          × Azzera
        </button>
      </div>

      <!-- Vuoto globale -->
      <div x-show="lista.length === 0"
           class="py-16 text-center text-slate-400">
        <div class="text-5xl mb-3" aria-hidden="true">📷</div>
        <p class="font-medium text-slate-500">Nessuna foto in archivio per questo cantiere.</p>
        <p class="text-sm mt-1">Clicca "+ Aggiungi foto" per iniziare.</p>
      </div>

      <!-- Vuoto per filtri -->
      <div x-show="lista.length > 0 && listaFiltrata.length === 0"
           class="py-12 text-center text-slate-400">
        <div class="text-3xl mb-2" aria-hidden="true">🔍</div>
        <p>Nessuna foto corrisponde ai filtri attivi.</p>
      </div>

      <!-- === GRIGLIA === -->
      <div x-show="listaFiltrata.length > 0"
           role="list" aria-label="Foto cantiere"
           class="grid grid-cols-2 md:grid-cols-3 gap-3">

        <template x-for="foto in listaFiltrata" :key="foto.id">
          <article role="listitem"
                   class="border border-slate-200 bg-white rounded-xl overflow-hidden
                          hover:border-slate-300 transition-all">

            <!-- Thumbnail cliccabile (apre immagine a piena risoluzione) -->
            <div class="relative">
              <img :src="foto.base64" :alt="foto.descrizione || 'Foto cantiere'"
                   class="w-full h-44 object-cover cursor-pointer"
                   @click="ALLEGATI.apriAllegato(foto.base64, foto.filename)"
                   title="Apri a piena risoluzione"
                   loading="lazy">
              <!-- Tag badge sovrapposto -->
              <span :class="tagCls(foto.tag)"
                    class="absolute top-2 left-2 text-xs px-2 py-0.5 rounded-full
                           font-medium shadow-sm backdrop-blur-sm"
                    x-text="tagEtichetta(foto.tag, foto.tag_personalizzato)"></span>
            </div>

            <!-- Metadati -->
            <div class="px-3 pt-2 pb-1">
              <p x-show="foto.data"
                 class="text-xs text-slate-400 mb-1"
                 x-text="UTILS.formatData(foto.data + 'T12:00:00Z')"></p>
              <p class="text-sm text-slate-700 line-clamp-2 leading-snug"
                 x-text="foto.descrizione || '(nessuna descrizione)'"></p>
              <!-- Collegamento NC o evento, se presente -->
              <p x-show="foto.nc_collegata_id"
                 class="text-xs text-rose-600 mt-1 truncate"
                 x-text="'⚠ NC: ' + foto.nc_collegata_id"></p>
              <p x-show="foto.evento_collegato_id"
                 class="text-xs text-red-600 mt-0.5 truncate"
                 x-text="'🚨 Evento: ' + foto.evento_collegato_id"></p>
            </div>

            <!-- Azioni -->
            <div class="flex items-center gap-1 px-3 pb-2 pt-1">
              <button @click="apriModificaFoto(foto)"
                      class="text-xs text-slate-500 hover:text-slate-800 px-2 py-1 rounded
                             hover:bg-slate-50 transition-colors
                             focus:outline-none focus:ring-2 focus:ring-slate-400"
                      :aria-label="'Modifica foto: ' + (foto.descrizione || '').slice(0,30)">
                ✏ Modifica
              </button>
              <button @click="ALLEGATI.scaricaAllegato(foto.base64, foto.filename)"
                      class="text-xs text-slate-400 hover:text-blue-600 px-2 py-1 rounded
                             hover:bg-slate-50 transition-colors
                             focus:outline-none focus:ring-2 focus:ring-blue-400"
                      title="Scarica foto">
                ⬇ Scarica
              </button>
              <button @click="cestinaFoto(foto)"
                      class="text-xs text-red-400 hover:text-red-700 px-2 py-1 rounded
                             hover:bg-red-50 transition-colors ml-auto
                             focus:outline-none focus:ring-2 focus:ring-red-400"
                      title="Sposta nel cestino">🗑</button>
            </div>

          </article>
        </template>
      </div>

    </div><!-- /lista -->

    <!-- ═══════════════ VISTA CESTINO ═══════════════ -->
    <div x-show="!caricamento && vistaCorrente === 'cestino'">

      <div class="flex items-center gap-3 mb-4">
        <button @click="vistaCorrente = 'lista'"
                class="text-sm text-slate-500 hover:text-slate-700
                       focus:outline-none focus:ring-2 focus:ring-slate-400 rounded">
          ← Torna alla griglia
        </button>
        <h2 class="text-base font-semibold text-slate-700">🗑 Cestino — foto cantiere</h2>
      </div>

      <div x-show="listaCestino.length === 0"
           class="py-12 text-center text-slate-400">
        <p>Nessuna foto nel cestino.</p>
      </div>

      <div class="grid grid-cols-2 md:grid-cols-3 gap-3">
        <template x-for="foto in listaCestino" :key="foto.id">
          <article class="border border-slate-200 bg-slate-50 rounded-xl overflow-hidden opacity-70">
            <img :src="foto.base64" :alt="foto.descrizione || ''"
                 class="w-full h-36 object-cover grayscale">
            <div class="px-3 py-2">
              <p class="text-xs text-slate-500 line-clamp-1 line-through"
                 x-text="foto.descrizione || '(nessuna descrizione)'"></p>
              <p x-show="foto._eliminato_il"
                 class="text-xs text-slate-400 mt-1"
                 x-text="'Cestinata: ' + UTILS.formatData(foto._eliminato_il)"></p>
              <div class="flex gap-2 mt-2">
                <button @click="ripristinaFoto(foto)"
                        class="text-xs text-blue-600 bg-blue-50 border border-blue-200
                               px-2 py-1 rounded hover:bg-blue-100 transition-colors
                               focus:outline-none focus:ring-2 focus:ring-blue-400">
                  ↩ Ripristina
                </button>
                <button @click="eliminaDefinitivaFoto(foto)"
                        class="text-xs text-red-600 bg-red-50 border border-red-200
                               px-2 py-1 rounded hover:bg-red-100 transition-colors
                               focus:outline-none focus:ring-2 focus:ring-red-400">
                  🗑 Elimina
                </button>
              </div>
            </div>
          </article>
        </template>
      </div>

    </div><!-- /cestino -->

  </div><!-- /$store.cantiere.id -->


  <!-- ════════════════════════════════════════════════════════════════
       DRAWER: Aggiungi / Modifica foto
       ════════════════════════════════════════════════════════════════ -->
  <div x-show="drawerAperto" x-cloak
       class="drawer-backdrop"
       @click="chiudiDrawer(false)"
       aria-hidden="true"></div>

  <div x-show="drawerAperto" x-cloak
       @input="_modificato = true"
       @keydown.escape.window="chiudiDrawer(false)"
       class="drawer"
       role="dialog" aria-modal="true"
       :aria-label="formNuova ? 'Aggiungi foto' : 'Modifica foto'">

    <!-- header fisso -->
    <div class="drawer-header flex items-center justify-between px-5 py-4
                border-b border-slate-200 bg-white">
      <h2 class="text-base font-semibold text-slate-800"
          x-text="formNuova ? 'Aggiungi foto' : 'Modifica foto'"></h2>
      <button @click="chiudiDrawer(false)" aria-label="Chiudi"
              class="p-1.5 rounded hover:bg-slate-100 text-slate-500 text-lg
                     focus:outline-none focus:ring-2 focus:ring-slate-400">✕</button>
    </div>

    <!-- corpo scrollabile -->
    <div class="drawer-body px-5 py-4 space-y-4">

      <!-- ── Immagine ─────────────────────────────────────────────── -->

      <!-- Anteprima foto esistente (modifica) o pulsante carica (nuova) -->
      <div>
        <p class="block text-xs font-medium text-slate-700 mb-2">
          Immagine
          <span x-show="formNuova" class="text-red-500">*</span>
          <span x-show="!formNuova" class="text-slate-400 font-normal">(sostituibile)</span>
        </p>

        <!-- Anteprima (quando c'è un'immagine) -->
        <template x-if="formDati.base64">
          <div class="relative mb-2">
            <img :src="formDati.base64" :alt="formDati.filename || ''"
                 class="w-full max-h-56 object-contain rounded-lg bg-slate-100 border border-slate-200">
            <div class="mt-1.5 flex items-center gap-2 text-xs text-slate-500">
              <span x-text="formDati.filename || ''"></span>
              <span x-show="formDati.larghezza_px"
                    x-text="formDati.larghezza_px + '×' + formDati.altezza_px + ' px'"></span>
              <span x-show="formDimensione"
                    class="text-emerald-600 font-medium"
                    x-text="'~' + formDimensione + ' (ridimensionata)'"></span>
            </div>
          </div>
        </template>

        <!-- Pulsante carica / sostituisci -->
        <div>
          <!-- Spinner durante ridimensionamento -->
          <div x-show="caricamentoFoto"
               class="flex items-center gap-2 text-sm text-blue-600 py-2">
            <div class="w-4 h-4 border-2 border-blue-600 border-t-transparent
                        rounded-full animate-spin"></div>
            Ridimensionamento in corso…
          </div>

          <label id="foto-file-label" tabindex="0"
                 x-show="!caricamentoFoto"
                 class="cursor-pointer inline-flex items-center gap-2 text-sm
                        text-blue-600 border border-blue-300 px-3 py-1.5 rounded-lg
                        hover:bg-blue-50 transition-colors
                        focus:outline-none focus:ring-2 focus:ring-blue-400
                        focus-within:ring-2 focus-within:ring-blue-400">
            <input type="file" accept="image/jpeg,image/png"
                   class="sr-only" @change="onFileSelezionato($event)">
            📷 <span x-text="formDati.base64 ? 'Sostituisci immagine' : 'Seleziona immagine JPEG/PNG'"></span>
          </label>
          <p class="mt-1 text-xs text-slate-400">
            Ridimensionata automaticamente a max 1920 px, qualità JPEG 80%.
            Peso tipico: ~300 KB invece di 3–8 MB originali.
          </p>
        </div>
      </div>

      <!-- ── Tag ──────────────────────────────────────────────────── -->
      <div>
        <label for="foto-tag" class="block text-xs font-medium text-slate-700 mb-1">
          Tag / Categoria
        </label>
        <select id="foto-tag" x-model="formDati.tag"
                class="w-full border border-slate-300 rounded-md px-3 py-2 text-sm bg-white
                       focus:outline-none focus:ring-2 focus:ring-blue-500">
          <template x-for="t in _tagFoto()" :key="t.valore">
            <option :value="t.valore" x-text="t.etichetta"></option>
          </template>
        </select>
      </div>

      <!-- Tag personalizzato (solo se 'altro') -->
      <div x-show="tagLibero">
        <label for="foto-tag-pers" class="block text-xs font-medium text-slate-700 mb-1">
          Specifica il tipo <span class="text-red-500">*</span>
        </label>
        <input id="foto-tag-pers" type="text"
               x-model="formDati.tag_personalizzato"
               placeholder="Es. accantieramento, recinzione…"
               class="w-full border border-slate-300 rounded-md px-3 py-2 text-sm
                      focus:outline-none focus:ring-2 focus:ring-blue-500
                      placeholder:text-slate-400">
      </div>

      <!-- ── Descrizione ───────────────────────────────────────────── -->
      <div>
        <label for="foto-desc" class="block text-xs font-medium text-slate-700 mb-1">
          Descrizione
          <span class="text-slate-400 font-normal">(cosa mostra la foto)</span>
        </label>
        <textarea id="foto-desc" rows="3"
                  x-model="formDati.descrizione"
                  placeholder="Es. stato del ponteggio facciata nord, assenza tavola fermapiede lato est…"
                  class="w-full border border-slate-300 rounded-md px-3 py-2 text-sm resize-none
                         focus:outline-none focus:ring-2 focus:ring-blue-500
                         placeholder:text-slate-400"></textarea>
      </div>

      <!-- ── Data ─────────────────────────────────────────────────── -->
      <div>
        <label for="foto-data" class="block text-xs font-medium text-slate-700 mb-1">
          Data
        </label>
        <input id="foto-data" type="date"
               x-model="formDati.data"
               class="w-full border border-slate-300 rounded-md px-3 py-2 text-sm
                      focus:outline-none focus:ring-2 focus:ring-blue-500">
      </div>

      <!-- ── Collegamenti opzionali ────────────────────────────────── -->
      <div class="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 space-y-3">
        <p class="text-xs font-medium text-slate-600">
          Collegamento <span class="font-normal text-slate-400">(opzionale)</span>
        </p>

        <div>
          <label for="foto-nc" class="block text-xs text-slate-600 mb-1">
            ID Non Conformità collegata
          </label>
          <input id="foto-nc" type="text"
                 x-model="formDati.nc_collegata_id"
                 placeholder="ID NC (opzionale)"
                 class="w-full border border-slate-300 rounded-md px-3 py-1.5 text-sm
                        focus:outline-none focus:ring-2 focus:ring-blue-500
                        placeholder:text-slate-400">
        </div>

        <div>
          <label for="foto-ev" class="block text-xs text-slate-600 mb-1">
            ID Evento incidentale collegato
          </label>
          <input id="foto-ev" type="text"
                 x-model="formDati.evento_collegato_id"
                 placeholder="ID evento (opzionale)"
                 class="w-full border border-slate-300 rounded-md px-3 py-1.5 text-sm
                        focus:outline-none focus:ring-2 focus:ring-blue-500
                        placeholder:text-slate-400">
        </div>
      </div>

    </div><!-- /corpo -->

    <!-- footer fisso -->
    <div class="drawer-footer px-5 py-4 border-t border-slate-200 bg-slate-50">
      <p class="text-xs text-slate-400 mb-3">
        La foto viene ridimensionata automaticamente al caricamento (~300 KB).
        Solo l'immagine è obbligatoria; tag, descrizione e data si aggiungono quando vuoi.
      </p>
      <div class="flex gap-3 justify-end">
        <button @click="chiudiDrawer(false)"
                class="text-sm text-slate-500 hover:text-slate-700 px-4 py-2
                       border border-slate-300 rounded-lg transition-colors
                       focus:outline-none focus:ring-2 focus:ring-slate-400">
          Annulla
        </button>
        <button @click="salvaFoto()" :disabled="salvando || caricamentoFoto"
                class="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white
                       text-sm font-medium px-5 py-2 rounded-lg transition-colors
                       focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2">
          <span x-text="salvando ? 'Salvataggio…' : (formNuova ? 'Aggiungi foto' : 'Salva modifiche')"></span>
        </button>
      </div>
    </div>

  </div><!-- /drawer -->

</div>
`;

// ── Registrazione ─────────────────────────────────────────────────────────────

window.MODULI_REGISTRATI = window.MODULI_REGISTRATI ?? {};
window.MODULI_REGISTRATI['foto-cantiere'] = {
  monta(contenitore) { contenitore.innerHTML = _TEMPLATE_FC; },
};
