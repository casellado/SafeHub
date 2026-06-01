/**
 * utils.js — Funzioni di utilità condivise.
 * Formattazione date, generazione ID, escape HTML, validazione.
 * Esposto come oggetto globale UTILS.
 */

const UTILS = (() => {

  /**
   * Genera un UUID v4 per gli ID dei documenti.
   * Usa crypto.randomUUID() dove disponibile, fallback manuale altrimenti.
   * @returns {string}
   */
  const uuid = () =>
    crypto.randomUUID?.() ??
    'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = Math.random() * 16 | 0;
      return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
    });

  /**
   * Genera un ID locale con prefisso e timestamp.
   * Usato per le entità dell'anagrafica (imp_, lav_, mzo_, att_, nol_, pc_, pt_).
   * @param {string} prefisso
   * @returns {string}
   */
  const generaId = (prefisso) => `${prefisso}_${Date.now()}`;

  /**
   * Formatta una data ISO in formato italiano gg/mm/aaaa.
   * @param {string|null} iso
   * @returns {string}
   */
  const formatData = (iso) => {
    if (!iso) return '—';
    try {
      const d = new Date(iso);
      if (isNaN(d.getTime())) return '—';
      return d.toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric' });
    } catch { return '—'; }
  };

  /**
   * Formatta data+ora ISO in formato italiano.
   * @param {string|null} iso
   * @returns {string}
   */
  const formatDataOra = (iso) => {
    if (!iso) return '—';
    try {
      const d = new Date(iso);
      if (isNaN(d.getTime())) return '—';
      return d.toLocaleString('it-IT', {
        day: '2-digit', month: '2-digit', year: 'numeric',
        hour: '2-digit', minute: '2-digit',
      });
    } catch { return '—'; }
  };

  /** Oggi come YYYY-MM-DD (per campi <input type="date">). */
  const oggi = () => new Date().toISOString().slice(0, 10);

  /**
   * Giorni mancanti a una scadenza (negativo = già scaduto).
   * @param {string|null} isoScadenza
   * @returns {number|null}
   */
  const giorniAllaScadenza = (isoScadenza) => {
    if (!isoScadenza) return null;
    return Math.ceil((new Date(isoScadenza) - new Date()) / 86_400_000);
  };

  /**
   * Escapa caratteri HTML per prevenire XSS.
   * OBBLIGATORIO prima di inserire dati utente in innerHTML.
   * @param {string|null} str
   * @returns {string}
   */
  const escapeHtml = (str) => {
    if (str == null) return '';
    return String(str)
      .replace(/&/g,  '&amp;')
      .replace(/</g,  '&lt;')
      .replace(/>/g,  '&gt;')
      .replace(/"/g,  '&quot;')
      .replace(/'/g,  '&#039;');
  };

  /**
   * Valida un ID cantiere come nome cartella (Windows + Unix).
   * No spazi, no caratteri speciali, 2-50 caratteri alfanumerici + trattino.
   * @param {string} id
   * @returns {boolean}
   */
  const isIdCantierValido = (id) => {
    if (!id || id.length < 2 || id.length > 50) return false;
    return /^[A-Za-z0-9][A-Za-z0-9\-]*[A-Za-z0-9]$/i.test(id);
  };

  /**
   * Normalizza un ID cantiere (maiuscolo, spazi → trattino, rimuove caratteri non validi).
   * @param {string} id
   * @returns {string}
   */
  const normalizzaIdCantiere = (id) =>
    id.toUpperCase().replace(/\s+/g, '-').replace(/[^A-Z0-9\-]/g, '');

  return {
    uuid, generaId,
    formatData, formatDataOra, oggi, giorniAllaScadenza,
    escapeHtml,
    isIdCantierValido, normalizzaIdCantiere,
  };
})();
