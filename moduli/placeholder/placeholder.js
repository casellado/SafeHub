/**
 * placeholder.js — Modulo demo per M1.
 *
 * Dimostra che un componente può montarsi nella shell,
 * leggere $store.cantiere e reagire a 'cantiere-cambiato'.
 * In M1 tutti i moduli non ancora costruiti mostrano questa vista.
 * Verrà sostituito modulo per modulo a partire da M2.
 */

const PLACEHOLDER = (() => {

  const ETICHETTE = {
    'cruscotto':             'Cruscotto Generale',
    'anagrafica-cantiere':   'Anagrafica Cantiere',
    'registro-psc':          'Registro PSC',
    'personale-sicurezza':   'Personale della Sicurezza',
    'imprese':               'Imprese',
    'lavoratori':            'Lavoratori',
    'mezzi-attrezzature':    'Mezzi e Attrezzature',
    'noli':                  'Noli',
    'enti-terzi':            'Enti Terzi',
    'non-conformita':        'Non Conformità',
    'eventi-incidentali':    'Eventi Incidentali',
    'foto-cantiere':         'Foto Cantiere',
    'verifica-pos':          'Verifica POS / ITP',
    'proposte-sospensione':  'Proposte di Sospensione CSE',
    'pos':                   'POS Imprese',
    'conformita-documenti':  'Conformità Documenti',
    'diario-cse':            'Diario CSE',
    'archivio-documenti':    'Archivio Documenti',
    'ods':                   'Ordini di Servizio',
    'impostazioni':          'Impostazioni',
    'cestino':               'Cestino',
  };

  /**
   * Monta il modulo placeholder nel contenitore principale.
   * Legge $store.cantiere per mostrare il contesto corrente.
   * @param {string} id - identificativo modulo
   */
  const monta = (id) => {
    const contenitore = document.getElementById('contenuto-modulo');
    if (!contenitore) return;

    const cantiere     = Alpine.store('cantiere');
    const nomeModulo   = ETICHETTE[id] ?? id;
    const nomeCantiere = cantiere.id
      ? UTILS.escapeHtml(cantiere.nome ?? cantiere.id)
      : null;

    contenitore.innerHTML = `
      <div class="placeholder-modulo" role="region" aria-label="${UTILS.escapeHtml(nomeModulo)}">
        <div style="font-size:2.5rem;line-height:1" aria-hidden="true">🚧</div>
        <h2 style="font-size:1.25rem;font-weight:600;color:#1e293b;margin:0.5rem 0 0">
          ${UTILS.escapeHtml(nomeModulo)}
        </h2>
        <p style="color:#94a3b8;margin:0.25rem 0 0;font-size:0.875rem">
          Modulo in costruzione
        </p>
        ${nomeCantiere
          ? `<p style="margin-top:1rem;font-size:0.8125rem;color:#64748b;
                       background:#f1f5f9;padding:0.375rem 0.75rem;border-radius:0.375rem">
               Cantiere: <strong>${nomeCantiere}</strong>
             </p>`
          : `<p style="margin-top:1rem;font-size:0.8125rem;color:#94a3b8">
               Nessun cantiere selezionato
             </p>`
        }
      </div>
    `;

    // Ascolta i cambi di cantiere per aggiornare il contesto mostrato
    // (rimozione al prossimo mount per evitare listener multipli)
    _rimuoviListenerCantiere?.();
    const handler = () => monta(id);
    document.addEventListener('cantiere-cambiato', handler);
    _rimuoviListenerCantiere = () => document.removeEventListener('cantiere-cambiato', handler);
  };

  let _rimuoviListenerCantiere = null;

  return { monta };
})();
