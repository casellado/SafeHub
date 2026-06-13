/**
 * verbale-sopralluogo.js — Verbale di Sopralluogo (Flusso A)
 * Documento ricevuto da SafeCant (JSON), rifinito/controfirmato dal CSE, archiviato come PDF.
 *
 * Ciclo senza protocollo: RICEVUTO → IN_LAVORAZIONE → CONTROFIRMATO → ARCHIVIATO
 * Storage: 01_Verbali-Sopralluogo/Inbox/<id>.json  +  Archivio/<data>_<id>.json + .docx + .pdf
 *
 * Differenze chiave rispetto al Flusso B:
 *   • Non si CREA: si IMPORTA il JSON SafeCant (tipo_file = 'verbale_sopralluogo_interscambio')
 *   • Editor usa innerHTML diretto (NON _serEditor: corpo contiene tabelle/img firme)
 *   • corpo_html arriva da SafeCant, si normalizza una volta, si usa tal quale
 *   • Output: DOCX via M6 (stesso pattern Flusso B); il PDF lo genera il PO da Word e lo ricarica
 *   • Nessun numero progressivo: nomi file usano data_sopralluogo + id_locale_verbale
 *
 * Riuso da flusso-b-helpers.js: _scalafirma, _leggiBase64, _scriviFile, FirmaCanvas,
 *   _ptCanvas, _ritagliaCanvas, _editorFromHtml (solo per caricare — NON _serEditor)
 */

'use strict';

// ── Costanti ──────────────────────────────────────────────────────────────────

const NOTE_NORMATIVE_VS = [
  {
    titolo: 'Fondamento e finalità (art. 92 c.1 lett. a; art. 100)',
    testo:  'Il sopralluogo è lo strumento con cui il CSE verifica in cantiere l\'applicazione del PSC ' +
            'e delle procedure di lavoro da parte di imprese e lavoratori autonomi. La periodicità non ' +
            'è fissata dalla legge: la stabilisce il CSE in base alle caratteristiche dell\'opera, ' +
            'comunque nelle fasi critiche.',
  },
  {
    titolo: 'Cosa annotare (art. 92 c.1 lett. e)',
    testo:  'Non basta annotare il rilievo: il verbale deve indicare l\'inadempienza riscontrata, ' +
            'l\'azione per rimediare, chi deve eseguirla ed entro quando. In caso di inosservanze il ' +
            'CSE contesta per iscritto e segnala al Committente/RL (sequenza: inosservanza → ordine ' +
            '→ segnalazione).',
  },
  {
    titolo: 'Valore e conservazione',
    testo:  'Il verbale, sottoscritto dai presenti, può costituire — in funzione dei contenuti — ' +
            'aggiornamento del PSC. L\'esito va documentato per iscritto, trasmesso alle imprese ' +
            'interessate e tenuto disponibile in cantiere; al sopralluogo successivo il CSE verifica ' +
            'l\'avvenuto adeguamento.',
  },
];

// ── Helper intestazione M6 ────────────────────────────────────────────────────

// FIX 3: nessun codice Mod.RE.xx — il verbale non è un modulo ANAS istituzionale.
// modulo_versione = data del sopralluogo (identificativa, non un numero di revisione).
function _intestazioneVS(verbale) {
  const dataSopr = verbale?.metadati?.data_sopralluogo ?? '';
  return {
    modulo_titolo:   'Verbale di Sopralluogo',
    modulo_codice:   '',
    modulo_versione: dataSopr ? (UTILS.formatData?.(dataSopr) ?? dataSopr) : '',
    logo_aziendale:  IMPOSTAZIONI_SERVICE.logo().png_base64 ?? null,
  };
}

// ── Normalizzazione HTML SafeCant → sottoinsieme M6 ───────────────────────────
// section/article sono già TAG_CONTENITORI in M6 (pass-through) — non servono conversioni.
// Vengono normalizzati solo gli alias di stile che _collectRuns di M6 non gestisce.
function _normalizzaHtmlSafeCant(html) {
  if (!html) return '';
  return html
    .replace(/<b(\s[^>]*)?>([^<]*)<\/b>/gi, '<strong$1>$2</strong>')
    .replace(/<i(\s[^>]*)?>([^<]*)<\/i>/gi,  '<em$1>$2</em>')
    .replace(/<li([^>]*)>/gi,  '<p$1>')
    .replace(/<\/li>/gi,       '</p>')
    .replace(/<ul[^>]*>/gi,    '')
    .replace(/<\/ul>/gi,       '')
    .replace(/<ol[^>]*>/gi,    '')
    .replace(/<\/ol>/gi,       '');
}

// ── Ridimensionamento firme nel corpo prima di passare a M6 ──────────────────
// M6 dimensiona ogni <img> dalle dimensioni native del PNG (naturalWidth/Height) e
// usa come maxW la larghezza dell'intera pagina — non conosce la larghezza colonna.
// Firme iPad retina (~700×240px) risulterebbero ~9–10cm nel DOCX: sforano sempre.
// Normalizziamo qui, prima di M6, separando i due contesti:
//   • fuori tabella (firma redattore, CSE fuori cella) → 210×80px
//   • dentro cella <td>/<th> (firme presenti, colonna ~4,7cm su Letter) → 180×70px
async function _scalafirmeCorpo(html) {
  if (!html) return html;
  const doc  = new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html');

  // Firme fuori tabella: redattore e simili — 210×80px (invariato).
  const imgsFuori = [...doc.querySelectorAll('img')].filter(img => !img.closest('td, th'));
  await Promise.all(imgsFuori.map(async img => {
    const src = img.getAttribute('src') || '';
    if (!src.startsWith('data:image/')) return;
    const scaled = await _scalafirma(src, 210, 80);
    if (scaled) img.setAttribute('src', scaled);
  }));

  // Firme dei presenti dentro celle: 180×70px → resa DOCX ~1,9cm, sta nella colonna.
  const imgsInCella = [...doc.querySelectorAll('td img, th img')];
  await Promise.all(imgsInCella.map(async img => {
    const src = img.getAttribute('src') || '';
    if (!src.startsWith('data:image/')) return;
    const scaled = await _scalafirma(src, 180, 70);
    if (scaled) img.setAttribute('src', scaled);
  }));

  return doc.body.innerHTML;
}

// ── Blocco controfirma CSE (appeso IN CODA al corpo, fuori da contenitori) ────
// FIX 2: tutto in una SINGOLA <p> con <br> inline → un solo <w:p> OOXML.
// Word non può mai spezzare un paragrafo a metà: titolo+nome+firma restano uniti.
async function _generaBloccoCse(firma) {
  if (!firma) return '';
  const cseImg = await _scalafirma(firma.firma_png_base64 ?? null);
  const esc    = (s) => UTILS.escapeHtml(s ?? '');
  const nome   = esc(firma.nome_cognome ?? '');
  const pr     = 'data-indent="firma" data-align="center" style="padding-left:52%;text-align:center"';
  let inner    = `Il Coordinatore per la Sicurezza in fase di Esecuzione<br><strong>${nome}</strong>`;
  if (cseImg)  inner += `<br><img src="${cseImg}" alt="controfirma CSE">`;
  return `<p ${pr}>${inner}</p>`;
}

// ── VerbaleSOPRALLUOGO Alpine component ──────────────────────────────────────

