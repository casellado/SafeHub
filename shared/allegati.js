/**
 * allegati.js — Helper riusabile per aprire e scaricare allegati base64.
 *
 * Gli allegati vivono come data-URL (base64) dentro i JSON dell'anagrafica.
 * Questo modulo converte la data-URL in Blob e gestisce open/download,
 * revocando sempre l'object URL per evitare memory leak.
 *
 * Riusabile da qualsiasi modulo: ALLEGATI.apriAllegato(base64, filename).
 * Se base64 è assente o vuoto (variante leggera SafeCant), non fa nulla.
 */

const ALLEGATI = (() => {

  /**
   * Converte una data-URL (base64) in Blob tramite fetch.
   * Gestisce qualsiasi MIME: application/pdf, image/png, image/jpeg, ecc.
   * @param {string} dataUrl
   * @returns {Promise<Blob>}
   */
  const _dataUrlToBlob = (dataUrl) => fetch(dataUrl).then(r => r.blob());

  /**
   * Apre un allegato in una nuova scheda del browser.
   * L'object URL viene revocato dopo 60 s: tempo sufficiente anche per file grandi.
   * Se base64 è assente o vuoto non fa nulla (variante leggera SafeCant).
   *
   * @param {string} base64   - data-URL completa (es. "data:application/pdf;base64,…")
   * @param {string} filename - nome del file (usato come fallback nel titolo scheda)
   */
  const apriAllegato = async (base64, filename) => {
    if (!base64) return;
    try {
      const blob = await _dataUrlToBlob(base64);
      const url  = URL.createObjectURL(blob);
      window.open(url, '_blank', 'noopener');
      // 60 s sono ampiamente sufficienti perché il browser completi la navigazione.
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (err) {
      console.error('[allegati] apriAllegato:', filename, err);
    }
  };

  /**
   * Scarica un allegato con il nome file originale.
   * L'object URL viene revocato dopo 100 ms: il browser ha già avviato il download.
   * Se base64 è assente o vuoto non fa nulla.
   *
   * @param {string} base64   - data-URL completa
   * @param {string} filename - nome del file per l'attributo download
   */
  const scaricaAllegato = async (base64, filename) => {
    if (!base64) return;
    try {
      const blob = await _dataUrlToBlob(base64);
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement('a');
      a.href     = url;
      a.download = filename ?? 'documento';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 100);
    } catch (err) {
      console.error('[allegati] scaricaAllegato:', filename, err);
    }
  };

  return { apriAllegato, scaricaAllegato };
})();
