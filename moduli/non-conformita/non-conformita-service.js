/**
 * non-conformita-service.js — Motore dati M14: Non Conformità.
 *
 * COLLOCAZIONE FISSA: ogni NC vive in
 *   05_Non-Conformita/Aperte/<uuid>.json
 * e non si sposta mai, indipendentemente dallo stato_risoluzione.
 *
 * DUE ASSI DI STATO come campi nel record (nessuno determina la cartella):
 *   stato_doc        : 'BOZZA' | 'FINALIZZATO_DA_PROTOCOLLARE' | 'PROTOCOLLATO'
 *   stato_risoluzione: 'APERTA' | 'IN_RISOLUZIONE' | 'CHIUSA'
 *
 * cambiaStatoRisoluzione aggiorna solo il campo e riscrive il file dov'è.
 * Nessuno spostamento di file. Pattern identico a aggiornaDatiLotto per i cantieri.
 *
 * leggiNC scansiona tutte e 3 le sottocartelle (tolleranza per dati legacy v1
 * che usavano lo spostamento file). Deduplicazione per id: vince la versione
 * con aggiornato_il più recente.
 *
 * Il campo documenti_collegati: [] è riservato al futuro collegamento ODS.
 *
 * Dipende da: UTILS, FILESYSTEM (già caricati da shared/).
 */

