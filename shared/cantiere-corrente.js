/**
 * cantiere-corrente.js — Factory per lo store Alpine $store.cantiere.
 *
 * UNICA fonte autorevole del lotto selezionato in tutta l'app.
 * Nessun modulo tiene una copia locale: tutti leggono da $store.cantiere.
 * Questa scelta risolve per costruzione la frammentazione di V3,
 * dove il cantiere corrente era su 3 fonti diverse e appState.currentProject
 * non veniva aggiornato da navigation.js.
 *
 * Registrato in alpine-init.js: Alpine.store('cantiere', CantiereCorrente()).
 */

const CantiereCorrente = () => ({
  id:          null,
  nome:        null,
  stato:       null,   // 'attivo' | 'sospeso' | 'concluso-archiviato'
  handle:      null,   // FileSystemDirectoryHandle della cartella cantiere
  caricamento: false,

  /**
   * Seleziona il cantiere corrente.
   * Aggiorna lo store → persiste in IDB → emette CustomEvent 'cantiere-cambiato'.
   * I moduli si iscrivono a 'cantiere-cambiato' per ricaricare i propri dati.
   *
   * @param {string} id
   * @param {Object} [dati] - metadati da cantieri_cache (nome, stato, handle)
   */
  async seleziona(id, dati = {}) {
    if (!id || this.id === id) return;

    this.caricamento = true;
    try {
      this.id     = id;
      this.nome   = dati.nome   ?? id;
      this.stato  = dati.stato  ?? 'attivo';
      this.handle = dati.handle ?? null;

      await IDB.idbPut('impostazioni_archivio', { key: 'ultimo_cantiere_id', value: id });

      document.dispatchEvent(
        new CustomEvent('cantiere-cambiato', { detail: { id, nome: this.nome } })
      );

      A11Y.annuncia(`Cantiere: ${this.nome}`);
    } catch (err) {
      ERRORI.gestisciErrore('cantiere-corrente/seleziona', err);
    } finally {
      this.caricamento = false;
    }
  },

  /** Deseleziona (es. nessun cantiere disponibile, o reset esplicito). */
  deseleziona() {
    this.id = this.nome = this.stato = this.handle = null;
    document.dispatchEvent(new CustomEvent('cantiere-cambiato', { detail: { id: null } }));
  },
});
