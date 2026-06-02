/**
 * verbale-riunione.js — Verbale di Riunione di Coordinamento (pilota Flusso B).
 *
 * Pattern che riusano tutti i futuri moduli Flusso B:
 *  • ciclo BOZZA → FINALIZZATO_DA_PROTOCOLLARE → PROTOCOLLATO
 *  • generaCorpoHtml<Tipo>() pura → M6 per HTML+DOCX
 *  • auto-save debounce + indicatore stato
 *  • firma integrata nel record presenza (no desincronizzazione)
 *  • promemoria normativo (UI only — non entra nel DOCX)
 *  • editor ricco (grassetto/corsivo/allineamento) su campi narrativi
 *
 * Storage: SafeHub-CSE-Lavori/<cantiere>/02_Verbali-Riunione/Bozze/<uuid>.json
 *          Protocollati/ dopo protocollazione.
 *
 * Dipendenze: FILESYSTEM, IMPOSTAZIONI_SERVICE, ANAGRAFICA_SERVICE,
 *             MOTORE_DOCX, NOTIFICHE, ERRORI, UTILS (tutti globali).
 */

'use strict';

// ── Costanti ────────────────────────────────────────────────────────────────

const CHECKLIST_ARGOMENTI_DEFAULT = [
  { id: 'chk_1', testo: 'Illustrazione PSC', spuntato: false, impresa_id: null },
  { id: 'chk_2', testo: 'Illustrazione layout cantiere e proposte aggiornamento', spuntato: false, impresa_id: null },
  { id: 'chk_3', testo: "Piano operativo di sicurezza dell'impresa ___", spuntato: false, impresa_id: null },
  { id: 'chk_4', testo: 'Attribuzione incarichi e competenze', spuntato: false, impresa_id: null },
  { id: 'chk_5', testo: 'Individuazione responsabili di cantiere imprese esecutrici', spuntato: false, impresa_id: null },
  { id: 'chk_6', testo: 'Modalità gestione servizi e impianti comuni', spuntato: false, impresa_id: null },
  { id: 'chk_7', testo: 'Sorveglianza sanitaria', spuntato: false, impresa_id: null },
  { id: 'chk_8', testo: 'Coordinamento tra RLS', spuntato: false, impresa_id: null },
];

const TIPI_RIUNIONE = [
  { id: 'preliminare',            label: "Preliminare" },
  { id: 'in_corso_dopera',        label: "In corso d'opera" },
  { id: 'ingresso_nuove_imprese', label: "Ingresso nuove imprese" },
  { id: 'coordinamento',          label: "Coordinamento" },
];

// Promemori normativi per tipo documento — UI only, NON entra nel DOCX.
// Struttura keyed: altri moduli Flusso B aggiungono la propria chiave.
const NOTE_NORMATIVE = {
  'verbale-riunione': [
    {
      titolo: 'Chi deve firmare',
      testo:  'Il verbale va sottoscritto dai presenti (prassi CSE e linee guida). ' +
              'La firma è fortemente raccomandata ma non è condizione di nullità dell\'atto: ' +
              'il CSE resta responsabile del coordinamento anche con firme mancanti. ' +
              'Raccogli le firme mancanti in differita quando possibile.',
    },
    {
      titolo: 'Aggiornamento PSC (art. 92 c.1 lett. b D.Lgs. 81/08)',
      testo:  'Il verbale di coordinamento COSTITUISCE integrazione e aggiornamento del PSC. ' +
              'La Cassazione ha ritenuto il CSE responsabile quando il verbale non aggiornava il PSC ' +
              'sui rischi concretizzatisi. ' +
              'Promemoria: annota i rischi interferenziali rilevati e le misure di coordinamento adottate.',
    },
    {
      titolo: 'Trasmissione',
      testo:  'Copia al Committente / Responsabile dei Lavori; alle imprese affidatarie ' +
              'ed esecutrici coinvolte; agli RLS; copia conservata in cantiere. ' +
              'Convocazione e trasmissione ammesse anche via PEC.',
    },
  ],
};

// ── Helper editor ricco ──────────────────────────────────────────────────────

function _serEditor(el) {
  if (!el) return '';
  return _serNodo(el);
}

function _serNodo(el) {
  let out = '';
  for (const n of el.childNodes) {
    if (n.nodeType === 3) { out += UTILS.escapeHtml(n.textContent); continue; }
    if (n.nodeType !== 1) continue;
    const tag   = n.tagName;
    const inner = _serNodo(n);
    if (tag === 'BR')                      { out += '<br>'; continue; }
    if (tag === 'B' || tag === 'STRONG')   { out += `<strong>${inner}</strong>`; continue; }
    if (tag === 'I' || tag === 'EM')       { out += `<em>${inner}</em>`; continue; }
    if (tag === 'SPAN') {
      let s = inner;
      if ((n.style?.fontWeight ?? '') >= '600' || n.style?.fontWeight === 'bold') s = `<strong>${s}</strong>`;
      if (n.style?.fontStyle === 'italic') s = `<em>${s}</em>`;
      out += s; continue;
    }
    if (tag === 'DIV' || tag === 'P') {
      const da = n.getAttribute('data-align') || '';
      const sa = n.style?.textAlign || '';
      const a  = da || (sa === 'center' ? 'center' : sa === 'right' ? 'right' : '');
      out += a ? `<p data-align="${a}">${inner || '<br>'}</p>` : `<p>${inner || '<br>'}</p>`;
      continue;
    }
    out += inner;
  }
  return out;
}

function _editorFromHtml(html) {
  if (!html) return '';
  return html.replace(
    /<p([^>]*?)data-align="([^"]+)"([^>]*)>/g,
    (_, pre, a, post) => `<p${pre}data-align="${a}"${post} style="text-align:${a}">`
  );
}

// ── Helper canvas firma ──────────────────────────────────────────────────────

function _ptCanvas(canvas, e) {
  const r   = canvas.getBoundingClientRect();
  const src = e.touches?.[0] ?? e;
  return [src.clientX - r.left, src.clientY - r.top];
}

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

// ── FirmaCanvas Alpine component ─────────────────────────────────────────────

function FirmaCanvas() {
  return {
    _ctx:        null,
    _disegnando: false,
    _haTracce:   false,

    init() {
      const canvas = this.$refs.canvas;
      canvas.width  = canvas.offsetWidth || 380;
      canvas.height = 100;
      this._ctx = canvas.getContext('2d');
      this._ctx.strokeStyle = '#000';
      this._ctx.lineWidth   = 2;
      this._ctx.lineCap     = 'round';
      this._ctx.lineJoin    = 'round';
    },

    startDraw(e) {
      e.preventDefault();
      this._disegnando = true;
      const [x, y] = _ptCanvas(this.$refs.canvas, e);
      this._ctx.beginPath();
      this._ctx.moveTo(x, y);
    },

    draw(e) {
      if (!this._disegnando) return;
      e.preventDefault();
      const [x, y] = _ptCanvas(this.$refs.canvas, e);
      this._ctx.lineTo(x, y);
      this._ctx.stroke();
      this._haTracce = true;
    },

    endDraw() { this._disegnando = false; },

    pulisci() {
      this._ctx.clearRect(0, 0, this.$refs.canvas.width, this.$refs.canvas.height);
      this._haTracce = false;
    },

    usa() {
      if (!this._haTracce) {
        NOTIFICHE.attenzione('Firma vuota', 'Traccia la firma prima di confermare.');
        return;
      }
      this.$dispatch('firma-acquisita', { png: _ritagliaCanvas(this.$refs.canvas) });
    },

    annulla() { this.$dispatch('firma-annullata'); },
  };
}

// ── VerbaleRiunione Alpine component ─────────────────────────────────────────

