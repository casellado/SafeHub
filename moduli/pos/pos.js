/**
 * pos.js — POS Imprese (Piano Operativo di Sicurezza per impresa).
 *
 * Sezione 1 — Corpus POS: 17_POS/<impresa_id>/pos_corpus.json
 * Sezione 2 — Integrazioni POS: 17_POS/<impresa_id>/integrazioni/<YYYY>/<MM>/<uuid>.json
 *
 * Le cartelle vengono create AL VOLO al primo salvataggio (crea=true).
 * Pattern: clonato da registro-psc.js, adattato per-impresa.
 * NESSUN Alpine.initTree — il MutationObserver di Alpine v3 inizializza da solo.
 */

'use strict';

// ── Vocabolario tag Corpus POS (Sezione 1) ────────────────────────────────────

const TAG_CORPUS_POS = [
  { valore: 'elaborato_tecnico',   etichetta: 'Elaborato tecnico' },
  { valore: 'misure_sicurezza',    etichetta: 'Misure di sicurezza' },
  { valore: 'layout_cantiere',     etichetta: 'Layout di cantiere' },
  { valore: 'schede_attrezzature', etichetta: 'Schede attrezzature' },
  { valore: 'sostanze_pericolose', etichetta: 'Sostanze pericolose' },
  { valore: 'piano_emergenza',     etichetta: 'Piano di emergenza' },
  { valore: 'valutazione_rumore',  etichetta: 'Valutazione del rumore' },
  { valore: 'altro',               etichetta: 'Altro' },
];

// ── Vocabolario tag Integrazioni POS (Sezione 2) ──────────────────────────────

const TAG_INTEGRAZIONI_POS = [
  { valore: 'aggiornamento_lavorazioni', etichetta: 'Aggiornamento lavorazioni' },
  { valore: 'nuova_attrezzatura',        etichetta: 'Nuova attrezzatura' },
  { valore: 'nuova_sostanza',            etichetta: 'Nuova sostanza' },
  { valore: 'modifica_squadra',          etichetta: 'Modifica squadra' },
  { valore: 'variante_operativa',        etichetta: 'Variante operativa' },
  { valore: 'recepimento_psc',           etichetta: 'Recepimento PSC' },
  { valore: 'altro',                     etichetta: 'Altro' },
];

// ── Note normative POS ────────────────────────────────────────────────────────

const NOTE_NORMATIVE_POS = [
  {
    titolo: "Cos’è il POS (art. 89 c.1 lett. h; art. 96; Allegato XV 3.2.1)",
    testo:  "Il POS è redatto da ciascuna impresa esecutrice in riferimento al singolo cantiere. Descrive le lavorazioni dell’impresa, le misure di sicurezza adottate, attrezzature, sostanze e gestione delle emergenze. È obbligatorio per ogni impresa esecutrice (non per i meri fornitori).",
  },
  {
    titolo: "Rapporto col PSC",
    testo:  "Il POS è di dettaglio e integrativo del PSC e deve essere coerente con esso: individua le misure integrative e le procedure complementari rispetto alle prescrizioni del PSC. Il confronto tra PSC e POS è un controllo centrale del CSE.",
  },
  {
    titolo: "Verifica del CSE (art. 92 c.1 lett. b)",
    testo:  "Il CSE verifica l’idoneità del POS, assicurandone la coerenza col PSC, prima dell’inizio dei lavori dell’impresa. Le verifiche e i loro esiti vanno documentati.",
  },
];

/** Soglia file grande: avviso gentile non bloccante sopra 10 MB. */
const _SOGLIA_FILE_POS = 10 * 1024 * 1024;

// ── Helper file ───────────────────────────────────────────────────────────────

const _leggiFilePOS = (file) =>
  new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload  = (e) => resolve(e.target.result);
    r.onerror = ()  => reject(new Error('Lettura file non riuscita'));
    r.readAsDataURL(file);
  });

