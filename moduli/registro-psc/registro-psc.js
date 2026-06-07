/**
 * registro-psc.js — M23 Registro PSC.
 *
 * Sezione 1 — Corpus PSC:
 *   file unico 09_Registro-PSC/corpus_psc.json (lettura diretta, niente IDB).
 *   Pattern documenti_extra di imprese.js (soft-delete su modifica).
 *
 * Sezione 2 — Registro integrazioni:
 *   un file per integrazione in 09_Registro-PSC/<YYYY>/<MM>/<uuid>.json
 *   (cartelle anno/mese create al volo, stesso pattern di DIARIO_SERVICE).
 *   AI-ready: campo testo_ai predisposto per M26 (non ancora costruito).
 *
 * Pattern riusati: ALLEGATI.apriAllegato/scaricaAllegato, drawer (header/body/footer).
 */

'use strict';

// ── Costanti vocabolario ──────────────────────────────────────────────────────

/** Tag per i documenti del corpus PSC (Sezione 1). */
const TAG_PSC = [
  { valore: 'relazione_tecnica',      etichetta: 'Relazione tecnica' },
  { valore: 'prescrizioni_sicurezza', etichetta: 'Prescrizioni di sicurezza' },
  { valore: 'planimetria_cantiere',   etichetta: 'Planimetria di cantiere' },
  { valore: 'tavola_progetto',        etichetta: 'Tavola di progetto' },
  { valore: 'cronoprogramma',         etichetta: 'Cronoprogramma' },
  { valore: 'stima_costi',            etichetta: 'Stima dei costi' },
  { valore: 'analisi_rischi',         etichetta: 'Analisi dei rischi' },
  { valore: 'fascicolo_opera',        etichetta: "Fascicolo dell'opera" },
  { valore: 'altro',                  etichetta: 'Altro' },
];

/** Tag per le integrazioni al PSC (Sezione 2). */
const TAG_INTEGRAZIONI = [
  { valore: 'modifica_prescrizioni',    etichetta: 'Modifica prescrizioni' },
  { valore: 'aggiornamento_planimetria', etichetta: 'Aggiornamento planimetria' },
  { valore: 'revisione_cronoprogramma', etichetta: 'Revisione cronoprogramma' },
  { valore: 'nuovo_rischio',            etichetta: 'Nuovo rischio individuato' },
  { valore: 'modifica_organizzazione',  etichetta: 'Modifica organizzazione cantiere' },
  { valore: 'altro',                    etichetta: 'Altro' },
];

/** Soglia file grande: avviso gentile non bloccante sopra 10 MB. */
const _SOGLIA_FILE_GRANDE = 10 * 1024 * 1024;

// ── Helper file (condivisi tra le due sezioni) ────────────────────────────────

const _leggiFilePsc = (file) =>
  new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload  = (e) => resolve(e.target.result);
    r.onerror = ()  => reject(new Error('Lettura file non riuscita'));
    r.readAsDataURL(file);
  });