function VerbaleRiunione() {
  return {
    // Lista
    lista:              [],
    listaProtocollati:  [],
    vistaLista:         'bozze',   // 'bozze' | 'protocollati'
    caricamento:        false,

    // Editor
    corrente:    null,
    scheda:      'dati',
    generando:   false,

    // Auto-save
    _autosaveTimer:    null,
    _statoSalvataggio: 'salvato',

    // UI
    noteAperte:              false,
    firmaModal:              null,
    mostraAnteprima:         false,
    drawerProtocolloAperto:  false,
    _htmlPreview:            '',
    _docxBlob:               null,

    // Form protocollazione
    proto: { numero: '', data: '', _pdfFile: null, _letteraFile: null, salvando: false },

    // Accessori del template ($root) — dichiarati qui per evitare il monkey-patch
    // che con function hoisting causava ricorsione infinita.
    get noteVR()       { return NOTE_NORMATIVE['verbale-riunione']; },
    get tipiRiunione() { return TIPI_RIUNIONE; },
    formatDataLabel(d) { return UTILS.formatData(d) ?? d; },

    // ── Lifecycle ────────────────────────────────────────────────────────────

    async init() {
      await this._caricaLista();
      document.addEventListener('cantiere-cambiato', () => {
        this.corrente = null;
        this.vistaLista = 'bozze';
        this.listaProtocollati = [];
        this._caricaLista();
      });
    },

    // ── Lista ────────────────────────────────────────────────────────────────

    async _caricaLista() {
      const cantId = Alpine.store('cantiere').id;
      if (!cantId) { this.lista = []; return; }
      this.caricamento = true;
      try {
        const root = FILESYSTEM.getHandleAttivo();
        if (!root) return;
        const cantDir = await root.getDirectoryHandle(cantId);
        const bDir    = await FILESYSTEM.navigaPercorso(cantDir, ['02_Verbali-Riunione', 'Bozze'], true);
        const voci = [];
        for await (const [nome] of bDir.entries()) {
          if (!nome.endsWith('.json')) continue;
          try {
            const d = await FILESYSTEM.leggiJson(bDir, nome);
            if (!d._cestino) voci.push(d);
          } catch { /* skip */ }
        }
        voci.sort((a, b) =>
          (b.data_riunione ?? '').localeCompare(a.data_riunione ?? '') ||
          (b.aggiornato_il ?? '').localeCompare(a.aggiornato_il ?? '')
        );
        this.lista = voci;
      } catch (err) {
        ERRORI.gestisciErrore('verbale-riunione/carica-lista', err);
      } finally {
        this.caricamento = false;
      }
    },

    // ── Nuovo verbale ────────────────────────────────────────────────────────

    async nuovo() {
      const cantiere = Alpine.store('cantiere');
      if (!cantiere.id) return;

      // Ricarica l'anagrafica dal disco così tutti i campi lotto (committente,
      // denominazione, SS, contratto…) sono aggiornati prima di popolare il verbale.
      await ANAGRAFICA_SERVICE.carica(cantiere.id);

      const cse   = IMPOSTAZIONI_SERVICE.cse();
      const firm  = IMPOSTAZIONI_SERVICE.firma();
      const lotto = this._getDatiLotto();

      this.corrente = {
        id:          UTILS.uuid(),
        tipo_file:   'verbale_riunione',
        cantiere_id: cantiere.id ?? '',
        stato:       'BOZZA',
        numero_progressivo: null,
        creato_il:    new Date().toISOString(),
        aggiornato_il: new Date().toISOString(),

        intestazione: {
          ss_lotto:        lotto.ssNumero ?? lotto.progressivaInizio ?? '',
          codice_progetto: lotto.codicePpmSil ?? lotto.commessaNumero ?? '',
          lavoro:          lotto.nome ?? '',
          contratto:       lotto.contrattoNumero ?? '',
        },

        data_riunione:  UTILS.oggi(),
        tipi_riunione:  [],
        etichetta_anas: (lotto.committente ?? '').trim(),

        presenti_anas:    [],
        presenti_imprese: [],

        checklist_argomenti:  CHECKLIST_ARGOMENTI_DEFAULT.map(c => ({ ...c })),
        racconto_libero:      '',
        criticita_osservazioni:  '',
        istruzioni_decisioni:    '',

        firma_cse: {
          qualifica:        cse.qualifica    ?? 'Coordinatore Sicurezza in fase di Esecuzione',
          nome_cognome:     cse.nome_cognome ?? '',
          firma_png_base64: firm.firma_png_base64 ?? null,
          tipo_firma:       firm.firma_png_base64 ? 'permanente' : null,
          timestamp_firma:  firm.acquisita_il ?? null,
        },

        protocollo: null,
      };

      this.scheda = 'dati';
      this._statoSalvataggio = 'non_salvato';
      this.$nextTick(() => this._caricaEditors());
    },

    _getDatiLotto() {
      // ANAGRAFICA_SERVICE.dati è il getter diretto di _dati (anagrafica completa).
      // .lotto è l'oggetto radice, non una collezione: accesso diretto, nessun workaround.
      return ANAGRAFICA_SERVICE.dati?.lotto ?? {};
    },

    // ── Apri bozza ───────────────────────────────────────────────────────────

    async _caricaProtocollati() {
      const cantId = Alpine.store('cantiere').id;
      if (!cantId) { this.listaProtocollati = []; return; }
      this.caricamento = true;
      try {
        const root    = FILESYSTEM.getHandleAttivo();
        if (!root) return;
        const cantDir = await root.getDirectoryHandle(cantId);
        let prtDir;
        try {
          prtDir = await FILESYSTEM.navigaPercorso(cantDir, ['02_Verbali-Riunione', 'Protocollati'], false);
        } catch (e) {
          // Cartella non ancora creata: nessun verbale protocollato
          if (e.name === 'NotFoundError') { this.listaProtocollati = []; return; }
          throw e;
        }
        const voci = [];
        for await (const [nome] of prtDir.entries()) {
          if (!nome.endsWith('.json')) continue;
          try {
            const d = await FILESYSTEM.leggiJson(prtDir, nome);
            if (!d._cestino) voci.push(d);
          } catch { /* file illeggibile: skip */ }
        }
        voci.sort((a, b) =>
          (b.protocollo?.data_protocollo ?? '').localeCompare(a.protocollo?.data_protocollo ?? '') ||
          (b.protocollo?.numero ?? '').localeCompare(a.protocollo?.numero ?? '')
        );
        this.listaProtocollati = voci;
      } catch (err) {
        ERRORI.gestisciErrore('verbale-riunione/carica-protocollati', err);
        this.listaProtocollati = [];
      } finally {
        this.caricamento = false;
      }
    },

    // Apre un file (PDF/lettera) dalla cartella Protocollati/ via FSA
    async apriFileProt(filename) {
      if (!filename) return;
      try {
        const cantId  = Alpine.store('cantiere').id;
        const root    = FILESYSTEM.getHandleAttivo();
        const prtDir  = await FILESYSTEM.navigaPercorso(
          await root.getDirectoryHandle(cantId),
          ['02_Verbali-Riunione', 'Protocollati']
        );
        const fh   = await prtDir.getFileHandle(filename);
        const file = await fh.getFile();
        const url  = URL.createObjectURL(file);
        window.open(url, '_blank');
        // Revoca dopo 60s: da tenere in memoria finché la scheda non carica
        setTimeout(() => URL.revokeObjectURL(url), 60000);
      } catch (err) {
        ERRORI.gestisciErrore('verbale-riunione/apri-file-prot', err);
      }
    },

    async apri(id) {
      try {
        const dir = await this._bozzeDir();
        this.corrente = await FILESYSTEM.leggiJson(dir, `${id}.json`);
        this.scheda   = 'dati';
        this._statoSalvataggio = 'salvato';
        this.$nextTick(() => this._caricaEditors());
      } catch (err) { ERRORI.gestisciErrore('verbale-riunione/apri', err); }
    },

    chiudiEditor() {
      clearTimeout(this._autosaveTimer);
      this.corrente = null;
      this.mostraAnteprima = false;
      this.drawerProtocolloAperto = false;
    },

    // ── Salvataggio ──────────────────────────────────────────────────────────

    async salva() {
      if (!this.corrente || this.corrente.stato === 'PROTOCOLLATO') return;
      clearTimeout(this._autosaveTimer);
      this._statoSalvataggio = 'salvando';
      try {
        const dir = await this._bozzeDir(true);
        this.corrente.aggiornato_il = new Date().toISOString();
        await FILESYSTEM.scriviJson(dir, `${this.corrente.id}.json`, this.corrente);
        this._statoSalvataggio = 'salvato';
        const idx = this.lista.findIndex(v => v.id === this.corrente.id);
        if (idx >= 0) this.lista[idx] = { ...this.corrente };
        else          this.lista.unshift({ ...this.corrente });
      } catch (err) {
        this._statoSalvataggio = 'errore';
        ERRORI.gestisciErrore('verbale-riunione/salva', err);
      }
    },

    _scheduleAutosave() {
      this._statoSalvataggio = 'modificato';
      clearTimeout(this._autosaveTimer);
      this._autosaveTimer = setTimeout(() => this.salva(), 8000);
    },

    // ── Cestino ──────────────────────────────────────────────────────────────

    async cestina(id) {
      if (!confirm('Spostare il verbale nel cestino?')) return;
      try {
        const dir = await this._bozzeDir();
        const d   = await FILESYSTEM.leggiJson(dir, `${id}.json`);
        await FILESYSTEM.scriviJson(dir, `${id}.json`,
          { ...d, _cestino: true, _eliminato_il: new Date().toISOString() });
        this.lista = this.lista.filter(v => v.id !== id);
        if (this.corrente?.id === id) this.corrente = null;
        NOTIFICHE.successo('Spostato nel cestino', 'Il verbale può essere ripristinato.');
      } catch (err) { ERRORI.gestisciErrore('verbale-riunione/cestina', err); }
    },

    // ── Presenti ─────────────────────────────────────────────────────────────

    aggiungiPresente(tipo) {
      const arr = tipo === 'anas' ? this.corrente.presenti_anas : this.corrente.presenti_imprese;
      arr.push({
        id: UTILS.generaId('pres'), persona_id: null, impresa_id: null,
        qualifica: '', nome_cognome: '',
        firma_png_base64: null, tipo_firma: null, timestamp_firma: null, rifiuto_firma: false,
      });
      this._scheduleAutosave();
    },

    rimuoviPresente(tipo, id) {
      if (tipo === 'anas') {
        this.corrente.presenti_anas = this.corrente.presenti_anas.filter(p => p.id !== id);
      } else {
        this.corrente.presenti_imprese = this.corrente.presenti_imprese.filter(p => p.id !== id);
      }
      this._scheduleAutosave();
    },

    selezionaPersona(tipo, presId, personaId) {
      if (!personaId) return;
      const pres = this._trovaPres(tipo, presId);
      if (!pres) return;
      const pc = ANAGRAFICA_SERVICE.getEntita('persone_committente', personaId);
      if (pc) {
        pres.persona_id   = personaId;
        pres.nome_cognome = `${pc.cognome ?? ''} ${pc.nome ?? ''}`.trim();
        pres.qualifica    = pc.qualifica ?? '';
      }
      this._scheduleAutosave();
    },

    selezionaLavoratore(presId, lavId) {
      if (!lavId) return;
      const pres = this._trovaPres('imprese', presId);
      if (!pres) return;
      const lav = ANAGRAFICA_SERVICE.getEntita('lavoratori', lavId);
      if (lav) {
        pres.persona_id   = lavId;
        pres.nome_cognome = `${lav.cognome ?? ''} ${lav.nome ?? ''}`.trim();
        pres.qualifica    = lav.mansione ?? '';
        pres.impresa_id   = lav.impresa_id ?? null;
      }
      this._scheduleAutosave();
    },

    _trovaPres(tipo, id) {
      const arr = tipo === 'anas' ? this.corrente.presenti_anas : this.corrente.presenti_imprese;
      return arr.find(p => p.id === id) ?? null;
    },

    // ── Checklist argomenti ───────────────────────────────────────────────────

    aggiungiVoceChecklist() {
      this.corrente.checklist_argomenti.push(
        { id: UTILS.generaId('chk'), testo: '', spuntato: false, impresa_id: null }
      );
      this._scheduleAutosave();
    },

    rimuoviVoceChecklist(id) {
      this.corrente.checklist_argomenti =
        this.corrente.checklist_argomenti.filter(c => c.id !== id);
      this._scheduleAutosave();
    },

    // ── Editor ricco ──────────────────────────────────────────────────────────

    _caricaEditors() {
      const map = {
        'ed-racconto':   'racconto_libero',
        'ed-criticita':  'criticita_osservazioni',
        'ed-istruzioni': 'istruzioni_decisioni',
      };
      for (const [elId, campo] of Object.entries(map)) {
        const el = document.getElementById(elId);
        if (el) el.innerHTML = _editorFromHtml(this.corrente?.[campo] ?? '');
      }
    },

    edBold(elId)        { this._edCmd(elId, 'bold'); },
    edItalic(elId)      { this._edCmd(elId, 'italic'); },
    edAllinea(elId, dir) {
      const cmd = { l: 'justifyLeft', c: 'justifyCenter', r: 'justifyRight' }[dir] ?? 'justifyLeft';
      this._edCmd(elId, cmd);
    },

    _edCmd(elId, cmd) {
      const el = document.getElementById(elId);
      if (!el) return;
      el.focus();
      document.execCommand(cmd, false);
      this._syncEditor(elId);
    },

    _syncEditor(elId) {
      const map = {
        'ed-racconto':   'racconto_libero',
        'ed-criticita':  'criticita_osservazioni',
        'ed-istruzioni': 'istruzioni_decisioni',
      };
      const campo = map[elId];
      if (!campo || !this.corrente) return;
      const el = document.getElementById(elId);
      if (el) this.corrente[campo] = _serEditor(el);
      this._scheduleAutosave();
    },

    onEditorInput(elId)       { this._syncEditor(elId); },
    onEditorPaste(elId, e)    {
      e.preventDefault();
      document.execCommand('insertText', false, e.clipboardData.getData('text/plain'));
      this._syncEditor(elId);
    },

    // ── Firme ─────────────────────────────────────────────────────────────────

    apriCanvasFirma(tipo, presId) { this.firmaModal = { tipo, presId }; },

    onFirmaAcquisita(png) {
      if (!this.firmaModal || !this.corrente) { this.firmaModal = null; return; }
      const { tipo, presId } = this.firmaModal;
      if (tipo === 'cse') {
        this.corrente.firma_cse.firma_png_base64 = png;
        this.corrente.firma_cse.tipo_firma      = 'canvas';
        this.corrente.firma_cse.timestamp_firma = new Date().toISOString();
      } else {
        const p = this._trovaPres(tipo, presId);
        if (p) { p.firma_png_base64 = png; p.tipo_firma = 'canvas'; p.timestamp_firma = new Date().toISOString(); }
      }
      this.firmaModal = null;
      this._scheduleAutosave();
    },

    async onUploadFirma(tipo, presId, e) {
      const file = e.target.files?.[0];
      if (!file) return;
      const png = await _leggiBase64(file);
      if (tipo === 'cse') {
        this.corrente.firma_cse.firma_png_base64 = png;
        this.corrente.firma_cse.tipo_firma      = 'upload';
        this.corrente.firma_cse.timestamp_firma = new Date().toISOString();
      } else {
        const p = this._trovaPres(tipo, presId);
        if (p) { p.firma_png_base64 = png; p.tipo_firma = 'upload'; p.timestamp_firma = new Date().toISOString(); }
      }
      e.target.value = '';
      this._scheduleAutosave();
    },

    rimuoviFirma(tipo, presId) {
      if (tipo === 'cse') {
        this.corrente.firma_cse.firma_png_base64 = null;
        this.corrente.firma_cse.tipo_firma      = null;
        this.corrente.firma_cse.timestamp_firma = null;
      } else {
        const p = this._trovaPres(tipo, presId);
        if (p) { p.firma_png_base64 = null; p.tipo_firma = null; }
      }
      this._scheduleAutosave();
    },

    rifiutaFirma(tipo, presId) {
      const p = this._trovaPres(tipo, presId);
      if (p) { p.rifiuto_firma = !p.rifiuto_firma; this._scheduleAutosave(); }
    },

    _firmatariSenzaFirma() {
      if (!this.corrente) return [];
      const mancanti = [];
      for (const p of [...(this.corrente.presenti_anas ?? []), ...(this.corrente.presenti_imprese ?? [])]) {
        if (!p.firma_png_base64 && !p.rifiuto_firma && p.nome_cognome) mancanti.push(p.nome_cognome);
      }
      if (!this.corrente.firma_cse?.firma_png_base64 && this.corrente.firma_cse?.nome_cognome) {
        mancanti.push(this.corrente.firma_cse.nome_cognome + ' (CSE)');
      }
      return mancanti;
    },

    // ── Finalizzazione ────────────────────────────────────────────────────────

    async finalizza() {
      if (!this.corrente) return;
      const mancanti = this._firmatariSenzaFirma();
      if (mancanti.length > 0) {
        const ok = confirm(
          `Firme mancanti: ${mancanti.join(', ')}.\n\nPuoi finalizzare comunque. Procedere?`
        );
        if (!ok) return;
      }
      this.generando = true;
      try {
        const modulo = IMPOSTAZIONI_SERVICE.modulo('verbale-riunione');
        const corpo  = await generaCorpoHtmlVerbaleRiunione(this.corrente);
        const out = await MOTORE_DOCX.generaDocumento({
          tipo: 'verbale-riunione',
          header: {
            modulo_titolo:   'Riunione di Coordinamento',
            modulo_codice:   modulo.codice   ?? '',
            modulo_versione: modulo.versione ?? '',
            logo_aziendale:  IMPOSTAZIONI_SERVICE.logo().png_base64 ?? null,
          },
          corpo_html: corpo,
          formati: { html: true, docx: true },
        });
        this.corrente.stato      = 'FINALIZZATO_DA_PROTOCOLLARE';
        this.corrente.corpo_html = corpo;
        this._docxBlob           = out.docxBlob;
        this._htmlPreview        = out.htmlString;
        await this.salva();
        NOTIFICHE.successo('Finalizzato', 'DOCX pronto — usa il pulsante Scarica.');
      } catch (err) {
        ERRORI.gestisciErrore('verbale-riunione/finalizza', err);
      } finally {
        this.generando = false;
      }
    },

    async apriAnteprima() {
      const corpo  = await generaCorpoHtmlVerbaleRiunione(this.corrente);
      const modulo = IMPOSTAZIONI_SERVICE.modulo('verbale-riunione');
      MOTORE_DOCX.generaDocumento({
        tipo: 'verbale-riunione',
        header: {
          modulo_titolo:   'Riunione di Coordinamento',
          modulo_codice:   modulo.codice   ?? '',
          modulo_versione: modulo.versione ?? '',
          logo_aziendale:  IMPOSTAZIONI_SERVICE.logo().png_base64 ?? null,
        },
        corpo_html: corpo,
        formati: { html: true },
      }).then(out => {
        const win = window.open('', '_blank');
        if (win) { win.document.write(out.htmlString); win.document.close(); }
      }).catch(err => ERRORI.gestisciErrore('verbale-riunione/anteprima', err));
    },

    async scaricaDocx() {
      if (!this.corrente) return;
      this.generando = true;
      try {
        const modulo = IMPOSTAZIONI_SERVICE.modulo('verbale-riunione');
        const corpo  = this.corrente.corpo_html || await generaCorpoHtmlVerbaleRiunione(this.corrente);
        const out    = await MOTORE_DOCX.generaDocumento({
          tipo: 'verbale-riunione',
          header: {
            modulo_titolo:   'Riunione di Coordinamento',
            modulo_codice:   modulo.codice   ?? '',
            modulo_versione: modulo.versione ?? '',
            logo_aziendale:  IMPOSTAZIONI_SERVICE.logo().png_base64 ?? null,
          },
          corpo_html: corpo,
          formati: { docx: true },
        });
        const url  = URL.createObjectURL(out.docxBlob);
        const a    = document.createElement('a');
        a.href     = url;
        a.download = `riunione-coordinamento-${this.corrente.data_riunione ?? UTILS.oggi()}.docx`;
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 5000);
      } catch (err) {
        ERRORI.gestisciErrore('verbale-riunione/scarica-docx', err);
      } finally {
        this.generando = false;
      }
    },

    // ── Protocollazione ───────────────────────────────────────────────────────

    async salvaProtocollo() {
      if (!this.proto.numero.trim()) {
        NOTIFICHE.attenzione('Campo richiesto', 'Inserisci il numero di protocollo.');
        return;
      }
      this.proto.salvando = true;
      try {
        const cantId  = Alpine.store('cantiere').id;
        const root    = FILESYSTEM.getHandleAttivo();
        const cantDir = await root.getDirectoryHandle(cantId);
        const prtDir  = await FILESYSTEM.navigaPercorso(cantDir, ['02_Verbali-Riunione', 'Protocollati'], true);
        const numEsc  = this.proto.numero.replace(/[\/\\:*?"<>|]/g, '-');

        if (this.proto._pdfFile)     await _scriviFile(prtDir, `${numEsc}.pdf`,         this.proto._pdfFile);
        if (this.proto._letteraFile) await _scriviFile(prtDir, `${numEsc}.lettera.pdf`, this.proto._letteraFile);

        this.corrente.stato              = 'PROTOCOLLATO';
        this.corrente.numero_progressivo = this.proto.numero;
        this.corrente.protocollo = {
          numero:               this.proto.numero,
          data_protocollo:      this.proto.data || null,
          file_pdf_protocollato:this.proto._pdfFile     ? `${numEsc}.pdf`         : null,
          file_lettera:         this.proto._letteraFile ? `${numEsc}.lettera.pdf` : null,
        };
        this.corrente.aggiornato_il = new Date().toISOString();

        await FILESYSTEM.scriviJson(prtDir, `${numEsc}.json`, this.corrente);

        // Soft-delete dalla bozza
        try {
          const bDir  = await FILESYSTEM.navigaPercorso(cantDir, ['02_Verbali-Riunione', 'Bozze']);
          const bozza = await FILESYSTEM.leggiJson(bDir, `${this.corrente.id}.json`);
          await FILESYSTEM.scriviJson(bDir, `${this.corrente.id}.json`,
            { ...bozza, _cestino: true, _eliminato_il: new Date().toISOString() });
        } catch { /* bozza non trovata: ok */ }

        this.drawerProtocolloAperto = false;
        this.proto = { numero: '', data: '', _pdfFile: null, _letteraFile: null, salvando: false };
        NOTIFICHE.successo('Protocollato', `Verbale n. ${this.corrente.numero_progressivo} archiviato.`);
        await this._caricaLista();
        this.corrente = null;
      } catch (err) {
        ERRORI.gestisciErrore('verbale-riunione/salva-protocollo', err);
      } finally {
        this.proto.salvando = false;
      }
    },

    onProtoPdfFile(e)  { this.proto._pdfFile     = e.target.files?.[0] ?? null; },
    onProtoLettFile(e) { this.proto._letteraFile  = e.target.files?.[0] ?? null; },

    // ── Utility ──────────────────────────────────────────────────────────────

    async _bozzeDir(crea = false) {
      const cantId  = Alpine.store('cantiere').id;
      const root    = FILESYSTEM.getHandleAttivo();
      const cantDir = await root.getDirectoryHandle(cantId);
      return FILESYSTEM.navigaPercorso(cantDir, ['02_Verbali-Riunione', 'Bozze'], crea);
    },

    get statoLabel() {
      return { BOZZA:'Bozza', FINALIZZATO_DA_PROTOCOLLARE:'Da protocollare', PROTOCOLLATO:'Protocollato' }
             [this.corrente?.stato] ?? '—';
    },

    get salvataggioLabel() {
      return { salvato:'✓ Salvato', modificato:'● Non salvato', salvando:'⏳ Salvataggio…',
               errore:'⚠ Errore salvataggio', non_salvato:'' }[this._statoSalvataggio] ?? '';
    },

    nomeImpresa(id) { return ANAGRAFICA_SERVICE.getEntita('imprese', id)?.ragioneSociale ?? id ?? ''; },

    get personeCommittente() { return ANAGRAFICA_SERVICE.get('persone_committente') ?? []; },
    get lavoratori()         { return ANAGRAFICA_SERVICE.get('lavoratori') ?? []; },
    get imprese()            { return ANAGRAFICA_SERVICE.get('imprese') ?? []; },

    tipoRiunioneLabel(id) { return TIPI_RIUNIONE.find(t => t.id === id)?.label ?? id; },

    etichettaStato(stato) {
      return { BOZZA:'bg-yellow-100 text-yellow-800',
               FINALIZZATO_DA_PROTOCOLLARE:'bg-blue-100 text-blue-800',
               PROTOCOLLATO:'bg-green-100 text-green-800' }[stato] ?? 'bg-slate-100 text-slate-600';
    },
  };
}

// ── Utility modulo ────────────────────────────────────────────────────────────

function _leggiBase64(file) {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload  = e => res(e.target.result);
    r.onerror = ()  => rej(new Error('Lettura file non riuscita'));
    r.readAsDataURL(file);
  });
}

