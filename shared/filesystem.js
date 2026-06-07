/**
 * filesystem.js — File System Access API: cartella OneDrive, read/write JSON, scaffolding.
 *
 * L'handle della cartella radice viene persistito in IDB (key 'root_handle').
 *
 * NOTA SUL PERMESSO TRA SESSIONI: Chrome/Edge salvano l'handle in IDB ma il permesso
 * scade ad ogni riavvio del browser. queryPermission() restituirà 'prompt', non 'granted'.
 * Non è un errore: è il comportamento del browser per proteggere il filesystem.
 * Il boot intercetta questo caso e mostra il pannello di riconnessione (un clic).
 */

const FILESYSTEM = (() => {

  // Handle attivo dopo il boot (impostato da completaAvvio in alpine-init.js).
  // Tutti i moduli lo usano per accedere ai file senza passarlo come argomento.
  let _handleAttivo = null;

  /** Imposta il rootHandle dopo che il permesso è granted. */
  const setHandleAttivo = (handle) => { _handleAttivo = handle; };

  /** Restituisce il rootHandle attivo, o null se non ancora disponibile. */
  const getHandleAttivo = () => _handleAttivo;

  /**
   * Controlla se File System Access API è disponibile.
   * Non è disponibile su Firefox né da file:// (serve HTTP/localhost).
   * @returns {boolean}
   */
  const isDisponibile = () => 'showDirectoryPicker' in window;

  /**
   * Apre il picker per selezionare la cartella radice SafeHub-CSE-Lavori/.
   * Persiste l'handle in IDB per i futuri avvii.
   * @returns {Promise<FileSystemDirectoryHandle>}
   */
  const agganciaCartella = async () => {
    const handle = await window.showDirectoryPicker({
      mode: 'readwrite',
      id: 'safehub-root',   // hint al browser per ricordare la cartella
    });
    await IDB.idbPut('impostazioni_archivio', { key: 'root_handle', handle });
    return handle;
  };

  /**
   * Recupera l'handle salvato in IDB e ne verifica il permesso.
   * @returns {Promise<{handle: FileSystemDirectoryHandle|null, statoPermesso: 'granted'|'prompt'|'denied'}>}
   */
  const getHandleCartella = async () => {
    const rec = await IDB.idbGet('impostazioni_archivio', 'root_handle');
    if (!rec?.handle) return { handle: null, statoPermesso: 'denied' };
    const perm = await rec.handle.queryPermission({ mode: 'readwrite' });
    return { handle: rec.handle, statoPermesso: perm };
  };

  /**
   * Richiede esplicitamente il permesso su un handle già salvato.
   * Chiamato dal pannello di riconnessione, che appare ad ogni sessione browser.
   * @param {FileSystemDirectoryHandle} handle
   * @returns {Promise<'granted'|'denied'>}
   */
  const richiediPermesso = async (handle) =>
    handle.requestPermission({ mode: 'readwrite' });

  /**
   * Legge e parsa un file JSON in una cartella.
   * @param {FileSystemDirectoryHandle} dirHandle
   * @param {string} nomeFile
   * @returns {Promise<any>}
   */
  const leggiJson = async (dirHandle, nomeFile) => {
    const fh   = await dirHandle.getFileHandle(nomeFile);
    const file = await fh.getFile();
    return JSON.parse(await file.text());
  };

  /**
   * Scrive un oggetto come JSON in un file (crea o sovrascrive).
   * @param {FileSystemDirectoryHandle} dirHandle
   * @param {string} nomeFile
   * @param {any} obj
   */
  const scriviJson = async (dirHandle, nomeFile, obj) => {
    const fh       = await dirHandle.getFileHandle(nomeFile, { create: true });
    const writable = await fh.createWritable();
    await writable.write(JSON.stringify(obj, null, 2));
    await writable.close();
    // Notifica ogni salvataggio — ascoltato da $store.sync per aggiornare il promemoria.
    document.dispatchEvent(new CustomEvent('safehub-scrittura'));
  };

  /**
   * Naviga lungo un percorso di sottocartelle.
   * @param {FileSystemDirectoryHandle} base
   * @param {string[]} percorso
   * @param {boolean} [crea=false]
   * @returns {Promise<FileSystemDirectoryHandle>}
   */
  const navigaPercorso = async (base, percorso, crea = false) => {
    let handle = base;
    for (const parte of percorso) {
      handle = await handle.getDirectoryHandle(parte, { create: crea });
    }
    return handle;
  };

  /**
   * Scansiona la cartella radice e restituisce i cantieri (sottocartelle non speciali).
   * @param {FileSystemDirectoryHandle} rootHandle
   * @returns {Promise<Array<{id: string, handle: FileSystemDirectoryHandle}>>}
   */
  const scansionaCantieri = async (rootHandle) => {
    const risultati = [];
    for await (const [nome, handle] of rootHandle.entries()) {
      if (handle.kind !== 'directory' || nome.startsWith('_') || nome.startsWith('.')) continue;
      risultati.push({ id: nome, handle });
    }
    return risultati;
  };

  /**
   * Crea lo scaffolding completo delle 16 cartelle tipizzate per un nuovo cantiere.
   * Idempotente: ri-eseguibile su un cantiere esistente senza danni.
   * Struttura da Schema-Dati-Completo.md §2.2 (contratto tecnico §3).
   *
   * @param {FileSystemDirectoryHandle} rootHandle
   * @param {string} idCantiere
   * @returns {Promise<FileSystemDirectoryHandle>} handle della cartella cantiere
   */
  const creaScaffolding = async (rootHandle, idCantiere) => {
    const cantDir = await rootHandle.getDirectoryHandle(idCantiere, { create: true });

    const struttura = [
      ['01_Verbali-Sopralluogo',       ['Bozze', 'Finalizzati']],
      ['02_Verbali-Riunione',          ['Bozze', 'Protocollati']],
      ['03_Verifiche-POS',             ['Bozze', 'Protocollati']],
      ['04_Proposte-Sospensione-CSE',  ['Bozze', 'Protocollati']],
      ['05_Non-Conformita',            ['Aperte', 'In-Risoluzione', 'Chiuse']],
      ['06_Eventi-Incidentali',        []],          // cartella piatta: stato nel record, non nella posizione file
      ['07_ODS-Inviati',               []],
      ['08_Diario-CSE',                []],
      ['09_Registro-PSC',              []],
      ['10_Notifica-Preliminare',      ['Originale', 'Aggiornamenti']],
      ['11_Verifiche-Enti-Esterni',    []],
      ['12_Disposizioni-Sospensioni-RL', []],
      ['13_ODS-Ricevuti',              []],
      ['14_POS-Documentale',           []],
      ['15_Anagrafica',                []],
      ['16_Foto',                      []],
      ['17_POS',                       []],
      ['18_Archivio-Documenti',        []],
    ];

    for (const [nome, sub] of struttura) {
      const d = await cantDir.getDirectoryHandle(nome, { create: true });
      for (const s of sub) await d.getDirectoryHandle(s, { create: true });
    }

    return cantDir;
  };

  return {
    isDisponibile,
    setHandleAttivo, getHandleAttivo,
    agganciaCartella, getHandleCartella, richiediPermesso,
    leggiJson, scriviJson, navigaPercorso,
    scansionaCantieri, creaScaffolding,
  };
})();
