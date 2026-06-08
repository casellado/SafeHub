/**
 * durate-documenti.js — Tabella durate normative e calcolo scadenza-da-rilascio.
 *
 * DATO centralizzato (non logica sparsa): un solo posto dove aggiornare
 * le durate normative quando cambiano per legge o circolare.
 *
 * calcolaScadenzaProposta() è pura: nessun effetto collaterale.
 * I calcolaScadenze* esistenti in anagrafica-service.js leggono i campi
 * scadenza/prossima già valorizzati — questa funzione li alimenta, non li sostituisce.
 *
 * Certezza:
 *   'certa'      → durata fissa per legge (DURC 120gg D.P.R. 207/2010 art.6 c.4)
 *   'indicativa' → periodicità frequente ma variabile per tipo/caso concreto
 */

const DURATE_DOCUMENTI = (() => {

  // ── Tabella durate ────────────────────────────────────────────────────────────
  // Chiave = valore stringa usata nei form e nei chiamanti.
  // Per aggiornare: modificare SOLO questa struttura.

  const TABELLA = {
    'DURC':                  { giorni: 120,  certezza: 'certa'      }, // D.P.R. 207/2010 art.6 c.4
    'visita_medica':         { giorni: 365,  certezza: 'indicativa' }, // art.41 D.Lgs 81/08 — frequenza decisa dal MC
    'formazione':            { giorni: 1825, certezza: 'indicativa' }, // art.37 + Accordo 21/12/2011 — aggiornamento ogni 5 anni
    'abilitazione':          { giorni: 1825, certezza: 'indicativa' }, // Accordo Stato-Regioni 22/02/2012 — rinnovo ogni 5 anni
    'POLIZZA_RC':            { giorni: 365,  certezza: 'indicativa' }, // tipicamente annuale — varia per contratto
    'verifica_mezzo':        { giorni: 365,  certezza: 'indicativa' }, // All.VII D.Lgs 81/08 — annuale/biennale/triennale per tipo
    'verifica_attrezzatura': { giorni: 365,  certezza: 'indicativa' }, // idem — periodicità variabile
  };

  // ── Testi nota (mostrati nei form accanto al campo scadenza) ──────────────────

  const _NOTA = {
    certa:      'ℹ Calcolata automaticamente (120 gg dal rilascio — DURC).',
    indicativa: '⚠ Indicativa — la periodicità può variare. Verifica e correggi se necessario.',
  };

  // ── API pubblica ──────────────────────────────────────────────────────────────

  /**
   * Calcola la data di scadenza proposta.
   * @param {string} chiaveTipo - chiave in TABELLA ('DURC', 'visita_medica', …)
   * @param {string} dataISO    - data di rilascio in formato YYYY-MM-DD
   * @returns {{ scadenza: string, certezza: 'certa'|'indicativa' } | null}
   */
  function calcolaScadenzaProposta(chiaveTipo, dataISO) {
    if (!chiaveTipo || !dataISO) return null;
    const def = TABELLA[chiaveTipo];
    if (!def) return null;
    // Ora fissa a mezzogiorno UTC per evitare shift di fuso orario su ±1 giorno
    const d = new Date(dataISO + 'T12:00:00Z');
    if (isNaN(d.getTime())) return null;
    d.setUTCDate(d.getUTCDate() + def.giorni);
    return { scadenza: d.toISOString().slice(0, 10), certezza: def.certezza };
  }

  /** true se il tipo ha una durata in tabella (e quindi una proposta disponibile). */
  function hasDurata(chiaveTipo) {
    return Object.prototype.hasOwnProperty.call(TABELLA, chiaveTipo);
  }

  /** 'certa' | 'indicativa' | null per il tipo dato. */
  function certezza(chiaveTipo) {
    return TABELLA[chiaveTipo]?.certezza ?? null;
  }

  /** Testo della nota da mostrare nei form. null se il tipo non è in tabella. */
  function nota(chiaveTipo) {
    const c = TABELLA[chiaveTipo]?.certezza;
    return _NOTA[c] ?? null;
  }

  return { calcolaScadenzaProposta, hasDurata, certezza, nota };

})();
