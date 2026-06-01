/**
 * notifiche.js — Toast e feedback UI uniformi.
 * Usato da tutti i moduli per comunicare stati all'utente.
 * Le notifiche di errore (tipo 'errore') restano aperte finché l'utente le chiude.
 */

const NOTIFICHE = (() => {

  const ICONE = { info: 'ℹ', successo: '✓', attenzione: '⚠', errore: '✕' };

  /**
   * Mostra un toast.
   * @param {{tipo: 'info'|'successo'|'attenzione'|'errore', titolo: string, messaggio?: string, durata?: number}} opzioni
   *   durata in ms; 0 = rimane fino a chiusura manuale
   */
  const mostra = ({ tipo = 'info', titolo, messaggio, durata = 4000 }) => {
    const container = document.getElementById('notifiche-container');
    if (!container) return;

    const el = document.createElement('div');
    el.className = `notifica-toast ${tipo}`;
    el.setAttribute('role', 'alert');
    el.setAttribute('aria-live', tipo === 'errore' ? 'assertive' : 'polite');

    // Usa escapeHtml: titolo e messaggio possono contenere dati esterni
    el.innerHTML = `
      <span class="notifica-icona" aria-hidden="true">${ICONE[tipo] ?? 'ℹ'}</span>
      <div class="notifica-testo">
        <strong>${UTILS.escapeHtml(titolo)}</strong>
        ${messaggio ? `<span>${UTILS.escapeHtml(messaggio)}</span>` : ''}
      </div>
      ${durata === 0
        ? `<button class="notifica-chiudi" aria-label="Chiudi notifica">×</button>`
        : ''}
    `;

    if (durata === 0) {
      el.querySelector('.notifica-chiudi')
        ?.addEventListener('click', () => rimuovi(el));
    }

    container.appendChild(el);

    if (durata > 0) {
      setTimeout(() => rimuovi(el), durata);
    }
  };

  const rimuovi = (el) => {
    el.style.opacity = '0';
    el.style.transition = 'opacity 250ms';
    setTimeout(() => el.remove(), 260);
  };

  /** Shorthand per i tipi comuni. */
  const info      = (titolo, msg)            => mostra({ tipo: 'info',      titolo, messaggio: msg });
  const successo  = (titolo, msg)            => mostra({ tipo: 'successo',  titolo, messaggio: msg });
  const attenzione = (titolo, msg, d = 6000) => mostra({ tipo: 'attenzione', titolo, messaggio: msg, durata: d });
  const errore    = (titolo, msg)            => mostra({ tipo: 'errore',    titolo, messaggio: msg, durata: 0 });

  return { mostra, info, successo, attenzione, errore };
})();
