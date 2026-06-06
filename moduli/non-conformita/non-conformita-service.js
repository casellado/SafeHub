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
    livello:              'lieve',    // 'lieve' | 'grave' | 'gravissima'
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

  // ── CRUD ─────────────────────────────────────────────────────────────────────

  /**
   * Scrive una nuova NC in 05_Non-Conformita/Aperte/<uuid>.json.
   * @param {object} nc  record creato con creaNCVuota() e popolato
   * @returns {Promise<object>}
   */
  const creaNC = async (nc) => {
    nc.aggiornato_il = new Date().toISOString();
    const dir = await _getDirNC(nc.cantiere_id, true);
    await FILESYSTEM.scriviJson(dir, `${nc.id}.json`, nc);
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
    return aggiornaNC({ ...nc, stato_risoluzione: nuovoStato });
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
