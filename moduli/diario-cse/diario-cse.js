/**
 * diario-cse.js — M22: Diario CSE, Step 1+2.
 *
 * DIARIO_SERVICE (embedded): crea/leggi/aggiorna/cestina voci su
 *   08_Diario-CSE/<YYYY>/<MM>/<id>.json (cartelle al volo).
 * Allegati: base64 nel JSON { filename, base64 } — come il resto del sistema.
 * Firma opzionale: sigilla la voce (stato_voce='firmata'), immutabile.
 * Storage: file=stato, nessun IDB (lettura diretta da cartelle).
 *
 * Step 2: hook AUTO — voci generate dagli altri moduli (NC, futuri).
 *   creaVoceAuto() è il punto unico che ogni modulo chiama.
 *   Le voci AUTO sono in sola lettura (aggiornaVoce le rifiuta).
 * Step 3 (PDF/stampa), Step 4 (chip soggetti): non qui.
 */

// ── Configurazione tipi voce ──────────────────────────────────────────────────

// auto_only:true → appare nel filtro lista ma NON nel form di creazione manuale.
const _TIPI_DIARIO = [
  { valore: 'TELEFONATA',              etichetta: 'Telefonata',              icona: '📞', cls: 'bg-blue-100 text-blue-800' },
  { valore: 'EMAIL_PEC',               etichetta: 'Email / PEC',             icona: '📧', cls: 'bg-indigo-100 text-indigo-800' },
  { valore: 'COMUNICAZIONE_VERBALE',   etichetta: 'Comunicazione verbale',   icona: '💬', cls: 'bg-purple-100 text-purple-800' },
  { valore: 'DECISIONE',               etichetta: 'Decisione',               icona: '⚖️',  cls: 'bg-red-100 text-red-800' },
  { valore: 'OSSERVAZIONE',            etichetta: 'Osservazione',            icona: '👁',  cls: 'bg-amber-100 text-amber-800' },
  { valore: 'PROMEMORIA',              etichetta: 'Promemoria',              icona: '🔔', cls: 'bg-orange-100 text-orange-700' },
  { valore: 'COMUNICAZIONE_AUTORITA',  etichetta: 'Comunicazione autorità',  icona: '🏛',  cls: 'bg-teal-100 text-teal-800' },
  { valore: 'ALTRO',                   etichetta: 'Altro',                   icona: '📝', cls: 'bg-slate-100 text-slate-700' },
  // ── Tipi AUTO — generati dagli hook dei moduli (Step 2+) ──
  { valore: 'NON_CONFORMITA',   etichetta: 'Non Conformità',         icona: '⚠',  cls: 'bg-rose-100 text-rose-800',   auto_only: true },
  { valore: 'VERBALE_RIUNIONE', etichetta: 'Verbale Riunione',       icona: '📋', cls: 'bg-cyan-100 text-cyan-800',   auto_only: true },
  { valore: 'VERIFICA_POS',        etichetta: 'Verifica POS',           icona: '✅', cls: 'bg-emerald-100 text-emerald-800', auto_only: true },
  { valore: 'PROPOSTA_SOSPENSIONE', etichetta: 'Proposta Sospensione',  icona: '✋', cls: 'bg-orange-100 text-orange-800',   auto_only: true },
  { valore: 'DISPOSIZIONE_RL',      etichetta: 'Disposizione RL',       icona: '📌', cls: 'bg-red-100 text-red-800',        auto_only: true },
  { valore: 'VERIFICA_ITP',         etichetta: 'Verifica ITP',          icona: '🔎', cls: 'bg-teal-100 text-teal-800',      auto_only: true },
  { valore: 'EVENTO_INCIDENTALE',   etichetta: 'Evento Incidentale',    icona: '🚨', cls: 'bg-red-100 text-red-800',         auto_only: true },
];

// Promemori normativi — UI only, NON entrano nel DOCX esportato.
const NOTE_NORMATIVE_DIARIO = [
  {
    titolo: 'Natura dello strumento',
    testo:  'Il diario del CSE non è un registro obbligatorio per legge (diverso dal giornale dei ' +
            'lavori, in capo alla Direzione Lavori). È uno strumento volontario di organizzazione e ' +
            'auto-tutela: documenta in modo ordinato e datato l\'attività di coordinamento e vigilanza.',
  },
  {
    titolo: 'Perché tenerlo (art. 92; giurisprudenza)',
    testo:  'La giurisprudenza attribuisce al CSE un ruolo di alta vigilanza sempre più stringente. ' +
            'Poter dimostrare cosa si è osservato, quando e quali decisioni si sono prese è una tutela ' +
            'concreta in caso di contestazioni: il diario è la memoria documentata del tuo operato.',
  },
  {
    titolo: 'Valore delle voci',
    testo:  'Le voci firmate vengono sigillate (non più modificabili) e fanno fede come annotazione ' +
            'datata. Le voci automatiche registrano fatti generati dal sistema (es. apertura/chiusura ' +
            'di una non conformità). Il diario integra, non sostituisce, i documenti ufficiali ' +
            '(verbali, contestazioni, comunicazioni).',
  },
];

// ── Service dati ──────────────────────────────────────────────────────────────