function VerbaleSOPRALLUOGO() {
  return {
    inbox: [], archivio: [], vistaLista: 'inbox',
    corrente: null, scheda: 'contenuto',
    caricamento: false, generando: false,
    firmaModal: null, noteAperte: false,
    get noteVS() { return NOTE_NORMATIVE_VS; },
    _autosaveTimer: null, _statoSalvataggio: 'salvato',
    _docxBlob: null,
    _editorEl: null,

    get salvataggioLabel() {
      return { salvato:'✓ Salvato', modificato:'● Non salvato', salvando:'⏳ Salvataggio…',
               errore:'⚠ Errore salvataggio', non_salvato:'' }[this._statoSalvataggio] ?? '';
    },

    etichettaStato(stato) {
      return {
        RICEVUTO:        'bg-yellow-100 text-yellow-800',
        IN_LAVORAZIONE:  'bg-blue-100   text-blue-800',
        CONTROFIRMATO:   'bg-violet-100 text-violet-800',
        ARCHIVIATO:      'bg-green-100  text-green-800',
      }[stato] ?? 'bg-slate-100 text-slate-600';
    },

    statoLabel(stato) {
      return { RICEVUTO:'Ricevuto', IN_LAVORAZIONE:'In lavorazione',
               CONTROFIRMATO:'Controfirmato', ARCHIVIATO:'Archiviato' }[stato] ?? stato;
    },

    // ── Lifecycle ──────────────────────────────────────────────────────────

    async init() {
      await this._caricaInbox();
      document.addEventListener('cantiere-cambiato', () => {
        this.corrente  = null;
        this.inbox     = [];
        this.archivio  = [];
        this.vistaLista = 'inbox';
        this._caricaInbox();
      });
    },

    // ── Cartelle di lavoro ─────────────────────────────────────────────────

    async _inboxDir(crea = false) {
      const cantId  = Alpine.store('cantiere').id;
      const cantDir = await FILESYSTEM.getHandleAttivo().getDirectoryHandle(cantId);
      return FILESYSTEM.navigaPercorso(cantDir, ['01_Verbali-Sopralluogo', 'Inbox'], crea);
    },

    async _archivioDir(crea = false) {
      const cantId  = Alpine.store('cantiere').id;
      const cantDir = await FILESYSTEM.getHandleAttivo().getDirectoryHandle(cantId);
      return FILESYSTEM.navigaPercorso(cantDir, ['01_Verbali-Sopralluogo', 'Archivio'], crea);
    },

    // ── Inbox ──────────────────────────────────────────────────────────────

    async _caricaInbox() {
      const cantId = Alpine.store('cantiere').id;
      if (!cantId) { this.inbox = []; return; }
      this.caricamento = true;
      try {
        let inboxDir;
        try {
          inboxDir = await this._inboxDir(false);
        } catch (e) {
          if (e.name === 'NotFoundError') { this.inbox = []; return; }
          throw e;
        }
        const voci = [];
        for await (const [nome] of inboxDir.entries()) {
          if (!nome.endsWith('.json')) continue;
          try {
            const d = await FILESYSTEM.leggiJson(inboxDir, nome);
            if (!d._cestino) voci.push(d);
          } catch { /* json corrotto: salta */ }
        }
        voci.sort((a, b) =>
          (b.metadati?.data_sopralluogo ?? '').localeCompare(a.metadati?.data_sopralluogo ?? '') ||
          (b.importato_il ?? '').localeCompare(a.importato_il ?? '')
        );
        this.inbox = voci;
      } catch (err) {
        ERRORI.gestisciErrore('verbale-sopralluogo/carica-inbox', err);
      } finally { this.caricamento = false; }
    },

    async _caricaArchivio() {
      const cantId = Alpine.store('cantiere').id;
      if (!cantId) { this.archivio = []; return; }
      this.caricamento = true;
      try {
        let archDir;
        try {
          archDir = await this._archivioDir(false);
        } catch (e) {
          if (e.name === 'NotFoundError') { this.archivio = []; return; }
          throw e;
        }
        const voci = [];
        for await (const [nome] of archDir.entries()) {
          if (!nome.endsWith('.json')) continue;
          try {
            const d = await FILESYSTEM.leggiJson(archDir, nome);
            if (!d._cestino) voci.push(d);
          } catch { /* skip */ }
        }
        voci.sort((a, b) =>
          (b.metadati?.data_sopralluogo ?? '').localeCompare(a.metadati?.data_sopralluogo ?? '')
        );
        this.archivio = voci;
      } catch (err) {
        ERRORI.gestisciErrore('verbale-sopralluogo/carica-archivio', err);
      } finally { this.caricamento = false; }
    },

    async cambiaVista(v) {
      this.vistaLista = v;
      if (v === 'archivio' && this.archivio.length === 0) await this._caricaArchivio();
    },

    // ── Import JSON SafeCant ───────────────────────────────────────────────

    async onImportFile(e) {
      const file = e.target.files?.[0];
      e.target.value = '';
      if (!file) return;
      await this._importaVerbale(file);
    },

    async onImportDrop(e) {
      e.preventDefault();
      const file = [...(e.dataTransfer?.files ?? [])].find(f => f.name.endsWith('.json'));
      if (!file) {
        NOTIFICHE.attenzione('Formato non supportato', 'Trascina un file .json di SafeCant.');
        return;
      }
      await this._importaVerbale(file);
    },

    async _importaVerbale(file) {
      let parsed;
      try {
        const testo = await file.text();
        parsed = JSON.parse(testo);
      } catch {
        NOTIFICHE.errore('File non valido', 'Il file non è un JSON leggibile.');
        return;
      }

      // Verifica tipo_file
      if (parsed.tipo_file !== 'verbale_sopralluogo_interscambio') {
        const tipo = parsed.tipo_file ?? 'sconosciuto';
        NOTIFICHE.errore(
          'File non riconosciuto',
          `Tipo: "${tipo}". Importa solo verbali SafeCant (verbale_sopralluogo_interscambio).`
        );
        return;
      }

      // Verifica cantiere_id (avviso non bloccante — cantiere_id vuoto è caso noto SafeCant)
      const cantId = Alpine.store('cantiere').id;
      const vcId   = parsed.metadati?.cantiere_id ?? '';
      if (vcId && vcId !== cantId) {
        const ok = confirm(
          `Il verbale appartiene al cantiere "${vcId}".\n` +
          `Stai lavorando sul cantiere "${cantId}".\n\nImportare comunque?`
        );
        if (!ok) return;
      } else if (!vcId) {
        NOTIFICHE.attenzione(
          'Cantiere non specificato',
          'Il verbale non ha un cantiere_id. Verifica prima di archiviare.'
        );
      }

      // Verifica duplicato (stesso id_locale_verbale già in inbox)
      const idLocale = parsed.id_locale_verbale ?? UTILS.uuid();
      if (this.inbox.some(v => v.id_locale_verbale === idLocale)) {
        NOTIFICHE.attenzione('Già importato', 'Questo verbale è già presente nell\'Inbox.');
        return;
      }

      // Normalizzazione HTML (una sola volta all'import)
      const corpoPulito = _normalizzaHtmlSafeCant(parsed.corpo_html ?? '');

      // Costruisce il record di lavoro
      const record = {
        ...parsed,
        stato:            'RICEVUTO',
        importato_il:     new Date().toISOString(),
        cantiere_id:      cantId,
        corpo_normalizzato: corpoPulito,
        // firma_cse viene aggiunta dal PO nello stadio di controfirma
        firma_cse: {
          qualifica:        IMPOSTAZIONI_SERVICE.cse().qualifica    ?? 'Coordinatore Sicurezza in fase di Esecuzione',
          nome_cognome:     IMPOSTAZIONI_SERVICE.cse().nome_cognome ?? '',
          firma_png_base64: IMPOSTAZIONI_SERVICE.firma().firma_png_base64 ?? null,
          tipo_firma:       IMPOSTAZIONI_SERVICE.firma().firma_png_base64 ? 'permanente' : null,
          timestamp_firma:  IMPOSTAZIONI_SERVICE.firma().acquisita_il     ?? null,
        },
        file_archivio: { json: null, docx: null, pdf: null },
      };

      try {
        const dir = await this._inboxDir(true);
        await FILESYSTEM.scriviJson(dir, `${idLocale}.json`, record);
        this.inbox.unshift(record);
        NOTIFICHE.successo('Verbale importato', `${parsed.metadati?.data_sopralluogo ?? ''} — ${parsed.metadati?.oggetto ?? ''}`.trim() || 'Verbale aggiunto all\'inbox.');
      } catch (err) {
        ERRORI.gestisciErrore('verbale-sopralluogo/importa', err);
      }
    },

    // ── Apri verbale in lavorazione ────────────────────────────────────────

    async apriVerbale(idLocale) {
      try {
        const dir    = await this._inboxDir();
        const record = await FILESYSTEM.leggiJson(dir, `${idLocale}.json`);

        // Transizione automatica RICEVUTO → IN_LAVORAZIONE all'apertura
        if (record.stato === 'RICEVUTO') {
          record.stato = 'IN_LAVORAZIONE';
          await FILESYSTEM.scriviJson(dir, `${idLocale}.json`, record);
          const idx = this.inbox.findIndex(v => v.id_locale_verbale === idLocale);
          if (idx >= 0) this.inbox[idx].stato = 'IN_LAVORAZIONE';
        }

        this.corrente = record;
        this.scheda   = 'contenuto';
        this._statoSalvataggio = 'salvato';
        // Carica il corpo nell'editor al prossimo tick DOM
        this.$nextTick(() => this._caricaEditor());
      } catch (err) {
        ERRORI.gestisciErrore('verbale-sopralluogo/apri', err);
      }
    },

    chiudiEditor() {
      clearTimeout(this._autosaveTimer);
      this._editorEl = null;
      this.corrente  = null;
    },

    // ── Editor corpo_html (innerHTML diretto — NON _serEditor) ────────────
    // Il corpo_html contiene tabelle, img firme base64: _serEditor perderebbe tutto.
    // Il contenteditable permette rifinitura testuale senza toccare la struttura.

    _caricaEditor() {
      const el = document.getElementById('vs-editor-corpo');
      if (!el || !this.corrente) return;
      this._editorEl = el;
      // Carica il corpo normalizzato; se già editato usa corpo_editato
      el.innerHTML = this.corrente.corpo_editato ?? this.corrente.corpo_normalizzato ?? '';
    },

    _salvaEditor() {
      const el = this._editorEl ?? document.getElementById('vs-editor-corpo');
      if (!el || !this.corrente) return;
      // innerHTML diretto: preserva tabelle, img firme, section/article
      this.corrente.corpo_editato = el.innerHTML;
    },

    edBoldVS()      { document.execCommand('bold',         false); this._onEditorChange(); },
    edItalicVS()    { document.execCommand('italic',       false); this._onEditorChange(); },
    edAllineaVS(d)  {
      const cmds = { l:'justifyLeft', c:'justifyCenter', r:'justifyRight' };
      document.execCommand(cmds[d] ?? 'justifyLeft', false);
      this._onEditorChange();
    },

    onEditorInputVS() { this._onEditorChange(); },

    onEditorPasteVS(e) {
      e.preventDefault();
      // Solo testo plain: evita HTML sporco da incolla esterno
      document.execCommand('insertText', false, e.clipboardData.getData('text/plain'));
      this._onEditorChange();
    },

    _onEditorChange() {
      this._salvaEditor();
      this._scheduleAutosave();
    },

    // ── Auto-save ─────────────────────────────────────────────────────────

    _scheduleAutosave() {
      this._statoSalvataggio = 'modificato';
      clearTimeout(this._autosaveTimer);
      this._autosaveTimer = setTimeout(() => this.salva(), 8000);
    },

    async salva() {
      if (!this.corrente || this.corrente.stato === 'ARCHIVIATO') return;
      clearTimeout(this._autosaveTimer);
      this._statoSalvataggio = 'salvando';
      try {
        this._salvaEditor();
        const dir = await this._inboxDir(true);
        await FILESYSTEM.scriviJson(dir, `${this.corrente.id_locale_verbale}.json`, this.corrente);
        this._statoSalvataggio = 'salvato';
        const idx = this.inbox.findIndex(v => v.id_locale_verbale === this.corrente.id_locale_verbale);
        if (idx >= 0) this.inbox[idx] = { ...this.corrente };
        else          this.inbox.unshift({ ...this.corrente });
      } catch (err) {
        this._statoSalvataggio = 'errore';
        ERRORI.gestisciErrore('verbale-sopralluogo/salva', err);
      }
    },

    // ── Firma CSE (controfirma) ────────────────────────────────────────────

    apriCanvasFirma() { this.firmaModal = true; },

    onFirmaAcquisita(png) {
      if (!this.corrente) { this.firmaModal = null; return; }
      this.corrente.firma_cse.firma_png_base64 = png;
      this.corrente.firma_cse.tipo_firma      = 'canvas';
      this.corrente.firma_cse.timestamp_firma = new Date().toISOString();
      this.firmaModal = null;
      this._scheduleAutosave();
    },

    async onUploadFirmaCSE(e) {
      const file = e.target.files?.[0];
      if (!file || !this.corrente) return;
      const png = await _leggiBase64(file);
      this.corrente.firma_cse.firma_png_base64 = png;
      this.corrente.firma_cse.tipo_firma      = 'upload';
      this.corrente.firma_cse.timestamp_firma = new Date().toISOString();
      e.target.value = '';
      this._scheduleAutosave();
    },

    rimuoviFirmaCSE() {
      if (!this.corrente) return;
      this.corrente.firma_cse.firma_png_base64 = null;
      this.corrente.firma_cse.tipo_firma      = null;
      this.corrente.firma_cse.timestamp_firma = null;
      this._scheduleAutosave();
    },

    // ── Controfirma: segna come controfirmato ──────────────────────────────

    async controfirma() {
      if (!this.corrente) return;
      if (!this.corrente.firma_cse?.firma_png_base64) {
        const ok = confirm('Firma CSE non inserita. Puoi procedere comunque (firma legale via GoSign). Controfirmare?');
        if (!ok) return;
      }
      this._salvaEditor();
      this.corrente.stato = 'CONTROFIRMATO';
      this.corrente.controfirmato_il = new Date().toISOString();
      await this.salva();
      NOTIFICHE.successo('Controfirmato', 'Il verbale è pronto per la generazione DOCX e l\'archiviazione.');
    },

    // ── Generazione DOCX (via M6, stesso pattern Flusso B) ────────────────
    // TODO M26: questo è il PUNTO D'INNESTO per l'ai-service condiviso (Gemma 2 9B/Ollama + RAG).
    // Quando esisterà shared/ai-service.js, si aggancerà qui (nello stadio "messa a punto del
    // contenuto") come servizio condiviso tra tutti i moduli Operatività, NON come pulsante
    // duplicato. Visione CTO: un ai-service condiviso come flusso-b-helpers.js.

    async generaDocx() {
      if (!this.corrente) return;
      if (this.corrente.stato === 'RICEVUTO' || this.corrente.stato === 'IN_LAVORAZIONE') {
        const ok = confirm('Il verbale non è ancora controfirmato. Generare il DOCX comunque?');
        if (!ok) return;
      }
      this.generando = true;
      try {
        this._salvaEditor();
        const bloccoCse  = await _generaBloccoCse(this.corrente.firma_cse ?? null);
        const corpoBase  = this.corrente.corpo_editato ?? this.corrente.corpo_normalizzato ?? '';
        // FIX 1: scala le firme di blocco (redattore) prima di passare a M6
        const corpoScal  = await _scalafirmeCorpo(corpoBase);
        const corpoDef   = corpoScal + bloccoCse;
        const out = await MOTORE_DOCX.generaDocumento({
          tipo: 'verbale-sopralluogo',
          header: _intestazioneVS(this.corrente),   // FIX 3: passa il verbale per la data
          corpo_html: corpoDef,
          formati: { html: true, docx: true },
        });
        this._docxBlob = out.docxBlob;
        // Anteprima HTML in nuova scheda
        const win = window.open('', '_blank');
        if (win) { win.document.write(out.htmlString); win.document.close(); }
        NOTIFICHE.successo('DOCX generato', 'Usa "Scarica DOCX" per salvarlo, poi stampa come PDF da Word.');
      } catch (err) {
        ERRORI.gestisciErrore('verbale-sopralluogo/genera-docx', err);
      } finally { this.generando = false; }
    },

    async apriAnteprima() {
      if (!this.corrente) return;
      try {
        this._salvaEditor();
        const bloccoCse = await _generaBloccoCse(this.corrente.firma_cse ?? null);
        const corpoBase = this.corrente.corpo_editato ?? this.corrente.corpo_normalizzato ?? '';
        const corpoScal = await _scalafirmeCorpo(corpoBase);
        const corpoDef  = corpoScal + bloccoCse;
        const out = await MOTORE_DOCX.generaDocumento({
          tipo: 'verbale-sopralluogo',
          header: _intestazioneVS(this.corrente),
          corpo_html: corpoDef,
          formati: { html: true },
        });
        const win = window.open('', '_blank');
        if (win) { win.document.write(out.htmlString); win.document.close(); }
      } catch (err) {
        ERRORI.gestisciErrore('verbale-sopralluogo/anteprima', err);
      }
    },

    async scaricaDocx() {
      if (!this.corrente) return;
      this.generando = true;
      try {
        // Rigenera se non in cache
        if (!this._docxBlob) {
          this._salvaEditor();
          const bloccoCse = await _generaBloccoCse(this.corrente.firma_cse ?? null);
          const corpoBase = this.corrente.corpo_editato ?? this.corrente.corpo_normalizzato ?? '';
          const corpoScal = await _scalafirmeCorpo(corpoBase);
          const corpoDef  = corpoScal + bloccoCse;
          const out = await MOTORE_DOCX.generaDocumento({
            tipo: 'verbale-sopralluogo',
            header: _intestazioneVS(this.corrente),
            corpo_html: corpoDef,
            formati: { docx: true },
          });
          this._docxBlob = out.docxBlob;
        }
        const dataStr = this.corrente.metadati?.data_sopralluogo ?? UTILS.oggi();
        const url  = URL.createObjectURL(this._docxBlob);
        const a    = document.createElement('a');
        a.href     = url;
        a.download = `verbale-sopralluogo-${dataStr}.docx`;
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 5000);
      } catch (err) {
        ERRORI.gestisciErrore('verbale-sopralluogo/scarica-docx', err);
      } finally { this.generando = false; }
    },

    // ── Archiviazione: upload PDF + DOCX → Archivio ───────────────────────

    _archFile: { _pdfFile: null, _docxFile: null, archiviando: false },

    onArchivioDropZone(e) {
      e.preventDefault();
      const files = [...(e.dataTransfer?.files ?? [])];
      for (const f of files) {
        if (f.name.endsWith('.pdf'))  this._archFile._pdfFile  = f;
        if (f.name.endsWith('.docx')) this._archFile._docxFile = f;
      }
    },
    onArchPdfFile(e)  { this._archFile._pdfFile  = e.target.files?.[0] ?? null; e.target.value = ''; },
    onArchDocxFile(e) { this._archFile._docxFile = e.target.files?.[0] ?? null; e.target.value = ''; },

    async archivia() {
      if (!this.corrente || !this._archFile._pdfFile) {
        NOTIFICHE.attenzione('PDF richiesto', 'Carica il PDF generato da Word per archiviare.');
        return;
      }
      this._archFile.archiviando = true;
      try {
        this._salvaEditor();
        const dataStr  = this.corrente.metadati?.data_sopralluogo ?? UTILS.oggi();
        const idLocale = this.corrente.id_locale_verbale;
        const base     = `${dataStr}_${idLocale}`;
        const archDir  = await this._archivioDir(true);

        if (this._archFile._pdfFile)
          await _scriviFile(archDir, `${base}.pdf`,  this._archFile._pdfFile);
        if (this._archFile._docxFile)
          await _scriviFile(archDir, `${base}.docx`, this._archFile._docxFile);

        // Aggiorna e salva il JSON finale in Archivio
        this.corrente.stato          = 'ARCHIVIATO';
        this.corrente.archiviato_il  = new Date().toISOString();
        this.corrente.file_archivio  = {
          json:  `${base}.json`,
          docx:  this._archFile._docxFile ? `${base}.docx` : null,
          pdf:   `${base}.pdf`,
        };
        await FILESYSTEM.scriviJson(archDir, `${base}.json`, this.corrente);

        // Segna come cestino nell'Inbox (non cancella il file)
        try {
          const inboxDir = await this._inboxDir();
          const inboxRec = await FILESYSTEM.leggiJson(inboxDir, `${idLocale}.json`);
          await FILESYSTEM.scriviJson(inboxDir, `${idLocale}.json`,
            { ...inboxRec, _cestino: true, _eliminato_il: new Date().toISOString() });
        } catch { /* inbox già rimosso: ok */ }

        this.inbox = this.inbox.filter(v => v.id_locale_verbale !== idLocale);
        this._archFile = { _pdfFile: null, _docxFile: null, archiviando: false };
        this._docxBlob = null;

        NOTIFICHE.successo('Archiviato', `Verbale del ${dataStr} archiviato.`);
        // Switch alla vista Archivio per mostrare il risultato
        this.vistaLista = 'archivio';
        await this._caricaArchivio();
        this.corrente = null;
      } catch (err) {
        ERRORI.gestisciErrore('verbale-sopralluogo/archivia', err);
      } finally { this._archFile.archiviando = false; }
    },

    // ── Cestino (solo verbali in Inbox, non ARCHIVIATI) ───────────────────

    async cestina(idLocale) {
      if (!confirm('Rimuovere il verbale dall\'inbox?')) return;
      try {
        const dir = await this._inboxDir();
        const d   = await FILESYSTEM.leggiJson(dir, `${idLocale}.json`);
        await FILESYSTEM.scriviJson(dir, `${idLocale}.json`,
          { ...d, _cestino: true, _eliminato_il: new Date().toISOString() });
        this.inbox = this.inbox.filter(v => v.id_locale_verbale !== idLocale);
        if (this.corrente?.id_locale_verbale === idLocale) this.corrente = null;
        NOTIFICHE.successo('Rimosso', 'Il verbale è stato rimosso dall\'inbox.');
      } catch (err) { ERRORI.gestisciErrore('verbale-sopralluogo/cestina', err); }
    },

    // ── Apri file Archivio (PDF o DOCX via FSA) ────────────────────────────

    async apriFileArchivio(idLocale, tipo) {
      try {
        const rec      = this.archivio.find(v => v.id_locale_verbale === idLocale);
        const filename = tipo === 'pdf' ? rec?.file_archivio?.pdf : rec?.file_archivio?.docx;
        if (!filename) return;
        const archDir = await this._archivioDir();
        const fh  = await archDir.getFileHandle(filename);
        const url = URL.createObjectURL(await fh.getFile());
        window.open(url, '_blank');
        setTimeout(() => URL.revokeObjectURL(url), 60000);
      } catch (err) { ERRORI.gestisciErrore('verbale-sopralluogo/apri-file-archivio', err); }
    },

    // ── Esporta nc_draft → modulo Non Conformità (M14-c) ─────────────────────

    async esportaNCDraft(nc) {
      if (!NC_SERVICE) {
        NOTIFICHE.attenzione('NC', 'Modulo Non Conformità non disponibile.');
        return;
      }
      const cantId = this.corrente?.metadati?.cantiere_id || Alpine.store('cantiere').id;
      if (!cantId) {
        NOTIFICHE.attenzione('NC', 'Nessun cantiere associato al verbale.');
        return;
      }

      // Conferma: diversa se già esportata (anti-duplicazione non bloccante)
      if (nc.esportata_a_nc) {
        if (!confirm('Questa NC è già stata esportata. Creare una seconda copia nel modulo Non Conformità?')) return;
      } else {
        if (!confirm('Crea una Non Conformità da questa rilevazione?')) return;
      }

      try {
        // Mappa nc_draft → record NC (identità di campi grazie all'allineamento dei 4 livelli)
        const nuovaNC = NC_SERVICE.creaNCVuota(cantId);
        nuovaNC.descrizione          = nc.descrizione ?? '';
        nuovaNC.livello              = nc.livello ?? 'lieve';
        // scadenza_calcolata può essere ISO datetime (gravissima) o date — slice sicuro
        nuovaNC.scadenza_risoluzione = nc.scadenza_calcolata
          ? nc.scadenza_calcolata.slice(0, 10)
          : '';
        nuovaNC.origine              = 'da_verbale_sopralluogo';
        nuovaNC.verbale_origine_id   = this.corrente.id_locale_verbale ?? '';
        nuovaNC.impresa_id           = '';   // nc_draft non porta impresa_id

        await NC_SERVICE.creaNC(nuovaNC);

        // Marca l'nc_draft come esportato nel record verbale (unico campo aggiunto)
        const idx = (this.corrente.nc_drafts ?? []).findIndex(d => d.id_locale === nc.id_locale);
        if (idx >= 0) {
          this.corrente.nc_drafts[idx] = {
            ...this.corrente.nc_drafts[idx],
            esportata_a_nc: true,
            nc_creata_id:   nuovaNC.id,
          };
          this.corrente = { ...this.corrente };
          await this.salva();
        }

        NOTIFICHE.successo('Non Conformità creata', 'La trovi nel modulo Non Conformità.');
      } catch (err) {
        ERRORI.gestisciErrore('verbale-sopralluogo/esporta-nc', err);
      }
    },
  };
}

