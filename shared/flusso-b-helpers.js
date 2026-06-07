/**
 * flusso-b-helpers.js — Utility condivise tra i moduli del Flusso B.
 *
 * Estratte dai 5 moduli (Verbale, Proposta, Disposizione RL, Verifica POS,
 * Verifica ITP) dopo verifica byte-per-byte dell'output (v0.9.0).
 * Tutte le divergenze tra i moduli erano puramente stilistiche.
 *
 * NON contiene i getter Alpine (statoLabel, salvataggioLabel, etichettaStato):
 * Object.assign/spread li congelerebbe al momento della chiamata perdendo
 * la reattività live su this. Restano in ogni modulo (3 righe, accettabile).
 *
 * Deve essere caricato PRIMA di qualsiasi modulo in index.html.
 */

'use strict';

// ── GRUPPO A — Utility pure (5/5 moduli) ─────────────────────────────────────

/**
 * Ridimensiona un'immagine firma in un canvas fisso (default 210×80px).
 * La firma è scalata proporzionalmente nell'80% del canvas e centrata.
 * Restituisce Promise<data-URL PNG> o null se src è falsy.
 */
function _scalafirma(src, cW = 210, cH = 80) {
  if (!src) return Promise.resolve(null);
  return new Promise(resolve => {
    const img = new Image();
    img.onload = () => {
      const maxW = Math.round(cW * 0.80);
      const maxH = Math.round(cH * 0.80);
      const r    = Math.min(maxW / img.naturalWidth, maxH / img.naturalHeight, 1);
      const w    = Math.max(1, Math.round(img.naturalWidth  * r));
      const h    = Math.max(1, Math.round(img.naturalHeight * r));
      const cv   = document.createElement('canvas');
      cv.width = cW; cv.height = cH;
      cv.getContext('2d').drawImage(img, Math.round((cW - w) / 2), Math.round((cH - h) / 2), w, h);
      resolve(cv.toDataURL('image/png'));
    };
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

/**
 * Ridimensiona un file immagine preservando le proporzioni.
 * Non ingrandisce mai oltre le dimensioni originali.
 * Restituisce sempre JPEG (anche se input è PNG) per contenere il peso.
 * Riduzione tipica: 5 MB smartphone → ~300 KB.
 *
 * Usata dal modulo Foto Cantiere; pattern analogo a _scalafirma.
 *
 * @param {File}   file              - File immagine (JPEG / PNG)
 * @param {number} [maxLato=1920]    - Lato massimo in pixel (width e height)
 * @param {number} [qualita=0.80]    - Qualità JPEG 0–1
 * @returns {Promise<{base64: string, larghezza_px: number, altezza_px: number}>}
 */
function _ridimensionaFoto(file, maxLato = 1920, qualita = 0.80) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Lettura immagine non riuscita'));
    reader.onload = (ev) => {
      const img = new Image();
      img.onerror = () => reject(new Error('Formato immagine non riconosciuto'));
      img.onload = () => {
        const origW = img.naturalWidth;
        const origH = img.naturalHeight;
        // Non superare maxLato in nessuna dimensione; non ingrandire mai
        const r  = Math.min(1, maxLato / Math.max(origW, origH));
        const w  = Math.max(1, Math.round(origW * r));
        const h  = Math.max(1, Math.round(origH * r));
        const cv = document.createElement('canvas');
        cv.width = w; cv.height = h;
        cv.getContext('2d').drawImage(img, 0, 0, w, h);
        resolve({
          base64:       cv.toDataURL('image/jpeg', qualita),
          larghezza_px: w,
          altezza_px:   h,
        });
      };
      img.src = ev.target.result;
    };
    reader.readAsDataURL(file);
  });
}

/** Legge un File come data-URL base64. */
function _leggiBase64(file) {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload  = e => res(e.target.result);
    r.onerror = ()  => rej(new Error('Lettura file non riuscita'));
    r.readAsDataURL(file);
  });
}

/** Scrive un File (binario) in una cartella FSA. */
async function _scriviFile(dirHandle, nome, file) {
  const fh = await dirHandle.getFileHandle(nome, { create: true });
  const w  = await fh.createWritable();
  await w.write(await file.arrayBuffer());
  await w.close();
}

// ── GRUPPO B — Canvas firma (3/5: verbale, proposta, verifica-pos) ────────────

/** Calcola le coordinate (x, y) di un evento pointer/touch relativo al canvas. */
function _ptCanvas(canvas, e) {
  const r   = canvas.getBoundingClientRect();
  const src = e.touches?.[0] ?? e;
  return [src.clientX - r.left, src.clientY - r.top];
}

/**
 * Ritaglia il bounding box del tratto disegnato sul canvas
 * e restituisce un data-URL PNG proporzionale.
 */
