/**
 * ods.js — Raccoglitore ODS (Ordini di Servizio): Inviati e Ricevuti.
 *
 * RACCOLTA DOCUMENTALE PURA: nessuna generazione, nessun iter protocollare.
 * Il CSE archivia PDF già formati con i relativi metadati.
 * La gestione ODS (numerazione, trasmissione, adempimenti) resta esterna.
 *
 * Storage:
 *   07_ODS-Inviati/ods_inviati.json   — file unico array
 *   13_ODS-Ricevuti/ods_ricevuti.json — file unico array
 * Le cartelle esistono già nello scaffolding (piatte).
 * NOTA: 07_Verifiche-ITP è una cartella SORELLA di 07_ODS-Inviati — cartelle
 *   distinte nella stessa radice del cantiere. Non c'è conflitto.
 *
 * Due sezioni in un unico componente Alpine (pattern PSC/POS):
 *   sezioneAttiva: 'inviati' | 'ricevuti'
 * Un unico drawer, campi direzione-specifici mostrati/nascosti per sezione.
 *
 * NON usa Alpine.initTree.
 * Dipende da: ODS_SERVICE, ANAGRAFICA_SERVICE, ALLEGATI, FILESYSTEM,
 *             UTILS, NOTIFICHE, ERRORI (già caricati).
 */

'use strict';

// ── Tag ODS ───────────────────────────────────────────────────────────────────

const TAG_ODS = [
  { valore: 'sicurezza',   etichetta: 'Sicurezza / Infortuni' },
  { valore: 'avanzamento', etichetta: 'Avanzamento lavori' },
  { valore: 'economico',   etichetta: 'Economico / Contabile' },
  { valore: 'varianti',    etichetta: 'Varianti / Modifiche progettuali' },
  { valore: 'altro',       etichetta: 'Altro' },
];

const _SOGLIA_ODS = 10 * 1024 * 1024;   // 10 MB — avviso non bloccante

// ── Helper file ───────────────────────────────────────────────────────────────

const _leggiFileOds = (file) =>
  new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload  = (e) => resolve(e.target.result);
    r.onerror = ()  => reject(new Error('Lettura file non riuscita'));
    r.readAsDataURL(file);
  });