async function _scriviFile(dirHandle, nome, file) {
  const fh = await dirHandle.getFileHandle(nome, { create: true });
  const w  = await fh.createWritable();
  await w.write(await file.arrayBuffer());
  await w.close();
}

// ── generaCorpoHtmlVerbaleRiunione ────────────────────────────────────────────
// Funzione pura ASYNC: dati → stringa HTML con solo tag supportati da M6.
// NON include il promemoria normativo (quello è UI-only).
// Layout fedele al Mod.RE.01-10 ANAS (struttura/ordine, non pixel-perfect).

// Riquadro firma uniforme: canvas fisso 210x80 px con firma scalata proporzionalmente
// e centrata dentro. Tutte le firme occupano lo stesso spazio nel DOCX senza distorsioni.
function _scalafirma(src, cW = 210, cH = 80) {
  if (!src) return Promise.resolve(null);
  return new Promise(resolve => {
    const img = new Image();
    img.onload = () => {
      // Scala proporzionalmente per stare nell'80% del canvas (margine 10% per lato)
      const maxW = Math.round(cW * 0.80);
      const maxH = Math.round(cH * 0.80);
      const r    = Math.min(maxW / img.naturalWidth, maxH / img.naturalHeight, 1);
      const w    = Math.max(1, Math.round(img.naturalWidth  * r));
      const h    = Math.max(1, Math.round(img.naturalHeight * r));
      const cv   = document.createElement('canvas');
      cv.width   = cW; cv.height = cH;
      const ctx  = cv.getContext('2d');
      // Sfondo trasparente (default canvas); centra la firma
      ctx.drawImage(img, Math.round((cW - w) / 2), Math.round((cH - h) / 2), w, h);
      resolve(cv.toDataURL('image/png'));
    };
    img.onerror = () => resolve(null);  // se l'immagine è corrotta, cella vuota
    img.src = src;
  });
}