function _ritagliaCanvas(canvas) {
  const ctx  = canvas.getContext('2d');
  const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
  let minX = canvas.width, maxX = 0, minY = canvas.height, maxY = 0;
  for (let y = 0; y < canvas.height; y++) {
    for (let x = 0; x < canvas.width; x++) {
      if (data[(y * canvas.width + x) * 4 + 3] > 8) {
        minX = Math.min(minX, x); maxX = Math.max(maxX, x);
        minY = Math.min(minY, y); maxY = Math.max(maxY, y);
      }
    }
  }
  if (maxX < minX) return canvas.toDataURL('image/png');
  const pad = 4;
  const w = maxX - minX + 2 * pad, h = maxY - minY + 2 * pad;
  const tmp = document.createElement('canvas');
  tmp.width = w; tmp.height = h;
  tmp.getContext('2d').drawImage(canvas, minX - pad, minY - pad, w, h, 0, 0, w, h);
  return tmp.toDataURL('image/png');
}

/**
 * Componente Alpine per la firma a canvas.
 * Usato dai moduli con firma CSE (verbale, proposta, verifica-pos).
 * Dispatcha 'firma-acquisita' con { png } oppure 'firma-annullata'.
 * Nota: i moduli con firma RL-only (disposizione, verifica-itp) non lo usano.
 */
function FirmaCanvas() {
  return {
    _ctx: null, _disegnando: false, _haTracce: false,
    init() {
      const cv = this.$refs.canvas;
      cv.width = cv.offsetWidth || 380; cv.height = 100;
      this._ctx = cv.getContext('2d');
      this._ctx.strokeStyle = '#000'; this._ctx.lineWidth = 2;
      this._ctx.lineCap = 'round'; this._ctx.lineJoin = 'round';
    },
    startDraw(e) { e.preventDefault(); this._disegnando = true; const [x,y] = _ptCanvas(this.$refs.canvas,e); this._ctx.beginPath(); this._ctx.moveTo(x,y); },
    draw(e)      { if (!this._disegnando) return; e.preventDefault(); const [x,y] = _ptCanvas(this.$refs.canvas,e); this._ctx.lineTo(x,y); this._ctx.stroke(); this._haTracce = true; },
    endDraw()    { this._disegnando = false; },
    pulisci()    { this._ctx.clearRect(0,0,this.$refs.canvas.width,this.$refs.canvas.height); this._haTracce = false; },
    usa()        { if (!this._haTracce) { NOTIFICHE.attenzione('Firma vuota','Traccia la firma prima.'); return; } this.$dispatch('firma-acquisita', { png: _ritagliaCanvas(this.$refs.canvas) }); },
    annulla()    { this.$dispatch('firma-annullata'); },
  };
}

// ── GRUPPO C — Editor ricco (3/5: verbale, proposta, verifica-pos) ────────────

/**
 * Helper ricorsivo di _serEditor: serializza i nodi DOM in HTML pulito
 * (solo tag del sottoinsieme M6: p, strong, em, br, p[data-align]).
 */
function _serNodo(el) {
  let out = '';
  for (const c of el.childNodes) {
    if (c.nodeType === 3) { out += UTILS.escapeHtml(c.textContent); continue; }
    if (c.nodeType !== 1) continue;
    const t = c.tagName, inner = _serNodo(c);
    if (t === 'BR') { out += '<br>'; continue; }
    if (t === 'B' || t === 'STRONG') { out += `<strong>${inner}</strong>`; continue; }
    if (t === 'I' || t === 'EM')     { out += `<em>${inner}</em>`;         continue; }
    if (t === 'SPAN') {
      let s = inner;
      if ((c.style?.fontWeight ?? '') >= '600' || c.style?.fontWeight === 'bold') s = `<strong>${s}</strong>`;
      if (c.style?.fontStyle === 'italic') s = `<em>${s}</em>`;
      out += s; continue;
    }
    if (t === 'DIV' || t === 'P') {
      const da = c.getAttribute('data-align') || '', sa = c.style?.textAlign || '';
      const a  = da || (sa === 'center' ? 'center' : sa === 'right' ? 'right' : '');
      out += a ? `<p data-align="${a}">${inner || '<br>'}</p>` : `<p>${inner || '<br>'}</p>`;
      continue;
    }
    out += inner;
  }
  return out;
}

/**
 * Serializza il contenuto di un contenteditable in HTML pulito
 * compatibile con M6 (solo tag supportati: p, strong, em, br, data-align).
 */
function _serEditor(el) {
  if (!el) return '';
  return _serNodo(el);
}

/**
 * Converte HTML pulito M6 in HTML visualizzabile nel contenteditable:
 * aggiunge style="text-align:X" in parallelo a data-align per la visualizzazione.
 */
function _editorFromHtml(html) {
  if (!html) return '';
  return html.replace(
    /<p([^>]*?)data-align="([^"]+)"([^>]*)>/g,
    (_, pre, a, post) => `<p${pre}data-align="${a}"${post} style="text-align:${a}">`
  );
}

// ── GRUPPO D — Interlinea testi editor (4/5; non in verifica-itp) ─────────────

/**
 * Aggiunge data-line="15" ai <p> dell'HTML prodotto dall'editor ricco
 * che ne sono privi. I testi dell'editor non hanno l'attributo tipografico
 * di default; questa funzione li porta a interlinea 1,5 coerente con il
 * resto del documento.
 * Lascia invariati i <p> che già hanno data-line (es. data-line="exact280").
 */
function _applicaInterlinea15(html) {
  if (!html) return html;
  return html.replace(/<p(?![^>]*data-line)([^>]*)>/g, '<p data-line="15"$1>');
}
