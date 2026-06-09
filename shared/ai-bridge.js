/**
 * ai-bridge.js — M26: ponte tra SafeHub e Ollama locale.
 *
 * Incapsula TUTTA la comunicazione con Ollama (http://localhost:11434).
 * Le funzioni applicative (correttore, segugio, consulente) useranno
 * solo questa API senza conoscere i dettagli del protocollo Ollama.
 *
 * API pubblica:
 *   AI_BRIDGE.disponibile()  → Promise<bool>   — capability detection non-bloccante
 *   AI_BRIDGE.modelli()      → Promise<string[]>— lista modelli installati
 *   AI_BRIDGE.genera(opts)   → Promise<string>  — generazione testo con streaming
 *
 * Non richiede configurazione di Ollama: CORS verso localhost:8080
 * è già permesso di default in Ollama ≥ 0.1.x (verificato in audit).
 */

'use strict';

const AI_BRIDGE = (() => {

  const BASE_URL           = 'http://localhost:11434';
  const TIMEOUT_MS         = 2000;   // timeout per disponibile()
  const MODELLO_FALLBACK   = 'llama3.2:3b';

  // ── Capability detection ─────────────────────────────────────────────────────

  /**
   * Verifica se Ollama è raggiungibile. Non lancia mai eccezioni.
   * True → bottoni AI visibili. False → UI degrada silenziosamente.
   * @returns {Promise<boolean>}
   */
  const disponibile = async () => {
    const controller = new AbortController();
    const tid = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const res = await fetch(`${BASE_URL}/api/tags`, {
        signal: controller.signal,
      });
      clearTimeout(tid);
      return res.ok;
    } catch {
      clearTimeout(tid);
      return false;
    }
  };

  // ── Lista modelli ─────────────────────────────────────────────────────────────

  /**
   * Ritorna i nomi dei modelli installati in Ollama.
   * In caso di errore ritorna array vuoto (mai eccezioni).
   * @returns {Promise<string[]>}
   */
  const modelli = async () => {
    try {
      const res  = await fetch(`${BASE_URL}/api/tags`);
      if (!res.ok) return [];
      const data = await res.json();
      return (data.models ?? []).map(m => m.name);
    } catch {
      return [];
    }
  };

  // ── Generazione testo con streaming ──────────────────────────────────────────

  /**
   * Genera testo tramite Ollama con streaming.
   *
   * @param {object}   opts
   * @param {string}   opts.prompt    — il testo da elaborare
   * @param {string}   [opts.system]  — system prompt (contesto ruolo CSE)
   * @param {function} [opts.onToken] — callback(tokenString) per token progressivi
   * @param {AbortSignal} [opts.signal] — per interrompere la generazione
   * @returns {Promise<string>} — testo completo generato
   * @throws {Error} 'Assistente AI non raggiungibile' in caso di errore di rete
   */
  const genera = async ({ prompt, system = '', onToken, signal } = {}) => {
    const modello = IMPOSTAZIONI_SERVICE.dati?.ai?.modello ?? MODELLO_FALLBACK;

    let res;
    try {
      res = await fetch(`${BASE_URL}/api/generate`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model:  modello,
          prompt,
          system,
          stream: true,
        }),
        signal,
      });
    } catch (err) {
      if (err.name === 'AbortError') throw err;
      throw new Error('Assistente AI non raggiungibile. Verifica che Ollama sia in esecuzione.');
    }

    if (!res.ok) {
      // Legge il body per un messaggio leggibile dall'API Ollama
      let errMsg;
      try {
        const errData = await res.json();
        const ollamaErr = errData.error ?? '';
        if (res.status === 404 || /not found|not load/i.test(ollamaErr)) {
          errMsg = 'Modello AI non trovato. Vai in Impostazioni → Assistente AI e seleziona un modello installato (o scaricalo con Ollama).';
        } else {
          errMsg = `Assistente AI: ${ollamaErr || `risposta ${res.status} da Ollama.`}`;
        }
      } catch {
        errMsg = `Assistente AI: risposta ${res.status} da Ollama.`;
      }
      throw new Error(errMsg);
    }

    // ── Lettura streaming con line-buffering ─────────────────────────────────
    // Ollama invia un oggetto JSON per riga. Ogni chunk può contenere più righe
    // o una riga spezzata: il buffer accumula i dati parziali tra i chunk.

    const reader  = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer    = '';
    let testo     = '';
    let done_     = false;

    while (!done_) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      // Elabora tutte le righe complete (terminate da \n)
      const righe = buffer.split('\n');
      buffer = righe.pop();   // l'ultima potrebbe essere incompleta

      for (const riga of righe) {
        if (!riga.trim()) continue;
        try {
          const chunk = JSON.parse(riga);
          if (chunk.response) {
            testo += chunk.response;
            onToken?.(chunk.response);
          }
          if (chunk.done) { done_ = true; break; }
        } catch {
          // Riga malformata: la ignoriamo e continuiamo
        }
      }
    }

    return testo;
  };

  // ── API pubblica ──────────────────────────────────────────────────────────────

  return { disponibile, modelli, genera };

})();
