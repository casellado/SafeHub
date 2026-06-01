/**
 * idb.js — Wrapper IndexedDB per safehub_archivio_db.
 *
 * PRINCIPIO: l'IDB è CACHE, non fonte di verità.
 * I file JSON/PDF in OneDrive sono canonici.
 * Se l'IDB diverge o si perde, rigeneraIndice() lo ricostruisce dai file.
 *
 * Store e indici da Schema-Dati-Completo.md §4.1 (fonte canonica).
 * M1-Fondazione.md §4 elenca i 5 store ma omette gli indici secondari:
 * qui si implementa lo schema completo dalla fonte dati canonica.
 */

const IDB = (() => {
  const DB_NOME     = 'safehub_archivio_db';
  const DB_VERSIONE = 1;
  let _db = null;

  /**
   * Apre (o crea) il database. Idempotente: riusa la connessione esistente.
   * @returns {Promise<IDBDatabase>}
   */
  const apri = () => new Promise((resolve, reject) => {
    if (_db) { resolve(_db); return; }

    const req = indexedDB.open(DB_NOME, DB_VERSIONE);

    req.onupgradeneeded = (e) => {
      const db = e.target.result;

      // cantieri_cache — elenco cantieri (§4.1)
      if (!db.objectStoreNames.contains('cantieri_cache')) {
        const s = db.createObjectStore('cantieri_cache', { keyPath: 'cantiere_id' });
        s.createIndex('attivo',               'attivo',               { unique: false });
        s.createIndex('ultimo_aggiornamento_at', 'ultimo_aggiornamento_at', { unique: false });
      }

      // documenti_indice — ricerca rapida su tutti i documenti (§4.1)
      if (!db.objectStoreNames.contains('documenti_indice')) {
        const s = db.createObjectStore('documenti_indice', { keyPath: 'id_documento' });
        s.createIndex('cantiere_id',    'cantiere_id',    { unique: false });
        s.createIndex('tipo_documento', 'tipo_documento', { unique: false });
        s.createIndex('stato',          'stato',          { unique: false });
        s.createIndex('data_documento', 'data_documento', { unique: false });
        s.createIndex('path_file',      'path_file',      { unique: true });
      }

      // verbali_ricevuti_inbox — inbox Flusso A, verbali da SafeCant (§4.1)
      if (!db.objectStoreNames.contains('verbali_ricevuti_inbox')) {
        const s = db.createObjectStore('verbali_ricevuti_inbox', { keyPath: 'id' });
        s.createIndex('cantiere_id',      'cantiere_id',      { unique: false });
        s.createIndex('stato_lavorazione','stato_lavorazione', { unique: false });
        s.createIndex('ricevuto_at',      'ricevuto_at',      { unique: false });
      }

      // impostazioni_archivio — cache di _config/impostazioni-archivio.json (§4.1)
      // Contiene anche l'handle della cartella OneDrive (non serializzabile come JSON,
      // ma IDB supporta oggetti nativi come FileSystemDirectoryHandle).
      if (!db.objectStoreNames.contains('impostazioni_archivio')) {
        db.createObjectStore('impostazioni_archivio', { keyPath: 'key' });
      }

      // cache_anagrafica — anagrafica per ricerche e calcolo scadenze (§4.1, M4/M25)
      if (!db.objectStoreNames.contains('cache_anagrafica')) {
        db.createObjectStore('cache_anagrafica', { keyPath: 'cantiere_id' });
      }
    };

    req.onsuccess  = (e) => { _db = e.target.result; resolve(_db); };
    req.onerror    = (e) => reject(new Error(`IDB non apribile: ${e.target.error?.message ?? 'errore'}`));
    req.onblocked  = ()  => reject(new Error('IDB bloccato: chiudi le altre schede di SafeHub e riprova.'));
  });

  /**
   * Legge un record per chiave primaria.
   * @param {string} store
   * @param {string|IDBKeyRange} key
   * @returns {Promise<any|null>}
   */
  const idbGet = async (store, key) => {
    const db = await apri();
    return new Promise((resolve, reject) => {
      const req = db.transaction(store, 'readonly').objectStore(store).get(key);
      req.onsuccess = () => resolve(req.result ?? null);
      req.onerror   = () => reject(req.error);
    });
  };

  /**
   * Scrive (inserisce o aggiorna) un record.
   * @param {string} store
   * @param {any} record
   */
  const idbPut = async (store, record) => {
    const db = await apri();
    return new Promise((resolve, reject) => {
      const req = db.transaction(store, 'readwrite').objectStore(store).put(record);
      req.onsuccess = () => resolve(req.result);
      req.onerror   = () => reject(req.error);
    });
  };

  /**
   * Elimina un record per chiave.
   * @param {string} store
   * @param {string} key
   */
  const idbDelete = async (store, key) => {
    const db = await apri();
    return new Promise((resolve, reject) => {
      const req = db.transaction(store, 'readwrite').objectStore(store).delete(key);
      req.onsuccess = () => resolve();
      req.onerror   = () => reject(req.error);
    });
  };

  /**
   * Restituisce tutti i record di uno store.
   * @param {string} store
   * @returns {Promise<any[]>}
   */
  const idbGetAll = async (store) => {
    const db = await apri();
    return new Promise((resolve, reject) => {
      const req = db.transaction(store, 'readonly').objectStore(store).getAll();
      req.onsuccess = () => resolve(req.result ?? []);
      req.onerror   = () => reject(req.error);
    });
  };

  /**
   * Legge tutti i record filtrati per valore di un indice.
   * @param {string} store
   * @param {string} indice
   * @param {any} valore
   * @returns {Promise<any[]>}
   */
  const idbGetByIndex = async (store, indice, valore) => {
    const db = await apri();
    return new Promise((resolve, reject) => {
      const req = db.transaction(store, 'readonly')
        .objectStore(store).index(indice).getAll(valore);
      req.onsuccess = () => resolve(req.result ?? []);
      req.onerror   = () => reject(req.error);
    });
  };

  /**
   * Svuota completamente uno store.
   * @param {string} store
   */
  const idbSvuota = async (store) => {
    const db = await apri();
    return new Promise((resolve, reject) => {
      const req = db.transaction(store, 'readwrite').objectStore(store).clear();
      req.onsuccess = () => resolve();
      req.onerror   = () => reject(req.error);
    });
  };

  /**
   * Ri-scansiona SafeHub-CSE-Lavori/ e ricostruisce cantieri_cache e documenti_indice.
   *
   * Chiamare quando l'IDB è incoerente, dopo operazioni esterne sulla cartella,
   * o su richiesta esplicita del PO ("Riscansiona").
   *
   * Non tocca verbali_ricevuti_inbox, cache_anagrafica, impostazioni_archivio:
   * quelli vengono gestiti dai moduli che li usano (M7, M4, M2).
   *
   * @param {FileSystemDirectoryHandle} rootHandle
   */
  const rigeneraIndice = async (rootHandle) => {
    await idbSvuota('cantieri_cache');
    await idbSvuota('documenti_indice');

    for await (const [nome, handle] of rootHandle.entries()) {
      if (handle.kind !== 'directory' || nome.startsWith('_') || nome.startsWith('.')) continue;

      const record = {
        cantiere_id: nome,
        attivo: true,
        ultimo_aggiornamento_at: new Date().toISOString(),
      };

      // Arricchisce il record con i metadati dal file anagrafica, se presente.
      // Legge n_imprese e scaffold_completo per il cruscotto di M3 (zero costo extra:
      // il file è già aperto per leggere nome e stato).
      try {
        const anagDir = await handle.getDirectoryHandle('15_Anagrafica', { create: false });
        for await (const [fn, fh] of anagDir.entries()) {
          if (fn.startsWith('anagrafica_') && fn.endsWith('.json')) {
            const testo  = await (await fh.getFile()).text();
            const parsed = JSON.parse(testo);
            record.nome             = parsed.lotto?.nome  ?? nome;
            record.stato            = parsed.lotto?.stato ?? 'attivo';
            record.attivo           = record.stato !== 'concluso-archiviato';
            record.n_imprese        = parsed.imprese?.length ?? 0;
            record.scaffold_completo = true;
            break;
          }
        }
      } catch {
        // Anagrafica assente: cantiere creato fuori dall'app o struttura incompleta
        record.scaffold_completo = false;
        record.n_imprese = 0;
      }

      await idbPut('cantieri_cache', record);
    }
  };

  return { apri, idbGet, idbPut, idbDelete, idbGetAll, idbGetByIndex, idbSvuota, rigeneraIndice };
})();
