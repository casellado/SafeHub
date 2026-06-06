/**
 * non-conformita-service.js — Motore dati M14: Non Conformità.
 *
 * Record puro (nessun DOCX): vive come file JSON in
 *   05_Non-Conformita/<sottocartella-stato>/<uuid>.json
 *
 * DUE ASSI DI STATO INDIPENDENTI sullo stesso record:
 *   stato_doc        (campo JSON): 'BOZZA' | 'FINALIZZATO_DA_PROTOCOLLARE' | 'PROTOCOLLATO'
 *   stato_risoluzione (cartella):  'APERTA' | 'IN_RISOLUZIONE' | 'CHIUSA'
 *
 * stato_risoluzione è l'asse primario: determina la sottocartella fisica.
 * stato_doc è l'asse secondario: campo nel JSON, default 'BOZZA'.
 *
 * Spostamento file al cambio stato_risoluzione — ordine critico anti-perdita:
 *   STEP 1 — scrivi nella nuova cartella
 *   STEP 2 — solo poi soft-delete nella vecchia
 * Se STEP 1 fallisce, la NC è intatta nella vecchia posizione.
 * Se STEP 2 fallisce, la NC è duplicata (recuperabile) ma mai persa.
 *
 * Il campo documenti_collegati: [] è riservato al futuro collegamento ODS.
 * Non implementato ora — solo il campo nel record.
 *
 * Dipende da: UTILS, FILESYSTEM (già caricati da shared/).
 */

