/**
 * archivio-documenti.js — Raccoglitore residuale di documenti generici di cantiere.
 *
 * Nicchia: documenti trasversali non coperti dagli altri moduli
 * (autorizzazioni, permessi, corrispondenza, tavole, certificati…).
 * Storage: 18_Archivio-Documenti/archivio_documenti.json (file unico per cantiere).
 * La cartella viene creata AL VOLO al primo salvataggio (crea=true).
 *
 * Pattern: clone Corpus PSC (Sez.1) — raccoglitore piatto, nessun iter protocollare.
 * NESSUN Alpine.initTree — il MutationObserver di Alpine v3 inizializza da solo.
 */

'use strict';

// ── Vocabolario tag ───────────────────────────────────────────────────────────

const TAG_ARCHIVIO = [
  { valore: 'autorizzazione',    etichetta: 'Autorizzazione' },
  { valore: 'permesso',          etichetta: 'Permesso / Titolo edilizio' },
  { valore: 'comunicazione',     etichetta: 'Comunicazione' },
  { valore: 'corrispondenza',    etichetta: 'Corrispondenza' },
  { valore: 'verbale_esterno',   etichetta: 'Verbale esterno' },
  { valore: 'certificato',       etichetta: 'Certificato / Collaudo' },
  { valore: 'contratto',         etichetta: 'Contratto / Accordo' },
  { valore: 'elaborato_tecnico', etichetta: 'Elaborato tecnico / Tavola' },
  { valore: 'altro',             etichetta: 'Altro' },
];

const _SOGLIA_FILE_ARCHIVIO = 10 * 1024 * 1024;

// ── Helper file ───────────────────────────────────────────────────────────────

const _leggiFileArchivio = (file) =>
  new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload  = (e) => resolve(e.target.result);
    r.onerror = ()  => reject(new Error('Lettura file non riuscita'));
    r.readAsDataURL(file);
  });