const DIARIO_SERVICE = (() => {

  /**
   * Restituisce il handle della sottocartella YYYY/MM per il cantiere.
   * crea=true auto-crea le cartelle mancanti (al primo utilizzo del mese).
   */
  const _getDirMese = async (cantiereId, anno, mese, crea = false) => {
    const root = FILESYSTEM.getHandleAttivo();
    return FILESYSTEM.navigaPercorso(
      await root.getDirectoryHandle(cantiereId),
      ['08_Diario-CSE', anno, mese],
      crea
    );
  };

  // ── Schema ──────────────────────────────────────────────────────────────────

  /**
   * Crea un record voce vuoto con tutti i campi dello schema.
   * _dir_anno/_dir_mese: posizione fisica su disco — impostati alla creazione
   * e mai modificati, anche se l'utente cambia data_ora.
   */
  const creaVoceVuota = (cantiereId) => {
    const ora  = new Date();
    const anno = String(ora.getFullYear());
    const mese = String(ora.getMonth() + 1).padStart(2, '0');
    return {
      id:                UTILS.uuid(),
      tipo_file:         'voce_diario_cse',
      cantiere_id:       cantiereId ?? '',
      origine:           'MANUALE',
      tipo:              'OSSERVAZIONE',
      data_ora:          ora.toISOString(),
      soggetti:          [],
      titolo:            '',
      descrizione:       '',
      allegati:          [],       // [{ filename, base64 }]
      riferimenti_url:   [],       // [string]
      firma:             null,     // { firma_png_base64, firmato_il, firmato_da, tipo_firma }
      stato_voce:        'bozza',  // 'bozza' | 'firmata'
      _dir_anno:         anno,     // posizione fisica — immutabile dopo creazione
      _dir_mese:         mese,
      creato_il:         ora.toISOString(),
      creato_da:         IMPOSTAZIONI_SERVICE.cse()?.nome_cognome ?? '',
      aggiornato_il:     ora.toISOString(),
    };
  };

  // ── CRUD ─────────────────────────────────────────────────────────────────────

  /**
   * Scrive una nuova voce in 08_Diario-CSE/<_dir_anno>/<_dir_mese>/<id>.json.
   * Le cartelle anno/mese vengono create al volo se non esistono.
   */
  const creaVoce = async (voce) => {
    voce.aggiornato_il = new Date().toISOString();
    const dir = await _getDirMese(voce.cantiere_id, voce._dir_anno, voce._dir_mese, true);
    await FILESYSTEM.scriviJson(dir, `${voce.id}.json`, voce);
    return voce;
  };

  /**
   * Riscrive una voce nella sua posizione fisica (_dir_anno/_dir_mese).
   * Rifiuta se stato_voce='firmata' o se origine='AUTO' (sola lettura).
   */
  const aggiornaVoce = async (voce) => {
    if (voce.stato_voce === 'firmata') throw new Error('Voce firmata: immutabile.');
    if (voce.origine === 'AUTO') throw new Error('Voce automatica: non modificabile.');
    voce.aggiornato_il = new Date().toISOString();
    const dir = await _getDirMese(voce.cantiere_id, voce._dir_anno, voce._dir_mese);
    await FILESYSTEM.scriviJson(dir, `${voce.id}.json`, voce);
    return voce;
  };

  /**
   * Legge le voci (non cestinate) per i periodi indicati.
   * Ogni periodo è { anno: '2026', mese: '06' }.
   * Ordina per data_ora discendente (più recente prima).
   */
  const leggiVoci = async (cantiereId, periodi) => {
    const root      = FILESYSTEM.getHandleAttivo();
    const risultati = [];

    for (const { anno, mese } of periodi) {
      let dir;
      try {
        dir = await FILESYSTEM.navigaPercorso(
          await root.getDirectoryHandle(cantiereId),
          ['08_Diario-CSE', anno, mese],
          false
        );
      } catch (e) {
        if (e.name === 'NotFoundError') continue;
        throw e;
      }
      for await (const [nome, fh] of dir.entries()) {
        if (fh.kind !== 'file' || !nome.endsWith('.json')) continue;
        try {
          const v = await FILESYSTEM.leggiJson(dir, nome);
          if (!v._cestino) risultati.push(v);
        } catch { /* salta file corrotto */ }
      }
    }

    risultati.sort((a, b) =>
      (b.data_ora ?? b.creato_il ?? '').localeCompare(a.data_ora ?? a.creato_il ?? '')
    );
    return risultati;
  };

  /**
   * Legge le voci CESTINATE per i periodi indicati.
   * Ordina per _eliminato_il discendente.
   */
  const leggiCestino = async (cantiereId, periodi) => {
    const root      = FILESYSTEM.getHandleAttivo();
    const risultati = [];

    for (const { anno, mese } of periodi) {
      let dir;
      try {
        dir = await FILESYSTEM.navigaPercorso(
          await root.getDirectoryHandle(cantiereId),
          ['08_Diario-CSE', anno, mese],
          false
        );
      } catch (e) {
        if (e.name === 'NotFoundError') continue;
        throw e;
      }
      for await (const [nome, fh] of dir.entries()) {
        if (fh.kind !== 'file' || !nome.endsWith('.json')) continue;
        try {
          const v = await FILESYSTEM.leggiJson(dir, nome);
          if (v._cestino) risultati.push(v);
        } catch { /* salta file corrotto */ }
      }
    }

    risultati.sort((a, b) =>
      (b._eliminato_il ?? '').localeCompare(a._eliminato_il ?? '')
    );
    return risultati;
  };

  /**
   * Sigilla una voce con la firma, impostando stato_voce='firmata'.
   * Separato da aggiornaVoce perché quest'ultimo rifiuta voci già firmate:
   * qui il passaggio a 'firmata' è intenzionale.
   */
  const firmaVoce = async (voce) => {
    voce.aggiornato_il = new Date().toISOString();
    const dir = await _getDirMese(voce.cantiere_id, voce._dir_anno, voce._dir_mese);
    await FILESYSTEM.scriviJson(dir, `${voce.id}.json`, voce);
    return voce;
  };

  /** Soft-delete: aggiunge _cestino:true + _eliminato_il. */
  const cestinaVoce = async (voce) => {
    const cestinata = {
      ...voce,
      _cestino:      true,
      _eliminato_il: new Date().toISOString(),
    };
    const dir = await _getDirMese(voce.cantiere_id, voce._dir_anno, voce._dir_mese);
    await FILESYSTEM.scriviJson(dir, `${voce.id}.json`, cestinata);
    return cestinata;
  };

  /** Ripristina: rimuove _cestino e _eliminato_il dal record. */
  const ripristinaVoce = async (voce) => {
    const { _cestino, _eliminato_il, ...ripristinata } = voce;
    ripristinata.aggiornato_il = new Date().toISOString();
    const dir = await _getDirMese(voce.cantiere_id, voce._dir_anno, voce._dir_mese);
    await FILESYSTEM.scriviJson(dir, `${voce.id}.json`, ripristinata);
    return ripristinata;
  };

  /** Eliminazione definitiva: rimuove fisicamente il file. */
  const eliminaVoceDefinitiva = async (voce) => {
    const dir = await _getDirMese(voce.cantiere_id, voce._dir_anno, voce._dir_mese);
    try {
      const fh = await dir.getFileHandle(`${voce.id}.json`);
      await fh.remove?.();     // File System Access API — non tutti i browser la supportano
    } catch (e) {
      if (e.name !== 'NotFoundError') throw e;
    }
  };

  // ── Hook AUTO — punto unico per tutti i moduli ──────────────────────────────

  /**
   * Crea una voce diario automatica. Chiamata dagli hook dei moduli (NC, ecc.).
   * origine:'AUTO' → aggiornaVoce la rifiuta; cestinaVoce funziona normalmente.
   * @param {{ cantiere_id, tipo, titolo, descrizione, soggetti?, riferimento? }} o
   * @returns {Promise<object>}
   */
  const creaVoceAuto = async ({ cantiere_id, tipo, titolo, descrizione, soggetti = [], riferimento = null }) => {
    const ora  = new Date();
    const anno = String(ora.getFullYear());
    const mese = String(ora.getMonth() + 1).padStart(2, '0');
    const voce = {
      id:              UTILS.uuid(),
      tipo_file:       'voce_diario_cse',
      cantiere_id:     cantiere_id ?? '',
      origine:         'AUTO',
      tipo:            tipo ?? 'OSSERVAZIONE',
      data_ora:        ora.toISOString(),
      soggetti:        soggetti ?? [],
      titolo:          titolo ?? '',
      descrizione:     descrizione ?? '',
      allegati:        [],
      riferimenti_url: [],
      riferimento,      // id del documento sorgente (NC, verbale riunione, ecc.)
      firma:           null,
      stato_voce:      'bozza',   // le AUTO non si firmano
      _dir_anno:       anno,
      _dir_mese:       mese,
      creato_il:       ora.toISOString(),
      creato_da:       'sistema',
      aggiornato_il:   ora.toISOString(),
    };
    await creaVoce(voce);
    return voce;
  };

  // ── API pubblica ─────────────────────────────────────────────────────────────

  return {
    creaVoceVuota,
    creaVoce,
    leggiVoci,
    leggiCestino,
    aggiornaVoce,
    firmaVoce,
    creaVoceAuto,
    cestinaVoce,
    ripristinaVoce,
    eliminaVoceDefinitiva,
  };
})();

// ── Utility periodo ───────────────────────────────────────────────────────────