const NC_SERVICE = (() => {

  // Mapping stato_risoluzione → nome sottocartella fisica (già create dallo scaffolding)
  const _STATO_A_FOLDER = {
    APERTA:         'Aperte',
    IN_RISOLUZIONE: 'In-Risoluzione',
    CHIUSA:         'Chiuse',
  };

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
    stato_risoluzione:    'APERTA',   // asse primario — determina la sottocartella
    origine:              'manuale',  // 'manuale' | 'da_verbale_sopralluogo'
    verbale_origine_id:   '',         // valorizzato se origine === 'da_verbale_sopralluogo'
    documenti_collegati:  [],         // slot ODS futuro — non implementare ora
    note:                 '',
    creato_il:            new Date().toISOString(),
    aggiornato_il:        new Date().toISOString(),
  });

  // ── Utility interna ──────────────────────────────────────────────────────────

  /**
   * Restituisce il handle della sottocartella corrispondente a stato_risoluzione.
   * @param {string} cantiereId
   * @param {string} statoRisoluzione  'APERTA' | 'IN_RISOLUZIONE' | 'CHIUSA'
   * @param {boolean} [crea=false]     true per auto-creare se mancante
   * @returns {Promise<FileSystemDirectoryHandle>}
   */
  const _getDirPerStato = async (cantiereId, statoRisoluzione, crea = false) => {
    const nomeFolder = _STATO_A_FOLDER[statoRisoluzione];
    if (!nomeFolder) throw new Error(`NC_SERVICE: stato_risoluzione non valido: "${statoRisoluzione}"`);
    const root = FILESYSTEM.getHandleAttivo();
    return FILESYSTEM.navigaPercorso(
      await root.getDirectoryHandle(cantiereId),
      ['05_Non-Conformita', nomeFolder],
      crea
    );
  };

  // ── CRUD ─────────────────────────────────────────────────────────────────────

  /**
   * Scrive una nuova NC in 05_Non-Conformita/<stato_risoluzione>/<uuid>.json.
   * @param {object} nc  record creato con creaNCVuota() e popolato
   * @returns {Promise<object>}
   */
  const creaNC = async (nc) => {
    nc.aggiornato_il = new Date().toISOString();
    const dir = await _getDirPerStato(nc.cantiere_id, nc.stato_risoluzione, true);
    await FILESYSTEM.scriviJson(dir, `${nc.id}.json`, nc);
    return nc;
  };

  /**
   * Aggiorna una NC nella sua cartella corrente (senza cambiare stato_risoluzione).
   * Per cambiare stato_risoluzione usare cambiaStatoRisoluzione().
   * @param {object} nc
   * @returns {Promise<object>}
   */
  const aggiornaNC = async (nc) => {
    nc.aggiornato_il = new Date().toISOString();
    const dir = await _getDirPerStato(nc.cantiere_id, nc.stato_risoluzione);
    await FILESYSTEM.scriviJson(dir, `${nc.id}.json`, nc);
    return nc;
  };

  /**
   * Legge tutte le NC dalle 3 sottocartelle per il cantiere dato.
   * Esclude i record soft-deleted (_cestino: true).
   * Ordina per data_rilevazione decrescente (più recente prima).
   * @param {string} cantiereId
   * @returns {Promise<object[]>}
   */
  const leggiNC = async (cantiereId) => {
    const root      = FILESYSTEM.getHandleAttivo();
    const risultati = [];

    for (const nomeFolder of Object.values(_STATO_A_FOLDER)) {
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
          if (!nc._cestino) risultati.push(nc);
        } catch { /* salta file corrotto o temporaneamente non leggibile */ }
      }
    }

    risultati.sort((a, b) =>
      (b.data_rilevazione ?? b.creato_il ?? '').localeCompare(
        a.data_rilevazione ?? a.creato_il ?? ''
      )
    );
    return risultati;
  };

  // ── Transizione di stato ─────────────────────────────────────────────────────

  /**
   * Cambia stato_risoluzione di una NC con spostamento fisico del file.
   *
   * Le transizioni sono REVERSIBILI: APERTA ↔ IN_RISOLUZIONE ↔ CHIUSA.
   *
   * Ordine critico anti-perdita dati:
   *   STEP 1 — scrivi il record aggiornato nella NUOVA cartella.
   *            Se fallisce qui, la NC resta intatta nella vecchia posizione.
   *   STEP 2 — soft-delete nella VECCHIA cartella.
   *            Se fallisce qui, la NC è duplicata (recuperabile) ma non persa.
   *
   * @param {object} nc          record NC con stato_risoluzione corrente
   * @param {string} nuovoStato  'APERTA' | 'IN_RISOLUZIONE' | 'CHIUSA'
   * @returns {Promise<object>}  il record aggiornato con il nuovo stato_risoluzione
   */
  const cambiaStatoRisoluzione = async (nc, nuovoStato) => {
    if (!_STATO_A_FOLDER[nuovoStato]) {
      throw new Error(`NC_SERVICE: stato_risoluzione non valido: "${nuovoStato}"`);
    }
    // No-op: già nello stato richiesto
    if (nc.stato_risoluzione === nuovoStato) return nc;

    const vecchiaDir = await _getDirPerStato(nc.cantiere_id, nc.stato_risoluzione);
    const nuovaDir   = await _getDirPerStato(nc.cantiere_id, nuovoStato, true);

    const ncAggiornata = {
      ...nc,
      stato_risoluzione: nuovoStato,
      aggiornato_il:     new Date().toISOString(),
    };

    // STEP 1 — scrivi nella nuova cartella (punto di non-ritorno)
    await FILESYSTEM.scriviJson(nuovaDir, `${nc.id}.json`, ncAggiornata);

    // STEP 2 — soft-delete nella vecchia (la NC è già al sicuro nel nuovo posto)
    try {
      const vecchia = await FILESYSTEM.leggiJson(vecchiaDir, `${nc.id}.json`);
      await FILESYSTEM.scriviJson(vecchiaDir, `${nc.id}.json`, {
        ...vecchia,
        _cestino:      true,
        _eliminato_il: new Date().toISOString(),
      });
    } catch (err) {
      // Non bloccante: la NC esiste già nella nuova posizione.
      // Al prossimo leggiNC() il record duplicato (con _cestino) viene filtrato.
      console.warn(`NC_SERVICE: soft-delete NC "${nc.id}" da "${nc.stato_risoluzione}" fallito.`, err);
    }

    return ncAggiornata;
  };

  // ── API pubblica ─────────────────────────────────────────────────────────────

  return {
    creaNCVuota,
    creaNC,
    leggiNC,
    aggiornaNC,
    cambiaStatoRisoluzione,
  };
})();
