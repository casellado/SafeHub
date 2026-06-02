/**
 * m6-motore-docx.js — Motore di generazione documenti (HTML + DOCX).
 *
 * API: MOTORE_DOCX.generaDocumento({ tipo, header, corpo_html, formati })
 * formati: { html: boolean, docx: boolean } — PDF rimandato a Flusso A.
 *
 * Stack gratuito: PizZip + docxtemplater core ({@rawXml}) + ZIP post-processing per immagini.
 * Template unico: templates/template.docx (fetch da URL relativo, cachato dal SW).
 *
 * Dipendenze globali: PizZip (window.PizZip), docxtemplater (window.docxtemplater) da vendor/,
 * ERRORI (shared/errori.js).
 */

const MOTORE_DOCX = (() => {
  'use strict';

  // Normalizza il nome globale: la libreria espone window.docxtemplater (lowercase nel bundle v3.44)
  // Il fallback Docxtemplater (maiuscolo) copre eventuali versioni future che correggano il nome.
  const _Docxtemplater = window.docxtemplater || window.Docxtemplater;

  // ── Costanti ─────────────────────────────────────────────────────────────
  const TEMPLATE_PATH  = './templates/template.docx';
  const EMU_PER_INCH   = 914400;
  const EMU_PER_TWIP   = EMU_PER_INCH / 1440;   // 635
  const PX96_TO_EMU    = EMU_PER_INCH / 96;       // 9525

  // Tag supportati dal convertitore (sottoinsieme SafeCant)
  const TAG_SUPPORTATI = new Set([
    'SECTION','ARTICLE','DIV',
    'H2','H3','P','STRONG','EM','BR',
    'TABLE','THEAD','TBODY','TR','TH','TD',
    'IMG',
  ]);
  const TAG_CONTENITORI = new Set(['SECTION','ARTICLE','DIV','BODY']);

  // ── Stato sessione di generazione ─────────────────────────────────────────
  let _imgReg   = [];   // {id, rId, mediaName, b64, ext}
  let _imgSizes = new Map(); // src → {cx, cy} in EMU

  // ── Utilità XML ───────────────────────────────────────────────────────────

  const _esc = (s) =>
    String(s ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');

  const _twipsToEmu = (t) => Math.round(t * EMU_PER_TWIP);

  // ── Dimensioni pagina dal template ZIP ────────────────────────────────────

  const _leggiDimPagina = (zip) => {
    try {
      const xml = zip.file('word/document.xml').asText();
      const szM  = xml.match(/<w:pgSz[^>]+>/)?.[0]  ?? '';
      const maM  = xml.match(/<w:pgMar[^>]+>/)?.[0] ?? '';
      const pgW  = parseInt(szM.match(/w:w="(\d+)"/)?.[1]          ?? '12240');
      const ml   = parseInt(maM.match(/w:left="(\d+)"/)?.[1]       ?? '720');
      const mr   = parseInt(maM.match(/w:right="(\d+)"/)?.[1]      ?? '720');
      return pgW - ml - mr;  // twips
    } catch { return 10800; }
  };

  // ── Dimensioni immagine (async) ───────────────────────────────────────────

  const _getImgEmu = (src, maxWEmu, maxHEmu = 2160000) =>
    new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        const wEmu = Math.round(img.naturalWidth  * PX96_TO_EMU);
        const hEmu = Math.round(img.naturalHeight * PX96_TO_EMU);
        const sw   = wEmu > maxWEmu ? maxWEmu / wEmu : 1;
        const sh   = hEmu > maxHEmu ? maxHEmu / hEmu : 1;
        const sc   = Math.min(sw, sh);
        resolve({ cx: Math.round(wEmu * sc), cy: Math.round(hEmu * sc) });
      };
      img.onerror = () => resolve({ cx: 2160000, cy: 720000 }); // fallback 6×2 cm
      img.src = src;
    });

  const _preloadImgs = async (html, maxWEmu) => {
    const doc  = new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html');
    const srcs = new Set([...doc.querySelectorAll('img')]
      .map(i => i.getAttribute('src') || '').filter(Boolean));
    const pairs = await Promise.all(
      [...srcs].map(async src => [src, await _getImgEmu(src, maxWEmu)])
    );
    return new Map(pairs);
  };

  // ── Generatori OOXML ──────────────────────────────────────────────────────

  const _t = (text) =>
    `<w:t xml:space="preserve">${_esc(text)}</w:t>`;

  const _run = (text, { bold = false, italic = false } = {}) => {
    if (!text && text !== 0) return '';
    const rpr = (bold || italic)
      ? `<w:rPr>${bold ? '<w:b/><w:bCs/>' : ''}${italic ? '<w:i/><w:iCs/>' : ''}</w:rPr>`
      : '';
    return `<w:r>${rpr}${_t(text)}</w:r>`;
  };

  const _para = (content, align = '') => {
    const pPr = align ? `<w:pPr><w:jc w:val="${align}"/></w:pPr>` : '';
    return `<w:p>${pPr}${content || '<w:r><w:t/></w:r>'}</w:p>`;
  };

  const _heading = (text, level) => {
    const sz = level === 2 ? '28' : '24'; // 14pt / 12pt
    return `<w:p><w:r><w:rPr><w:b/><w:bCs/><w:sz w:val="${sz}"/><w:szCs w:val="${sz}"/></w:rPr>${_t(text)}</w:r></w:p>`;
  };

  // OOXML drawing per immagini inline (body e header)
  const _drawing = (rId, cx, cy, id) =>
    `<w:drawing xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">` +
    `<wp:inline xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"` +
    ` distT="0" distB="0" distL="0" distR="0">` +
    `<wp:extent cx="${cx}" cy="${cy}"/>` +
    `<wp:effectExtent l="0" t="0" r="0" b="0"/>` +
    `<wp:docPr id="${id}" name="img${id}"/>` +
    `<wp:cNvGraphicFramePr><a:graphicFrameLocks xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" noChangeAspect="1"/></wp:cNvGraphicFramePr>` +
    `<a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">` +
    `<a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">` +
    `<pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture">` +
    `<pic:nvPicPr><pic:cNvPr id="${id}" name="img${id}"/><pic:cNvPicPr><a:picLocks noChangeAspect="1"/></pic:cNvPicPr></pic:nvPicPr>` +
    `<pic:blipFill><a:blip r:embed="${rId}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill>` +
    `<pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm>` +
    `<a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr>` +
    `</pic:pic></a:graphicData></a:graphic>` +
    `</wp:inline></w:drawing>`;

  // ── Run collector (inline content di un paragrafo) ─────────────────────────

  const _collectRuns = (childNodes) => {
    let runs = '';
    for (const node of childNodes) {
      if (node.nodeType === 3) {  // testo
        if (node.textContent) runs += _run(node.textContent);
      } else if (node.nodeType === 1) {
        const tag = node.tagName;
        if (tag === 'STRONG')    { runs += _run(node.textContent, { bold: true }); }
        else if (tag === 'EM')   { runs += _run(node.textContent, { italic: true }); }
        else if (tag === 'BR')   { runs += `<w:r><w:br/></w:r>`; }
        else if (tag === 'IMG')  { runs += _imgInlineRun(node); }
      }
    }
    return runs;
  };

  const _imgInlineRun = (imgNode) => {
    const src  = imgNode.getAttribute('src') || '';
    if (!src) return '';
    const dims = _imgSizes.get(src) || { cx: 2160000, cy: 720000 };
    const id   = _imgReg.length + 1;
    const ext  = src.startsWith('data:image/png') ? 'png' : 'jpg';
    const b64  = src.split(',')[1] || '';
    const rId  = `rId_m6_${id}`;
    _imgReg.push({ id, rId, mediaName: `m6_body_${id}.${ext}`, b64, ext });
    return `<w:r>${_drawing(rId, dims.cx, dims.cy, id)}</w:r>`;
  };

  // ── Tabella ────────────────────────────────────────────────────────────────
  //
  // Attributi HTML riconosciuti:
  //   <table data-border="none">  → bordi OOXML a none (tabella firme e simili)
  //   <td data-align="center|left|right">  → <w:jc> per allineamento paragrafo cella

  const _tabella = (tableNode, textWidthTwips) => {
    const rows  = [...tableNode.querySelectorAll('tr')];
    if (!rows.length) return '';
    const nCols = rows.reduce((m, r) => Math.max(m, r.querySelectorAll('th,td').length), 0);
    if (!nCols) return '';
    const colW    = Math.floor(textWidthTwips / nCols);
    const noBorder = tableNode.getAttribute('data-border') === 'none';

    const grid = `<w:tblGrid>${Array(nCols).fill(`<w:gridCol w:w="${colW}"/>`).join('')}</w:tblGrid>`;

    // Bordi cella: single (default) o none
    const _bv = noBorder ? 'none' : 'single';
    const _bc = noBorder ? 'auto' : '000000';
    const _bs = noBorder ? '0'    : '4';
    const cellBorders =
      `<w:tcBorders>` +
      `<w:top    w:val="${_bv}" w:sz="${_bs}" w:color="${_bc}"/>` +
      `<w:start  w:val="${_bv}" w:sz="${_bs}" w:color="${_bc}"/>` +
      `<w:bottom w:val="${_bv}" w:sz="${_bs}" w:color="${_bc}"/>` +
      `<w:end    w:val="${_bv}" w:sz="${_bs}" w:color="${_bc}"/>` +
      `</w:tcBorders>`;

    // Bordi tabella: solo per no-border (sovrascrive stile TableGrid)
    const tblBorders = noBorder
      ? `<w:tblBorders>` +
        `<w:top     w:val="none" w:sz="0" w:color="auto"/>` +
        `<w:start   w:val="none" w:sz="0" w:color="auto"/>` +
        `<w:bottom  w:val="none" w:sz="0" w:color="auto"/>` +
        `<w:end     w:val="none" w:sz="0" w:color="auto"/>` +
        `<w:insideH w:val="none" w:sz="0" w:color="auto"/>` +
        `<w:insideV w:val="none" w:sz="0" w:color="auto"/>` +
        `</w:tblBorders>`
      : '';

    const rowsXml = rows.map(row => {
      const cells    = [...row.querySelectorAll('th,td')];
      const cellsXml = cells.map(cell => {
        const isH       = cell.tagName === 'TH';
        const cellAlign = cell.getAttribute('data-align') || '';
        const runs = isH
          ? `<w:r><w:rPr><w:b/><w:bCs/></w:rPr>${_t(cell.textContent)}</w:r>`
          : (_collectRuns(cell.childNodes) || `<w:r>${_t(cell.textContent)}</w:r>`);
        const pPr = cellAlign ? `<w:pPr><w:jc w:val="${cellAlign}"/></w:pPr>` : '';
        return `<w:tc><w:tcPr><w:tcW w:w="${colW}" w:type="dxa"/>${cellBorders}</w:tcPr>` +
               `<w:p>${pPr}${runs}</w:p></w:tc>`;
      }).join('');
      return `<w:tr>${cellsXml}</w:tr>`;
    }).join('');

    return `<w:tbl><w:tblPr><w:tblW w:w="0" w:type="auto"/>${tblBorders}</w:tblPr>${grid}${rowsXml}</w:tbl>`;
  };

  // ── DOM Walker (HTML → OOXML) ─────────────────────────────────────────────

  const _walk = (nodes, textWidthTwips) => {
    let ooxml = '';
    for (const node of nodes) {
      if (node.nodeType === 3) {
        const t = (node.textContent || '').trim();
        if (t) ooxml += _para(_run(t));
        continue;
      }
      if (node.nodeType !== 1) continue;
      const tag = node.tagName;

      if (TAG_CONTENITORI.has(tag)) {
        ooxml += _walk(node.childNodes, textWidthTwips);
      } else if (tag === 'H2') {
        ooxml += _heading(node.textContent, 2);
      } else if (tag === 'H3') {
        ooxml += _heading(node.textContent, 3);
      } else if (tag === 'P') {
        const align = node.dataset?.align || node.getAttribute('data-align') || '';
        const runs  = _collectRuns(node.childNodes);
        ooxml += _para(runs, align);
      } else if (tag === 'TABLE') {
        ooxml += _tabella(node, textWidthTwips);
      } else if (tag === 'BR') {
        ooxml += _para(`<w:r><w:br/></w:r>`);
      } else if (tag === 'IMG') {
        // IMG a livello di blocco
        const src  = node.getAttribute('src') || '';
        const dims = _imgSizes.get(src) || { cx: 2160000, cy: 720000 };
        const id   = _imgReg.length + 1;
        const ext  = src.startsWith('data:image/png') ? 'png' : 'jpg';
        const b64  = src.split(',')[1] || '';
        const rId  = `rId_m6_${id}`;
        _imgReg.push({ id, rId, mediaName: `m6_body_${id}.${ext}`, b64, ext });
        ooxml += _para(`<w:r>${_drawing(rId, dims.cx, dims.cy, id)}</w:r>`);
      } else {
        // Tag non supportato: scende nei figli senza emettere wrapper
        ooxml += _walk(node.childNodes, textWidthTwips);
      }
    }
    return ooxml || '<w:p/>';  // almeno un paragrafo per non avere XML vuoto
  };

  // ── Validatore (non-bloccante, warning in console) ────────────────────────

  const _valida = (html) => {
    const doc  = new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html');
    const visti = new Set();
    const walk = (n) => {
      if (n.nodeType === 1 && !TAG_SUPPORTATI.has(n.tagName) && !TAG_CONTENITORI.has(n.tagName)) {
        if (!visti.has(n.tagName)) {
          visti.add(n.tagName);
          console.warn(`[M6] Tag <${n.tagName.toLowerCase()}> non nel sottoinsieme supportato — contenuto ignorato nel DOCX`);
        }
      }
      n.childNodes.forEach(walk);
    };
    doc.body.childNodes.forEach(walk);
  };

  // ── Iniezione logo negli header (pre-docxtemplater) ───────────────────────

  const _iniettaLogo = async (zip, logoSrc, textWidthTwips) => {
    if (!logoSrc) return;
    // Il logo occupa al max il 25% della larghezza testo, altezza max 2.2cm
    const maxWEmu = _twipsToEmu(Math.floor(textWidthTwips * 0.25));
    const dims    = await _getImgEmu(logoSrc, maxWEmu, 800000);
    const ext     = logoSrc.startsWith('data:image/png') ? 'png' : 'jpg';
    const b64     = logoSrc.split(',')[1] || '';
    const mediaName = `m6_logo.${ext}`;
    const rId       = 'rId_m6_logo';
    const rel       = `<Relationship Id="${rId}" ` +
      `Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" ` +
      `Target="media/${mediaName}"/>`;
    const drawXml   = `<w:r>${_drawing(rId, dims.cx, dims.cy, 9001)}</w:r>`;

    zip.file(`word/media/${mediaName}`, b64, { base64: true });

    for (const n of [1, 2, 3]) {
      const hPath = `word/header${n}.xml`;
      const rPath = `word/_rels/header${n}.xml.rels`;
      const hXml  = zip.file(hPath)?.asText();
      if (!hXml || !hXml.includes('%logo_aziendale')) continue;

      // Aggiungi relazione
      let rXml = zip.file(rPath)?.asText()
        ?? `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"></Relationships>`;
      if (!rXml.includes(rId)) {
        rXml = rXml.replace('</Relationships>', rel + '</Relationships>');
        zip.file(rPath, rXml);
      }

      // Sostituisce il run con {%logo_aziendale} con il drawing
      // Il tag è in un singolo <w:t> (verificato sul template reale)
      const cleaned = hXml.replace(
        /<w:r>(?:<w:rPr>[\s\S]*?<\/w:rPr>)?<w:t[^>]*>\{%logo_aziendale\}<\/w:t><\/w:r>/,
        drawXml
      );
      zip.file(hPath, cleaned);
    }
  };

  // ── Iniezione immagini body (post-docxtemplater) ──────────────────────────

  const _iniettaImmaginiBody = (zip, registry) => {
    if (!registry.length) return;
    const relsPath = 'word/_rels/document.xml.rels';
    let relsXml = zip.file(relsPath)?.asText() ?? '';
    for (const img of registry) {
      zip.file(`word/media/${img.mediaName}`, img.b64, { base64: true });
      // Prefisso rId_m6_ evita conflitti con rId* già presenti nel template
      const rel = `<Relationship Id="${img.rId}" ` +
        `Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" ` +
        `Target="media/${img.mediaName}"/>`;
      relsXml = relsXml.replace('</Relationships>', rel + '</Relationships>');
    }
    zip.file(relsPath, relsXml);
  };

  // ── HTML preview (anteprima a schermo, nessun template richiesto) ─────────

  const _htmlPreview = (header, corpo_html) =>
    `<!DOCTYPE html><html lang="it"><head><meta charset="UTF-8">` +
    `<style>` +
    `body{font-family:Arial,sans-serif;max-width:820px;margin:32px auto;padding:24px;font-size:11pt;line-height:1.4;color:#111}` +
    `.hdr{display:grid;grid-template-columns:1fr 2fr 1fr;gap:8px;border:1px solid #ccc;padding:8px;margin-bottom:20px}` +
    `.hdr-logo img{max-height:60px;max-width:100%;object-fit:contain}` +
    `.hdr-titolo{text-align:center;font-weight:bold;font-size:13pt;display:flex;align-items:center;justify-content:center}` +
    `.hdr-meta{text-align:right;font-size:9pt;color:#555;display:flex;flex-direction:column;justify-content:center;gap:4px}` +
    `h2{font-size:14pt;font-weight:bold;margin:16px 0 8px}` +
    `h3{font-size:12pt;font-weight:bold;margin:12px 0 6px}` +
    `p{margin:4px 0}` +
    `table{border-collapse:collapse;width:100%;margin:8px 0}` +
    `th,td{border:1px solid #999;padding:4px 8px;font-size:10pt}` +
    `table[data-border="none"],table[data-border="none"] td{border:none;padding:6px 4px}` +
    `th{background:#f0f0f0;font-weight:bold}` +
    `img{max-height:2cm;width:auto;display:inline-block;vertical-align:middle}` +
    `</style></head><body>` +
    `<div class="hdr">` +
    `<div class="hdr-logo">${header.logo_aziendale ? `<img src="${header.logo_aziendale}" alt="logo">` : ''}</div>` +
    `<div class="hdr-titolo">${_esc(header.modulo_titolo ?? '')}</div>` +
    `<div class="hdr-meta"><span>${_esc(header.modulo_codice ?? '')}</span><span>${_esc(header.modulo_versione ?? '')}</span></div>` +
    `</div>` +
    corpo_html +
    `</body></html>`;

  // ── API principale ────────────────────────────────────────────────────────

  /**
   * Genera HTML preview e/o DOCX da un corpo HTML.
   *
   * @param {{
   *   tipo: string,
   *   header: { modulo_codice, modulo_versione, modulo_titolo, logo_aziendale },
   *   corpo_html: string,
   *   formati: { html?: boolean, docx?: boolean }
   * }} opzioni
   * @returns {Promise<{ htmlString?: string, docxBlob?: Blob }>}
   */
  const generaDocumento = async ({ tipo, header, corpo_html, formati = {} }) => {
    const out = {};

    // ── HTML preview (sincrono, nessun template) ──────────────────────────
    if (formati.html) {
      out.htmlString = _htmlPreview(header, corpo_html);
    }

    // ── DOCX ──────────────────────────────────────────────────────────────
    if (formati.docx) {
      // Reset registro immagini per questa sessione
      _imgReg   = [];
      _imgSizes = new Map();

      try {
        // 1. Fetch template
        const resp = await fetch(TEMPLATE_PATH);
        if (!resp.ok) throw new Error(`Template non trovato: ${TEMPLATE_PATH} (${resp.status})`);
        const buf = await resp.arrayBuffer();

        // 2. ZIP + larghezza testo
        const zip            = new PizZip(buf);
        const textWidthTwips = _leggiDimPagina(zip);
        const maxWEmu        = _twipsToEmu(textWidthTwips);

        // 3. Validazione HTML (non-bloccante)
        _valida(corpo_html);

        // 4. Pre-carica dimensioni immagini
        _imgSizes = await _preloadImgs(corpo_html, maxWEmu);

        // 5. HTML → OOXML
        const domDoc  = new DOMParser().parseFromString(`<body>${corpo_html}</body>`, 'text/html');
        const ooxmlBody = _walk(domDoc.body.childNodes, textWidthTwips);

        // 6. Inietta logo negli header (prima di docxtemplater)
        await _iniettaLogo(zip, header.logo_aziendale, textWidthTwips);

        // 7. Esegui docxtemplater: header testo + {@rawXml} per il corpo
        const docx = new _Docxtemplater(zip, {
          paragraphLoop: false,
          linebreaks:    false,
        });
        docx.render({
          modulo_titolo:   header.modulo_titolo   ?? '',
          modulo_codice:   header.modulo_codice   ?? '',
          modulo_versione: header.modulo_versione ?? '',
          rawXml:          ooxmlBody,
        });
        const outZip = docx.getZip();

        // 8. Inietta immagini del corpo nel ZIP (post-docxtemplater)
        _iniettaImmaginiBody(outZip, _imgReg);

        // 9. Genera Blob
        out.docxBlob = outZip.generate({
          type:        'blob',
          mimeType:    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          compression: 'DEFLATE',
        });

      } catch (err) {
        if (typeof ERRORI !== 'undefined') {
          ERRORI.gestisciErrore('m6/genera-docx', err);
        } else {
          console.error('[M6] Errore generazione DOCX:', err);
        }
        throw err;
      }
    }

    return out;
  };

  return { generaDocumento };
})();
