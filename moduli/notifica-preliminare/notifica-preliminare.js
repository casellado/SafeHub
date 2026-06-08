/**
 * notifica-preliminare.js — Raccolta documentale: Notifica Preliminare (art.99 D.Lgs.81/08).
 *
 * Il CSE custodisce la copia della notifica redatta/inviata dal committente o RL
 * ad ASL e DPL. NON genera, NON invia: solo archiviazione per esibizione in ispezione.
 *
 * Storage: 10_Notifica-Preliminare/notifica_preliminare.json (file unico per cantiere).
 * Schema:  { originale: {...}|null, aggiornamenti: [...] }
 *
 * Pattern: clone di archivio-documenti.js adattato a originale+aggiornamenti.
 * NIENTE Alpine.initTree.
 */

'use strict';

const _SOGLIA_FILE_NOTIFICA = 10 * 1024 * 1024; // 10 MB

// ── Helper file ───────────────────────────────────────────────────────────────

const _leggiFileNotifica = (file) =>
  new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload  = (e) => resolve(e.target.result);
    r.onerror = ()  => reject(new Error('Lettura file non riuscita'));
    r.readAsDataURL(file);
  });

function _formataBytesNotifica(bytes) {
  if (bytes >= 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  return Math.round(bytes / 1024) + ' KB';
}

// ── Service ───────────────────────────────────────────────────────────────────

const NOTIFICA_SERVICE = (() => {

  const NOME_FILE = 'notifica_preliminare.json';

  const _getDir = async (cantiereId, crea = false) => {
    const root = FILESYSTEM.getHandleAttivo();
    if (!root) throw new Error('Filesystem non agganciato.');
    const dirCantiere = await root.getDirectoryHandle(cantiereId);
    return FILESYSTEM.navigaPercorso(dirCantiere, ['10_Notifica-Preliminare'], crea);
  };

  /**
   * Legge notifica_preliminare.json.
   * Se cartella o file non esistono restituisce lo schema vuoto (la cartella
   * viene creata al volo al primo salvataggio con crea=true).
   */
  const leggi = async (cantiereId) => {
    try {
      const dir = await _getDir(cantiereId);
      return await FILESYSTEM.leggiJson(dir, NOME_FILE);
    } catch (e) {
      if (e.name === 'NotFoundError') {
        return {
          tipo_file:     'notifica_preliminare',
          cantiere_id:   cantiereId,
          aggiornato_il: new Date().toISOString(),
          originale:     null,
          aggiornamenti: [],
        };
      }
      throw e;
    }
  };

  const scrivi = async (notifica) => {
    notifica.aggiornato_il = new Date().toISOString();
    const dir = await _getDir(notifica.cantiere_id, true);
    await FILESYSTEM.scriviJson(dir, NOME_FILE, notifica);
    return notifica;
  };

  return { leggi, scrivi };

})();

// ── Componente Alpine ─────────────────────────────────────────────────────────

function NotificaPreliminare() {
  return {

    // ── Stato ────────────────────────────────────────────────────────────────
    _cantiereId:       null,
    notifica:          null,
    caricamento:       false,
    erroreCaricamento: null,

    // Drawer
    drawerAperto: false,
    formTipo:     'originale',   // 'originale' | 'aggiornamento'
    formNuovo:    true,
    formId:       null,
    formData:          '',
    formProtocollo:    '',
    formOggetto:       '',
    formMittente:      'committente',
    formMotivo:        '',    // solo per aggiornamenti
    formFilename:      null,
    formBase64:        null,
    formFileSize:      null,
    formTestoAi:       '',
    formNote:          '',
    salvando:          false,
    _modificato:       false,

    // ── Computed ──────────────────────────────────────────────────────────────

    get aggiornamentiFiltrati() {
      return (this.notifica?.aggiornamenti ?? [])
        .filter(a => !a._cestino)
        .sort((a, b) => (b.data ?? b.creato_il ?? '').localeCompare(a.data ?? a.creato_il ?? ''));
    },

    get nAggiornamenti() { return this.aggiornamentiFiltrati.length; },

    get avvisoFileGrande() {
      return this.formFileSize !== null && this.formFileSize > _SOGLIA_FILE_NOTIFICA;
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
      this._cantiereId       = id;
      this.notifica          = null;
      this.erroreCaricamento = null;
      if (this.drawerAperto) this.chiudiDrawer(true);
      this._carica();
    },

    async _carica() {
      const cantId = this._cantiereId;
      this.caricamento       = true;
      this.erroreCaricamento = null;
      this.notifica          = null;
      if (!cantId) { this.caricamento = false; return; }
      try {
        this.notifica = await NOTIFICA_SERVICE.leggi(cantId);
      } catch (err) {
        ERRORI.gestisciErrore('notifica-preliminare/carica', err);
        this.erroreCaricamento = err.message ?? 'Errore di lettura.';
      } finally {
        this.caricamento = false;
      }
    },

    // ── Drawer — apertura ─────────────────────────────────────────────────────

    apriRegistraOriginale() {
      this.formTipo       = 'originale';
      this.formNuovo      = true;
      this.formId         = null;
      this._resetForm();
      this.drawerAperto   = true;
      this.$nextTick(() => document.getElementById('np-data')?.focus());
    },

    apriModificaOriginale() {
      const o = this.notifica.originale;
      this.formTipo       = 'originale';
      this.formNuovo      = false;
      this.formId         = o.id;
      this.formData       = o.data        ?? '';
      this.formProtocollo = o.protocollo  ?? '';
      this.formOggetto    = o.oggetto     ?? '';
      this.formMittente   = o.mittente    ?? 'committente';
      this.formMotivo     = '';
      this.formFilename   = o.filename    ?? null;
      this.formBase64     = o.base64      ?? null;
      this.formFileSize   = null;
      this.formTestoAi    = o.testo_ai    ?? '';
      this.formNote       = o.note        ?? '';
      this._modificato    = false;
      this.drawerAperto   = true;
    },

    apriNuovoAggiornamento() {
      this.formTipo     = 'aggiornamento';
      this.formNuovo    = true;
      this.formId       = null;
      this._resetForm();
      this.drawerAperto = true;
      this.$nextTick(() => document.getElementById('np-motivo')?.focus());
    },

    apriModificaAggiornamento(agg) {
      this.formTipo       = 'aggiornamento';
      this.formNuovo      = false;
      this.formId         = agg.id;
      this.formData       = agg.data       ?? '';
      this.formProtocollo = agg.protocollo ?? '';
      this.formOggetto    = agg.oggetto    ?? '';
      this.formMittente   = agg.mittente   ?? 'committente';
      this.formMotivo     = agg.motivo     ?? '';
      this.formFilename   = agg.filename   ?? null;
      this.formBase64     = agg.base64     ?? null;
      this.formFileSize   = null;
      this.formTestoAi    = agg.testo_ai   ?? '';
      this.formNote       = agg.note       ?? '';
      this._modificato    = false;
      this.drawerAperto   = true;
    },

    _resetForm() {
      this.formData       = '';
      this.formProtocollo = '';
      this.formOggetto    = '';
      this.formMittente   = 'committente';
      this.formMotivo     = '';
      this.formFilename   = null;
      this.formBase64     = null;
      this.formFileSize   = null;
      this.formTestoAi    = '';
      this.formNote       = '';
      this._modificato    = false;
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
      this.formBase64   = await _leggiFileNotifica(file);
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

    async salva() {
      if (!this.notifica) return;
      this.salvando = true;
      try {
        const ora = new Date().toISOString();
        const campo = {
          id:         this.formNuovo ? UTILS.uuid() : this.formId,
          data:       this.formData              || null,
          protocollo: this.formProtocollo.trim() || null,
          oggetto:    this.formOggetto.trim()    || null,
          mittente:   this.formMittente.trim()   || null,
          filename:   this.formFilename          ?? null,
          base64:     this.formBase64            ?? null,
          testo_ai:   this.formTestoAi.trim()    || null,
          note:       this.formNote.trim()       || null,
          creato_il:  ora,
        };

        if (this.formTipo === 'originale') {
          // Originale è unico: sostituisce sempre in-place
          if (!this.formNuovo) campo.creato_il = this.notifica.originale?.creato_il ?? ora;
          this.notifica.originale = campo;

        } else {
          // Aggiornamento: aggiungi il campo motivo
          campo.motivo = this.formMotivo.trim() || null;
          if (this.formNuovo) {
            this.notifica.aggiornamenti.push(campo);
          } else {
            // Modifica: sostituisce la voce esistente preservando creato_il
            const idx = this.notifica.aggiornamenti.findIndex(a => a.id === this.formId && !a._cestino);
            if (idx >= 0) {
              campo.creato_il      = this.notifica.aggiornamenti[idx].creato_il;
              campo._aggiornato_il = ora;
              this.notifica.aggiornamenti[idx] = campo;
            }
          }
        }

        this.notifica.cantiere_id = this._cantiereId;
        await NOTIFICA_SERVICE.scrivi(this.notifica);
        // Forza reattività Alpine su oggetti annidati
        this.notifica = { ...this.notifica, aggiornamenti: [...this.notifica.aggiornamenti] };

        NOTIFICHE.successo(
          this.formTipo === 'originale'
            ? (this.formNuovo ? 'Notifica originale registrata' : 'Notifica originale aggiornata')
            : (this.formNuovo ? 'Aggiornamento aggiunto'        : 'Aggiornamento modificato')
        );
        this.chiudiDrawer(true);
      } catch (err) {
        ERRORI.gestisciErrore('notifica-preliminare/salva', err);
      } finally {
        this.salvando = false;
      }
    },

    // ── Rimuovi originale (torna a null) ──────────────────────────────────────

    async rimuoviOriginale() {
      if (!confirm('Rimuovere la notifica originale?\nIl file PDF non viene cancellato dal disco; solo la registrazione verrà eliminata.')) return;
      try {
        this.notifica.originale   = null;
        this.notifica.cantiere_id = this._cantiereId;
        await NOTIFICA_SERVICE.scrivi(this.notifica);
        this.notifica = { ...this.notifica };
        NOTIFICHE.info('Notifica originale rimossa');
      } catch (err) {
        ERRORI.gestisciErrore('notifica-preliminare/rimuovi-originale', err);
      }
    },

    // ── Soft-delete aggiornamenti ─────────────────────────────────────────────

    async cestinaAggiornamento(agg) {
      if (!confirm('Spostare nel cestino questo aggiornamento?')) return;
      try {
        const idx = this.notifica.aggiornamenti.findIndex(a => a.id === agg.id);
        if (idx < 0) return;
        this.notifica.aggiornamenti[idx] = {
          ...this.notifica.aggiornamenti[idx],
          _cestino: true, _eliminato_il: new Date().toISOString(),
        };
        this.notifica.cantiere_id = this._cantiereId;
        await NOTIFICA_SERVICE.scrivi(this.notifica);
        this.notifica = { ...this.notifica, aggiornamenti: [...this.notifica.aggiornamenti] };
        NOTIFICHE.info('Aggiornamento spostato nel cestino');
      } catch (err) {
        ERRORI.gestisciErrore('notifica-preliminare/cestina', err);
      }
    },

    async ripristinaAggiornamento(agg) {
      try {
        const idx = this.notifica.aggiornamenti.findIndex(a => a.id === agg.id);
        if (idx < 0) return;
        const { _cestino, _eliminato_il, ...resto } = this.notifica.aggiornamenti[idx];
        this.notifica.aggiornamenti[idx] = resto;
        this.notifica.cantiere_id = this._cantiereId;
        await NOTIFICA_SERVICE.scrivi(this.notifica);
        this.notifica = { ...this.notifica, aggiornamenti: [...this.notifica.aggiornamenti] };
        NOTIFICHE.successo('Aggiornamento ripristinato');
      } catch (err) {
        ERRORI.gestisciErrore('notifica-preliminare/ripristina', err);
      }
    },

    async eliminaDefinitivaAggiornamento(agg) {
      if (!confirm('Eliminare definitivamente questo aggiornamento?\nL\'operazione non è reversibile.')) return;
      try {
        this.notifica.aggiornamenti = this.notifica.aggiornamenti.filter(a => a.id !== agg.id);
        this.notifica.cantiere_id   = this._cantiereId;
        await NOTIFICA_SERVICE.scrivi(this.notifica);
        this.notifica = { ...this.notifica, aggiornamenti: [...this.notifica.aggiornamenti] };
        NOTIFICHE.successo('Aggiornamento eliminato definitivamente');
      } catch (err) {
        ERRORI.gestisciErrore('notifica-preliminare/elimina', err);
      }
    },

    // ── Helper UI ─────────────────────────────────────────────────────────────

    _formataBytes(bytes) { return _formataBytesNotifica(bytes); },

    formatDataDoc(iso) {
      if (!iso) return '';
      // YYYY-MM-DD → aggiunge ora fissa per evitare shift di fuso orario
      const s = iso.length === 10 ? iso + 'T12:00:00Z' : iso;
      return UTILS.formatData(s);
    },
  };
}

// ── Template HTML ─────────────────────────────────────────────────────────────

const _TEMPLATE_NOTIFICA = `
<div x-data="NotificaPreliminare()" x-init="init()" class="max-w-4xl">

  <!-- === HEADER === -->
  <div class="flex items-start justify-between mb-4 gap-4 flex-wrap">
    <div>
      <h1 class="text-xl font-semibold text-slate-800">📬 Notifica Preliminare</h1>
      <p class="text-xs text-slate-400 mt-0.5">
        Art. 99 D.Lgs. 81/2008 — redatta e inviata dal committente o RL · il CSE custodisce copia per le ispezioni
      </p>
    </div>
  </div>

  <!-- Nessun cantiere -->
  <div x-show="!$store.cantiere.id" class="placeholder-modulo">
    <div class="text-3xl" aria-hidden="true">📬</div>
    <p class="text-slate-500">Seleziona un cantiere per accedere alla notifica preliminare.</p>
  </div>

  <div x-show="$store.cantiere.id">

    <!-- Caricamento -->
    <div x-show="caricamento" class="flex items-center gap-3 py-10 text-slate-400 text-sm">
      <div class="w-5 h-5 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"
           role="status" aria-label="Caricamento"></div>
      Caricamento notifica…
    </div>

    <!-- Errore -->
    <div x-show="!caricamento && erroreCaricamento" role="alert"
         class="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700 mb-4">
      <strong>Errore di lettura:</strong> <span x-text="erroreCaricamento"></span>
    </div>

    <div x-show="!caricamento && !erroreCaricamento">

      <!-- ═══════════════════════════════════════════════════════
           BLOCCO ORIGINALE
           ═══════════════════════════════════════════════════════ -->
      <section aria-label="Notifica originale" class="mb-6">
        <h2 class="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">
          Notifica originale
        </h2>

        <!-- Stato: non ancora registrata -->
        <div x-show="!notifica?.originale"
             class="border-2 border-dashed border-slate-200 rounded-2xl p-8 text-center">
          <div class="text-3xl mb-3" aria-hidden="true">📬</div>
          <p class="font-medium text-slate-600 mb-1">Notifica originale non ancora registrata</p>
          <p class="text-xs text-slate-400 mb-5">
            La notifica è redatta e inviata dal committente o dal RL ad ASL e DPL.<br>
            Archivia qui la copia per esibizione in caso di ispezione.
          </p>
          <button @click="apriRegistraOriginale()"
                  class="bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium
                         px-5 py-2.5 rounded-lg transition-colors
                         focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2">
            + Registra notifica originale
          </button>
        </div>

        <!-- Stato: originale presente -->
        <div x-show="notifica?.originale"
             class="border border-blue-200 bg-blue-50 rounded-2xl px-5 py-4">

          <!-- Riga meta + azioni -->
          <div class="flex items-start justify-between gap-4 mb-3">
            <div class="space-y-1 min-w-0">
              <div class="flex items-center gap-2 flex-wrap">
                <span class="text-xs bg-blue-200 text-blue-800 font-semibold px-2 py-0.5 rounded-full flex-shrink-0">
                  Originale
                </span>
                <span x-show="notifica?.originale?.data"
                      class="text-sm font-medium text-slate-700"
                      x-text="formatDataDoc(notifica?.originale?.data)"></span>
                <span x-show="notifica?.originale?.protocollo"
                      class="text-xs text-slate-500 font-mono"
                      x-text="'Prot. ' + notifica?.originale?.protocollo"></span>
                <span x-show="notifica?.originale?.testo_ai"
                      title="Testo per analisi AI presente"
                      class="text-xs bg-violet-100 text-violet-700 px-2 py-0.5 rounded-full flex-shrink-0">
                  🤖 testo AI ✓
                </span>
              </div>
              <p x-show="notifica?.originale?.mittente"
                 class="text-xs text-slate-400"
                 x-text="'Inviata da: ' + notifica?.originale?.mittente"></p>
              <p x-show="notifica?.originale?.oggetto"
                 class="text-sm text-slate-600"
                 x-text="notifica?.originale?.oggetto"></p>
              <p x-show="notifica?.originale?.note"
                 class="text-xs text-slate-400 italic"
                 x-text="notifica?.originale?.note"></p>
            </div>
            <div class="flex gap-2 flex-shrink-0">
              <button @click="apriModificaOriginale()"
                      class="text-xs text-slate-600 hover:text-slate-900 px-3 py-1.5
                             border border-slate-300 rounded-lg bg-white hover:bg-slate-50 transition-colors
                             focus:outline-none focus:ring-2 focus:ring-slate-400">
                ✏ Modifica
              </button>
              <button @click="rimuoviOriginale()"
                      class="text-xs text-red-400 hover:text-red-700 p-1.5 rounded-lg
                             hover:bg-red-50 transition-colors
                             focus:outline-none focus:ring-2 focus:ring-red-400"
                      title="Rimuovi notifica originale">
                🗑
              </button>
            </div>
          </div>

          <!-- File PDF -->
          <div class="flex items-center gap-3 border-t border-blue-200 pt-3 flex-wrap">
            <button x-show="notifica?.originale?.base64" type="button"
                    @click="ALLEGATI.apriAllegato(notifica.originale.base64, notifica.originale.filename)"
                    class="text-xs text-blue-700 hover:text-blue-900 flex items-center gap-1.5
                           focus:outline-none focus:ring-1 focus:ring-blue-400 rounded"
                    :title="'Apri: ' + notifica?.originale?.filename">
              📎 <span class="truncate max-w-xs" x-text="notifica?.originale?.filename"></span>
            </button>
            <span x-show="!notifica?.originale?.base64 && notifica?.originale?.filename"
                  class="text-xs text-slate-400 flex items-center gap-1.5">
              📎 <span x-text="notifica?.originale?.filename"></span>
            </span>
            <span x-show="!notifica?.originale?.filename"
                  class="text-xs text-slate-400 italic">Nessun PDF allegato</span>
            <button x-show="notifica?.originale?.base64" type="button"
                    @click="ALLEGATI.scaricaAllegato(notifica.originale.base64, notifica.originale.filename)"
                    class="ml-auto text-xs text-slate-400 hover:text-blue-600 p-1.5 rounded-lg
                           hover:bg-slate-100 transition-colors
                           focus:outline-none focus:ring-2 focus:ring-slate-400"
                    title="Scarica PDF">⬇</button>
          </div>

        </div>
      </section>

      <!-- ═══════════════════════════════════════════════════════
           SEZIONE AGGIORNAMENTI
           ═══════════════════════════════════════════════════════ -->
      <section aria-label="Aggiornamenti notifica">

        <div class="flex items-center justify-between mb-3">
          <h2 class="text-xs font-semibold text-slate-500 uppercase tracking-wide">
            Aggiornamenti (<span x-text="nAggiornamenti"></span>)
          </h2>
          <button @click="apriNuovoAggiornamento()"
                  class="text-xs font-medium text-blue-600 hover:text-blue-800 px-3 py-1.5
                         border border-blue-300 rounded-lg hover:bg-blue-50 transition-colors
                         focus:outline-none focus:ring-2 focus:ring-blue-500">
            + Aggiungi aggiornamento
          </button>
        </div>

        <!-- Lista vuota -->
        <div x-show="nAggiornamenti === 0 && (notifica?.aggiornamenti ?? []).filter(a => a._cestino).length === 0"
             class="py-8 text-center text-slate-400 border border-dashed border-slate-200 rounded-2xl">
          <p class="text-sm">Nessun aggiornamento registrato.</p>
          <p class="text-xs mt-1 text-slate-300">
            Ogni modifica rilevante al cantiere richiede un aggiornamento della notifica (art. 99 c.1).
          </p>
        </div>

        <!-- Lista aggiornamenti attivi -->
        <div role="list" aria-label="Aggiornamenti notifica" class="space-y-2">
          <template x-for="agg in aggiornamentiFiltrati" :key="agg.id">
            <article role="listitem"
                     class="border border-slate-200 bg-white rounded-xl px-4 py-3
                            hover:border-slate-300 transition-all">

              <!-- Riga 1: data + protocollo + mittente + badge AI -->
              <div class="flex items-center gap-2 mb-1.5 flex-wrap">
                <span x-show="agg.data"
                      class="text-sm font-medium text-slate-700"
                      x-text="formatDataDoc(agg.data)"></span>
                <span x-show="agg.protocollo"
                      class="text-xs text-slate-400 font-mono"
                      x-text="'Prot. ' + agg.protocollo"></span>
                <span x-show="agg.mittente"
                      class="text-xs text-slate-400"
                      x-text="agg.mittente"></span>
                <span x-show="agg.testo_ai"
                      title="Testo per analisi AI presente"
                      class="text-xs bg-violet-100 text-violet-700 px-2 py-0.5 rounded-full">
                  🤖 testo AI ✓
                </span>
              </div>

              <!-- Riga 2: motivo (campo distinto degli aggiornamenti) -->
              <p x-show="agg.motivo"
                 class="text-sm font-medium text-slate-800 leading-snug mb-1"
                 x-text="agg.motivo"></p>

              <!-- Riga 3: oggetto + note -->
              <p x-show="agg.oggetto" class="text-xs text-slate-500 mb-0.5" x-text="agg.oggetto"></p>
              <p x-show="agg.note"    class="text-xs text-slate-400 italic"  x-text="agg.note"></p>

              <!-- Riga 4: file + azioni -->
              <div class="flex items-center gap-2 flex-wrap pt-2 mt-1 border-t border-slate-100">
                <button x-show="agg.base64" type="button"
                        @click="ALLEGATI.apriAllegato(agg.base64, agg.filename)"
                        class="text-xs text-blue-600 hover:text-blue-800 flex items-center gap-1
                               focus:outline-none focus:ring-1 focus:ring-blue-400 rounded"
                        :title="'Apri: ' + agg.filename">
                  📎 <span class="truncate max-w-48" x-text="agg.filename"></span>
                </button>
                <span x-show="!agg.base64 && agg.filename"
                      class="text-xs text-slate-400 flex items-center gap-1">
                  📎 <span x-text="agg.filename"></span>
                </span>

                <div class="ml-auto flex items-center gap-2 flex-shrink-0">
                  <button x-show="agg.base64" type="button"
                          @click="ALLEGATI.scaricaAllegato(agg.base64, agg.filename)"
                          class="text-xs text-slate-400 hover:text-blue-600 p-1.5 rounded-lg
                                 hover:bg-slate-50 transition-colors
                                 focus:outline-none focus:ring-2 focus:ring-slate-400"
                          title="Scarica file">⬇</button>
                  <button type="button" @click="apriModificaAggiornamento(agg)"
                          class="text-xs text-slate-600 hover:text-slate-900 px-3 py-1
                                 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors
                                 focus:outline-none focus:ring-2 focus:ring-slate-400"
                          :aria-label="'Modifica aggiornamento del ' + formatDataDoc(agg.data)">
                    ✏ Modifica
                  </button>
                  <button type="button" @click="cestinaAggiornamento(agg)"
                          class="text-xs text-red-400 hover:text-red-700 p-1.5 rounded-lg
                                 hover:bg-red-50 transition-colors
                                 focus:outline-none focus:ring-2 focus:ring-red-400"
                          title="Sposta nel cestino">
                    🗑
                  </button>
                </div>
              </div>

            </article>
          </template>
        </div>

        <!-- Aggiornamenti nel cestino -->
        <template x-if="(notifica?.aggiornamenti ?? []).filter(a => a._cestino).length > 0">
          <details class="mt-4 border border-slate-200 rounded-xl overflow-hidden">
            <summary class="px-4 py-2.5 bg-slate-50 cursor-pointer text-xs text-slate-500
                            hover:bg-slate-100 list-none flex items-center gap-2">
              🗑 Nel cestino
              (<span x-text="(notifica?.aggiornamenti ?? []).filter(a => a._cestino).length"></span>)
              <span class="ml-auto text-slate-400">▾</span>
            </summary>
            <div class="p-3 space-y-2">
              <template x-for="agg in (notifica?.aggiornamenti ?? []).filter(a => a._cestino)" :key="agg.id + '_c'">
                <div class="flex items-center gap-3 text-xs text-slate-400 bg-slate-50 rounded-lg px-3 py-2">
                  <span class="flex-shrink-0" x-text="formatDataDoc(agg.data) || '—'"></span>
                  <span class="flex-1 truncate italic"
                        x-text="agg.motivo || agg.oggetto || '(senza descrizione)'"></span>
                  <button type="button" @click="ripristinaAggiornamento(agg)"
                          class="text-emerald-600 hover:text-emerald-800 font-medium
                                 px-2 py-0.5 rounded hover:bg-emerald-50
                                 focus:outline-none focus:ring-1 focus:ring-emerald-400">
                    Ripristina
                  </button>
                  <button type="button" @click="eliminaDefinitivaAggiornamento(agg)"
                          class="text-red-400 hover:text-red-700 px-2 py-0.5 rounded
                                 hover:bg-red-50 focus:outline-none focus:ring-1 focus:ring-red-400">
                    Elimina
                  </button>
                </div>
              </template>
            </div>
          </details>
        </template>

      </section>
    </div><!-- /!caricamento && !erroreCaricamento -->
  </div><!-- /$store.cantiere.id -->


  <!-- ═══════════════════════════════════════════════════════════
       DRAWER: Registra / Modifica — originale o aggiornamento
       ═══════════════════════════════════════════════════════════ -->
  <div x-show="drawerAperto" x-cloak
       class="drawer-backdrop" @click.self="chiudiDrawer(false)" aria-hidden="true"></div>

  <div x-show="drawerAperto" x-cloak
       @input="_modificato = true"
       @keydown.escape.window="chiudiDrawer(false)"
       class="drawer" role="dialog" aria-modal="true"
       :aria-label="formTipo === 'originale'
         ? (formNuovo ? 'Registra notifica originale' : 'Modifica notifica originale')
         : (formNuovo ? 'Aggiungi aggiornamento'       : 'Modifica aggiornamento')">

    <!-- Drawer header -->
    <div class="drawer-header flex items-center justify-between px-5 py-4
                border-b border-slate-200 bg-white">
      <h2 class="text-base font-semibold text-slate-800"
          x-text="formTipo === 'originale'
            ? (formNuovo ? 'Registra notifica originale' : 'Modifica notifica originale')
            : (formNuovo ? 'Aggiungi aggiornamento'       : 'Modifica aggiornamento')">
      </h2>
      <button @click="chiudiDrawer(false)" aria-label="Chiudi"
              class="p-1.5 rounded hover:bg-slate-100 text-slate-500 text-lg
                     focus:outline-none focus:ring-2 focus:ring-slate-400">✕</button>
    </div>

    <!-- Drawer body -->
    <div class="drawer-body px-5 py-4 space-y-5">

      <!-- Promemoria normativo -->
      <div class="bg-blue-50 border border-blue-200 rounded-lg px-3 py-2.5 text-xs text-blue-700">
        <strong>Art. 99 D.Lgs. 81/2008</strong> — la notifica è redatta e trasmessa
        da committente o RL ad ASL e DPL prima dell'inizio lavori. Il CSE ne custodisce
        copia per esibizione in caso di ispezione.
      </div>

      <!-- Motivo (solo per aggiornamenti) -->
      <div x-show="formTipo === 'aggiornamento'">
        <label for="np-motivo" class="block text-xs font-medium text-slate-700 mb-1">
          Motivo dell'aggiornamento
          <span class="text-slate-400 font-normal">(cosa è cambiato nel cantiere)</span>
        </label>
        <input id="np-motivo" type="text" x-model="formMotivo"
               placeholder="Es. Aggiunta impresa subappaltatrice, Variante lavori lotto 2…"
               class="w-full border border-slate-300 rounded-md px-3 py-2 text-sm
                      focus:outline-none focus:ring-2 focus:ring-blue-500">
      </div>

      <!-- Data -->
      <div>
        <label for="np-data" class="block text-xs font-medium text-slate-700 mb-1">
          Data
          <span x-text="formTipo === 'originale' ? '(invio/protocollo)' : '(aggiornamento)'"></span>
          <span class="text-slate-400 font-normal">(facoltativa)</span>
        </label>
        <input id="np-data" type="date" x-model="formData"
               class="border border-slate-300 rounded-md px-3 py-2 text-sm
                      focus:outline-none focus:ring-2 focus:ring-blue-500">
      </div>

      <!-- N. Protocollo -->
      <div>
        <label for="np-protocollo" class="block text-xs font-medium text-slate-700 mb-1">
          N. protocollo
          <span class="text-slate-400 font-normal">(facoltativo)</span>
        </label>
        <input id="np-protocollo" type="text" x-model="formProtocollo"
               placeholder="Es. NP-2026-001"
               class="w-full border border-slate-300 rounded-md px-3 py-2 text-sm
                      focus:outline-none focus:ring-2 focus:ring-blue-500">
      </div>

      <!-- Mittente -->
      <div>
        <label for="np-mittente" class="block text-xs font-medium text-slate-700 mb-1">
          Inviata da
        </label>
        <select id="np-mittente" x-model="formMittente"
                class="w-full border border-slate-300 rounded-md px-3 py-2 text-sm
                       focus:outline-none focus:ring-2 focus:ring-blue-500">
          <option value="committente">Committente</option>
          <option value="responsabile lavori">Responsabile dei Lavori (RL)</option>
        </select>
      </div>

      <!-- Oggetto -->
      <div>
        <label for="np-oggetto" class="block text-xs font-medium text-slate-700 mb-1">
          Oggetto
          <span class="text-slate-400 font-normal">(facoltativo)</span>
        </label>
        <input id="np-oggetto" type="text" x-model="formOggetto"
               placeholder="Es. Notifica avvio lavori stradali"
               class="w-full border border-slate-300 rounded-md px-3 py-2 text-sm
                      focus:outline-none focus:ring-2 focus:ring-blue-500">
      </div>

      <!-- File PDF -->
      <div>
        <p class="text-xs font-medium text-slate-700 mb-1">
          PDF notifica
          <span class="text-slate-400 font-normal">(facoltativo)</span>
        </p>

        <!-- File selezionato -->
        <div x-show="formFilename"
             class="flex items-center gap-2 mb-2 bg-slate-50 border border-slate-200
                    rounded-lg px-3 py-2">
          <button x-show="formBase64" type="button"
                  @click="ALLEGATI.apriAllegato(formBase64, formFilename)"
                  class="text-xs text-blue-600 hover:text-blue-800 flex-1 text-left truncate
                         focus:outline-none focus:ring-1 focus:ring-blue-400 rounded"
                  :title="formFilename" x-text="'📎 ' + formFilename"></button>
          <span x-show="!formBase64"
                class="text-xs text-slate-400 flex-1 truncate"
                x-text="'📎 ' + formFilename"></span>
          <button type="button" @click="rimuoviFile()"
                  class="text-xs text-red-400 hover:text-red-700 flex-shrink-0
                         px-1.5 py-0.5 rounded hover:bg-red-50 transition-colors
                         focus:outline-none focus:ring-1 focus:ring-red-400">
            × rimuovi
          </button>
        </div>

        <!-- Avviso file grande -->
        <div x-show="avvisoFileGrande" role="status"
             class="mb-2 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2
                    text-xs text-amber-700 flex items-start gap-1.5">
          <span aria-hidden="true">⚠</span>
          <span>File grande (<strong x-text="_formataBytes(formFileSize)"></strong>):
            assicurati che OneDrive sia sincronizzato prima di salvare.</span>
        </div>

        <!-- Selettore file -->
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

      <!-- Note -->
      <div>
        <label for="np-note" class="block text-xs font-medium text-slate-700 mb-1">
          Note
          <span class="text-slate-400 font-normal">(facoltativo)</span>
        </label>
        <textarea id="np-note" rows="2" x-model="formNote"
                  placeholder="Note libere"
                  class="w-full border border-slate-300 rounded-md px-3 py-2 text-sm resize-none
                         focus:outline-none focus:ring-2 focus:ring-blue-500
                         placeholder:text-slate-400 placeholder:text-xs"></textarea>
      </div>

      <!-- Testo per AI -->
      <div>
        <label for="np-testo-ai" class="block text-xs font-medium text-slate-700 mb-1">
          Testo per l'analisi AI
          <span class="text-slate-400 font-normal">(facoltativo)</span>
        </label>
        <textarea id="np-testo-ai" rows="4" x-model="formTestoAi"
                  placeholder="Facoltativo: incolla qui il testo della notifica per l'analisi AI futura."
                  class="w-full border border-slate-300 rounded-md px-3 py-2 text-sm resize-y
                         focus:outline-none focus:ring-2 focus:ring-blue-500
                         placeholder:text-slate-400 placeholder:text-xs"></textarea>
        <p class="text-xs text-slate-400 mt-1">
          Il contenuto sarà disponibile all'assistente AI (M26). Non compare nella lista.
        </p>
      </div>

    </div><!-- /drawer-body -->

    <!-- Drawer footer -->
    <div class="drawer-footer px-5 py-4 border-t border-slate-200 bg-white
                flex items-center justify-end gap-3">
      <button @click="chiudiDrawer(false)" :disabled="salvando"
              class="text-sm text-slate-600 hover:text-slate-800 px-4 py-2
                     border border-slate-300 rounded-lg hover:bg-slate-50
                     disabled:opacity-50 transition-colors
                     focus:outline-none focus:ring-2 focus:ring-slate-400">
        Annulla
      </button>
      <button @click="salva()" :disabled="salvando"
              class="text-sm bg-blue-600 hover:bg-blue-700 text-white font-medium px-5 py-2
                     rounded-lg disabled:opacity-50 transition-colors
                     focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2">
        <span x-show="!salvando"
              x-text="formTipo === 'originale'
                ? (formNuovo ? 'Registra' : 'Aggiorna')
                : (formNuovo ? 'Aggiungi' : 'Aggiorna')"></span>
        <span x-show="salvando">⏳ Salvataggio…</span>
      </button>
    </div>

  </div><!-- /drawer -->

</div><!-- /NotificaPreliminare -->
`;

// ── Registrazione nel registry moduli ─────────────────────────────────────────

window.MODULI_REGISTRATI = window.MODULI_REGISTRATI ?? {};
window.MODULI_REGISTRATI['notifica-preliminare'] = {
  monta(contenitore) { contenitore.innerHTML = _TEMPLATE_NOTIFICA; },
};