function _formataBytesArchivio(bytes) {
  if (bytes >= 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  return Math.round(bytes / 1024) + ' KB';
}

// ── Service ───────────────────────────────────────────────────────────────────

const ARCHIVIO_DOCS_SERVICE = (() => {

  const NOME_FILE = 'archivio_documenti.json';

  const _getDir = async (cantiereId, crea = false) => {
    const root = FILESYSTEM.getHandleAttivo();
    if (!root) throw new Error('Filesystem non agganciato.');
    const dirCantiere = await root.getDirectoryHandle(cantiereId);
    return FILESYSTEM.navigaPercorso(dirCantiere, ['18_Archivio-Documenti'], crea);
  };

  /**
   * Legge archivio_documenti.json.
   * Se la cartella o il file non esistono restituisce lo schema vuoto:
   * la prima scrittura li crea (crea=true in scrivi).
   */
  const leggiArchivio = async (cantiereId) => {
    try {
      const dir = await _getDir(cantiereId);
      return await FILESYSTEM.leggiJson(dir, NOME_FILE);
    } catch (e) {
      if (e.name === 'NotFoundError') {
        return {
          tipo_file:     'archivio_documenti',
          cantiere_id:   cantiereId,
          generato_il:   new Date().toISOString(),
          aggiornato_il: new Date().toISOString(),
          documenti:     [],
        };
      }
      throw e;
    }
  };

  const scriviArchivio = async (archivio) => {
    archivio.aggiornato_il = new Date().toISOString();
    const dir = await _getDir(archivio.cantiere_id, true);
    await FILESYSTEM.scriviJson(dir, NOME_FILE, archivio);
    return archivio;
  };

  return { leggiArchivio, scriviArchivio };

})();

// ── Componente Alpine ─────────────────────────────────────────────────────────

function ArchivioDocumenti() {
  return {

    // ── Stato ────────────────────────────────────────────────────────────────
    _cantiereId:    null,
    archivio:       null,
    caricamento:    false,
    erroreCaricamento: null,

    // Filtri
    filtroTag:   '',
    cercaTesto:  '',

    // Drawer
    drawerAperto:          false,
    formNuovo:             true,
    formId:                null,
    formTag:               'autorizzazione',
    formTagPersonalizzato: '',
    formDescrizione:       '',
    formData:              '',
    formFilename:          null,
    formBase64:            null,
    formFileSize:          null,
    formTestoAi:           '',
    salvando:              false,
    _modificato:           false,

    // ── Computed ──────────────────────────────────────────────────────────────

    get documentiFiltrati() {
      let voci = (this.archivio?.documenti ?? []).filter(d => !d._cestino);
      if (this.filtroTag)
        voci = voci.filter(d => d.tag === this.filtroTag);
      if (this.cercaTesto.trim()) {
        const t = this.cercaTesto.toLowerCase();
        voci = voci.filter(d =>
          (d.descrizione ?? '').toLowerCase().includes(t) ||
          (d.filename    ?? '').toLowerCase().includes(t)
        );
      }
      return voci;
    },

    get tagLibero() { return this.formTag === 'altro'; },

    get avvisoFileGrande() {
      return this.formFileSize !== null && this.formFileSize > _SOGLIA_FILE_ARCHIVIO;
    },

    // ── Lifecycle ──────────────────────────────────────────────────────────────

    async init() {
      this._cantiereId = Alpine.store('cantiere')?.id;
      await this._carica();
      document.addEventListener('cantiere-cambiato', () => this._onCantiereChanged());
    },

    _onCantiereChanged() {
      const id = Alpine.store('cantiere')?.id;
      if (id === this._cantiereId) return;
      this._cantiereId = id;
      this.archivio    = null;
      this.filtroTag   = '';
      this.cercaTesto  = '';
      this.erroreCaricamento = null;
      if (this.drawerAperto) this.chiudiDrawer(true);
      this._carica();
    },

    async _carica() {
      const cantId = this._cantiereId;
      this.caricamento       = true;
      this.erroreCaricamento = null;
      this.archivio          = null;
      if (!cantId) { this.caricamento = false; return; }
      try {
        this.archivio = await ARCHIVIO_DOCS_SERVICE.leggiArchivio(cantId);
      } catch (err) {
        ERRORI.gestisciErrore('archivio-documenti/carica', err);
        this.erroreCaricamento = err.message ?? 'Errore di lettura.';
      } finally {
        this.caricamento = false;
      }
    },

    // ── Drawer ────────────────────────────────────────────────────────────────

    apriNuovoDoc() {
      this.formNuovo              = true;
      this.formId                 = null;
      this.formTag                = 'autorizzazione';
      this.formTagPersonalizzato  = '';
      this.formDescrizione        = '';
      this.formData               = '';
      this.formFilename           = null;
      this.formBase64             = null;
      this.formFileSize           = null;
      this.formTestoAi            = '';
      this._modificato            = false;
      this.drawerAperto           = true;
      this.$nextTick(() => document.getElementById('arch-tag')?.focus());
    },

    apriModificaDoc(doc) {
      this.formNuovo              = false;
      this.formId                 = doc.id;
      this.formTag                = doc.tag ?? 'autorizzazione';
      this.formTagPersonalizzato  = doc.tag_personalizzato ?? '';
      this.formDescrizione        = doc.descrizione ?? '';
      this.formData               = doc.data ?? '';
      this.formFilename           = doc.filename ?? null;
      this.formBase64             = doc.base64 ?? null;
      this.formFileSize           = null;
      this.formTestoAi            = doc.testo_ai ?? '';
      this._modificato            = false;
      this.drawerAperto           = true;
    },

    chiudiDrawer(forza = false) {
      if (!forza && this._modificato) {
        if (!confirm('Ci sono modifiche non salvate. Chiudere senza salvare?')) return;
      }
      this.drawerAperto = false;
      this._modificato  = false;
    },

    // ── File ──────────────────────────────────────────────────────────────────

    async onFileSelezionato(event) {
      const file = event.target.files?.[0];
      if (!file) return;
      this.formFilename = file.name;
      this.formFileSize = file.size;
      this.formBase64   = await _leggiFileArchivio(file);
      this._modificato  = true;
      event.target.value = '';
    },

    rimuoviFile() {
      this.formFilename = null;
      this.formBase64   = null;
      this.formFileSize = null;
      this._modificato  = true;
    },

    // ── Salva ─────────────────────────────────────────────────────────────────

    async salvaDoc() {
      if (!this.archivio) return;
      if (this.formTag === 'altro' && !(this.formTagPersonalizzato ?? '').trim()) {
        NOTIFICHE.attenzione('Archivio', 'Specifica il tipo per il tag "Altro".');
        document.getElementById('arch-tag-personalizzato')?.focus();
        return;
      }
      this.salvando = true;
      try {
        if (this.formNuovo) {
          this.archivio.documenti.push({
            id:                UTILS.uuid(),
            tag:               this.formTag,
            tag_personalizzato: this.formTag === 'altro'
              ? (this.formTagPersonalizzato ?? '').trim() : null,
            descrizione: this.formDescrizione.trim() || null,
            data:        this.formData || null,
            filename:    this.formFilename ?? null,
            base64:      this.formBase64 ?? null,
            testo_ai:    this.formTestoAi.trim() || null,
            creato_il:   new Date().toISOString(),
          });
        } else {
          const idx     = this.archivio.documenti.findIndex(d => d.id === this.formId && !d._cestino);
          const vecchio = idx >= 0 ? this.archivio.documenti[idx] : null;
          if (vecchio) {
            this.archivio.documenti[idx] = {
              ...vecchio, _cestino: true, _eliminato_il: new Date().toISOString(),
            };
          }
          this.archivio.documenti.push({
            id:                this.formId,
            tag:               this.formTag,
            tag_personalizzato: this.formTag === 'altro'
              ? (this.formTagPersonalizzato ?? '').trim() : null,
            descrizione:    this.formDescrizione.trim() || null,
            data:           this.formData || null,
            filename:       this.formFilename ?? null,
            base64:         this.formBase64 ?? null,
            testo_ai:       this.formTestoAi.trim() || null,
            creato_il:      vecchio?.creato_il ?? new Date().toISOString(),
            _aggiornato_il: new Date().toISOString(),
          });
        }
        this.archivio.cantiere_id = this._cantiereId;
        await ARCHIVIO_DOCS_SERVICE.scriviArchivio(this.archivio);
        this.archivio = { ...this.archivio };
        NOTIFICHE.successo(this.formNuovo ? 'Documento aggiunto' : 'Documento aggiornato');
        this.chiudiDrawer(true);
      } catch (err) {
        ERRORI.gestisciErrore('archivio-documenti/salva', err);
      } finally {
        this.salvando = false;
      }
    },

    // ── Cestina ───────────────────────────────────────────────────────────────

    async cestinaDoc(doc) {
      if (!confirm('Spostare nel cestino questo documento?')) return;
      try {
        const idx = this.archivio.documenti.findIndex(d => d.id === doc.id && !d._cestino);
        if (idx < 0) return;
        this.archivio.documenti[idx] = {
          ...this.archivio.documenti[idx],
          _cestino: true, _eliminato_il: new Date().toISOString(),
        };
        this.archivio.cantiere_id = this._cantiereId;
        await ARCHIVIO_DOCS_SERVICE.scriviArchivio(this.archivio);
        this.archivio = { ...this.archivio };
        NOTIFICHE.info('Documento spostato nel cestino');
      } catch (err) {
        ERRORI.gestisciErrore('archivio-documenti/cestina', err);
      }
    },

    // ── Helper UI ─────────────────────────────────────────────────────────────

    tagEtichetta(tag, tagPersonalizzato) {
      if (tag === 'altro') return tagPersonalizzato || 'Altro';
      return TAG_ARCHIVIO.find(t => t.valore === tag)?.etichetta ?? tag;
    },

    _tagArchivio()      { return TAG_ARCHIVIO; },
    _formataBytes(bytes){ return _formataBytesArchivio(bytes); },
  };
}

// ── Template HTML ─────────────────────────────────────────────────────────────

const _TEMPLATE_ARCHIVIO = `
<div x-data="ArchivioDocumenti()" x-init="init()" class="max-w-4xl">

  <!-- === HEADER === -->
  <div class="flex items-center justify-between mb-4">
    <div>
      <h1 class="text-xl font-semibold text-slate-800">🗂 Archivio Documenti</h1>
      <p class="text-xs text-slate-400 mt-0.5">Raccoglitore di documenti generici di cantiere — autorizzazioni, permessi, corrispondenza e altro</p>
    </div>
    <button @click="apriNuovoDoc()"
            x-show="$store.cantiere.id"
            class="bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium
                   px-4 py-2 rounded-lg transition-colors
                   focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2">
      + Aggiungi documento
    </button>
  </div>

  <!-- Nessun cantiere -->
  <div x-show="!$store.cantiere.id" class="placeholder-modulo">
    <div class="text-3xl" aria-hidden="true">🗂</div>
    <p class="text-slate-500">Seleziona un cantiere per accedere all'archivio documenti.</p>
  </div>

  <div x-show="$store.cantiere.id">

    <!-- Caricamento -->
    <div x-show="caricamento" class="flex items-center gap-3 py-10 text-slate-400 text-sm">
      <div class="w-5 h-5 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"
           role="status" aria-label="Caricamento"></div>
      Caricamento archivio…
    </div>

    <!-- Errore -->
    <div x-show="!caricamento && erroreCaricamento" role="alert"
         class="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700 mb-4">
      <strong>Errore di lettura:</strong> <span x-text="erroreCaricamento"></span>
    </div>

    <div x-show="!caricamento && !erroreCaricamento">

      <!-- Barra filtri -->
      <div class="flex flex-wrap gap-3 mb-4">
        <input type="search" x-model="cercaTesto"
               placeholder="Cerca in descrizione o nome file…"
               class="flex-1 min-w-48 border border-slate-300 rounded-md px-3 py-2 text-sm
                      focus:outline-none focus:ring-2 focus:ring-blue-500">
        <select x-model="filtroTag"
                class="border border-slate-300 rounded-md px-3 py-2 text-sm
                       focus:outline-none focus:ring-2 focus:ring-blue-500">
          <option value="">Tutti i tipi</option>
          <template x-for="t in _tagArchivio()" :key="t.valore">
            <option :value="t.valore" x-text="t.etichetta"></option>
          </template>
        </select>
        <button x-show="filtroTag || cercaTesto"
                @click="filtroTag = ''; cercaTesto = ''"
                class="text-xs text-slate-400 hover:text-slate-600 px-2 py-1 rounded
                       focus:outline-none focus:ring-1 focus:ring-slate-400">
          × Azzera filtri
        </button>
      </div>

      <!-- Contatore -->
      <p x-show="documentiFiltrati.length > 0"
         class="text-xs text-slate-400 mb-3"
         x-text="documentiFiltrati.length + (documentiFiltrati.length === 1 ? ' documento' : ' documenti')"></p>

      <!-- Lista vuota -->
      <div x-show="documentiFiltrati.length === 0" class="py-12 text-center text-slate-400">
        <div class="text-3xl mb-2" aria-hidden="true">🗂</div>
        <p class="text-sm"
           x-text="(cercaTesto || filtroTag) ? 'Nessun documento corrisponde ai filtri.' : 'Nessun documento in archivio.'"></p>
        <p x-show="!cercaTesto && !filtroTag" class="text-xs mt-1">
          Clicca "+ Aggiungi documento" per archiviare autorizzazioni, permessi, corrispondenza e altri documenti di cantiere.
        </p>
      </div>

      <!-- Lista documenti -->
      <div x-show="documentiFiltrati.length > 0"
           role="list" aria-label="Documenti in archivio" class="space-y-2">
        <template x-for="doc in documentiFiltrati" :key="doc.id">
          <article role="listitem"
                   class="border border-slate-200 bg-white rounded-xl px-4 py-3
                          hover:border-slate-300 transition-all">

            <!-- Riga 1: tag + data + badge AI -->
            <div class="flex items-center gap-2 mb-1.5 flex-wrap">
              <span class="text-xs bg-slate-100 text-slate-700 px-2 py-0.5 rounded-full font-medium flex-shrink-0"
                    x-text="tagEtichetta(doc.tag, doc.tag_personalizzato)"></span>
              <span x-show="doc.data" class="text-xs text-slate-400 flex-shrink-0"
                    x-text="UTILS.formatData(doc.data + 'T12:00:00Z')"></span>
              <span x-show="doc.testo_ai"
                    title="Testo per analisi AI presente"
                    class="text-xs bg-violet-100 text-violet-700 px-2 py-0.5 rounded-full flex-shrink-0">
                🤖 testo AI ✓
              </span>
            </div>

            <!-- Riga 2: descrizione -->
            <p x-show="doc.descrizione"
               class="text-sm text-slate-700 leading-snug mb-1.5 line-clamp-2"
               x-text="doc.descrizione"></p>

            <!-- Riga 3: file + azioni -->
            <div class="flex items-center gap-2 flex-wrap pt-0.5">

              <button x-show="doc.base64" type="button"
                      @click="ALLEGATI.apriAllegato(doc.base64, doc.filename)"
                      class="text-xs text-blue-600 hover:text-blue-800 flex items-center gap-1
                             focus:outline-none focus:ring-1 focus:ring-blue-400 rounded"
                      :title="'Apri: ' + doc.filename">
                📎 <span class="truncate max-w-[12rem]" x-text="doc.filename"></span>
              </button>
              <span x-show="!doc.base64 && doc.filename"
                    class="text-xs text-slate-400 flex items-center gap-1">
                📎 <span class="truncate max-w-[12rem]" x-text="doc.filename"></span>
              </span>

              <div class="ml-auto flex items-center gap-2 flex-shrink-0">
                <button x-show="doc.base64" type="button"
                        @click="ALLEGATI.scaricaAllegato(doc.base64, doc.filename)"
                        class="text-xs text-slate-400 hover:text-blue-600 p-1.5 rounded-lg
                               hover:bg-slate-50 transition-colors
                               focus:outline-none focus:ring-2 focus:ring-slate-400"
                        title="Scarica file">⬇</button>
                <button type="button" @click="apriModificaDoc(doc)"
                        class="text-xs text-slate-600 hover:text-slate-900 px-3 py-1
                               border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors
                               focus:outline-none focus:ring-2 focus:ring-slate-400"
                        :aria-label="'Modifica: ' + tagEtichetta(doc.tag, doc.tag_personalizzato)">
                  ✏ Modifica
                </button>
                <button type="button" @click="cestinaDoc(doc)"
                        class="text-xs text-red-400 hover:text-red-700 p-1.5 rounded-lg
                               hover:bg-red-50 transition-colors
                               focus:outline-none focus:ring-2 focus:ring-red-400"
                        :aria-label="'Cestina: ' + tagEtichetta(doc.tag, doc.tag_personalizzato)"
                        title="Sposta nel cestino">🗑</button>
              </div>

            </div>

          </article>
        </template>
      </div>

    </div><!-- /!caricamento && !erroreCaricamento -->
  </div><!-- /$store.cantiere.id -->


  <!-- ═══════════════════════════════════════════════════════════
       DRAWER: Aggiungi / Modifica documento
       ═══════════════════════════════════════════════════════════ -->
  <div x-show="drawerAperto" x-cloak
       class="drawer-backdrop" @click.self="chiudiDrawer(false)" aria-hidden="true"></div>

  <div x-show="drawerAperto" x-cloak
       @input="_modificato = true"
       @keydown.escape.window="chiudiDrawer(false)"
       class="drawer" role="dialog" aria-modal="true"
       :aria-label="formNuovo ? 'Aggiungi documento' : 'Modifica documento'">

    <div class="drawer-header flex items-center justify-between px-5 py-4 border-b border-slate-200 bg-white">
      <h2 class="text-base font-semibold text-slate-800"
          x-text="formNuovo ? 'Aggiungi documento' : 'Modifica documento'"></h2>
      <button @click="chiudiDrawer(false)" aria-label="Chiudi"
              class="p-1.5 rounded hover:bg-slate-100 text-slate-500 text-lg
                     focus:outline-none focus:ring-2 focus:ring-slate-400">✕</button>
    </div>

    <div class="drawer-body px-5 py-4 space-y-5">

      <!-- Tipo documento (tag) -->
      <div>
        <label for="arch-tag" class="block text-xs font-medium text-slate-700 mb-1">
          Tipo documento <span class="text-red-500">*</span>
        </label>
        <select id="arch-tag" x-model="formTag"
                class="w-full border border-slate-300 rounded-md px-3 py-2 text-sm
                       focus:outline-none focus:ring-2 focus:ring-blue-500">
          <template x-for="t in _tagArchivio()" :key="t.valore">
            <option :value="t.valore" x-text="t.etichetta"></option>
          </template>
        </select>
      </div>

      <!-- Tag personalizzato (solo se "altro") -->
      <div x-show="tagLibero">
        <label for="arch-tag-personalizzato"
               class="block text-xs font-medium text-slate-700 mb-1">
          Specifica il tipo <span class="text-red-500">*</span>
        </label>
        <input id="arch-tag-personalizzato" type="text"
               x-model="formTagPersonalizzato"
               placeholder="Es. Relazione geologica, Perizia tecnica…"
               class="w-full border border-slate-300 rounded-md px-3 py-2 text-sm
                      focus:outline-none focus:ring-2 focus:ring-blue-500">
      </div>

      <!-- Descrizione -->
      <div>
        <label for="arch-descrizione" class="block text-xs font-medium text-slate-700 mb-1">
          Descrizione <span class="text-slate-400 font-normal">(opzionale)</span>
        </label>
        <textarea id="arch-descrizione" rows="3"
                  x-model="formDescrizione"
                  placeholder="Descrivi brevemente il contenuto: questo testo comparirà nella lista e potrà essere letto dall'assistente AI in futuro."
                  class="w-full border border-slate-300 rounded-md px-3 py-2 text-sm resize-none
                         focus:outline-none focus:ring-2 focus:ring-blue-500
                         placeholder:text-slate-400 placeholder:text-xs"></textarea>
      </div>

      <!-- Data documento -->
      <div>
        <label for="arch-data" class="block text-xs font-medium text-slate-700 mb-1">
          Data del documento <span class="text-slate-400 font-normal">(opzionale)</span>
        </label>
        <input id="arch-data" type="date" x-model="formData"
               class="border border-slate-300 rounded-md px-3 py-2 text-sm
                      focus:outline-none focus:ring-2 focus:ring-blue-500">
      </div>

      <!-- File documento -->
      <div>
        <p class="text-xs font-medium text-slate-700 mb-1">
          File <span class="text-slate-400 font-normal">(PDF, PNG, JPG — opzionale)</span>
        </p>

        <div x-show="formFilename"
             class="flex items-center gap-2 mb-2 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">
          <button x-show="formBase64" type="button"
                  @click="ALLEGATI.apriAllegato(formBase64, formFilename)"
                  class="text-xs text-blue-600 hover:text-blue-800 flex-1 text-left truncate
                         focus:outline-none focus:ring-1 focus:ring-blue-400 rounded"
                  :title="formFilename" x-text="'📎 ' + formFilename"></button>
          <span x-show="!formBase64" class="text-xs text-slate-400 flex-1 truncate"
                x-text="'📎 ' + formFilename"></span>
          <button type="button" @click="rimuoviFile()"
                  class="text-xs text-red-400 hover:text-red-700 flex-shrink-0 px-1.5 py-0.5 rounded
                         hover:bg-red-50 transition-colors focus:outline-none focus:ring-1 focus:ring-red-400">
            × rimuovi
          </button>
        </div>

        <div x-show="avvisoFileGrande" role="status"
             class="mb-2 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2
                    text-xs text-amber-700 flex items-start gap-1.5">
          <span aria-hidden="true">⚠</span>
          <span>File grande (<strong x-text="_formataBytes(formFileSize)"></strong>):
            assicurati che OneDrive sia sincronizzato prima di salvare.</span>
        </div>

        <label class="flex items-center gap-2 cursor-pointer text-xs text-blue-600 hover:text-blue-800
                      border border-dashed border-slate-300 rounded-lg px-3 py-2.5
                      hover:bg-blue-50/40 transition-colors focus-within:ring-2 focus-within:ring-blue-500">
          <input type="file" accept=".pdf,.png,.jpg,.jpeg" class="sr-only"
                 @change="onFileSelezionato($event)">
          <span x-text="formFilename ? '🔄 Sostituisci file…' : '📂 Scegli file…'"></span>
          <span x-show="formFileSize !== null" class="ml-auto text-slate-400"
                x-text="_formataBytes(formFileSize)"></span>
        </label>
      </div>

      <!-- Testo per AI -->
      <div>
        <label for="arch-testo-ai" class="block text-xs font-medium text-slate-700 mb-1">
          Testo per l'analisi AI
          <span class="text-slate-400 font-normal">(facoltativo)</span>
        </label>
        <textarea id="arch-testo-ai" rows="4" x-model="formTestoAi"
                  placeholder="Facoltativo: incolla qui il testo del documento per l'analisi AI futura."
                  class="w-full border border-slate-300 rounded-md px-3 py-2 text-sm resize-y
                         focus:outline-none focus:ring-2 focus:ring-blue-500
                         placeholder:text-slate-400 placeholder:text-xs"></textarea>
        <p class="text-xs text-slate-400 mt-1">
          Il contenuto sarà disponibile all'assistente AI (M26). Non compare nella lista.
        </p>
      </div>

    </div><!-- /drawer-body -->

    <div class="drawer-footer px-5 py-4 border-t border-slate-200 bg-white flex items-center justify-end gap-3">
      <button @click="chiudiDrawer(false)" :disabled="salvando"
              class="text-sm text-slate-600 hover:text-slate-800 px-4 py-2
                     border border-slate-300 rounded-lg hover:bg-slate-50 disabled:opacity-50
                     transition-colors focus:outline-none focus:ring-2 focus:ring-slate-400">
        Annulla
      </button>
      <button @click="salvaDoc()" :disabled="salvando"
              class="text-sm bg-blue-600 hover:bg-blue-700 text-white font-medium px-5 py-2
                     rounded-lg disabled:opacity-50 transition-colors
                     focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2">
        <span x-show="!salvando" x-text="formNuovo ? 'Aggiungi' : 'Aggiorna'"></span>
        <span x-show="salvando">⏳ Salvataggio…</span>
      </button>
    </div>

  </div><!-- /drawer -->

</div><!-- /ArchivioDocumenti -->
`;

// ── Registrazione nel registry moduli ─────────────────────────────────────────

window.MODULI_REGISTRATI['archivio-documenti'] = {
  monta(contenitore) { contenitore.innerHTML = _TEMPLATE_ARCHIVIO; },
};
