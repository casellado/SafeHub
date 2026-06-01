/**
 * impostazioni-service.js — Singleton per le impostazioni globali del PO.
 *
 * Caricato una volta in completaAvvio() (prima di app.setStato('pronto')),
 * resta in memoria per tutta la sessione. Tutti i moduli leggono da qui,
 * solo M2 scrive tramite salva().
 *
 * Storage: file canonico SafeHub-CSE-Lavori/_config/impostazioni-archivio.json
 *          cache IDB store impostazioni_archivio, key 'config'.
 * Schema:  M2-Impostazioni-Globali.md §3.
 */

const IMPOSTAZIONI_SERVICE = (() => {

  let _dati         = null;
  let _configHandle = null;   // handle della cartella _config/

  // ---- Valori di default (precompilati con placeholder editabili) ----
  const DEFAULT = {
    schema_version: '1.0',
    aggiornato_il: null,

    cse: {
      nome_cognome:         '',
      qualifica:            'Coordinatore Sicurezza in fase di Esecuzione',
      titolo_professionale: '',
      estremi:              '',
    },

    firma_permanente: {
      firma_png_base64: null,
      acquisita_il:     null,
      tipo_firma:       'permanente',
    },

    logo_aziendale: {
      png_base64:  null,
      descrizione: '',
    },

    // Codici placeholder — il PO li aggiorna con i valori reali del sistema qualità
    moduli_qualita: {
      'verbale-sopralluogo':  { codice: 'Mod.VS.01', versione: 'Rev.1 — 2026', titolo: 'Verbale di sopralluogo' },
      'verbale-riunione':     { codice: 'Mod.VR.01', versione: 'Rev.1 — 2026', titolo: 'Verbale di riunione di coordinamento' },
      'verifica-pos':         { codice: 'Mod.VP.01', versione: 'Rev.1 — 2026', titolo: 'Verifica idoneità POS' },
      'verifica-itp':         { codice: 'Mod.IT.01', versione: 'Rev.1 — 2026', titolo: 'Verifica idoneità tecnico-professionale' },
      'proposta-sospensione': { codice: 'Mod.PS.01', versione: 'Rev.1 — 2026', titolo: 'Proposta di sospensione lavori' },
      'non-conformita':       { codice: 'Mod.NC.01', versione: 'Rev.1 — 2026', titolo: 'Non conformità' },
      'evento-incidentale':   { codice: 'Mod.EI.01', versione: 'Rev.1 — 2026', titolo: 'Evento incidentale' },
    },

    // Soglie da Anagrafica.md §5.4 — preavvisi calibrati sulla criticità
    soglie_scadenza: {
      abilitazione_operatore:   { giorni: 60, criticita: 'critica' },
      verifica_periodica_mezzo:            { giorni: 60, criticita: 'critica' },
      verifica_mezzo_non_sollevamento:     { giorni: 30, criticita: 'normale' },
      verifica_attrezzatura:               { giorni: 30, criticita: 'normale' },
      nolo_fine_contratto:                 { giorni: 30, criticita: 'alta'    },
      idoneita_sanitaria:                  { giorni: 45, criticita: 'critica' },
      pimus_ponteggi:                      { giorni: 60, criticita: 'critica' },
      patente_crediti:                     { giorni: 45, criticita: 'critica' },
      formazione:                          { giorni: 45, criticita: 'alta'    },
      durc:                                { giorni: 30, criticita: 'alta'    },
      polizza_rc:                          { giorni: 30, criticita: 'alta'    },
      default:                             { giorni: 30, criticita: 'normale' },
    },

    preferenze_app: {
      ultimo_cantiere_id:        null,
      soglia_sync_avviso_giorni: 7,
      tema:                      'chiaro',
    },
  };

  // ---- Boot ----

  /**
   * Carica impostazioni da _config/impostazioni-archivio.json.
   * Crea la cartella _config/ se non esiste (idempotente).
   * Fallback ordinato: file → cache IDB → valori di default.
   * @param {FileSystemDirectoryHandle} rootHandle
   */
  const carica = async (rootHandle) => {
    // _config/ è globale (radice di SafeHub-CSE-Lavori), non per-cantiere
    _configHandle = await rootHandle.getDirectoryHandle('_config', { create: true });

    try {
      const json = await FILESYSTEM.leggiJson(_configHandle, 'impostazioni-archivio.json');
      // Deep-merge con i default: garantisce che i campi aggiunti in versioni future esistano
      _dati = _merge(DEFAULT, json);
      await IDB.idbPut('impostazioni_archivio', { key: 'config', dati: _dati });
    } catch (err) {
      if (err.name !== 'NotFoundError') {
        console.error('[IMPOSTAZIONI_SERVICE/carica]', err);
      }
      // Prima apertura o file non accessibile: prova la cache IDB
      const cached = await IDB.idbGet('impostazioni_archivio', 'config').catch(() => null);
      _dati = cached?.dati
        ? _merge(DEFAULT, cached.dati)
        : { ...DEFAULT, aggiornato_il: new Date().toISOString() };
    }

    return _dati;
  };

  // ---- Scrittura ----

  /**
   * Salva un aggiornamento parziale (una sezione alla volta).
   * Scrive su file + aggiorna cache IDB.
   * @param {Object} aggiornamenti - chiavi di primo livello di _dati da sovrascrivere
   */
  const salva = async (aggiornamenti) => {
    if (!_configHandle) {
      throw new Error('Impostazioni non caricate — carica() non ancora chiamato.');
    }
    _dati = { ..._dati, ...aggiornamenti, aggiornato_il: new Date().toISOString() };
    await FILESYSTEM.scriviJson(_configHandle, 'impostazioni-archivio.json', _dati);
    await IDB.idbPut('impostazioni_archivio', { key: 'config', dati: _dati });
  };

  // ---- API sola lettura (per M6, M4, Flussi A/B) ----

  /** @returns {{nome_cognome, qualifica, titolo_professionale, estremi}} */
  const cse    = () => _dati?.cse ?? DEFAULT.cse;

  /** @returns {{firma_png_base64, acquisita_il, tipo_firma}} */
  const firma  = () => _dati?.firma_permanente ?? DEFAULT.firma_permanente;

  /** @returns {{png_base64, descrizione}} */
  const logo   = () => _dati?.logo_aziendale ?? DEFAULT.logo_aziendale;

  /**
   * Restituisce i dati del modulo qualità per un tipo di documento.
   * @param {string} tipo - es. 'verbale-riunione'
   * @returns {{codice, versione, titolo}}
   */
  const modulo = (tipo) =>
    _dati?.moduli_qualita?.[tipo] ?? DEFAULT.moduli_qualita[tipo] ?? { codice: '', versione: '', titolo: tipo };

  /** @returns {Object} tutte le soglie */
  const soglie = () => _dati?.soglie_scadenza ?? DEFAULT.soglie_scadenza;

  /**
   * Soglia per un tipo specifico, con fallback al default.
   * @param {string} tipo - es. 'durc'
   * @returns {{giorni: number, criticita: string}}
   */
  const soglia = (tipo) =>
    _dati?.soglie_scadenza?.[tipo] ??
    _dati?.soglie_scadenza?.default ??
    DEFAULT.soglie_scadenza.default;

  // ---- Utilità interna ----

  /** Deep-merge: src sovrascrive defaults dove presente, conserva i campi default mancanti in src. */
  const _merge = (defaults, src) => {
    if (!src || typeof src !== 'object' || Array.isArray(src)) return src ?? defaults;
    const out = { ...defaults };
    for (const k of Object.keys(src)) {
      out[k] = (src[k] !== null && typeof src[k] === 'object' && !Array.isArray(src[k]) &&
                typeof defaults[k] === 'object' && defaults[k] !== null)
        ? _merge(defaults[k], src[k])
        : src[k];
    }
    return out;
  };

  return {
    carica, salva,
    cse, firma, logo, modulo, soglie, soglia,
    get dati()      { return _dati; },
    get isCaricato(){ return _dati !== null; },
    get DEFAULT()   { return DEFAULT; },
  };
})();