function _formataBytesOds(bytes) {
  if (bytes >= 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  return Math.round(bytes / 1024) + ' KB';
}

// ── Service ───────────────────────────────────────────────────────────────────

const ODS_SERVICE = (() => {

  const _CFG = {
    inviati:  { cartella: '07_ODS-Inviati',   file: 'ods_inviati.json',   tipo: 'ods_inviati' },
    ricevuti: { cartella: '13_ODS-Ricevuti',   file: 'ods_ricevuti.json',  tipo: 'ods_ricevuti' },
  };

  const _getDir = async (cantiereId, direzione, crea = false) => {
    const root = FILESYSTEM.getHandleAttivo();
    if (!root) throw new Error('Filesystem non agganciato.');
    const cantDir = await root.getDirectoryHandle(cantiereId);
    return FILESYSTEM.navigaPercorso(cantDir, [_CFG[direzione].cartella], crea);
  };

  /**
   * Legge il file ODS per la direzione indicata.
   * Se la cartella o il file non esistono restituisce lo schema vuoto.
   * @param {string} cantiereId
   * @param {'inviati'|'ricevuti'} direzione
   */
  const leggiOds = async (cantiereId, direzione) => {
    try {
      const dir = await _getDir(cantiereId, direzione, false);
      return await FILESYSTEM.leggiJson(dir, _CFG[direzione].file);
    } catch (e) {
      if (e.name === 'NotFoundError') {
        return {
          tipo_file:     _CFG[direzione].tipo,
          cantiere_id:   cantiereId,
          generato_il:   new Date().toISOString(),
          aggiornato_il: new Date().toISOString(),
          documenti:     [],
        };
      }
      throw e;
    }
  };

  /**
   * Scrive il file ODS per la direzione indicata.
   * Crea la cartella al volo se necessario (primo salvataggio su cantiere esistente).
   * @param {object} archivio
   * @param {'inviati'|'ricevuti'} direzione
   */
  const scriviOds = async (archivio, direzione) => {
    archivio.aggiornato_il = new Date().toISOString();
    const dir = await _getDir(archivio.cantiere_id, direzione, true);
    await FILESYSTEM.scriviJson(dir, _CFG[direzione].file, archivio);
    return archivio;
  };

  return { leggiOds, scriviOds };

})();

// ── Componente Alpine ─────────────────────────────────────────────────────────

function OrdiniServizio() {
  return {

    // ── Sezione corrente
    sezioneAttiva: 'inviati',   // 'inviati' | 'ricevuti'
    _cantiereId:   null,

    // ── Dati e stato per la sezione INVIATI
    archivioInv:    null,
    caricamentoInv: true,
    filtroTagInv:   '',
    cercaTestoInv:  '',
    filtroPeriodoInv: '',
    mostraCestinoInv: false,

    // ── Dati e stato per la sezione RICEVUTI
    archivioRic:    null,
    caricamentoRic: true,
    filtroTagRic:   '',
    cercaTestoRic:  '',
    filtroPeriodoRic: '',
    mostraCestinoRic: false,

    // ── Anagrafica (imprese — per sezione Inviati)
    imprese: [],

    // ── Drawer (condiviso tra le due direzioni)
    drawerAperto: false,
    formNuovo:    true,
    formId:       null,
    salvando:     false,
    _modificato:  false,

    // Campi comuni
    formNumero:           '',
    formData:             '',
    formOggetto:          '',
    formDescrizione:      '',
    formTag:              'sicurezza',
    formTagPersonalizzato: '',
    formFilename:         null,
    formBase64:           null,
    formFileSize:         null,
    formTestoAi:          '',
    formNcCollegata:      '',

    // Campi INVIATI
    formImpresaId:          '',
    formRichiedeRiscontro:  false,

    // Campi RICEVUTI
    formMittente:           '',
    formRichiedeAdempimento: false,

    // ── Computed ─────────────────────────────────────────────────────────────

    get tagLibero()       { return this.formTag === 'altro'; },
    get avvisoFileGrande(){ return this.formFileSize !== null && this.formFileSize > _SOGLIA_ODS; },

    get documentiInvFiltrati() {
      return this._filtra(this.archivioInv?.documenti, this.filtroTagInv, this.cercaTestoInv, this.filtroPeriodoInv);
    },
    get documentiRicFiltrati() {
      return this._filtra(this.archivioRic?.documenti, this.filtroTagRic, this.cercaTestoRic, this.filtroPeriodoRic);
    },
    get cestinoInv() {
      return (this.archivioInv?.documenti ?? []).filter(d => d._cestino)
        .sort((a, b) => (b._eliminato_il ?? '').localeCompare(a._eliminato_il ?? ''));
    },
    get cestinoRic() {
      return (this.archivioRic?.documenti ?? []).filter(d => d._cestino)
        .sort((a, b) => (b._eliminato_il ?? '').localeCompare(a._eliminato_il ?? ''));
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
      if (this.drawerAperto) this.chiudiDrawer(true);
      this.mostraCestinoInv = false;
      this.mostraCestinoRic = false;
      this._carica();
    },

    async _carica() {
      const cantId = this._cantiereId;
      this.archivioInv = null;
      this.archivioRic = null;
      if (!cantId) {
        this.caricamentoInv = false;
        this.caricamentoRic = false;
        this.imprese = [];
        return;
      }
      this.caricamentoInv = true;
      this.caricamentoRic = true;
      try {
        if (!ANAGRAFICA_SERVICE.isCaricato || ANAGRAFICA_SERVICE.cantiereId !== cantId) {
          await ANAGRAFICA_SERVICE.carica(cantId);
        }
        this.imprese = [...(ANAGRAFICA_SERVICE.get('imprese') ?? [])];
      } catch { this.imprese = []; }

      // Carica le due direzioni in parallelo
      const [inv, ric] = await Promise.all([
        ODS_SERVICE.leggiOds(cantId, 'inviati')
          .catch(err => { ERRORI.gestisciErrore('ods/carica-inviati', err); return null; }),
        ODS_SERVICE.leggiOds(cantId, 'ricevuti')
          .catch(err => { ERRORI.gestisciErrore('ods/carica-ricevuti', err); return null; }),
      ]);
      this.archivioInv    = inv;
      this.archivioRic    = ric;
      this.caricamentoInv = false;
      this.caricamentoRic = false;
    },

    // ── Drawer ────────────────────────────────────────────────────────────────

    apriNuovoOds() {
      this.formNuovo              = true;
      this.formId                 = null;
      this.formNumero             = '';
      this.formData               = UTILS.oggi();
      this.formOggetto            = '';
      this.formDescrizione        = '';
      this.formTag                = 'sicurezza';
      this.formTagPersonalizzato  = '';
      this.formFilename           = null;
      this.formBase64             = null;
      this.formFileSize           = null;
      this.formTestoAi            = '';
      this.formNcCollegata        = '';
      this.formImpresaId          = '';
      this.formRichiedeRiscontro  = false;
      this.formMittente           = '';
      this.formRichiedeAdempimento = false;
      this._modificato            = false;
      this.drawerAperto           = true;
      this.$nextTick(() => document.getElementById('ods-numero')?.focus());
    },

    apriModificaOds(doc) {
      this.formNuovo              = false;
      this.formId                 = doc.id;
      this.formNumero             = doc.numero             ?? '';
      this.formData               = doc.data               ?? '';
      this.formOggetto            = doc.oggetto            ?? '';
      this.formDescrizione        = doc.descrizione        ?? '';
      this.formTag                = doc.tag                ?? 'sicurezza';
      this.formTagPersonalizzato  = doc.tag_personalizzato ?? '';
      this.formFilename           = doc.filename           ?? null;
      this.formBase64             = doc.base64             ?? null;
      this.formFileSize           = null;
      this.formTestoAi            = doc.testo_ai           ?? '';
      this.formNcCollegata        = doc.nc_collegata_id    ?? '';
      this.formImpresaId          = doc.impresa_id         ?? '';
      this.formRichiedeRiscontro  = doc.richiede_riscontro ?? false;
      this.formMittente           = doc.mittente           ?? '';
      this.formRichiedeAdempimento = doc.richiede_adempimento ?? false;
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

    async onFileSelezionato(event) {
      const file = event.target.files?.[0];
      if (!file) return;
      this.formFilename = file.name;
      this.formFileSize = file.size;
      this.formBase64   = await _leggiFileOds(file);
      this._modificato  = true;
      event.target.value = '';
    },

    rimuoviFile() {
      this.formFilename = null;
      this.formBase64   = null;
      this.formFileSize = null;
      this._modificato  = true;
    },

    async salvaOds() {
      if (this.formTag === 'altro' && !(this.formTagPersonalizzato ?? '').trim()) {
        NOTIFICHE.attenzione('ODS', 'Specifica il tipo per il tag "Altro".');
        document.getElementById('ods-tag-pers')?.focus();
        return;
      }
      const dir      = this.sezioneAttiva;
      const archivio = dir === 'inviati' ? this.archivioInv : this.archivioRic;
      if (!archivio) return;

      this.salvando = true;
      try {
        // Costruisce il record con i campi comuni
        const record = {
          id:                 this.formNuovo ? UTILS.uuid() : this.formId,
          tipo_file:          dir === 'inviati' ? 'ods_inviato' : 'ods_ricevuto',
          cantiere_id:        this._cantiereId,
          numero:             this.formNumero.trim()       || null,
          data:               this.formData                || null,
          oggetto:            this.formOggetto.trim()      || null,
          descrizione:        this.formDescrizione.trim()  || null,
          tag:                this.formTag,
          tag_personalizzato: this.formTag === 'altro' ? (this.formTagPersonalizzato ?? '').trim() : null,
          filename:           this.formFilename ?? null,
          base64:             this.formBase64   ?? null,
          testo_ai:           this.formTestoAi.trim()     || null,
          nc_collegata_id:    this.formNcCollegata.trim() || null,
          creato_il:          new Date().toISOString(),
        };

        // Campi specifici per direzione
        if (dir === 'inviati') {
          record.impresa_id           = this.formImpresaId || null;
          record.impresa_nome         = this.nomeImpresa(this.formImpresaId) ?? null;
          record.richiede_riscontro   = !!this.formRichiedeRiscontro;
        } else {
          record.mittente              = this.formMittente.trim() || null;
          record.richiede_adempimento  = !!this.formRichiedeAdempimento;
        }

        if (this.formNuovo) {
          archivio.documenti.push(record);
        } else {
          // Soft-delete vecchio + push aggiornato (pattern PSC/archivio)
          const idx     = archivio.documenti.findIndex(d => d.id === this.formId && !d._cestino);
          const vecchio = idx >= 0 ? archivio.documenti[idx] : null;
          if (vecchio) {
            archivio.documenti[idx] = { ...vecchio, _cestino: true, _eliminato_il: new Date().toISOString() };
            record.creato_il      = vecchio.creato_il;
            record._aggiornato_il = new Date().toISOString();
          }
          archivio.documenti.push(record);
        }

        archivio.cantiere_id = this._cantiereId;
        await ODS_SERVICE.scriviOds(archivio, dir);

        if (dir === 'inviati') this.archivioInv = { ...archivio };
        else                   this.archivioRic = { ...archivio };

        NOTIFICHE.successo(this.formNuovo ? 'ODS aggiunto' : 'ODS aggiornato');
        this.chiudiDrawer(true);
      } catch (err) {
        ERRORI.gestisciErrore('ods/salva', err);
      } finally {
        this.salvando = false;
      }
    },

    // ── Cestina / Ripristina / Elimina ────────────────────────────────────────

    async cestinaOds(doc) {
      if (!confirm('Spostare nel cestino questo ODS?')) return;
      const dir      = this.sezioneAttiva;
      const archivio = dir === 'inviati' ? this.archivioInv : this.archivioRic;
      try {
        const idx = archivio.documenti.findIndex(d => d.id === doc.id && !d._cestino);
        if (idx < 0) return;
        archivio.documenti[idx] = { ...archivio.documenti[idx], _cestino: true, _eliminato_il: new Date().toISOString() };
        archivio.cantiere_id = this._cantiereId;
        await ODS_SERVICE.scriviOds(archivio, dir);
        if (dir === 'inviati') this.archivioInv = { ...archivio };
        else                   this.archivioRic = { ...archivio };
        NOTIFICHE.info('ODS', 'Spostato nel cestino.');
      } catch (err) {
        ERRORI.gestisciErrore('ods/cestina', err);
      }
    },

    async ripristinaOds(doc, dir) {
      const archivio = dir === 'inviati' ? this.archivioInv : this.archivioRic;
      try {
        const idx = archivio.documenti.findIndex(d => d.id === doc.id && d._cestino);
        if (idx < 0) return;
        // eslint-disable-next-line no-unused-vars
        const { _cestino, _eliminato_il, ...ripristinato } = archivio.documenti[idx];
        ripristinato._aggiornato_il = new Date().toISOString();
        archivio.documenti[idx] = ripristinato;
        archivio.cantiere_id = this._cantiereId;
        await ODS_SERVICE.scriviOds(archivio, dir);
        if (dir === 'inviati') this.archivioInv = { ...archivio };
        else                   this.archivioRic = { ...archivio };
        NOTIFICHE.successo('ODS ripristinato');
      } catch (err) {
        ERRORI.gestisciErrore('ods/ripristina', err);
      }
    },

    async eliminaDefinitivaOds(doc, dir) {
      if (!confirm('Eliminare definitivamente questo ODS? Operazione non reversibile.')) return;
      const archivio = dir === 'inviati' ? this.archivioInv : this.archivioRic;
      try {
        archivio.documenti    = archivio.documenti.filter(d => d.id !== doc.id);
        archivio.cantiere_id  = this._cantiereId;
        await ODS_SERVICE.scriviOds(archivio, dir);
        if (dir === 'inviati') this.archivioInv = { ...archivio };
        else                   this.archivioRic = { ...archivio };
        NOTIFICHE.info('ODS', 'Eliminato definitivamente.');
      } catch (err) {
        ERRORI.gestisciErrore('ods/elimina', err);
      }
    },

    // ── Helper UI ─────────────────────────────────────────────────────────────

    nomeImpresa(id) {
      return this.imprese.find(i => i.id === id)?.ragioneSociale ?? null;
    },

    tagEtichetta(tag, tagPers) {
      if (tag === 'altro') return tagPers || 'Altro';
      return TAG_ODS.find(t => t.valore === tag)?.etichetta ?? tag;
    },

    _tagOds() { return TAG_ODS; },
    _imprese() { return this.imprese; },

    _filtra(documenti, filtroTag, cercaTesto, filtroPeriodo) {
      let r = (documenti ?? []).filter(d => !d._cestino);
      if (filtroTag) r = r.filter(d => d.tag === filtroTag);
      if (cercaTesto.trim()) {
        const t = cercaTesto.toLowerCase();
        r = r.filter(d =>
          (d.numero      ?? '').toLowerCase().includes(t) ||
          (d.oggetto     ?? '').toLowerCase().includes(t) ||
          (d.descrizione ?? '').toLowerCase().includes(t)
        );
      }
      if (filtroPeriodo) {
        const cutoff = new Date();
        if      (filtroPeriodo === 'mese')     cutoff.setDate(cutoff.getDate() - 30);
        else if (filtroPeriodo === 'settimana') cutoff.setDate(cutoff.getDate() - 7);
        const cs = cutoff.toISOString().slice(0, 10);
        r = r.filter(d => (d.data ?? d.creato_il?.slice(0, 10) ?? '') >= cs);
      }
      return r;
    },

    migliora() {
      if (typeof apriCorrettoreConTesto === 'undefined') return;
      apriCorrettoreConTesto(this.formDescrizione ?? '', 'ODS — Descrizione / Note');
    },
  };
}

// ── Template HTML ─────────────────────────────────────────────────────────────

const _TEMPLATE_ODS = `
<div x-data="OrdiniServizio()" x-init="init()" x-effect="aggiornaSeCantiereRicambia()"
     class="max-w-4xl">

  <!-- === HEADER === -->
  <div class="flex items-center justify-between mb-4">
    <div>
      <h1 class="text-xl font-semibold text-slate-800">📋 Ordini di Servizio</h1>
      <p class="text-xs text-slate-400 mt-0.5">
        Raccolta documentale — archivio ODS inviati e ricevuti
      </p>
    </div>
    <button @click="apriNuovoOds()" x-show="$store.cantiere.id"
            class="bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium
                   px-4 py-2 rounded-lg transition-colors
                   focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
            x-text="sezioneAttiva === 'inviati' ? '+ Nuovo ODS inviato' : '+ Nuovo ODS ricevuto'">
    </button>
  </div>

  <!-- Nessun cantiere -->
  <div x-show="!$store.cantiere.id" class="placeholder-modulo">
    <div class="text-3xl" aria-hidden="true">📋</div>
    <p class="text-slate-500">Seleziona un cantiere per accedere agli Ordini di Servizio.</p>
  </div>

  <div x-show="$store.cantiere.id">

    <!-- === TAB SEZIONI === -->
    <div class="flex gap-1 mb-5 bg-slate-100 p-1 rounded-lg w-fit"
         role="tablist" aria-label="Direzione ODS">
      <button @click="sezioneAttiva = 'inviati'"
              :aria-selected="sezioneAttiva === 'inviati'" role="tab"
              :class="sezioneAttiva === 'inviati'
                ? 'bg-white text-slate-800 shadow-sm'
                : 'text-slate-500 hover:text-slate-700'"
              class="px-4 py-1.5 rounded-md text-sm font-medium transition-all
                     focus:outline-none focus:ring-2 focus:ring-blue-400">
        📤 Inviati
        <span x-show="(archivioInv?.documenti ?? []).filter(d=>!d._cestino).length > 0"
              class="ml-1.5 text-xs font-bold text-slate-500"
              x-text="(archivioInv?.documenti ?? []).filter(d=>!d._cestino).length"></span>
      </button>
      <button @click="sezioneAttiva = 'ricevuti'"
              :aria-selected="sezioneAttiva === 'ricevuti'" role="tab"
              :class="sezioneAttiva === 'ricevuti'
                ? 'bg-white text-slate-800 shadow-sm'
                : 'text-slate-500 hover:text-slate-700'"
              class="px-4 py-1.5 rounded-md text-sm font-medium transition-all
                     focus:outline-none focus:ring-2 focus:ring-blue-400">
        📥 Ricevuti
        <span x-show="(archivioRic?.documenti ?? []).filter(d=>!d._cestino).length > 0"
              class="ml-1.5 text-xs font-bold text-slate-500"
              x-text="(archivioRic?.documenti ?? []).filter(d=>!d._cestino).length"></span>
      </button>
    </div>

    <!-- ═══════════════════════════════════════════════════════════
         SEZIONE INVIATI
         ═══════════════════════════════════════════════════════════ -->
    <div x-show="sezioneAttiva === 'inviati'" role="region" aria-label="ODS Inviati">

      <!-- Spinner -->
      <div x-show="caricamentoInv" class="flex items-center gap-3 py-10 text-slate-400 text-sm">
        <div class="w-5 h-5 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"
             role="status" aria-label="Caricamento"></div>
        Caricamento ODS inviati…
      </div>

      <div x-show="!caricamentoInv">

        <!-- Filtri INVIATI -->
        <div class="flex flex-wrap gap-2 mb-4 items-center">
          <select x-model="filtroTagInv"
                  class="border border-slate-300 rounded-md px-2.5 py-1.5 text-sm bg-white
                         focus:outline-none focus:ring-2 focus:ring-blue-500">
            <option value="">Tutti i tag</option>
            <template x-for="t in _tagOds()" :key="t.valore">
              <option :value="t.valore" x-text="t.etichetta"></option>
            </template>
          </select>
          <select x-model="filtroPeriodoInv"
                  class="border border-slate-300 rounded-md px-2.5 py-1.5 text-sm bg-white
                         focus:outline-none focus:ring-2 focus:ring-blue-500">
            <option value="">Tutto il periodo</option>
            <option value="settimana">Ultima settimana</option>
            <option value="mese">Ultimo mese</option>
          </select>
          <input type="search" x-model="cercaTestoInv"
                 placeholder="Cerca numero, oggetto, descrizione…"
                 class="flex-1 min-w-[180px] border border-slate-300 rounded-md
                        px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
          <button x-show="filtroTagInv || filtroPeriodoInv || cercaTestoInv"
                  @click="filtroTagInv = ''; filtroPeriodoInv = ''; cercaTestoInv = ''"
                  class="text-xs text-slate-400 hover:text-slate-600 px-2 py-1 rounded
                         focus:outline-none focus:ring-2 focus:ring-slate-400">
            × Azzera
          </button>
        </div>

        <!-- Lista vuota -->
        <div x-show="(archivioInv?.documenti ?? []).filter(d=>!d._cestino).length === 0"
             class="py-12 text-center text-slate-400">
          <div class="text-3xl mb-2" aria-hidden="true">📤</div>
          <p class="text-sm">Nessun ODS inviato in archivio.
            <span x-show="!cercaTestoInv && !filtroTagInv"> Clicca "+ Nuovo ODS inviato" per iniziare.</span>
          </p>
        </div>
        <div x-show="(archivioInv?.documenti ?? []).filter(d=>!d._cestino).length > 0 && documentiInvFiltrati.length === 0"
             class="py-10 text-center text-slate-400 text-sm">
          Nessun ODS corrisponde ai filtri attivi.
        </div>

        <!-- Lista INVIATI -->
        <div role="list" class="space-y-2">
          <template x-for="doc in documentiInvFiltrati" :key="doc.id">
            <article role="listitem"
                     class="border border-slate-200 bg-white rounded-xl px-4 py-3 space-y-2
                            hover:border-slate-300 transition-all">

              <!-- Riga 1: badge + numero + data + badges stato -->
              <div class="flex items-center gap-2 flex-wrap">
                <span class="text-xs bg-slate-100 text-slate-700 px-2 py-0.5 rounded-full font-medium flex-shrink-0"
                      x-text="tagEtichetta(doc.tag, doc.tag_personalizzato)"></span>
                <span x-show="doc.numero"
                      class="text-sm font-semibold text-slate-800 flex-shrink-0"
                      x-text="doc.numero"></span>
                <span x-show="doc.data"
                      class="text-xs text-slate-400 flex-shrink-0"
                      x-text="UTILS.formatData(doc.data + 'T12:00:00Z')"></span>
                <span x-show="doc.richiede_riscontro"
                      class="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full flex-shrink-0">
                  ↩ Attende riscontro
                </span>
                <span x-show="doc.testo_ai"
                      title="Testo AI presente"
                      class="text-xs bg-violet-100 text-violet-700 px-2 py-0.5 rounded-full flex-shrink-0">
                  🤖 AI ✓
                </span>
                <span x-show="doc.nc_collegata_id"
                      class="text-xs bg-rose-50 text-rose-600 px-2 py-0.5 rounded-full flex-shrink-0"
                      x-text="'⚠ NC: ' + doc.nc_collegata_id"></span>
              </div>

              <!-- Oggetto -->
              <p x-show="doc.oggetto"
                 class="text-sm font-medium text-slate-800 leading-snug"
                 x-text="doc.oggetto"></p>

              <!-- Riga 3: impresa + file + azioni -->
              <div class="flex items-center gap-2 flex-wrap pt-0.5">

                <!-- Impresa destinataria -->
                <template x-if="nomeImpresa(doc.impresa_id)">
                  <span class="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full"
                        x-text="nomeImpresa(doc.impresa_id)"></span>
                </template>

                <!-- File PDF -->
                <button x-show="doc.base64" type="button"
                        @click="ALLEGATI.apriAllegato(doc.base64, doc.filename)"
                        class="text-xs text-blue-600 hover:text-blue-800 flex items-center gap-1
                               focus:outline-none focus:ring-1 focus:ring-blue-400 rounded"
                        :title="'Apri: ' + doc.filename">
                  📎 <span class="truncate max-w-[12rem]" x-text="doc.filename"></span>
                </button>

                <div class="ml-auto flex items-center gap-1.5 flex-shrink-0">
                  <button x-show="doc.base64" type="button"
                          @click="ALLEGATI.scaricaAllegato(doc.base64, doc.filename)"
                          class="text-xs text-slate-400 hover:text-blue-600 p-1.5 rounded-lg
                                 hover:bg-slate-50 transition-colors
                                 focus:outline-none focus:ring-2 focus:ring-slate-400"
                          title="Scarica file">⬇</button>
                  <button type="button" @click="apriModificaOds(doc)"
                          class="text-xs text-slate-600 hover:text-slate-900 px-3 py-1
                                 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors
                                 focus:outline-none focus:ring-2 focus:ring-slate-400">
                    ✏ Modifica
                  </button>
                  <button type="button" @click="cestinaOds(doc)"
                          class="text-xs text-red-400 hover:text-red-700 p-1.5 rounded-lg
                                 hover:bg-red-50 transition-colors
                                 focus:outline-none focus:ring-2 focus:ring-red-400"
                          title="Sposta nel cestino">🗑</button>
                </div>
              </div>
            </article>
          </template>
        </div>

        <!-- Cestino INVIATI -->
        <div class="mt-5">
          <button @click="mostraCestinoInv = !mostraCestinoInv"
                  x-show="cestinoInv.length > 0"
                  class="text-xs text-slate-400 hover:text-slate-600 flex items-center gap-1
                         focus:outline-none focus:ring-2 focus:ring-slate-400 rounded">
            <span x-text="mostraCestinoInv ? '▲' : '▼'"></span>
            <span x-text="'Cestino (' + cestinoInv.length + ')'"></span>
          </button>
          <div x-show="mostraCestinoInv" class="mt-2 space-y-2">
            <template x-for="doc in cestinoInv" :key="doc.id">
              <div class="border border-slate-200 bg-slate-50 rounded-xl px-4 py-2.5
                          flex items-center gap-3 opacity-70">
                <div class="flex-1 min-w-0">
                  <p class="text-xs text-slate-500 line-through truncate"
                     x-text="(doc.numero ? doc.numero + ' — ' : '') + (doc.oggetto || '(nessun oggetto)')"></p>
                  <p x-show="doc._eliminato_il"
                     class="text-xs text-slate-400 mt-0.5"
                     x-text="'Cestinato: ' + UTILS.formatData(doc._eliminato_il)"></p>
                </div>
                <div class="flex gap-2 flex-shrink-0">
                  <button @click="ripristinaOds(doc, 'inviati')"
                          class="text-xs text-blue-600 bg-blue-50 border border-blue-200
                                 px-2 py-1 rounded hover:bg-blue-100 transition-colors
                                 focus:outline-none focus:ring-2 focus:ring-blue-400">
                    ↩ Ripristina
                  </button>
                  <button @click="eliminaDefinitivaOds(doc, 'inviati')"
                          class="text-xs text-red-600 bg-red-50 border border-red-200
                                 px-2 py-1 rounded hover:bg-red-100 transition-colors
                                 focus:outline-none focus:ring-2 focus:ring-red-400">
                    🗑 Elimina
                  </button>
                </div>
              </div>
            </template>
          </div>
        </div>

      </div><!-- /!caricamentoInv -->
    </div><!-- /sezione inviati -->


    <!-- ═══════════════════════════════════════════════════════════
         SEZIONE RICEVUTI
         ═══════════════════════════════════════════════════════════ -->
    <div x-show="sezioneAttiva === 'ricevuti'" role="region" aria-label="ODS Ricevuti">

      <!-- Spinner -->
      <div x-show="caricamentoRic" class="flex items-center gap-3 py-10 text-slate-400 text-sm">
        <div class="w-5 h-5 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"
             role="status" aria-label="Caricamento"></div>
        Caricamento ODS ricevuti…
      </div>

      <div x-show="!caricamentoRic">

        <!-- Filtri RICEVUTI -->
        <div class="flex flex-wrap gap-2 mb-4 items-center">
          <select x-model="filtroTagRic"
                  class="border border-slate-300 rounded-md px-2.5 py-1.5 text-sm bg-white
                         focus:outline-none focus:ring-2 focus:ring-blue-500">
            <option value="">Tutti i tag</option>
            <template x-for="t in _tagOds()" :key="t.valore">
              <option :value="t.valore" x-text="t.etichetta"></option>
            </template>
          </select>
          <select x-model="filtroPeriodoRic"
                  class="border border-slate-300 rounded-md px-2.5 py-1.5 text-sm bg-white
                         focus:outline-none focus:ring-2 focus:ring-blue-500">
            <option value="">Tutto il periodo</option>
            <option value="settimana">Ultima settimana</option>
            <option value="mese">Ultimo mese</option>
          </select>
          <input type="search" x-model="cercaTestoRic"
                 placeholder="Cerca numero, oggetto, descrizione…"
                 class="flex-1 min-w-[180px] border border-slate-300 rounded-md
                        px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
          <button x-show="filtroTagRic || filtroPeriodoRic || cercaTestoRic"
                  @click="filtroTagRic = ''; filtroPeriodoRic = ''; cercaTestoRic = ''"
                  class="text-xs text-slate-400 hover:text-slate-600 px-2 py-1 rounded
                         focus:outline-none focus:ring-2 focus:ring-slate-400">
            × Azzera
          </button>
        </div>

        <!-- Lista vuota -->
        <div x-show="(archivioRic?.documenti ?? []).filter(d=>!d._cestino).length === 0"
             class="py-12 text-center text-slate-400">
          <div class="text-3xl mb-2" aria-hidden="true">📥</div>
          <p class="text-sm">Nessun ODS ricevuto in archivio.
            <span x-show="!cercaTestoRic && !filtroTagRic"> Clicca "+ Nuovo ODS ricevuto" per iniziare.</span>
          </p>
        </div>
        <div x-show="(archivioRic?.documenti ?? []).filter(d=>!d._cestino).length > 0 && documentiRicFiltrati.length === 0"
             class="py-10 text-center text-slate-400 text-sm">
          Nessun ODS corrisponde ai filtri attivi.
        </div>

        <!-- Lista RICEVUTI -->
        <div role="list" class="space-y-2">
          <template x-for="doc in documentiRicFiltrati" :key="doc.id">
            <article role="listitem"
                     class="border border-slate-200 bg-white rounded-xl px-4 py-3 space-y-2
                            hover:border-slate-300 transition-all">

              <!-- Riga 1: badge + numero + data + badges -->
              <div class="flex items-center gap-2 flex-wrap">
                <span class="text-xs bg-slate-100 text-slate-700 px-2 py-0.5 rounded-full font-medium flex-shrink-0"
                      x-text="tagEtichetta(doc.tag, doc.tag_personalizzato)"></span>
                <span x-show="doc.numero"
                      class="text-sm font-semibold text-slate-800 flex-shrink-0"
                      x-text="doc.numero"></span>
                <span x-show="doc.data"
                      class="text-xs text-slate-400 flex-shrink-0"
                      x-text="UTILS.formatData(doc.data + 'T12:00:00Z')"></span>
                <span x-show="doc.richiede_adempimento"
                      class="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded-full flex-shrink-0">
                  ⚡ Richiede adempimento
                </span>
                <span x-show="doc.testo_ai"
                      title="Testo AI presente"
                      class="text-xs bg-violet-100 text-violet-700 px-2 py-0.5 rounded-full flex-shrink-0">
                  🤖 AI ✓
                </span>
                <span x-show="doc.nc_collegata_id"
                      class="text-xs bg-rose-50 text-rose-600 px-2 py-0.5 rounded-full flex-shrink-0"
                      x-text="'⚠ NC: ' + doc.nc_collegata_id"></span>
              </div>

              <!-- Oggetto -->
              <p x-show="doc.oggetto"
                 class="text-sm font-medium text-slate-800 leading-snug"
                 x-text="doc.oggetto"></p>

              <!-- Riga 3: mittente + file + azioni -->
              <div class="flex items-center gap-2 flex-wrap pt-0.5">

                <!-- Mittente -->
                <span x-show="doc.mittente"
                      class="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full"
                      x-text="doc.mittente"></span>

                <!-- File PDF -->
                <button x-show="doc.base64" type="button"
                        @click="ALLEGATI.apriAllegato(doc.base64, doc.filename)"
                        class="text-xs text-blue-600 hover:text-blue-800 flex items-center gap-1
                               focus:outline-none focus:ring-1 focus:ring-blue-400 rounded"
                        :title="'Apri: ' + doc.filename">
                  📎 <span class="truncate max-w-[12rem]" x-text="doc.filename"></span>
                </button>

                <div class="ml-auto flex items-center gap-1.5 flex-shrink-0">
                  <button x-show="doc.base64" type="button"
                          @click="ALLEGATI.scaricaAllegato(doc.base64, doc.filename)"
                          class="text-xs text-slate-400 hover:text-blue-600 p-1.5 rounded-lg
                                 hover:bg-slate-50 transition-colors
                                 focus:outline-none focus:ring-2 focus:ring-slate-400"
                          title="Scarica file">⬇</button>
                  <button type="button" @click="apriModificaOds(doc)"
                          class="text-xs text-slate-600 hover:text-slate-900 px-3 py-1
                                 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors
                                 focus:outline-none focus:ring-2 focus:ring-slate-400">
                    ✏ Modifica
                  </button>
                  <button type="button" @click="cestinaOds(doc)"
                          class="text-xs text-red-400 hover:text-red-700 p-1.5 rounded-lg
                                 hover:bg-red-50 transition-colors
                                 focus:outline-none focus:ring-2 focus:ring-red-400"
                          title="Sposta nel cestino">🗑</button>
                </div>
              </div>
            </article>
          </template>
        </div>

        <!-- Cestino RICEVUTI -->
        <div class="mt-5">
          <button @click="mostraCestinoRic = !mostraCestinoRic"
                  x-show="cestinoRic.length > 0"
                  class="text-xs text-slate-400 hover:text-slate-600 flex items-center gap-1
                         focus:outline-none focus:ring-2 focus:ring-slate-400 rounded">
            <span x-text="mostraCestinoRic ? '▲' : '▼'"></span>
            <span x-text="'Cestino (' + cestinoRic.length + ')'"></span>
          </button>
          <div x-show="mostraCestinoRic" class="mt-2 space-y-2">
            <template x-for="doc in cestinoRic" :key="doc.id">
              <div class="border border-slate-200 bg-slate-50 rounded-xl px-4 py-2.5
                          flex items-center gap-3 opacity-70">
                <div class="flex-1 min-w-0">
                  <p class="text-xs text-slate-500 line-through truncate"
                     x-text="(doc.numero ? doc.numero + ' — ' : '') + (doc.oggetto || '(nessun oggetto)')"></p>
                  <p x-show="doc._eliminato_il"
                     class="text-xs text-slate-400 mt-0.5"
                     x-text="'Cestinato: ' + UTILS.formatData(doc._eliminato_il)"></p>
                </div>
                <div class="flex gap-2 flex-shrink-0">
                  <button @click="ripristinaOds(doc, 'ricevuti')"
                          class="text-xs text-blue-600 bg-blue-50 border border-blue-200
                                 px-2 py-1 rounded hover:bg-blue-100 transition-colors
                                 focus:outline-none focus:ring-2 focus:ring-blue-400">
                    ↩ Ripristina
                  </button>
                  <button @click="eliminaDefinitivaOds(doc, 'ricevuti')"
                          class="text-xs text-red-600 bg-red-50 border border-red-200
                                 px-2 py-1 rounded hover:bg-red-100 transition-colors
                                 focus:outline-none focus:ring-2 focus:ring-red-400">
                    🗑 Elimina
                  </button>
                </div>
              </div>
            </template>
          </div>
        </div>

      </div><!-- /!caricamentoRic -->
    </div><!-- /sezione ricevuti -->

  </div><!-- /$store.cantiere.id -->


  <!-- ════════════════════════════════════════════════════════════════
       DRAWER: Aggiungi / Modifica ODS (condiviso tra le due direzioni)
       ════════════════════════════════════════════════════════════════ -->
  <div x-show="drawerAperto" x-cloak
       class="drawer-backdrop" @click.self="chiudiDrawer(false)" aria-hidden="true"></div>

  <div x-show="drawerAperto" x-cloak
       @input="_modificato = true"
       @keydown.escape.window="chiudiDrawer(false)"
       class="drawer" role="dialog" aria-modal="true"
       :aria-label="formNuovo
         ? (sezioneAttiva === 'inviati' ? 'Nuovo ODS inviato' : 'Nuovo ODS ricevuto')
         : 'Modifica ODS'">

    <!-- header fisso -->
    <div class="drawer-header flex items-center justify-between px-5 py-4
                border-b border-slate-200 bg-white">
      <h2 class="text-base font-semibold text-slate-800"
          x-text="formNuovo
            ? (sezioneAttiva === 'inviati' ? 'Nuovo ODS inviato' : 'Nuovo ODS ricevuto')
            : 'Modifica ODS'"></h2>
      <button @click="chiudiDrawer(false)" aria-label="Chiudi"
              class="p-1.5 rounded hover:bg-slate-100 text-slate-500 text-lg
                     focus:outline-none focus:ring-2 focus:ring-slate-400">✕</button>
    </div>

    <!-- corpo scrollabile -->
    <div class="drawer-body px-5 py-4 space-y-4">

      <!-- Numero ODS -->
      <div>
        <label for="ods-numero" class="block text-xs font-medium text-slate-700 mb-1">
          Numero / Riferimento ODS
          <span class="text-slate-400 font-normal">(es. ODS-23/2026)</span>
        </label>
        <input id="ods-numero" type="text"
               x-model="formNumero"
               placeholder="Es. ODS-23/2026, n. 5/2026…"
               class="w-full border border-slate-300 rounded-md px-3 py-2 text-sm
                      focus:outline-none focus:ring-2 focus:ring-blue-500
                      placeholder:text-slate-400">
      </div>

      <!-- Data + Oggetto (griglia 2 col) -->
      <div class="grid grid-cols-2 gap-3">
        <div>
          <label for="ods-data" class="block text-xs font-medium text-slate-700 mb-1">Data</label>
          <input id="ods-data" type="date"
                 x-model="formData"
                 class="w-full border border-slate-300 rounded-md px-3 py-2 text-sm
                        focus:outline-none focus:ring-2 focus:ring-blue-500">
        </div>
        <div>
          <label for="ods-tag" class="block text-xs font-medium text-slate-700 mb-1">Tag / Materia</label>
          <select id="ods-tag" x-model="formTag"
                  class="w-full border border-slate-300 rounded-md px-3 py-2 text-sm bg-white
                         focus:outline-none focus:ring-2 focus:ring-blue-500">
            <template x-for="t in _tagOds()" :key="t.valore">
              <option :value="t.valore" x-text="t.etichetta"></option>
            </template>
          </select>
        </div>
      </div>

      <!-- Tag personalizzato -->
      <div x-show="tagLibero">
        <label for="ods-tag-pers" class="block text-xs font-medium text-slate-700 mb-1">
          Specifica il tipo <span class="text-red-500">*</span>
        </label>
        <input id="ods-tag-pers" type="text"
               x-model="formTagPersonalizzato"
               placeholder="Descrivi il tipo di ODS"
               class="w-full border border-slate-300 rounded-md px-3 py-2 text-sm
                      focus:outline-none focus:ring-2 focus:ring-blue-500
                      placeholder:text-slate-400">
      </div>

      <!-- Oggetto -->
      <div>
        <label for="ods-oggetto" class="block text-xs font-medium text-slate-700 mb-1">
          Oggetto / Sintesi della disposizione
        </label>
        <input id="ods-oggetto" type="text"
               x-model="formOggetto"
               placeholder="Es. Sospensione lavorazioni in quota — tratto km 3+200/3+500"
               class="w-full border border-slate-300 rounded-md px-3 py-2 text-sm
                      focus:outline-none focus:ring-2 focus:ring-blue-500
                      placeholder:text-slate-400">
      </div>

      <!-- ── Campi specifici INVIATI ──────────────────────────────── -->
      <div x-show="sezioneAttiva === 'inviati'" class="space-y-3">

        <!-- Impresa destinataria -->
        <div>
          <label for="ods-impresa" class="block text-xs font-medium text-slate-700 mb-1">
            Impresa destinataria
            <span class="text-slate-400 font-normal">(da anagrafica, facoltativa)</span>
          </label>
          <select id="ods-impresa" x-model="formImpresaId"
                  class="w-full border border-slate-300 rounded-md px-3 py-2 text-sm bg-white
                         focus:outline-none focus:ring-2 focus:ring-blue-500">
            <option value="">— Nessuna impresa assegnata —</option>
            <template x-for="imp in _imprese()" :key="imp.id">
              <option :value="imp.id" x-text="imp.ragioneSociale"></option>
            </template>
          </select>
        </div>

        <!-- Flag riscontro -->
        <label class="flex items-center gap-2 cursor-pointer select-none text-sm text-slate-700">
          <input type="checkbox" x-model="formRichiedeRiscontro"
                 class="rounded border-slate-300 focus:ring-blue-500">
          Attende riscontro dall'impresa
        </label>
      </div>

      <!-- ── Campi specifici RICEVUTI ─────────────────────────────── -->
      <div x-show="sezioneAttiva === 'ricevuti'" class="space-y-3">

        <!-- Mittente -->
        <div>
          <label for="ods-mittente" class="block text-xs font-medium text-slate-700 mb-1">
            Mittente
            <span class="text-slate-400 font-normal">(DL, RUP, Committente…)</span>
          </label>
          <input id="ods-mittente" type="text"
                 x-model="formMittente"
                 placeholder="Es. Direzione Lavori — Ing. Rossi"
                 class="w-full border border-slate-300 rounded-md px-3 py-2 text-sm
                        focus:outline-none focus:ring-2 focus:ring-blue-500
                        placeholder:text-slate-400">
        </div>

        <!-- Flag adempimento -->
        <label class="flex items-center gap-2 cursor-pointer select-none text-sm text-slate-700">
          <input type="checkbox" x-model="formRichiedeAdempimento"
                 class="rounded border-slate-300 focus:ring-blue-500">
          Richiede adempimento da parte del CSE
        </label>
      </div>

      <!-- Descrizione -->
      <div>
        <div class="flex items-center justify-between mb-1">
          <label for="ods-desc" class="block text-xs font-medium text-slate-700">
            Descrizione / Note
          </label>
          <button @click="migliora()" type="button"
                  class="flex items-center gap-1 text-xs text-violet-600 hover:text-violet-800
                         px-2.5 py-1 rounded-lg border border-violet-200 hover:bg-violet-50
                         transition-colors focus:outline-none focus:ring-2 focus:ring-violet-400"
                  title="Apre il Correttore AI con questo testo — il campo resta invariato">
            &#x2728; Migliora con l'AI
          </button>
        </div>
        <textarea id="ods-desc" rows="3"
                  x-model="formDescrizione"
                  placeholder="Dettagli aggiuntivi, contesto, note del CSE…"
                  class="w-full border border-slate-300 rounded-md px-3 py-2 text-sm resize-none
                         focus:outline-none focus:ring-2 focus:ring-blue-500
                         placeholder:text-slate-400"></textarea>
      </div>

      <!-- File PDF -->
      <div>
        <div class="flex items-center justify-between mb-1">
          <label class="text-xs font-medium text-slate-700">
            File PDF
            <span class="text-slate-400 font-normal">(documento ODS)</span>
          </label>
          <label class="cursor-pointer text-xs text-blue-600 hover:text-blue-800
                        focus-within:ring-2 focus-within:ring-blue-400 rounded">
            <input type="file" accept=".pdf" class="sr-only" @change="onFileSelezionato($event)">
            <span x-text="formFilename ? 'Sostituisci PDF' : '📎 Allega PDF'"></span>
          </label>
        </div>

        <!-- Avviso file grande -->
        <div x-show="avvisoFileGrande"
             class="text-xs text-amber-700 bg-amber-50 border border-amber-200
                    rounded-md px-3 py-2 mb-2">
          ⚠ File grande — potrebbe rallentare il salvataggio. Caricato comunque.
        </div>

        <!-- File allegato -->
        <div x-show="formFilename" class="flex items-center gap-2 bg-slate-50 rounded-md px-3 py-2">
          <button x-show="formBase64" type="button"
                  @click="ALLEGATI.apriAllegato(formBase64, formFilename)"
                  class="text-xs text-blue-600 hover:text-blue-800 truncate text-left flex-1
                         focus:outline-none focus:ring-1 focus:ring-blue-400 rounded"
                  :title="formFilename" x-text="'📎 ' + formFilename"></button>
          <span x-show="!formBase64"
                class="text-xs text-slate-400 truncate flex-1" x-text="'📎 ' + formFilename"></span>
          <span x-show="formFileSize"
                class="text-xs text-slate-400 flex-shrink-0"
                x-text="_fmtBytes(formFileSize)"></span>
          <button type="button" @click="rimuoviFile()"
                  class="text-red-400 hover:text-red-600 flex-shrink-0 text-xs
                         focus:outline-none focus:ring-1 focus:ring-red-400 rounded"
                  title="Rimuovi file">×</button>
        </div>
        <p x-show="!formFilename" class="text-xs text-slate-400">Nessun file allegato.</p>
      </div>

      <!-- NC collegata -->
      <div>
        <label for="ods-nc" class="block text-xs font-medium text-slate-700 mb-1">
          NC collegata
          <span class="text-slate-400 font-normal">(ID opzionale, link unidirezionale)</span>
        </label>
        <input id="ods-nc" type="text"
               x-model="formNcCollegata"
               placeholder="ID non conformità (opzionale)"
               class="w-full border border-slate-300 rounded-md px-3 py-2 text-sm
                      focus:outline-none focus:ring-2 focus:ring-blue-500
                      placeholder:text-slate-400">
      </div>

      <!-- Testo AI -->
      <div>
        <label for="ods-ai" class="block text-xs font-medium text-slate-700 mb-1">
          Testo AI-ready
          <span class="text-slate-400 font-normal">(facoltativo — per interrogazioni future sull'archivio ODS)</span>
        </label>
        <textarea id="ods-ai" rows="2"
                  x-model="formTestoAi"
                  placeholder="Es. 'Dispone sospensione lavorazioni in quota fino a collaudo ponteggio facciata nord. Adempimento: 48h.'"
                  class="w-full border border-slate-300 rounded-md px-3 py-2 text-sm resize-none
                         focus:outline-none focus:ring-2 focus:ring-blue-500
                         placeholder:text-slate-400"></textarea>
      </div>

    </div><!-- /corpo -->

    <!-- footer fisso -->
    <div class="drawer-footer px-5 py-4 border-t border-slate-200 bg-slate-50">
      <p class="text-xs text-slate-400 mb-3">
        Il salvataggio non è bloccato. Nessun campo è obbligatorio.
      </p>
      <div class="flex gap-3 justify-end">
        <button @click="chiudiDrawer(false)"
                class="text-sm text-slate-500 hover:text-slate-700 px-4 py-2
                       border border-slate-300 rounded-lg transition-colors
                       focus:outline-none focus:ring-2 focus:ring-slate-400">
          Annulla
        </button>
        <button @click="salvaOds()" :disabled="salvando"
                class="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white
                       text-sm font-medium px-5 py-2 rounded-lg transition-colors
                       focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2">
          <span x-text="salvando ? 'Salvataggio…' : (formNuovo ? 'Aggiungi ODS' : 'Salva modifiche')"></span>
        </button>
      </div>
    </div>

  </div><!-- /drawer -->

</div>
`;

// Shorthand usato nel template per formattare i byte del file allegato
function _fmtBytes(bytes) { return _formataBytesOds(bytes ?? 0); }

// ── Registrazione ─────────────────────────────────────────────────────────────

window.MODULI_REGISTRATI = window.MODULI_REGISTRATI ?? {};
window.MODULI_REGISTRATI['ods'] = {
  monta(contenitore) { contenitore.innerHTML = _TEMPLATE_ODS; },
};