/** Costruisce l'array di {anno, mese} da esaminare in base al filtro periodo. */
function _periodiDaFiltro(filtro) {
  const oggi  = new Date();
  const build = (d) => ({
    anno: String(d.getFullYear()),
    mese: String(d.getMonth() + 1).padStart(2, '0'),
  });

  if (filtro === 'mese_corrente') return [build(oggi)];

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

/** Periodi degli ultimi 5 anni (per "esporta tutto"). */
function _periodiTutto() {
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
function _periodiDaRange(da, a) {
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

/** Etichetta leggibile del tipo voce per il documento esportato. */
const _tipoLabelDiario = (tipo) =>
  (_TIPI_DIARIO.find(t => t.valore === tipo) ?? { etichetta: tipo ?? 'Altro' }).etichetta;

/** Intestazione documento (header del template Word). */
function _intestazioneDiario() {
  const m = IMPOSTAZIONI_SERVICE.modulo('diario-cse');
  return {
    modulo_titolo:   m.titolo   || "Diario del Coordinatore per l'Esecuzione",
    modulo_codice:   m.codice   || '',
    modulo_versione: m.versione || '',
    logo_aziendale:  IMPOSTAZIONI_SERVICE.logo()?.png_base64 ?? null,
  };
}

/** Crea un link di download temporaneo e lo attiva. */
function _scaricaBlob(blob, nome) {
  const url = URL.createObjectURL(blob);
  const a   = document.createElement('a');
  a.href = url; a.download = nome; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

/**
 * Genera il corpo HTML del diario da passare a M6.
 * Pattern identico agli altri moduli (p[] + join): solo tag del sottoinsieme M6.
 * NON incorpora i PDF allegati: elenca i nomi file (attestazione dell'esistenza).
 *
 * @param {object[]} voci     - array già filtrato (ordine qualsiasi — riordinato internamente)
 * @param {{ lotto, cantiere_id, periodLabel }} opzioni
 */
async function generaCorpoHtmlDiario(voci, { lotto = {}, cantiere_id = '', periodLabel = '' }) {
  const esc = (s) => UTILS.escapeHtml(s ?? '');
  const p   = [];

  const cse    = IMPOSTAZIONI_SERVICE.cse();
  const firm   = IMPOSTAZIONI_SERVICE.firma();
  const cseImg = await _scalafirma(firm?.firma_png_base64 ?? null);

  // ── 1. Intestazione documento ────────────────────────────────────────────────
  const codCant  = esc(cantiere_id || lotto.id || '');
  const nomeCant = esc(lotto.nome ?? '');
  const commit   = esc(lotto.committente ?? '');

  p.push(`<p data-line="exact280"><strong>Cantiere:</strong> ${codCant}${nomeCant ? ' — ' + nomeCant : ''}</p>`);
  if (commit) p.push(`<p data-line="exact280"><strong>Committente:</strong> ${commit}</p>`);
  p.push(`<p data-line="exact280"><strong>Periodo:</strong> ${esc(periodLabel)}</p>`);
  p.push(`<p data-line="exact280"><strong>Generato il:</strong> ${esc(UTILS.formatData(new Date().toISOString()))}</p>`);
  p.push(`<p data-after="200">&nbsp;</p>`);

  // ── 2. Voci in ordine cronologico ascendente ──────────────────────────────────
  const ordinate = [...voci].sort((a, b) =>
    (a.data_ora ?? a.creato_il ?? '').localeCompare(b.data_ora ?? b.creato_il ?? ''));

  for (const v of ordinate) {
    const dataFmt  = esc(UTILS.formatDataOra(v.data_ora));
    const tipoLbl  = esc(_tipoLabelDiario(v.tipo));
    const isAuto   = v.origine === 'AUTO';

    // Intestazione voce: data — tipo (+ nota automatica)
    p.push(`<h3>${dataFmt} — ${tipoLbl}${isAuto ? ' *(automatica)*' : ''}</h3>`);

    // Titolo
    if (v.titolo?.trim()) p.push(`<p><strong>${esc(v.titolo)}</strong></p>`);

    // Descrizione (ritorni a capo → <br>)
    if (v.descrizione?.trim()) {
      const righe = v.descrizione.split('\n').map(r => esc(r)).join('<br>');
      p.push(`<p data-line="15">${righe}</p>`);
    }

    // Soggetti
    if ((v.soggetti ?? []).length > 0) {
      p.push(`<p><em>Soggetti: ${v.soggetti.map(s => esc(s)).join(', ')}</em></p>`);
    }

    // Allegati: solo nomi file (NON il contenuto)
    const allegati = (v.allegati ?? []).filter(a => a.filename);
    if (allegati.length > 0) {
      p.push(`<p><em>Allegati: ${allegati.map(a => esc(a.filename)).join(', ')}</em></p>`);
    }

    // Firma voce (se sigillata)
    if (v.stato_voce === 'firmata' && v.firma) {
      const fNome = esc(v.firma.firmato_da ?? '');
      const fData = esc(UTILS.formatData(v.firma.firmato_il));
      p.push(`<p><em>Firmata da ${fNome} il ${fData}</em></p>`);
      if (v.firma.firma_png_base64) {
        const vImg = await _scalafirma(v.firma.firma_png_base64);
        if (vImg) p.push(`<p><img src="${vImg}" alt="firma voce"></p>`);
      }
    }

    p.push(`<p data-after="120">&nbsp;</p>`);  // stacco tra voci
  }

  if (ordinate.length === 0) {
    p.push(`<p><em>Nessuna annotazione nel periodo selezionato.</em></p>`);
  }

  // ── 3. Firma CSE in calce ──────────────────────────────────────────────────
  const pr      = 'data-indent="firma" data-align="center" style="padding-left:52%;text-align:center"';
  const cseNome = esc(cse?.nome_cognome ?? '');
  p.push(`<p data-before="300">&nbsp;</p>`);
  p.push(`<p ${pr}>Il Coordinatore per l'Esecuzione</p>`);
  if (cseNome) p.push(`<p ${pr}>${cseNome}</p>`);
  if (cseImg)  p.push(`<p ${pr}><img src="${cseImg}" alt="firma CSE"></p>`);
  p.push(`<p ${pr}>${esc(UTILS.formatData(new Date().toISOString()))}</p>`);

  return p.join('\n');
}

// ── Componente Alpine ─────────────────────────────────────────────────────────

function DiarioCse() {
  return {
    voci:         [],
    voceCestino:  [],
    caricamento:  true,
    filtroPeriodo: 'mese_corrente',
    filtroTipo:    '',
    cercaTesto:    '',
    mostraCestino: false,
    caricamentoCestino: false,

    // Drawer crea/modifica
    drawerAperto:              false,
    formDati:                  {},
    formNuova:                 true,
    salvando:                  false,
    modificatoDopoCaricamento: false,
    nuovoUrl:                  '',

    // Dettaglio sola lettura (voci firmate e AUTO)
    dettaglioAperto: false,
    dettaglioVoce:   null,

    // Export DOCX (Step 3)
    exportando:        false,
    exportPeriodoForm: false,
    exportDa:          '',
    exportA:           '',

    // Firma
    firmaModal:      false,   // mostra il pannello firma
    _firmaVoceId:    null,    // null = firma per il drawer; uuid = firma per voce esistente dalla lista
    _firmaUsaCanvas: false,   // true quando l'utente sceglie esplicitamente il canvas

    _cantiereId: null,
    noteAperte:  false,

    // ── Computed ─────────────────────────────────────────────────────────────

    get noteDiario()   { return NOTE_NORMATIVE_DIARIO; },
    get vociFiltrate() {
      let v = this.voci;
      if (this.filtroTipo) v = v.filter(x => x.tipo === this.filtroTipo);
      if (this.cercaTesto.trim()) {
        const t = this.cercaTesto.toLowerCase();
        v = v.filter(x =>
          (x.titolo      ?? '').toLowerCase().includes(t) ||
          (x.descrizione ?? '').toLowerCase().includes(t) ||
          (x.soggetti    ?? []).some(s => s.toLowerCase().includes(t))
        );
      }
      return v;
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
        this.mostraCestino  = false;
        this.voceCestino    = [];
        this.caricaDati();
      }
    },

    async caricaDati() {
      this.caricamento = true;
      const cantId = this._cantiereId;
      if (!cantId) { this.voci = []; this.caricamento = false; return; }
      try {
        const periodi  = _periodiDaFiltro(this.filtroPeriodo);
        this.voci      = await DIARIO_SERVICE.leggiVoci(cantId, periodi);
      } catch (err) {
        ERRORI.gestisciErrore('diario-cse/carica', err);
        this.voci = [];
      } finally {
        this.caricamento = false;
      }
    },

    async caricaCestino() {
      if (!this._cantiereId) return;
      this.caricamentoCestino = true;
      try {
        const periodi      = _periodiDaFiltro('anno_corrente').concat(_periodiDaFiltro('anno_precedente'));
        this.voceCestino   = await DIARIO_SERVICE.leggiCestino(this._cantiereId, periodi);
      } catch (err) {
        ERRORI.gestisciErrore('diario-cse/carica-cestino', err);
      } finally {
        this.caricamentoCestino = false;
      }
    },

    async selezionaPeriodo(periodo) {
      this.filtroPeriodo = periodo;
      await this.caricaDati();
    },

    // ── Drawer crea/modifica ──────────────────────────────────────────────────

    nuovaAnnotazione() {
      this.formDati  = DIARIO_SERVICE.creaVoceVuota(this._cantiereId);
      this.formNuova = true;
      this.modificatoDopoCaricamento = false;
      this.nuovoUrl  = '';
      this.drawerAperto = true;
      this.$nextTick(() => document.getElementById('diario-titolo')?.focus());
    },

    modificaVoce(voce) {
      if (voce.stato_voce === 'firmata') {
        NOTIFICHE.info('Voce firmata', 'Le voci firmate non sono modificabili.');
        return;
      }
      this.formDati  = JSON.parse(JSON.stringify(voce));
      this.formDati.allegati        ??= [];
      this.formDati.soggetti        ??= [];
      this.formDati.riferimenti_url ??= [];
      this.formNuova = false;
      this.modificatoDopoCaricamento = false;
      this.nuovoUrl  = '';
      this.drawerAperto = true;
      this.$nextTick(() => document.getElementById('diario-titolo')?.focus());
    },

    chiudiDrawer(forza = false) {
      if (!forza && this.modificatoDopoCaricamento) {
        if (!confirm('Ci sono modifiche non salvate. Chiudere senza salvare?')) return;
      }
      this.drawerAperto = false;
      this.formDati     = {};
      this.nuovoUrl     = '';
    },

    // ── Dettaglio sola lettura ────────────────────────────────────────────────

    /** Apre il pannello dettaglio in sola lettura (voci firmate e AUTO). */
    apriDettaglio(voce) {
      this.dettaglioVoce   = voce;
      this.dettaglioAperto = true;
    },

    chiudiDettaglio() {
      this.dettaglioAperto = false;
      this.dettaglioVoce   = null;
    },

    // ── Export DOCX ───────────────────────────────────────────────────────────

    async esportaTutto() {
      if (!this._cantiereId) return;
      this.exportando = true;
      try {
        const voci  = await DIARIO_SERVICE.leggiVoci(this._cantiereId, _periodiTutto());
        const corpo = await generaCorpoHtmlDiario(voci, {
          lotto:       ANAGRAFICA_SERVICE.dati?.lotto ?? {},
          cantiere_id: this._cantiereId,
          periodLabel: 'Diario completo',
        });
        const out = await MOTORE_DOCX.generaDocumento({
          tipo: 'diario-cse', header: _intestazioneDiario(),
          corpo_html: corpo, formati: { docx: true },
        });
        _scaricaBlob(out.docxBlob, `diario-cse-${this._cantiereId}-completo.docx`);
        NOTIFICHE.successo('Esportato', 'DOCX diario completo scaricato.');
      } catch (err) {
        ERRORI.gestisciErrore('diario-cse/esporta-tutto', err);
      } finally { this.exportando = false; }
    },

    async esportaPeriodo() {
      if (!this._cantiereId || !this.exportDa || !this.exportA) {
        NOTIFICHE.attenzione('Export', 'Seleziona data inizio e data fine.');
        return;
      }
      if (this.exportDa > this.exportA) {
        NOTIFICHE.attenzione('Export', 'La data inizio deve essere prima della data fine.');
        return;
      }
      this.exportPeriodoForm = false;
      this.exportando = true;
      try {
        const periodi = _periodiDaRange(this.exportDa, this.exportA);
        const tutte   = await DIARIO_SERVICE.leggiVoci(this._cantiereId, periodi);
        // Raffina per data esatta (leggiVoci carica il mese intero)
        const daStr = this.exportDa + 'T00:00:00.000Z';
        const aStr  = this.exportA  + 'T23:59:59.999Z';
        const voci  = tutte.filter(v => {
          const dt = v.data_ora ?? v.creato_il ?? '';
          return dt >= daStr && dt <= aStr;
        });
        const label = `dal ${UTILS.formatData(this.exportDa + 'T12:00:00Z')} al ${UTILS.formatData(this.exportA + 'T12:00:00Z')}`;
        const corpo = await generaCorpoHtmlDiario(voci, {
          lotto:       ANAGRAFICA_SERVICE.dati?.lotto ?? {},
          cantiere_id: this._cantiereId,
          periodLabel: label,
        });
        const out = await MOTORE_DOCX.generaDocumento({
          tipo: 'diario-cse', header: _intestazioneDiario(),
          corpo_html: corpo, formati: { docx: true },
        });
        _scaricaBlob(out.docxBlob, `diario-cse-${this._cantiereId}-${this.exportDa}_${this.exportA}.docx`);
        NOTIFICHE.successo('Esportato', `DOCX periodo scaricato (${voci.length} voci).`);
      } catch (err) {
        ERRORI.gestisciErrore('diario-cse/esporta-periodo', err);
      } finally { this.exportando = false; }
    },

    async esportaVoce(voce) {
      this.exportando = true;
      try {
        const corpo = await generaCorpoHtmlDiario([voce], {
          lotto:       ANAGRAFICA_SERVICE.dati?.lotto ?? {},
          cantiere_id: this._cantiereId,
          periodLabel: UTILS.formatData(voce.data_ora),
        });
        const out = await MOTORE_DOCX.generaDocumento({
          tipo: 'diario-cse', header: _intestazioneDiario(),
          corpo_html: corpo, formati: { docx: true },
        });
        _scaricaBlob(out.docxBlob, `diario-voce-${this._cantiereId}-${voce.id.slice(0, 8)}.docx`);
        NOTIFICHE.successo('Esportato', 'DOCX voce scaricato.');
      } catch (err) {
        ERRORI.gestisciErrore('diario-cse/esporta-voce', err);
      } finally { this.exportando = false; }
    },

    _validaForm() {
      if (!(this.formDati.titolo ?? '').trim()) {
        NOTIFICHE.attenzione('Diario', 'Il titolo è necessario.');
        document.getElementById('diario-titolo')?.focus();
        return false;
      }
      return true;
    },

    async salvaVoce() {
      if (!this._validaForm()) return;
      this.salvando = true;
      try {
        if (this.formNuova) {
          const salvata = await DIARIO_SERVICE.creaVoce(this.formDati);
          this.voci.unshift(salvata);
          this.voci = [...this.voci];
          NOTIFICHE.successo('Annotazione aggiunta');
        } else {
          const aggiornata = await DIARIO_SERVICE.aggiornaVoce(this.formDati);
          const idx = this.voci.findIndex(v => v.id === aggiornata.id);
          if (idx >= 0) this.voci[idx] = aggiornata;
          this.voci = [...this.voci];
          NOTIFICHE.successo('Annotazione aggiornata');
        }
        this.chiudiDrawer(true);
      } catch (err) {
        ERRORI.gestisciErrore('diario-cse/salva', err);
      } finally {
        this.salvando = false;
      }
    },

    // ── Firma ─────────────────────────────────────────────────────────────────

    /** True se IMPOSTAZIONI_SERVICE ha una firma permanente valida (caso normale da PC). */
    _firmaPermanenteDisponibile() {
      return !!IMPOSTAZIONI_SERVICE.firma()?.firma_png_base64;
    },

    /**
     * "Salva e firma": valida il form, poi apre il pannello firma.
     * La firma viene applicata alla voce del drawer (formDati).
     */
    apriFirmaPerDrawer() {
      if (!this._validaForm()) return;
      this._firmaVoceId    = null;
      this._firmaUsaCanvas = false;   // parte sempre dal pannello permanente (se disponibile)
      this.firmaModal      = true;
    },

    /** Firma diretta di una voce già salvata (bozza) dalla lista. */
    apriFirmaPerVoce(voceId) {
      this._firmaVoceId    = voceId;
      this._firmaUsaCanvas = false;
      this.firmaModal      = true;
    },

    /** Usa la firma permanente da Impostazioni (senza canvas). */
    async usaFirmaPermanente() {
      const firm = IMPOSTAZIONI_SERVICE.firma();
      if (!firm?.firma_png_base64) {
        NOTIFICHE.attenzione('Firma', 'Nessuna firma permanente configurata in Impostazioni.');
        return;
      }
      const png = await _scalafirma(firm.firma_png_base64) ?? firm.firma_png_base64;
      await this.onFirmaAcquisita(png, 'permanente');
    },

    /**
     * Chiamata sia dal pannello permanente (tipo_firma='permanente')
     * che da FirmaCanvas (tipo_firma='canvas').
     */
    async onFirmaAcquisita(png, tipo_firma = 'canvas') {
      this.firmaModal      = false;
      this._firmaUsaCanvas = false;   // reset per la prossima apertura
      const firma = {
        firma_png_base64: png,
        firmato_il:       new Date().toISOString(),
        firmato_da:       IMPOSTAZIONI_SERVICE.cse()?.nome_cognome ?? '',
        tipo_firma,
      };

      if (this._firmaVoceId === null) {
        // Firma dal drawer: salva la voce con firma
        await this._salvaConFirma(firma);
      } else {
        // Firma diretta di voce esistente dalla lista
        await this._firmaVoceEsistente(this._firmaVoceId, firma);
        this._firmaVoceId = null;
      }
    },

    async _salvaConFirma(firma) {
      this.salvando = true;
      try {
        this.formDati.firma      = firma;
        this.formDati.stato_voce = 'firmata';
        if (this.formNuova) {
          const salvata = await DIARIO_SERVICE.creaVoce(this.formDati);
          this.voci.unshift(salvata);
        } else {
          // firmaVoce bypassa il guard di aggiornaVoce (che rifiuta stato_voce='firmata')
          const aggiornata = await DIARIO_SERVICE.firmaVoce(this.formDati);
          const idx = this.voci.findIndex(v => v.id === aggiornata.id);
          if (idx >= 0) this.voci[idx] = aggiornata;
        }
        this.voci = [...this.voci];
        NOTIFICHE.successo('Annotazione firmata e salvata');
        this.chiudiDrawer(true);
      } catch (err) {
        ERRORI.gestisciErrore('diario-cse/salva-firma', err);
      } finally {
        this.salvando = false;
      }
    },

    async _firmaVoceEsistente(voceId, firma) {
      const voce = this.voci.find(v => v.id === voceId);
      if (!voce) return;
      const aggiornata = { ...voce, firma, stato_voce: 'firmata' };
      try {
        // firmaVoce bypassa il guard di aggiornaVoce (che rifiuta stato_voce='firmata')
        const salvata = await DIARIO_SERVICE.firmaVoce(aggiornata);
        const idx = this.voci.findIndex(v => v.id === voceId);
        if (idx >= 0) this.voci[idx] = salvata;
        this.voci = [...this.voci];
        NOTIFICHE.successo('Voce firmata');
      } catch (err) {
        ERRORI.gestisciErrore('diario-cse/firma-voce', err);
      }
    },

    // ── Cestino ───────────────────────────────────────────────────────────────

    async cestinaVoce(voce) {
      if (!confirm('Spostare questa annotazione nel cestino?')) return;
      try {
        await DIARIO_SERVICE.cestinaVoce(voce);
        this.voci = this.voci.filter(v => v.id !== voce.id);
        // Aggiorna il cestino se è aperto
        if (this.mostraCestino) await this.caricaCestino();
        NOTIFICHE.info('Annotazione spostata nel cestino');
      } catch (err) {
        ERRORI.gestisciErrore('diario-cse/cestina', err);
      }
    },

    async ripristinaVoce(voce) {
      try {
        const ripristinata = await DIARIO_SERVICE.ripristinaVoce(voce);
        this.voceCestino   = this.voceCestino.filter(v => v.id !== voce.id);
        // Aggiunge in cima alla lista se il periodo è compatibile
        const periodi = _periodiDaFiltro(this.filtroPeriodo);
        const inPeriodo = periodi.some(p => p.anno === ripristinata._dir_anno && p.mese === ripristinata._dir_mese);
        if (inPeriodo) { this.voci.unshift(ripristinata); this.voci = [...this.voci]; }
        NOTIFICHE.successo('Annotazione ripristinata');
      } catch (err) {
        ERRORI.gestisciErrore('diario-cse/ripristina', err);
      }
    },

    async eliminaVoce(voce) {
      if (!confirm('Eliminare definitivamente questa annotazione? Non è reversibile.')) return;
      if (!confirm('Conferma eliminazione definitiva. Il file verrà rimosso dal disco.')) return;
      try {
        await DIARIO_SERVICE.eliminaVoceDefinitiva(voce);
        this.voceCestino = this.voceCestino.filter(v => v.id !== voce.id);
        NOTIFICHE.successo('Eliminata definitivamente');
      } catch (err) {
        ERRORI.gestisciErrore('diario-cse/elimina', err);
      }
    },

    async toggleCestino() {
      this.mostraCestino = !this.mostraCestino;
      if (this.mostraCestino && this.voceCestino.length === 0) await this.caricaCestino();
    },

    // ── Allegati ──────────────────────────────────────────────────────────────

    async onAllegatoFile(event) {
      const files = Array.from(event.target.files ?? []);
      if (!files.length) return;
      if (!this.formDati.allegati) this.formDati.allegati = [];
      for (const file of files) {
        const base64 = await _leggiBase64(file);
        this.formDati.allegati.push({ filename: file.name, base64 });
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

    // ── Riferimenti URL ───────────────────────────────────────────────────────

    aggiungiUrl() {
      const url = (this.nuovoUrl ?? '').trim();
      if (!url) return;
      if (!this.formDati.riferimenti_url) this.formDati.riferimenti_url = [];
      this.formDati.riferimenti_url.push(url);
      this.formDati = { ...this.formDati };
      this.nuovoUrl = '';
      this.modificatoDopoCaricamento = true;
    },

    rimuoviUrl(idx) {
      this.formDati.riferimenti_url.splice(idx, 1);
      this.formDati = { ...this.formDati };
      this.modificatoDopoCaricamento = true;
    },

    // ── Soggetti (select multipla → array di stringhe) ────────────────────────

    onSoggettiChange(event) {
      this.formDati.soggetti = Array.from(event.target.selectedOptions).map(o => o.value);
      this.formDati = { ...this.formDati };
      this.modificatoDopoCaricamento = true;
    },

    _tuttiSoggetti() {
      const imprese   = (ANAGRAFICA_SERVICE.get('imprese')              ?? []).map(i => ({ gruppo: 'Imprese',              valore: i.ragioneSociale }));
      const persone   = (ANAGRAFICA_SERVICE.get('persone_committente')  ?? []).map(p => ({ gruppo: 'Personale sicurezza',  valore: `${[p.cognome, p.nome].filter(Boolean).join(' ')}${p.ruolo ? ' (' + p.ruolo + ')' : ''}` }));
      const terzi     = (ANAGRAFICA_SERVICE.get('persone_terzi')        ?? []).map(p => ({ gruppo: 'Enti / Terzi',         valore: `${[p.cognome, p.nome].filter(Boolean).join(' ')}${p.tipoEnte ? ' — ' + p.tipoEnte : ''}` }));
      return { imprese, persone, terzi };
    },

    // ── Helper UI ─────────────────────────────────────────────────────────────

    tipoInfo(tipo) {
      return _TIPI_DIARIO.find(t => t.valore === tipo) ?? _TIPI_DIARIO.at(-1);
    },

    _tipiDiario() { return _TIPI_DIARIO; },
  };
}

// ── Template HTML ─────────────────────────────────────────────────────────────

const _TEMPLATE_DIARIO = `
<div x-data="DiarioCse()" x-init="init()" x-effect="aggiornaSeCantiereRicambia()"
     class="max-w-4xl">

  <!-- === HEADER === -->
  <div class="flex items-center justify-between mb-4">
    <div>
      <h1 class="text-xl font-semibold text-slate-800">📋 Diario CSE</h1>
      <p class="text-xs text-slate-400 mt-0.5"
         x-text="vociFiltrate.length + ' annotazioni nel periodo · ' + voci.filter(v=>v.stato_voce==='firmata').length + ' firmate'">
      </p>
    </div>
    <div class="flex items-center gap-2">
      <button @click="noteAperte = !noteAperte"
              :aria-expanded="String(noteAperte)"
              class="text-xs text-sky-700 bg-sky-50 border border-sky-200
                     px-2.5 py-1 rounded-full hover:bg-sky-100 transition-colors
                     focus:outline-none focus:ring-2 focus:ring-sky-400">
        &#x2139; Note normative
      </button>
      <button @click="nuovaAnnotazione()" x-show="$store.cantiere.id"
              class="bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium
                     px-4 py-2 rounded-lg transition-colors
                     focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2">
        + Nuova annotazione
      </button>
    </div>
  </div>

  <!-- NOTE NORMATIVE -->
  <div x-show="noteAperte" x-transition class="nota-normativa-panel mb-4" role="note">
    <p class="text-xs text-sky-500 mb-2 italic">Promemoria per il CSE — non compare nel documento.</p>
    <template x-for="nota in noteDiario" :key="nota.titolo">
      <div><h4 x-text="nota.titolo"></h4><p x-text="nota.testo"></p></div>
    </template>
  </div>

  <!-- Nessun cantiere -->
  <div x-show="!$store.cantiere.id" class="placeholder-modulo">
    <div class="text-3xl" aria-hidden="true">📋</div>
    <p class="text-slate-500">Seleziona un cantiere per accedere al Diario CSE.</p>
  </div>

  <!-- === BARRA EXPORT === -->
  <div x-show="$store.cantiere.id" class="mb-4">
    <div class="flex flex-wrap items-center gap-2">
      <span class="text-xs text-slate-400 font-medium">Esporta:</span>
      <button @click="esportaTutto()" :disabled="exportando"
              class="text-xs bg-white border border-slate-300 text-slate-600 hover:bg-slate-50
                     disabled:opacity-50 px-3 py-1.5 rounded-lg transition-colors
                     focus:outline-none focus:ring-2 focus:ring-slate-400">
        <span x-show="!exportando">📥 Tutto il diario</span>
        <span x-show="exportando">⏳ Generazione…</span>
      </button>
      <button @click="exportPeriodoForm = !exportPeriodoForm" :disabled="exportando"
              :class="exportPeriodoForm ? 'bg-blue-50 border-blue-300 text-blue-700' : 'bg-white border-slate-300 text-slate-600'"
              class="text-xs border hover:bg-slate-50 disabled:opacity-50 px-3 py-1.5
                     rounded-lg transition-colors
                     focus:outline-none focus:ring-2 focus:ring-blue-400">
        📅 Periodo…
      </button>
    </div>
    <!-- Form scelta periodo (inline) -->
    <div x-show="exportPeriodoForm" class="mt-2 flex flex-wrap items-center gap-2 p-3
                                           bg-blue-50 border border-blue-200 rounded-lg">
      <label class="text-xs text-slate-600">Dal
        <input type="date" x-model="exportDa"
               class="ml-1 border border-slate-300 rounded px-2 py-1 text-xs
                      focus:outline-none focus:ring-2 focus:ring-blue-500">
      </label>
      <label class="text-xs text-slate-600">Al
        <input type="date" x-model="exportA"
               class="ml-1 border border-slate-300 rounded px-2 py-1 text-xs
                      focus:outline-none focus:ring-2 focus:ring-blue-500">
      </label>
      <button @click="esportaPeriodo()" :disabled="exportando"
              class="text-xs bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white
                     px-3 py-1.5 rounded-lg transition-colors
                     focus:outline-none focus:ring-2 focus:ring-blue-500">
        📥 Genera DOCX
      </button>
      <button @click="exportPeriodoForm = false"
              class="text-xs text-slate-400 hover:text-slate-600 px-2 py-1 rounded
                     focus:outline-none focus:ring-1 focus:ring-slate-400">✕</button>
    </div>
  </div>

  <div x-show="$store.cantiere.id">

    <!-- === FILTRI PERIODO === -->
    <div class="flex flex-wrap gap-2 mb-4" role="group" aria-label="Periodo">
      <template x-for="[val, label] in [
        ['mese_corrente',   'Mese corrente'],
        ['ultimi_3_mesi',   'Ultimi 3 mesi'],
        ['anno_corrente',   'Anno corrente'],
        ['anno_precedente', 'Anno precedente']
      ]" :key="val">
        <button @click="selezionaPeriodo(val)"
                :class="filtroPeriodo === val
                  ? 'bg-blue-600 text-white'
                  : 'bg-white text-slate-600 border border-slate-300 hover:bg-slate-50'"
                class="text-xs px-3 py-1.5 rounded-full transition-colors
                       focus:outline-none focus:ring-2 focus:ring-blue-400"
                x-text="label"></button>
      </template>
    </div>

    <!-- === BARRA RICERCA E FILTRO TIPO === -->
    <div class="flex flex-wrap gap-3 mb-4">
      <input type="search" x-model="cercaTesto"
             placeholder="Cerca in titolo, descrizione, soggetti…"
             class="flex-1 min-w-48 border border-slate-300 rounded-md px-3 py-2 text-sm
                    focus:outline-none focus:ring-2 focus:ring-blue-500">
      <select x-model="filtroTipo"
              class="border border-slate-300 rounded-md px-3 py-2 text-sm
                     focus:outline-none focus:ring-2 focus:ring-blue-500">
        <option value="">Tutti i tipi</option>
        <template x-for="t in _tipiDiario()" :key="t.valore">
          <option :value="t.valore" x-text="t.icona + ' ' + t.etichetta"></option>
        </template>
      </select>
    </div>

    <!-- Caricamento -->
    <div x-show="caricamento" class="flex items-center gap-3 py-10 text-slate-400 text-sm">
      <div class="w-5 h-5 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
      Caricamento diario…
    </div>

    <div x-show="!caricamento">

      <!-- === LISTA VOCI === -->
      <div x-show="vociFiltrate.length === 0"
           class="py-12 text-center text-slate-400">
        <div class="text-3xl mb-2">📋</div>
        <p x-show="!cercaTesto && !filtroTipo">Nessuna annotazione nel periodo selezionato. Clicca "+ Nuova annotazione".</p>
        <p x-show="cercaTesto || filtroTipo">Nessuna annotazione corrisponde ai filtri.</p>
      </div>

      <div role="list" aria-label="Annotazioni diario" class="space-y-2">
        <template x-for="voce in vociFiltrate" :key="voce.id">
          <article role="listitem"
                   :class="voce.stato_voce === 'firmata' ? 'border-green-200 bg-green-50/30' :
                           voce.origine === 'AUTO'        ? 'border-violet-200 bg-violet-50/20' :
                                                            'border-slate-200 bg-white'"
                   class="border rounded-xl px-4 py-3 hover:border-slate-300 transition-all">

            <!-- Riga 1: tipo + data + badge firmata -->
            <div class="flex items-center gap-2 mb-1.5 flex-wrap">
              <span :class="tipoInfo(voce.tipo).cls"
                    class="text-xs px-2 py-0.5 rounded-full font-medium flex-shrink-0"
                    x-text="tipoInfo(voce.tipo).icona + ' ' + tipoInfo(voce.tipo).etichetta"></span>
              <span class="text-xs text-slate-400 flex-shrink-0"
                    x-text="UTILS.formatDataOra(voce.data_ora)"></span>
              <span x-show="voce.stato_voce === 'firmata'"
                    class="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full flex-shrink-0">
                ✓ Firmata
              </span>
              <span x-show="voce.origine === 'AUTO'"
                    class="text-xs bg-violet-100 text-violet-700 px-2 py-0.5 rounded-full flex-shrink-0"
                    title="Voce generata automaticamente dal sistema">
                🤖 Automatica
              </span>
              <span x-show="(voce.allegati ?? []).length > 0"
                    class="text-xs text-slate-400 flex-shrink-0"
                    x-text="'📎 ' + voce.allegati.length"></span>
            </div>

            <!-- Riga 2: titolo -->
            <p class="text-sm font-semibold text-slate-800 leading-snug mb-0.5"
               x-text="voce.titolo || '(senza titolo)'"></p>

            <!-- Riga 3: descrizione (excerpt) -->
            <p x-show="voce.descrizione"
               class="text-xs text-slate-500 line-clamp-2 mb-1.5"
               x-text="voce.descrizione"></p>

            <!-- Riga 4: soggetti -->
            <div x-show="(voce.soggetti ?? []).length > 0"
                 class="flex flex-wrap gap-1 mb-1.5">
              <template x-for="s in (voce.soggetti ?? [])" :key="s">
                <span class="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full"
                      x-text="s"></span>
              </template>
            </div>

            <!-- Riga 5: firma info + azioni -->
            <div class="flex items-center gap-2 flex-wrap pt-1">
              <span x-show="voce.stato_voce === 'firmata' && voce.firma?.firmato_da"
                    class="text-xs text-green-600"
                    x-text="'Firmata da ' + voce.firma.firmato_da + ' · ' + UTILS.formatDataOra(voce.firma.firmato_il)">
              </span>
              <div class="ml-auto flex gap-2 flex-shrink-0">
                <!-- Allegati: apri il primo o tutti -->
                <template x-if="(voce.allegati ?? []).length > 0">
                  <button @click="ALLEGATI.apriAllegato(voce.allegati[0].base64, voce.allegati[0].filename)"
                          :disabled="!voce.allegati[0].base64"
                          class="text-xs text-blue-600 hover:text-blue-800 disabled:opacity-40 disabled:cursor-not-allowed
                                 focus:outline-none focus:ring-1 focus:ring-blue-400 rounded px-1"
                          :title="voce.allegati[0].filename">📎</button>
                </template>
                <!-- Firma (solo bozza MANUALE) -->
                <template x-if="voce.stato_voce === 'bozza' && voce.origine !== 'AUTO'">
                  <button @click="apriFirmaPerVoce(voce.id)"
                          class="text-xs text-slate-500 hover:text-green-700 px-2 py-1
                                 border border-slate-200 rounded-lg hover:bg-green-50 transition-colors
                                 focus:outline-none focus:ring-2 focus:ring-green-400"
                          title="Firma questa annotazione">✍ Firma</button>
                </template>
                <!-- Modifica (solo bozza MANUALE) -->
                <template x-if="voce.stato_voce === 'bozza' && voce.origine !== 'AUTO'">
                  <button @click="modificaVoce(voce)"
                          class="text-xs text-slate-600 hover:text-slate-900 px-3 py-1
                                 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors
                                 focus:outline-none focus:ring-2 focus:ring-slate-400"
                          :aria-label="'Modifica: ' + voce.titolo">✏ Modifica</button>
                </template>
                <!-- Apri in sola lettura (firmate e AUTO) -->
                <template x-if="voce.stato_voce === 'firmata' || voce.origine === 'AUTO'">
                  <button @click="apriDettaglio(voce)"
                          class="text-xs text-slate-600 hover:text-slate-900 px-3 py-1
                                 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors
                                 focus:outline-none focus:ring-2 focus:ring-slate-400"
                          :aria-label="'Apri dettaglio: ' + voce.titolo">👁 Apri</button>
                </template>
                <!-- Cestina -->
                <button @click="cestinaVoce(voce)"
                        class="text-xs text-red-400 hover:text-red-700 px-2 py-1
                               rounded-lg hover:bg-red-50 transition-colors
                               focus:outline-none focus:ring-2 focus:ring-red-400"
                        title="Sposta nel cestino">🗑</button>
                <!-- Esporta voce singola -->
                <button @click="esportaVoce(voce)" :disabled="exportando"
                        class="text-xs text-slate-400 hover:text-slate-600 px-2 py-1
                               rounded-lg hover:bg-slate-50 disabled:opacity-40 transition-colors
                               focus:outline-none focus:ring-2 focus:ring-slate-400"
                        title="Esporta questa voce in DOCX">📥</button>
              </div>
            </div>

          </article>
        </template>
      </div>

      <!-- === CESTINO DIARIO === -->
      <div class="mt-6">
        <button @click="toggleCestino()"
                class="text-xs text-slate-400 hover:text-slate-600 underline
                       focus:outline-none focus:ring-2 focus:ring-slate-400 rounded">
          <span x-text="(mostraCestino ? '▾ Nascondi' : '▸ Mostra') + ' cestino diario'"></span>
        </button>

        <div x-show="mostraCestino" class="mt-3">
          <div x-show="caricamentoCestino" class="text-xs text-slate-400 py-2">Caricamento…</div>
          <div x-show="!caricamentoCestino && voceCestino.length === 0"
               class="text-xs text-slate-400 mt-2">Il cestino del diario è vuoto.</div>
          <div class="space-y-2 mt-2">
            <template x-for="voce in voceCestino" :key="voce.id">
              <div class="border border-slate-200 bg-slate-50 rounded-xl px-4 py-2.5
                          flex items-center gap-3 opacity-70 hover:opacity-90 transition-opacity">
                <div class="flex-1 min-w-0">
                  <span class="text-xs text-slate-500 line-through"
                        x-text="voce.titolo || '(senza titolo)'"></span>
                  <span class="text-xs text-slate-400 ml-2"
                        x-text="UTILS.formatData(voce._eliminato_il)"></span>
                </div>
                <div class="flex gap-2 flex-shrink-0">
                  <button @click="ripristinaVoce(voce)"
                          class="text-xs text-green-700 px-2 py-1 border border-green-300
                                 rounded-lg hover:bg-green-50 transition-colors
                                 focus:outline-none focus:ring-2 focus:ring-green-400">
                    ↩ Ripristina
                  </button>
                  <button @click="eliminaVoce(voce)"
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

    </div><!-- /!caricamento -->
  </div><!-- /$store.cantiere.id -->


  <!-- ═══════════════════════════════════════════════════════════════
       DRAWER: Editor annotazione — position fixed right 0, ~44% width.
       ═══════════════════════════════════════════════════════════════ -->
  <div x-show="drawerAperto" x-cloak
       class="drawer-backdrop" @click="chiudiDrawer(false)" aria-hidden="true"></div>

  <div x-show="drawerAperto" x-cloak
       @input="modificatoDopoCaricamento = true"
       @keydown.escape.window="chiudiDrawer(false)"
       class="drawer" role="dialog" aria-modal="true" aria-label="Editor annotazione diario">

    <!-- header fisso -->
    <div class="drawer-header flex items-center justify-between px-5 py-4 border-b border-slate-200 bg-white">
      <h2 class="text-base font-semibold text-slate-800"
          x-text="formNuova ? 'Nuova annotazione' : 'Modifica annotazione'"></h2>
      <button @click="chiudiDrawer(false)" aria-label="Chiudi"
              class="p-1.5 rounded hover:bg-slate-100 text-slate-500 text-lg
                     focus:outline-none focus:ring-2 focus:ring-slate-400">✕</button>
    </div>

    <!-- corpo scrollabile -->
    <div class="drawer-body px-5 py-4 space-y-4">

      <!-- Tipo + Data/ora -->
      <div class="grid grid-cols-2 gap-3">
        <div>
          <label for="diario-tipo" class="block text-xs font-medium text-slate-700 mb-1">Tipo</label>
          <select id="diario-tipo" x-model="formDati.tipo"
                  class="w-full border border-slate-300 rounded-md px-3 py-2 text-sm
                         focus:outline-none focus:ring-2 focus:ring-blue-500">
            <template x-for="t in _tipiDiario().filter(t => !t.auto_only)" :key="t.valore">
              <option :value="t.valore" x-text="t.icona + '  ' + t.etichetta"></option>
            </template>
          </select>
        </div>
        <div>
          <label for="diario-data" class="block text-xs font-medium text-slate-700 mb-1">Data e ora</label>
          <input id="diario-data" type="datetime-local"
                 :value="formDati.data_ora ? formDati.data_ora.slice(0,16) : ''"
                 @input="formDati.data_ora = $event.target.value ? new Date($event.target.value).toISOString() : formDati.data_ora"
                 class="w-full border border-slate-300 rounded-md px-3 py-2 text-sm
                        focus:outline-none focus:ring-2 focus:ring-blue-500">
        </div>
      </div>

      <!-- Titolo -->
      <div>
        <label for="diario-titolo" class="block text-xs font-medium text-slate-700 mb-1">
          Titolo <span class="text-red-500">*</span>
          <span class="text-slate-400 font-normal">(max 120 caratteri)</span>
        </label>
        <input id="diario-titolo" type="text" x-model="formDati.titolo" maxlength="120"
               placeholder="Oggetto sintetico dell'annotazione…"
               class="w-full border border-slate-300 rounded-md px-3 py-2 text-sm
                      focus:outline-none focus:ring-2 focus:ring-blue-500">
      </div>

      <!-- Descrizione -->
      <div>
        <label for="diario-descrizione" class="block text-xs font-medium text-slate-700 mb-1">
          Descrizione
        </label>
        <textarea id="diario-descrizione" rows="4" x-model="formDati.descrizione"
                  placeholder="Dettaglio dell'annotazione…"
                  class="w-full border border-slate-300 rounded-md px-3 py-2 text-sm resize-none
                         focus:outline-none focus:ring-2 focus:ring-blue-500
                         placeholder:text-slate-400"></textarea>
      </div>

      <!-- Soggetti (select multipla) -->
      <div>
        <label for="diario-soggetti" class="block text-xs font-medium text-slate-700 mb-1">
          Soggetti <span class="text-slate-400 font-normal">(Ctrl/Cmd + click per selezione multipla)</span>
        </label>
        <select id="diario-soggetti" multiple size="5"
                :value="formDati.soggetti"
                @change="onSoggettiChange($event)"
                class="w-full border border-slate-300 rounded-md px-3 py-2 text-sm
                       focus:outline-none focus:ring-2 focus:ring-blue-500">
          <optgroup label="Imprese">
            <template x-for="s in _tuttiSoggetti().imprese" :key="s.valore">
              <option :value="s.valore"
                      :selected="(formDati.soggetti ?? []).includes(s.valore)"
                      x-text="s.valore"></option>
            </template>
          </optgroup>
          <optgroup label="Personale sicurezza">
            <template x-for="s in _tuttiSoggetti().persone" :key="s.valore">
              <option :value="s.valore"
                      :selected="(formDati.soggetti ?? []).includes(s.valore)"
                      x-text="s.valore"></option>
            </template>
          </optgroup>
          <optgroup label="Enti / Terzi">
            <template x-for="s in _tuttiSoggetti().terzi" :key="s.valore">
              <option :value="s.valore"
                      :selected="(formDati.soggetti ?? []).includes(s.valore)"
                      x-text="s.valore"></option>
            </template>
          </optgroup>
        </select>
        <!-- Soggetti selezionati come pill -->
        <div x-show="(formDati.soggetti ?? []).length > 0" class="mt-1 flex flex-wrap gap-1">
          <template x-for="s in (formDati.soggetti ?? [])" :key="s">
            <span class="text-xs bg-blue-100 text-blue-800 px-2 py-0.5 rounded-full"
                  x-text="s"></span>
          </template>
        </div>
      </div>

      <!-- Allegati -->
      <div>
        <div class="flex items-center justify-between mb-1">
          <label class="text-xs font-medium text-slate-700">Allegati</label>
          <label class="cursor-pointer text-xs text-blue-600 hover:text-blue-800">
            <input type="file" multiple accept=".pdf,.png,.jpg,.jpeg,.docx,.xlsx"
                   class="sr-only" @change="onAllegatoFile($event)">
            📎 Aggiungi file
          </label>
        </div>
        <div x-show="(formDati.allegati ?? []).length === 0"
             class="text-xs text-slate-400">Nessun allegato.</div>
        <ul class="space-y-1">
          <template x-for="(all, idx) in (formDati.allegati ?? [])" :key="idx">
            <li class="flex items-center gap-2 text-xs bg-slate-50 rounded px-2 py-1">
              <button x-show="all.base64" type="button"
                      @click="ALLEGATI.apriAllegato(all.base64, all.filename)"
                      class="text-blue-700 hover:text-blue-900 truncate text-left flex-1
                             focus:outline-none focus:ring-1 focus:ring-blue-400 rounded"
                      :title="all.filename" x-text="'📎 ' + all.filename"></button>
              <span x-show="!all.base64"
                    class="text-slate-400 truncate flex-1 cursor-not-allowed"
                    x-text="'📎 ' + all.filename" title="Documento non disponibile"></span>
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

      <!-- Riferimenti URL -->
      <div>
        <label class="block text-xs font-medium text-slate-700 mb-1">Riferimenti URL <span class="text-slate-400 font-normal">(opzionali)</span></label>
        <div class="flex gap-2 mb-1">
          <input type="url" x-model="nuovoUrl" placeholder="https://…"
                 @keydown.enter.prevent="aggiungiUrl()"
                 class="flex-1 border border-slate-300 rounded-md px-3 py-1.5 text-xs
                        focus:outline-none focus:ring-2 focus:ring-blue-500">
          <button type="button" @click="aggiungiUrl()"
                  class="text-xs text-blue-600 border border-blue-300 px-2 py-1 rounded-md
                         hover:bg-blue-50 focus:outline-none focus:ring-2 focus:ring-blue-400">
            Aggiungi
          </button>
        </div>
        <ul class="space-y-0.5">
          <template x-for="(url, idx) in (formDati.riferimenti_url ?? [])" :key="idx">
            <li class="flex items-center gap-2 text-xs">
              <a :href="url" target="_blank" rel="noopener"
                 class="text-blue-600 hover:underline truncate flex-1" x-text="url"></a>
              <button type="button" @click="rimuoviUrl(idx)"
                      class="text-red-400 hover:text-red-700 flex-shrink-0
                             focus:outline-none focus:ring-1 focus:ring-red-400 rounded">×</button>
            </li>
          </template>
        </ul>
      </div>

    </div><!-- /corpo -->

    <!-- footer fisso -->
    <div class="drawer-footer px-5 py-4 border-t border-slate-200 bg-slate-50">
      <p class="text-xs text-slate-400 mb-3">
        Il salvataggio non è mai bloccato. Il titolo è necessario per identificare la voce.
      </p>
      <div class="flex gap-2 justify-end flex-wrap">
        <button @click="chiudiDrawer(false)"
                class="text-sm text-slate-500 hover:text-slate-700 px-4 py-2
                       border border-slate-300 rounded-lg transition-colors
                       focus:outline-none focus:ring-2 focus:ring-slate-400">
          Annulla
        </button>
        <button @click="salvaVoce()" :disabled="salvando"
                class="text-sm text-slate-700 bg-white hover:bg-slate-50 disabled:opacity-50
                       px-4 py-2 border border-slate-300 rounded-lg transition-colors
                       focus:outline-none focus:ring-2 focus:ring-slate-400">
          <span x-text="salvando ? 'Salvataggio…' : 'Salva bozza'"></span>
        </button>
        <button @click="apriFirmaPerDrawer()" :disabled="salvando"
                class="text-sm bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white
                       font-medium px-4 py-2 rounded-lg transition-colors
                       focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2">
          ✍ Salva e firma
        </button>
      </div>
    </div>

  </div><!-- /drawer -->


  <!-- ═══════════════════════════════════════════════════════════════
       DRAWER DETTAGLIO — sola lettura (voci firmate e AUTO).
       Stessa struttura del drawer di modifica; nessun campo editabile.
       ═══════════════════════════════════════════════════════════════ -->
  <div x-show="dettaglioAperto" x-cloak
       class="drawer-backdrop" @click="chiudiDettaglio()" aria-hidden="true"></div>

  <div x-show="dettaglioAperto" x-cloak
       @keydown.escape.window="chiudiDettaglio()"
       class="drawer" role="dialog" aria-modal="true" aria-label="Dettaglio annotazione">

    <!-- header fisso -->
    <div class="drawer-header flex items-center justify-between px-5 py-4 border-b border-slate-200 bg-white">
      <div>
        <h2 class="text-base font-semibold text-slate-800">Dettaglio annotazione</h2>
        <span x-show="dettaglioVoce?.stato_voce === 'firmata'"
              class="text-xs text-green-600">✓ Firmata — sola lettura</span>
        <span x-show="dettaglioVoce?.origine === 'AUTO'"
              class="text-xs text-violet-600">🤖 Automatica — sola lettura</span>
      </div>
      <button @click="chiudiDettaglio()" aria-label="Chiudi"
              class="p-1.5 rounded hover:bg-slate-100 text-slate-500 text-lg
                     focus:outline-none focus:ring-2 focus:ring-slate-400">✕</button>
    </div>

    <!-- corpo scrollabile -->
    <div class="drawer-body px-5 py-4">
      <template x-if="dettaglioVoce">
        <div class="space-y-4">

          <!-- Tipo + data/ora -->
          <div class="grid grid-cols-2 gap-3">
            <div>
              <p class="text-xs font-medium text-slate-500 mb-1">Tipo</p>
              <span :class="tipoInfo(dettaglioVoce.tipo).cls"
                    class="inline-flex text-xs px-2 py-0.5 rounded-full font-medium"
                    x-text="tipoInfo(dettaglioVoce.tipo).icona + ' ' + tipoInfo(dettaglioVoce.tipo).etichetta">
              </span>
            </div>
            <div>
              <p class="text-xs font-medium text-slate-500 mb-1">Data e ora</p>
              <p class="text-sm text-slate-700" x-text="UTILS.formatDataOra(dettaglioVoce.data_ora)"></p>
            </div>
          </div>

          <!-- Titolo -->
          <div>
            <p class="text-xs font-medium text-slate-500 mb-1">Titolo</p>
            <p class="text-sm font-semibold text-slate-800" x-text="dettaglioVoce.titolo || '—'"></p>
          </div>

          <!-- Descrizione -->
          <div x-show="dettaglioVoce.descrizione">
            <p class="text-xs font-medium text-slate-500 mb-1">Descrizione</p>
            <p class="text-sm text-slate-700 whitespace-pre-wrap leading-relaxed"
               x-text="dettaglioVoce.descrizione"></p>
          </div>

          <!-- Soggetti -->
          <div x-show="(dettaglioVoce.soggetti ?? []).length > 0">
            <p class="text-xs font-medium text-slate-500 mb-1">Soggetti</p>
            <div class="flex flex-wrap gap-1">
              <template x-for="s in (dettaglioVoce.soggetti ?? [])" :key="s">
                <span class="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full" x-text="s"></span>
              </template>
            </div>
          </div>

          <!-- Allegati -->
          <div x-show="(dettaglioVoce.allegati ?? []).length > 0">
            <p class="text-xs font-medium text-slate-500 mb-1">Allegati</p>
            <ul class="space-y-1">
              <template x-for="all in (dettaglioVoce.allegati ?? [])" :key="all.filename">
                <li class="flex items-center gap-2 text-xs bg-slate-50 rounded px-2 py-1">
                  <span class="flex-1 truncate" x-text="'📎 ' + all.filename"></span>
                  <button x-show="all.base64" type="button"
                          @click="ALLEGATI.apriAllegato(all.base64, all.filename)"
                          class="text-blue-600 hover:text-blue-800
                                 focus:outline-none focus:ring-1 focus:ring-blue-400 rounded">Apri</button>
                  <button x-show="all.base64" type="button"
                          @click="ALLEGATI.scaricaAllegato(all.base64, all.filename)"
                          class="text-slate-400 hover:text-blue-600
                                 focus:outline-none focus:ring-1 focus:ring-slate-400 rounded">⬇</button>
                </li>
              </template>
            </ul>
          </div>

          <!-- Riferimenti URL -->
          <div x-show="(dettaglioVoce.riferimenti_url ?? []).length > 0">
            <p class="text-xs font-medium text-slate-500 mb-1">Riferimenti URL</p>
            <ul class="space-y-0.5">
              <template x-for="url in (dettaglioVoce.riferimenti_url ?? [])" :key="url">
                <li>
                  <a :href="url" target="_blank" rel="noopener"
                     class="text-xs text-blue-600 hover:underline break-all" x-text="url"></a>
                </li>
              </template>
            </ul>
          </div>

          <!-- Firma -->
          <div x-show="dettaglioVoce.firma" class="border-t border-slate-100 pt-3">
            <p class="text-xs font-medium text-slate-500 mb-2">Firma</p>
            <div class="bg-green-50 border border-green-200 rounded-lg p-3">
              <p class="text-xs text-green-700 mb-2"
                 x-text="'Firmata da ' + (dettaglioVoce.firma?.firmato_da || '—') +
                          ' · ' + UTILS.formatDataOra(dettaglioVoce.firma?.firmato_il)">
              </p>
              <img x-show="dettaglioVoce.firma?.firma_png_base64"
                   :src="dettaglioVoce.firma?.firma_png_base64"
                   class="max-h-14 border border-green-200 rounded bg-white" alt="Firma">
            </div>
          </div>

        </div>
      </template>
    </div>

    <!-- footer fisso -->
    <div class="drawer-footer px-5 py-4 border-t border-slate-200 bg-slate-50 flex justify-end">
      <button @click="chiudiDettaglio()"
              class="text-sm text-slate-600 hover:text-slate-800 px-5 py-2
                     border border-slate-300 rounded-lg bg-white hover:bg-slate-50 transition-colors
                     focus:outline-none focus:ring-2 focus:ring-slate-400">
        Chiudi
      </button>
    </div>

  </div><!-- /drawer dettaglio -->


  <!-- ═══════════════════════════════════════════════════════════════
       PANNELLO FIRMA — overlay centrato, a due pannelli adattativi.
       • Pannello A (permanente): default se firma M2 disponibile.
       • Pannello B (canvas, x-if): montato solo su richiesta esplicita.
       ═══════════════════════════════════════════════════════════════ -->
  <div x-show="firmaModal" x-cloak
       class="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
       @click.self="firmaModal = false; _firmaVoceId = null; _firmaUsaCanvas = false"
       @keydown.escape.window="firmaModal = false; _firmaVoceId = null; _firmaUsaCanvas = false">

    <div class="bg-white rounded-2xl shadow-2xl p-6 w-full max-w-lg">

      <h3 class="text-base font-semibold text-slate-800 mb-4">Firma annotazione</h3>

      <!-- === PANNELLO A: firma permanente (default se disponibile) === -->
      <div x-show="_firmaPermanenteDisponibile() && !_firmaUsaCanvas">
        <p class="text-xs text-slate-500 mb-3">
          Usa la firma salvata nelle Impostazioni — nessun disegno necessario.
        </p>
        <div class="border border-slate-200 rounded-lg bg-slate-50 flex justify-center items-center py-4 mb-4">
          <img :src="IMPOSTAZIONI_SERVICE.firma()?.firma_png_base64"
               class="max-h-16 max-w-full" alt="Firma permanente">
        </div>
        <button type="button" @click="usaFirmaPermanente()"
                class="w-full bg-green-600 hover:bg-green-700 text-white text-sm font-medium
                       py-2.5 rounded-lg transition-colors mb-2
                       focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2">
          ✍ Applica firma salvata
        </button>
        <div class="flex gap-2">
          <button type="button" @click="_firmaUsaCanvas = true"
                  class="flex-1 text-xs text-slate-500 hover:text-slate-700 py-2
                         border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors
                         focus:outline-none focus:ring-2 focus:ring-slate-400">
            ✏ Disegna firma
          </button>
          <button type="button" @click="firmaModal = false; _firmaVoceId = null; _firmaUsaCanvas = false"
                  class="flex-1 text-xs text-slate-500 hover:text-slate-700 py-2
                         border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors
                         focus:outline-none focus:ring-2 focus:ring-slate-400">
            Annulla
          </button>
        </div>
      </div>

      <!-- === PANNELLO B: canvas (montato on-demand con x-if) === -->
      <template x-if="!_firmaPermanenteDisponibile() || _firmaUsaCanvas">
        <div x-data="FirmaCanvas()" x-init="init()"
             @firma-acquisita.window="if (firmaModal) { onFirmaAcquisita($event.detail.png, 'canvas'); }"
             @firma-annullata.window="firmaModal = false; _firmaVoceId = null; _firmaUsaCanvas = false">

          <canvas x-ref="canvas"
                  class="block border border-slate-200 rounded-lg w-full touch-none cursor-crosshair"
                  style="height:110px"
                  @pointerdown="startDraw($event)" @pointermove="draw($event)"
                  @pointerup="endDraw()" @pointerleave="endDraw()"
                  @touchstart.prevent="startDraw($event)" @touchmove.prevent="draw($event)"
                  @touchend="endDraw()">
          </canvas>
          <p class="text-xs text-slate-400 mt-1 mb-3">Traccia la firma con il mouse, il dito o lo stilo.</p>

          <!-- Torna al pannello permanente se disponibile -->
          <button type="button" x-show="_firmaPermanenteDisponibile()"
                  @click="_firmaUsaCanvas = false"
                  class="w-full text-xs text-slate-500 hover:text-slate-700 py-1.5 mb-3
                         border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors
                         focus:outline-none focus:ring-2 focus:ring-slate-400">
            ← Usa firma salvata
          </button>

          <div class="flex gap-3 justify-end">
            <button type="button" @click="pulisci()"
                    class="text-sm text-slate-500 px-4 py-2 border border-slate-300 rounded-lg
                           hover:bg-slate-50 transition-colors
                           focus:outline-none focus:ring-2 focus:ring-slate-400">
              Pulisci
            </button>
            <button type="button" @click="$dispatch('firma-annullata')"
                    class="text-sm text-slate-500 px-4 py-2 border border-slate-300 rounded-lg
                           hover:bg-slate-50 transition-colors
                           focus:outline-none focus:ring-2 focus:ring-slate-400">
              Annulla
            </button>
            <button type="button" @click="usa()"
                    class="text-sm bg-green-600 hover:bg-green-700 text-white font-medium
                           px-5 py-2 rounded-lg transition-colors
                           focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2">
              Applica firma
            </button>
          </div>
        </div>
      </template>

    </div>
  </div>

</div>
`;

// ── Registrazione ─────────────────────────────────────────────────────────────

window.MODULI_REGISTRATI = window.MODULI_REGISTRATI ?? {};
window.MODULI_REGISTRATI['diario-cse'] = {
  monta(contenitore) { contenitore.innerHTML = _TEMPLATE_DIARIO; },
};
