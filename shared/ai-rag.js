/**
 * ai-rag.js — M26 Passo 3: RAG normativo CSE.
 *
 * Carica data/rag_cse_completo.json (dato curato dal CSE, non modificarlo qui).
 * Propone temi per parole-chiave sul testo della bozza, recupera chunk per tag.
 *
 * validate_rag.py (nella radice del repo) è lo strumento di manutenzione:
 * va eseguito manualmente a ogni aggiornamento del RAG. Mai a runtime.
 *
 * API pubblica:
 *   AI_RAG.carica()               → Promise<bool>  — carica il JSON (idempotente)
 *   AI_RAG.totale()               → number         — numero chunk caricati
 *   AI_RAG.temiDisponibili()      → string[]       — tutti i temi nel vocabolario
 *   AI_RAG.proponiTemi(testo)     → string[]       — temi proposti per parole-chiave
 *   AI_RAG.recupera(temi, max)    → chunk[]        — chunk per tag, ordinati per pertinenza
 *   AI_RAG.costruisciContesto(cc) → string         — testo formattato per il prompt Ollama
 */

'use strict';

const AI_RAG = (() => {

  const PATH_RAG = 'data/rag_cse_completo.json';

  let _chunks = null;
  let _promessaCaricamento = null;

  // ── Mappa parole-chiave (minuscolo) → tema ────────────────────────────────
  // Substring match: 'scavo' becca 'scavo', 'scavi', 'escavazione' ecc.
  // Un termine può mappare a più temi. Aggiungere consapevolmente.
  const _MAPPA_KEYWORDS = {
    // ponteggi
    'ponteggio':             ['ponteggi', 'lavori_in_quota'],
    'ponteggi':              ['ponteggi', 'lavori_in_quota'],
    'trabattello':           ['ponteggi', 'lavori_in_quota'],
    'pimus':                 ['ponteggi'],
    'pi.m.u.s':              ['ponteggi'],
    'piano di montaggio':    ['ponteggi'],
    // lavori in quota
    'quota':                 ['lavori_in_quota'],
    'caduta':                ['lavori_in_quota', 'dpi'],
    'anticaduta':            ['lavori_in_quota', 'dpi'],
    'parapetto':             ['lavori_in_quota'],
    'parapetti':             ['lavori_in_quota'],
    'rete di sicurezza':     ['lavori_in_quota'],
    'reti di sicurezza':     ['lavori_in_quota'],
    'scala ':                ['lavori_in_quota'],
    'scale ':                ['lavori_in_quota'],
    'imbracatura':           ['lavori_in_quota', 'dpi'],
    'funi':                  ['lavori_in_quota'],
    'vuoto':                 ['lavori_in_quota'],
    // psc
    'piano di sicurezza':    ['psc'],
    'piano sicurezza':       ['psc'],
    ' psc ':                 ['psc'],
    // pos (evita match su "possibile", "positivo" ecc.)
    ' pos ':                 ['pos'],
    'piano operativo':       ['pos'],
    // contestazione
    'contest':               ['contestazione'],
    'inosservanza':          ['contestazione'],
    'inadempien':            ['contestazione'],
    'diffida':               ['contestazione'],
    // vigilanza
    'sopralluogo':           ['vigilanza'],
    // sospensione
    'sospension':            ['sospensione'],
    'sospendere':            ['sospensione'],
    'sospeso':               ['sospensione'],
    'interrompere i lavori': ['sospensione'],
    'fermare i lavori':      ['sospensione'],
    // coordinamento
    'coordinamento':         ['coordinamento'],
    'riunione di coord':     ['coordinamento'],
    // scavi
    'scavo':                 ['scavi'],
    ' scavi':                ['scavi'],
    'trincea':               ['scavi'],
    'sbancamento':           ['scavi'],
    'armatur':               ['scavi'],
    'fronte di attacco':     ['scavi'],
    'puntell':               ['scavi'],
    // dpi
    ' dpi ':                 ['dpi'],
    'dispositivo di protezione': ['dpi'],
    'casco':                 ['dpi'],
    'elmetto':               ['dpi'],
    'alta visibilit':        ['dpi'],
    // rischio elettrico
    'elettric':              ['rischio_elettrico'],
    'linea elettrica':       ['rischio_elettrico'],
    'linee elettriche':      ['rischio_elettrico'],
    'conduttori':            ['rischio_elettrico'],
    // rischio interferenziale
    'interferenz':           ['rischio_interferenziale'],
    'compresenza':           ['rischio_interferenziale'],
    'sovrapposizione':       ['rischio_interferenziale'],
    // notifica preliminare
    'notifica preliminare':  ['notifica_preliminare'],
    // idoneità tecnico-professionale
    ' itp ':                 ['idoneita_tecnico_professionale'],
    'idoneit':               ['idoneita_tecnico_professionale'],
    'allegato xvii':         ['idoneita_tecnico_professionale'],
    'all. xvii':             ['idoneita_tecnico_professionale'],
    // infortuni
    'infortun':              ['infortuni'],
    'near miss':             ['infortuni'],
    'quasi incidente':       ['infortuni'],
    'evento incidentale':    ['infortuni'],
    'inabile':               ['infortuni'],
    // formazione
    'formazion':             ['formazione'],
    'addestramento':         ['formazione'],
    'abilitazione':          ['formazione'],
    'attestato':             ['formazione'],
    'patentino':             ['formazione'],
    'gruista':               ['formazione'],
    'carrellista':           ['formazione'],
    // costi sicurezza
    'costi sicurezza':       ['costi_sicurezza'],
    'costi della sicurezza': ['costi_sicurezza'],
    'stato di avanzamento':  ['costi_sicurezza'],
    // patente a crediti
    'patente a crediti':     ['patente_a_crediti'],
    'patente crediti':       ['patente_a_crediti'],
  };

  // ── Caricamento ──────────────────────────────────────────────────────────────

  const carica = () => {
    if (_chunks) return Promise.resolve(true);
    if (_promessaCaricamento) return _promessaCaricamento;

    _promessaCaricamento = (async () => {
      try {
        const res = await fetch(PATH_RAG);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        _chunks = data.chunks ?? [];
        console.log(`[AI_RAG] Caricati ${_chunks.length} chunk normativi.`);
        return true;
      } catch (err) {
        console.error('[AI_RAG] Impossibile caricare il RAG:', err);
        _chunks = [];
        return false;
      }
    })();
    return _promessaCaricamento;
  };

  // ── Statistiche ──────────────────────────────────────────────────────────────

  const totale = () => (_chunks ?? []).length;

  // ── Temi disponibili ─────────────────────────────────────────────────────────

  const temiDisponibili = () => {
    const set = new Set();
    (_chunks ?? []).forEach(c => (c.tema ?? []).forEach(t => set.add(t)));
    return [...set].sort();
  };

  // ── Proposta temi per parole-chiave ──────────────────────────────────────────

  /**
   * Analizza il testo della bozza con substring match e propone i temi pertinenti.
   * Trasparente: mappa hardcoded, nessuna rete.
   * @param {string} testo — la bozza del PO
   * @returns {string[]} — temi proposti (ordinati)
   */
  const proponiTemi = (testo) => {
    const lower = (testo ?? '').toLowerCase();
    const trovati = new Set();
    for (const [kw, temi] of Object.entries(_MAPPA_KEYWORDS)) {
      if (lower.includes(kw)) temi.forEach(t => trovati.add(t));
    }
    return [...trovati].sort();
  };

  // ── Recupero chunk per tag ───────────────────────────────────────────────────

  /**
   * Ritorna i chunk con almeno uno dei temi selezionati,
   * ordinati per numero di temi in comune (più pertinenti prima).
   * @param {string[]} temi
   * @param {number}   max — limite massimo (default 8)
   * @returns {object[]}
   */
  const recupera = (temi, max = 8) => {
    if (!_chunks || !temi.length) return [];
    const temiSet = new Set(temi);
    const scored = _chunks
      .map(c => ({
        chunk: c,
        match: (c.tema ?? []).filter(t => temiSet.has(t)).length,
      }))
      .filter(x => x.match > 0)
      .sort((a, b) => b.match - a.match);

    if (scored.length > max) {
      console.info(`[AI_RAG] ${scored.length} chunk trovati, limitati a ${max}.`);
    }
    return scored.slice(0, max).map(x => x.chunk);
  };

  // ── Costruzione contesto per il prompt ──────────────────────────────────────

  /**
   * Formatta i chunk come testo da iniettare nel prompt utente (davanti alla bozza).
   * Il modello deve citare SOLO i RIFERIMENTO listati qui.
   * @param {object[]} chunks
   * @returns {string}
   */
  const costruisciContesto = (chunks) => {
    if (!chunks.length) return '';
    const righe = chunks.map((c, i) => [
      `${i + 1}. RIFERIMENTO: ${c.riferimento}`,
      `   FONTE: ${c.fonte}`,
      `   TITOLO: ${c.titolo}`,
      `   TESTO: ${c.testo}`,
    ].join('\n'));

    return [
      '[RIFERIMENTI NORMATIVI DISPONIBILI]',
      'Cita ESCLUSIVAMENTE i riferimenti elencati qui sotto, riportando il campo RIFERIMENTO',
      'esattamente come appare. Per ogni punto non coperto da questi, scrivi [verificare riferimento normativo].\n',
      ...righe,
      '\n[BOZZA DA RISCRIVERE]',
      '',
    ].join('\n');
  };

  // ── API pubblica ──────────────────────────────────────────────────────────────

  return { carica, totale, temiDisponibili, proponiTemi, recupera, costruisciContesto };

})();
