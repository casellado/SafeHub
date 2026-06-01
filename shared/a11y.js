/**
 * a11y.js — Accessibilità: focus management e helper ARIA.
 * Impostato in M1 così tutti i moduli lo ereditano (M1-Fondazione.md §7.3).
 */

const A11Y = (() => {

  const FOCUSABILI = 'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

  /**
   * Sposta il focus su un elemento o sul suo primo discendente focusabile.
   * Usato ai cambi di vista per mantenere il flusso da tastiera.
   * @param {string|HTMLElement} target - selettore CSS o elemento
   */
  const spostaFocus = (target) => {
    const el = typeof target === 'string' ? document.querySelector(target) : target;
    if (!el) return;

    if (el.matches(FOCUSABILI)) {
      el.focus({ preventScroll: false });
    } else {
      const primo = el.querySelector(FOCUSABILI);
      primo?.focus({ preventScroll: false });
    }
  };

  /**
   * Annuncia un messaggio agli screen reader via aria-live.
   * Non visibile visivamente (classe sr-only).
   * @param {string} messaggio
   * @param {'polite'|'assertive'} [urgenza='polite']
   */
  const annuncia = (messaggio, urgenza = 'polite') => {
    const id     = `aria-live-${urgenza}`;
    let regione  = document.getElementById(id);
    if (!regione) {
      regione = document.createElement('div');
      regione.id = id;
      regione.setAttribute('aria-live', urgenza);
      regione.setAttribute('aria-atomic', 'true');
      regione.className = 'sr-only';
      document.body.appendChild(regione);
    }
    // Reset e re-impostazione: garantisce che gli screen reader riescano la lettura
    regione.textContent = '';
    setTimeout(() => { regione.textContent = messaggio; }, 50);
  };

  /**
   * Intrappola il focus all'interno di un contenitore (per modali e drawer).
   * @param {HTMLElement} contenitore
   * @returns {() => void} funzione di cleanup per rimuovere il trap
   */
  const trapFocus = (contenitore) => {
    const handler = (e) => {
      if (e.key !== 'Tab') return;
      const els   = [...contenitore.querySelectorAll(FOCUSABILI)];
      if (!els.length) { e.preventDefault(); return; }
      const primo = els[0], ultimo = els[els.length - 1];
      if (e.shiftKey && document.activeElement === primo) {
        e.preventDefault(); ultimo.focus();
      } else if (!e.shiftKey && document.activeElement === ultimo) {
        e.preventDefault(); primo.focus();
      }
    };
    contenitore.addEventListener('keydown', handler);
    return () => contenitore.removeEventListener('keydown', handler);
  };

  return { spostaFocus, annuncia, trapFocus };
})();