async function generaCorpoHtmlVerbaleRiunione(d) {
  const esc = (s) => UTILS.escapeHtml(s ?? '');
  const p   = [];

  // FIX-1: pre-scala le firme (max ~1.5cm) in parallelo
  const [firmeAnas, firmeImpr, cseImg] = await Promise.all([
    Promise.all((d.presenti_anas    ?? []).map(x => _scalafirma(x.firma_png_base64))),
    Promise.all((d.presenti_imprese ?? []).map(x => _scalafirma(x.firma_png_base64))),
    _scalafirma(d.firma_cse?.firma_png_base64 ?? null),
  ]);

  // FIX-2: helper formato "Qualifica Nome Cognome" (es. "Ing. Mario Rossi")
  // Qualifica precede sempre il nome; campi mancanti ignorati silenziosamente.
  const _fmtNome = (qualifica, nome_cognome) => {
    const q = (qualifica    ?? '').trim();
    const n = (nome_cognome ?? '').trim();
    return [q, n].filter(Boolean).join(' ');
  };

  // ── 2. INTESTAZIONE come righe di testo (non tabella) ─────────────────────
  const riga = (lbl, val) => `<p><strong>${esc(lbl)}</strong> ${esc(val)}</p>`;
  p.push(riga('SS / Lotto:',      d.intestazione?.ss_lotto));
  p.push(riga('Codice Progetto:', d.intestazione?.codice_progetto));
  p.push(riga('Lavoro di:',       d.intestazione?.lavoro));
  p.push(riga('Contratto:',       d.intestazione?.contratto));

  // ── 3. TABELLA PRINCIPALE: data+tipo a sx | presenti ANAS|imprese a dx ─────
  const chk  = (id) => (d.tipi_riunione ?? []).includes(id) ? '☑' : '☐';
  const etAs = esc(d.etichetta_anas ?? '');
  const anas = d.presenti_anas    ?? [];
  const impr = d.presenti_imprese ?? [];
  const dataFmt = d.data_riunione ? UTILS.formatData(d.data_riunione) : '—';

  const tipoRows = [
    'Tipo riunione:',
    `${chk('preliminare')} Preliminare`,
    `${chk('in_corso_dopera')} In corso d'opera`,
    `${chk('ingresso_nuove_imprese')} Ingresso nuove imprese`,
    `${chk('coordinamento')} Coordinamento`,
  ];

  const totRighe = Math.max(tipoRows.length, 4, anas.length, impr.length);
  const tRighe = [];
  for (let i = 0; i < totRighe; i++) {
    const leftCell = i < tipoRows.length ? esc(tipoRows[i]) : '';
    const a = anas[i];
    const b = impr[i];
    // FIX-2: formato "Qualifica Nome Cognome"
    const celA = a ? esc(_fmtNome(a.qualifica, a.nome_cognome)) : '';
    // FIX-3: formato "(Impresa) — Qualifica Nome Cognome"
    const imp   = b?.impresa_id ? `(${esc(_nomeImpresaGen(b.impresa_id))}) — ` : '';
    const celB  = b ? imp + esc(_fmtNome(b.qualifica, b.nome_cognome)) : '';
    tRighe.push(`<tr><td>${leftCell}</td><td>${celA}</td><td>${celB}</td></tr>`);
  }
  p.push(
    `<table>` +
    `<thead><tr><th>Data riunione: ${esc(dataFmt)}</th><th>${etAs}</th><th>Imprese presenti</th></tr></thead>` +
    `<tbody>${tRighe.join('')}</tbody>` +
    `</table>`
  );

  // ── 4. ARGOMENTI DISCUSSI ─────────────────────────────────────────────────
  // FIX-1 ordine: PRIMA lista voci (checklist), POI racconto libero
  p.push('<h3>Argomenti Discussi</h3>');
  const checkSp = (d.checklist_argomenti ?? []).filter(c => c.spuntato);
  checkSp.forEach(c => {
    let testo = c.testo ?? '';
    if (testo.includes('___')) {
      testo = testo.replace('___', c.impresa_id ? _nomeImpresaGen(c.impresa_id) : '______');
    }
    p.push(`<p>${esc(testo)}</p>`);
  });
  if (d.racconto_libero?.trim()) p.push(d.racconto_libero);

  // ── 5. CRITICITÀ ─────────────────────────────────────────────────────────
  p.push('<h3>Criticità riscontrate ed Osservazioni Emerse</h3>');
  if (d.criticita_osservazioni?.trim()) p.push(d.criticita_osservazioni);

  // ── 6. ISTRUZIONI E DECISIONI ─────────────────────────────────────────────
  p.push('<h3>Istruzioni operative e Decisioni Intraprese</h3>');
  if (d.istruzioni_decisioni?.trim()) p.push(d.istruzioni_decisioni);

  // ── 7. FIRME — 3 colonne senza bordi, contenuto centrato ───────────────────
  // Schema per ogni firmatario (schema PO):
  //   riga 1: intestazione/ruolo (gruppo committente, ragione sociale impresa, ruolo CSE)
  //   riga 2: qualifica + nome cognome
  //   riga 3: immagine firma (canvas fisso 210x80px) o spazio vuoto
  // Le firme sono in canvas di dimensione fissa uguale per tutti: aspetto uniforme
  // senza distorsione (la firma è scalata proporzionalmente e centrata nel canvas).
  // M6 ora gestisce: data-border="none" (no bordi) e data-align="center" (centra cella).
  p.push('<h3>Firme</h3>');

  // Blocco HTML per un singolo firmatario centrato
  const _bloccoFirmatario = (intestazione, nomeCognome, firmaImg) => {
    const parts = [];
    if (intestazione) parts.push(esc(intestazione));
    if (nomeCognome)  parts.push(esc(nomeCognome));
    // Riga firma: immagine (canvas fisso) o stringa vuota (spazio riservato)
    parts.push(firmaImg ? `<img src="${firmaImg}" alt="firma">` : '');
    return parts.join('<br>');
  };

  // Colonna sinistra: presenti committente
  const anasBlocchi = anas.map((pr, i) =>
    _bloccoFirmatario(
      d.etichetta_anas ?? '',
      _fmtNome(pr.qualifica, pr.nome_cognome),
      firmeAnas[i]
    )
  );

  // Colonna centro: presenti imprese (riga 1 = ragione sociale impresa)
  const imprBlocchi = impr.map((pr, i) =>
    _bloccoFirmatario(
      pr.impresa_id ? _nomeImpresaGen(pr.impresa_id) : '',
      _fmtNome(pr.qualifica, pr.nome_cognome),
      firmeImpr[i]
    )
  );

  // Colonna destra: CSE fisso
  const cseBlocco = _bloccoFirmatario(
    'Il Coordinatore per la Sicurezza in fase di Esecuzione',
    _fmtNome(d.firma_cse?.qualifica, d.firma_cse?.nome_cognome),
    cseImg
  );

  // Cella: più firmatari nello stesso gruppo separati da riga vuota (<br>)
  const NBSP = '\u00a0'; // spazio non divisibile come riga vuota tra firmatari
  const cellaAnas = anasBlocchi.length ? anasBlocchi.join('<br>' + NBSP + '<br>') : NBSP;
  const cellaImpr = imprBlocchi.length ? imprBlocchi.join('<br>' + NBSP + '<br>') : NBSP;

  // style="text-align:center" → anteprima HTML; data-align="center" → DOCX via M6
  const tdAttr = 'data-align="center" style="text-align:center"';
  p.push(
    '<table data-border="none">' +
    '<tbody><tr>' +
    `<td ${tdAttr}>${cellaAnas}</td>` +
    `<td ${tdAttr}>${cellaImpr}</td>` +
    `<td ${tdAttr}>${cseBlocco}</td>` +
    '</tr></tbody>' +
    '</table>'
  );

  return p.join('\n');
}

