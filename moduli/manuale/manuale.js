/**
 * manuale.js — Visualizzatore in-app del manuale utente SafeHub.
 *
 * Carica MANUALE-UTENTE.md, lo renderizza con marked v4 (Markdown → HTML)
 * e lo monta nel contenitore principale.
 *
 * Modulo ISOLATO: nessuna dipendenza da cantiere, IDB o filesystem OneDrive.
 * Può essere rimosso senza impatto sul resto (voce sidebar + script tag in index.html).
 *
 * Scelte di design:
 *  - La sezione "DA VERIFICARE" viene troncata prima del parsing: è una nota
 *    interna per il PO, non destinata all'utente finale.
 *  - I segnaposto [SCREENSHOT: …] vengono convertiti in testo corsivo discreto
 *    prima del parsing, così non appaiono come errori nel documento renderizzato.
 *  - Lo slug degli heading usa una funzione deterministica che corrisponde
 *    1:1 agli ancoraggi già scritti nell'INDICE del file .md, garantendo
 *    che i link di navigazione saltino alle sezioni giuste.
 */
'use strict';

// ── Costanti ───────────────────────────────────────────────────────────────────

const _MANUALE_URL = './MANUALE-UTENTE.md';

// Tutto ciò che segue questa intestazione è una checklist interna del PO:
// non va mostrata all'utente finale.
const _SEZIONE_NASCOSTA = '## ⚠️ Elementi DA VERIFICARE';

// ── Slug deterministico ────────────────────────────────────────────────────────

/**
 * Genera l'ID dell'heading in modo identico agli ancoraggi scritti nell'INDICE
 * del manuale (es. "2.1 SafeHub Archivio — collegare…" → "21-safehub-archivio--collegare-…").
 * Regola: minuscolo → strip punteggiatura comune → strip char non-word (em-dash…)
 * → spazi a trattini → trim trattini iniziali/finali.
 * I doppi trattini da "spazio—spazio" non vengono collassati: "#21-…--collegare-…" è intenzionale.
 * @param {string} raw — testo grezzo del heading (senza `#`, senza markup HTML)
 * @returns {string}
 */
function _slugManuale(raw) {
  return raw
    .toLowerCase()
    .replace(/[.,:;!?'"()[\]{}]/g, '')  // punteggiatura base (virgole, punti…)
    .replace(/[^\w\s-]/g, '')            // tutto ciò che non è word, spazio o trattino (em-dash ecc.)
    .replace(/\s+/g, '-')               // spazi → trattini
    .replace(/^-+|-+$/g, '');           // trim trattini iniziali/finali
}

// ── Pre-processing Markdown ────────────────────────────────────────────────────

/**
 * Prepara il testo Markdown prima di passarlo al parser:
 * 1. Tronca la sezione "DA VERIFICARE" (tutto ciò che segue).
 * 2. Trasforma i segnaposto [SCREENSHOT: …] in <em> discreta grigia:
 *    non sembrano errori e non occupano spazio visivo in modo aggressivo.
 * @param {string} md
 * @returns {string}
 */
function _preparaMd(md) {
  const taglio = md.indexOf(_SEZIONE_NASCOSTA);
  if (taglio !== -1) md = md.slice(0, taglio).trimEnd();

  // Sostituzione PRIMA del parsing: marked passerà l'<em> inalterata
  // perché il contenuto MD è di fiducia (file locale, non input utente).
  md = md.replace(
    /\[SCREENSHOT:\s*([^\]]+)\]/g,
    (_, desc) => `<em class="manuale-screenshot">[📷 ${desc.trim()}]</em>`
  );

  return md;
}

// ── Rendering ─────────────────────────────────────────────────────────────────

/**
 * Configura marked v4 con un heading renderer custom e lancia il parsing.
 * Chiamata ogni volta che si monta il modulo (idempotente: marked.use
 * sovrascrive l'opzione precedente).
 * @param {string} md — testo pre-processato
 * @returns {string} — HTML renderizzato
 */
function _renderizzaMd(md) {
  // Custom heading renderer: usa _slugManuale per garantire che gli ID
  // combacino con gli href dell'indice (es. href="#21-safehub-archivio--collegare-…").
  marked.use({
    gfm: true,
    breaks: false,
    renderer: {
      heading(text, level, raw) {
        const id = _slugManuale(raw);
        return `<h${level} id="${id}">${text}</h${level}>\n`;
      },
    },
  });

  return marked.parse(md);
}

// ── Costruzione HTML vista ────────────────────────────────────────────────────

/**
 * Costruisce l'HTML della vista. Il #manuale-indice è un'ancora invisibile
 * che i link "↑ Indice" raggiungono saltando al top del documento.
 * @param {string} htmlCorpo — corpo del manuale già renderizzato
 * @returns {string}
 */
function _costruisciVista(htmlCorpo) {
  return `
    <div id="modulo-attivo" class="manuale-wrapper"
         role="main" aria-label="Manuale utente SafeHub">

      <!-- Barra superiore: titolo + link torna-all'indice sempre visibile -->
      <div class="manuale-topbar" role="navigation" aria-label="Navigazione manuale">
        <span class="manuale-topbar-titolo">📖 Manuale utente</span>
        <a href="#manuale-indice" class="manuale-link-indice">
          ↑ Indice
        </a>
      </div>

      <!-- Corpo scrollabile -->
      <article class="manuale-corpo">
        <!-- Ancora di destinazione del link "↑ Indice": punta all'inizio del documento.
             tabindex="-1" permette al browser di ricevere focus via scroll-to-anchor. -->
        <span id="manuale-indice" tabindex="-1" aria-hidden="true"></span>
        ${htmlCorpo}
      </article>
    </div>
  `;
}

// ── Mount ──────────────────────────────────────────────────────────────────────

async function _montaManuale(contenitore) {
  // Placeholder mentre il fetch è in corso
  contenitore.innerHTML = `
    <div id="modulo-attivo" class="manuale-wrapper">
      <p class="manuale-stato" role="status" aria-live="polite">
        Caricamento manuale…
      </p>
    </div>
  `;

  let md;
  try {
    const res = await fetch(_MANUALE_URL);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    md = await res.text();
  } catch (err) {
    ERRORI.gestisciErrore('manuale/fetch', err);
    contenitore.innerHTML = `
      <div id="modulo-attivo" class="manuale-wrapper">
        <p class="manuale-stato manuale-stato--errore" role="alert">
          Impossibile caricare il manuale. Il file è disponibile quando l'app
          è servita via server locale (avvia.bat / avvia.sh).
        </p>
      </div>
    `;
    return;
  }

  const mdPulito = _preparaMd(md);
  const htmlCorpo = _renderizzaMd(mdPulito);
  contenitore.innerHTML = _costruisciVista(htmlCorpo);

  // Alpine.initTree non è necessario: il modulo non usa direttive x-data.
  // Il focus va al top del contenitore (già gestito da navigaA via a11y.js).
}

// ── Registrazione ──────────────────────────────────────────────────────────────

window.MODULI_REGISTRATI['manuale'] = {
  monta: _montaManuale,
};