function _formataBytesPOS(bytes) {
  if (bytes >= 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  return Math.round(bytes / 1024) + ' KB';
}

// ── Helper periodi (Sezione 2) ────────────────────────────────────────────────

function _periodiIntPosDaFiltro(filtro) {
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

/** Ultimi 5 anni di periodi mese/anno (per 'esporta tutto' del registro integrazioni). */
function _periodiTuttoPos() {
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
function _periodiRangePos(da, a) {
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

/** Intestazione standard per i DOCX del modulo POS. */
function _intestazionePos(sottoTitolo) {
  const m   = IMPOSTAZIONI_SERVICE.modulo('pos-impresa');
  const bad = new Set(['pos-impresa', '']);
  const _ok = (v, def) => (!v || bad.has(v)) ? def : v;
  return {
    modulo_titolo:   _ok(m.titolo,   sottoTitolo),
    modulo_codice:   _ok(m.codice,   ''),
    modulo_versione: _ok(m.versione, ''),
    logo_aziendale:  IMPOSTAZIONI_SERVICE.logo()?.png_base64 ?? null,
  };
}

/** Download blob con link temporaneo. */
function _scaricaBlobPos(blob, nome) {
  const url = URL.createObjectURL(blob);
  const a   = document.createElement('a');
  a.href = url; a.download = nome; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

/**
 * Corpo HTML per l'indice del Corpus POS (Sezione 1).
 * Elenca i documenti per tag/descrizione/data/nome file.
 * I PDF NON sono incorporati — solo il nome (attestazione dell'esistenza).
 */
async function generaCorpoHtmlCorpusPos(documenti, { lotto = {}, cantiere_id = '', impresa_nome = '' }) {
  const esc    = (s) => UTILS.escapeHtml(s ?? '');
  const p      = [];
  const cse    = IMPOSTAZIONI_SERVICE.cse();
  const firm   = IMPOSTAZIONI_SERVICE.firma();
  const cseImg = await _scalafirma(firm?.firma_png_base64 ?? null);

  // ── Intestazione ──────────────────────────────────────────────────────────────
  const codCant  = esc(cantiere_id || lotto.id || '');
  const nomeCant = esc(lotto.nome ?? '');
  const commit   = esc(lotto.committente ?? '');

  p.push(`<p data-line="exact280"><strong>Cantiere:</strong> ${codCant}${nomeCant ? ' — ' + nomeCant : ''}</p>`);
  if (commit)      p.push(`<p data-line="exact280"><strong>Committente:</strong> ${commit}</p>`);
  if (impresa_nome) p.push(`<p data-line="exact280"><strong>Impresa:</strong> ${esc(impresa_nome)}</p>`);
  p.push(`<p data-line="exact280"><strong>Generato il:</strong> ${esc(UTILS.formatData(new Date().toISOString()))}</p>`);
  p.push(`<p data-after="200">&nbsp;</p>`);

  // ── Elenco documenti (ordinati per tag, poi per data) ─────────────────────────
  const attivi = documenti.filter(d => !d._cestino);
  attivi.sort((a, b) => {
    if (a.tag !== b.tag) return (a.tag ?? '').localeCompare(b.tag ?? '');
    return (a.data ?? '').localeCompare(b.data ?? '');
  });

  if (attivi.length === 0) {
    p.push(`<p><em>Nessun documento nel corpus POS.</em></p>`);
  }

  for (const doc of attivi) {
    const tagLbl = doc.tag === 'altro'
      ? esc(doc.tag_personalizzato || 'Altro')
      : esc(TAG_CORPUS_POS.find(t => t.valore === doc.tag)?.etichetta ?? doc.tag);

    p.push(`<h3>${tagLbl}</h3>`);
    if (doc.descrizione?.trim()) {
      const righe = doc.descrizione.split('\n').map(r => esc(r)).join('<br>');
      p.push(`<p data-line="15">${righe}</p>`);
    }
    if (doc.data)     p.push(`<p><em>Data: ${esc(UTILS.formatData(doc.data + 'T12:00:00Z'))}</em></p>`);
    if (doc.filename) p.push(`<p><em>File: ${esc(doc.filename)}</em></p>`);
    p.push(`<p data-after="120">&nbsp;</p>`);
  }

  // ── Firma CSE in calce ────────────────────────────────────────────────────────
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
 * Corpo HTML per il registro delle integrazioni POS (Sezione 2).
 * Ordine cronologico ascendente. Allegati elencati per nome, non incorporati.
 * testo_ai omesso dalla stampa (campo AI-only).
 */
async function generaCorpoHtmlIntegrazioniPos(integrazioni, { lotto = {}, cantiere_id = '', impresa_nome = '', periodLabel = '' }) {
  const esc    = (s) => UTILS.escapeHtml(s ?? '');
  const p      = [];
  const cse    = IMPOSTAZIONI_SERVICE.cse();
  const firm   = IMPOSTAZIONI_SERVICE.firma();
  const cseImg = await _scalafirma(firm?.firma_png_base64 ?? null);

  // ── Intestazione ──────────────────────────────────────────────────────────────
  const codCant  = esc(cantiere_id || lotto.id || '');
  const nomeCant = esc(lotto.nome ?? '');
  const commit   = esc(lotto.committente ?? '');

  p.push(`<p data-line="exact280"><strong>Cantiere:</strong> ${codCant}${nomeCant ? ' — ' + nomeCant : ''}</p>`);
  if (commit)       p.push(`<p data-line="exact280"><strong>Committente:</strong> ${commit}</p>`);
  if (impresa_nome) p.push(`<p data-line="exact280"><strong>Impresa:</strong> ${esc(impresa_nome)}</p>`);
  p.push(`<p data-line="exact280"><strong>Periodo:</strong> ${esc(periodLabel)}</p>`);
  p.push(`<p data-line="exact280"><strong>Generato il:</strong> ${esc(UTILS.formatData(new Date().toISOString()))}</p>`);
  p.push(`<p data-after="200">&nbsp;</p>`);

  // ── Voci in ordine cronologico ascendente ─────────────────────────────────────
  const ordinate = [...integrazioni].sort((a, b) =>
    (a.data ?? a.creato_il ?? '').localeCompare(b.data ?? b.creato_il ?? ''));

  if (ordinate.length === 0) {
    p.push(`<p><em>Nessuna integrazione nel periodo selezionato.</em></p>`);
  }

  for (const v of ordinate) {
    const dataFmt = esc(UTILS.formatData(v.data ? v.data + 'T12:00:00Z' : v.creato_il ?? ''));
    const tagLbl  = v.tag === 'altro'
      ? esc(v.tag_personalizzato || 'Altro')
      : esc(TAG_INTEGRAZIONI_POS.find(t => t.valore === v.tag)?.etichetta ?? v.tag);

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

  // ── Firma CSE in calce ────────────────────────────────────────────────────────
  const pr      = 'data-indent="firma" data-align="center" style="padding-left:52%;text-align:center"';
  const cseNome = esc(cse?.nome_cognome ?? '');
  p.push(`<p data-before="300">&nbsp;</p>`);
  p.push(`<p ${pr}>Il Coordinatore per l'Esecuzione</p>`);
  if (cseNome) p.push(`<p ${pr}>${cseNome}</p>`);
  if (cseImg)  p.push(`<p ${pr}><img src="${cseImg}" alt="firma CSE"></p>`);
  p.push(`<p ${pr}>${esc(UTILS.formatData(new Date().toISOString()))}</p>`);

  return p.join('\n');
}

// ── Service — Corpus POS per impresa (Sezione 1) ─────────────────────────────

const CORPUS_POS_SERVICE = (() => {

  const NOME_FILE = 'pos_corpus.json';

  const _getDir = async (cantiereId, impresaId, crea = false) => {
    const root = FILESYSTEM.getHandleAttivo();
    if (!root) throw new Error('Filesystem non agganciato.');
    const dirCantiere = await root.getDirectoryHandle(cantiereId);
    return FILESYSTEM.navigaPercorso(dirCantiere, ['17_POS', impresaId], crea);
  };

  const leggiCorpus = async (cantiereId, impresaId) => {
    try {
      const dir = await _getDir(cantiereId, impresaId);
      return await FILESYSTEM.leggiJson(dir, NOME_FILE);
    } catch (e) {
      if (e.name === 'NotFoundError') {
        return {
          tipo_file:     'corpus_pos',
          cantiere_id:   cantiereId,
          impresa_id:    impresaId,
          impresa_nome:  '',
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
    const dir = await _getDir(corpus.cantiere_id, corpus.impresa_id, true);
    await FILESYSTEM.scriviJson(dir, NOME_FILE, corpus);
    return corpus;
  };

  return { leggiCorpus, scriviCorpus };

})();

// ── Service — Integrazioni POS per impresa (Sezione 2) ───────────────────────

const POS_INTEGRAZIONI_SERVICE = (() => {

  /**
   * Handle di 17_POS/<impresaId>/integrazioni/<anno>/<mese>/ per il cantiere.
   * crea=true auto-crea le sottocartelle mancanti.
   */
  const _getDirMese = async (cantiereId, impresaId, anno, mese, crea = false) => {
    const root = FILESYSTEM.getHandleAttivo();
    if (!root) throw new Error('Filesystem non agganciato.');
    return FILESYSTEM.navigaPercorso(
      await root.getDirectoryHandle(cantiereId),
      ['17_POS', impresaId, 'integrazioni', anno, mese],
      crea
    );
  };

  const creaVuota = (cantiereId, impresaId, impresaNome) => {
    const ora  = new Date();
    const anno = String(ora.getFullYear());
    const mese = String(ora.getMonth() + 1).padStart(2, '0');
    return {
      id:                UTILS.uuid(),
      tipo_file:         'integrazione_pos',
      cantiere_id:       cantiereId  ?? '',
      impresa_id:        impresaId   ?? '',
      impresa_nome:      impresaNome ?? '',
      tag:               'aggiornamento_lavorazioni',
      tag_personalizzato: null,
      titolo:            '',
      descrizione:       '',
      testo_ai:          null,
      data:              ora.toISOString().slice(0, 10),
      allegati:          [],
      _dir_anno:         anno,
      _dir_mese:         mese,
      creato_il:         ora.toISOString(),
      aggiornato_il:     ora.toISOString(),
    };
  };

  const creaIntegrazione = async (voce) => {
    voce.aggiornato_il = new Date().toISOString();
    const dir = await _getDirMese(voce.cantiere_id, voce.impresa_id, voce._dir_anno, voce._dir_mese, true);
    await FILESYSTEM.scriviJson(dir, `${voce.id}.json`, voce);
    return voce;
  };

  const aggiornaIntegrazione = async (voce) => {
    voce.aggiornato_il = new Date().toISOString();
    const dir = await _getDirMese(voce.cantiere_id, voce.impresa_id, voce._dir_anno, voce._dir_mese);
    await FILESYSTEM.scriviJson(dir, `${voce.id}.json`, voce);
    return voce;
  };

  const leggiIntegrazioni = async (cantiereId, impresaId, periodi) => {
    const risultati = [];
    for (const { anno, mese } of periodi) {
      let dir;
      try {
        dir = await _getDirMese(cantiereId, impresaId, anno, mese, false);
      } catch (e) {
        if (e.name === 'NotFoundError') continue;
        throw e;
      }
      for await (const [nome, fh] of dir.entries()) {
        if (fh.kind !== 'file' || !nome.endsWith('.json')) continue;
        try {
          const v = await FILESYSTEM.leggiJson(dir, nome);
          if (v.tipo_file === 'integrazione_pos' && !v._cestino) risultati.push(v);
        } catch { /* salta file corrotto */ }
      }
    }
    risultati.sort((a, b) =>
      (b.data ?? b.creato_il ?? '').localeCompare(a.data ?? a.creato_il ?? '')
    );
    return risultati;
  };

  const cestinaIntegrazione = async (voce) => {
    const cestinata = { ...voce, _cestino: true, _eliminato_il: new Date().toISOString() };
    const dir = await _getDirMese(voce.cantiere_id, voce.impresa_id, voce._dir_anno, voce._dir_mese);
    await FILESYSTEM.scriviJson(dir, `${voce.id}.json`, cestinata);
    return cestinata;
  };

  const ripristinaIntegrazione = async (voce) => {
    const { _cestino, _eliminato_il, ...ripristinata } = voce;
    ripristinata.aggiornato_il = new Date().toISOString();
    const dir = await _getDirMese(voce.cantiere_id, voce.impresa_id, voce._dir_anno, voce._dir_mese);
    await FILESYSTEM.scriviJson(dir, `${voce.id}.json`, ripristinata);
    return ripristinata;
  };

  const eliminaDefinitiva = async (voce) => {
    const dir = await _getDirMese(voce.cantiere_id, voce.impresa_id, voce._dir_anno, voce._dir_mese);
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

// ── Componente Alpine ─────────────────────────────────────────────────────────

function RegistroPOS() {
  return {

    // ── Stato ────────────────────────────────────────────────────────────────
    sezioneAttiva:  'corpus',
    _cantiereId:    null,
    noteAperte:     false,

    // Selettore impresa
    impresaSelezionata: null,  // { id, ragioneSociale }

    // Sezione 1 — Corpus POS
    corpus:            null,
    caricamento:       false,
    erroreCaricamento: null,

    // Drawer Sezione 1
    drawerAperto:          false,
    formNuovo:             true,
    formId:                null,
    formTag:               'elaborato_tecnico',
    formTagPersonalizzato: '',
    formDescrizione:       '',
    formData:              '',
    formFilename:          null,
    formBase64:            null,
    formFileSize:          null,
    formTestoAi:           '',
    salvando:              false,
    _modificato:           false,

    // Sezione 2 — Integrazioni POS
    integrazioni:             [],
    caricamentoInt:           false,
    filtroPeriodoInt:         'mese_corrente',
    filtroTagInt:             '',
    cercaTestoInt:            '',
    mostraCestinoInt:         false,
    integrazioniCestino:      [],
    caricamentoCestinoInt:    false,

    // Drawer Sezione 2
    drawerIntAperto:          false,
    formIntNuova:             true,
    formIntId:                null,
    formIntDirAnno:           null,
    formIntDirMese:           null,
    formIntTag:               'aggiornamento_lavorazioni',
    formIntTagPersonalizzato: '',
    formIntTitolo:            '',
    formIntDescrizione:       '',
    formIntData:              '',
    formIntTestoAi:           '',
    formIntAllegati:          [],
    salvandoInt:              false,
    _modificatoInt:           false,

    // Export Sezione 1
    exportandoCorpus:     false,

    // Export Sezione 2
    exportandoInt:        false,
    exportIntPeriodoForm: false,
    exportIntDa:          '',
    exportIntA:           '',

    // ── Computed ──────────────────────────────────────────────────────────────

    get notePos() { return NOTE_NORMATIVE_POS; },

    get imprese() {
      return ANAGRAFICA_SERVICE.get('imprese') ?? [];
    },

    get documentiAttivi() {
      return (this.corpus?.documenti ?? []).filter(d => !d._cestino);
    },

    get tagLibero() { return this.formTag === 'altro'; },

    get avvisoFileGrande() {
      return this.formFileSize !== null && this.formFileSize > _SOGLIA_FILE_POS;
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

    get avvisoFileGrandeInt() {
      return this.formIntAllegati.some(a => (a._size ?? 0) > _SOGLIA_FILE_POS);
    },

    // ── Lifecycle ──────────────────────────────────────────────────────────────

    async init() {
      this._cantiereId = Alpine.store('cantiere')?.id;
      document.addEventListener('cantiere-cambiato', () => this._onCantiereChanged());
    },

    _onCantiereChanged() {
      const id = Alpine.store('cantiere')?.id;
      if (id === this._cantiereId) return;
      this._cantiereId        = id;
      this.impresaSelezionata = null;
      this.corpus             = null;
      this.erroreCaricamento  = null;
      this.integrazioni         = [];
      this.integrazioniCestino  = [];
      this.mostraCestinoInt     = false;
      if (this.drawerAperto)    this.chiudiDrawer(true);
      if (this.drawerIntAperto) this.chiudiDrawerInt(true);
    },

    // ── Selettore impresa ──────────────────────────────────────────────────────

    async onImpresaChange(impresaId) {
      if (!impresaId) {
        this.impresaSelezionata  = null;
        this.corpus              = null;
        this.erroreCaricamento   = null;
        this.integrazioni        = [];
        this.integrazioniCestino = [];
        this.mostraCestinoInt    = false;
        return;
      }
      const imp = this.imprese.find(i => i.id === impresaId);
      if (!imp) return;
      this.impresaSelezionata  = { id: imp.id, ragioneSociale: imp.ragioneSociale ?? '' };
      this.integrazioni        = [];
      this.integrazioniCestino = [];
      this.mostraCestinoInt    = false;
      if (this.drawerAperto)    this.chiudiDrawer(true);
      if (this.drawerIntAperto) this.chiudiDrawerInt(true);
      await this._caricaCorpus();
      // Carica integrazioni del periodo corrente in parallelo (non bloccante)
      this._caricaIntegrazioni();
    },

    // ── Sezione 1 — Corpus POS ─────────────────────────────────────────────────

    async _caricaCorpus() {
      const cantId = this._cantiereId;
      const impId  = this.impresaSelezionata?.id;
      if (!cantId || !impId) { this.corpus = null; return; }

      this.caricamento       = true;
      this.erroreCaricamento = null;
      this.corpus            = null;
      try {
        const c = await CORPUS_POS_SERVICE.leggiCorpus(cantId, impId);
        c.impresa_nome = this.impresaSelezionata.ragioneSociale;
        this.corpus = c;
      } catch (err) {
        ERRORI.gestisciErrore('pos/carica-corpus', err);
        this.erroreCaricamento = err.message ?? 'Errore di lettura.';
      } finally {
        this.caricamento = false;
      }
    },

    apriNuovoDoc() {
      this.formNuovo              = true;
      this.formId                 = null;
      this.formTag                = 'elaborato_tecnico';
      this.formTagPersonalizzato  = '';
      this.formDescrizione        = '';
      this.formData               = '';
      this.formFilename           = null;
      this.formBase64             = null;
      this.formFileSize           = null;
      this.formTestoAi            = '';
      this._modificato            = false;
      this.drawerAperto           = true;
      this.$nextTick(() => document.getElementById('pos-tag')?.focus());
    },

    apriModificaDoc(doc) {
      this.formNuovo              = false;
      this.formId                 = doc.id;
      this.formTag                = doc.tag ?? 'elaborato_tecnico';
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
      this.formBase64   = await _leggiFilePOS(file);
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
        NOTIFICHE.attenzione('POS', 'Specifica il tipo per il tag "Altro".');
        document.getElementById('pos-tag-personalizzato')?.focus();
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
            descrizione: this.formDescrizione.trim() || null,
            data:        this.formData || null,
            filename:    this.formFilename ?? null,
            base64:      this.formBase64 ?? null,
            testo_ai:    this.formTestoAi.trim() || null,
            creato_il:   new Date().toISOString(),
          });
        } else {
          const idx     = this.corpus.documenti.findIndex(d => d.id === this.formId && !d._cestino);
          const vecchio = idx >= 0 ? this.corpus.documenti[idx] : null;
          if (vecchio) {
            this.corpus.documenti[idx] = {
              ...vecchio, _cestino: true, _eliminato_il: new Date().toISOString(),
            };
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
        this.corpus.impresa_nome = this.impresaSelezionata?.ragioneSociale ?? '';
        await CORPUS_POS_SERVICE.scriviCorpus(this.corpus);
        this.corpus = { ...this.corpus };
        NOTIFICHE.successo(this.formNuovo ? 'Documento POS aggiunto' : 'Documento POS aggiornato');
        this.chiudiDrawer(true);
      } catch (err) {
        ERRORI.gestisciErrore('pos/salva', err);
      } finally {
        this.salvando = false;
      }
    },

    async cestinaDoc(doc) {
      if (!confirm('Spostare nel cestino questo documento POS?')) return;
      try {
        const idx = this.corpus.documenti.findIndex(d => d.id === doc.id && !d._cestino);
        if (idx < 0) return;
        this.corpus.documenti[idx] = {
          ...this.corpus.documenti[idx],
          _cestino: true, _eliminato_il: new Date().toISOString(),
        };
        this.corpus.impresa_nome = this.impresaSelezionata?.ragioneSociale ?? '';
        await CORPUS_POS_SERVICE.scriviCorpus(this.corpus);
        this.corpus = { ...this.corpus };
        NOTIFICHE.info('Documento spostato nel cestino');
      } catch (err) {
        ERRORI.gestisciErrore('pos/cestina', err);
      }
    },

    // ── Sezione 2 — Integrazioni POS ──────────────────────────────────────────

    async _caricaIntegrazioni() {
      const cantId = this._cantiereId;
      const impId  = this.impresaSelezionata?.id;
      if (!cantId || !impId) { this.integrazioni = []; return; }
      this.caricamentoInt = true;
      try {
        const periodi = _periodiIntPosDaFiltro(this.filtroPeriodoInt);
        this.integrazioni = await POS_INTEGRAZIONI_SERVICE.leggiIntegrazioni(cantId, impId, periodi);
      } catch (err) {
        ERRORI.gestisciErrore('pos/carica-integrazioni', err);
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
      const tmpl = POS_INTEGRAZIONI_SERVICE.creaVuota(
        this._cantiereId,
        this.impresaSelezionata?.id,
        this.impresaSelezionata?.ragioneSociale,
      );
      this.formIntNuova             = true;
      this.formIntId                = null;
      this.formIntDirAnno           = tmpl._dir_anno;
      this.formIntDirMese           = tmpl._dir_mese;
      this.formIntTag               = 'aggiornamento_lavorazioni';
      this.formIntTagPersonalizzato = '';
      this.formIntTitolo            = '';
      this.formIntDescrizione       = '';
      this.formIntData              = tmpl.data;
      this.formIntTestoAi           = '';
      this.formIntAllegati          = [];
      this._modificatoInt           = false;
      this.drawerIntAperto          = true;
      this.$nextTick(() => document.getElementById('int-pos-titolo')?.focus());
    },

    apriModificaIntegrazione(voce) {
      this.formIntNuova             = false;
      this.formIntId                = voce.id;
      this.formIntDirAnno           = voce._dir_anno;
      this.formIntDirMese           = voce._dir_mese;
      this.formIntTag               = voce.tag ?? 'aggiornamento_lavorazioni';
      this.formIntTagPersonalizzato = voce.tag_personalizzato ?? '';
      this.formIntTitolo            = voce.titolo ?? '';
      this.formIntDescrizione       = voce.descrizione ?? '';
      this.formIntData              = voce.data ?? '';
      this.formIntTestoAi           = voce.testo_ai ?? '';
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
        const base64 = await _leggiFilePOS(file);
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
        NOTIFICHE.attenzione('Integrazioni POS', 'Il titolo è obbligatorio.');
        document.getElementById('int-pos-titolo')?.focus();
        return;
      }
      if (this.formIntTag === 'altro' && !(this.formIntTagPersonalizzato ?? '').trim()) {
        NOTIFICHE.attenzione('Integrazioni POS', 'Specifica il tipo per il tag "Altro".');
        document.getElementById('int-pos-tag-personalizzato')?.focus();
        return;
      }
      this.salvandoInt = true;
      try {
        const allegatiPuliti = this.formIntAllegati.map(({ _size, ...rest }) => rest);
        const impId   = this.impresaSelezionata?.id ?? '';
        const impNome = this.impresaSelezionata?.ragioneSociale ?? '';

        if (this.formIntNuova) {
          const nuova = {
            id:                UTILS.uuid(),
            tipo_file:         'integrazione_pos',
            cantiere_id:       this._cantiereId,
            impresa_id:        impId,
            impresa_nome:      impNome,
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
          await POS_INTEGRAZIONI_SERVICE.creaIntegrazione(nuova);
          const periodi   = _periodiIntPosDaFiltro(this.filtroPeriodoInt);
          const inPeriodo = periodi.some(p => p.anno === nuova._dir_anno && p.mese === nuova._dir_mese);
          if (inPeriodo) {
            this.integrazioni.unshift(nuova);
            this.integrazioni = [...this.integrazioni];
          }
          NOTIFICHE.successo('Integrazione POS aggiunta');
        } else {
          const corrente  = this.integrazioni.find(v => v.id === this.formIntId) ?? {};
          const aggiornata = {
            ...corrente,
            impresa_nome:  impNome,
            tag:           this.formIntTag,
            tag_personalizzato: this.formIntTag === 'altro'
              ? (this.formIntTagPersonalizzato ?? '').trim() : null,
            titolo:        this.formIntTitolo.trim(),
            descrizione:   this.formIntDescrizione.trim() || null,
            testo_ai:      this.formIntTestoAi.trim() || null,
            data:          this.formIntData || corrente.data,
            allegati:      allegatiPuliti,
          };
          await POS_INTEGRAZIONI_SERVICE.aggiornaIntegrazione(aggiornata);
          const idx = this.integrazioni.findIndex(v => v.id === this.formIntId);
          if (idx >= 0) { this.integrazioni[idx] = aggiornata; this.integrazioni = [...this.integrazioni]; }
          NOTIFICHE.successo('Integrazione POS aggiornata');
        }
        this.chiudiDrawerInt(true);
      } catch (err) {
        ERRORI.gestisciErrore('pos/salva-integrazione', err);
      } finally {
        this.salvandoInt = false;
      }
    },

    async cestinaIntegrazione(voce) {
      if (!confirm('Spostare nel cestino questa integrazione POS?')) return;
      try {
        await POS_INTEGRAZIONI_SERVICE.cestinaIntegrazione(voce);
        this.integrazioni = this.integrazioni.filter(v => v.id !== voce.id);
        if (this.mostraCestinoInt) await this._caricaCestinoInt();
        NOTIFICHE.info('Integrazione spostata nel cestino');
      } catch (err) {
        ERRORI.gestisciErrore('pos/cestina-integrazione', err);
      }
    },

    async _caricaCestinoInt() {
      const cantId = this._cantiereId;
      const impId  = this.impresaSelezionata?.id;
      if (!cantId || !impId) return;
      this.caricamentoCestinoInt = true;
      try {
        const periodi = _periodiIntPosDaFiltro('anno_corrente')
          .concat(_periodiIntPosDaFiltro('anno_precedente'));
        const root = FILESYSTEM.getHandleAttivo();
        const risultati = [];
        for (const { anno, mese } of periodi) {
          let dir;
          try {
            dir = await FILESYSTEM.navigaPercorso(
              await root.getDirectoryHandle(cantId),
              ['17_POS', impId, 'integrazioni', anno, mese], false
            );
          } catch (e) { if (e.name === 'NotFoundError') continue; throw e; }
          for await (const [nome, fh] of dir.entries()) {
            if (fh.kind !== 'file' || !nome.endsWith('.json')) continue;
            try {
              const v = await FILESYSTEM.leggiJson(dir, nome);
              if (v.tipo_file === 'integrazione_pos' && v._cestino) risultati.push(v);
            } catch { /* skip */ }
          }
        }
        risultati.sort((a, b) =>
          (b._eliminato_il ?? '').localeCompare(a._eliminato_il ?? ''));
        this.integrazioniCestino = risultati;
      } catch (err) {
        ERRORI.gestisciErrore('pos/cestino-int', err);
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
        const ripristinata = await POS_INTEGRAZIONI_SERVICE.ripristinaIntegrazione(voce);
        this.integrazioniCestino = this.integrazioniCestino.filter(v => v.id !== voce.id);
        const periodi   = _periodiIntPosDaFiltro(this.filtroPeriodoInt);
        const inPeriodo = periodi.some(p => p.anno === ripristinata._dir_anno && p.mese === ripristinata._dir_mese);
        if (inPeriodo) { this.integrazioni.unshift(ripristinata); this.integrazioni = [...this.integrazioni]; }
        NOTIFICHE.successo('Integrazione ripristinata');
      } catch (err) {
        ERRORI.gestisciErrore('pos/ripristina-integrazione', err);
      }
    },

    async eliminaIntegrazione(voce) {
      if (!confirm('Eliminare definitivamente questa integrazione? Non è reversibile.')) return;
      if (!confirm('Conferma eliminazione definitiva.')) return;
      try {
        await POS_INTEGRAZIONI_SERVICE.eliminaDefinitiva(voce);
        this.integrazioniCestino = this.integrazioniCestino.filter(v => v.id !== voce.id);
        NOTIFICHE.successo('Eliminata definitivamente');
      } catch (err) {
        ERRORI.gestisciErrore('pos/elimina-integrazione', err);
      }
    },

    // ── Export Sezione 1 — Indice Corpus POS ──────────────────────────────────

    async esportaCorpusPos() {
      if (!this._cantiereId || !this.corpus || !this.impresaSelezionata) return;
      this.exportandoCorpus = true;
      try {
        const attivi = (this.corpus.documenti ?? []).filter(d => !d._cestino);
        const corpo  = await generaCorpoHtmlCorpusPos(attivi, {
          lotto:        ANAGRAFICA_SERVICE.dati?.lotto ?? {},
          cantiere_id:  this._cantiereId,
          impresa_nome: this.impresaSelezionata.ragioneSociale,
        });
        const out = await MOTORE_DOCX.generaDocumento({
          tipo:       'pos-impresa',
          header:     _intestazionePos('Indice del Piano Operativo di Sicurezza'),
          corpo_html: corpo,
          formati:    { docx: true },
        });
        const impId = this.impresaSelezionata.id.slice(-8);
        _scaricaBlobPos(out.docxBlob, `pos-corpus-${this._cantiereId}-${impId}.docx`);
        NOTIFICHE.successo('Esportato', 'Indice corpus POS scaricato.');
      } catch (err) {
        ERRORI.gestisciErrore('pos/esporta-corpus', err);
      } finally {
        this.exportandoCorpus = false;
      }
    },

    // ── Export Sezione 2 — Registro Integrazioni POS ──────────────────────────

    async esportaTutteIntegrazioni() {
      if (!this._cantiereId || !this.impresaSelezionata) return;
      this.exportandoInt = true;
      try {
        const impId   = this.impresaSelezionata.id;
        const impNome = this.impresaSelezionata.ragioneSociale;
        const tutte   = await POS_INTEGRAZIONI_SERVICE.leggiIntegrazioni(
          this._cantiereId, impId, _periodiTuttoPos()
        );
        const corpo = await generaCorpoHtmlIntegrazioniPos(tutte, {
          lotto:        ANAGRAFICA_SERVICE.dati?.lotto ?? {},
          cantiere_id:  this._cantiereId,
          impresa_nome: impNome,
          periodLabel:  'Registro completo',
        });
        const out = await MOTORE_DOCX.generaDocumento({
          tipo:       'pos-impresa',
          header:     _intestazionePos('Registro integrazioni POS'),
          corpo_html: corpo,
          formati:    { docx: true },
        });
        _scaricaBlobPos(out.docxBlob,
          `pos-integrazioni-${this._cantiereId}-${impId.slice(-8)}-completo.docx`);
        NOTIFICHE.successo('Esportato', `DOCX registro completo scaricato (${tutte.length} voci).`);
      } catch (err) {
        ERRORI.gestisciErrore('pos/esporta-int-tutto', err);
      } finally {
        this.exportandoInt = false;
      }
    },

    async esportaPeriodoIntegrazioni() {
      if (!this._cantiereId || !this.impresaSelezionata) return;
      if (!this.exportIntDa || !this.exportIntA) {
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
        const impId   = this.impresaSelezionata.id;
        const impNome = this.impresaSelezionata.ragioneSociale;
        const periodi = _periodiRangePos(this.exportIntDa, this.exportIntA);
        const tutte   = await POS_INTEGRAZIONI_SERVICE.leggiIntegrazioni(
          this._cantiereId, impId, periodi
        );
        const daStr    = this.exportIntDa + 'T00:00:00.000Z';
        const aStr     = this.exportIntA  + 'T23:59:59.999Z';
        const filtrate = tutte.filter(v => {
          const dt = v.data ? v.data + 'T12:00:00Z' : (v.creato_il ?? '');
          return dt >= daStr && dt <= aStr;
        });
        const label = `dal ${UTILS.formatData(this.exportIntDa + 'T12:00:00Z')} al ${UTILS.formatData(this.exportIntA + 'T12:00:00Z')}`;
        const corpo = await generaCorpoHtmlIntegrazioniPos(filtrate, {
          lotto:        ANAGRAFICA_SERVICE.dati?.lotto ?? {},
          cantiere_id:  this._cantiereId,
          impresa_nome: impNome,
          periodLabel:  label,
        });
        const out = await MOTORE_DOCX.generaDocumento({
          tipo:       'pos-impresa',
          header:     _intestazionePos('Registro integrazioni POS'),
          corpo_html: corpo,
          formati:    { docx: true },
        });
        _scaricaBlobPos(out.docxBlob,
          `pos-integrazioni-${this._cantiereId}-${impId.slice(-8)}-${this.exportIntDa}_${this.exportIntA}.docx`);
        NOTIFICHE.successo('Esportato', `DOCX periodo scaricato (${filtrate.length} voci).`);
      } catch (err) {
        ERRORI.gestisciErrore('pos/esporta-int-periodo', err);
      } finally {
        this.exportandoInt = false;
      }
    },

    async esportaSingolaIntegrazione(voce) {
      if (!this._cantiereId || !this.impresaSelezionata) return;
      this.exportandoInt = true;
      try {
        const impNome = this.impresaSelezionata.ragioneSociale;
        const label   = UTILS.formatData(voce.data ? voce.data + 'T12:00:00Z' : voce.creato_il ?? '');
        const corpo   = await generaCorpoHtmlIntegrazioniPos([voce], {
          lotto:        ANAGRAFICA_SERVICE.dati?.lotto ?? {},
          cantiere_id:  this._cantiereId,
          impresa_nome: impNome,
          periodLabel:  label,
        });
        const out = await MOTORE_DOCX.generaDocumento({
          tipo:       'pos-impresa',
          header:     _intestazionePos('Registro integrazioni POS'),
          corpo_html: corpo,
          formati:    { docx: true },
        });
        _scaricaBlobPos(out.docxBlob,
          `pos-int-${this._cantiereId}-${voce.id.slice(0, 8)}.docx`);
        NOTIFICHE.successo('Esportato', 'DOCX integrazione scaricato.');
      } catch (err) {
        ERRORI.gestisciErrore('pos/esporta-int-singola', err);
      } finally {
        this.exportandoInt = false;
      }
    },

    // ── Helper UI ──────────────────────────────────────────────────────────────

    tagEtichetta(tag, tagPersonalizzato, vocabolario) {
      if (tag === 'altro') return tagPersonalizzato || 'Altro';
      return (vocabolario ?? TAG_CORPUS_POS).find(t => t.valore === tag)?.etichetta ?? tag;
    },

    _tagCorpusPOS()     { return TAG_CORPUS_POS; },
    _tagIntPos()        { return TAG_INTEGRAZIONI_POS; },
    _formataBytes(bytes){ return _formataBytesPOS(bytes); },
  };
}

// ── Template HTML ─────────────────────────────────────────────────────────────

const _TEMPLATE_POS = `
<div x-data="RegistroPOS()" x-init="init()" class="max-w-4xl">

  <!-- === HEADER === -->
  <div class="flex items-center justify-between mb-4">
    <div>
      <h1 class="text-xl font-semibold text-slate-800">📋 POS Imprese</h1>
      <p class="text-xs text-slate-400 mt-0.5">Piano Operativo di Sicurezza — per impresa (art. 96 D.Lgs 81/08)</p>
    </div>
    <div class="flex items-center gap-2">
      <button @click="noteAperte = !noteAperte"
              :aria-expanded="String(noteAperte)"
              class="text-xs text-sky-700 bg-sky-50 border border-sky-200
                     px-2.5 py-1 rounded-full hover:bg-sky-100 transition-colors
                     focus:outline-none focus:ring-2 focus:ring-sky-400">
        &#x2139; Note normative
      </button>
      <button @click="apriNuovoDoc()"
              x-show="$store.cantiere.id && impresaSelezionata && sezioneAttiva === 'corpus'"
              class="bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium
                     px-4 py-2 rounded-lg transition-colors
                     focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2">
        + Aggiungi documento POS
      </button>
      <button @click="apriNuovaIntegrazione()"
              x-show="$store.cantiere.id && impresaSelezionata && sezioneAttiva === 'integrazioni'"
              class="bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium
                     px-4 py-2 rounded-lg transition-colors
                     focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2">
        + Nuova integrazione
      </button>
    </div>
  </div>

  <!-- NOTE NORMATIVE -->
  <div x-show="noteAperte" x-transition class="nota-normativa-panel mb-4" role="note">
    <p class="text-xs text-sky-500 mb-2 italic">Promemoria per il CSE — non compare nel documento.</p>
    <template x-for="nota in notePos" :key="nota.titolo">
      <div><h4 x-text="nota.titolo"></h4><p x-text="nota.testo"></p></div>
    </template>
  </div>

  <!-- Nessun cantiere -->
  <div x-show="!$store.cantiere.id" class="placeholder-modulo">
    <div class="text-3xl" aria-hidden="true">📋</div>
    <p class="text-slate-500">Seleziona un cantiere per accedere ai POS delle imprese.</p>
  </div>

  <div x-show="$store.cantiere.id">

    <!-- === NESSUNA IMPRESA IN ANAGRAFICA === -->
    <div x-show="imprese.length === 0"
         class="nota-normativa-panel"
         role="status">
      <h4>Nessuna impresa in anagrafica</h4>
      <p>
        Prima di lavorare sui POS, aggiungi le imprese esecutrici in
        <strong>Anagrafiche → Imprese</strong>.
        Il POS è il piano operativo di sicurezza che ogni impresa esecutrice
        redige per il cantiere (art. 89/96, Allegato XV D.Lgs 81/08).
      </p>
    </div>

    <!-- === SELETTORE IMPRESA + CONTENUTO === -->
    <div x-show="imprese.length > 0">

      <!-- Selettore impresa -->
      <div class="mb-5">
        <label for="pos-selettore-impresa"
               class="block text-xs font-medium text-slate-700 mb-1">
          Impresa esecutrice
        </label>
        <select id="pos-selettore-impresa"
                @change="onImpresaChange($event.target.value)"
                class="w-full max-w-sm border border-slate-300 rounded-md px-3 py-2 text-sm
                       focus:outline-none focus:ring-2 focus:ring-blue-500">
          <option value="">— Seleziona l'impresa —</option>
          <template x-for="imp in imprese" :key="imp.id">
            <option :value="imp.id" x-text="imp.ragioneSociale"></option>
          </template>
        </select>
      </div>

      <!-- Nessuna impresa selezionata -->
      <div x-show="!impresaSelezionata"
           class="py-12 text-center text-slate-400">
        <div class="text-3xl mb-2" aria-hidden="true">📋</div>
        <p class="text-sm">Seleziona un'impresa per visualizzare il suo POS.</p>
      </div>

      <!-- === CONTENUTO PER IMPRESA SELEZIONATA === -->
      <div x-show="impresaSelezionata">

        <!-- Chip impresa corrente -->
        <div class="flex items-center gap-2 mb-4 px-3 py-2
                    bg-slate-50 border border-slate-200 rounded-lg w-fit">
          <span class="text-xs text-slate-500">Impresa:</span>
          <span class="text-sm font-semibold text-slate-800"
                x-text="impresaSelezionata?.ragioneSociale"></span>
        </div>

        <!-- === TAB SEZIONI === -->
        <div class="flex gap-1 mb-5 bg-slate-100 p-1 rounded-lg w-fit"
             role="tablist" aria-label="Sezioni POS">
          <button @click="sezioneAttiva = 'corpus'"
                  :aria-selected="sezioneAttiva === 'corpus'" role="tab"
                  :class="sezioneAttiva === 'corpus'
                    ? 'bg-white text-slate-800 shadow-sm'
                    : 'text-slate-500 hover:text-slate-700'"
                  class="text-sm font-medium px-4 py-1.5 rounded-md transition-all
                         focus:outline-none focus:ring-2 focus:ring-blue-400">
            Sezione 1 — POS di progetto
          </button>
          <button @click="sezioneAttiva = 'integrazioni'; _caricaIntegrazioni()"
                  :aria-selected="sezioneAttiva === 'integrazioni'" role="tab"
                  :class="sezioneAttiva === 'integrazioni'
                    ? 'bg-white text-slate-800 shadow-sm'
                    : 'text-slate-500 hover:text-slate-700'"
                  class="text-sm font-medium px-4 py-1.5 rounded-md transition-all
                         focus:outline-none focus:ring-2 focus:ring-blue-400">
            Sezione 2 — Integrazioni
          </button>
        </div>

        <!-- ══════════════════════════════════════════════════
             SEZIONE 1: POS DI PROGETTO (corpus)
             ══════════════════════════════════════════════════ -->
        <div x-show="sezioneAttiva === 'corpus'" role="region" aria-label="POS di progetto">

          <div x-show="caricamento"
               class="flex items-center gap-3 py-10 text-slate-400 text-sm">
            <div class="w-5 h-5 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"
                 role="status" aria-label="Caricamento"></div>
            Caricamento POS…
          </div>

          <div x-show="!caricamento && erroreCaricamento" role="alert"
               class="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700 mb-4">
            <strong>Errore di lettura:</strong>
            <span x-text="erroreCaricamento"></span>
          </div>

          <div x-show="!caricamento && !erroreCaricamento">

            <!-- Barra stampa Corpus POS -->
            <div class="flex flex-wrap items-center gap-2 mb-4">
              <span class="text-xs text-slate-400 font-medium">Stampa:</span>
              <button @click="esportaCorpusPos()" :disabled="exportandoCorpus"
                      class="text-xs bg-white border border-slate-300 text-slate-600 hover:bg-slate-50
                             disabled:opacity-50 px-3 py-1.5 rounded-lg transition-colors
                             focus:outline-none focus:ring-2 focus:ring-slate-400">
                <span x-show="!exportandoCorpus">📥 Indice Corpus POS</span>
                <span x-show="exportandoCorpus">⏳ Generazione…</span>
              </button>
            </div>

            <p x-show="documentiAttivi.length > 0"
               class="text-xs text-slate-400 mb-3"
               x-text="documentiAttivi.length + (documentiAttivi.length === 1 ? ' documento' : ' documenti') + ' nel POS'"></p>

            <div x-show="documentiAttivi.length === 0"
                 class="py-12 text-center text-slate-400">
              <div class="text-3xl mb-2" aria-hidden="true">📂</div>
              <p class="text-sm">Nessun documento POS caricato per questa impresa.</p>
              <p class="text-xs mt-1">Clicca "+ Aggiungi documento POS" per iniziare.</p>
            </div>

            <div x-show="documentiAttivi.length > 0"
                 role="list" aria-label="Documenti POS" class="space-y-2">
              <template x-for="doc in documentiAttivi" :key="doc.id">
                <article role="listitem"
                         class="border border-slate-200 bg-white rounded-xl px-4 py-3
                                hover:border-slate-300 transition-all">

                  <div class="flex items-center gap-2 mb-1.5 flex-wrap">
                    <span class="text-xs bg-blue-100 text-blue-800 px-2 py-0.5 rounded-full font-medium flex-shrink-0"
                          x-text="tagEtichetta(doc.tag, doc.tag_personalizzato, _tagCorpusPOS())"></span>
                    <span x-show="doc.data" class="text-xs text-slate-400 flex-shrink-0"
                          x-text="UTILS.formatData(doc.data + 'T12:00:00Z')"></span>
                    <span x-show="doc.testo_ai"
                          title="Testo per analisi AI presente"
                          class="text-xs bg-violet-100 text-violet-700 px-2 py-0.5 rounded-full flex-shrink-0">
                      🤖 testo AI ✓
                    </span>
                  </div>

                  <p x-show="doc.descrizione"
                     class="text-sm text-slate-700 leading-snug mb-1.5 line-clamp-2"
                     x-text="doc.descrizione"></p>

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
                              :aria-label="'Modifica: ' + tagEtichetta(doc.tag, doc.tag_personalizzato, _tagCorpusPOS())">
                        ✏ Modifica
                      </button>
                      <button type="button" @click="cestinaDoc(doc)"
                              class="text-xs text-red-400 hover:text-red-700 p-1.5 rounded-lg
                                     hover:bg-red-50 transition-colors
                                     focus:outline-none focus:ring-2 focus:ring-red-400"
                              :aria-label="'Cestina: ' + tagEtichetta(doc.tag, doc.tag_personalizzato, _tagCorpusPOS())"
                              title="Sposta nel cestino">🗑</button>
                    </div>

                  </div>

                </article>
              </template>
            </div>

          </div><!-- /!caricamento && !erroreCaricamento -->
        </div><!-- /sezione corpus -->

        <!-- ══════════════════════════════════════════════════
             SEZIONE 2: INTEGRAZIONI POS
             ══════════════════════════════════════════════════ -->
        <div x-show="sezioneAttiva === 'integrazioni'"
             role="region" aria-label="Integrazioni POS">

          <!-- Caricamento -->
          <div x-show="caricamentoInt"
               class="flex items-center gap-3 py-10 text-slate-400 text-sm">
            <div class="w-5 h-5 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"
                 role="status" aria-label="Caricamento"></div>
            Caricamento integrazioni…
          </div>

          <div x-show="!caricamentoInt">

            <!-- Barra export Integrazioni POS -->
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

            <!-- Ricerca + filtro tag -->
            <div class="flex flex-wrap gap-3 mb-4">
              <input type="search" x-model="cercaTestoInt"
                     placeholder="Cerca in titolo o descrizione…"
                     class="flex-1 min-w-48 border border-slate-300 rounded-md px-3 py-2 text-sm
                            focus:outline-none focus:ring-2 focus:ring-blue-500">
              <select x-model="filtroTagInt"
                      class="border border-slate-300 rounded-md px-3 py-2 text-sm
                             focus:outline-none focus:ring-2 focus:ring-blue-500">
                <option value="">Tutti i tipi</option>
                <template x-for="t in _tagIntPos()" :key="t.valore">
                  <option :value="t.valore" x-text="t.etichetta"></option>
                </template>
              </select>
            </div>

            <!-- Contatore -->
            <p x-show="integrazioniFiltrate.length > 0"
               class="text-xs text-slate-400 mb-3"
               x-text="integrazioniFiltrate.length + (integrazioniFiltrate.length === 1 ? ' integrazione' : ' integrazioni') + ' nel periodo'"></p>

            <!-- Lista vuota -->
            <div x-show="integrazioniFiltrate.length === 0"
                 class="py-12 text-center text-slate-400">
              <div class="text-3xl mb-2" aria-hidden="true">📝</div>
              <p class="text-sm"
                 x-text="(cercaTestoInt || filtroTagInt) ? 'Nessuna integrazione corrisponde ai filtri.' : 'Nessuna integrazione nel periodo selezionato.'"></p>
              <p x-show="!cercaTestoInt && !filtroTagInt" class="text-xs mt-1">
                Clicca "+ Nuova integrazione" per registrare un aggiornamento al POS.
              </p>
            </div>

            <!-- Lista integrazioni -->
            <div x-show="integrazioniFiltrate.length > 0"
                 role="list" aria-label="Integrazioni POS" class="space-y-2">
              <template x-for="voce in integrazioniFiltrate" :key="voce.id">
                <article role="listitem"
                         class="border border-slate-200 bg-white rounded-xl px-4 py-3
                                hover:border-slate-300 transition-all">

                  <!-- Riga 1: tag + data + contatore allegati + badge AI -->
                  <div class="flex items-center gap-2 mb-1.5 flex-wrap">
                    <span class="text-xs bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-full font-medium flex-shrink-0"
                          x-text="tagEtichetta(voce.tag, voce.tag_personalizzato, _tagIntPos())"></span>
                    <span x-show="voce.data" class="text-xs text-slate-400 flex-shrink-0"
                          x-text="UTILS.formatData(voce.data + 'T12:00:00Z')"></span>
                    <span x-show="(voce.allegati ?? []).length > 0"
                          class="text-xs text-slate-400 flex-shrink-0"
                          x-text="'📎 ' + voce.allegati.length"></span>
                    <span x-show="voce.testo_ai"
                          title="Testo per analisi AI presente"
                          class="text-xs bg-violet-100 text-violet-700 px-2 py-0.5 rounded-full flex-shrink-0">
                      🤖 testo AI ✓
                    </span>
                  </div>

                  <!-- Riga 2: titolo -->
                  <p class="text-sm font-semibold text-slate-800 leading-snug mb-0.5"
                     x-text="voce.titolo"></p>

                  <!-- Riga 3: descrizione (excerpt) -->
                  <p x-show="voce.descrizione"
                     class="text-xs text-slate-500 line-clamp-2 mb-1.5"
                     x-text="voce.descrizione"></p>

                  <!-- Riga 4: allegati + azioni -->
                  <div class="flex items-center gap-2 flex-wrap pt-0.5">

                    <!-- Allegati cliccabili -->
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
                      <template x-if="(voce.allegati ?? []).length > 0 && voce.allegati[0].base64">
                        <button type="button"
                                @click="ALLEGATI.scaricaAllegato(voce.allegati[0].base64, voce.allegati[0].filename)"
                                class="text-xs text-slate-400 hover:text-blue-600 p-1.5 rounded-lg
                                       hover:bg-slate-50 transition-colors
                                       focus:outline-none focus:ring-2 focus:ring-slate-400"
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
                                     hover:bg-red-50 transition-colors
                                     focus:outline-none focus:ring-2 focus:ring-red-400"
                              :aria-label="'Cestina: ' + voce.titolo"
                              title="Sposta nel cestino">🗑</button>
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
                        <span class="text-xs text-slate-400 ml-2"
                              x-text="UTILS.formatData(voce._eliminato_il)"></span>
                      </div>
                      <div class="flex gap-2 flex-shrink-0">
                        <button @click="ripristinaIntegrazione(voce)"
                                class="text-xs text-green-700 px-2 py-1 border border-green-300
                                       rounded-lg hover:bg-green-50 transition-colors
                                       focus:outline-none focus:ring-2 focus:ring-green-400">
                          ↩ Ripristina
                        </button>
                        <button @click="eliminaIntegrazione(voce)"
                                class="text-xs text-red-500 px-2 py-1 rounded-lg
                                       hover:bg-red-50 transition-colors
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
        </div><!-- /sezione integrazioni -->

      </div><!-- /impresaSelezionata -->
    </div><!-- /imprese.length > 0 -->

  </div><!-- /$store.cantiere.id -->


  <!-- ═══════════════════════════════════════════════════════════
       DRAWER SEZIONE 1: Aggiungi / Modifica documento POS corpus
       ═══════════════════════════════════════════════════════════ -->
  <div x-show="drawerAperto" x-cloak
       class="drawer-backdrop" @click.self="chiudiDrawer(false)" aria-hidden="true"></div>

  <div x-show="drawerAperto" x-cloak
       @input="_modificato = true"
       @keydown.escape.window="chiudiDrawer(false)"
       class="drawer" role="dialog" aria-modal="true"
       :aria-label="formNuovo ? 'Aggiungi documento POS' : 'Modifica documento POS'">

    <div class="drawer-header flex items-center justify-between px-5 py-4 border-b border-slate-200 bg-white">
      <h2 class="text-base font-semibold text-slate-800"
          x-text="formNuovo ? 'Aggiungi documento POS' : 'Modifica documento POS'"></h2>
      <button @click="chiudiDrawer(false)" aria-label="Chiudi"
              class="p-1.5 rounded hover:bg-slate-100 text-slate-500 text-lg
                     focus:outline-none focus:ring-2 focus:ring-slate-400">✕</button>
    </div>

    <div class="drawer-body px-5 py-4 space-y-5">

      <div>
        <label for="pos-tag" class="block text-xs font-medium text-slate-700 mb-1">
          Tipo documento <span class="text-red-500">*</span>
        </label>
        <select id="pos-tag" x-model="formTag"
                class="w-full border border-slate-300 rounded-md px-3 py-2 text-sm
                       focus:outline-none focus:ring-2 focus:ring-blue-500">
          <template x-for="t in _tagCorpusPOS()" :key="t.valore">
            <option :value="t.valore" x-text="t.etichetta"></option>
          </template>
        </select>
      </div>

      <div x-show="tagLibero">
        <label for="pos-tag-personalizzato"
               class="block text-xs font-medium text-slate-700 mb-1">
          Specifica il tipo <span class="text-red-500">*</span>
        </label>
        <input id="pos-tag-personalizzato" type="text"
               x-model="formTagPersonalizzato"
               placeholder="Es. Modello organizzativo, Registro infortuni…"
               class="w-full border border-slate-300 rounded-md px-3 py-2 text-sm
                      focus:outline-none focus:ring-2 focus:ring-blue-500">
      </div>

      <div>
        <label for="pos-descrizione" class="block text-xs font-medium text-slate-700 mb-1">
          Descrizione <span class="text-slate-400 font-normal">(opzionale)</span>
        </label>
        <textarea id="pos-descrizione" rows="3"
                  x-model="formDescrizione"
                  placeholder="Scrivi cosa contiene questo documento: è il testo che l'assistente AI potrà leggere in futuro per confrontarlo col PSC."
                  class="w-full border border-slate-300 rounded-md px-3 py-2 text-sm resize-none
                         focus:outline-none focus:ring-2 focus:ring-blue-500
                         placeholder:text-slate-400 placeholder:text-xs"></textarea>
      </div>

      <div>
        <label for="pos-data" class="block text-xs font-medium text-slate-700 mb-1">
          Data del documento <span class="text-slate-400 font-normal">(opzionale)</span>
        </label>
        <input id="pos-data" type="date" x-model="formData"
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

      <div>
        <label for="pos-testo-ai" class="block text-xs font-medium text-slate-700 mb-1">
          Testo per l'analisi AI
          <span class="text-slate-400 font-normal">(facoltativo)</span>
        </label>
        <textarea id="pos-testo-ai" rows="5" x-model="formTestoAi"
                  placeholder="Facoltativo: incolla qui il testo del documento per l'analisi AI futura. In seguito l'AI potrà confrontare questo POS con il PSC di cantiere e segnalare incongruenze."
                  class="w-full border border-slate-300 rounded-md px-3 py-2 text-sm resize-y
                         focus:outline-none focus:ring-2 focus:ring-blue-500
                         placeholder:text-slate-400 placeholder:text-xs"></textarea>
        <p class="text-xs text-slate-400 mt-1 leading-relaxed">
          Il contenuto sarà disponibile all'assistente AI (M26) per il confronto PSC↔POS.
          Non compare nella lista né nei documenti esportati.
        </p>
      </div>

    </div>

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

  </div><!-- /drawer sez.1 -->


  <!-- ═══════════════════════════════════════════════════════════
       DRAWER SEZIONE 2: Aggiungi / Modifica integrazione POS
       ═══════════════════════════════════════════════════════════ -->
  <div x-show="drawerIntAperto" x-cloak
       class="drawer-backdrop" @click.self="chiudiDrawerInt(false)" aria-hidden="true"></div>

  <div x-show="drawerIntAperto" x-cloak
       @input="_modificatoInt = true"
       @keydown.escape.window="chiudiDrawerInt(false)"
       class="drawer" role="dialog" aria-modal="true"
       :aria-label="formIntNuova ? 'Nuova integrazione POS' : 'Modifica integrazione POS'">

    <div class="drawer-header flex items-center justify-between px-5 py-4 border-b border-slate-200 bg-white">
      <h2 class="text-base font-semibold text-slate-800"
          x-text="formIntNuova ? 'Nuova integrazione POS' : 'Modifica integrazione POS'"></h2>
      <button @click="chiudiDrawerInt(false)" aria-label="Chiudi"
              class="p-1.5 rounded hover:bg-slate-100 text-slate-500 text-lg
                     focus:outline-none focus:ring-2 focus:ring-slate-400">✕</button>
    </div>

    <div class="drawer-body px-5 py-4 space-y-5">

      <!-- Tipo integrazione -->
      <div>
        <label for="int-pos-tag" class="block text-xs font-medium text-slate-700 mb-1">
          Tipo integrazione <span class="text-red-500">*</span>
        </label>
        <select id="int-pos-tag" x-model="formIntTag"
                class="w-full border border-slate-300 rounded-md px-3 py-2 text-sm
                       focus:outline-none focus:ring-2 focus:ring-blue-500">
          <template x-for="t in _tagIntPos()" :key="t.valore">
            <option :value="t.valore" x-text="t.etichetta"></option>
          </template>
        </select>
      </div>

      <!-- Tag personalizzato -->
      <div x-show="tagLiberoInt">
        <label for="int-pos-tag-personalizzato" class="block text-xs font-medium text-slate-700 mb-1">
          Specifica il tipo <span class="text-red-500">*</span>
        </label>
        <input id="int-pos-tag-personalizzato" type="text" x-model="formIntTagPersonalizzato"
               placeholder="Es. Adozione nuovo DPI collettivo, Cambio appaltatore specifico…"
               class="w-full border border-slate-300 rounded-md px-3 py-2 text-sm
                      focus:outline-none focus:ring-2 focus:ring-blue-500">
      </div>

      <!-- Titolo (obbligatorio) -->
      <div>
        <label for="int-pos-titolo" class="block text-xs font-medium text-slate-700 mb-1">
          Titolo <span class="text-red-500">*</span>
        </label>
        <input id="int-pos-titolo" type="text" x-model="formIntTitolo" maxlength="160"
               placeholder="Es. Aggiornamento squadra dopo sostituzione lavoratore"
               class="w-full border border-slate-300 rounded-md px-3 py-2 text-sm
                      focus:outline-none focus:ring-2 focus:ring-blue-500">
      </div>

      <!-- Descrizione -->
      <div>
        <label for="int-pos-descrizione" class="block text-xs font-medium text-slate-700 mb-1">
          Descrizione <span class="text-slate-400 font-normal">(opzionale)</span>
        </label>
        <textarea id="int-pos-descrizione" rows="3" x-model="formIntDescrizione"
                  placeholder="Descrivi cosa è cambiato nel POS di questa impresa e perché: l'AI potrà confrontarlo col PSC."
                  class="w-full border border-slate-300 rounded-md px-3 py-2 text-sm resize-none
                         focus:outline-none focus:ring-2 focus:ring-blue-500
                         placeholder:text-slate-400 placeholder:text-xs"></textarea>
      </div>

      <!-- Data integrazione -->
      <div>
        <label for="int-pos-data" class="block text-xs font-medium text-slate-700 mb-1">
          Data dell'integrazione
        </label>
        <input id="int-pos-data" type="date" x-model="formIntData"
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
        <label for="int-pos-testo-ai" class="block text-xs font-medium text-slate-700 mb-1">
          Testo per l'analisi AI <span class="text-slate-400 font-normal">(facoltativo)</span>
        </label>
        <textarea id="int-pos-testo-ai" rows="4" x-model="formIntTestoAi"
                  placeholder="Facoltativo: incolla qui il testo dell'integrazione per l'analisi AI futura. L'AI potrà confrontare le variazioni del POS col PSC di cantiere."
                  class="w-full border border-slate-300 rounded-md px-3 py-2 text-sm resize-y
                         focus:outline-none focus:ring-2 focus:ring-blue-500
                         placeholder:text-slate-400 placeholder:text-xs"></textarea>
        <p class="text-xs text-slate-400 mt-1">
          Il contenuto sarà disponibile all'assistente AI (M26). Non compare nella lista.
        </p>
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

</div><!-- /RegistroPOS -->
`;

// ── Registrazione nel registry moduli ─────────────────────────────────────────

window.MODULI_REGISTRATI['pos'] = {
  monta(contenitore) { contenitore.innerHTML = _TEMPLATE_POS; },
};