function _nomeImpresaGen(id) {
  try { return ANAGRAFICA_SERVICE.getEntita('imprese', id)?.ragioneSociale ?? id ?? ''; }
  catch { return id ?? ''; }
}

// ── Template HTML ─────────────────────────────────────────────────────────────

const _TEMPLATE_VR = /* html */`
<div x-data="VerbaleRiunione()" x-init="init()"
     class="p-4 max-w-5xl mx-auto pb-32" role="region"
     aria-label="Verbale di riunione di coordinamento"
     @firma-acquisita="onFirmaAcquisita($event.detail.png)"
     @firma-annullata="firmaModal = null">

  <!-- === HEADER MODULO === -->
  <div class="flex flex-wrap items-center justify-between gap-3 mb-4">
    <div class="flex items-center gap-3">
      <button x-show="corrente !== null" @click="chiudiEditor()"
              class="text-slate-400 hover:text-slate-700 p-1 rounded transition-colors
                     focus:outline-none focus:ring-2 focus:ring-blue-500"
              aria-label="Torna alla lista">
        &#8592;
      </button>
      <h2 class="text-lg font-semibold text-slate-800">
        Riunione di Coordinamento
      </h2>
    </div>
    <div class="flex items-center gap-2">
      <button @click="noteAperte = !noteAperte"
              :aria-expanded="String(noteAperte)"
              class="flex items-center gap-1 text-xs text-sky-700 bg-sky-50 border border-sky-200
                     px-2.5 py-1 rounded-full hover:bg-sky-100 transition-colors
                     focus:outline-none focus:ring-2 focus:ring-sky-400"
              title="Promemoria normativi — non compaiono nel documento generato">
        &#x2139; Note normative
      </button>
      <template x-if="corrente !== null">
        <span class="text-xs px-2 py-0.5 rounded-full font-medium"
              :class="etichettaStato(corrente.stato)"
              x-text="statoLabel"></span>
      </template>
    </div>
  </div>

  <!-- === PANNELLO NOTE NORMATIVE (UI-only, chiuso di default) === -->
  <div x-show="noteAperte" x-transition class="nota-normativa-panel mb-4"
       role="note" aria-label="Promemoria normativi — non inclusi nel documento">
    <p class="text-xs text-sky-500 mb-2 italic">
      Promemoria per il CSE — non compare nel verbale generato.
    </p>
    <template x-for="nota in noteVR" :key="nota.titolo">
      <div>
        <h4 x-text="nota.titolo"></h4>
        <p x-text="nota.testo"></p>
      </div>
    </template>
  </div>

  <!-- === VISTA LISTA === -->
  <div x-show="corrente === null">

    <!-- Toggle Bozze / Protocollati (stesso pattern 'Mostra cestino') -->
    <div class="flex items-center gap-1 bg-slate-100 rounded-lg p-1 mb-4 w-fit">
      <button @click="vistaLista='bozze'; _caricaLista()"
              :class="vistaLista==='bozze' ? 'bg-white shadow text-slate-800' : 'text-slate-500 hover:text-slate-700'"
              class="text-sm font-medium px-3 py-1.5 rounded-md transition-all
                     focus:outline-none focus:ring-2 focus:ring-blue-500">
        Bozze
      </button>
      <button @click="vistaLista='protocollati'; _caricaProtocollati()"
              :class="vistaLista==='protocollati' ? 'bg-white shadow text-slate-800' : 'text-slate-500 hover:text-slate-700'"
              class="text-sm font-medium px-3 py-1.5 rounded-md transition-all
                     focus:outline-none focus:ring-2 focus:ring-blue-500">
        Protocollati
      </button>
    </div>

    <!-- Barra azioni + stato caricamento -->
    <div class="flex justify-between items-center mb-3">
      <p class="text-sm text-slate-500">
        <span x-show="caricamento">Caricamento...</span>
        <template x-if="!caricamento && vistaLista==='bozze'">
          <span x-show="lista.length === 0 && Alpine.store('cantiere').id">
            Nessuna bozza per questo cantiere.
          </span>
        </template>
        <template x-if="!caricamento && vistaLista==='protocollati'">
          <span x-show="listaProtocollati.length === 0 && Alpine.store('cantiere').id">
            Nessun verbale protocollato.
          </span>
        </template>
        <span x-show="!Alpine.store('cantiere').id" class="text-amber-600">
          Seleziona un cantiere.
        </span>
      </p>
      <button x-show="vistaLista==='bozze'"
              @click="nuovo()"
              :disabled="!Alpine.store('cantiere').id"
              class="bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white text-sm
                     font-medium px-4 py-2 rounded-lg transition-colors
                     focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2">
        + Nuovo verbale
      </button>
    </div>

    <!-- Lista BOZZE -->
    <div x-show="vistaLista==='bozze'" class="space-y-2">
      <template x-for="v in lista" :key="v.id">
        <div class="bg-white border border-slate-200 rounded-lg px-4 py-3 flex items-center gap-3
                    hover:border-slate-300 transition-colors">
          <div class="flex-1 min-w-0 cursor-pointer" @click="apri(v.id)">
            <div class="flex items-center gap-2 flex-wrap">
              <span class="text-sm font-medium text-slate-800"
                    x-text="v.data_riunione ? formatDataLabel(v.data_riunione) : 'Data non impostata'">
              </span>
              <span class="text-xs px-2 py-0.5 rounded-full font-medium"
                    :class="etichettaStato(v.stato)"
                    x-text="{ BOZZA:'Bozza', FINALIZZATO_DA_PROTOCOLLARE:'Da protocollare', PROTOCOLLATO:'Protocollato' }[v.stato] ?? v.stato">
              </span>
              <template x-if="v.numero_progressivo">
                <span class="text-xs text-slate-400" x-text="'n. ' + v.numero_progressivo"></span>
              </template>
            </div>
            <p class="text-xs text-slate-400 mt-0.5"
               x-text="(v.tipi_riunione ?? []).map(t => tipoRiunioneLabel(t)).join(', ') || 'Tipo non specificato'">
            </p>
          </div>
          <button @click.stop="cestina(v.id)"
                  class="text-slate-300 hover:text-red-500 text-lg p-1 flex-shrink-0 transition-colors
                         focus:outline-none focus:ring-2 focus:ring-red-400 rounded"
                  aria-label="Sposta nel cestino">&#10005;</button>
        </div>
      </template>
    </div>

    <!-- Lista PROTOCOLLATI -->
    <div x-show="vistaLista==='protocollati'" class="space-y-2">
      <template x-for="v in listaProtocollati" :key="v.id">
        <div class="bg-white border border-slate-200 rounded-lg px-4 py-3">
          <div class="flex items-start justify-between gap-3">
            <div class="flex-1 min-w-0">
              <div class="flex items-center gap-2 flex-wrap">
                <span class="text-sm font-semibold text-slate-800"
                      x-text="v.protocollo?.numero ? 'n. ' + v.protocollo.numero : '(numero non inserito)'">
                </span>
                <span class="text-xs text-slate-400"
                      x-text="v.protocollo?.data_protocollo ? formatDataLabel(v.protocollo.data_protocollo) : ''">
                </span>
              </div>
              <p class="text-xs text-slate-500 mt-0.5"
                 x-text="v.data_riunione ? 'Riunione del ' + formatDataLabel(v.data_riunione) : ''">
              </p>
              <p class="text-xs text-slate-400 mt-0.5"
                 x-text="(v.tipi_riunione ?? []).map(t => tipoRiunioneLabel(t)).join(', ')">
              </p>
            </div>
            <!-- Link apertura file via FSA -->
            <div class="flex items-center gap-2 flex-shrink-0">
              <button x-show="v.protocollo?.file_pdf_protocollato"
                      @click="apriFileProt(v.protocollo.file_pdf_protocollato)"
                      class="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800
                             hover:underline focus:outline-none focus:ring-2 focus:ring-blue-500 rounded
                             bg-blue-50 border border-blue-200 px-2 py-1 transition-colors">
                &#128196; PDF
              </button>
              <button x-show="v.protocollo?.file_lettera"
                      @click="apriFileProt(v.protocollo.file_lettera)"
                      class="flex items-center gap-1 text-xs text-slate-600 hover:text-slate-800
                             hover:underline focus:outline-none focus:ring-2 focus:ring-slate-400 rounded
                             bg-slate-50 border border-slate-200 px-2 py-1 transition-colors">
                &#128196; Lettera
              </button>
            </div>
          </div>
        </div>
      </template>
    </div>

  </div>

  <!-- === VISTA EDITOR === -->
  <div x-show="corrente !== null">
    <template x-if="corrente !== null">
      <div>

        <div class="flex justify-end mb-2">
          <span class="text-xs text-slate-400" x-text="salvataggioLabel"></span>
        </div>

        <!-- TABS -->
        <div class="modulo-tabs" role="tablist">
          <button role="tab" class="modulo-tab" :class="{'attiva': scheda === 'dati'}"
                  @click="scheda = 'dati'" :aria-selected="String(scheda === 'dati')">Dati riunione</button>
          <button role="tab" class="modulo-tab" :class="{'attiva': scheda === 'presenti'}"
                  @click="scheda = 'presenti'" :aria-selected="String(scheda === 'presenti')">
            Presenti
            <template x-if="(corrente.presenti_anas.length + corrente.presenti_imprese.length) > 0">
              <span class="ml-1 text-xs bg-blue-100 text-blue-700 rounded-full px-1.5"
                    x-text="corrente.presenti_anas.length + corrente.presenti_imprese.length"></span>
            </template>
          </button>
          <button role="tab" class="modulo-tab" :class="{'attiva': scheda === 'contenuti'}"
                  @click="scheda = 'contenuti'; $nextTick(() => _caricaEditors())"
                  :aria-selected="String(scheda === 'contenuti')">Contenuti</button>
          <button role="tab" class="modulo-tab" :class="{'attiva': scheda === 'firme'}"
                  @click="scheda = 'firme'" :aria-selected="String(scheda === 'firme')">
            Firme
            <template x-if="_firmatariSenzaFirma().length > 0">
              <span class="ml-1 text-xs bg-amber-100 text-amber-700 rounded-full px-1.5"
                    x-text="_firmatariSenzaFirma().length"></span>
            </template>
          </button>
        </div>

        <!-- TAB: DATI RIUNIONE -->
        <div x-show="scheda === 'dati'" role="tabpanel">
          <h3 class="text-sm font-semibold text-slate-600 mb-3">Intestazione (da anagrafica cantiere)</h3>
          <div class="grid grid-cols-2 gap-3 mb-6">
            <div>
              <label class="block text-xs text-slate-500 mb-1">SS / Lotto</label>
              <input type="text" x-model="corrente.intestazione.ss_lotto" @input="_scheduleAutosave()"
                     class="w-full border border-slate-300 rounded-md px-3 py-2 text-sm
                            focus:outline-none focus:ring-2 focus:ring-blue-500">
            </div>
            <div>
              <label class="block text-xs text-slate-500 mb-1">Codice Progetto</label>
              <input type="text" x-model="corrente.intestazione.codice_progetto" @input="_scheduleAutosave()"
                     class="w-full border border-slate-300 rounded-md px-3 py-2 text-sm
                            focus:outline-none focus:ring-2 focus:ring-blue-500">
            </div>
            <div class="col-span-2">
              <label class="block text-xs text-slate-500 mb-1">Lavori</label>
              <input type="text" x-model="corrente.intestazione.lavoro" @input="_scheduleAutosave()"
                     class="w-full border border-slate-300 rounded-md px-3 py-2 text-sm
                            focus:outline-none focus:ring-2 focus:ring-blue-500">
            </div>
            <div>
              <label class="block text-xs text-slate-500 mb-1">Contratto n.</label>
              <input type="text" x-model="corrente.intestazione.contratto" @input="_scheduleAutosave()"
                     class="w-full border border-slate-300 rounded-md px-3 py-2 text-sm
                            focus:outline-none focus:ring-2 focus:ring-blue-500">
            </div>
          </div>

          <h3 class="text-sm font-semibold text-slate-600 mb-3">Dati riunione</h3>
          <div class="grid grid-cols-2 gap-4 mb-4">
            <div>
              <label for="vr-data" class="block text-xs text-slate-500 mb-1">Data riunione</label>
              <input id="vr-data" type="date" x-model="corrente.data_riunione"
                     @change="_scheduleAutosave()"
                     class="w-full border border-slate-300 rounded-md px-3 py-2 text-sm
                            focus:outline-none focus:ring-2 focus:ring-blue-500">
            </div>
            <div>
              <label class="block text-xs text-slate-500 mb-1">Etichetta colonna sinistra presenti</label>
              <input type="text" x-model="corrente.etichetta_anas" @input="_scheduleAutosave()"
                     placeholder="Committente, Resp. Lavori..."
                     class="w-full border border-slate-300 rounded-md px-3 py-2 text-sm
                            focus:outline-none focus:ring-2 focus:ring-blue-500">
            </div>
          </div>

          <fieldset class="mb-4">
            <legend class="text-xs text-slate-500 mb-2">Tipo riunione (spunta multipla)</legend>
            <div class="flex flex-wrap gap-4">
              <template x-for="t in tipiRiunione" :key="t.id">
                <label class="flex items-center gap-2 text-sm cursor-pointer">
                  <input type="checkbox" :value="t.id"
                         :checked="corrente.tipi_riunione.includes(t.id)"
                         @change="corrente.tipi_riunione.includes(t.id)
                           ? corrente.tipi_riunione = corrente.tipi_riunione.filter(x => x !== t.id)
                           : corrente.tipi_riunione.push(t.id); _scheduleAutosave()"
                         class="rounded border-slate-300 text-blue-600 focus:ring-2 focus:ring-blue-500">
                  <span x-text="t.label"></span>
                </label>
              </template>
            </div>
          </fieldset>
        </div><!-- /tab dati -->

        <!-- TAB: PRESENTI -->
        <div x-show="scheda === 'presenti'" role="tabpanel">
          <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">

            <!-- Colonna ANAS -->
            <section>
              <div class="flex items-center justify-between mb-3">
                <h3 class="text-sm font-semibold text-slate-700" x-text="corrente.etichetta_anas || 'Committente'"></h3>
                <button @click="aggiungiPresente('anas')"
                        class="text-xs text-blue-600 hover:text-blue-800 border border-blue-300
                               px-2 py-1 rounded hover:bg-blue-50 transition-colors
                               focus:outline-none focus:ring-2 focus:ring-blue-500">
                  + Aggiungi
                </button>
              </div>
              <div class="space-y-3">
                <template x-for="pres in corrente.presenti_anas" :key="pres.id">
                  <div class="bg-slate-50 border border-slate-200 rounded-lg p-3 space-y-2">
                    <div class="flex justify-between items-start">
                      <p class="text-xs text-slate-400">Presente</p>
                      <button @click="rimuoviPresente('anas', pres.id)"
                              class="text-slate-300 hover:text-red-500 transition-colors
                                     focus:outline-none focus:ring-1 focus:ring-red-400 rounded"
                              aria-label="Rimuovi">&#10005;</button>
                    </div>
                    <select @change="selezionaPersona('anas', pres.id, $event.target.value)"
                            class="w-full text-xs border border-slate-300 rounded px-2 py-1
                                   focus:outline-none focus:ring-2 focus:ring-blue-500">
                      <option value="">-- Da anagrafica o inserisci manuale --</option>
                      <template x-for="pc in personeCommittente" :key="pc.id">
                        <option :value="pc.id"
                                x-text="(pc.cognome ?? '') + ' ' + (pc.nome ?? '') + (pc.qualifica ? ' — ' + pc.qualifica : '')">
                        </option>
                      </template>
                    </select>
                    <div class="grid grid-cols-2 gap-2">
                      <div>
                        <label class="text-xs text-slate-400">Qualifica</label>
                        <input type="text" x-model="pres.qualifica" @input="_scheduleAutosave()"
                               class="w-full mt-0.5 text-sm border border-slate-300 rounded px-2 py-1
                                      focus:outline-none focus:ring-2 focus:ring-blue-500">
                      </div>
                      <div>
                        <label class="text-xs text-slate-400">Cognome e Nome</label>
                        <input type="text" x-model="pres.nome_cognome" @input="_scheduleAutosave()"
                               class="w-full mt-0.5 text-sm border border-slate-300 rounded px-2 py-1
                                      focus:outline-none focus:ring-2 focus:ring-blue-500">
                      </div>
                    </div>
                  </div>
                </template>
                <p x-show="corrente.presenti_anas.length === 0"
                   class="text-xs text-slate-400 italic py-2">Nessun presente aggiunto.</p>
              </div>
            </section>

            <!-- Colonna Imprese -->
            <section>
              <div class="flex items-center justify-between mb-3">
                <h3 class="text-sm font-semibold text-slate-700">Imprese presenti</h3>
                <button @click="aggiungiPresente('imprese')"
                        class="text-xs text-blue-600 hover:text-blue-800 border border-blue-300
                               px-2 py-1 rounded hover:bg-blue-50 transition-colors
                               focus:outline-none focus:ring-2 focus:ring-blue-500">
                  + Aggiungi
                </button>
              </div>
              <div class="space-y-3">
                <template x-for="pres in corrente.presenti_imprese" :key="pres.id">
                  <div class="bg-slate-50 border border-slate-200 rounded-lg p-3 space-y-2">
                    <div class="flex justify-between items-start">
                      <p class="text-xs text-slate-400">Presente impresa</p>
                      <button @click="rimuoviPresente('imprese', pres.id)"
                              class="text-slate-300 hover:text-red-500 transition-colors
                                     focus:outline-none focus:ring-1 focus:ring-red-400 rounded"
                              aria-label="Rimuovi">&#10005;</button>
                    </div>
                    <select @change="selezionaLavoratore(pres.id, $event.target.value)"
                            class="w-full text-xs border border-slate-300 rounded px-2 py-1
                                   focus:outline-none focus:ring-2 focus:ring-blue-500">
                      <option value="">-- Da anagrafica o inserisci manuale --</option>
                      <template x-for="lav in lavoratori" :key="lav.id">
                        <option :value="lav.id"
                                x-text="(lav.cognome ?? '') + ' ' + (lav.nome ?? '') + (lav.impresa_id ? ' [' + nomeImpresa(lav.impresa_id) + ']' : '')">
                        </option>
                      </template>
                    </select>
                    <div class="grid grid-cols-2 gap-2">
                      <div>
                        <label class="text-xs text-slate-400">Qualifica</label>
                        <input type="text" x-model="pres.qualifica" @input="_scheduleAutosave()"
                               class="w-full mt-0.5 text-sm border border-slate-300 rounded px-2 py-1
                                      focus:outline-none focus:ring-2 focus:ring-blue-500">
                      </div>
                      <div>
                        <label class="text-xs text-slate-400">Cognome e Nome</label>
                        <input type="text" x-model="pres.nome_cognome" @input="_scheduleAutosave()"
                               class="w-full mt-0.5 text-sm border border-slate-300 rounded px-2 py-1
                                      focus:outline-none focus:ring-2 focus:ring-blue-500">
                      </div>
                    </div>
                    <div>
                      <label class="text-xs text-slate-400">Impresa</label>
                      <select x-model="pres.impresa_id" @change="_scheduleAutosave()"
                              class="w-full mt-0.5 text-xs border border-slate-300 rounded px-2 py-1
                                     focus:outline-none focus:ring-2 focus:ring-blue-500">
                        <option value="">-- non specificata --</option>
                        <template x-for="imp in imprese" :key="imp.id">
                          <option :value="imp.id" x-text="imp.ragioneSociale"></option>
                        </template>
                      </select>
                    </div>
                  </div>
                </template>
                <p x-show="corrente.presenti_imprese.length === 0"
                   class="text-xs text-slate-400 italic py-2">Nessun presente aggiunto.</p>
              </div>
            </section>

          </div>
        </div><!-- /tab presenti -->

        <!-- TAB: CONTENUTI -->
        <div x-show="scheda === 'contenuti'" role="tabpanel">

          <h3 class="text-sm font-semibold text-slate-700 mb-3">Ordine del giorno</h3>
          <div class="space-y-2 mb-4">
            <template x-for="c in corrente.checklist_argomenti" :key="c.id">
              <div class="flex items-start gap-2">
                <input type="checkbox" x-model="c.spuntato" @change="_scheduleAutosave()"
                       class="mt-2.5 rounded border-slate-300 text-blue-600 focus:ring-2 focus:ring-blue-500 flex-shrink-0">
                <div class="flex-1 min-w-0">
                  <input type="text" x-model="c.testo" @input="_scheduleAutosave()"
                         class="w-full text-sm border border-slate-200 rounded px-2 py-1 bg-transparent
                                hover:bg-white focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                         :class="c.spuntato ? 'font-medium' : 'text-slate-500'">
                  <template x-if="c.testo && c.testo.includes('___')">
                    <select x-model="c.impresa_id" @change="_scheduleAutosave()"
                            class="mt-1 w-full text-xs border border-slate-200 rounded px-2 py-1
                                   focus:outline-none focus:ring-2 focus:ring-blue-500">
                      <option value="">-- impresa: inserisci nel testo o seleziona --</option>
                      <template x-for="imp in imprese" :key="imp.id">
                        <option :value="imp.id" x-text="imp.ragioneSociale"></option>
                      </template>
                    </select>
                  </template>
                </div>
                <button @click="rimuoviVoceChecklist(c.id)"
                        class="text-slate-300 hover:text-red-400 mt-2 flex-shrink-0 transition-colors
                               focus:outline-none focus:ring-1 focus:ring-red-400 rounded"
                        aria-label="Rimuovi voce">&#10005;</button>
              </div>
            </template>
            <button @click="aggiungiVoceChecklist()"
                    class="text-xs text-blue-600 hover:text-blue-800 mt-1 focus:outline-none focus:underline">
              + Aggiungi voce
            </button>
          </div>

          <h3 class="text-sm font-semibold text-slate-700 mb-2">Svolgimento della riunione</h3>
          <p class="text-xs text-slate-400 mb-2">Narrazione di quanto discusso, concordato e rilevato.</p>
          <div class="editor-ricco-wrapper mb-6">
            <div class="editor-toolbar" role="toolbar" aria-label="Formattazione testo">
              <button type="button" @mousedown.prevent="edBold('ed-racconto')" title="Grassetto"><strong>B</strong></button>
              <button type="button" @mousedown.prevent="edItalic('ed-racconto')" title="Corsivo"><em>I</em></button>
              <div class="sep"></div>
              <button type="button" @mousedown.prevent="edAllinea('ed-racconto','l')" title="Sinistra">&#8678;</button>
              <button type="button" @mousedown.prevent="edAllinea('ed-racconto','c')" title="Centra">&#9675;</button>
              <button type="button" @mousedown.prevent="edAllinea('ed-racconto','r')" title="Destra">&#8680;</button>
            </div>
            <div id="ed-racconto" contenteditable="true" role="textbox" aria-multiline="true"
                 aria-label="Svolgimento della riunione"
                 @input.debounce.300ms="onEditorInput('ed-racconto')"
                 @paste.prevent="onEditorPaste('ed-racconto', $event)"
                 class="editor-area"></div>
          </div>

          <h3 class="text-sm font-semibold text-slate-700 mb-2">Criticità riscontrate ed Osservazioni Emerse</h3>
          <div class="editor-ricco-wrapper mb-6">
            <div class="editor-toolbar" role="toolbar">
              <button type="button" @mousedown.prevent="edBold('ed-criticita')"><strong>B</strong></button>
              <button type="button" @mousedown.prevent="edItalic('ed-criticita')"><em>I</em></button>
              <div class="sep"></div>
              <button type="button" @mousedown.prevent="edAllinea('ed-criticita','l')">&#8678;</button>
              <button type="button" @mousedown.prevent="edAllinea('ed-criticita','c')">&#9675;</button>
              <button type="button" @mousedown.prevent="edAllinea('ed-criticita','r')">&#8680;</button>
            </div>
            <div id="ed-criticita" contenteditable="true" role="textbox" aria-multiline="true"
                 aria-label="Criticità riscontrate"
                 @input.debounce.300ms="onEditorInput('ed-criticita')"
                 @paste.prevent="onEditorPaste('ed-criticita', $event)"
                 class="editor-area"></div>
          </div>

          <h3 class="text-sm font-semibold text-slate-700 mb-2">Istruzioni operative e Decisioni Intraprese</h3>
          <div class="editor-ricco-wrapper mb-4">
            <div class="editor-toolbar" role="toolbar">
              <button type="button" @mousedown.prevent="edBold('ed-istruzioni')"><strong>B</strong></button>
              <button type="button" @mousedown.prevent="edItalic('ed-istruzioni')"><em>I</em></button>
              <div class="sep"></div>
              <button type="button" @mousedown.prevent="edAllinea('ed-istruzioni','l')">&#8678;</button>
              <button type="button" @mousedown.prevent="edAllinea('ed-istruzioni','c')">&#9675;</button>
              <button type="button" @mousedown.prevent="edAllinea('ed-istruzioni','r')">&#8680;</button>
            </div>
            <div id="ed-istruzioni" contenteditable="true" role="textbox" aria-multiline="true"
                 aria-label="Istruzioni operative e Decisioni"
                 @input.debounce.300ms="onEditorInput('ed-istruzioni')"
                 @paste.prevent="onEditorPaste('ed-istruzioni', $event)"
                 class="editor-area"></div>
          </div>

        </div><!-- /tab contenuti -->

        <!-- TAB: FIRME -->
        <div x-show="scheda === 'firme'" role="tabpanel">

          <template x-if="_firmatariSenzaFirma().length > 0">
            <div class="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 mb-4 text-sm text-amber-800">
              <strong>Firme mancanti:</strong>
              <span x-text="_firmatariSenzaFirma().join(', ')"></span>
              <span class="text-xs ml-1 text-amber-600">(non bloccante)</span>
            </div>
          </template>

          <h3 class="text-sm font-semibold text-slate-700 mb-3"
              x-text="(corrente.etichetta_anas || 'Committente') + ' — presenti'"></h3>
          <div class="space-y-4 mb-6">
            <template x-for="pres in corrente.presenti_anas" :key="pres.id">
              <div class="bg-white border border-slate-200 rounded-lg p-4">
                <div class="flex items-start justify-between mb-3">
                  <div>
                    <p class="text-sm font-medium" x-text="pres.nome_cognome || '(nome non inserito)'"></p>
                    <p class="text-xs text-slate-500" x-text="pres.qualifica"></p>
                  </div>
                  <label class="flex items-center gap-1 text-xs text-slate-500 cursor-pointer">
                    <input type="checkbox" :checked="pres.rifiuto_firma"
                           @change="rifiutaFirma('anas', pres.id)" class="rounded border-slate-300">
                    Rifiuta firma
                  </label>
                </div>
                <div x-show="!pres.rifiuto_firma">
                  <template x-if="pres.firma_png_base64">
                    <div class="flex items-center gap-3">
                      <img :src="pres.firma_png_base64" class="h-10 border rounded bg-white" alt="firma">
                      <span class="text-xs text-green-600">&#10003; Firmato</span>
                      <button @click="rimuoviFirma('anas', pres.id)"
                              class="text-xs text-slate-400 hover:text-red-500 underline">Rimuovi</button>
                    </div>
                  </template>
                  <template x-if="!pres.firma_png_base64">
                    <div class="flex gap-2 flex-wrap">
                      <button @click="apriCanvasFirma('anas', pres.id)"
                              class="text-xs bg-blue-50 text-blue-700 border border-blue-200 px-3 py-1.5
                                     rounded hover:bg-blue-100 transition-colors
                                     focus:outline-none focus:ring-2 focus:ring-blue-500">
                        &#9997; Firma con canvas
                      </button>
                      <label class="text-xs bg-slate-50 text-slate-700 border border-slate-200 px-3 py-1.5
                                    rounded hover:bg-slate-100 cursor-pointer transition-colors">
                        &#128206; Carica PNG
                        <input type="file" accept=".png,image/png" class="sr-only"
                               @change="onUploadFirma('anas', pres.id, $event)">
                      </label>
                    </div>
                  </template>
                </div>
                <p x-show="pres.rifiuto_firma" class="text-xs text-amber-600 italic">Firma rifiutata.</p>
              </div>
            </template>
            <p x-show="corrente.presenti_anas.length === 0" class="text-xs text-slate-400 italic">
              Nessun presente — aggiungili nella tab Presenti.
            </p>
          </div>

          <h3 class="text-sm font-semibold text-slate-700 mb-3">Imprese presenti — firme</h3>
          <div class="space-y-4 mb-6">
            <template x-for="pres in corrente.presenti_imprese" :key="pres.id">
              <div class="bg-white border border-slate-200 rounded-lg p-4">
                <div class="flex items-start justify-between mb-3">
                  <div>
                    <p class="text-sm font-medium" x-text="pres.nome_cognome || '(nome non inserito)'"></p>
                    <p class="text-xs text-slate-500">
                      <span x-text="pres.qualifica"></span>
                      <template x-if="pres.impresa_id">
                        <span> — <em x-text="nomeImpresa(pres.impresa_id)"></em></span>
                      </template>
                    </p>
                  </div>
                  <label class="flex items-center gap-1 text-xs text-slate-500 cursor-pointer">
                    <input type="checkbox" :checked="pres.rifiuto_firma"
                           @change="rifiutaFirma('imprese', pres.id)" class="rounded border-slate-300">
                    Rifiuta firma
                  </label>
                </div>
                <div x-show="!pres.rifiuto_firma">
                  <template x-if="pres.firma_png_base64">
                    <div class="flex items-center gap-3">
                      <img :src="pres.firma_png_base64" class="h-10 border rounded bg-white" alt="firma">
                      <span class="text-xs text-green-600">&#10003; Firmato</span>
                      <button @click="rimuoviFirma('imprese', pres.id)"
                              class="text-xs text-slate-400 hover:text-red-500 underline">Rimuovi</button>
                    </div>
                  </template>
                  <template x-if="!pres.firma_png_base64">
                    <div class="flex gap-2 flex-wrap">
                      <button @click="apriCanvasFirma('imprese', pres.id)"
                              class="text-xs bg-blue-50 text-blue-700 border border-blue-200 px-3 py-1.5
                                     rounded hover:bg-blue-100 transition-colors
                                     focus:outline-none focus:ring-2 focus:ring-blue-500">
                        &#9997; Firma con canvas
                      </button>
                      <label class="text-xs bg-slate-50 text-slate-700 border border-slate-200 px-3 py-1.5
                                    rounded hover:bg-slate-100 cursor-pointer transition-colors">
                        &#128206; Carica PNG
                        <input type="file" accept=".png,image/png" class="sr-only"
                               @change="onUploadFirma('imprese', pres.id, $event)">
                      </label>
                    </div>
                  </template>
                </div>
                <p x-show="pres.rifiuto_firma" class="text-xs text-amber-600 italic">Firma rifiutata.</p>
              </div>
            </template>
            <p x-show="corrente.presenti_imprese.length === 0" class="text-xs text-slate-400 italic">
              Nessun presente imprese — aggiungili nella tab Presenti.
            </p>
          </div>

          <!-- CSE fisso in fondo -->
          <div class="border-t border-slate-200 pt-4">
            <h3 class="text-sm font-semibold text-slate-700 mb-3">CSE — Coordinatore Sicurezza in fase di Esecuzione</h3>
            <div class="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <div class="mb-3">
                <p class="text-sm font-medium"
                   x-text="corrente.firma_cse.nome_cognome || '(identità non configurata in Impostazioni)'"></p>
                <p class="text-xs text-slate-600" x-text="corrente.firma_cse.qualifica"></p>
                <template x-if="corrente.firma_cse.tipo_firma === 'permanente'">
                  <p class="text-xs text-blue-500 mt-0.5">Firma permanente da Impostazioni.</p>
                </template>
              </div>
              <template x-if="corrente.firma_cse.firma_png_base64">
                <div class="flex items-center gap-3 mb-2">
                  <img :src="corrente.firma_cse.firma_png_base64" class="h-10 border rounded bg-white" alt="firma CSE">
                  <span class="text-xs text-green-600">&#10003; Firmato</span>
                  <button @click="rimuoviFirma('cse', null)"
                          class="text-xs text-slate-400 hover:text-red-500 underline">Sostituisci</button>
                </div>
              </template>
              <template x-if="!corrente.firma_cse.firma_png_base64">
                <div class="flex gap-2 flex-wrap">
                  <button @click="apriCanvasFirma('cse', null)"
                          class="text-xs bg-blue-600 text-white px-3 py-1.5 rounded
                                 hover:bg-blue-700 transition-colors
                                 focus:outline-none focus:ring-2 focus:ring-blue-500">
                    &#9997; Firma con canvas
                  </button>
                  <label class="text-xs bg-white text-blue-700 border border-blue-300 px-3 py-1.5
                                rounded hover:bg-blue-50 cursor-pointer transition-colors">
                    &#128206; Carica PNG
                    <input type="file" accept=".png,image/png" class="sr-only"
                           @change="onUploadFirma('cse', null, $event)">
                  </label>
                </div>
              </template>
            </div>
          </div>

        </div><!-- /tab firme -->

        <!-- FOOTER AZIONI -->
        <div class="fixed bottom-0 left-0 right-0 bg-white border-t border-slate-200
                    px-6 py-4 flex flex-wrap items-center justify-between gap-3 z-50"
             style="left: var(--nav-width, 220px);">
          <button @click="chiudiEditor()"
                  class="text-sm text-slate-500 hover:text-slate-700 px-4 py-2
                         border border-slate-300 rounded-lg transition-colors
                         focus:outline-none focus:ring-2 focus:ring-slate-400">
            &#8592; Torna alla lista
          </button>
          <div class="flex gap-2 flex-wrap">
            <button x-show="corrente.stato !== 'PROTOCOLLATO'" @click="salva()" :disabled="generando"
                    class="text-sm text-slate-700 border border-slate-300 px-4 py-2 rounded-lg
                           hover:bg-slate-50 transition-colors disabled:opacity-40
                           focus:outline-none focus:ring-2 focus:ring-slate-400">
              Salva bozza
            </button>
            <button x-show="corrente.stato !== 'PROTOCOLLATO'" @click="apriAnteprima()" :disabled="generando"
                    class="text-sm text-slate-700 border border-slate-300 px-4 py-2 rounded-lg
                           hover:bg-slate-50 transition-colors disabled:opacity-40
                           focus:outline-none focus:ring-2 focus:ring-slate-400">
              Anteprima
            </button>
            <button x-show="corrente.stato === 'BOZZA'" @click="finalizza()" :disabled="generando"
                    class="bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white
                           text-sm font-medium px-5 py-2 rounded-lg transition-colors
                           focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2">
              <span x-text="generando ? 'Generazione...' : 'Finalizza'"></span>
            </button>
            <button x-show="corrente.stato === 'FINALIZZATO_DA_PROTOCOLLARE'"
                    @click="scaricaDocx()" :disabled="generando"
                    class="bg-green-600 hover:bg-green-700 disabled:opacity-40 text-white
                           text-sm font-medium px-5 py-2 rounded-lg transition-colors
                           focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2">
              <span x-text="generando ? 'Generazione...' : '&#8595; Scarica DOCX'"></span>
            </button>
            <button x-show="corrente.stato === 'FINALIZZATO_DA_PROTOCOLLARE'"
                    @click="drawerProtocolloAperto = true"
                    class="text-sm text-slate-700 border border-slate-300 px-4 py-2 rounded-lg
                           hover:bg-slate-50 transition-colors
                           focus:outline-none focus:ring-2 focus:ring-slate-400">
              Protocolla
            </button>
          </div>
        </div>

      </div>
    </template>
  </div><!-- /editor -->

  <!-- === MODAL CANVAS FIRMA === -->
  <div x-show="firmaModal !== null" x-transition.opacity
       class="fixed inset-0 z-[200] flex items-center justify-center bg-black/40 p-4"
       @keydown.escape.window="firmaModal = null">
    <template x-if="firmaModal !== null">
      <div class="bg-white rounded-xl shadow-2xl p-5 w-full max-w-md"
           x-data="FirmaCanvas()"
           x-init="init()"
           role="dialog" aria-modal="true" aria-label="Canvas firma">
        <h3 class="text-sm font-semibold text-slate-800 mb-3">Traccia firma</h3>
        <p class="text-xs text-slate-400 mb-3">Usa il mouse o il dito sull'area qui sotto.</p>
        <canvas x-ref="canvas" class="firma-canvas-area"
                @pointerdown="startDraw($event)" @pointermove="draw($event)"
                @pointerup="endDraw()" @pointercancel="endDraw()"></canvas>
        <div class="flex gap-2 mt-3 justify-end">
          <button @click="pulisci()"
                  class="text-sm text-slate-500 border border-slate-300 px-3 py-1.5 rounded-lg
                         hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-slate-400">
            Pulisci
          </button>
          <button @click="annulla()"
                  class="text-sm text-slate-500 border border-slate-300 px-3 py-1.5 rounded-lg
                         hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-slate-400">
            Annulla
          </button>
          <button @click="usa()"
                  class="text-sm bg-blue-600 text-white px-4 py-1.5 rounded-lg
                         hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500">
            Usa firma
          </button>
        </div>
      </div>
    </template>
  </div>

  <!-- === DRAWER PROTOCOLLAZIONE === -->
  <div x-show="drawerProtocolloAperto" class="drawer-backdrop"
       @click="drawerProtocolloAperto = false"></div>
  <div x-show="drawerProtocolloAperto" x-transition.opacity
       class="drawer" role="dialog" aria-modal="true" aria-label="Protocollazione verbale">
    <div class="drawer-header px-5 py-4 border-b border-slate-200 flex items-center justify-between">
      <h3 class="font-semibold text-slate-800">Protocolla verbale</h3>
      <button @click="drawerProtocolloAperto = false"
              class="text-slate-400 hover:text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500 rounded"
              aria-label="Chiudi">&#10005;</button>
    </div>
    <div class="drawer-body px-5 py-4 space-y-4">
      <p class="text-xs text-slate-500">
        Inserisci il numero di protocollo e carica il PDF ricevuto dai superiori.
        La lettera di trasmissione è facoltativa.
      </p>
      <div>
        <label for="proto-numero" class="block text-xs font-medium text-slate-600 mb-1">
          Numero protocollo <span class="text-red-500">*</span>
        </label>
        <input id="proto-numero" type="text" x-model="proto.numero" placeholder="es. 2026/001"
               class="w-full border border-slate-300 rounded-md px-3 py-2 text-sm
                      focus:outline-none focus:ring-2 focus:ring-blue-500">
      </div>
      <div>
        <label for="proto-data" class="block text-xs font-medium text-slate-600 mb-1">Data protocollo</label>
        <input id="proto-data" type="date" x-model="proto.data"
               class="w-full border border-slate-300 rounded-md px-3 py-2 text-sm
                      focus:outline-none focus:ring-2 focus:ring-blue-500">
      </div>
      <div>
        <label class="block text-xs font-medium text-slate-600 mb-1">PDF protocollato</label>
        <input type="file" accept=".pdf" @change="onProtoPdfFile($event)"
               class="text-sm text-slate-500 file:mr-3 file:py-1.5 file:px-3
                      file:rounded file:border file:border-slate-300 file:text-xs
                      file:bg-slate-50 file:text-slate-700 hover:file:bg-slate-100">
        <p x-show="proto._pdfFile" class="text-xs text-green-600 mt-1"
           x-text="'&#10003; ' + (proto._pdfFile?.name ?? '')"></p>
      </div>
      <div>
        <label class="block text-xs font-medium text-slate-600 mb-1">Lettera di trasmissione (facoltativa)</label>
        <input type="file" accept=".pdf" @change="onProtoLettFile($event)"
               class="text-sm text-slate-500 file:mr-3 file:py-1.5 file:px-3
                      file:rounded file:border file:border-slate-300 file:text-xs
                      file:bg-slate-50 file:text-slate-700 hover:file:bg-slate-100">
        <p x-show="proto._letteraFile" class="text-xs text-green-600 mt-1"
           x-text="'&#10003; ' + (proto._letteraFile?.name ?? '')"></p>
      </div>
    </div>
    <div class="drawer-footer px-5 py-4 border-t border-slate-200 bg-slate-50">
      <p class="text-xs text-slate-400 mb-3">
        Dopo la protocollazione il verbale diventa immutabile e viene spostato in Protocollati/.
      </p>
      <div class="flex gap-3 justify-end">
        <button @click="drawerProtocolloAperto = false"
                class="text-sm text-slate-500 hover:text-slate-700 px-4 py-2
                       border border-slate-300 rounded-lg transition-colors
                       focus:outline-none focus:ring-2 focus:ring-slate-400">
          Annulla
        </button>
        <button @click="salvaProtocollo()" :disabled="proto.salvando"
                class="bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white
                       text-sm font-medium px-5 py-2 rounded-lg transition-colors
                       focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2">
          <span x-text="proto.salvando ? 'Archiviazione...' : 'Salva e protocolla'"></span>
        </button>
      </div>
    </div>
  </div>

</div>
`;

// ── Registrazione ─────────────────────────────────────────────────────────────

window.MODULI_REGISTRATI = window.MODULI_REGISTRATI ?? {};
window.MODULI_REGISTRATI['verbale-riunione'] = {
  monta(contenitore) {
    contenitore.innerHTML = _TEMPLATE_VR;
  },
};