// ── Template HTML ─────────────────────────────────────────────────────────────

const _TEMPLATE_VS = /* html */`
<div x-data="VerbaleSOPRALLUOGO()" x-init="init()"
     class="p-4 max-w-5xl mx-auto pb-32" role="region"
     aria-label="Verbali di Sopralluogo"
     @firma-acquisita="onFirmaAcquisita($event.detail.png)"
     @firma-annullata="firmaModal = null"
     @dragover.prevent
     @drop="onImportDrop($event)">

  <!-- HEADER MODULO -->
  <div class="flex flex-wrap items-center justify-between gap-3 mb-4">
    <div class="flex items-center gap-3">
      <button x-show="corrente !== null" @click="chiudiEditor()"
              class="text-slate-400 hover:text-slate-700 p-1 rounded transition-colors
                     focus:outline-none focus:ring-2 focus:ring-blue-500"
              aria-label="Torna all'inbox">&#8592;</button>
      <h2 class="text-lg font-semibold text-slate-800">Verbali di Sopralluogo</h2>
    </div>
    <div class="flex items-center gap-2 flex-wrap">
      <button @click="noteAperte = !noteAperte"
              :aria-expanded="String(noteAperte)"
              class="flex items-center gap-1 text-xs text-sky-700 bg-sky-50 border border-sky-200
                     px-2.5 py-1 rounded-full hover:bg-sky-100 transition-colors
                     focus:outline-none focus:ring-2 focus:ring-sky-400">
        &#x2139; Note normative
      </button>
      <template x-if="corrente !== null">
        <span class="text-xs px-2 py-0.5 rounded-full font-medium"
              :class="etichettaStato(corrente.stato)"
              x-text="statoLabel(corrente.stato)"></span>
      </template>
      <template x-if="corrente !== null">
        <span class="text-xs text-slate-400" x-text="salvataggioLabel"></span>
      </template>
    </div>
  </div>

  <!-- NOTE NORMATIVE -->
  <div x-show="noteAperte" x-transition class="nota-normativa-panel mb-4" role="note">
    <p class="text-xs text-sky-500 mb-2 italic">Promemoria per il CSE — non compare nel documento.</p>
    <template x-for="nota in noteVS" :key="nota.titolo">
      <div><h4 x-text="nota.titolo"></h4><p x-text="nota.testo"></p></div>
    </template>
  </div>

  <!-- ============================================================ LISTA (inbox/archivio) -->
  <template x-if="corrente === null">
    <div>

      <!-- Tab + azioni import -->
      <div class="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div class="flex gap-1 bg-slate-100 rounded-lg p-1" role="tablist">
          <button @click="cambiaVista('inbox')"
                  :class="vistaLista === 'inbox'
                    ? 'bg-white text-blue-700 shadow-sm'
                    : 'text-slate-600 hover:text-slate-800'"
                  class="px-3 py-1.5 rounded-md text-sm font-medium transition-colors
                         focus:outline-none focus:ring-2 focus:ring-blue-500"
                  role="tab" :aria-selected="String(vistaLista === 'inbox')">
            Inbox
            <span x-show="inbox.length > 0"
                  class="ml-1.5 text-xs bg-blue-100 text-blue-700 rounded-full px-1.5 py-0.5"
                  x-text="inbox.length"></span>
          </button>
          <button @click="cambiaVista('archivio')"
                  :class="vistaLista === 'archivio'
                    ? 'bg-white text-blue-700 shadow-sm'
                    : 'text-slate-600 hover:text-slate-800'"
                  class="px-3 py-1.5 rounded-md text-sm font-medium transition-colors
                         focus:outline-none focus:ring-2 focus:ring-blue-500"
                  role="tab" :aria-selected="String(vistaLista === 'archivio')">
            Archivio
          </button>
        </div>

        <!-- Import JSON SafeCant -->
        <div class="flex items-center gap-2">
          <label class="cursor-pointer flex items-center gap-1.5 text-sm font-medium text-white
                         bg-blue-600 hover:bg-blue-700 px-3 py-1.5 rounded-lg transition-colors
                         focus-within:ring-2 focus-within:ring-blue-500">
            <span>&#8595; Importa JSON SafeCant</span>
            <input type="file" accept=".json" class="sr-only" @change="onImportFile($event)">
          </label>
        </div>
      </div>

      <!-- Zona drag&drop -->
      <div class="border-2 border-dashed border-slate-200 rounded-lg p-3 mb-4 text-center
                  text-xs text-slate-400 bg-slate-50"
           @dragover.prevent @drop="onImportDrop($event)">
        Trascina qui un file JSON SafeCant per importarlo
      </div>

      <!-- INBOX -->
      <div x-show="vistaLista === 'inbox'">
        <div x-show="caricamento" class="text-slate-400 text-sm py-4">Caricamento…</div>
        <div x-show="!caricamento && inbox.length === 0"
             class="text-slate-400 text-sm py-8 text-center">
          <p>Nessun verbale in inbox.</p>
          <p class="mt-1">Importa un JSON SafeCant con il pulsante o trascinandolo sopra.</p>
        </div>
        <ul class="space-y-2" role="list">
          <template x-for="v in inbox" :key="v.id_locale_verbale">
            <li class="bg-white border border-slate-200 rounded-lg px-4 py-3 flex items-center
                       justify-between gap-3 hover:border-blue-300 transition-colors">
              <button @click="apriVerbale(v.id_locale_verbale)"
                      class="flex-1 text-left focus:outline-none focus:ring-2 focus:ring-blue-500 rounded">
                <div class="flex items-center gap-2 flex-wrap">
                  <span class="text-sm font-medium text-slate-800"
                        x-text="v.metadati?.data_sopralluogo ?? '—'"></span>
                  <span class="text-xs px-2 py-0.5 rounded-full font-medium"
                        :class="etichettaStato(v.stato)" x-text="statoLabel(v.stato)"></span>
                </div>
                <div class="text-xs text-slate-500 mt-0.5" x-text="v.metadati?.oggetto ?? 'Senza oggetto'"></div>
                <div class="text-xs text-slate-400 mt-0.5">
                  Redattore: <span x-text="v.redattore?.nome_cognome ?? '—'"></span>
                  · Presenti: <span x-text="(v.presenti ?? []).length"></span>
                  <template x-if="(v.nc_drafts ?? []).length > 0">
                    <span class="ml-2 text-amber-600">
                      NC: <span x-text="v.nc_drafts.length"></span>
                    </span>
                  </template>
                </div>
              </button>
              <button @click="cestina(v.id_locale_verbale)"
                      class="text-slate-300 hover:text-red-500 transition-colors p-1 rounded
                             focus:outline-none focus:ring-2 focus:ring-red-400 flex-shrink-0"
                      aria-label="Rimuovi dall'inbox">&#10005;</button>
            </li>
          </template>
        </ul>
      </div>

      <!-- ARCHIVIO -->
      <div x-show="vistaLista === 'archivio'">
        <div x-show="caricamento" class="text-slate-400 text-sm py-4">Caricamento…</div>
        <div x-show="!caricamento && archivio.length === 0"
             class="text-slate-400 text-sm py-8 text-center">
          Nessun verbale archiviato.
        </div>
        <ul class="space-y-2" role="list">
          <template x-for="v in archivio" :key="v.id_locale_verbale">
            <li class="bg-white border border-slate-200 rounded-lg px-4 py-3">
              <div class="flex items-start justify-between gap-3">
                <div class="flex-1 min-w-0">
                  <div class="flex items-center gap-2 flex-wrap">
                    <span class="text-sm font-medium text-slate-800"
                          x-text="v.metadati?.data_sopralluogo ?? '—'"></span>
                    <span class="text-xs bg-green-100 text-green-800 px-2 py-0.5 rounded-full font-medium">Archiviato</span>
                  </div>
                  <div class="text-xs text-slate-500 mt-0.5" x-text="v.metadati?.oggetto ?? 'Senza oggetto'"></div>
                  <div class="text-xs text-slate-400 mt-0.5">
                    Redattore: <span x-text="v.redattore?.nome_cognome ?? '—'"></span>
                  </div>
                </div>
                <div class="flex items-center gap-2 flex-shrink-0">
                  <button x-show="v.file_archivio?.pdf"
                          @click="apriFileArchivio(v.id_locale_verbale, 'pdf')"
                          class="text-xs text-red-600 hover:text-red-800 border border-red-200
                                 hover:border-red-400 px-2 py-1 rounded transition-colors
                                 focus:outline-none focus:ring-2 focus:ring-red-400">
                    PDF
                  </button>
                  <button x-show="v.file_archivio?.docx"
                          @click="apriFileArchivio(v.id_locale_verbale, 'docx')"
                          class="text-xs text-blue-600 hover:text-blue-800 border border-blue-200
                                 hover:border-blue-400 px-2 py-1 rounded transition-colors
                                 focus:outline-none focus:ring-2 focus:ring-blue-400">
                    DOCX
                  </button>
                </div>
              </div>
            </li>
          </template>
        </ul>
      </div>

    </div>
  </template>

  <!-- ============================================================ EDITOR -->
  <template x-if="corrente !== null">
    <div>

      <!-- Schede editor -->
      <div class="flex gap-1 bg-slate-100 rounded-lg p-1 mb-4 w-fit" role="tablist">
        <button @click="scheda = 'contenuto'"
                :class="scheda === 'contenuto' ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-600 hover:text-slate-800'"
                class="px-3 py-1.5 rounded-md text-sm font-medium transition-colors
                       focus:outline-none focus:ring-2 focus:ring-blue-500"
                role="tab" :aria-selected="String(scheda === 'contenuto')">
          Contenuto
        </button>
        <button @click="scheda = 'controfirma'"
                :class="scheda === 'controfirma' ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-600 hover:text-slate-800'"
                class="px-3 py-1.5 rounded-md text-sm font-medium transition-colors
                       focus:outline-none focus:ring-2 focus:ring-blue-500"
                role="tab" :aria-selected="String(scheda === 'controfirma')">
          Controfirma CSE
        </button>
        <button @click="scheda = 'nc'"
                :class="scheda === 'nc' ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-600 hover:text-slate-800'"
                class="px-3 py-1.5 rounded-md text-sm font-medium transition-colors
                       focus:outline-none focus:ring-2 focus:ring-blue-500"
                role="tab" :aria-selected="String(scheda === 'nc')">
          NC
          <template x-if="(corrente.nc_drafts ?? []).length > 0">
            <span class="ml-1 text-xs bg-amber-100 text-amber-700 rounded-full px-1.5 py-0.5"
                  x-text="corrente.nc_drafts.length"></span>
          </template>
        </button>
        <button @click="scheda = 'archivia'"
                :class="scheda === 'archivia' ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-600 hover:text-slate-800'"
                class="px-3 py-1.5 rounded-md text-sm font-medium transition-colors
                       focus:outline-none focus:ring-2 focus:ring-blue-500"
                role="tab" :aria-selected="String(scheda === 'archivia')">
          Archivia
        </button>
      </div>

      <!-- Barra azioni globali editor -->
      <div class="flex flex-wrap gap-2 mb-4">
        <button @click="apriAnteprima()"
                class="text-sm px-3 py-1.5 border border-slate-300 rounded-lg
                       hover:bg-slate-50 transition-colors
                       focus:outline-none focus:ring-2 focus:ring-blue-500">
          Anteprima HTML
        </button>
        <button @click="generaDocx()" :disabled="generando"
                class="text-sm px-3 py-1.5 bg-blue-600 text-white rounded-lg
                       hover:bg-blue-700 disabled:opacity-50 transition-colors
                       focus:outline-none focus:ring-2 focus:ring-blue-500">
          <span x-show="!generando">Genera DOCX</span>
          <span x-show="generando">Generazione…</span>
        </button>
        <button @click="scaricaDocx()" x-show="_docxBlob !== null" :disabled="generando"
                class="text-sm px-3 py-1.5 border border-blue-300 text-blue-700 rounded-lg
                       hover:bg-blue-50 transition-colors
                       focus:outline-none focus:ring-2 focus:ring-blue-500">
          Scarica DOCX
        </button>
        <button @click="salva()"
                class="text-sm px-3 py-1.5 border border-slate-300 rounded-lg
                       hover:bg-slate-50 transition-colors
                       focus:outline-none focus:ring-2 focus:ring-blue-500">
          Salva
        </button>
      </div>

      <!-- ── SCHEDA CONTENUTO ── -->
      <div x-show="scheda === 'contenuto'" class="space-y-4">

        <!-- Meta del verbale (sola lettura, da SafeCant) -->
        <div class="bg-slate-50 border border-slate-200 rounded-lg p-3 text-xs text-slate-600 space-y-1">
          <div><strong>Data:</strong> <span x-text="corrente.metadati?.data_sopralluogo ?? '—'"></span></div>
          <div><strong>Oggetto:</strong> <span x-text="corrente.metadati?.oggetto ?? '—'"></span></div>
          <div><strong>Meteo:</strong> <span x-text="corrente.metadati?.condizioni_meteo ?? '—'"></span></div>
          <div><strong>Progressiva:</strong>
            <span x-text="corrente.metadati?.progressiva_chilometrica?.inizio ?? ''"></span>
            <template x-if="corrente.metadati?.progressiva_chilometrica?.fine">
              — <span x-text="corrente.metadati.progressiva_chilometrica.fine"></span>
            </template>
          </div>
          <div><strong>Redattore:</strong>
            <span x-text="corrente.redattore?.nome_cognome ?? '—'"></span>
            <span x-show="corrente.redattore?.qualifica"
                  x-text="' (' + (corrente.redattore?.qualifica ?? '') + ')'"></span>
          </div>
          <div><strong>Presenti:</strong> <span x-text="(corrente.presenti ?? []).length"></span></div>
          <div x-show="!(corrente.metadati?.cantiere_id)"
               class="text-amber-600">&#9888; cantiere_id non valorizzato nel verbale SafeCant</div>
        </div>

        <!-- Mini-toolbar editor ricco -->
        <div class="flex items-center gap-1 bg-white border border-slate-200 rounded-t-lg px-2 py-1">
          <button @click="edBoldVS()"
                  class="px-2 py-1 text-sm font-bold text-slate-700 hover:bg-slate-100 rounded
                         focus:outline-none focus:ring-1 focus:ring-blue-400"
                  type="button" aria-label="Grassetto"><strong>G</strong></button>
          <button @click="edItalicVS()"
                  class="px-2 py-1 text-sm italic text-slate-700 hover:bg-slate-100 rounded
                         focus:outline-none focus:ring-1 focus:ring-blue-400"
                  type="button" aria-label="Corsivo"><em>C</em></button>
          <span class="w-px h-4 bg-slate-200 mx-1"></span>
          <button @click="edAllineaVS('l')"
                  class="px-2 py-1 text-xs text-slate-700 hover:bg-slate-100 rounded
                         focus:outline-none focus:ring-1 focus:ring-blue-400"
                  type="button" aria-label="Allinea sinistra">&#8676;</button>
          <button @click="edAllineaVS('c')"
                  class="px-2 py-1 text-xs text-slate-700 hover:bg-slate-100 rounded
                         focus:outline-none focus:ring-1 focus:ring-blue-400"
                  type="button" aria-label="Centra">&#8213;</button>
          <button @click="edAllineaVS('r')"
                  class="px-2 py-1 text-xs text-slate-700 hover:bg-slate-100 rounded
                         focus:outline-none focus:ring-1 focus:ring-blue-400"
                  type="button" aria-label="Allinea destra">&#8677;</button>
        </div>

        <!-- Corpo HTML verbale (contenteditable) — serializza con innerHTML, NON _serEditor -->
        <div id="vs-editor-corpo"
             contenteditable="true"
             @input="onEditorInputVS()"
             @paste="onEditorPasteVS($event)"
             class="min-h-96 border border-t-0 border-slate-200 rounded-b-lg p-4
                    text-sm leading-relaxed focus:outline-none focus:ring-2 focus:ring-blue-500
                    bg-white prose prose-sm max-w-none">
        </div>
        <p class="text-xs text-slate-400">
          Rifinisci il testo del verbale. Tabelle, firme e struttura sono preservate.
          Il corpo HTML arriva da SafeCant — evita di cancellare le firme dei presenti.
        </p>

      </div>

      <!-- ── SCHEDA CONTROFIRMA CSE ── -->
      <div x-show="scheda === 'controfirma'" class="space-y-4">
        <div class="bg-blue-50 border border-blue-200 rounded-lg p-3 text-xs text-blue-700">
          La controfirma del CSE viene aggiunta in coda al verbale (dopo la firma del redattore).
          Firma legale tramite GoSign o sistema esterno — questo è il segno grafico di riferimento.
        </div>

        <!-- Dati CSE (da M2, sola lettura) -->
        <div class="bg-white border border-slate-200 rounded-lg p-4 space-y-2">
          <p class="text-xs font-semibold text-slate-700 uppercase tracking-wide">Dati CSE (da Impostazioni)</p>
          <div class="text-sm text-slate-800">
            <span x-text="corrente.firma_cse?.qualifica ?? '—'"></span>
          </div>
          <div class="text-sm font-medium text-slate-900">
            <span x-text="corrente.firma_cse?.nome_cognome ?? '—'"></span>
          </div>
        </div>

        <!-- Firma grafica -->
        <div class="bg-white border border-slate-200 rounded-lg p-4 space-y-3">
          <p class="text-xs font-semibold text-slate-700 uppercase tracking-wide">Firma grafica CSE</p>
          <template x-if="corrente.firma_cse?.firma_png_base64">
            <div class="space-y-2">
              <img :src="corrente.firma_cse.firma_png_base64" alt="firma CSE"
                   class="max-h-20 border border-slate-200 rounded bg-white p-1">
              <div class="text-xs text-slate-400">
                <span x-text="corrente.firma_cse.tipo_firma ?? ''"></span>
                <template x-if="corrente.firma_cse.timestamp_firma">
                  — <span x-text="corrente.firma_cse.timestamp_firma?.slice(0,10) ?? ''"></span>
                </template>
              </div>
              <button @click="rimuoviFirmaCSE()"
                      class="text-xs text-red-600 hover:text-red-800 underline
                             focus:outline-none focus:ring-2 focus:ring-red-400">
                Rimuovi firma
              </button>
            </div>
          </template>
          <template x-if="!corrente.firma_cse?.firma_png_base64">
            <p class="text-xs text-slate-400">Nessuna firma grafica (non bloccante — firma via GoSign).</p>
          </template>

          <div class="flex flex-wrap gap-2 pt-1">
            <button @click="apriCanvasFirma()"
                    class="text-sm px-3 py-1.5 border border-slate-300 rounded-lg
                           hover:bg-slate-50 transition-colors
                           focus:outline-none focus:ring-2 focus:ring-blue-500">
              ✏ Disegna firma
            </button>
            <label class="cursor-pointer text-sm px-3 py-1.5 border border-slate-300 rounded-lg
                          hover:bg-slate-50 transition-colors focus-within:ring-2 focus-within:ring-blue-500">
              &#8679; Carica PNG
              <input type="file" accept="image/png,image/jpeg" class="sr-only" @change="onUploadFirmaCSE($event)">
            </label>
          </div>
        </div>

        <!-- Azione controfirma -->
        <button @click="controfirma()"
                :disabled="corrente.stato === 'ARCHIVIATO'"
                :class="corrente.stato === 'CONTROFIRMATO'
                  ? 'bg-violet-100 text-violet-800 border-violet-300'
                  : 'bg-violet-600 text-white hover:bg-violet-700'"
                class="w-full py-2.5 rounded-lg text-sm font-medium border
                       disabled:opacity-50 transition-colors
                       focus:outline-none focus:ring-2 focus:ring-violet-500">
          <template x-if="corrente.stato !== 'CONTROFIRMATO'">
            <span>Controfirma come CSE</span>
          </template>
          <template x-if="corrente.stato === 'CONTROFIRMATO'">
            <span>&#10003; Controfirmato</span>
          </template>
        </button>
      </div>

      <!-- ── SCHEDA NC ── -->
      <div x-show="scheda === 'nc'" class="space-y-3">
        <div class="bg-blue-50 border border-blue-200 rounded-lg p-3 text-xs text-blue-700">
          Le Non Conformità rilevate sul campo possono essere esportate nel modulo NC.
          Ogni esportazione crea una copia indipendente: il verbale resta invariato.
        </div>
        <div x-show="(corrente.nc_drafts ?? []).length === 0"
             class="text-slate-400 text-sm py-4 text-center">Nessuna NC rilevata nel sopralluogo.</div>
        <ul class="space-y-2" role="list">
          <template x-for="nc in (corrente.nc_drafts ?? [])" :key="nc.id_locale">
            <li class="bg-white border border-slate-200 rounded-lg p-3">
              <!-- Riga badge livello + indicatore esportazione -->
              <div class="flex items-center gap-2 mb-1 flex-wrap">
                <span class="text-xs font-semibold uppercase px-2 py-0.5 rounded"
                      :class="{
                        'bg-red-100 text-red-800':    nc.livello === 'gravissima',
                        'bg-orange-100 text-orange-800': nc.livello === 'grave',
                        'bg-yellow-100 text-yellow-800': nc.livello === 'media',
                        'bg-amber-50 text-amber-600':  !nc.livello || nc.livello === 'lieve'
                      }"
                      x-text="nc.livello ?? 'lieve'"></span>
                <span x-show="nc.esportata_a_nc"
                      class="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full">
                  ✓ già esportata a NC
                </span>
              </div>
              <p class="text-sm text-slate-800" x-text="nc.descrizione ?? '—'"></p>
              <template x-if="nc.scadenza_calcolata">
                <p class="text-xs text-slate-400 mt-1">
                  Scadenza: <span x-text="nc.scadenza_calcolata?.slice(0,10) ?? ''"></span>
                </p>
              </template>
              <!-- Tasto Esporta verso NC (M14-c) -->
              <div class="mt-2">
                <button type="button" @click="esportaNCDraft(nc)"
                        :class="nc.esportata_a_nc
                          ? 'text-slate-500 bg-slate-50 border-slate-200 hover:bg-slate-100'
                          : 'text-blue-700 bg-blue-50 border-blue-200 hover:bg-blue-100'"
                        class="text-xs border px-2.5 py-1 rounded-lg transition-colors
                               focus:outline-none focus:ring-2 focus:ring-blue-400">
                  <span x-show="!nc.esportata_a_nc">↗ Esporta verso NC</span>
                  <span x-show="nc.esportata_a_nc">↗ Esporta di nuovo</span>
                </button>
              </div>
            </li>
          </template>
        </ul>
      </div>

      <!-- ── SCHEDA ARCHIVIA ── -->
      <div x-show="scheda === 'archivia'" class="space-y-4">
        <div class="bg-slate-50 border border-slate-200 rounded-lg p-3 text-sm text-slate-600 space-y-1">
          <p><strong>Flusso di archiviazione:</strong></p>
          <ol class="list-decimal list-inside space-y-1 text-xs mt-1">
            <li>Genera il DOCX con il pulsante "Genera DOCX" (in alto)</li>
            <li>Scarica il DOCX e aprilo in Microsoft Word</li>
            <li>Da Word: Esporta come PDF (o Stampa → Salva come PDF)</li>
            <li>Carica qui il PDF e opzionalmente anche il DOCX</li>
          </ol>
        </div>

        <!-- Upload PDF (obbligatorio) e DOCX (opzionale) -->
        <div class="bg-white border border-slate-200 rounded-lg p-4 space-y-4"
             @dragover.prevent @drop="onArchivioDropZone($event)">
          <p class="text-xs font-semibold text-slate-700 uppercase tracking-wide">
            File da archiviare
          </p>

          <!-- PDF -->
          <div class="space-y-1">
            <label class="text-xs text-slate-600 font-medium">PDF d'archivio <span class="text-red-500">*</span></label>
            <div class="flex items-center gap-3">
              <label class="cursor-pointer flex items-center gap-1.5 text-xs font-medium text-slate-700
                             bg-slate-100 hover:bg-slate-200 px-3 py-1.5 rounded-lg transition-colors
                             focus-within:ring-2 focus-within:ring-blue-500 border border-slate-300">
                Scegli PDF
                <input type="file" accept=".pdf" class="sr-only" @change="onArchPdfFile($event)">
              </label>
              <span class="text-xs text-slate-500"
                    x-text="_archFile._pdfFile ? _archFile._pdfFile.name : 'Nessun file'"></span>
              <span x-show="_archFile._pdfFile" class="text-green-600 text-xs">&#10003;</span>
            </div>
          </div>

          <!-- DOCX (opzionale) -->
          <div class="space-y-1">
            <label class="text-xs text-slate-600 font-medium">DOCX (opzionale)</label>
            <div class="flex items-center gap-3">
              <label class="cursor-pointer flex items-center gap-1.5 text-xs font-medium text-slate-700
                             bg-slate-100 hover:bg-slate-200 px-3 py-1.5 rounded-lg transition-colors
                             focus-within:ring-2 focus-within:ring-blue-500 border border-slate-300">
                Scegli DOCX
                <input type="file" accept=".docx" class="sr-only" @change="onArchDocxFile($event)">
              </label>
              <span class="text-xs text-slate-500"
                    x-text="_archFile._docxFile ? _archFile._docxFile.name : 'Nessun file'"></span>
            </div>
          </div>

          <p class="text-xs text-slate-400">
            Puoi anche trascinare i file direttamente su questa scheda.
          </p>
        </div>

        <!-- Bottone Archivia -->
        <button @click="archivia()"
                :disabled="_archFile.archiviando || !_archFile._pdfFile || corrente.stato === 'ARCHIVIATO'"
                class="w-full py-2.5 bg-green-600 text-white rounded-lg text-sm font-medium
                       hover:bg-green-700 disabled:opacity-50 transition-colors
                       focus:outline-none focus:ring-2 focus:ring-green-500">
          <span x-show="!_archFile.archiviando">Archivia verbale</span>
          <span x-show="_archFile.archiviando">Archiviazione in corso…</span>
        </button>
        <p x-show="!_archFile._pdfFile" class="text-xs text-slate-400 text-center">
          Il PDF è richiesto per archiviare.
        </p>
      </div>

    </div>
  </template>

  <!-- ── Modale firma canvas ── -->
  <div x-show="firmaModal" x-transition
       class="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
       role="dialog" aria-modal="true" aria-label="Firma CSE">
    <div x-data="FirmaCanvas()" x-init="init()"
         class="bg-white rounded-xl p-5 shadow-xl w-full max-w-sm space-y-3"
         @firma-acquisita.stop="$dispatch('firma-acquisita', $event.detail)"
         @firma-annullata.stop="firmaModal = null">
      <h3 class="text-base font-semibold text-slate-800">Firma CSE</h3>
      <canvas id="firma-canvas-vs"
              width="350" height="120"
              class="border border-slate-200 rounded bg-white touch-none w-full"
              @pointerdown="startDraw($event)"
              @pointermove="draw($event)"
              @pointerup="endDraw()"
              @pointerleave="endDraw()"></canvas>
      <div class="flex gap-2">
        <button @click="pulisci()"
                class="flex-1 py-1.5 text-sm border border-slate-300 rounded-lg hover:bg-slate-50
                       focus:outline-none focus:ring-2 focus:ring-blue-500">
          Pulisci
        </button>
        <button @click="usa()"
                class="flex-1 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700
                       focus:outline-none focus:ring-2 focus:ring-blue-500">
          Usa firma
        </button>
        <button @click="annulla()"
                class="flex-1 py-1.5 text-sm border border-slate-300 rounded-lg hover:bg-slate-50
                       focus:outline-none focus:ring-2 focus:ring-blue-500">
          Annulla
        </button>
      </div>
    </div>
  </div>

</div>
`;

// ── Registrazione ─────────────────────────────────────────────────────────────

window.MODULI_REGISTRATI = window.MODULI_REGISTRATI ?? {};
window.MODULI_REGISTRATI['verbale-sopralluogo'] = {
  monta(contenitore) {
    contenitore.innerHTML = _TEMPLATE_VS;
  },
};
