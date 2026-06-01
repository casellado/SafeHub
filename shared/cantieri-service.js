/**
 * cantieri-service.js — Operazioni sui cantieri (crea, aggiorna, archivia).
 *
 * Usato da M3. La logica strutturale (scaffolding) delegata a FILESYSTEM.creaScaffolding().
 * Gestisce il file anagrafica_<id>.json: M3 scrive solo il nodo `lotto`;
 * M4 scriverà le collezioni (imprese, lavoratori, ...) senza toccare `lotto`.
 *
 * Schema del file anagrafica: schema-anagrafica-canonico-v2.md.
 */

const CANTIERI_SERVICE = (() => {

  // ---- API pubblica ----

  /**
   * Crea un nuovo cantiere: scaffolding 16 cartelle + anagrafica iniziale.
   * Atomico: se un passo fallisce, ciò che è stato creato non viene rimosso
   * (le operazioni filesystem sono idempotenti, un retry non duplica).
   *
   * @param {string} id   - ID cantiere validato e univoco
   * @param {string} nome - denominazione leggibile interna
   */
  const crea = async (id, nome) => {
    const root = FILESYSTEM.getHandleAttivo();
    if (!root) throw new Error('Cartella radice non disponibile.');

    // 1. Scaffolding 16 cartelle (idempotente)
    const cantHandle = await FILESYSTEM.creaScaffolding(root, id);

    // 2. Anagrafica iniziale con schema v2.0 completo
    const anagDir    = await cantHandle.getDirectoryHandle('15_Anagrafica', { create: false });
    const anagrafica = _creaAnagraficaIniziale(id, nome);
    await FILESYSTEM.scriviJson(anagDir, `anagrafica_${id}.json`, anagrafica);

    // 3. Aggiorna cache IDB
    await IDB.idbPut('cantieri_cache', {
      cantiere_id: id,
      nome,
      stato: 'attivo',
      attivo: true,
      n_imprese: 0,
      scaffold_completo: true,
      ultimo_aggiornamento_at: new Date().toISOString(),
    });
  };

  /**
   * Legge il file anagrafica del cantiere.
   * @param {string} id
   * @returns {Promise<Object>} - intero file anagrafica (lotto + collezioni)
   */
  const leggiAnagrafica = async (id) => {
    const root      = FILESYSTEM.getHandleAttivo();
    const cantDir   = await root.getDirectoryHandle(id);
    const anagDir   = await cantDir.getDirectoryHandle('15_Anagrafica');
    return FILESYSTEM.leggiJson(anagDir, `anagrafica_${id}.json`);
  };

  /**
   * Aggiorna solo il nodo `lotto` nel file anagrafica.
   * Non tocca imprese[], lavoratori[], ecc. — quelli appartengono a M4.
   *
   * @param {string} id
   * @param {Object} datiLotto - campi del nodo lotto da aggiornare (merge parziale)
   */
  const aggiornaDatiLotto = async (id, datiLotto) => {
    const root    = FILESYSTEM.getHandleAttivo();
    const cantDir = await root.getDirectoryHandle(id);
    const anagDir = await cantDir.getDirectoryHandle('15_Anagrafica');

    let anagrafica;
    try {
      anagrafica = await FILESYSTEM.leggiJson(anagDir, `anagrafica_${id}.json`);
    } catch {
      // File non trovato: crea struttura iniziale
      anagrafica = _creaAnagraficaIniziale(id, datiLotto.nome ?? id);
    }

    // Merge parziale: aggiorna i campi forniti, mantiene quelli non toccati
    anagrafica.lotto = { ...anagrafica.lotto, ...datiLotto, id };
    anagrafica.generato_il = new Date().toISOString();

    await FILESYSTEM.scriviJson(anagDir, `anagrafica_${id}.json`, anagrafica);

    // Aggiorna cache IDB (solo i campi che cambiano con l'editing del lotto)
    const cached = await IDB.idbGet('cantieri_cache', id) ?? { cantiere_id: id };
    const nuovoStato = datiLotto.stato ?? cached.stato ?? 'attivo';
    await IDB.idbPut('cantieri_cache', {
      ...cached,
      nome:                      datiLotto.nome ?? cached.nome ?? id,
      stato:                     nuovoStato,
      attivo:                    nuovoStato !== 'concluso-archiviato',
      ultimo_aggiornamento_at:   new Date().toISOString(),
    });
  };

  /**
   * Inizializza scaffolding e anagrafica per un cantiere trovato fuori dall'app.
   * Idempotente: se lo scaffold è già parzialmente presente, lo completa.
   * Non sovrascrive l'anagrafica se esiste già.
   *
   * @param {string} id
   */
  const inizializzaCantiereFuoriApp = async (id) => {
    const root = FILESYSTEM.getHandleAttivo();

    // Completa scaffold (idempotente: getDirectoryHandle con create:true non duplica)
    const cantHandle = await FILESYSTEM.creaScaffolding(root, id);
    const anagDir    = await cantHandle.getDirectoryHandle('15_Anagrafica', { create: false });

    // Crea anagrafica solo se non esiste
    let haAnagrafica = false;
    try {
      await FILESYSTEM.leggiJson(anagDir, `anagrafica_${id}.json`);
      haAnagrafica = true;
    } catch { /* non esiste */ }

    if (!haAnagrafica) {
      await FILESYSTEM.scriviJson(anagDir, `anagrafica_${id}.json`, _creaAnagraficaIniziale(id, id));
    }

    await IDB.idbPut('cantieri_cache', {
      cantiere_id: id,
      nome: id,
      stato: 'attivo',
      attivo: true,
      n_imprese: 0,
      scaffold_completo: true,
      ultimo_aggiornamento_at: new Date().toISOString(),
    });
  };

  // ---- Utilità interna ----

  /**
   * Struttura dati dell'anagrafica iniziale con schema v2.0 completo.
   * Tutte le 8 collezioni come array vuoti, nodo lotto con tutti i campi a null.
   * Schema da schema-anagrafica-canonico-v2.md §2-3.
   */
  const _creaAnagraficaIniziale = (id, nome) => ({
    schema_version:        '2.0',
    tipo_file:             'anagrafica_cantiere',
    generato_da:           'SafeHub Archivio',
    generato_da_versione:  '1.0.0',
    generato_il:           new Date().toISOString(),
    variante:              'completa',

    lotto: {
      id,
      nome:                    nome ?? '',
      committente:             '',
      strutturaTerritoriale:   null,
      ssNumero:                null,
      progressivaInizio:       null,
      progressivaFine:         null,
      codicePpmSil:            null,
      commessaNumero:          null,
      voceBudget:              null,
      cup:                     null,
      cig:                     null,
      contrattoNumero:         null,
      contrattoData:           null,
      importoContratto:        null,
      dataConsegnaLavori:      null,
      durataContrattuale:      null,
      giorniSospensione:       0,
      dataInizioEffettiva:     null,
      dataFineEffettiva:       null,
      stato:                   'attivo',
      ruoli_istituzionali: {
        rupId:               null,
        dlId:                null,
        cseTitolareId:       null,
        cseDelegatoId:       null,
        ispettoreCantiereId: null,
        responsabileLavoriId:null,
      },
      csp: { nome: null, qualifica: null, recapito: null },
      impresaAffidatariaId: null,
    },

    // 8 collezioni vuote — M4 le popolerà
    imprese:            [],
    lavoratori:         [],
    mezzi:              [],
    attrezzature:       [],
    noli:               [],
    persone_committente:[],
    persone_terzi:      [],
  });

  return { crea, leggiAnagrafica, aggiornaDatiLotto, inizializzaCantiereFuoriApp };
})();