const NC_SERVICE = (() => {

  // Sottocartella fissa dove nascono e vivono tutte le NC
  const _FOLDER_NC = 'Aperte';

  // Usato solo da leggiNC per tolleranza dati legacy v1 (che spostava i file)
  const _TUTTE_FOLDERS = ['Aperte', 'In-Risoluzione', 'Chiuse'];

  // ── Schema ──────────────────────────────────────────────────────────────────

  /**
   * Crea un record NC vuoto con tutti i campi dello schema.
   * impresa_id è facoltativo (le nc_draft da SafeCant non la portano).
   * @param {string} cantiereId
   * @returns {object}
   */
  const creaNCVuota = (cantiereId) => ({
    id:                   UTILS.uuid(),
    tipo_file:            'non_conformita',
    cantiere_id:          cantiereId ?? '',
    descrizione:          '',
    livello:              'lieve',    // 'gravissima' | 'grave' | 'media' | 'lieve' (allineato a SafeCant LIVELLI_NC)
    impresa_id:           '',         // facoltativo — può essere vuoto
    data_rilevazione:     UTILS.oggi(),
    scadenza_risoluzione: '',         // ISO date o stringa vuota
    stato_doc:            'BOZZA',    // asse secondario, per coerenza/futuro
    stato_risoluzione:    'APERTA',   // asse primario — campo nel record, non cartella
    origine:              'manuale',  // 'manuale' | 'da_verbale_sopralluogo'
    verbale_origine_id:   '',
    documenti_collegati:  [],         // slot ODS futuro — non implementare ora
    note:                 '',
    creato_il:            new Date().toISOString(),
    aggiornato_il:        new Date().toISOString(),
  });

  // ── Utility interna ──────────────────────────────────────────────────────────

  /**
   * Restituisce il handle della cartella fissa delle NC.
   * @param {string}  cantiereId
   * @param {boolean} [crea=false]
   * @returns {Promise<FileSystemDirectoryHandle>}
   */
  const _getDirNC = async (cantiereId, crea = false) => {
    const root = FILESYSTEM.getHandleAttivo();
    return FILESYSTEM.navigaPercorso(
      await root.getDirectoryHandle(cantiereId),
      ['05_Non-Conformita', _FOLDER_NC],
      crea
    );
  };

  // ── Hook Diario CSE — best-effort (non bloccano mai l'operazione NC) ─────────

  /** Etichetta leggibile per il livello NC. */
  const _etichettaLivello = (l) =>
    ({ gravissima: 'Gravissima', grave: 'Grave', media: 'Media', lieve: 'Lieve' }[l] ?? l ?? '—');

  /** Recupera la ragione sociale dell'impresa dalla cache anagrafica (se disponibile). */
  const _nomeImpresa = (impresa_id) => {
    if (!impresa_id) return null;
    // ANAGRAFICA_SERVICE è globale (shared/anagrafica-service.js), sempre disponibile
    return ANAGRAFICA_SERVICE.get('imprese').find(i => i.id === impresa_id)?.ragioneSociale ?? impresa_id;
  };

  /**
   * Tenta di registrare la CREAZIONE di una NC nel Diario CSE.
   * DIARIO_SERVICE è caricato dopo questo file: il check typeof è la guardia
   * che rende safe chiamarla anche in un contesto dove il diario non è ancora pronto.
   */
  const _hookDiarioNcCreata = async (nc) => {
    if (typeof DIARIO_SERVICE === 'undefined') return;
    const impresa  = _nomeImpresa(nc.impresa_id);
    const soggetti = impresa ? [impresa] : [];
    const descBreve = (nc.descrizione ?? '').slice(0, 100);
    await DIARIO_SERVICE.creaVoceAuto({
      cantiere_id: nc.cantiere_id,
      tipo:        'NON_CONFORMITA',
      titolo:      `Non conformità aperta: ${descBreve || '(senza descrizione)'}`,
      descrizione: [
        `Livello: ${_etichettaLivello(nc.livello)}`,
        impresa             ? `Impresa: ${impresa}`                                        : null,
        nc.scadenza_risoluzione ? `Scadenza risoluzione: ${UTILS.formatData(nc.scadenza_risoluzione)}` : null,
      ].filter(Boolean).join('\n'),
      soggetti,
      riferimento: nc.id,
    });
  };

  /**
   * Tenta di registrare la CHIUSURA di una NC nel Diario CSE.
   * Chiamata solo quando nuovoStato === 'CHIUSA'.
   */
  const _hookDiarioNcChiusa = async (nc) => {
    if (typeof DIARIO_SERVICE === 'undefined') return;
    const impresa  = _nomeImpresa(nc.impresa_id);
    const soggetti = impresa ? [impresa] : [];
    const descBreve = (nc.descrizione ?? '').slice(0, 100);
    await DIARIO_SERVICE.creaVoceAuto({
      cantiere_id: nc.cantiere_id,
      tipo:        'NON_CONFORMITA',
      titolo:      `Non conformità risolta: ${descBreve || '(senza descrizione)'}`,
      descrizione: [
        `Livello: ${_etichettaLivello(nc.livello)}`,
        impresa ? `Impresa: ${impresa}` : null,
        `Data chiusura: ${UTILS.formatData(new Date().toISOString())}`,
      ].filter(Boolean).join('\n'),
      soggetti,
      riferimento: nc.id,
    });
  };

  // ── CRUD ─────────────────────────────────────────────────────────────────────

  /**
   * Scrive una nuova NC in 05_Non-Conformita/Aperte/<uuid>.json.
   * Dopo il salvataggio, tenta di registrare l'evento nel Diario CSE (best-effort).
   * @param {object} nc  record creato con creaNCVuota() e popolato
   * @returns {Promise<object>}
   */
  const creaNC = async (nc) => {
    nc.aggiornato_il = new Date().toISOString();
    const dir = await _getDirNC(nc.cantiere_id, true);
    await FILESYSTEM.scriviJson(dir, `${nc.id}.json`, nc);
    // Hook diario — fire-and-forget: un errore qui non deve mai bloccare la NC
    _hookDiarioNcCreata(nc).catch(e => console.warn('[diario] hook NC creata:', e));
    return nc;
  };

  /**
   * Aggiorna una NC nella sua posizione fissa.
   * Non cambia la cartella: riscrive il file dov'è sempre stato.
   * @param {object} nc
   * @returns {Promise<object>}
   */
  const aggiornaNC = async (nc) => {
    nc.aggiornato_il = new Date().toISOString();
    const dir = await _getDirNC(nc.cantiere_id);
    await FILESYSTEM.scriviJson(dir, `${nc.id}.json`, nc);
    return nc;
  };

  /**
   * Cambia stato_risoluzione di una NC.
   * Aggiorna solo il campo nel record e riscrive il file nella sua posizione fissa.
   * Nessuno spostamento di file. Transizioni reversibili: APERTA ↔ IN_RISOLUZIONE ↔ CHIUSA.
   * @param {object} nc
   * @param {string} nuovoStato  'APERTA' | 'IN_RISOLUZIONE' | 'CHIUSA'
   * @returns {Promise<object>}
   */
  const cambiaStatoRisoluzione = async (nc, nuovoStato) => {
    const STATI_VALIDI = new Set(['APERTA', 'IN_RISOLUZIONE', 'CHIUSA']);
    if (!STATI_VALIDI.has(nuovoStato)) {
      throw new Error(`NC_SERVICE: stato_risoluzione non valido: "${nuovoStato}"`);
    }
    if (nc.stato_risoluzione === nuovoStato) return nc;
    const aggiornata = await aggiornaNC({ ...nc, stato_risoluzione: nuovoStato });
    // Hook diario — solo alla CHIUSURA; gli stati intermedi non generano voci
    if (nuovoStato === 'CHIUSA') {
      _hookDiarioNcChiusa(aggiornata).catch(e => console.warn('[diario] hook NC chiusa:', e));
    }
    return aggiornata;
  };

  /**
   * Legge tutte le NC (non cestinate) per il cantiere dato.
   *
   * Scansiona tutte e 3 le sottocartelle per tolleranza verso dati legacy v1
   * (che spostava i file al cambio stato). In condizioni normali (v2) tutte
   * le NC stanno in Aperte/. Deduplicazione per id: vince la versione con
   * aggiornato_il più recente.
   *
   * @param {string} cantiereId
   * @returns {Promise<object[]>}  ordinati per data_rilevazione decrescente
   */
  const leggiNC = async (cantiereId) => {
    const root  = FILESYSTEM.getHandleAttivo();
    const byId  = new Map();  // id → record con aggiornato_il più recente

    for (const nomeFolder of _TUTTE_FOLDERS) {
      let subDir;
      try {
        subDir = await FILESYSTEM.navigaPercorso(
          await root.getDirectoryHandle(cantiereId),
          ['05_Non-Conformita', nomeFolder],
          false
        );
      } catch (e) {
        if (e.name === 'NotFoundError') continue;  // sottocartella non ancora creata
        throw e;
      }

      for await (const [nome, fh] of subDir.entries()) {
        if (fh.kind !== 'file' || !nome.endsWith('.json')) continue;
        try {
          const nc = await FILESYSTEM.leggiJson(subDir, nome);
          if (nc._cestino) continue;
          // Deduplicazione: mantieni la versione con aggiornato_il più recente
          const esistente = byId.get(nc.id);
          if (!esistente ||
              (nc.aggiornato_il ?? '') > (esistente.aggiornato_il ?? '')) {
            byId.set(nc.id, nc);
          }
        } catch { /* salta file corrotto o temporaneamente non leggibile */ }
      }
    }

    const risultati = [...byId.values()];
    risultati.sort((a, b) =>
      (b.data_rilevazione ?? b.creato_il ?? '').localeCompare(
        a.data_rilevazione ?? a.creato_il ?? ''
      )
    );
    return risultati;
  };

  // ── API pubblica ─────────────────────────────────────────────────────────────

  return { creaNCVuota, creaNC, leggiNC, aggiornaNC, cambiaStatoRisoluzione };
})();