function _formataBytesPsc(bytes) {
  if (bytes >= 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  return Math.round(bytes / 1024) + ' KB';
}

// ── Helper export DOCX ────────────────────────────────────────────────────────

/** Intestazione standard per i documenti del Registro PSC. */
function _intestazionePsc(sottoTitolo) {
  const m   = IMPOSTAZIONI_SERVICE.modulo('registro-psc');
  const bad = new Set(['registro-psc', '']);
  const _ok = (v, def) => (!v || bad.has(v)) ? def : v;
  return {
    modulo_titolo:   _ok(m.titolo,   sottoTitolo),
    modulo_codice:   _ok(m.codice,   ''),
    modulo_versione: _ok(m.versione, ''),
    logo_aziendale:  IMPOSTAZIONI_SERVICE.logo()?.png_base64 ?? null,
  };
}

/** Download blob con link temporaneo. */
function _scaricaBlobPsc(blob, nome) {
  const url = URL.createObjectURL(blob);
  const a   = document.createElement('a');
  a.href = url; a.download = nome; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

/** Ultimi 5 anni di periodi mese/anno (per 'esporta tutto' del registro integrazioni). */
function _periodiTuttoPsc() {
  const anno = new Date().getFullYear();
  const out  = [];
  for (let dy = 0; dy <= 4; dy++) {
    for (let m = 1; m <= 12; m++) {
      out.push({ anno: String(anno - dy), mese: String(m).padStart(2, '0') });
    }
  }
  return out;
}

/** Periodi compresi nell'intervallo date ISO (da, a: 'YYYY-MM-DD'). */
function _periodiRangePsc(da, a) {
  if (!da || !a) return [];
  const cur = new Date(da + 'T12:00:00Z');
  const end = new Date(a  + 'T12:00:00Z');
  const out = [];
  while (cur <= end) {
    out.push({ anno: String(cur.getFullYear()), mese: String(cur.getMonth() + 1).padStart(2, '0') });
    cur.setUTCMonth(cur.getUTCMonth() + 1);
  }
  return out;
}

/**
 * Genera il corpo HTML per l'indice del Corpus PSC (Sezione 1).
 * Elenca i documenti per tag/descrizione/data — i PDF NON vengono incorporati,
 * si elenca solo il nome file (come il diario fa con i suoi allegati).
 */
async function generaCorpoHtmlCorpusPsc(documenti, { lotto = {}, cantiere_id = '' }) {
  const esc    = (s) => UTILS.escapeHtml(s ?? '');
  const p      = [];
  const cse    = IMPOSTAZIONI_SERVICE.cse();
  const firm   = IMPOSTAZIONI_SERVICE.firma();
  const cseImg = await _scalafirma(firm?.firma_png_base64 ?? null);

  // ── 1. Intestazione documento ─────────────────────────────────────────────
  const codCant  = esc(cantiere_id || lotto.id || '');
  const nomeCant = esc(lotto.nome ?? '');
  const commit   = esc(lotto.committente ?? '');

  p.push(`<p data-line="exact280"><strong>Cantiere:</strong> ${codCant}${nomeCant ? ' — ' + nomeCant : ''}</p>`);
  if (commit) p.push(`<p data-line="exact280"><strong>Committente:</strong> ${commit}</p>`);
  p.push(`<p data-line="exact280"><strong>Generato il:</strong> ${esc(UTILS.formatData(new Date().toISOString()))}</p>`);
  p.push(`<p data-after="200">&nbsp;</p>`);

  // ── 2. Elenco documenti (ordinati per tag, poi per data) ──────────────────
  const attivi = documenti.filter(d => !d._cestino);
  attivi.sort((a, b) => {
    if (a.tag !== b.tag) return (a.tag ?? '').localeCompare(b.tag ?? '');
    return (a.data ?? '').localeCompare(b.data ?? '');
  });

  if (attivi.length === 0) {
    p.push(`<p><em>Nessun documento nel corpus PSC.</em></p>`);
  }

  for (const doc of attivi) {
    const tagLbl = doc.tag === 'altro'
      ? esc(doc.tag_personalizzato || 'Altro')
      : esc(TAG_PSC.find(t => t.valore === doc.tag)?.etichetta ?? doc.tag);

    p.push(`<h3>${tagLbl}</h3>`);

    if (doc.descrizione?.trim()) {
      const righe = doc.descrizione.split('\n').map(r => esc(r)).join('<br>');
      p.push(`<p data-line="15">${righe}</p>`);
    }
    if (doc.data) {
      p.push(`<p><em>Data: ${esc(UTILS.formatData(doc.data + 'T12:00:00Z'))}</em></p>`);
    }
    // Nome file elencato — i PDF non si incorporano nel documento di indice
    if (doc.filename) {
      p.push(`<p><em>File: ${esc(doc.filename)}</em></p>`);
    }

    p.push(`<p data-after="120">&nbsp;</p>`);
  }

  // ── 3. Firma CSE in calce ─────────────────────────────────────────────────
  const pr      = 'data-indent="firma" data-align="center" style="padding-left:52%;text-align:center"';
  const cseNome = esc(cse?.nome_cognome ?? '');
  p.push(`<p data-before="300">&nbsp;</p>`);
  p.push(`<p ${pr}>Il Coordinatore per l'Esecuzione</p>`);
  if (cseNome) p.push(`<p ${pr}>${cseNome}</p>`);
  if (cseImg)  p.push(`<p ${pr}><img src="${cseImg}" alt="firma CSE"></p>`);
  p.push(`<p ${pr}>${esc(UTILS.formatData(new Date().toISOString()))}</p>`);

  return p.join('\n');
}

/**
 * Genera il corpo HTML per il registro delle integrazioni PSC (Sezione 2).
 * Ordine cronologico ascendente. Allegati elencati per nome, non incorporati.
 * testo_ai omesso dalla stampa (è campo AI-only, non destinato alla carta).
 */
async function generaCorpoHtmlIntegrazioniPsc(integrazioni, { lotto = {}, cantiere_id = '', periodLabel = '' }) {
  const esc    = (s) => UTILS.escapeHtml(s ?? '');
  const p      = [];
  const cse    = IMPOSTAZIONI_SERVICE.cse();
  const firm   = IMPOSTAZIONI_SERVICE.firma();
  const cseImg = await _scalafirma(firm?.firma_png_base64 ?? null);

  // ── 1. Intestazione documento ─────────────────────────────────────────────
  const codCant  = esc(cantiere_id || lotto.id || '');
  const nomeCant = esc(lotto.nome ?? '');
  const commit   = esc(lotto.committente ?? '');

  p.push(`<p data-line="exact280"><strong>Cantiere:</strong> ${codCant}${nomeCant ? ' — ' + nomeCant : ''}</p>`);
  if (commit) p.push(`<p data-line="exact280"><strong>Committente:</strong> ${commit}</p>`);
  p.push(`<p data-line="exact280"><strong>Periodo:</strong> ${esc(periodLabel)}</p>`);
  p.push(`<p data-line="exact280"><strong>Generato il:</strong> ${esc(UTILS.formatData(new Date().toISOString()))}</p>`);
  p.push(`<p data-after="200">&nbsp;</p>`);

  // ── 2. Voci in ordine cronologico ascendente ──────────────────────────────
  const ordinate = [...integrazioni].sort((a, b) =>
    (a.data ?? a.creato_il ?? '').localeCompare(b.data ?? b.creato_il ?? ''));

  if (ordinate.length === 0) {
    p.push(`<p><em>Nessuna integrazione nel periodo selezionato.</em></p>`);
  }

  for (const v of ordinate) {
    const dataFmt = esc(UTILS.formatData(v.data ? v.data + 'T12:00:00Z' : v.creato_il ?? ''));
    const tagLbl  = v.tag === 'altro'
      ? esc(v.tag_personalizzato || 'Altro')
      : esc(TAG_INTEGRAZIONI.find(t => t.valore === v.tag)?.etichetta ?? v.tag);

    p.push(`<h3>${dataFmt} — ${tagLbl}</h3>`);

    if (v.titolo?.trim()) p.push(`<p><strong>${esc(v.titolo)}</strong></p>`);

    if (v.descrizione?.trim()) {
      const righe = v.descrizione.split('\n').map(r => esc(r)).join('<br>');
      p.push(`<p data-line="15">${righe}</p>`);
    }

    const allegati = (v.allegati ?? []).filter(a => a.filename);
    if (allegati.length > 0) {
      p.push(`<p><em>Allegati: ${allegati.map(a => esc(a.filename)).join(', ')}</em></p>`);
    }

    p.push(`<p data-after="120">&nbsp;</p>`);
  }

  // ── 3. Firma CSE in calce ─────────────────────────────────────────────────
  const pr      = 'data-indent="firma" data-align="center" style="padding-left:52%;text-align:center"';
  const cseNome = esc(cse?.nome_cognome ?? '');
  p.push(`<p data-before="300">&nbsp;</p>`);
  p.push(`<p ${pr}>Il Coordinatore per l'Esecuzione</p>`);
  if (cseNome) p.push(`<p ${pr}>${cseNome}</p>`);
  if (cseImg)  p.push(`<p ${pr}><img src="${cseImg}" alt="firma CSE"></p>`);
  p.push(`<p ${pr}>${esc(UTILS.formatData(new Date().toISOString()))}</p>`);

  return p.join('\n');
}

// ── Service Sezione 1 — Corpus PSC ───────────────────────────────────────────

const CORPUS_PSC_SERVICE = (() => {

  const NOME_FILE = 'corpus_psc.json';

  const _getDir = async (cantiereId, crea = false) => {
    const root = FILESYSTEM.getHandleAttivo();
    if (!root) throw new Error('Filesystem non agganciato.');
    const dirCantiere = await root.getDirectoryHandle(cantiereId);
    return FILESYSTEM.navigaPercorso(dirCantiere, ['09_Registro-PSC'], crea);
  };

  const leggiCorpus = async (cantiereId) => {
    try {
      const dir = await _getDir(cantiereId);
      return await FILESYSTEM.leggiJson(dir, NOME_FILE);
    } catch (e) {
      if (e.name === 'NotFoundError') {
        return {
          tipo_file:     'corpus_psc',
          cantiere_id:   cantiereId,
          generato_il:   new Date().toISOString(),
          aggiornato_il: new Date().toISOString(),
          documenti:     [],
        };
      }
      throw e;
    }
  };

  const scriviCorpus = async (corpus) => {
    corpus.aggiornato_il = new Date().toISOString();
    const dir = await _getDir(corpus.cantiere_id, true);
    await FILESYSTEM.scriviJson(dir, NOME_FILE, corpus);
    return corpus;
  };

  return { leggiCorpus, scriviCorpus };

})();

// ── Service Sezione 2 — Integrazioni PSC ─────────────────────────────────────

const PSC_INTEGRAZIONI_SERVICE = (() => {

  /**
   * Handle di 09_Registro-PSC/<anno>/<mese>/ per il cantiere.
   * crea=true auto-crea le sottocartelle mancanti (al primo utilizzo del mese).
   */
  const _getDirMese = async (cantiereId, anno, mese, crea = false) => {
    const root = FILESYSTEM.getHandleAttivo();
    if (!root) throw new Error('Filesystem non agganciato.');
    return FILESYSTEM.navigaPercorso(
      await root.getDirectoryHandle(cantiereId),
      ['09_Registro-PSC', anno, mese],
      crea
    );
  };

  /** Schema vuoto per una nuova integrazione. */
  const creaVuota = (cantiereId) => {
    const ora  = new Date();
    const anno = String(ora.getFullYear());
    const mese = String(ora.getMonth() + 1).padStart(2, '0');
    return {
      id:                UTILS.uuid(),
      tipo_file:         'integrazione_psc',
      cantiere_id:       cantiereId ?? '',
      tag:               'modifica_prescrizioni',
      tag_personalizzato: null,
      titolo:            '',
      descrizione:       '',
      testo_ai:          null,
      data:              ora.toISOString().slice(0, 10),
      allegati:          [],
      _dir_anno:         anno,   // posizione fisica — immutabile dopo creazione
      _dir_mese:         mese,
      creato_il:         ora.toISOString(),
      aggiornato_il:     ora.toISOString(),
    };
  };

  /**
   * Scrive una nuova integrazione in 09_Registro-PSC/<_dir_anno>/<_dir_mese>/<id>.json.
   * Le cartelle vengono create al volo se non esistono.
   */
  const creaIntegrazione = async (voce) => {
    voce.aggiornato_il = new Date().toISOString();
    const dir = await _getDirMese(voce.cantiere_id, voce._dir_anno, voce._dir_mese, true);
    await FILESYSTEM.scriviJson(dir, `${voce.id}.json`, voce);
    return voce;
  };

  /** Riscrive un'integrazione nella sua posizione fisica. */
  const aggiornaIntegrazione = async (voce) => {
    voce.aggiornato_il = new Date().toISOString();
    const dir = await _getDirMese(voce.cantiere_id, voce._dir_anno, voce._dir_mese);
    await FILESYSTEM.scriviJson(dir, `${voce.id}.json`, voce);
    return voce;
  };

  /**
   * Legge le integrazioni (non cestinate) per i periodi indicati.
   * Ogni periodo è { anno: '2026', mese: '06' }.
   * Ordina per data discendente (più recente prima).
   */
  const leggiIntegrazioni = async (cantiereId, periodi) => {
    const risultati = [];
    for (const { anno, mese } of periodi) {
      let dir;
      try {
        dir = await _getDirMese(cantiereId, anno, mese, false);
      } catch (e) {
        if (e.name === 'NotFoundError') continue;
        throw e;
      }
      for await (const [nome, fh] of dir.entries()) {
        if (fh.kind !== 'file' || !nome.endsWith('.json')) continue;
        try {
          const v = await FILESYSTEM.leggiJson(dir, nome);
          // Esclude corpus_psc.json se finisse accidentalmente qui, e i cestinati
          if (v.tipo_file === 'integrazione_psc' && !v._cestino) risultati.push(v);
        } catch { /* salta file corrotto */ }
      }
    }
    risultati.sort((a, b) =>
      (b.data ?? b.creato_il ?? '').localeCompare(a.data ?? a.creato_il ?? '')
    );
    return risultati;
  };

  /** Soft-delete: aggiunge _cestino:true + _eliminato_il. */
  const cestinaIntegrazione = async (voce) => {
    const cestinata = {
      ...voce,
      _cestino:      true,
      _eliminato_il: new Date().toISOString(),
    };
    const dir = await _getDirMese(voce.cantiere_id, voce._dir_anno, voce._dir_mese);
    await FILESYSTEM.scriviJson(dir, `${voce.id}.json`, cestinata);
    return cestinata;
  };

  /** Ripristina: rimuove _cestino e _eliminato_il. */
  const ripristinaIntegrazione = async (voce) => {
    const { _cestino, _eliminato_il, ...ripristinata } = voce;
    ripristinata.aggiornato_il = new Date().toISOString();
    const dir = await _getDirMese(voce.cantiere_id, voce._dir_anno, voce._dir_mese);
    await FILESYSTEM.scriviJson(dir, `${voce.id}.json`, ripristinata);
    return ripristinata;
  };

  /** Eliminazione definitiva: rimuove fisicamente il file JSON. */
  const eliminaDefinitiva = async (voce) => {
    const dir = await _getDirMese(voce.cantiere_id, voce._dir_anno, voce._dir_mese);
    try {
      const fh = await dir.getFileHandle(`${voce.id}.json`);
      await fh.remove?.();
    } catch (e) {
      if (e.name !== 'NotFoundError') throw e;
    }
  };

  return { creaVuota, creaIntegrazione, leggiIntegrazioni, aggiornaIntegrazione,
           cestinaIntegrazione, ripristinaIntegrazione, eliminaDefinitiva };

})();

// ── Helper periodi (Sezione 2) ────────────────────────────────────────────────

/** Costruisce l'array di {anno, mese} da esaminare in base al filtro periodo. */
function _periodiIntDaFiltro(filtro) {
  const oggi  = new Date();
  const build = (d) => ({
    anno: String(d.getFullYear()),
    mese: String(d.getMonth() + 1).padStart(2, '0'),
  });

  if (filtro === 'mese_corrente')  return [build(oggi)];

  if (filtro === 'ultimi_3_mesi') {
    return [0, 1, 2].map(i => {
      const d = new Date(oggi);
      d.setMonth(d.getMonth() - i);
      return build(d);
    });
  }

  if (filtro === 'anno_corrente') {
    return Array.from({ length: 12 }, (_, i) => ({
      anno: String(oggi.getFullYear()),
      mese: String(i + 1).padStart(2, '0'),
    }));
  }

  if (filtro === 'anno_precedente') {
    return Array.from({ length: 12 }, (_, i) => ({
      anno: String(oggi.getFullYear() - 1),
      mese: String(i + 1).padStart(2, '0'),
    }));
  }

  return [build(oggi)];
}

// ── Componente Alpine ─────────────────────────────────────────────────────────

function RegistroPsc() {
  return {

    // ── Stato sezione corrente ───────────────────────────────────────────────
    sezioneAttiva: 'corpus',    // 'corpus' | 'integrazioni'
    _cantiereId:   null,

    // ── Sezione 1 — Corpus PSC ────────────────────────────────────────────────
    corpus:            null,
    caricamento:       true,
    erroreCaricamento: null,

    // Drawer Sezione 1
    drawerAperto:          false,
    formNuovo:             true,
    formId:                null,
    formTag:               'relazione_tecnica',
    formTagPersonalizzato: '',
    formDescrizione:       '',
    formData:              '',
    formFilename:          null,
    formBase64:            null,
    formFileSize:          null,
    formTestoAi:           '',
    salvando:              false,
    _modificato:           false,

    // ── Sezione 2 — Integrazioni PSC ─────────────────────────────────────────
    integrazioni:      [],
    caricamentoInt:    false,
    filtroPeriodoInt:  'mese_corrente',
    filtroTagInt:      '',
    cercaTestoInt:     '',
    mostraCestinoInt:  false,
    integrazioniCestino: [],
    caricamentoCestinoInt: false,

    // Drawer Sezione 2
    drawerIntAperto:          false,
    formIntNuova:             true,
    formIntId:                null,
    formIntDirAnno:           null,
    formIntDirMese:           null,
    formIntTag:               'modifica_prescrizioni',
    formIntTagPersonalizzato: '',
    formIntTitolo:            '',
    formIntDescrizione:       '',
    formIntData:              '',
    formIntTestoAi:           '',
    formIntAllegati:          [],   // [{filename, base64, _size?}]
    salvandoInt:              false,
    _modificatoInt:           false,

    // Export Sezione 1
    exportandoCorpus:      false,

    // Export Sezione 2
    exportandoInt:         false,
    exportIntPeriodoForm:  false,
    exportIntDa:           '',
    exportIntA:            '',

    // ── Computed ─────────────────────────────────────────────────────────────

    get documentiAttivi() {
      return (this.corpus?.documenti ?? []).filter(d => !d._cestino);
    },

    get tagLibero() { return this.formTag === 'altro'; },

    get avvisoFileGrande() {
      return this.formFileSize !== null && this.formFileSize > _SOGLIA_FILE_GRANDE;
    },

    get integrazioniFiltrate() {
      let voci = this.integrazioni;
      if (this.filtroTagInt)
        voci = voci.filter(v => v.tag === this.filtroTagInt);
      if (this.cercaTestoInt.trim()) {
        const t = this.cercaTestoInt.toLowerCase();
        voci = voci.filter(v =>
          (v.titolo      ?? '').toLowerCase().includes(t) ||
          (v.descrizione ?? '').toLowerCase().includes(t)
        );
      }
      return voci;
    },

    get tagLiberoInt() { return this.formIntTag === 'altro'; },

    /** True se almeno un allegato del form supera la soglia. */
    get avvisoFileGrandeInt() {
      return this.formIntAllegati.some(a => (a._size ?? 0) > _SOGLIA_FILE_GRANDE);
    },

    // ── Lifecycle ─────────────────────────────────────────────────────────────

    async init() {
      this._cantiereId = Alpine.store('cantiere')?.id;
      await this._carica();
      document.addEventListener('cantiere-cambiato', () => this._onCantiereChanged());
    },

    _onCantiereChanged() {
      const id = Alpine.store('cantiere')?.id;
      if (id === this._cantiereId) return;
      this._cantiereId = id;
      if (this.drawerAperto)    this.chiudiDrawer(true);
      if (this.drawerIntAperto) this.chiudiDrawerInt(true);
      this.integrazioni         = [];
      this.integrazioniCestino  = [];
      this.mostraCestinoInt     = false;
      this._carica();
    },

    /** Carica tutto: corpus (Sez.1) + integrazioni del periodo corrente (Sez.2). */
    async _carica() {
      const cantId = this._cantiereId;
      this.caricamento       = true;
      this.erroreCaricamento = null;
      this.corpus            = null;
      if (!cantId) { this.caricamento = false; return; }
      try {
        this.corpus = await CORPUS_PSC_SERVICE.leggiCorpus(cantId);
      } catch (err) {
        ERRORI.gestisciErrore('registro-psc/carica-corpus', err);
        this.erroreCaricamento = err.message ?? 'Errore di lettura corpus.';
      } finally {
        this.caricamento = false;
      }
      // Carica le integrazioni in parallelo (non bloccante sul corpus)
      this._caricaIntegrazioni();
    },

    // ── SEZIONE 1 — Corpus PSC ────────────────────────────────────────────────

    apriNuovoDoc() {
      this.formNuovo              = true;
      this.formId                 = null;
      this.formTag                = 'relazione_tecnica';
      this.formTagPersonalizzato  = '';
      this.formDescrizione        = '';
      this.formData               = '';
      this.formFilename           = null;
      this.formBase64             = null;
      this.formFileSize           = null;
      this.formTestoAi            = '';
      this._modificato            = false;
      this.drawerAperto           = true;
      this.$nextTick(() => document.getElementById('psc-tag')?.focus());
    },

    apriModificaDoc(doc) {
      this.formNuovo              = false;
      this.formId                 = doc.id;
      this.formTag                = doc.tag ?? 'relazione_tecnica';
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

    async onFileSelezionato(event) {
      const file = event.target.files?.[0];
      if (!file) return;
      this.formFilename = file.name;
      this.formFileSize = file.size;
      this.formBase64   = await _leggiFilePsc(file);
      this._modificato  = true;
      event.target.value = '';
    },

    rimuoviFile() {
      this.formFilename = null;
      this.formBase64   = null;
      this.formFileSize = null;
      this._modificato  = true;
    },

    async salvaDoc() {
      if (!this.corpus) return;
      if (this.formTag === 'altro' && !(this.formTagPersonalizzato ?? '').trim()) {
        NOTIFICHE.attenzione('Registro PSC', 'Specifica il tipo per il tag "Altro".');
        document.getElementById('psc-tag-personalizzato')?.focus();
        return;
      }
      this.salvando = true;
      try {
        if (this.formNuovo) {
          this.corpus.documenti.push({
            id:                UTILS.uuid(),
            tag:               this.formTag,
            tag_personalizzato: this.formTag === 'altro'
              ? (this.formTagPersonalizzato ?? '').trim() : null,
            descrizione:  this.formDescrizione.trim() || null,
            data:         this.formData || null,
            filename:     this.formFilename ?? null,
            base64:       this.formBase64 ?? null,
            testo_ai:     this.formTestoAi.trim() || null,
            creato_il:    new Date().toISOString(),
          });
        } else {
          // Soft-delete del vecchio + push aggiornato (pattern documenti_extra)
          const idx    = this.corpus.documenti.findIndex(d => d.id === this.formId && !d._cestino);
          const vecchio = idx >= 0 ? this.corpus.documenti[idx] : null;
          if (vecchio) {
            this.corpus.documenti[idx] = { ...vecchio, _cestino: true, _eliminato_il: new Date().toISOString() };
          }
          this.corpus.documenti.push({
            id:                this.formId,
            tag:               this.formTag,
            tag_personalizzato: this.formTag === 'altro'
              ? (this.formTagPersonalizzato ?? '').trim() : null,
            descrizione:   this.formDescrizione.trim() || null,
            data:          this.formData || null,
            filename:      this.formFilename ?? null,
            base64:        this.formBase64 ?? null,
            testo_ai:      this.formTestoAi.trim() || null,
            creato_il:     vecchio?.creato_il ?? new Date().toISOString(),
            _aggiornato_il: new Date().toISOString(),
          });
        }
        this.corpus.cantiere_id = this._cantiereId;
        await CORPUS_PSC_SERVICE.scriviCorpus(this.corpus);
        this.corpus = { ...this.corpus };
        NOTIFICHE.successo(this.formNuovo ? 'Documento PSC aggiunto' : 'Documento PSC aggiornato');
        this.chiudiDrawer(true);
      } catch (err) {
        ERRORI.gestisciErrore('registro-psc/salva-corpus', err);
      } finally {
        this.salvando = false;
      }
    },

    async cestinaDoc(doc) {
      if (!confirm('Spostare nel cestino questo documento PSC?')) return;
      try {
        const idx = this.corpus.documenti.findIndex(d => d.id === doc.id && !d._cestino);
        if (idx < 0) return;
        this.corpus.documenti[idx] = {
          ...this.corpus.documenti[idx],
          _cestino: true, _eliminato_il: new Date().toISOString(),
        };
        this.corpus.cantiere_id = this._cantiereId;
        await CORPUS_PSC_SERVICE.scriviCorpus(this.corpus);
        this.corpus = { ...this.corpus };
        NOTIFICHE.info('Documento spostato nel cestino');
      } catch (err) {
        ERRORI.gestisciErrore('registro-psc/cestina-corpus', err);
      }
    },

    // ── SEZIONE 2 — Integrazioni PSC ──────────────────────────────────────────

    async _caricaIntegrazioni() {
      const cantId = this._cantiereId;
      if (!cantId) { this.integrazioni = []; return; }
      this.caricamentoInt = true;
      try {
        const periodi = _periodiIntDaFiltro(this.filtroPeriodoInt);
        this.integrazioni = await PSC_INTEGRAZIONI_SERVICE.leggiIntegrazioni(cantId, periodi);
      } catch (err) {
        ERRORI.gestisciErrore('registro-psc/carica-integrazioni', err);
        this.integrazioni = [];
      } finally {
        this.caricamentoInt = false;
      }
    },

    async selezionaPeriodoInt(periodo) {
      this.filtroPeriodoInt = periodo;
      await this._caricaIntegrazioni();
    },

    apriNuovaIntegrazione() {
      const tmpl = PSC_INTEGRAZIONI_SERVICE.creaVuota(this._cantiereId);
      this.formIntNuova             = true;
      this.formIntId                = null;
      this.formIntDirAnno           = tmpl._dir_anno;
      this.formIntDirMese           = tmpl._dir_mese;
      this.formIntTag               = 'modifica_prescrizioni';
      this.formIntTagPersonalizzato = '';
      this.formIntTitolo            = '';
      this.formIntDescrizione       = '';
      this.formIntData              = tmpl.data;
      this.formIntTestoAi           = '';
      this.formIntAllegati          = [];
      this._modificatoInt           = false;
      this.drawerIntAperto          = true;
      this.$nextTick(() => document.getElementById('int-titolo')?.focus());
    },

    apriModificaIntegrazione(voce) {
      this.formIntNuova             = false;
      this.formIntId                = voce.id;
      this.formIntDirAnno           = voce._dir_anno;
      this.formIntDirMese           = voce._dir_mese;
      this.formIntTag               = voce.tag ?? 'modifica_prescrizioni';
      this.formIntTagPersonalizzato = voce.tag_personalizzato ?? '';
      this.formIntTitolo            = voce.titolo ?? '';
      this.formIntDescrizione       = voce.descrizione ?? '';
      this.formIntData              = voce.data ?? '';
      this.formIntTestoAi           = voce.testo_ai ?? '';
      // Copia allegati senza _size (non ricalcolabile da base64)
      this.formIntAllegati          = (voce.allegati ?? []).map(a => ({
        filename: a.filename, base64: a.base64,
      }));
      this._modificatoInt           = false;
      this.drawerIntAperto          = true;
    },

    chiudiDrawerInt(forza = false) {
      if (!forza && this._modificatoInt) {
        if (!confirm('Ci sono modifiche non salvate. Chiudere senza salvare?')) return;
      }
      this.drawerIntAperto = false;
      this._modificatoInt  = false;
    },

    async onIntFileSelezionato(event) {
      const files = Array.from(event.target.files ?? []);
      if (!files.length) return;
      for (const file of files) {
        const base64 = await _leggiFilePsc(file);
        this.formIntAllegati.push({ filename: file.name, base64, _size: file.size });
      }
      this.formIntAllegati = [...this.formIntAllegati];
      this._modificatoInt  = true;
      event.target.value   = '';
    },

    rimuoviAllegatoInt(idx) {
      this.formIntAllegati.splice(idx, 1);
      this.formIntAllegati = [...this.formIntAllegati];
      this._modificatoInt  = true;
    },

    async salvaIntegrazione() {
      if (!(this.formIntTitolo ?? '').trim()) {
        NOTIFICHE.attenzione('Integrazioni PSC', 'Il titolo è obbligatorio.');
        document.getElementById('int-titolo')?.focus();
        return;
      }
      if (this.formIntTag === 'altro' && !(this.formIntTagPersonalizzato ?? '').trim()) {
        NOTIFICHE.attenzione('Integrazioni PSC', 'Specifica il tipo per il tag "Altro".');
        document.getElementById('int-tag-personalizzato')?.focus();
        return;
      }

      this.salvandoInt = true;
      try {
        // Allegati: escludi il campo _size (non va nel JSON su disco)
        const allegatiPuliti = this.formIntAllegati.map(({ _size, ...rest }) => rest);

        if (this.formIntNuova) {
          const nuova = {
            id:                UTILS.uuid(),
            tipo_file:         'integrazione_psc',
            cantiere_id:       this._cantiereId,
            tag:               this.formIntTag,
            tag_personalizzato: this.formIntTag === 'altro'
              ? (this.formIntTagPersonalizzato ?? '').trim() : null,
            titolo:            this.formIntTitolo.trim(),
            descrizione:       this.formIntDescrizione.trim() || null,
            testo_ai:          this.formIntTestoAi.trim() || null,
            data:              this.formIntData || new Date().toISOString().slice(0, 10),
            allegati:          allegatiPuliti,
            _dir_anno:         this.formIntDirAnno,
            _dir_mese:         this.formIntDirMese,
            creato_il:         new Date().toISOString(),
            aggiornato_il:     new Date().toISOString(),
          };
          await PSC_INTEGRAZIONI_SERVICE.creaIntegrazione(nuova);
          // Inserisce in testa se rientra nel periodo attivo
          const periodi = _periodiIntDaFiltro(this.filtroPeriodoInt);
          const inPeriodo = periodi.some(p => p.anno === nuova._dir_anno && p.mese === nuova._dir_mese);
          if (inPeriodo) {
            this.integrazioni.unshift(nuova);
            this.integrazioni = [...this.integrazioni];
          }
          NOTIFICHE.successo('Integrazione aggiunta');
        } else {
          // Recupera il record corrente per conservare i campi fissi
          const corrente = this.integrazioni.find(v => v.id === this.formIntId) ?? {};
          const aggiornata = {
            ...corrente,
            tag:               this.formIntTag,
            tag_personalizzato: this.formIntTag === 'altro'
              ? (this.formIntTagPersonalizzato ?? '').trim() : null,
            titolo:            this.formIntTitolo.trim(),
            descrizione:       this.formIntDescrizione.trim() || null,
            testo_ai:          this.formIntTestoAi.trim() || null,
            data:              this.formIntData || corrente.data,
            allegati:          allegatiPuliti,
          };
          await PSC_INTEGRAZIONI_SERVICE.aggiornaIntegrazione(aggiornata);
          const idx = this.integrazioni.findIndex(v => v.id === this.formIntId);
          if (idx >= 0) { this.integrazioni[idx] = aggiornata; this.integrazioni = [...this.integrazioni]; }
          NOTIFICHE.successo('Integrazione aggiornata');
        }
        this.chiudiDrawerInt(true);
      } catch (err) {
        ERRORI.gestisciErrore('registro-psc/salva-integrazione', err);
      } finally {
        this.salvandoInt = false;
      }
    },

    async cestinaIntegrazione(voce) {
      if (!confirm('Spostare nel cestino questa integrazione?')) return;
      try {
        await PSC_INTEGRAZIONI_SERVICE.cestinaIntegrazione(voce);
        this.integrazioni = this.integrazioni.filter(v => v.id !== voce.id);
        if (this.mostraCestinoInt) await this._caricaCestinoInt();
        NOTIFICHE.info('Integrazione spostata nel cestino');
      } catch (err) {
        ERRORI.gestisciErrore('registro-psc/cestina-integrazione', err);
      }
    },

    async _caricaCestinoInt() {
      if (!this._cantiereId) return;
      this.caricamentoCestinoInt = true;
      try {
        // Scansiona anno corrente + precedente (ampio ma veloce su file locali)
        const periodi = _periodiIntDaFiltro('anno_corrente')
          .concat(_periodiIntDaFiltro('anno_precedente'));
        const root = FILESYSTEM.getHandleAttivo();
        const risultati = [];
        for (const { anno, mese } of periodi) {
          let dir;
          try {
            dir = await FILESYSTEM.navigaPercorso(
              await root.getDirectoryHandle(this._cantiereId),
              ['09_Registro-PSC', anno, mese], false
            );
          } catch (e) { if (e.name === 'NotFoundError') continue; throw e; }
          for await (const [nome, fh] of dir.entries()) {
            if (fh.kind !== 'file' || !nome.endsWith('.json')) continue;
            try {
              const v = await FILESYSTEM.leggiJson(dir, nome);
              if (v.tipo_file === 'integrazione_psc' && v._cestino) risultati.push(v);
            } catch { /* skip */ }
          }
        }
        risultati.sort((a, b) =>
          (b._eliminato_il ?? '').localeCompare(a._eliminato_il ?? ''));
        this.integrazioniCestino = risultati;
      } catch (err) {
        ERRORI.gestisciErrore('registro-psc/cestino-int', err);
      } finally {
        this.caricamentoCestinoInt = false;
      }
    },

    async toggleCestinoInt() {
      this.mostraCestinoInt = !this.mostraCestinoInt;
      if (this.mostraCestinoInt && this.integrazioniCestino.length === 0) {
        await this._caricaCestinoInt();
      }
    },

    async ripristinaIntegrazione(voce) {
      try {
        const ripristinata = await PSC_INTEGRAZIONI_SERVICE.ripristinaIntegrazione(voce);
        this.integrazioniCestino = this.integrazioniCestino.filter(v => v.id !== voce.id);
        const periodi = _periodiIntDaFiltro(this.filtroPeriodoInt);
        const inPeriodo = periodi.some(p => p.anno === ripristinata._dir_anno && p.mese === ripristinata._dir_mese);
        if (inPeriodo) { this.integrazioni.unshift(ripristinata); this.integrazioni = [...this.integrazioni]; }
        NOTIFICHE.successo('Integrazione ripristinata');
      } catch (err) {
        ERRORI.gestisciErrore('registro-psc/ripristina-integrazione', err);
      }
    },

    async eliminaIntegrazione(voce) {
      if (!confirm('Eliminare definitivamente questa integrazione? Non è reversibile.')) return;
      if (!confirm('Conferma eliminazione definitiva.')) return;
      try {
        await PSC_INTEGRAZIONI_SERVICE.eliminaDefinitiva(voce);
        this.integrazioniCestino = this.integrazioniCestino.filter(v => v.id !== voce.id);
        NOTIFICHE.successo('Eliminata definitivamente');
      } catch (err) {
        ERRORI.gestisciErrore('registro-psc/elimina-integrazione', err);
      }
    },

    // ── Helper UI (condivisi) ─────────────────────────────────────────────────

    tagEtichetta(tag, tagPersonalizzato, vocabolario) {
      if (tag === 'altro') return tagPersonalizzato || 'Altro';
      return (vocabolario ?? TAG_PSC).find(t => t.valore === tag)?.etichetta ?? tag;
    },

    _tagPsc()           { return TAG_PSC; },
    _tagIntegrazioni()  { return TAG_INTEGRAZIONI; },
    _formataBytes(bytes){ return _formataBytesPsc(bytes); },

    // ── Export Sezione 1 — Indice Corpus PSC ──────────────────────────────────

    async esportaCorpusPsc() {
      if (!this._cantiereId || !this.corpus) return;
      this.exportandoCorpus = true;
      try {
        const attivi = (this.corpus.documenti ?? []).filter(d => !d._cestino);
        const corpo  = await generaCorpoHtmlCorpusPsc(attivi, {
          lotto:       ANAGRAFICA_SERVICE.dati?.lotto ?? {},
          cantiere_id: this._cantiereId,
        });
        const out = await MOTORE_DOCX.generaDocumento({
          tipo:       'registro-psc',
          header:     _intestazionePsc('Indice del Piano di Sicurezza e Coordinamento'),
          corpo_html: corpo,
          formati:    { docx: true },
        });
        _scaricaBlobPsc(out.docxBlob, `registro-psc-corpus-${this._cantiereId}.docx`);
        NOTIFICHE.successo('Esportato', 'Indice corpus PSC scaricato.');
      } catch (err) {
        ERRORI.gestisciErrore('registro-psc/esporta-corpus', err);
      } finally {
        this.exportandoCorpus = false;
      }
    },

    // ── Export Sezione 2 — Registro Integrazioni PSC ──────────────────────────

    async esportaTutteIntegrazioni() {
      if (!this._cantiereId) return;
      this.exportandoInt = true;
      try {
        const tutte = await PSC_INTEGRAZIONI_SERVICE.leggiIntegrazioni(
          this._cantiereId, _periodiTuttoPsc()
        );
        const corpo = await generaCorpoHtmlIntegrazioniPsc(tutte, {
          lotto:       ANAGRAFICA_SERVICE.dati?.lotto ?? {},
          cantiere_id: this._cantiereId,
          periodLabel: 'Registro completo',
        });
        const out = await MOTORE_DOCX.generaDocumento({
          tipo:       'registro-psc',
          header:     _intestazionePsc('Registro integrazioni PSC'),
          corpo_html: corpo,
          formati:    { docx: true },
        });
        _scaricaBlobPsc(out.docxBlob, `registro-psc-integrazioni-${this._cantiereId}-completo.docx`);
        NOTIFICHE.successo('Esportato', `DOCX registro completo scaricato (${tutte.length} voci).`);
      } catch (err) {
        ERRORI.gestisciErrore('registro-psc/esporta-int-tutto', err);
      } finally {
        this.exportandoInt = false;
      }
    },

    async esportaPeriodoIntegrazioni() {
      if (!this._cantiereId || !this.exportIntDa || !this.exportIntA) {
        NOTIFICHE.attenzione('Export', 'Seleziona data inizio e data fine.');
        return;
      }
      if (this.exportIntDa > this.exportIntA) {
        NOTIFICHE.attenzione('Export', 'La data inizio deve essere prima della data fine.');
        return;
      }
      this.exportIntPeriodoForm = false;
      this.exportandoInt = true;
      try {
        const periodi  = _periodiRangePsc(this.exportIntDa, this.exportIntA);
        const tutte    = await PSC_INTEGRAZIONI_SERVICE.leggiIntegrazioni(this._cantiereId, periodi);
        // Raffina per data esatta (leggiIntegrazioni carica il mese intero)
        const daStr    = this.exportIntDa + 'T00:00:00.000Z';
        const aStr     = this.exportIntA  + 'T23:59:59.999Z';
        const filtrate = tutte.filter(v => {
          const dt = v.data ? v.data + 'T12:00:00Z' : (v.creato_il ?? '');
          return dt >= daStr && dt <= aStr;
        });
        const label = `dal ${UTILS.formatData(this.exportIntDa + 'T12:00:00Z')} al ${UTILS.formatData(this.exportIntA + 'T12:00:00Z')}`;
        const corpo = await generaCorpoHtmlIntegrazioniPsc(filtrate, {
          lotto:       ANAGRAFICA_SERVICE.dati?.lotto ?? {},
          cantiere_id: this._cantiereId,
          periodLabel: label,
        });
        const out = await MOTORE_DOCX.generaDocumento({
          tipo:       'registro-psc',
          header:     _intestazionePsc('Registro integrazioni PSC'),
          corpo_html: corpo,
          formati:    { docx: true },
        });
        _scaricaBlobPsc(out.docxBlob, `registro-psc-integrazioni-${this._cantiereId}-${this.exportIntDa}_${this.exportIntA}.docx`);
        NOTIFICHE.successo('Esportato', `DOCX periodo scaricato (${filtrate.length} voci).`);
      } catch (err) {
        ERRORI.gestisciErrore('registro-psc/esporta-int-periodo', err);
      } finally {
        this.exportandoInt = false;
      }
    },

    async esportaSingolaIntegrazione(voce) {
      this.exportandoInt = true;
      try {
        const corpo = await generaCorpoHtmlIntegrazioniPsc([voce], {
          lotto:       ANAGRAFICA_SERVICE.dati?.lotto ?? {},
          cantiere_id: this._cantiereId,
          periodLabel: UTILS.formatData(voce.data ? voce.data + 'T12:00:00Z' : voce.creato_il ?? ''),
        });
        const out = await MOTORE_DOCX.generaDocumento({
          tipo:       'registro-psc',
          header:     _intestazionePsc('Registro integrazioni PSC'),
          corpo_html: corpo,
          formati:    { docx: true },
        });
        _scaricaBlobPsc(out.docxBlob, `registro-psc-int-${this._cantiereId}-${voce.id.slice(0, 8)}.docx`);
        NOTIFICHE.successo('Esportato', 'DOCX integrazione scaricato.');
      } catch (err) {
        ERRORI.gestisciErrore('registro-psc/esporta-int-singola', err);
      } finally {
        this.exportandoInt = false;
      }
    },
  };
}

// ── Template HTML ─────────────────────────────────────────────────────────────

const _TEMPLATE_REGISTRO_PSC = `
<div x-data="RegistroPsc()" x-init="init()" class="max-w-4xl">

  <!-- === HEADER === -->
  <div class="flex items-center justify-between mb-4">
    <div>
      <h1 class="text-xl font-semibold text-slate-800">📄 Registro PSC</h1>
      <p class="text-xs text-slate-400 mt-0.5">Piano di Sicurezza e Coordinamento — corpus documenti e integrazioni</p>
    </div>
    <div class="flex gap-2">
      <button @click="apriNuovoDoc()"
              x-show="$store.cantiere.id && sezioneAttiva === 'corpus'"
              class="bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium
                     px-4 py-2 rounded-lg transition-colors
                     focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2">
        + Aggiungi documento PSC
      </button>
      <button @click="apriNuovaIntegrazione()"
              x-show="$store.cantiere.id && sezioneAttiva === 'integrazioni'"
              class="bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium
                     px-4 py-2 rounded-lg transition-colors
                     focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2">
        + Nuova integrazione
      </button>
    </div>
  </div>

  <!-- Nessun cantiere -->
  <div x-show="!$store.cantiere.id" class="placeholder-modulo">
    <div class="text-3xl" aria-hidden="true">📄</div>
    <p class="text-slate-500">Seleziona un cantiere per accedere al Registro PSC.</p>
  </div>

  <div x-show="$store.cantiere.id">

    <!-- === TAB SEZIONI === -->
    <div class="flex gap-1 mb-5 bg-slate-100 p-1 rounded-lg w-fit" role="tablist" aria-label="Sezioni Registro PSC">
      <button @click="sezioneAttiva = 'corpus'"
              :aria-selected="sezioneAttiva === 'corpus'" role="tab"
              :class="sezioneAttiva === 'corpus' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'"
              class="text-sm font-medium px-4 py-1.5 rounded-md transition-all focus:outline-none focus:ring-2 focus:ring-blue-400">
        Sezione 1 — Corpus PSC
      </button>
      <button @click="sezioneAttiva = 'integrazioni'; _caricaIntegrazioni()"
              :aria-selected="sezioneAttiva === 'integrazioni'" role="tab"
              :class="sezioneAttiva === 'integrazioni' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'"
              class="text-sm font-medium px-4 py-1.5 rounded-md transition-all focus:outline-none focus:ring-2 focus:ring-blue-400">
        Sezione 2 — Integrazioni
      </button>
    </div>

    <!-- ══════════════════════════════════════════════════
         SEZIONE 1: CORPUS PSC
         ══════════════════════════════════════════════════ -->
    <div x-show="sezioneAttiva === 'corpus'" role="region" aria-label="Corpus PSC">

      <div x-show="caricamento" class="flex items-center gap-3 py-10 text-slate-400 text-sm">
        <div class="w-5 h-5 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"
             role="status" aria-label="Caricamento"></div>
        Caricamento corpus PSC…
      </div>

      <div x-show="!caricamento && erroreCaricamento" role="alert"
           class="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700 mb-4">
        <strong>Errore di lettura:</strong> <span x-text="erroreCaricamento"></span>
      </div>

      <div x-show="!caricamento && !erroreCaricamento">

        <!-- === BARRA EXPORT CORPUS === -->
        <div class="flex flex-wrap items-center gap-2 mb-4">
          <span class="text-xs text-slate-400 font-medium">Stampa:</span>
          <button @click="esportaCorpusPsc()" :disabled="exportandoCorpus"
                  class="text-xs bg-white border border-slate-300 text-slate-600 hover:bg-slate-50
                         disabled:opacity-50 px-3 py-1.5 rounded-lg transition-colors
                         focus:outline-none focus:ring-2 focus:ring-slate-400">
            <span x-show="!exportandoCorpus">📥 Indice Corpus PSC</span>
            <span x-show="exportandoCorpus">⏳ Generazione…</span>
          </button>
        </div>

        <p x-show="documentiAttivi.length > 0" class="text-xs text-slate-400 mb-3"
           x-text="documentiAttivi.length + (documentiAttivi.length === 1 ? ' documento' : ' documenti') + ' nel corpus'"></p>

        <div x-show="documentiAttivi.length === 0" class="py-12 text-center text-slate-400">
          <div class="text-3xl mb-2" aria-hidden="true">📂</div>
          <p class="text-sm">Nessun documento PSC caricato.</p>
          <p class="text-xs mt-1">Clicca "+ Aggiungi documento PSC" per caricare relazione tecnica, prescrizioni, planimetrie e altri file del PSC.</p>
        </div>

        <div x-show="documentiAttivi.length > 0" role="list" aria-label="Documenti corpus PSC" class="space-y-2">
          <template x-for="doc in documentiAttivi" :key="doc.id">
            <article role="listitem" class="border border-slate-200 bg-white rounded-xl px-4 py-3 hover:border-slate-300 transition-all">

              <div class="flex items-center gap-2 mb-1.5 flex-wrap">
                <span class="text-xs bg-indigo-100 text-indigo-800 px-2 py-0.5 rounded-full font-medium flex-shrink-0"
                      x-text="tagEtichetta(doc.tag, doc.tag_personalizzato, _tagPsc())"></span>
                <span x-show="doc.data" class="text-xs text-slate-400 flex-shrink-0"
                      x-text="UTILS.formatData(doc.data + 'T12:00:00Z')"></span>
                <span x-show="doc.testo_ai" title="Testo per analisi AI presente"
                      class="text-xs bg-violet-100 text-violet-700 px-2 py-0.5 rounded-full flex-shrink-0">
                  🤖 testo AI ✓
                </span>
              </div>

              <p x-show="doc.descrizione" class="text-sm text-slate-700 leading-snug mb-1.5 line-clamp-2"
                 x-text="doc.descrizione"></p>

              <div class="flex items-center gap-2 flex-wrap pt-0.5">
                <button x-show="doc.base64" type="button"
                        @click="ALLEGATI.apriAllegato(doc.base64, doc.filename)"
                        class="text-xs text-blue-600 hover:text-blue-800 flex items-center gap-1
                               focus:outline-none focus:ring-1 focus:ring-blue-400 rounded"
                        :title="'Apri: ' + doc.filename">
                  📎 <span class="truncate max-w-[12rem]" x-text="doc.filename"></span>
                </button>
                <span x-show="!doc.base64 && doc.filename" class="text-xs text-slate-400 flex items-center gap-1">
                  📎 <span class="truncate max-w-[12rem]" x-text="doc.filename"></span>
                </span>
                <div class="ml-auto flex items-center gap-2 flex-shrink-0">
                  <button x-show="doc.base64" type="button"
                          @click="ALLEGATI.scaricaAllegato(doc.base64, doc.filename)"
                          class="text-xs text-slate-400 hover:text-blue-600 p-1.5 rounded-lg hover:bg-slate-50 transition-colors
                                 focus:outline-none focus:ring-2 focus:ring-slate-400" title="Scarica file">⬇</button>
                  <button type="button" @click="apriModificaDoc(doc)"
                          class="text-xs text-slate-600 hover:text-slate-900 px-3 py-1
                                 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors
                                 focus:outline-none focus:ring-2 focus:ring-slate-400"
                          :aria-label="'Modifica: ' + tagEtichetta(doc.tag, doc.tag_personalizzato, _tagPsc())">
                    ✏ Modifica
                  </button>
                  <button type="button" @click="cestinaDoc(doc)"
                          class="text-xs text-red-400 hover:text-red-700 p-1.5 rounded-lg hover:bg-red-50 transition-colors
                                 focus:outline-none focus:ring-2 focus:ring-red-400" title="Sposta nel cestino">🗑</button>
                </div>
              </div>

            </article>
          </template>
        </div>

      </div>
    </div>

    <!-- ══════════════════════════════════════════════════
         SEZIONE 2: INTEGRAZIONI PSC
         ══════════════════════════════════════════════════ -->
    <div x-show="sezioneAttiva === 'integrazioni'" role="region" aria-label="Registro integrazioni PSC">

      <!-- Caricamento -->
      <div x-show="caricamentoInt" class="flex items-center gap-3 py-10 text-slate-400 text-sm">
        <div class="w-5 h-5 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"
             role="status" aria-label="Caricamento"></div>
        Caricamento integrazioni…
      </div>

      <div x-show="!caricamentoInt">

        <!-- === BARRA EXPORT INTEGRAZIONI === -->
        <div class="flex flex-wrap items-center gap-2 mb-4">
          <span class="text-xs text-slate-400 font-medium">Esporta:</span>
          <button @click="esportaTutteIntegrazioni()" :disabled="exportandoInt"
                  class="text-xs bg-white border border-slate-300 text-slate-600 hover:bg-slate-50
                         disabled:opacity-50 px-3 py-1.5 rounded-lg transition-colors
                         focus:outline-none focus:ring-2 focus:ring-slate-400">
            <span x-show="!exportandoInt">📥 Tutto il registro</span>
            <span x-show="exportandoInt">⏳ Generazione…</span>
          </button>
          <button @click="exportIntPeriodoForm = !exportIntPeriodoForm" :disabled="exportandoInt"
                  :class="exportIntPeriodoForm ? 'bg-blue-50 border-blue-300 text-blue-700' : 'bg-white border-slate-300 text-slate-600'"
                  class="text-xs border hover:bg-slate-50 disabled:opacity-50 px-3 py-1.5
                         rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-blue-400">
            📅 Periodo…
          </button>
        </div>
        <!-- Form scelta periodo export (inline) -->
        <div x-show="exportIntPeriodoForm"
             class="mb-4 flex flex-wrap items-center gap-2 p-3 bg-blue-50 border border-blue-200 rounded-lg">
          <label class="text-xs text-slate-600">Dal
            <input type="date" x-model="exportIntDa"
                   class="ml-1 border border-slate-300 rounded px-2 py-1 text-xs
                          focus:outline-none focus:ring-2 focus:ring-blue-500">
          </label>
          <label class="text-xs text-slate-600">Al
            <input type="date" x-model="exportIntA"
                   class="ml-1 border border-slate-300 rounded px-2 py-1 text-xs
                          focus:outline-none focus:ring-2 focus:ring-blue-500">
          </label>
          <button @click="esportaPeriodoIntegrazioni()" :disabled="exportandoInt"
                  class="text-xs bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white
                         px-3 py-1.5 rounded-lg transition-colors
                         focus:outline-none focus:ring-2 focus:ring-blue-500">
            📥 Genera DOCX
          </button>
          <button @click="exportIntPeriodoForm = false"
                  class="text-xs text-slate-400 hover:text-slate-600 px-2 py-1 rounded
                         focus:outline-none focus:ring-1 focus:ring-slate-400">✕</button>
        </div>

        <!-- Filtri periodo -->
        <div class="flex flex-wrap gap-2 mb-4" role="group" aria-label="Periodo">
          <template x-for="[val, label] in [
            ['mese_corrente',   'Mese corrente'],
            ['ultimi_3_mesi',   'Ultimi 3 mesi'],
            ['anno_corrente',   'Anno corrente'],
            ['anno_precedente', 'Anno precedente']
          ]" :key="val">
            <button @click="selezionaPeriodoInt(val)"
                    :class="filtroPeriodoInt === val
                      ? 'bg-blue-600 text-white'
                      : 'bg-white text-slate-600 border border-slate-300 hover:bg-slate-50'"
                    class="text-xs px-3 py-1.5 rounded-full transition-colors
                           focus:outline-none focus:ring-2 focus:ring-blue-400"
                    x-text="label"></button>
          </template>
        </div>

        <!-- Barra filtri ricerca/tag -->
        <div class="flex flex-wrap gap-3 mb-4">
          <input type="search" x-model="cercaTestoInt"
                 placeholder="Cerca in titolo o descrizione…"
                 class="flex-1 min-w-48 border border-slate-300 rounded-md px-3 py-2 text-sm
                        focus:outline-none focus:ring-2 focus:ring-blue-500">
          <select x-model="filtroTagInt"
                  class="border border-slate-300 rounded-md px-3 py-2 text-sm
                         focus:outline-none focus:ring-2 focus:ring-blue-500">
            <option value="">Tutti i tipi</option>
            <template x-for="t in _tagIntegrazioni()" :key="t.valore">
              <option :value="t.valore" x-text="t.etichetta"></option>
            </template>
          </select>
        </div>

        <!-- Contatore -->
        <p x-show="integrazioniFiltrate.length > 0" class="text-xs text-slate-400 mb-3"
           x-text="integrazioniFiltrate.length + (integrazioniFiltrate.length === 1 ? ' integrazione' : ' integrazioni') + ' nel periodo'"></p>

        <!-- Lista vuota -->
        <div x-show="integrazioniFiltrate.length === 0 && !caricamentoInt"
             class="py-12 text-center text-slate-400">
          <div class="text-3xl mb-2" aria-hidden="true">📝</div>
          <p class="text-sm"
             x-text="(cercaTestoInt || filtroTagInt) ? 'Nessuna integrazione corrisponde ai filtri.' : 'Nessuna integrazione nel periodo selezionato.'"></p>
          <p x-show="!cercaTestoInt && !filtroTagInt" class="text-xs mt-1">
            Clicca "+ Nuova integrazione" per registrare un aggiornamento al PSC.
          </p>
        </div>

        <!-- Lista integrazioni -->
        <div x-show="integrazioniFiltrate.length > 0" role="list" aria-label="Integrazioni PSC" class="space-y-2">
          <template x-for="voce in integrazioniFiltrate" :key="voce.id">
            <article role="listitem" class="border border-slate-200 bg-white rounded-xl px-4 py-3 hover:border-slate-300 transition-all">

              <!-- Riga 1: tag + data + badge AI -->
              <div class="flex items-center gap-2 mb-1.5 flex-wrap">
                <span class="text-xs bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-full font-medium flex-shrink-0"
                      x-text="tagEtichetta(voce.tag, voce.tag_personalizzato, _tagIntegrazioni())"></span>
                <span x-show="voce.data" class="text-xs text-slate-400 flex-shrink-0"
                      x-text="UTILS.formatData(voce.data + 'T12:00:00Z')"></span>
                <span x-show="(voce.allegati ?? []).length > 0"
                      class="text-xs text-slate-400 flex-shrink-0"
                      x-text="'📎 ' + voce.allegati.length"></span>
                <span x-show="voce.testo_ai" title="Testo per analisi AI presente"
                      class="text-xs bg-violet-100 text-violet-700 px-2 py-0.5 rounded-full flex-shrink-0">
                  🤖 testo AI ✓
                </span>
              </div>

              <!-- Riga 2: titolo -->
              <p class="text-sm font-semibold text-slate-800 leading-snug mb-0.5" x-text="voce.titolo"></p>

              <!-- Riga 3: descrizione (excerpt) -->
              <p x-show="voce.descrizione" class="text-xs text-slate-500 line-clamp-2 mb-1.5"
                 x-text="voce.descrizione"></p>

              <!-- Riga 4: allegati + azioni -->
              <div class="flex items-center gap-2 flex-wrap pt-0.5">

                <!-- Allegati -->
                <template x-for="all in (voce.allegati ?? [])" :key="all.filename">
                  <button x-show="all.base64" type="button"
                          @click="ALLEGATI.apriAllegato(all.base64, all.filename)"
                          class="text-xs text-blue-600 hover:text-blue-800 flex items-center gap-0.5
                                 focus:outline-none focus:ring-1 focus:ring-blue-400 rounded"
                          :title="'Apri: ' + all.filename">
                    📎 <span class="truncate max-w-[8rem]" x-text="all.filename"></span>
                  </button>
                </template>

                <!-- Azioni -->
                <div class="ml-auto flex items-center gap-2 flex-shrink-0">
                  <!-- Scarica primo allegato (se esiste) -->
                  <template x-if="(voce.allegati ?? []).length > 0 && voce.allegati[0].base64">
                    <button type="button"
                            @click="ALLEGATI.scaricaAllegato(voce.allegati[0].base64, voce.allegati[0].filename)"
                            class="text-xs text-slate-400 hover:text-blue-600 p-1.5 rounded-lg
                                   hover:bg-slate-50 transition-colors focus:outline-none focus:ring-2 focus:ring-slate-400"
                            title="Scarica primo allegato">⬇</button>
                  </template>
                  <button type="button" @click="apriModificaIntegrazione(voce)"
                          class="text-xs text-slate-600 hover:text-slate-900 px-3 py-1
                                 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors
                                 focus:outline-none focus:ring-2 focus:ring-slate-400"
                          :aria-label="'Modifica: ' + voce.titolo">✏ Modifica</button>
                  <button type="button" @click="esportaSingolaIntegrazione(voce)" :disabled="exportandoInt"
                          class="text-xs text-slate-400 hover:text-slate-600 p-1.5 rounded-lg
                                 hover:bg-slate-50 disabled:opacity-40 transition-colors
                                 focus:outline-none focus:ring-2 focus:ring-slate-400"
                          :aria-label="'Esporta: ' + voce.titolo" title="Esporta questa integrazione">📥</button>
                  <button type="button" @click="cestinaIntegrazione(voce)"
                          class="text-xs text-red-400 hover:text-red-700 p-1.5 rounded-lg
                                 hover:bg-red-50 transition-colors focus:outline-none focus:ring-2 focus:ring-red-400"
                          :aria-label="'Cestina: ' + voce.titolo" title="Sposta nel cestino">🗑</button>
                </div>

              </div>

            </article>
          </template>
        </div>

        <!-- Cestino integrazioni -->
        <div class="mt-6">
          <button @click="toggleCestinoInt()"
                  class="text-xs text-slate-400 hover:text-slate-600 underline
                         focus:outline-none focus:ring-2 focus:ring-slate-400 rounded">
            <span x-text="(mostraCestinoInt ? '▾ Nascondi' : '▸ Mostra') + ' cestino integrazioni'"></span>
          </button>
          <div x-show="mostraCestinoInt" class="mt-3">
            <div x-show="caricamentoCestinoInt" class="text-xs text-slate-400 py-2">Caricamento…</div>
            <div x-show="!caricamentoCestinoInt && integrazioniCestino.length === 0"
                 class="text-xs text-slate-400 mt-2">Il cestino è vuoto.</div>
            <div class="space-y-2 mt-2">
              <template x-for="voce in integrazioniCestino" :key="voce.id">
                <div class="border border-slate-200 bg-slate-50 rounded-xl px-4 py-2.5
                            flex items-center gap-3 opacity-70 hover:opacity-90 transition-opacity">
                  <div class="flex-1 min-w-0">
                    <span class="text-xs text-slate-500 line-through" x-text="voce.titolo"></span>
                    <span class="text-xs text-slate-400 ml-2" x-text="UTILS.formatData(voce._eliminato_il)"></span>
                  </div>
                  <div class="flex gap-2 flex-shrink-0">
                    <button @click="ripristinaIntegrazione(voce)"
                            class="text-xs text-green-700 px-2 py-1 border border-green-300
                                   rounded-lg hover:bg-green-50 transition-colors
                                   focus:outline-none focus:ring-2 focus:ring-green-400">
                      ↩ Ripristina
                    </button>
                    <button @click="eliminaIntegrazione(voce)"
                            class="text-xs text-red-500 px-2 py-1 rounded-lg hover:bg-red-50 transition-colors
                                   focus:outline-none focus:ring-2 focus:ring-red-400">
                      Elimina definitivamente
                    </button>
                  </div>
                </div>
              </template>
            </div>
          </div>
        </div>

      </div><!-- /!caricamentoInt -->
    </div>

  </div><!-- /$store.cantiere.id -->


  <!-- ═══════════════════════════════════════════════════════════
       DRAWER SEZIONE 1: Aggiungi / Modifica documento PSC corpus
       ═══════════════════════════════════════════════════════════ -->
  <div x-show="drawerAperto" x-cloak
       class="drawer-backdrop" @click.self="chiudiDrawer(false)" aria-hidden="true"></div>

  <div x-show="drawerAperto" x-cloak
       @input="_modificato = true"
       @keydown.escape.window="chiudiDrawer(false)"
       class="drawer" role="dialog" aria-modal="true"
       :aria-label="formNuovo ? 'Aggiungi documento PSC' : 'Modifica documento PSC'">

    <div class="drawer-header flex items-center justify-between px-5 py-4 border-b border-slate-200 bg-white">
      <h2 class="text-base font-semibold text-slate-800"
          x-text="formNuovo ? 'Aggiungi documento PSC' : 'Modifica documento PSC'"></h2>
      <button @click="chiudiDrawer(false)" aria-label="Chiudi"
              class="p-1.5 rounded hover:bg-slate-100 text-slate-500 text-lg
                     focus:outline-none focus:ring-2 focus:ring-slate-400">✕</button>
    </div>

    <div class="drawer-body px-5 py-4 space-y-5">

      <div>
        <label for="psc-tag" class="block text-xs font-medium text-slate-700 mb-1">
          Tipo documento <span class="text-red-500">*</span>
        </label>
        <select id="psc-tag" x-model="formTag"
                class="w-full border border-slate-300 rounded-md px-3 py-2 text-sm
                       focus:outline-none focus:ring-2 focus:ring-blue-500">
          <template x-for="t in _tagPsc()" :key="t.valore">
            <option :value="t.valore" x-text="t.etichetta"></option>
          </template>
        </select>
      </div>

      <div x-show="tagLibero">
        <label for="psc-tag-personalizzato" class="block text-xs font-medium text-slate-700 mb-1">
          Specifica il tipo <span class="text-red-500">*</span>
        </label>
        <input id="psc-tag-personalizzato" type="text" x-model="formTagPersonalizzato"
               placeholder="Es. Quadro Incidenti, Piano Emergenze…"
               class="w-full border border-slate-300 rounded-md px-3 py-2 text-sm
                      focus:outline-none focus:ring-2 focus:ring-blue-500">
      </div>

      <div>
        <label for="psc-descrizione" class="block text-xs font-medium text-slate-700 mb-1">
          Descrizione <span class="text-slate-400 font-normal">(opzionale)</span>
        </label>
        <textarea id="psc-descrizione" rows="3" x-model="formDescrizione"
                  placeholder="Scrivi cosa contiene questo documento: è il testo che l'assistente AI potrà leggere in futuro."
                  class="w-full border border-slate-300 rounded-md px-3 py-2 text-sm resize-none
                         focus:outline-none focus:ring-2 focus:ring-blue-500
                         placeholder:text-slate-400 placeholder:text-xs"></textarea>
      </div>

      <div>
        <label for="psc-data" class="block text-xs font-medium text-slate-700 mb-1">
          Data del documento <span class="text-slate-400 font-normal">(opzionale)</span>
        </label>
        <input id="psc-data" type="date" x-model="formData"
               class="border border-slate-300 rounded-md px-3 py-2 text-sm
                      focus:outline-none focus:ring-2 focus:ring-blue-500">
      </div>

      <div>
        <p class="text-xs font-medium text-slate-700 mb-1">
          File documento <span class="text-slate-400 font-normal">(PDF, PNG, JPG — opzionale)</span>
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
                         hover:bg-red-50 focus:outline-none focus:ring-1 focus:ring-red-400">× rimuovi</button>
        </div>
        <div x-show="avvisoFileGrande" role="status"
             class="mb-2 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2
                    text-xs text-amber-700 flex items-start gap-1.5">
          <span aria-hidden="true">⚠</span>
          <span>File grande (<strong x-text="_formataBytes(formFileSize)"></strong>): assicurati che OneDrive sia sincronizzato.</span>
        </div>
        <label class="flex items-center gap-2 cursor-pointer text-xs text-blue-600 hover:text-blue-800
                      border border-dashed border-slate-300 rounded-lg px-3 py-2.5
                      hover:bg-blue-50/40 transition-colors focus-within:ring-2 focus-within:ring-blue-500">
          <input type="file" accept=".pdf,.png,.jpg,.jpeg" class="sr-only" @change="onFileSelezionato($event)">
          <span x-text="formFilename ? '🔄 Sostituisci file…' : '📂 Scegli file…'"></span>
          <span x-show="formFileSize !== null" class="ml-auto text-slate-400" x-text="_formataBytes(formFileSize)"></span>
        </label>
      </div>

      <div>
        <label for="psc-testo-ai" class="block text-xs font-medium text-slate-700 mb-1">
          Testo per l'analisi AI <span class="text-slate-400 font-normal">(facoltativo)</span>
        </label>
        <textarea id="psc-testo-ai" rows="5" x-model="formTestoAi"
                  placeholder="Facoltativo: incolla qui il testo del documento per l'analisi AI futura. In seguito potrà essere estratto automaticamente dal PDF."
                  class="w-full border border-slate-300 rounded-md px-3 py-2 text-sm resize-y
                         focus:outline-none focus:ring-2 focus:ring-blue-500
                         placeholder:text-slate-400 placeholder:text-xs"></textarea>
        <p class="text-xs text-slate-400 mt-1">Il contenuto sarà disponibile all'assistente AI (M26). Non compare nei documenti esportati.</p>
      </div>

    </div>

    <div class="drawer-footer px-5 py-4 border-t border-slate-200 bg-white flex items-center justify-end gap-3">
      <button @click="chiudiDrawer(false)" :disabled="salvando"
              class="text-sm text-slate-600 hover:text-slate-800 px-4 py-2 border border-slate-300
                     rounded-lg hover:bg-slate-50 disabled:opacity-50 transition-colors
                     focus:outline-none focus:ring-2 focus:ring-slate-400">Annulla</button>
      <button @click="salvaDoc()" :disabled="salvando"
              class="text-sm bg-blue-600 hover:bg-blue-700 text-white font-medium px-5 py-2
                     rounded-lg disabled:opacity-50 transition-colors
                     focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2">
        <span x-show="!salvando" x-text="formNuovo ? 'Aggiungi' : 'Aggiorna'"></span>
        <span x-show="salvando">⏳ Salvataggio…</span>
      </button>
    </div>

  </div><!-- /drawer sez.1 -->


  <!-- ═══════════════════════════════════════════════════════════
       DRAWER SEZIONE 2: Aggiungi / Modifica integrazione PSC
       ═══════════════════════════════════════════════════════════ -->
  <div x-show="drawerIntAperto" x-cloak
       class="drawer-backdrop" @click.self="chiudiDrawerInt(false)" aria-hidden="true"></div>

  <div x-show="drawerIntAperto" x-cloak
       @input="_modificatoInt = true"
       @keydown.escape.window="chiudiDrawerInt(false)"
       class="drawer" role="dialog" aria-modal="true"
       :aria-label="formIntNuova ? 'Nuova integrazione PSC' : 'Modifica integrazione PSC'">

    <div class="drawer-header flex items-center justify-between px-5 py-4 border-b border-slate-200 bg-white">
      <h2 class="text-base font-semibold text-slate-800"
          x-text="formIntNuova ? 'Nuova integrazione PSC' : 'Modifica integrazione PSC'"></h2>
      <button @click="chiudiDrawerInt(false)" aria-label="Chiudi"
              class="p-1.5 rounded hover:bg-slate-100 text-slate-500 text-lg
                     focus:outline-none focus:ring-2 focus:ring-slate-400">✕</button>
    </div>

    <div class="drawer-body px-5 py-4 space-y-5">

      <!-- Tipo integrazione -->
      <div>
        <label for="int-tag" class="block text-xs font-medium text-slate-700 mb-1">
          Tipo integrazione <span class="text-red-500">*</span>
        </label>
        <select id="int-tag" x-model="formIntTag"
                class="w-full border border-slate-300 rounded-md px-3 py-2 text-sm
                       focus:outline-none focus:ring-2 focus:ring-blue-500">
          <template x-for="t in _tagIntegrazioni()" :key="t.valore">
            <option :value="t.valore" x-text="t.etichetta"></option>
          </template>
        </select>
      </div>

      <!-- Tag personalizzato -->
      <div x-show="tagLiberoInt">
        <label for="int-tag-personalizzato" class="block text-xs font-medium text-slate-700 mb-1">
          Specifica il tipo <span class="text-red-500">*</span>
        </label>
        <input id="int-tag-personalizzato" type="text" x-model="formIntTagPersonalizzato"
               placeholder="Es. Modifica procedure di emergenza, Nuovo corridoio di passaggio…"
               class="w-full border border-slate-300 rounded-md px-3 py-2 text-sm
                      focus:outline-none focus:ring-2 focus:ring-blue-500">
      </div>

      <!-- Titolo (obbligatorio) -->
      <div>
        <label for="int-titolo" class="block text-xs font-medium text-slate-700 mb-1">
          Titolo <span class="text-red-500">*</span>
        </label>
        <input id="int-titolo" type="text" x-model="formIntTitolo" maxlength="160"
               placeholder="Es. Aggiornamento layout dopo arrivo della seconda impresa"
               class="w-full border border-slate-300 rounded-md px-3 py-2 text-sm
                      focus:outline-none focus:ring-2 focus:ring-blue-500">
      </div>

      <!-- Descrizione -->
      <div>
        <label for="int-descrizione" class="block text-xs font-medium text-slate-700 mb-1">
          Descrizione <span class="text-slate-400 font-normal">(opzionale)</span>
        </label>
        <textarea id="int-descrizione" rows="3" x-model="formIntDescrizione"
                  placeholder="Descrivi cosa è cambiato e perché: è il testo che l'assistente AI potrà leggere in futuro."
                  class="w-full border border-slate-300 rounded-md px-3 py-2 text-sm resize-none
                         focus:outline-none focus:ring-2 focus:ring-blue-500
                         placeholder:text-slate-400 placeholder:text-xs"></textarea>
      </div>

      <!-- Data integrazione -->
      <div>
        <label for="int-data" class="block text-xs font-medium text-slate-700 mb-1">
          Data dell'integrazione
        </label>
        <input id="int-data" type="date" x-model="formIntData"
               class="border border-slate-300 rounded-md px-3 py-2 text-sm
                      focus:outline-none focus:ring-2 focus:ring-blue-500">
      </div>

      <!-- Allegati (multipli) -->
      <div>
        <div class="flex items-center justify-between mb-1">
          <p class="text-xs font-medium text-slate-700">
            Allegati <span class="text-slate-400 font-normal">(PDF, PNG, JPG — opzionali)</span>
          </p>
          <label class="cursor-pointer text-xs text-blue-600 hover:text-blue-800
                        focus-within:ring-2 focus-within:ring-blue-500 rounded">
            <input type="file" accept=".pdf,.png,.jpg,.jpeg" multiple class="sr-only"
                   @change="onIntFileSelezionato($event)">
            📎 Aggiungi file
          </label>
        </div>

        <div x-show="avvisoFileGrandeInt" role="status"
             class="mb-2 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2
                    text-xs text-amber-700 flex items-start gap-1.5">
          <span aria-hidden="true">⚠</span>
          <span>Uno o più file superano 10 MB: assicurati che OneDrive sia sincronizzato prima di salvare.</span>
        </div>

        <div x-show="formIntAllegati.length === 0" class="text-xs text-slate-400">Nessun allegato.</div>
        <ul class="space-y-1">
          <template x-for="(all, idx) in formIntAllegati" :key="idx">
            <li class="flex items-center gap-2 text-xs bg-slate-50 rounded-lg px-2.5 py-1.5">
              <button x-show="all.base64" type="button"
                      @click="ALLEGATI.apriAllegato(all.base64, all.filename)"
                      class="text-blue-700 hover:text-blue-900 truncate text-left flex-1
                             focus:outline-none focus:ring-1 focus:ring-blue-400 rounded"
                      :title="all.filename" x-text="'📎 ' + all.filename"></button>
              <span x-show="!all.base64" class="text-slate-400 truncate flex-1"
                    x-text="'📎 ' + all.filename"></span>
              <span x-show="all._size" class="text-slate-400 flex-shrink-0 ml-1"
                    x-text="_formataBytes(all._size ?? 0)"></span>
              <button x-show="all.base64" type="button"
                      @click="ALLEGATI.scaricaAllegato(all.base64, all.filename)"
                      class="text-slate-400 hover:text-blue-600 flex-shrink-0 p-0.5 rounded
                             focus:outline-none focus:ring-1 focus:ring-slate-400"
                      title="Scarica">⬇</button>
              <button type="button" @click="rimuoviAllegatoInt(idx)"
                      class="text-red-400 hover:text-red-700 flex-shrink-0 px-1 rounded
                             focus:outline-none focus:ring-1 focus:ring-red-400"
                      title="Rimuovi">×</button>
            </li>
          </template>
        </ul>
      </div>

      <!-- Testo per AI -->
      <div>
        <label for="int-testo-ai" class="block text-xs font-medium text-slate-700 mb-1">
          Testo per l'analisi AI <span class="text-slate-400 font-normal">(facoltativo)</span>
        </label>
        <textarea id="int-testo-ai" rows="4" x-model="formIntTestoAi"
                  placeholder="Facoltativo: incolla qui il testo dell'integrazione per l'analisi AI futura."
                  class="w-full border border-slate-300 rounded-md px-3 py-2 text-sm resize-y
                         focus:outline-none focus:ring-2 focus:ring-blue-500
                         placeholder:text-slate-400 placeholder:text-xs"></textarea>
        <p class="text-xs text-slate-400 mt-1">Il contenuto sarà disponibile all'assistente AI (M26). Non compare nella lista.</p>
      </div>

    </div>

    <div class="drawer-footer px-5 py-4 border-t border-slate-200 bg-white flex items-center justify-end gap-3">
      <button @click="chiudiDrawerInt(false)" :disabled="salvandoInt"
              class="text-sm text-slate-600 hover:text-slate-800 px-4 py-2 border border-slate-300
                     rounded-lg hover:bg-slate-50 disabled:opacity-50 transition-colors
                     focus:outline-none focus:ring-2 focus:ring-slate-400">Annulla</button>
      <button @click="salvaIntegrazione()" :disabled="salvandoInt"
              class="text-sm bg-blue-600 hover:bg-blue-700 text-white font-medium px-5 py-2
                     rounded-lg disabled:opacity-50 transition-colors
                     focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2">
        <span x-show="!salvandoInt" x-text="formIntNuova ? 'Aggiungi' : 'Aggiorna'"></span>
        <span x-show="salvandoInt">⏳ Salvataggio…</span>
      </button>
    </div>

  </div><!-- /drawer sez.2 -->

</div><!-- /RegistroPsc -->
`;

// ── Registrazione nel registry moduli ─────────────────────────────────────────

window.MODULI_REGISTRATI['registro-psc'] = {
  monta(contenitore) { contenitore.innerHTML = _TEMPLATE_REGISTRO_PSC; },
};
