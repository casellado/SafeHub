/**
 * errori.js — Gestione errori centralizzata.
 *
 * gestisciErrore(contesto, err, opzioni) è il punto unico di ingresso.
 * Distingue errori recuperabili da fatali, mostra toast comprensibili,
 * mai stack trace grezzo all'utente.
 *
 * Casi specifici OneDrive/FSA coperti (M1-Fondazione.md §6.2):
 *  - FSA negato/non disponibile
 *  - File cloud-only non ancora scaricato da OneDrive
 *  - JSON corrotto (isola il file, continua col resto)
 *  - IDB non apribile
 */

const ERRORI = (() => {

  /**
   * Classifica un errore e restituisce il messaggio utente appropriato.
   * @param {Error|any} err
   * @param {string} contesto
   * @returns {{tipo: 'recuperabile'|'fatale', titolo: string, messaggio: string}}
   */
  const classifica = (err, contesto) => {
    const nome = err?.name  ?? '';
    const msg  = err?.message ?? String(err);

    // FSA negato o non disponibile (browser incompatibile, avvio da file://)
    if (['NotAllowedError', 'SecurityError'].includes(nome)) {
      return {
        tipo: 'recuperabile',
        titolo: 'Accesso cartella non autorizzato',
        messaggio: 'Usa Edge o Chrome e concedi l\'accesso alla cartella quando richiesto.',
      };
    }

    // Utente ha annullato il picker: silenzioso, non è un errore
    if (nome === 'AbortError') {
      return { tipo: 'recuperabile', titolo: '', messaggio: '' };  // silenziato dal chiamante
    }

    // File in stato cloud-only: OneDrive non l'ha ancora scaricato localmente
    if (nome === 'NotFoundError' || msg.includes('cloud-only') || msg.includes('sync')) {
      return {
        tipo: 'recuperabile',
        titolo: 'File non ancora sincronizzato',
        messaggio: 'OneDrive sta ancora scaricando questo file. Attendi e riprova.',
      };
    }

    // JSON malformato: isola il file, l'app continua
    if (err instanceof SyntaxError || msg.toLowerCase().includes('json')) {
      return {
        tipo: 'recuperabile',
        titolo: 'File dati non leggibile',
        messaggio: `Un file in "${contesto}" sembra corrotto. I dati degli altri file sono intatti.`,
      };
    }

    // IDB non apribile (quota, browser bloccato, sessione privata con restrizioni)
    if (msg.includes('IDB') || nome === 'InvalidStateError' || nome === 'QuotaExceededError') {
      return {
        tipo: 'recuperabile',
        titolo: 'Cache locale non disponibile',
        messaggio: 'Il database locale verrà ricreato automaticamente. I dati in OneDrive sono al sicuro.',
      };
    }

    // Errore generico — fatale
    return {
      tipo: 'fatale',
      titolo: `Errore — ${contesto}`,
      messaggio: msg.length < 200 ? msg : msg.slice(0, 200) + '…',
    };
  };

  /**
   * Gestisce un errore: logga in console con contesto, mostra toast appropriato.
   *
   * @param {string} contesto - descrizione del punto in cui è avvenuto l'errore
   * @param {Error|any} err
   * @param {{silenziato?: boolean, callback?: Function}} [opzioni]
   *   silenziato: true = solo console, niente toast
   *   callback: funzione da chiamare dopo (es. reset stato)
   */
  const gestisciErrore = (contesto, err, opzioni = {}) => {
    console.error(`[SafeHub/${contesto}]`, err);

    if (opzioni.silenziato || err?.name === 'AbortError') {
      opzioni.callback?.();
      return;
    }

    const { tipo, titolo, messaggio } = classifica(err, contesto);

    if (!titolo) { opzioni.callback?.(); return; }   // messaggio vuoto = silenzioso

    if (tipo === 'fatale') {
      NOTIFICHE.errore(titolo, messaggio);
    } else {
      NOTIFICHE.attenzione(titolo, messaggio);
    }

    opzioni.callback?.();
  };

  return { gestisciErrore, classifica };
})();
