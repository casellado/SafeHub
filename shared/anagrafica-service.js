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
    return (impresa.documenti ?? [])
      .filter(d => !d._cestino && d.scadenza)
      .map(d => {
        const gg     = UTILS.giorniAllaScadenza(d.scadenza);
        const soglia = soglie[DOC_A_SOGLIA[d.tipo] ?? 'default'] ?? soglie.default;
        const stato  = gg === null ? 'senza_data' : gg < 0 ? 'scaduto' : gg < soglia.giorni ? 'in_scadenza' : 'valido';
        return { tipo: d.tipo, label: LABEL_DOC[d.tipo] ?? d.tipo, scadenza: d.scadenza, giorni: gg, stato, criticita: soglia.criticita };
      })
      .filter(s => s.stato !== 'valido')
      .sort((a, b) => (a.giorni ?? 999) - (b.giorni ?? 999));
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
    calcolaConformita, calcolaScadenzeImpresa,
    creaEntitaVuota,
    get dati()        { return _dati; },
    get isCaricato()  { return _dati !== null; },
    get cantiereId()  { return _cantiereId; },
    CONFORMITA_MATRIX,   // esposta per debug/ispezione
    LABEL_DOC,
  };
})();
