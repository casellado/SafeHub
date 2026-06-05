/**
 * anagrafica-service.js — CRUD per anagrafica_<id>.json.
 *
 * Singleton che gestisce un cantiere alla volta.
 * Principio: file = stato. Il JSON è canonico; l'IDB è cache.
 *
 * Usato da M4 (Imprese, Lavoratori, Mezzi, Attrezzature, Noli, Persone).
 * Non gestisce logica UI: solo I/O e calcoli puri (conformità, scadenze).
 */

const ANAGRAFICA_SERVICE = (() => {

  // ================================================================
  // MATRICE CONFORMITÀ — PUNTO UNICO per le regole normative.
  // Fonte: schema-anagrafica-canonico-v2.md §12 e §12.2.
  //
  // Per correggere/aggiornare le regole: modificare SOLO questa struttura.
  // La logica di calcolaConformita() legge da qui senza hard-code inline.
  //
  //   obbligatori  → assenza = stato rosso
  //   condizionati → assenza = stato giallo (da valutare)
  //   patenteCrediti → true = la regola critica (<15 o SOSPESA/REVOCATA)
  //                    si applica; genera rosso non silenziabile
  // ================================================================
  const CONFORMITA_MATRIX = {
    APPALTO: {
      obbligatori:  ['CCIAA', 'DVR', 'DURC', 'DICH_ART14', 'POS'],
      condizionati: ['DOMA', 'POLIZZA_RC', 'NOMINA_RSPP', 'NOMINA_MEDICO', 'DESIGNAZIONE_RLS'],
      patenteCrediti: true,
    },
    SUBAPPALTO: {
      obbligatori:  ['CCIAA', 'DVR', 'DURC', 'DICH_ART14', 'POS', 'CONTRATTO_SUBAPPALTO'],
      condizionati: ['DOMA', 'POLIZZA_RC', 'NOMINA_RSPP', 'NOMINA_MEDICO', 'DESIGNAZIONE_RLS', 'AUTORIZZAZIONE_SUBAPPALTO'],
      patenteCrediti: true,
    },
    FORNITURA_POSA: {
      obbligatori:  ['CCIAA', 'DVR', 'DURC', 'POS'],
      condizionati: ['POLIZZA_RC'],
      patenteCrediti: true,
    },
    NOLO_CALDO: {
      // Sotto soglia: solo attestazione + operatore; sopra soglia → usa SUBAPPALTO (gestito in calcolaConformita)
      obbligatori:  ['ATTESTAZIONE_BUONO_STATO'],
      condizionati: ['POLIZZA_RC'],
      patenteCrediti: false,
    },
    NOLO_FREDDO: {
      obbligatori:  ['ATTESTAZIONE_BUONO_STATO'],
      condizionati: [],
      patenteCrediti: false,
    },
    FORNITURA: {
      obbligatori:  [],
      condizionati: ['CCIAA', 'DURC'],
      patenteCrediti: false,
    },
    SERVIZIO: {
      obbligatori:  [],
      condizionati: [],
      patenteCrediti: false,
    },
    LAV_AUTONOMO: {
      obbligatori:  ['CCIAA', 'DURC'],
      condizionati: ['POLIZZA_RC'],
      patenteCrediti: true,
    },
  };

  // Mapping tipo documento → chiave soglia (IMPOSTAZIONI_SERVICE.soglia)
  const DOC_A_SOGLIA = { DURC: 'durc', POLIZZA_RC: 'polizza_rc' };

  // Etichette leggibili per i tipi di documento (nei messaggi di conformità)
  const LABEL_DOC = {
    POS: 'POS', DURC: 'DURC', CCIAA: 'Iscrizione CCIAA', DVR: 'DVR',
    POLIZZA_RC: 'Polizza RC', DOMA: 'DOMA (art.90)', CONTRATTO_SUBAPPALTO: 'Contratto subappalto',
    AUTORIZZAZIONE_SUBAPPALTO: 'Autorizzazione subappalto', DICH_ART14: 'Dichiarazione art.14',
    NOMINA_RSPP: 'Nomina RSPP', NOMINA_MEDICO: 'Nomina Medico Competente',
    DESIGNAZIONE_RLS: 'Designazione RLS', ATTESTAZIONE_BUONO_STATO: 'Attestazione buono stato',
    ALTRO: 'Altro documento',
  };

  // ================================================================
  // TIPI ABILITAZIONE OPERATORI — PUNTO UNICO per la lista e la criticità.
  // Fonte: Accordo Stato-Regioni 22/02/2012 (att. art.73 c.5 D.Lgs 81/08).
  // Per aggiungere/togliere un tipo di macchina: modificare SOLO questo array.
  // Il valore `valore` è la stringa salvata nel JSON (identica a ciò che SafeCant legge).
  // critica: true → scadenza usa soglia `abilitazione_operatore` (60gg, 🔴 non silenziabile).
  //          false → usa soglia `default` (30gg, 🟢 normale).
  // ================================================================
  const TIPI_ABILITAZIONE_OPERATORE = [
    { valore: 'PLE',             etichetta: 'Piattaforme di lavoro elevabili (PLE)',          critica: true  },
    { valore: 'GRU_TORRE',       etichetta: 'Gru a torre',                                    critica: true  },
    { valore: 'GRU_MOBILE',      etichetta: 'Gru mobile (autogru)',                           critica: true  },
    { valore: 'GRU_AUTOCARRO',   etichetta: 'Gru per autocarro',                              critica: true  },
    { valore: 'CARRELLO_ELEVATORE', etichetta: 'Carrelli elevatori semoventi',                critica: true  },
    { valore: 'MOVIMENTO_TERRA', etichetta: 'Escavatori / pale / terne / movimento terra',    critica: true  },
    { valore: 'POMPA_CLS',       etichetta: 'Pompe per calcestruzzo',                         critica: true  },
    { valore: 'TRATTORE',        etichetta: 'Trattori agricoli o forestali',                  critica: true  },
    { valore: 'ALTRO',           etichetta: 'Altro (testo libero)',                           critica: false },
  ];
  // Set dei valori critici: usato da calcolaScadenzeLavoratore per determinare la soglia
  const _TIPI_CRITICI = new Set(
    TIPI_ABILITAZIONE_OPERATORE.filter(t => t.critica).map(t => t.valore)
  );

  // ================================================================
  // TIPI MEZZO — PUNTO UNICO per i tipi di macchina e la criticità verifica.
  // sollevamento: true → D.M. 11/04/2011 verifiche INAIL obbligatorie (art.71 c.11)
  //              → soglia 'verifica_periodica_mezzo' (60gg, critica).
  //              false → soglia 'verifica_mezzo_non_sollevamento' (30gg, normale).
  // ================================================================
  const TIPI_MEZZO = [
    { valore: 'GRU_TORRE',       etichetta: 'Gru a torre',                        sollevamento: true  },
    { valore: 'GRU_MOBILE',      etichetta: 'Gru mobile (autogru)',                sollevamento: true  },
    { valore: 'GRU_AUTOCARRO',   etichetta: 'Gru per autocarro',                  sollevamento: true  },
    { valore: 'PLE',             etichetta: 'Piattaforma di lavoro elevabile (PLE)', sollevamento: true  },
    { valore: 'ARGANO',          etichetta: 'Argano / paranchi >200 kg',           sollevamento: true  },
    { valore: 'MONTACARICHI',    etichetta: 'Montacarichi',                        sollevamento: true  },
    { valore: 'ESCAVATORE',      etichetta: 'Escavatore',                          sollevamento: false },
    { valore: 'PALA_CARICATRICE',etichetta: 'Pala caricatrice',                   sollevamento: false },
    { valore: 'TERNA',           etichetta: 'Terna',                               sollevamento: false },
    { valore: 'AUTOCARRO',       etichetta: 'Autocarro / camion',                  sollevamento: false },
    { valore: 'POMPA_CLS',       etichetta: 'Pompa per calcestruzzo',              sollevamento: false },
    { valore: 'ALTRO',           etichetta: 'Altro (testo libero)',                sollevamento: false },
  ];
  const _TIPI_MEZZO_SOLLEVAMENTO = new Set(
    TIPI_MEZZO.filter(t => t.sollevamento).map(t => t.valore)
  );

  // ================================================================
  // TIPOLOGIE ATTREZZATURA — PUNTO UNICO.
  // ponteggio: true → PiMUS obbligatorio → soglia 'pimus_ponteggi' (60gg, critica).
  // ================================================================
  const TIPOLOGIE_ATTREZZATURA = [
    { valore: 'PONTEGGIO',      etichetta: 'Ponteggio (PiMUS obbligatorio)', ponteggio: true  },
    { valore: 'TRABATTELLO',    etichetta: 'Trabattello',                    ponteggio: false },
    { valore: 'BETONIERA',      etichetta: 'Betoniera',                      ponteggio: false },
    { valore: 'COMPRESSORE',    etichetta: 'Compressore',                    ponteggio: false },
    { valore: 'UTENSILE',       etichetta: 'Utensile',                       ponteggio: false },
    { valore: 'DPI_COLLETTIVO', etichetta: 'DPI collettivo',                 ponteggio: false },
    { valore: 'ALTRO',          etichetta: 'Altro (testo libero)',            ponteggio: false },
  ];

  // ================================================================
  // TIPI NOLO — PUNTO UNICO.
  // tipoNolo determina i campi visibili e i documenti attesi.
  // ================================================================
  const TIPI_NOLO = [
    { valore: 'FREDDO', etichetta: 'Nolo a freddo — solo mezzo, senza operatore (art.72)' },
    { valore: 'CALDO',  etichetta: 'Nolo a caldo — mezzo + operatore della ditta noleggiante' },
  ];

  // ================================================================
  // RUOLI PERSONE COMMITTENTE — PUNTO UNICO.
  // Allineato a lotto.ruoli_istituzionali per l'aggancio M3.
  // ================================================================
  const RUOLI_PERSONE_COMMITTENTE = [
    { valore: 'RUP',               etichetta: 'RUP — Responsabile Unico del Procedimento' },
    { valore: 'DL',                etichetta: 'DL — Direttore dei Lavori' },
    { valore: 'CSE_TITOLARE',      etichetta: 'CSE Titolare' },
    { valore: 'DIRETTORE_OPERATIVO', etichetta: 'Direttore Operativo' },
    { valore: 'RL',                etichetta: 'RL — Responsabile dei Lavori' },
    { valore: 'ISPETTORE_CANTIERE',etichetta: 'Ispettore di Cantiere' },
    { valore: 'ALTRO',             etichetta: 'Altro' },
  ];

  // ================================================================
  // TIPI ENTE TERZI — PUNTO UNICO.
  // ================================================================
  const TIPI_ENTE_TERZI = [
    { valore: 'SPRESAL',    etichetta: 'SPRESAL — Servizio Prevenzione e Sicurezza' },
    { valore: 'ASL',        etichetta: 'ASL' },
    { valore: 'INL',        etichetta: 'INL — Ispettorato Nazionale del Lavoro' },
    { valore: 'VVF',        etichetta: 'VVF — Vigili del Fuoco' },
    { valore: 'PROVINCIA',  etichetta: 'Provincia / Ente gestore sottoservizi' },
    { valore: 'CONSULENTE', etichetta: 'Consulente esterno' },
    { valore: 'ALTRO',      etichetta: 'Altro ente' },
  ];

  // Tipi di verifica periodica (dropdown per mezzi)
  const TIPI_VERIFICA_MEZZO = [
    { valore: 'PRIMA_VERIFICA',          etichetta: 'Prima verifica periodica (INAIL)' },
    { valore: 'VERIFICA_PERIODICA',      etichetta: 'Verifica periodica (organismo abilitato)' },
    { valore: 'CONTROLLO_FUNI',          etichetta: 'Controllo funi e catene' },
    { valore: 'CONTROLLO_GANCI',         etichetta: 'Controllo ganci' },
    { valore: 'INDAGINE_SUPPLEMENTARE',  etichetta: 'Indagine supplementare (mezzo >20 anni)' },
    { valore: 'ALTRO',                   etichetta: 'Altro' },
  ];

  // Tipi di verifica per attrezzature
  const TIPI_VERIFICA_ATT = [
    { valore: 'ISPEZIONE_VISIVA',  etichetta: 'Ispezione visiva periodica' },
    { valore: 'VERIFICA_STABILITA',etichetta: 'Verifica stabilità (ponteggio)' },
    { valore: 'MANUTENZIONE',      etichetta: 'Manutenzione ordinaria' },
    { valore: 'ALTRO',             etichetta: 'Altro' },
  ];

  // Tipi documento specifico per attrezzature (ponteggi — schema §7)
  const TIPI_DOC_SPECIFICO_ATT = [
    { valore: 'PIMUS',                   etichetta: 'PiMUS',                    critico: true  },
    { valore: 'AUTORIZZAZIONE_MINISTERIALE', etichetta: 'Autorizzazione ministeriale', critico: true  },
    { valore: 'DISEGNO_ESECUTIVO',       etichetta: 'Disegno esecutivo',        critico: false },
    { valore: 'PROGETTO_PONTEGGIO',      etichetta: 'Progetto ponteggio (>24m)', critico: false },
    { valore: 'FORMAZIONE_MONTATORI',    etichetta: 'Formazione montatori',     critico: false },
    { valore: 'ALTRO',                   etichetta: 'Altro documento specifico', critico: false },
  ];

  // Prefissi ID per collezione (schema-anagrafica-canonico-v2.md)
  const PREFISSI = {
    imprese: 'imp', lavoratori: 'lav', mezzi: 'mzo', attrezzature: 'att',
    noli: 'nol', persone_committente: 'pc', persone_terzi: 'pt',
  };

  // ================================================================
  // Stato in memoria
  // ================================================================
  let _dati       = null;   // anagrafica completa (tutte le 8 collezioni)
  let _cantiereId = null;

  // ================================================================
  // Listener cantiere-cambiato (cambi di cantiere post-boot)
  // ================================================================
  document.addEventListener('cantiere-cambiato', async (e) => {
    if (e.detail.id && e.detail.id !== _cantiereId) {
      await carica(e.detail.id);
    } else if (!e.detail.id) {
      _dati = null; _cantiereId = null;
    }
  });

  // ================================================================
  // Lettura e scrittura
  // ================================================================

  /**
   * Carica l'anagrafica del cantiere in memoria.
   * Chiamato esplicitamente da completaAvvio() (passo 4c) e dal listener cantiere-cambiato.
   * Dispatcha 'anagrafica-caricata' al termine (sia OK sia fallimento).
   */
  const carica = async (cantiereId) => {
    const root = FILESYSTEM.getHandleAttivo();
    if (!root || !cantiereId) { _dati = null; _cantiereId = cantiereId; return null; }

    try {
      const cantHandle = await root.getDirectoryHandle(cantiereId);
      const anagDir    = await cantHandle.getDirectoryHandle('15_Anagrafica');
      _dati = await FILESYSTEM.leggiJson(anagDir, `anagrafica_${cantiereId}.json`);
      // Migrazione soft: rinomina cseDelegatoId → direttoreOperativoId se presente
      // nei file creati prima della correzione normativa del 01/06/2026.
      const ri = _dati?.lotto?.ruoli_istituzionali;
      if (ri && 'cseDelegatoId' in ri) {
        if (!('direttoreOperativoId' in ri)) ri.direttoreOperativoId = ri.cseDelegatoId;
        delete ri.cseDelegatoId;
      }
      _cantiereId = cantiereId;
      await _aggiornaCache();
    } catch (err) {
      if (err.name !== 'NotFoundError') {
        ERRORI.gestisciErrore('anagrafica/carica', err, { silenziato: true });
      }
      _dati = null; _cantiereId = cantiereId;
    }
    document.dispatchEvent(new CustomEvent('anagrafica-caricata', { detail: { cantiereId } }));
    return _dati;
  };

  /**
   * Salva UNA collezione nel file (merge parziale).
   * Le altre 7 collezioni non vengono toccate.
   * @param {string} nomeCollezione
   * @param {Array}  nuoviDati
   */
  const salvaCollezione = async (nomeCollezione, nuoviDati) => {
    if (!_cantiereId) throw new Error('Nessun cantiere caricato.');

    const root    = FILESYSTEM.getHandleAttivo();
    const cantDir = await root.getDirectoryHandle(_cantiereId);
    const anagDir = await cantDir.getDirectoryHandle('15_Anagrafica');

    // Merge parziale: solo la collezione indicata cambia
    _dati = {
      ...(_dati ?? {}),
      [nomeCollezione]: nuoviDati,
      generato_il: new Date().toISOString(),
    };
    await FILESYSTEM.scriviJson(anagDir, `anagrafica_${_cantiereId}.json`, _dati);
    await _aggiornaCache();
  };

  /** Aggiorna cache IDB dopo ogni scrittura. */
  const _aggiornaCache = async () => {
    if (!_dati || !_cantiereId) return;
    const nImprese = _dati.imprese?.filter(i => !i._cestino).length ?? 0;
    await IDB.idbPut('cache_anagrafica', {
      cantiere_id: _cantiereId,
      n_imprese: nImprese,
      ultimo_aggiornamento_at: new Date().toISOString(),
    });
    const cached = await IDB.idbGet('cantieri_cache', _cantiereId);
    if (cached) await IDB.idbPut('cantieri_cache', { ...cached, n_imprese: nImprese });
  };

  // ================================================================
  // CRUD generico per tutte le collezioni
  // ================================================================

  /**
   * Restituisce la collezione (array).
   * @param {string} nome
   * @param {{inclCestino?: boolean}} [opz]
   */
  const get = (nome, opz = {}) => {
    const arr = _dati?.[nome] ?? [];
    return opz.inclCestino ? arr : arr.filter(e => !e._cestino);
  };

  const getEntita = (nome, id) => (_dati?.[nome] ?? []).find(e => e.id === id) ?? null;

  /** Aggiunge una nuova entità e salva. */
  const aggiungi = async (nome, delta) => {
    const collezione = [...get(nome, { inclCestino: true })];
    const nuova = {
      ...delta,
      id:         UTILS.generaId(PREFISSI[nome] ?? 'ent'),
      lotto_id:   _cantiereId,
      modifiedAt: new Date().toISOString(),
      modifiedBy: 'SafeHub Archivio',
    };
    delete nuova._cestino; delete nuova._eliminato_il;  // non si crea nel cestino
    collezione.push(nuova);
    await salvaCollezione(nome, collezione);
    return nuova;
  };

  /** Aggiorna un'entità esistente (merge) e salva. */
  const aggiorna = async (nome, id, delta) => {
    const collezione = [...get(nome, { inclCestino: true })];
    const idx = collezione.findIndex(e => e.id === id);
    if (idx < 0) throw new Error(`${nome}/${id} non trovata.`);
    collezione[idx] = {
      ...collezione[idx], ...delta,
      id, lotto_id: _cantiereId,
      modifiedAt: new Date().toISOString(),
      modifiedBy: 'SafeHub Archivio',
    };
    await salvaCollezione(nome, collezione);
    return collezione[idx];
  };

  /** Sposta nel cestino (soft-delete). */
  const cestina = async (nome, id) =>
    aggiorna(nome, id, { _cestino: true, _eliminato_il: new Date().toISOString() });

  /** Ripristina dal cestino. */
  const ripristina = async (nome, id) => {
    const collezione = [...get(nome, { inclCestino: true })];
    const idx = collezione.findIndex(e => e.id === id);
    if (idx < 0) return;
    const { _cestino, _eliminato_il, ...resto } = collezione[idx];
    collezione[idx] = { ...resto, modifiedAt: new Date().toISOString() };
    await salvaCollezione(nome, collezione);
  };

  /** Rimuove definitivamente (solo da cestino, non dalla lista normale). */
  const eliminaDefinitivamente = async (nome, id) => {
    const collezione = get(nome, { inclCestino: true }).filter(e => e.id !== id);
    await salvaCollezione(nome, collezione);
  };

  // ================================================================
  // Funzioni PARAMETRICHE per il Cestino globale (#2b)
  // Operano su un cantiere_id ARBITRARIO senza cambiare il cantiere corrente.
  // NON toccano _cantiereId né _dati (salvo se il cantiere parametrico == quello corrente).
  // ================================================================

  // Mappa collezione → etichetta leggibile (usata da leggiEntitaCestinate)
  const _ETICHETTE_COLL = {
    imprese:             'Impresa',
    lavoratori:          'Lavoratore',
    mezzi:               'Mezzo',
    attrezzature:        'Attrezzatura',
    noli:                'Nolo',
    persone_committente: 'Personale sicurezza',
    persone_terzi:       'Ente terzo',
  };

  // Ricava il nome identificativo di un'entità in base alla collezione
  const _nomeEntita = (collezione, e) => {
    if (collezione === 'imprese')
      return e.ragioneSociale || e.id;
    if (collezione === 'lavoratori' || collezione === 'persone_committente' || collezione === 'persone_terzi')
      return [e.cognome, e.nome].filter(Boolean).join(' ') || e.id;
    if (collezione === 'mezzi')
      return [e.tipologia, e.marca, e.modello].filter(Boolean).join(' ') || e.id;
    if (collezione === 'attrezzature')
      return [e.tipologia, e.descrizione].filter(Boolean).join(' — ') || e.id;
    if (collezione === 'noli')
      return e.oggetto || (e.tipoNolo ? `Nolo ${e.tipoNolo}` : null) || e.id;
    return e.id;
  };

  /**
   * Legge il file anagrafica di un cantiere arbitrario e restituisce tutte
   * le entità con _cestino===true, arricchite con tipo, collezione e cantiere.
   *
   * @param {string} cantiere_id
   * @returns {Promise<Array>}
   */
  const leggiEntitaCestinate = async (cantiere_id) => {
    const anag      = await CANTIERI_SERVICE.leggiAnagrafica(cantiere_id);
    const risultati = [];
    for (const col of Object.keys(_ETICHETTE_COLL)) {
      for (const e of (anag[col] ?? [])) {
        if (!e._cestino) continue;
        risultati.push({
          id:            e.id,
          collezione:    col,
          tipo:          _ETICHETTE_COLL[col],
          nome:          _nomeEntita(col, e),
          cantiere_id,
          cantiere_nome: anag.lotto?.nome ?? '',
          _eliminato_il: e._eliminato_il ?? null,
        });
      }
    }
    return risultati;
  };

  /**
   * Ripristina un'entità cestinata in un cantiere ARBITRARIO.
   * Legge il file fresco, rimuove _cestino e _eliminato_il, riscrive.
   * NON cambia il cantiere corrente; se il cantiere è quello corrente, aggiorna _dati.
   *
   * @param {string} cantiere_id
   * @param {string} collezione
   * @param {string} entita_id
   */
  const ripristinaEntitaArbitraria = async (cantiere_id, collezione, entita_id) => {
    const anag = await CANTIERI_SERVICE.leggiAnagrafica(cantiere_id);
    const coll = [...(anag[collezione] ?? [])];
    const idx  = coll.findIndex(e => e.id === entita_id);
    if (idx < 0) throw new Error(`Entità ${entita_id} non trovata in ${collezione}/${cantiere_id}`);

    const { _cestino, _eliminato_il, ...resto } = coll[idx];
    coll[idx]         = { ...resto, modifiedAt: new Date().toISOString() };
    anag[collezione]  = coll;
    anag.generato_il  = new Date().toISOString();

    const root    = FILESYSTEM.getHandleAttivo();
    const cantDir = await root.getDirectoryHandle(cantiere_id);
    const anagDir = await cantDir.getDirectoryHandle('15_Anagrafica');
    await FILESYSTEM.scriviJson(anagDir, `anagrafica_${cantiere_id}.json`, anag);

    // Aggiorna _dati in memoria solo se è il cantiere attualmente caricato
    if (cantiere_id === _cantiereId) {
      _dati = anag;
      await _aggiornaCache();
      document.dispatchEvent(new CustomEvent('anagrafica-caricata', { detail: { cantiereId: cantiere_id } }));
    }
  };

  /**
   * Elimina definitivamente un'entità cestinata in un cantiere ARBITRARIO.
   * Stessa struttura di ripristinaEntitaArbitraria: legge fresco, filtra, riscrive.
   *
   * @param {string} cantiere_id
   * @param {string} collezione
   * @param {string} entita_id
   */
  const eliminaEntitaArbitraria = async (cantiere_id, collezione, entita_id) => {
    const anag = await CANTIERI_SERVICE.leggiAnagrafica(cantiere_id);
    anag[collezione] = (anag[collezione] ?? []).filter(e => e.id !== entita_id);
    anag.generato_il = new Date().toISOString();

    const root    = FILESYSTEM.getHandleAttivo();
    const cantDir = await root.getDirectoryHandle(cantiere_id);
    const anagDir = await cantDir.getDirectoryHandle('15_Anagrafica');
    await FILESYSTEM.scriviJson(anagDir, `anagrafica_${cantiere_id}.json`, anag);

    if (cantiere_id === _cantiereId) {
      _dati = anag;
      await _aggiornaCache();
      document.dispatchEvent(new CustomEvent('anagrafica-caricata', { detail: { cantiereId: cantiere_id } }));
    }
  };

  // ================================================================
  // Calcolo conformità impresa (funzione pura — zero effetti collaterali)
  // ================================================================

  /**
   * @param {Object} impresa
   * @returns {{stato: 'verde'|'giallo'|'rosso'|'grigio', critico: boolean, problemi: Array}}
   *
   * critico: true = presenza di rosso_critico (patente revocata/sospesa o punteggio < 15)
   *          Questi non si possono silenziare finché non risolti.
   */
  const calcolaConformita = (impresa) => {
    if (!impresa?.tipoRapporto) return { stato: 'grigio', critico: false, problemi: [] };

    // NOLO_CALDO sopra soglia → usa la matrice di SUBAPPALTO
    const conf = (impresa.tipoRapporto === 'NOLO_CALDO' && impresa.superaSoglieSubappalto)
      ? CONFORMITA_MATRIX.SUBAPPALTO
      : (CONFORMITA_MATRIX[impresa.tipoRapporto] ?? { obbligatori: [], condizionati: [], patenteCrediti: false });

    const problemi = [];
    const docsAttivi = (impresa.documenti ?? []).filter(d => !d._cestino);
    const tipiPresenti = docsAttivi.map(d => d.tipo);

    // Documenti obbligatori
    for (const tipo of (conf.obbligatori ?? [])) {
      if (!tipiPresenti.includes(tipo)) {
        problemi.push({ tipo, label: LABEL_DOC[tipo] ?? tipo, livello: 'rosso', motivo: 'mancante' });
      } else {
        const doc = docsAttivi.find(d => d.tipo === tipo);
        if (doc?.scadenza) {
          const gg = UTILS.giorniAllaScadenza(doc.scadenza);
          const soglia = IMPOSTAZIONI_SERVICE.soglia(DOC_A_SOGLIA[tipo] ?? 'default');
          if (gg !== null && gg < 0) {
            problemi.push({ tipo, label: LABEL_DOC[tipo] ?? tipo, livello: 'rosso', motivo: 'scaduto', giorni: gg });
          } else if (gg !== null && gg < soglia.giorni) {
            const livello = soglia.criticita === 'critica' ? 'rosso' : 'giallo';
            problemi.push({ tipo, label: LABEL_DOC[tipo] ?? tipo, livello, motivo: 'in_scadenza', giorni: gg });
          }
        }
      }
    }

    // Documenti condizionati (solo "mancante" — non controlliamo scadenza)
    for (const tipo of (conf.condizionati ?? [])) {
      if (!tipiPresenti.includes(tipo)) {
        problemi.push({ tipo, label: LABEL_DOC[tipo] ?? tipo, livello: 'giallo', motivo: 'condizionato_mancante' });
      }
    }

    // ── Regola critica patente a crediti (separata, non silenziabile) ──────────
    // Non è derivata dalla tabella scadenze generica: è una regola normativa esplicita.
    if (conf.patenteCrediti) {
      const pat = impresa.patenteCrediti;
      const assente = !pat?.stato && (pat?.codice == null) && (pat?.punteggio == null);
      if (assente) {
        problemi.push({ tipo: 'patente_crediti', label: 'Patente a crediti', livello: 'giallo', motivo: 'non_inserita' });
      } else if (['SOSPESA', 'REVOCATA'].includes(pat?.stato)) {
        problemi.push({ tipo: 'patente_crediti', label: 'Patente a crediti', livello: 'rosso_critico', motivo: `stato_${pat.stato.toLowerCase()}` });
      } else if (pat?.punteggio != null && pat.punteggio < 15) {
        problemi.push({ tipo: 'patente_crediti', label: 'Patente a crediti', livello: 'rosso_critico', motivo: 'punteggio_insufficiente' });
      } else if (pat?.stato === 'RICHIESTA') {
        problemi.push({ tipo: 'patente_crediti', label: 'Patente a crediti', livello: 'giallo', motivo: 'in_attesa' });
      }
    }

    const critico  = problemi.some(p => p.livello === 'rosso_critico');
    const hasRosso = critico || problemi.some(p => p.livello === 'rosso');
    const hasGiallo = problemi.some(p => p.livello === 'giallo');
    const stato = hasRosso ? 'rosso' : hasGiallo ? 'giallo' : 'verde';

    return { stato, critico, problemi };
  };

  // ================================================================
  // Calcolo scadenze impresa (per i pannelli alert)
  // ================================================================
  const calcolaScadenzeImpresa = (impresa) => {
    const soglie = IMPOSTAZIONI_SERVICE.soglie();

    // Documenti a tipo fisso (schema v2.0)
    const fixed = (impresa.documenti ?? [])
      .filter(d => !d._cestino && d.scadenza)
      .map(d => {
        const gg     = UTILS.giorniAllaScadenza(d.scadenza);
        const soglia = soglie[DOC_A_SOGLIA[d.tipo] ?? 'default'] ?? soglie.default;
        const stato  = gg === null ? 'senza_data' : gg < 0 ? 'scaduto' : gg < soglia.giorni ? 'in_scadenza' : 'valido';
        return { tipo: d.tipo, label: LABEL_DOC[d.tipo] ?? d.tipo, scadenza: d.scadenza, giorni: gg, stato, criticita: soglia.criticita };
      })
      .filter(s => s.stato !== 'valido');

    // Documenti extra liberi (solo se hanno una scadenza valorizzata)
    const extra = (impresa.documenti_extra ?? [])
      .filter(d => !d._cestino && d.scadenza)
      .map(d => {
        const gg    = UTILS.giorniAllaScadenza(d.scadenza);
        const soglia = soglie.default;
        const stato  = gg === null ? 'senza_data' : gg < 0 ? 'scaduto' : gg < soglia.giorni ? 'in_scadenza' : 'valido';
        return { tipo: 'extra_' + d.id, label: d.titolo, scadenza: d.scadenza, giorni: gg, stato, criticita: soglia.criticita };
      })
      .filter(s => s.stato !== 'valido');

    return [...fixed, ...extra].sort((a, b) => (a.giorni ?? 999) - (b.giorni ?? 999));
  };

  // ================================================================
  // Calcolo scadenze lavoratore (funzione pura)
  // ================================================================

  /**
   * Restituisce le scadenze problematiche di un lavoratore
   * (visita medica, formazione, abilitazioni).
   * Usa le soglie di IMPOSTAZIONI_SERVICE (M2).
   * @param {Object} lav
   * @returns {Array<{tipo, label, scadenza, giorni, stato, criticita}>}
   */
  const calcolaScadenzeLavoratore = (lav) => {
    const soglie = IMPOSTAZIONI_SERVICE.soglie();
    const risultati = [];

    const _aggiungi = (tipo, label, scadenza, sogliaTipo, criticita) => {
      if (!scadenza) return;
      const gg     = UTILS.giorniAllaScadenza(scadenza);
      const soglia = soglie[sogliaTipo] ?? soglie.default;
      const stato  = gg === null ? 'senza_data' : gg < 0 ? 'scaduto' : gg < soglia.giorni ? 'in_scadenza' : 'valido';
      if (stato !== 'valido' && stato !== 'senza_data') {
        risultati.push({ tipo, label, scadenza, giorni: gg, stato, criticita });
      }
    };

    // Idoneità sanitaria (critica: operatore non può lavorare senza visita valida)
    _aggiungi('visita_medica', 'Idoneità sanitaria', lav.visitaMedica?.scadenza, 'idoneita_sanitaria', 'critica');

    // Attestato formazione (alta)
    _aggiungi('formazione', 'Attestato formazione', lav.attestatoFormazione?.scadenza, 'formazione', 'alta');

    // Abilitazioni: ogni patentino ha la propria scadenza
    for (const ab of (lav.abilitazioni ?? [])) {
      if (ab._cestino) continue;
      const isCritica  = _TIPI_CRITICI.has(ab.tipo);
      const sogliaTipo = isCritica ? 'abilitazione_operatore' : 'default';
      const criticita  = isCritica ? 'critica' : 'normale';
      const label      = TIPI_ABILITAZIONE_OPERATORE.find(t => t.valore === ab.tipo)?.etichetta ?? ab.tipo;
      _aggiungi('abilitazione_' + ab.tipo, label, ab.scadenza, sogliaTipo, criticita);
    }

    // Documenti extra liberi (solo se hanno una scadenza valorizzata)
    for (const d of (lav.documenti_extra ?? [])) {
      if (d._cestino || !d.scadenza) continue;
      _aggiungi('extra_' + d.id, d.titolo, d.scadenza, 'default', 'normale');
    }

    return risultati.sort((a, b) => (a.giorni ?? 999) - (b.giorni ?? 999));
  };

  /**
   * Calcola lo stato di conformità di un lavoratore.
   * La conformità è interamente scadenziale (no matrice §12).
   * @param {Object} lav
   * @returns {{stato: 'verde'|'giallo'|'rosso'|'grigio', critico: boolean, scadenze: Array}}
   */
  const calcolaConformitaLavoratore = (lav) => {
    if (!lav?.nome && !lav?.cognome) return { stato: 'grigio', critico: false, scadenze: [] };

    const scadenze = calcolaScadenzeLavoratore(lav);
    const critico  = scadenze.some(s => s.stato === 'scaduto' && s.criticita === 'critica');
    const hasRosso = critico || scadenze.some(s => s.stato === 'scaduto');
    const hasGiallo = scadenze.some(s => s.stato === 'in_scadenza');

    // Visita medica assente e non inserita: avviso giallo (guida, non blocca)
    const visitaAssente = !lav.visitaMedica?.scadenza && !lav.visitaMedica?.ente;

    const stato = hasRosso ? 'rosso' : (hasGiallo || visitaAssente) ? 'giallo' : 'verde';
    return { stato, critico, scadenze };
  };

  // ================================================================
  // Export variante leggera per SafeCant
  // ================================================================

  /**
   * Ricorsivamente:
   *  - filtra gli array rimuovendo elementi con _cestino:true
   *  - rimuove i campi _cestino e _eliminato_il da tutti gli oggetti
   *  - svuota tutti i campi base64 (impostati a "")
   *
   * Una sola passata copre qualunque livello di annidamento dello schema,
   * compresi sotto-documenti (documenti[], abilitazioni[], verifiche[], ecc.).
   */
  const _pulisciPerExport = (val) => {
    if (Array.isArray(val)) {
      return val
        .filter(item => !(item && typeof item === 'object' && item._cestino))
        .map(_pulisciPerExport);
    }
    if (val !== null && typeof val === 'object') {
      const out = {};
      for (const [k, v] of Object.entries(val)) {
        if (k === '_cestino' || k === '_eliminato_il') continue; // campi interni → esclusi
        if (k === 'base64') { out[k] = ''; continue; }          // blob → svuotato
        out[k] = _pulisciPerExport(v);
      }
      return out;
    }
    return val;
  };

  /**
   * Valida l'anagrafica prima dell'export: rileva incompletezze che renderebbero
   * i dati inutilizzabili a valle (SafeCant). NON blocca l'export.
   * @returns {{ ok: boolean, warnings: Array<{etichetta:string, dettaglio:string[]}> }}
   */
  const validaPreExport = () => {
    if (!_dati) return { ok: true, warnings: [] };
    const warnings = [];
    const attive = (col) => (_dati[col] ?? []).filter(e => !e._cestino);

    // 1. Imprese senza ragione sociale — non identificabili in SafeCant
    const impSenzaNome = attive('imprese').filter(i => !i.ragioneSociale?.trim());
    if (impSenzaNome.length)
      warnings.push({ etichetta: `${impSenzaNome.length} impresa/e senza ragione sociale`, dettaglio: [] });

    // 2. Imprese senza tipoRapporto — SafeCant non può categorizzarle né mostrare la checklist documenti
    const impSenzaTipo = attive('imprese').filter(i => !i.tipoRapporto);
    if (impSenzaTipo.length)
      warnings.push({
        etichetta: `${impSenzaTipo.length} impresa/e senza tipo rapporto (appalto/subappalto/…)`,
        dettaglio: impSenzaTipo.map(i => i.ragioneSociale?.trim() || `(id: ${i.id})`),
      });

    // 3. Lavoratori senza impresa_id — orfani, non appariranno sotto nessuna impresa
    const lavSenzaImp = attive('lavoratori').filter(l => !l.impresa_id);
    if (lavSenzaImp.length)
      warnings.push({
        etichetta: `${lavSenzaImp.length} lavoratore/i senza impresa associata`,
        dettaglio: lavSenzaImp.map(l => [l.cognome, l.nome].filter(Boolean).join(' ') || `(id: ${l.id})`),
      });

    // 4. Lavoratori senza nome né cognome — non identificabili
    const lavSenzaNome = attive('lavoratori').filter(l => !l.cognome?.trim() && !l.nome?.trim());
    if (lavSenzaNome.length)
      warnings.push({ etichetta: `${lavSenzaNome.length} lavoratore/i senza nome né cognome`, dettaglio: [] });

    // 5. Mezzi senza impresa_id — orfani
    const mezziSenzaImp = attive('mezzi').filter(m => !m.impresa_id);
    if (mezziSenzaImp.length)
      warnings.push({
        etichetta: `${mezziSenzaImp.length} mezzo/i senza impresa associata`,
        dettaglio: mezziSenzaImp.map(m => [m.marca, m.modello].filter(Boolean).join(' ') || `(id: ${m.id})`),
      });

    // 6. Attrezzature senza impresa_id — orfane
    const attSenzaImp = attive('attrezzature').filter(a => !a.impresa_id);
    if (attSenzaImp.length)
      warnings.push({ etichetta: `${attSenzaImp.length} attrezzatura/e senza impresa associata`, dettaglio: [] });

    return { ok: warnings.length === 0, warnings };
  };

  /**
   * Genera la variante LEGGERA dell'anagrafica corrente, pronta per SafeCant.
   * Schema identico al canonico v2.0 — solo i base64 sono "".
   * Entità e sotto-documenti cestinati vengono esclusi.
   * I campi interni _cestino/_eliminato_il vengono rimossi.
   * @returns {Object} anagrafica leggera
   */
  const esportaLeggera = () => {
    if (!_dati) throw new Error('Anagrafica non caricata — esporta dopo aver selezionato il cantiere.');

    // Deep copy via JSON serialization, poi pulizia ricorsiva
    const leggera = _pulisciPerExport(JSON.parse(JSON.stringify(_dati)));

    // Sovrascrive i metadati per la variante leggera
    leggera.variante             = 'leggera';
    leggera.generato_il          = new Date().toISOString();
    leggera.generato_da_versione = '1.0.0';

    return leggera;
  };

  // ================================================================
  // Calcolo scadenze e conformità — Noli
  // ================================================================

  /** Scadenza contratto di nolo (dataFine) + eventuali documenti extra liberi. */
  const calcolaScadenzeNolo = (nolo) => {
    const soglie    = IMPOSTAZIONI_SERVICE.soglie();
    const risultati = [];

    // Scadenza contratto (dataFine)
    if (nolo.dataFine) {
      const gg     = UTILS.giorniAllaScadenza(nolo.dataFine);
      const soglia = soglie.nolo_fine_contratto ?? soglie.default;
      const stato  = gg < 0 ? 'scaduto' : gg < soglia.giorni ? 'in_scadenza' : 'valido';
      if (stato !== 'valido') {
        risultati.push({ tipo: 'data_fine', label: 'Contratto di nolo', scadenza: nolo.dataFine, giorni: gg, stato, criticita: 'alta' });
      }
    }

    // Documenti extra liberi (solo se con scadenza valorizzata — soglia.default, non critica)
    for (const d of (nolo.documenti_extra ?? [])) {
      if (d._cestino || !d.scadenza) continue;
      const gg     = UTILS.giorniAllaScadenza(d.scadenza);
      const soglia = soglie.default;
      const stato  = gg < 0 ? 'scaduto' : gg < soglia.giorni ? 'in_scadenza' : 'valido';
      if (stato !== 'valido') {
        risultati.push({ tipo: 'extra_' + d.id, label: d.titolo, scadenza: d.scadenza, giorni: gg, stato, criticita: 'normale' });
      }
    }

    return risultati.sort((a, b) => (a.giorni ?? 999) - (b.giorni ?? 999));
  };

  /**
   * Conformità nolo: check attestazione buono stato (FREDDO obbligatoria)
   * e operatore mancante (CALDO). Nessun alert rosso critico: la criticità
   * vera è sui lavoratori/mezzi collegati, non sul nolo in sé.
   */
  const calcolaConformitaNolo = (nolo) => {
    if (!nolo?.tipoNolo) return { stato: 'grigio', critico: false, scadenze: [], problemi: [], note: [] };

    const scadenze = calcolaScadenzeNolo(nolo);
    const problemi = [];
    const note     = [];

    if (nolo.tipoNolo === 'FREDDO' && !nolo.attestazioneBuonoStato?.presente) {
      problemi.push({ tipo: 'attestazione', label: 'Attestazione buono stato (art.72)', livello: 'giallo', motivo: 'assente' });
    }
    if (nolo.tipoNolo === 'CALDO' && !nolo.operatore?.nome && !nolo.operatore?.lavoratore_id) {
      problemi.push({ tipo: 'operatore', label: 'Operatore', livello: 'giallo', motivo: 'non_specificato' });
    }
    if (nolo.tipoNolo === 'CALDO' && nolo.operatore?.superaSoglieSubappalto) {
      note.push('Supera soglie subappalto: verificare POS e idoneità dell\'impresa noleggiante.');
    }

    const hasRosso  = scadenze.some(s => s.stato === 'scaduto');
    const hasGiallo = scadenze.some(s => s.stato === 'in_scadenza') || problemi.some(p => p.livello === 'giallo');
    return { stato: hasRosso ? 'rosso' : hasGiallo ? 'giallo' : 'verde', critico: false, scadenze, problemi, note };
  };

  /**
   * Sincronizza il campo nolo_id su mezzo e/o attrezzatura collegata.
   * Chiamata da noli.js DOPO il salvataggio base (single responsibility).
   * Guida-non-blocca: errori interni non propagano al chiamante.
   *
   * @param {string|null} noloId   - id del nolo (null quando il nolo viene cestinato)
   * @param {string|null} mz_new   - nuovo mezzo_id del nolo
   * @param {string|null} mz_old   - vecchio mezzo_id (prima del salvataggio)
   * @param {string|null} att_new  - nuovo attrezzatura_id
   * @param {string|null} att_old  - vecchio attrezzatura_id
   */
  const collegaNolo = async (noloId, mz_new, mz_old, att_new, att_old) => {
    // Aggiorna mezzi
    const mezziDaAggiornare = [];
    if (mz_old && mz_old !== mz_new) {
      const m = getEntita('mezzi', mz_old);
      if (m) mezziDaAggiornare.push({ id: mz_old, nolo_id: null });
    }
    if (mz_new) {
      const m = getEntita('mezzi', mz_new);
      if (m && !m._cestino) mezziDaAggiornare.push({ id: mz_new, nolo_id: noloId });
    }
    for (const upd of mezziDaAggiornare) {
      await aggiorna('mezzi', upd.id, { nolo_id: upd.nolo_id }).catch(() => {});
    }

    // Aggiorna attrezzature
    const attDaAggiornare = [];
    if (att_old && att_old !== att_new) {
      const a = getEntita('attrezzature', att_old);
      if (a) attDaAggiornare.push({ id: att_old, nolo_id: null });
    }
    if (att_new) {
      const a = getEntita('attrezzature', att_new);
      if (a && !a._cestino) attDaAggiornare.push({ id: att_new, nolo_id: noloId });
    }
    for (const upd of attDaAggiornare) {
      await aggiorna('attrezzature', upd.id, { nolo_id: upd.nolo_id }).catch(() => {});
    }
  };

  // ================================================================
  // Calcolo scadenze e conformità — Mezzi
  // ================================================================

  /**
   * Scadenze problematiche di un mezzo (verifichePeriodiche[].prossima).
   * Criticità in base a se il mezzo è di sollevamento (TIPI_MEZZO_SOLLEVAMENTO).
   */
  const calcolaScadenzeMezzo = (mezzo) => {
    const soglie = IMPOSTAZIONI_SERVICE.soglie();
    const isSollevamento = _TIPI_MEZZO_SOLLEVAMENTO.has(mezzo.tipologia);
    const sogliaTipo     = isSollevamento ? 'verifica_periodica_mezzo' : 'verifica_mezzo_non_sollevamento';
    const criticita      = isSollevamento ? 'critica' : 'normale';
    const risultati      = [];

    for (const vp of (mezzo.verifichePeriodiche ?? [])) {
      if (vp._cestino || !vp.prossima) continue;
      const gg     = UTILS.giorniAllaScadenza(vp.prossima);
      const soglia = soglie[sogliaTipo] ?? soglie.default;
      const stato  = gg < 0 ? 'scaduto' : gg < soglia.giorni ? 'in_scadenza' : 'valido';
      if (stato !== 'valido') {
        risultati.push({
          tipo: 'verifica_periodica',
          label: TIPI_VERIFICA_MEZZO.find(t => t.valore === vp.tipo)?.etichetta ?? vp.tipo ?? 'Verifica periodica',
          scadenza: vp.prossima, giorni: gg, stato, criticita,
        });
      }
    }
    // Documenti extra liberi (solo se con scadenza valorizzata — soglia.default, non critica)
    for (const d of (mezzo.documenti_extra ?? [])) {
      if (d._cestino || !d.scadenza) continue;
      const gg     = UTILS.giorniAllaScadenza(d.scadenza);
      const soglia = soglie.default;
      const stato  = gg < 0 ? 'scaduto' : gg < soglia.giorni ? 'in_scadenza' : 'valido';
      if (stato !== 'valido') {
        risultati.push({ tipo: 'extra_' + d.id, label: d.titolo, scadenza: d.scadenza, giorni: gg, stato, criticita: 'normale' });
      }
    }

    return risultati.sort((a, b) => (a.giorni ?? 999) - (b.giorni ?? 999));
  };

  /** Conformità mezzo: puramente scadenziale (no matrice §12). */
  const calcolaConformitaMezzo = (mezzo) => {
    if (!mezzo?.tipologia) return { stato: 'grigio', critico: false, scadenze: [] };
    const scadenze  = calcolaScadenzeMezzo(mezzo);
    const critico   = scadenze.some(s => s.stato === 'scaduto' && s.criticita === 'critica');
    const hasRosso  = critico || scadenze.some(s => s.stato === 'scaduto');
    const hasGiallo = scadenze.some(s => s.stato === 'in_scadenza');
    return { stato: hasRosso ? 'rosso' : hasGiallo ? 'giallo' : 'verde', critico, scadenze };
  };

  // ================================================================
  // Calcolo scadenze e conformità — Attrezzature
  // ================================================================

  /**
   * Scadenze problematiche di un'attrezzatura.
   * verifiche[].prossima → soglia 'verifica_attrezzatura'.
   * documentiSpecifici[].scadenza → PiMUS/AutorizzazioneMin critica, altri normale.
   */
  const calcolaScadenzeAttrezzatura = (att) => {
    const soglie    = IMPOSTAZIONI_SERVICE.soglie();
    const risultati = [];

    for (const v of (att.verifiche ?? [])) {
      if (v._cestino || !v.prossima) continue;
      const gg     = UTILS.giorniAllaScadenza(v.prossima);
      const soglia = soglie.verifica_attrezzatura ?? soglie.default;
      const stato  = gg < 0 ? 'scaduto' : gg < soglia.giorni ? 'in_scadenza' : 'valido';
      if (stato !== 'valido') {
        risultati.push({
          tipo: 'verifica',
          label: TIPI_VERIFICA_ATT.find(t => t.valore === v.tipo)?.etichetta ?? v.tipo ?? 'Verifica',
          scadenza: v.prossima, giorni: gg, stato, criticita: 'normale',
        });
      }
    }

    for (const d of (att.documentiSpecifici ?? [])) {
      if (d._cestino || !d.scadenza) continue;
      const docDef    = TIPI_DOC_SPECIFICO_ATT.find(t => t.valore === d.tipo);
      const critico   = docDef?.critico ?? false;
      const sogliaTipo = critico ? 'pimus_ponteggi' : 'default';
      const criticita  = critico ? 'critica' : 'normale';
      const soglia     = soglie[sogliaTipo] ?? soglie.default;
      const gg         = UTILS.giorniAllaScadenza(d.scadenza);
      const stato      = gg < 0 ? 'scaduto' : gg < soglia.giorni ? 'in_scadenza' : 'valido';
      if (stato !== 'valido') {
        risultati.push({
          tipo: 'doc_specifico',
          label: docDef?.etichetta ?? d.tipo ?? 'Documento specifico',
          scadenza: d.scadenza, giorni: gg, stato, criticita,
        });
      }
    }

    // Documenti extra liberi (solo se con scadenza valorizzata — soglia.default, non critica)
    for (const d of (att.documenti_extra ?? [])) {
      if (d._cestino || !d.scadenza) continue;
      const gg     = UTILS.giorniAllaScadenza(d.scadenza);
      const soglia = soglie.default;
      const stato  = gg < 0 ? 'scaduto' : gg < soglia.giorni ? 'in_scadenza' : 'valido';
      if (stato !== 'valido') {
        risultati.push({ tipo: 'extra_' + d.id, label: d.titolo, scadenza: d.scadenza, giorni: gg, stato, criticita: 'normale' });
      }
    }

    return risultati.sort((a, b) => (a.giorni ?? 999) - (b.giorni ?? 999));
  };

  /** Conformità attrezzatura: scadenziale + conformità CE assente (avviso giallo). */
  const calcolaConformitaAttrezzatura = (att) => {
    if (!att?.tipologia) return { stato: 'grigio', critico: false, scadenze: [] };
    const scadenze  = calcolaScadenzeAttrezzatura(att);
    const critico   = scadenze.some(s => s.stato === 'scaduto' && s.criticita === 'critica');
    const hasRosso  = critico || scadenze.some(s => s.stato === 'scaduto');
    const hasGiallo = scadenze.some(s => s.stato === 'in_scadenza')
                      || (!att.dichiarazioneConformitaCE?.presente);
    return { stato: hasRosso ? 'rosso' : hasGiallo ? 'giallo' : 'verde', critico, scadenze };
  };

  // ================================================================
  // Helper: template vuoto per il form di creazione
  // ================================================================
  const creaEntitaVuota = (nomeCollezione) => {
    if (nomeCollezione === 'imprese') return {
      ragioneSociale: '', partitaIva: '', codiceFiscale: '', sedeLegale: '',
      pec: '', referente: '', telefono: '', email: '',
      tipoRapporto: '', ruolo: '', subAppaltoDi: null,
      superaSoglieSubappalto: false, contrattoRiferimento: null,
      patenteCrediti: { codice: null, punteggio: null, dataRilascio: null, stato: null },
      figureSicurezza: { rspp: null, medicoCompetente: null, rls: null, preposti: [], direttoreTecnico: null, direttoreCantiere: null },
      ccnlApplicato: null, organicoMedioAnnuo: null,
      documenti: [],
      documenti_extra: [],
    };
    if (nomeCollezione === 'persone_committente') return {
      nome: '', cognome: '', qualifica: '', ruolo: '',
      matricola: '', strutturaTerritoriale: '',
      email: '', telefono: '',
    };
    if (nomeCollezione === 'persone_terzi') return {
      nome: '', cognome: '', qualifica: '',
      tipoEnte: '', ente: '',
      email: '', telefono: '',
      documenti_extra: [],
    };
    if (nomeCollezione === 'noli') return {
      tipoNolo: '',
      oggetto: '',
      impresa_utilizzatrice_id: null,
      impresa_noleggiante_id: null,
      noleggiante_nome: '',
      mezzo_id: null,
      attrezzatura_id: null,
      attestazioneBuonoStato: { presente: false, data: null, filename: null, base64: null },
      operatore: { nome: null, lavoratore_id: null, superaSoglieSubappalto: false },
      dataInizio: null,
      dataFine: null,
      contrattoRiferimento: null,
      documenti_extra: [],
    };
    if (nomeCollezione === 'mezzi') return {
      tipologia: '', marca: '', modello: '',
      matricola: '', numeroSerie: '', anno: null,
      presenteInCantiere: true,
      impresa_id: null,
      nolo_id: null,    // M4 F4
      libretto: { filename: null, base64: null },
      verifichePeriodiche: [],
      foto: [],         // M24
      documenti_extra: [],
    };
    if (nomeCollezione === 'attrezzature') return {
      tipologia: '', descrizione: '', matricola: null,
      impresa_id: null,
      nolo_id: null,    // M4 F4
      dichiarazioneConformitaCE: { presente: false, filename: null, base64: null },
      libretto: { filename: null, base64: null },
      verifiche: [],
      documentiSpecifici: [],
      documenti_extra: [],
    };
    if (nomeCollezione === 'lavoratori') return {
      nome: '', cognome: '', codiceFiscale: '', mansione: '',
      dataNascita: null, luogoNascita: '', telefono: '', email: '',
      impresa_id: null,
      attestatoFormazione: { numero: null, scadenza: null, filename: null, base64: null },
      visitaMedica:        { ente: null, data: null, scadenza: null, filename: null, base64: null },
      abilitazioni: [],
      foto: [],   // gestito da M24; inizializzato vuoto, variante leggera SafeCant lo ignora
      tesseraRiconoscimento: { presente: false, filename: null, base64: null },
      badgeCantiere:         { codice: null, presente: false },
      ruoliSpeciali: [],
      documenti_extra: [],
    };
    return {};
  };

  // ================================================================
  // Esposizione pubblica
  // ================================================================
  return {
    carica, salvaCollezione,
    get, getEntita,
    aggiungi, aggiorna, cestina, ripristina, eliminaDefinitivamente,
    leggiEntitaCestinate, ripristinaEntitaArbitraria, eliminaEntitaArbitraria,
    calcolaConformita, calcolaScadenzeImpresa,
    calcolaConformitaLavoratore, calcolaScadenzeLavoratore,
    esportaLeggera, validaPreExport,
    calcolaConformitaNolo, calcolaScadenzeNolo, collegaNolo,
    calcolaConformitaMezzo, calcolaScadenzeMezzo,
    calcolaConformitaAttrezzatura, calcolaScadenzeAttrezzatura,
    creaEntitaVuota,
    get dati()        { return _dati; },
    get isCaricato()  { return _dati !== null; },
    get cantiereId()  { return _cantiereId; },
    CONFORMITA_MATRIX,
    LABEL_DOC,
    TIPI_ABILITAZIONE_OPERATORE,
    TIPI_NOLO,
    RUOLI_PERSONE_COMMITTENTE, TIPI_ENTE_TERZI,
    TIPI_MEZZO, TIPOLOGIE_ATTREZZATURA,
    TIPI_VERIFICA_MEZZO, TIPI_VERIFICA_ATT, TIPI_DOC_SPECIFICO_ATT,
  };
})();
