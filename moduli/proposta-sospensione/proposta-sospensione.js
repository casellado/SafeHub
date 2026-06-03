/**
 * proposta-sospensione.js — Proposta di Sospensione/Allontanamento del CSE (Mod.RE.01-14)
 * Secondo documento del Flusso B. Lettera formale ex art. 92 c.1 lett. e) D.Lgs 81/08.
 *
 * Pattern identico al pilota Verbale di Riunione (v0.6.0):
 *   ciclo BOZZA→FINALIZZATO_DA_PROTOCOLLARE→PROTOCOLLATO, vista Protocollati con toggle e
 *   link FSA, editor ricco, firma CSE da M2, auto-save, promemoria normativo.
 *
  * ridefinite qui (duplicazione temporanea accettata per non toccare il verbale collaudato).
  *
 * Storage: 04_Proposte-Sospensione-CSE/Bozze/<uuid>.json + Protocollati/<numero>.json
 * M6 e template NON si toccano.
 */

'use strict';

// ── Costanti ─────────────────────────────────────────────────────────────────

const NOTE_NORMATIVE_PS = {
  'proposta-sospensione': [
    {
      titolo: 'Riferimento normativo — art. 92 c.1 lett. e)',
      testo:  'Questo modulo è una PROPOSTA al Responsabile dei Lavori. ' +
              'Il CSE segnala le gravi inosservanze e propone il provvedimento; ' +
              'è il RL che decide e dispone. Il CSE non ha potere esecutivo diretto ' +
              'con questa lettera (quello è della lett. f, vedi sotto).',
    },
    {
      titolo: 'Distinzione lett. e) vs lett. f)',
      testo:  'Lett. e) = PROPOSTA al RL (questo modulo). ' +
              'Lett. f) = sospensione DIRETTA delle singole lavorazioni da parte del CSE ' +
              'in caso di pericolo grave e imminente direttamente riscontrato, senza dover ' +
              'passare dal RL. Due atti diversi: non confonderli.',
    },
    {
      titolo: 'Trasmissione e conservazione',
      testo:  'Destinatari: Responsabile dei Lavori (principale); per conoscenza a DL e RUP ' +
              '(se figura diversa dal RL). Conservare copia. Trasmissione tracciabile (PEC / ' +
              'protocollo). La proposta richiama una contestazione/NC precedente: ' +
              'indicare numero e data.',
    },
  ],
};


// Helper: restituisce l'intestazione modulo con override dei placeholder errati di M2.
// Il ?? non basta perché i vecchi placeholder sono stringhe truthy (non null).
// Necessario finché l'ambiente non ha il config M2 aggiornato ai valori Mod.RE.01-14.
const _VECCHI_PLACEHOLDER_PS = new Set([
  'Mod.PS.01', 'Rev.1 — 2026',
  'Proposta di sospensione lavori',
  'Proposta di sospensione/allontanamento del CSE',  // vecchio titolo abbreviato
]);
function _intestazionePS() {
  const m   = IMPOSTAZIONI_SERVICE.modulo('proposta-sospensione');
  const _ok = (v, def) => (!v || _VECCHI_PLACEHOLDER_PS.has(v)) ? def : v;
  return {
    modulo_titolo:   _ok(m.titolo,   'Proposta di sospensione/allontanamento del Coordinatore per la Sicurezza in fase di Esecuzione'),
    modulo_codice:   _ok(m.codice,   'Mod.RE.01-14'),
    modulo_versione: _ok(m.versione, 'Vers.3.0 del 22.01.2024'),
    logo_aziendale:  IMPOSTAZIONI_SERVICE.logo().png_base64 ?? null,
  };
}

// ── PropostaSospensione Alpine component ─────────────────────────────────────

function PropostaSospensione() {
  return {
    lista: [], listaProtocollati: [], vistaLista: 'bozze', caricamento: false,
    corrente: null, scheda: 'documento', generando: false,
    _autosaveTimer: null, _statoSalvataggio: 'salvato',
    noteAperte: false, firmaModal: null, drawerProtocolloAperto: false,
    proto: { numero: '', data: '', _pdfFile: null, _letteraFile: null, salvando: false },

    // Accessori per il template ($root)
    _docxBlob: null,
    get notePS()             { return NOTE_NORMATIVE_PS['proposta-sospensione']; },
    get imprese()            { return ANAGRAFICA_SERVICE.get('imprese') ?? []; },
    get personeCommittente() { return ANAGRAFICA_SERVICE.get('persone_committente') ?? []; },
    formatDataLabel(d)       { return UTILS.formatData(d) ?? d; },

    // ── Lifecycle ──────────────────────────────────────────────────────────

    async init() {
      await this._caricaLista();
      document.addEventListener('cantiere-cambiato', () => {
        this.corrente = null;
        this.vistaLista = 'bozze';
        this.listaProtocollati = [];
        this._caricaLista();
      });
    },

    // ── Lista bozze ────────────────────────────────────────────────────────

    async _caricaLista() {
      const cantId = Alpine.store('cantiere').id;
      if (!cantId) { this.lista = []; return; }
      this.caricamento = true;
      try {
        const root = FILESYSTEM.getHandleAttivo();
        if (!root) return;
        const bDir = await FILESYSTEM.navigaPercorso(
          await root.getDirectoryHandle(cantId),
          ['04_Proposte-Sospensione-CSE', 'Bozze'], true
        );
        const voci = [];
        for await (const [nome] of bDir.entries()) {
          if (!nome.endsWith('.json')) continue;
          try { const d = await FILESYSTEM.leggiJson(bDir, nome); if (!d._cestino) voci.push(d); }
          catch { /* skip */ }
        }
        voci.sort((a, b) => (b.aggiornato_il ?? '').localeCompare(a.aggiornato_il ?? ''));
        this.lista = voci;
      } catch (err) {
        ERRORI.gestisciErrore('proposta-sospensione/carica-lista', err);
      } finally { this.caricamento = false; }
    },

    // ── Lista protocollati ─────────────────────────────────────────────────

    async _caricaProtocollati() {
      const cantId = Alpine.store('cantiere').id;
      if (!cantId) { this.listaProtocollati = []; return; }
      this.caricamento = true;
      try {
        const root = FILESYSTEM.getHandleAttivo();
        let prtDir;
        try {
          prtDir = await FILESYSTEM.navigaPercorso(
            await root.getDirectoryHandle(cantId),
            ['04_Proposte-Sospensione-CSE', 'Protocollati'], false
          );
        } catch (e) {
          if (e.name === 'NotFoundError') { this.listaProtocollati = []; return; }
          throw e;
        }
        const voci = [];
        for await (const [nome] of prtDir.entries()) {
          if (!nome.endsWith('.json')) continue;
          try { const d = await FILESYSTEM.leggiJson(prtDir, nome); if (!d._cestino) voci.push(d); }
          catch { /* skip */ }
        }
        voci.sort((a, b) =>
          (b.protocollo?.data_protocollo ?? '').localeCompare(a.protocollo?.data_protocollo ?? '') ||
          (b.protocollo?.numero ?? '').localeCompare(a.protocollo?.numero ?? '')
        );
        this.listaProtocollati = voci;
      } catch (err) {
        ERRORI.gestisciErrore('proposta-sospensione/carica-protocollati', err);
        this.listaProtocollati = [];
      } finally { this.caricamento = false; }
    },

    async apriFileProt(filename) {
      if (!filename) return;
      try {
        const cantId = Alpine.store('cantiere').id;
        const prtDir = await FILESYSTEM.navigaPercorso(
          await FILESYSTEM.getHandleAttivo().getDirectoryHandle(cantId),
          ['04_Proposte-Sospensione-CSE', 'Protocollati']
        );
        const fh = await prtDir.getFileHandle(filename);
        const url = URL.createObjectURL(await fh.getFile());
        window.open(url, '_blank');
        setTimeout(() => URL.revokeObjectURL(url), 60000);
      } catch (err) { ERRORI.gestisciErrore('proposta-sospensione/apri-file-prot', err); }
    },

    // ── Nuovo documento ────────────────────────────────────────────────────

    async nuovo() {
      const cantiere = Alpine.store('cantiere');
      if (!cantiere.id) return;

      await ANAGRAFICA_SERVICE.carica(cantiere.id);

      const cse   = IMPOSTAZIONI_SERVICE.cse();
      const firm  = IMPOSTAZIONI_SERVICE.firma();
      const dati  = ANAGRAFICA_SERVICE.dati;
      const lotto = dati?.lotto ?? {};

      // Risolve DL e RUP da ruoli_istituzionali → persone_committente
      const _resPersona = (id) => {
        if (!id) return '';
        const pc = ANAGRAFICA_SERVICE.getEntita('persone_committente', id);
        if (!pc) return '';
        return [pc.qualifica, pc.cognome, pc.nome].filter(Boolean).join(' ');
      };

      const dlId  = lotto.ruoli_istituzionali?.dlId  ?? null;
      const rupId = lotto.ruoli_istituzionali?.rupId ?? null;

      this.corrente = {
        id:          UTILS.uuid(),
        tipo_file:   'proposta_sospensione',
        cantiere_id: cantiere.id ?? '',
        stato:       'BOZZA',
        numero_progressivo: null,
        creato_il:    new Date().toISOString(),
        aggiornato_il: new Date().toISOString(),

        luogo_data: '',

        intestazione: {
          ss:          lotto.ssNumero       ?? lotto.progressivaInizio ?? '',
          cod_ppm_sil: lotto.codicePpmSil   ?? lotto.commessaNumero    ?? '',
          lavori:      lotto.nome           ?? '',
        },

        destinatari: {
          dl_id:    dlId,
          rup_id:   rupId,
          dl_testo:  _resPersona(dlId),
          rup_testo: _resPersona(rupId),
        },

        // TODO M14: quando esiste il modulo Non Conformità, sostituire i due campi manuali
        // contestazione.numero e contestazione.data con una select/tendina delle NC del cantiere,
        // ordinate per DATA DECRESCENTE (più recente in cima), che precompila numero e data.
        // Per ora: input manuali.
        contestazione: { numero: '', data: '' },

        provvedimenti: {
          sospensione_lavori:        false,
          allontanamento_imprese:    { flag: false, valore: '', impresa_id: null },
          allontanamento_lav_autonomi:{ flag: false, valore: '', rif_id: null   },
          risoluzione_contratto:     { flag: false, valore: '', rif_id: null    },
        },

        inosservanze: {
          art_94: false, art_95: false, art_96: false,
          art_97_c1: false, prescrizioni_art_100: false,
        },

        relativamente_a: '',

        firma_cse: {
          qualifica:        cse.qualifica    ?? 'Coordinatore Sicurezza in fase di Esecuzione',
          nome_cognome:     cse.nome_cognome ?? '',
          firma_png_base64: firm.firma_png_base64 ?? null,
          tipo_firma:       firm.firma_png_base64 ? 'permanente' : null,
          timestamp_firma:  firm.acquisita_il ?? null,
        },

        protocollo: null,
      };

      this.scheda = 'documento';
      this._statoSalvataggio = 'non_salvato';
      this.$nextTick(() => this._caricaEditors());
    },

    // ── Apri bozza ────────────────────────────────────────────────────────

    async apri(id) {
      try {
        const dir = await this._bozzeDir();
        this.corrente = await FILESYSTEM.leggiJson(dir, `${id}.json`);
        this.scheda   = 'documento';
        this._statoSalvataggio = 'salvato';
        this.$nextTick(() => this._caricaEditors());
      } catch (err) { ERRORI.gestisciErrore('proposta-sospensione/apri', err); }
    },

    chiudiEditor() {
      clearTimeout(this._autosaveTimer);
      this.corrente = null;
      this.drawerProtocolloAperto = false;
    },

    // ── Salvataggio ───────────────────────────────────────────────────────

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
        ERRORI.gestisciErrore('proposta-sospensione/salva', err);
      }
    },

    _scheduleAutosave() {
      this._statoSalvataggio = 'modificato';
      clearTimeout(this._autosaveTimer);
      this._autosaveTimer = setTimeout(() => this.salva(), 8000);
    },

    // ── Cestino ───────────────────────────────────────────────────────────

    async cestina(id) {
      if (!confirm('Spostare la proposta nel cestino?')) return;
      try {
        const dir = await this._bozzeDir();
        const d   = await FILESYSTEM.leggiJson(dir, `${id}.json`);
        await FILESYSTEM.scriviJson(dir, `${id}.json`,
          { ...d, _cestino: true, _eliminato_il: new Date().toISOString() });
        this.lista = this.lista.filter(v => v.id !== id);
        if (this.corrente?.id === id) this.corrente = null;
        NOTIFICHE.successo('Spostato nel cestino', 'La proposta può essere ripristinata.');
      } catch (err) { ERRORI.gestisciErrore('proposta-sospensione/cestina', err); }
    },

    // ── Selezione impresa da anagrafica per provvedimenti ──────────────────

    selezionaImpresaProvvedimento(campo, impresaId) {
      if (!impresaId || !this.corrente) return;
      const imp = ANAGRAFICA_SERVICE.getEntita('imprese', impresaId);
      if (imp) {
        this.corrente.provvedimenti[campo].impresa_id = impresaId;
        this.corrente.provvedimenti[campo].valore     = imp.ragioneSociale ?? '';
      }
      this._scheduleAutosave();
    },

    // ── Editor ricco ──────────────────────────────────────────────────────

    _caricaEditors() {
      const el = document.getElementById('ed-relativ');
      if (el) el.innerHTML = _editorFromHtml(this.corrente?.relativamente_a ?? '');
    },

    edBoldPS(id)      { this._edCmdPS(id, 'bold'); },
    edItalicPS(id)    { this._edCmdPS(id, 'italic'); },
    edAllineaPS(id,d) { this._edCmdPS(id, { l:'justifyLeft', c:'justifyCenter', r:'justifyRight' }[d]); },

    _edCmdPS(id, cmd) {
      const el = document.getElementById(id);
      if (!el) return;
      el.focus(); document.execCommand(cmd, false);
      const el2 = document.getElementById(id);
      if (el2) this.corrente.relativamente_a = _serEditor(el2);
      this._scheduleAutosave();
    },

    onEditorInputPS(id) {
      const el = document.getElementById(id);
      if (el) this.corrente.relativamente_a = _serEditor(el);
      this._scheduleAutosave();
    },

    onEditorPastePS(id, e) {
      e.preventDefault();
      document.execCommand('insertText', false, e.clipboardData.getData('text/plain'));
      const el = document.getElementById(id);
      if (el) this.corrente.relativamente_a = _serEditor(el);
      this._scheduleAutosave();
    },

    // ── Firma CSE ─────────────────────────────────────────────────────────

    apriCanvasFirma() { this.firmaModal = true; },

    onFirmaAcquisita(png) {
      if (!this.corrente) { this.firmaModal = null; return; }
      this.corrente.firma_cse.firma_png_base64 = png;
      this.corrente.firma_cse.tipo_firma      = 'canvas';
      this.corrente.firma_cse.timestamp_firma = new Date().toISOString();
      this.firmaModal = null;
      this._scheduleAutosave();
    },

    async onUploadFirma(e) {
      const file = e.target.files?.[0];
      if (!file || !this.corrente) return;
      const png = await _leggiBase64(file);
      this.corrente.firma_cse.firma_png_base64 = png;
      this.corrente.firma_cse.tipo_firma      = 'upload';
      this.corrente.firma_cse.timestamp_firma = new Date().toISOString();
      e.target.value = '';
      this._scheduleAutosave();
    },

    rimuoviFirma() {
      if (!this.corrente) return;
      this.corrente.firma_cse.firma_png_base64 = null;
      this.corrente.firma_cse.tipo_firma      = null;
      this.corrente.firma_cse.timestamp_firma = null;
      this._scheduleAutosave();
    },

    // ── Finalizzazione ────────────────────────────────────────────────────

    async finalizza() {
      if (!this.corrente) return;
      if (!this.corrente.firma_cse.firma_png_base64) {
        const ok = confirm('Firma CSE mancante. Puoi finalizzare comunque. Procedere?');
        if (!ok) return;
      }
      this.generando = true;
      try {
        const corpo  = await generaCorpoHtmlPropostaSospensione(this.corrente);
        const out    = await MOTORE_DOCX.generaDocumento({
          tipo: 'proposta-sospensione',
          header: _intestazionePS(),
          corpo_html: corpo,
          formati: { html: true, docx: true },
        });
        this.corrente.stato      = 'FINALIZZATO_DA_PROTOCOLLARE';
        this.corrente.corpo_html = corpo;
        this._docxBlob           = out.docxBlob;
        await this.salva();
        NOTIFICHE.successo('Finalizzata', 'DOCX pronto — usa il pulsante Scarica.');
        // Apre anteprima HTML in nuova scheda
        const win = window.open('', '_blank');
        if (win) { win.document.write(out.htmlString); win.document.close(); }
      } catch (err) {
        ERRORI.gestisciErrore('proposta-sospensione/finalizza', err);
      } finally { this.generando = false; }
    },

    async apriAnteprima() {
      if (!this.corrente) return;
      try {
        const corpo  = await generaCorpoHtmlPropostaSospensione(this.corrente);
        const out    = await MOTORE_DOCX.generaDocumento({
          tipo: 'proposta-sospensione',
          header: _intestazionePS(),
          corpo_html: corpo,
          formati: { html: true },
        });
        const win = window.open('', '_blank');
        if (win) { win.document.write(out.htmlString); win.document.close(); }
      } catch (err) {
        ERRORI.gestisciErrore('proposta-sospensione/anteprima', err);
      }
    },

    async scaricaDocx() {
      if (!this.corrente) return;
      this.generando = true;
      try {
        const corpo  = this.corrente.corpo_html || await generaCorpoHtmlPropostaSospensione(this.corrente);
        const out    = await MOTORE_DOCX.generaDocumento({
          tipo: 'proposta-sospensione',
          header: _intestazionePS(),
          corpo_html: corpo,
          formati: { docx: true },
        });
        const url  = URL.createObjectURL(out.docxBlob);
        const a    = document.createElement('a');
        a.href     = url;
        a.download = `proposta-sospensione-${this.corrente.creato_il?.slice(0,10) ?? UTILS.oggi()}.docx`;
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 5000);
      } catch (err) {
        ERRORI.gestisciErrore('proposta-sospensione/scarica-docx', err);
      } finally { this.generando = false; }
    },

    // ── Protocollazione ───────────────────────────────────────────────────

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
        const prtDir  = await FILESYSTEM.navigaPercorso(cantDir, ['04_Proposte-Sospensione-CSE', 'Protocollati'], true);
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

        try {
          const bDir  = await FILESYSTEM.navigaPercorso(cantDir, ['04_Proposte-Sospensione-CSE', 'Bozze']);
          const bozza = await FILESYSTEM.leggiJson(bDir, `${this.corrente.id}.json`);
          await FILESYSTEM.scriviJson(bDir, `${this.corrente.id}.json`,
            { ...bozza, _cestino: true, _eliminato_il: new Date().toISOString() });
        } catch { /* bozza non trovata: ok */ }

        this.drawerProtocolloAperto = false;
        this.proto = { numero: '', data: '', _pdfFile: null, _letteraFile: null, salvando: false };
        NOTIFICHE.successo('Protocollata', `Proposta n. ${this.corrente.numero_progressivo} archiviata.`);
        // Auto-switch alla vista Protocollati: il PO vede subito l'elemento archiviato e i link.
        await this._caricaLista();
        this.vistaLista = 'protocollati';
        await this._caricaProtocollati();
        this.corrente = null;
      } catch (err) {
        ERRORI.gestisciErrore('proposta-sospensione/salva-protocollo', err);
      } finally { this.proto.salvando = false; }
    },

    onProtoPdfFile(e)  { this.proto._pdfFile     = e.target.files?.[0] ?? null; },
    onProtoLettFile(e) { this.proto._letteraFile = e.target.files?.[0] ?? null; },

    // ── Utility ───────────────────────────────────────────────────────────

    async _bozzeDir(crea = false) {
      const cantId  = Alpine.store('cantiere').id;
      const cantDir = await FILESYSTEM.getHandleAttivo().getDirectoryHandle(cantId);
      return FILESYSTEM.navigaPercorso(cantDir, ['04_Proposte-Sospensione-CSE', 'Bozze'], crea);
    },

    get statoLabel() {
      return { BOZZA:'Bozza', FINALIZZATO_DA_PROTOCOLLARE:'Da protocollare', PROTOCOLLATO:'Protocollato' }
             [this.corrente?.stato] ?? '—';
    },

    get salvataggioLabel() {
      return { salvato:'✓ Salvato', modificato:'● Non salvato', salvando:'⏳ Salvataggio…',
               errore:'⚠ Errore salvataggio', non_salvato:'' }[this._statoSalvataggio] ?? '';
    },

    etichettaStato(stato) {
      return { BOZZA:'bg-yellow-100 text-yellow-800',
               FINALIZZATO_DA_PROTOCOLLARE:'bg-blue-100 text-blue-800',
               PROTOCOLLATO:'bg-green-100 text-green-800' }[stato] ?? 'bg-slate-100 text-slate-600';
    },
  };
}

// ── generaCorpoHtmlPropostaSospensione ────────────────────────────────────────
// Lettera formale fedele al Mod.RE.01-14. Solo tag del sottoinsieme M6.
// NON ripete il titolo nel corpo (è nell'header del template Word).

// Stessa funzione del verbale: aggiunge data-line="15" ai <p> dell'editor privi dell'attributo.
async function generaCorpoHtmlPropostaSospensione(d) {
  const esc = (s) => UTILS.escapeHtml(s ?? '');
  const p   = [];

  // FIX-1: scala firma CSE (canvas fisso, dimensione uniforme)
  const cseImg = await _scalafirma(d.firma_cse?.firma_png_base64 ?? null);

  const chk = (flag) => flag ? '☑' : '☐';

  // 1. Luogo e data (destra)
  p.push(`<p data-align="right">${esc(d.luogo_data) || '&nbsp;'}</p>`);

  // 2. Destinatari — allineati a DESTRA come nel modulo ANAS ufficiale
  const dlNome  = esc(d.destinatari?.dl_testo  ?? '');
  const rupNome = esc(d.destinatari?.rup_testo ?? '');
  // data-indent="destra" → w:ind left=5529 (blocco a destra, come lettera formale ANAS)
  const pa = 'data-indent="destra"';
  p.push(`<p ${pa}>Al Responsabile dei Lavori</p>`);
  p.push(`<p ${pa}>e, p.c. Al Direttore dei Lavori${dlNome ? '<br>' + dlNome : ''}</p>`);
  if (rupNome) {
    p.push(`<p ${pa}>Al Responsabile Unico del Progetto (se figura diversa da RL)<br>${rupNome}</p>`);
  }

  // 3. Oggetto
  const ss  = esc(d.intestazione?.ss ?? '');
  const cod = esc(d.intestazione?.cod_ppm_sil ?? '');
  const lav = esc(d.intestazione?.lavori ?? '');
  // data-line="exact280" → w:spacing line=280 exact (righe oggetto compatte, come ANAS)
  p.push(`<p data-line="exact280"><strong>Oggetto:</strong> S.S. n° ${ss}</p>`);
  p.push(`<p data-line="exact280"><strong>Cod PPM/SIL</strong> ${cod}</p>`);
  p.push(`<p data-line="exact280"><strong>Lavori di</strong> ${lav}</p>`);

  // 4. Titolo art.92 (bold, centrato)
  p.push(`<p data-align="center"><strong>PROPOSTA DI SOSPENSIONE/ALLONTANAMENTO AI SENSI DELL'ART. 92 C.1 LETTERA E) DEL D.LGS. 81/08</strong></p>`);

  // 5. Frase introduttiva
  // cseNome = solo "qualifica professionale + nome cognome" (es. "Geom. Antonio Perrone")
  // Il RUOLO ("Coordinatore per la Sicurezza...") è nel testo fisso "in qualità di..."
  // — non va ripetuto nel "sottoscritto". Così si evita la doppia comparsa del ruolo.
  const cseNome   = esc(d.firma_cse?.nome_cognome ?? '');
  const conNumero = esc(d.contestazione?.numero ?? '….');
  const conData   = d.contestazione?.data ? esc(UTILS.formatData(d.contestazione.data)) : esc('……');
  p.push(
    `<p data-line="15">Con riferimento al cantiere in oggetto e alla contestazione n. ${conNumero} del ${conData} ` +
    `all'impresa affidataria, il sottoscritto <strong>${cseNome}</strong>, ` +
    `in qualità di Coordinatore per la Sicurezza in fase di Esecuzione dei lavori, con la presente</p>`
  );

  // 6. PROPONE + 4 provvedimenti (tutti mostrati con ☑/☐)
  p.push(`<p data-align="center"><strong>PROPONE</strong></p>`);
  p.push(`<p>di adottare il seguente provvedimento:</p>`);

  const prov = d.provvedimenti ?? {};
  // data-indent="elenco" → w:ind left=567 hanging=283 (voci con casella rientrate, come ANAS)
  p.push(`<p data-indent="elenco">${chk(prov.sospensione_lavori)} Sospensione dei lavori</p>`);

  const _valProvv = (obj) => {
    const v = obj?.impresa_id
      ? _nomeImpresaGenPS(obj.impresa_id)
      : (obj?.valore?.trim() ?? '');
    return v ? ` ${esc(v)}` : ' ______';
  };

  p.push(`<p data-indent="elenco">${chk(prov.allontanamento_imprese?.flag)} Allontanamento della/e impresa/e${_valProvv(prov.allontanamento_imprese)}</p>`);
  p.push(`<p data-indent="elenco">${chk(prov.allontanamento_lav_autonomi?.flag)} Allontanamento del/i lavoratore/i autonomo/i${_valProvv(prov.allontanamento_lav_autonomi)}</p>`);
  p.push(`<p data-indent="elenco">${chk(prov.risoluzione_contratto?.flag)} Risoluzione del contratto con l'impresa/il lavoratore autonomo${_valProvv(prov.risoluzione_contratto)}</p>`);

  // 7. Inosservanze (5 voci, tutte mostrate)
  p.push(`<p>in quanto ha riscontrato le seguenti gravi inosservanze alle disposizioni di cui:</p>`);
  const inoss = d.inosservanze ?? {};
  p.push(`<p data-indent="elenco">${chk(inoss.art_94)} all'articolo 94 del D.Lgs 81/08,</p>`);
  p.push(`<p data-indent="elenco">${chk(inoss.art_95)} all'articolo 95 del D.Lgs 81/08</p>`);
  p.push(`<p data-indent="elenco">${chk(inoss.art_96)} all'articolo 96 del D.Lgs 81/08</p>`);
  p.push(`<p data-indent="elenco">${chk(inoss.art_97_c1)} all'articolo 97 comma 1 del D.Lgs 81/08</p>`);
  p.push(`<p data-indent="elenco">${chk(inoss.prescrizioni_art_100)} alle prescrizioni del piano di cui all'articolo 100 del D.Lgs 81/08</p>`);

  // 8. Relativamente a + editor ricco
  p.push(`<p>relativamente a:</p>`);
  if (d.relativamente_a?.trim()) p.push(_applicaInterlinea15(d.relativamente_a));

  // 9. Firma CSE — blocco semplice allineato a DESTRA (no tabella: firma unica)
  // Schema: "Il Coordinatore per l'Esecuzione" / nome / firma
  // data-align="right" → DOCX (M6 p[jc right]); style → HTML preview
  // Firma: data-indent=firma (w:ind left=5670) + data-align=center (centrato nel blocco destro)
  const pr = 'data-indent="firma" data-align="center" style="padding-left:52%;text-align:center"';
  p.push(`<p ${pr}>Il Coordinatore per l'Esecuzione</p>`);
  p.push(`<p ${pr}>${cseNome}</p>`);
  if (cseImg) {
    p.push(`<p ${pr}><img src="${cseImg}" alt="firma CSE"></p>`);
  }

  return p.join('\n');
}

function _nomeImpresaGenPS(id) {
  try { return ANAGRAFICA_SERVICE.getEntita('imprese', id)?.ragioneSociale ?? id ?? ''; }
  catch { return id ?? ''; }
}

// ── Template HTML ─────────────────────────────────────────────────────────────

const _TEMPLATE_PS = /* html */`
<div x-data="PropostaSospensione()" x-init="init()"
     class="p-4 max-w-4xl mx-auto pb-32" role="region"
     aria-label="Proposta di sospensione/allontanamento del CSE"
     @firma-acquisita="onFirmaAcquisita($event.detail.png)"
     @firma-annullata="firmaModal = null">

  <!-- HEADER MODULO -->
  <div class="flex flex-wrap items-center justify-between gap-3 mb-4">
    <div class="flex items-center gap-3">
      <button x-show="corrente !== null" @click="chiudiEditor()"
              class="text-slate-400 hover:text-slate-700 p-1 rounded transition-colors
                     focus:outline-none focus:ring-2 focus:ring-blue-500"
              aria-label="Torna alla lista">&#8592;</button>
      <h2 class="text-lg font-semibold text-slate-800">Proposta di Sospensione / Allontanamento</h2>
    </div>
    <div class="flex items-center gap-2">
      <button @click="noteAperte = !noteAperte"
              :aria-expanded="String(noteAperte)"
              class="flex items-center gap-1 text-xs text-sky-700 bg-sky-50 border border-sky-200
                     px-2.5 py-1 rounded-full hover:bg-sky-100 transition-colors
                     focus:outline-none focus:ring-2 focus:ring-sky-400">
        &#x2139; Note normative
      </button>
      <template x-if="corrente !== null">
        <span class="text-xs px-2 py-0.5 rounded-full font-medium"
              :class="etichettaStato(corrente.stato)" x-text="statoLabel"></span>
      </template>
    </div>
  </div>

  <!-- PANNELLO NOTE NORMATIVE -->
  <div x-show="noteAperte" x-transition class="nota-normativa-panel mb-4" role="note">
    <p class="text-xs text-sky-500 mb-2 italic">Promemoria per il CSE — non compare nel documento generato.</p>
    <template x-for="nota in notePS" :key="nota.titolo">
      <div><h4 x-text="nota.titolo"></h4><p x-text="nota.testo"></p></div>
    </template>
  </div>

  <!-- VISTA LISTA -->
  <div x-show="corrente === null">

    <!-- Toggle Bozze / Protocollati -->
    <div class="flex items-center gap-1 bg-slate-100 rounded-lg p-1 mb-4 w-fit">
      <button @click="vistaLista='bozze'; _caricaLista()"
              :class="vistaLista==='bozze' ? 'bg-white shadow text-slate-800' : 'text-slate-500 hover:text-slate-700'"
              class="text-sm font-medium px-3 py-1.5 rounded-md transition-all
                     focus:outline-none focus:ring-2 focus:ring-blue-500">Bozze</button>
      <button @click="vistaLista='protocollati'; _caricaProtocollati()"
              :class="vistaLista==='protocollati' ? 'bg-white shadow text-slate-800' : 'text-slate-500 hover:text-slate-700'"
              class="text-sm font-medium px-3 py-1.5 rounded-md transition-all
                     focus:outline-none focus:ring-2 focus:ring-blue-500">Protocollate</button>
    </div>

    <div class="flex justify-between items-center mb-3">
      <p class="text-sm text-slate-500">
        <span x-show="caricamento">Caricamento...</span>
        <span x-show="!caricamento && vistaLista==='bozze' && lista.length===0 && Alpine.store('cantiere').id">Nessuna bozza.</span>
        <span x-show="!caricamento && vistaLista==='protocollati' && listaProtocollati.length===0 && Alpine.store('cantiere').id">Nessuna proposta protocollata.</span>
        <span x-show="!Alpine.store('cantiere').id" class="text-amber-600">Seleziona un cantiere.</span>
      </p>
      <button x-show="vistaLista==='bozze'" @click="nuovo()" :disabled="!Alpine.store('cantiere').id"
              class="bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white text-sm
                     font-medium px-4 py-2 rounded-lg transition-colors
                     focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2">
        + Nuova proposta
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
                    x-text="v.contestazione?.numero ? 'NC n. '+v.contestazione.numero : 'Bozza'"></span>
              <span class="text-xs px-2 py-0.5 rounded-full font-medium"
                    :class="etichettaStato(v.stato)"
                    x-text="{ BOZZA:'Bozza', FINALIZZATO_DA_PROTOCOLLARE:'Da protocollare', PROTOCOLLATO:'Protocollato' }[v.stato]??v.stato">
              </span>
            </div>
            <p class="text-xs text-slate-400 mt-0.5"
               x-text="v.creato_il ? 'Creata il ' + formatDataLabel(v.creato_il) : ''"></p>
          </div>
          <button @click.stop="cestina(v.id)"
                  class="text-slate-300 hover:text-red-500 text-lg p-1 transition-colors
                         focus:outline-none focus:ring-2 focus:ring-red-400 rounded"
                  aria-label="Cestina">&#10005;</button>
        </div>
      </template>
    </div>

    <!-- Lista PROTOCOLLATE -->
    <div x-show="vistaLista==='protocollati'" class="space-y-2">
      <template x-for="v in listaProtocollati" :key="v.id">
        <div class="bg-white border border-slate-200 rounded-lg px-4 py-3">
          <div class="flex items-start justify-between gap-3">
            <div class="flex-1 min-w-0">
              <div class="flex items-center gap-2 flex-wrap">
                <span class="text-sm font-semibold text-slate-800"
                      x-text="v.protocollo?.numero ? 'n. '+v.protocollo.numero : '(numero non inserito)'"></span>
                <span class="text-xs text-slate-400"
                      x-text="v.protocollo?.data_protocollo ? formatDataLabel(v.protocollo.data_protocollo) : ''"></span>
              </div>
              <p class="text-xs text-slate-500 mt-0.5"
                 x-text="v.contestazione?.numero ? 'NC n. ' + v.contestazione.numero : ''"></p>
            </div>
            <div class="flex items-center gap-2 flex-shrink-0">
              <button x-show="v.protocollo?.file_pdf_protocollato"
                      @click="apriFileProt(v.protocollo.file_pdf_protocollato)"
                      class="text-xs text-blue-600 hover:text-blue-800 bg-blue-50 border border-blue-200
                             px-2 py-1 rounded transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500">
                &#128196; PDF
              </button>
              <button x-show="v.protocollo?.file_lettera"
                      @click="apriFileProt(v.protocollo.file_lettera)"
                      class="text-xs text-slate-600 hover:text-slate-800 bg-slate-50 border border-slate-200
                             px-2 py-1 rounded transition-colors focus:outline-none focus:ring-2 focus:ring-slate-400">
                &#128196; Lettera
              </button>
            </div>
          </div>
        </div>
      </template>
    </div>

  </div><!-- /lista -->

  <!-- VISTA EDITOR -->
  <div x-show="corrente !== null">
    <template x-if="corrente !== null">
      <div>

        <div class="flex justify-end mb-2">
          <span class="text-xs text-slate-400" x-text="salvataggioLabel"></span>
        </div>

        <!-- TABS -->
        <div class="modulo-tabs" role="tablist">
          <button role="tab" class="modulo-tab" :class="{'attiva': scheda==='documento'}"
                  @click="scheda='documento'" :aria-selected="String(scheda==='documento')">Documento</button>
          <button role="tab" class="modulo-tab" :class="{'attiva': scheda==='firma'}"
                  @click="scheda='firma'" :aria-selected="String(scheda==='firma')">Firma CSE
            <template x-if="!corrente.firma_cse.firma_png_base64">
              <span class="ml-1 text-xs bg-amber-100 text-amber-700 rounded-full px-1.5">!</span>
            </template>
          </button>
        </div>

        <!-- TAB DOCUMENTO -->
        <div x-show="scheda==='documento'" role="tabpanel">

          <!-- Luogo e data -->
          <div class="mb-4">
            <label class="block text-xs font-medium text-slate-600 mb-1">Luogo e data</label>
            <input type="text" x-model="corrente.luogo_data" @input="_scheduleAutosave()"
                   placeholder="es. Cosenza, 02/06/2026"
                   class="w-full border border-slate-300 rounded-md px-3 py-2 text-sm
                          focus:outline-none focus:ring-2 focus:ring-blue-500">
          </div>

          <!-- Destinatari -->
          <div class="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            <div>
              <label class="block text-xs font-medium text-slate-600 mb-1">Direttore dei Lavori</label>
              <select @change="corrente.destinatari.dl_id=$event.target.value||null; corrente.destinatari.dl_testo=$event.target.selectedOptions[0]?.dataset?.nome||''; _scheduleAutosave()"
                      class="w-full text-xs border border-slate-300 rounded-md px-2 py-1.5 mb-1
                             focus:outline-none focus:ring-2 focus:ring-blue-500">
                <option value="">-- Seleziona da anagrafica --</option>
                <template x-for="pc in $root.personeCommittente" :key="pc.id">
                  <option :value="pc.id"
                          :data-nome="[pc.qualifica,pc.cognome,pc.nome].filter(Boolean).join(' ')"
                          x-text="[pc.qualifica,pc.cognome,pc.nome].filter(Boolean).join(' ')">
                  </option>
                </template>
              </select>
              <input type="text" x-model="corrente.destinatari.dl_testo"
                     @input="_scheduleAutosave()"
                     placeholder="Qualifica Nome Cognome (modificabile)"
                     class="w-full border border-slate-300 rounded-md px-3 py-2 text-sm
                            focus:outline-none focus:ring-2 focus:ring-blue-500">
            </div>
            <div>
              <label class="block text-xs font-medium text-slate-600 mb-1">RUP (se diverso dal RL)</label>
              <select @change="corrente.destinatari.rup_id=$event.target.value||null; corrente.destinatari.rup_testo=$event.target.selectedOptions[0]?.dataset?.nome||''; _scheduleAutosave()"
                      class="w-full text-xs border border-slate-300 rounded-md px-2 py-1.5 mb-1
                             focus:outline-none focus:ring-2 focus:ring-blue-500">
                <option value="">-- Seleziona da anagrafica --</option>
                <template x-for="pc in $root.personeCommittente" :key="pc.id">
                  <option :value="pc.id"
                          :data-nome="[pc.qualifica,pc.cognome,pc.nome].filter(Boolean).join(' ')"
                          x-text="[pc.qualifica,pc.cognome,pc.nome].filter(Boolean).join(' ')">
                  </option>
                </template>
              </select>
              <input type="text" x-model="corrente.destinatari.rup_testo"
                     @input="_scheduleAutosave()"
                     placeholder="Qualifica Nome Cognome (modificabile)"
                     class="w-full border border-slate-300 rounded-md px-3 py-2 text-sm
                            focus:outline-none focus:ring-2 focus:ring-blue-500">
            </div>
          </div>

          <!-- Contestazione (manuale — TODO M14) -->
          <div class="bg-amber-50 border border-amber-200 rounded-lg p-3 mb-4">
            <p class="text-xs text-amber-700 font-medium mb-2">
              Contestazione / Non Conformità
              <span class="font-normal text-amber-600 ml-1">
                — inserimento manuale per ora.
                <!-- TODO M14: sostituire con select NC del cantiere ordinate per data desc -->
              </span>
            </p>
            <div class="grid grid-cols-2 gap-3">
              <div>
                <label class="block text-xs text-slate-600 mb-1">Numero NC / Contestazione</label>
                <input type="text" x-model="corrente.contestazione.numero" @input="_scheduleAutosave()"
                       placeholder="es. NC-2026-003"
                       class="w-full border border-slate-300 rounded-md px-3 py-2 text-sm
                              focus:outline-none focus:ring-2 focus:ring-blue-500">
              </div>
              <div>
                <label class="block text-xs text-slate-600 mb-1">Data contestazione</label>
                <input type="date" x-model="corrente.contestazione.data" @change="_scheduleAutosave()"
                       class="w-full border border-slate-300 rounded-md px-3 py-2 text-sm
                              focus:outline-none focus:ring-2 focus:ring-blue-500">
              </div>
            </div>
          </div>

          <!-- Provvedimenti (4 caselle) -->
          <fieldset class="mb-4">
            <legend class="text-xs font-semibold text-slate-700 mb-3">PROPONE di adottare il seguente provvedimento</legend>
            <div class="space-y-3">

              <!-- Sospensione lavori -->
              <label class="flex items-center gap-3 cursor-pointer">
                <input type="checkbox" x-model="corrente.provvedimenti.sospensione_lavori"
                       @change="_scheduleAutosave()"
                       class="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-2 focus:ring-blue-500">
                <span class="text-sm">Sospensione dei lavori</span>
              </label>

              <!-- Allontanamento imprese -->
              <div>
                <label class="flex items-center gap-3 cursor-pointer mb-1">
                  <input type="checkbox" x-model="corrente.provvedimenti.allontanamento_imprese.flag"
                         @change="_scheduleAutosave()"
                         class="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-2 focus:ring-blue-500">
                  <span class="text-sm">Allontanamento della/e impresa/e</span>
                </label>
                <div x-show="corrente.provvedimenti.allontanamento_imprese.flag" class="ml-7 flex gap-2">
                  <select @change="selezionaImpresaProvvedimento('allontanamento_imprese', $event.target.value)"
                          class="text-xs border border-slate-300 rounded px-2 py-1
                                 focus:outline-none focus:ring-2 focus:ring-blue-500">
                    <option value="">-- Seleziona da anagrafica --</option>
                    <template x-for="imp in imprese" :key="imp.id">
                      <option :value="imp.id" x-text="imp.ragioneSociale"></option>
                    </template>
                  </select>
                  <input type="text" x-model="corrente.provvedimenti.allontanamento_imprese.valore"
                         @input="_scheduleAutosave()"
                         placeholder="Ragione sociale"
                         class="flex-1 border border-slate-300 rounded px-2 py-1 text-sm
                                focus:outline-none focus:ring-2 focus:ring-blue-500">
                </div>
              </div>

              <!-- Allontanamento lavoratori autonomi -->
              <div>
                <label class="flex items-center gap-3 cursor-pointer mb-1">
                  <input type="checkbox" x-model="corrente.provvedimenti.allontanamento_lav_autonomi.flag"
                         @change="_scheduleAutosave()"
                         class="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-2 focus:ring-blue-500">
                  <span class="text-sm">Allontanamento del/i lavoratore/i autonomo/i</span>
                </label>
                <div x-show="corrente.provvedimenti.allontanamento_lav_autonomi.flag" class="ml-7">
                  <input type="text" x-model="corrente.provvedimenti.allontanamento_lav_autonomi.valore"
                         @input="_scheduleAutosave()"
                         placeholder="Nome lavoratore autonomo"
                         class="w-full border border-slate-300 rounded px-2 py-1 text-sm
                                focus:outline-none focus:ring-2 focus:ring-blue-500">
                </div>
              </div>

              <!-- Risoluzione contratto -->
              <div>
                <label class="flex items-center gap-3 cursor-pointer mb-1">
                  <input type="checkbox" x-model="corrente.provvedimenti.risoluzione_contratto.flag"
                         @change="_scheduleAutosave()"
                         class="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-2 focus:ring-blue-500">
                  <span class="text-sm">Risoluzione del contratto con l'impresa/il lavoratore autonomo</span>
                </label>
                <div x-show="corrente.provvedimenti.risoluzione_contratto.flag" class="ml-7 flex gap-2">
                  <select @change="selezionaImpresaProvvedimento('risoluzione_contratto', $event.target.value)"
                          class="text-xs border border-slate-300 rounded px-2 py-1
                                 focus:outline-none focus:ring-2 focus:ring-blue-500">
                    <option value="">-- Seleziona da anagrafica --</option>
                    <template x-for="imp in imprese" :key="imp.id">
                      <option :value="imp.id" x-text="imp.ragioneSociale"></option>
                    </template>
                  </select>
                  <input type="text" x-model="corrente.provvedimenti.risoluzione_contratto.valore"
                         @input="_scheduleAutosave()"
                         placeholder="Impresa o lavoratore autonomo"
                         class="flex-1 border border-slate-300 rounded px-2 py-1 text-sm
                                focus:outline-none focus:ring-2 focus:ring-blue-500">
                </div>
              </div>

            </div>
          </fieldset>

          <!-- Inosservanze (5 caselle) -->
          <fieldset class="mb-4">
            <legend class="text-xs font-semibold text-slate-700 mb-3">Gravi inosservanze alle disposizioni di cui:</legend>
            <div class="space-y-2">
              <label class="flex items-center gap-3 cursor-pointer text-sm">
                <input type="checkbox" x-model="corrente.inosservanze.art_94"    @change="_scheduleAutosave()" class="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-2 focus:ring-blue-500">
                all'articolo 94 del D.Lgs 81/08
              </label>
              <label class="flex items-center gap-3 cursor-pointer text-sm">
                <input type="checkbox" x-model="corrente.inosservanze.art_95"    @change="_scheduleAutosave()" class="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-2 focus:ring-blue-500">
                all'articolo 95 del D.Lgs 81/08
              </label>
              <label class="flex items-center gap-3 cursor-pointer text-sm">
                <input type="checkbox" x-model="corrente.inosservanze.art_96"    @change="_scheduleAutosave()" class="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-2 focus:ring-blue-500">
                all'articolo 96 del D.Lgs 81/08
              </label>
              <label class="flex items-center gap-3 cursor-pointer text-sm">
                <input type="checkbox" x-model="corrente.inosservanze.art_97_c1" @change="_scheduleAutosave()" class="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-2 focus:ring-blue-500">
                all'articolo 97 comma 1 del D.Lgs 81/08
              </label>
              <label class="flex items-center gap-3 cursor-pointer text-sm">
                <input type="checkbox" x-model="corrente.inosservanze.prescrizioni_art_100" @change="_scheduleAutosave()" class="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-2 focus:ring-blue-500">
                alle prescrizioni del piano di cui all'articolo 100 del D.Lgs 81/08
              </label>
            </div>
          </fieldset>

          <!-- Relativamente a (editor ricco) -->
          <h3 class="text-sm font-semibold text-slate-700 mb-2">relativamente a:</h3>
          <div class="editor-ricco-wrapper mb-4">
            <div class="editor-toolbar" role="toolbar" aria-label="Formattazione testo">
              <button type="button" @mousedown.prevent="edBoldPS('ed-relativ')" title="Grassetto"><strong>B</strong></button>
              <button type="button" @mousedown.prevent="edItalicPS('ed-relativ')" title="Corsivo"><em>I</em></button>
              <div class="sep"></div>
              <button type="button" @mousedown.prevent="edAllineaPS('ed-relativ','l')" title="Sinistra">&#8678;</button>
              <button type="button" @mousedown.prevent="edAllineaPS('ed-relativ','c')" title="Centra">&#9675;</button>
              <button type="button" @mousedown.prevent="edAllineaPS('ed-relativ','r')" title="Destra">&#8680;</button>
            </div>
            <div id="ed-relativ" contenteditable="true" role="textbox" aria-multiline="true"
                 aria-label="Descrizione della violazione (relativamente a)"
                 @input.debounce.300ms="onEditorInputPS('ed-relativ')"
                 @paste.prevent="onEditorPastePS('ed-relativ',$event)"
                 class="editor-area"></div>
          </div>

        </div><!-- /tab documento -->

        <!-- TAB FIRMA CSE -->
        <div x-show="scheda==='firma'" role="tabpanel">
          <div class="border-t border-slate-200 pt-4">
            <h3 class="text-sm font-semibold text-slate-700 mb-3">Il Coordinatore per la Sicurezza in fase di Esecuzione</h3>
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
                  <button @click="rimuoviFirma()" class="text-xs text-slate-400 hover:text-red-500 underline">Sostituisci</button>
                </div>
              </template>
              <template x-if="!corrente.firma_cse.firma_png_base64">
                <div>
                  <p class="text-xs text-amber-600 mb-2">(firma mancante — non bloccante per la finalizzazione)</p>
                  <div class="flex gap-2 flex-wrap">
                    <button @click="apriCanvasFirma()"
                            class="text-xs bg-blue-600 text-white px-3 py-1.5 rounded
                                   hover:bg-blue-700 transition-colors
                                   focus:outline-none focus:ring-2 focus:ring-blue-500">
                      &#9997; Firma con canvas
                    </button>
                    <label class="text-xs bg-white text-blue-700 border border-blue-300 px-3 py-1.5
                                  rounded hover:bg-blue-50 cursor-pointer transition-colors">
                      &#128206; Carica PNG
                      <input type="file" accept=".png,image/png" class="sr-only" @change="onUploadFirma($event)">
                    </label>
                  </div>
                </div>
              </template>
            </div>
          </div>
        </div><!-- /tab firma -->

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

  <!-- MODAL CANVAS FIRMA -->
  <div x-show="firmaModal !== null" x-transition.opacity
       class="fixed inset-0 z-[200] flex items-center justify-center bg-black/40 p-4"
       @keydown.escape.window="firmaModal = null">
    <template x-if="firmaModal !== null">
      <div class="bg-white rounded-xl shadow-2xl p-5 w-full max-w-md"
           x-data="FirmaCanvas()"
           x-init="init()"
           @firma-acquisita="$root.onFirmaAcquisita($event.detail.png)"
           @firma-annullata="$root.firmaModal = null"
           role="dialog" aria-modal="true" aria-label="Canvas firma">
        <h3 class="text-sm font-semibold text-slate-800 mb-3">Traccia firma</h3>
        <canvas x-ref="canvas" class="firma-canvas-area"
                @pointerdown="startDraw($event)" @pointermove="draw($event)"
                @pointerup="endDraw()" @pointercancel="endDraw()"></canvas>
        <div class="flex gap-2 mt-3 justify-end">
          <button @click="pulisci()" class="text-sm text-slate-500 border border-slate-300 px-3 py-1.5 rounded-lg hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-slate-400">Pulisci</button>
          <button @click="annulla()" class="text-sm text-slate-500 border border-slate-300 px-3 py-1.5 rounded-lg hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-slate-400">Annulla</button>
          <button @click="usa()"    class="text-sm bg-blue-600 text-white px-4 py-1.5 rounded-lg hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500">Usa firma</button>
        </div>
      </div>
    </template>
  </div>

  <!-- DRAWER PROTOCOLLAZIONE -->
  <div x-show="drawerProtocolloAperto" class="drawer-backdrop" @click="drawerProtocolloAperto=false"></div>
  <div x-show="drawerProtocolloAperto" x-transition.opacity class="drawer"
       role="dialog" aria-modal="true" aria-label="Protocollazione proposta">
    <div class="drawer-header px-5 py-4 border-b border-slate-200 flex items-center justify-between">
      <h3 class="font-semibold text-slate-800">Protocolla proposta</h3>
      <button @click="drawerProtocolloAperto=false"
              class="text-slate-400 hover:text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500 rounded"
              aria-label="Chiudi">&#10005;</button>
    </div>
    <div class="drawer-body px-5 py-4 space-y-4">
      <p class="text-xs text-slate-500">Numero di protocollo assegnato dai superiori + PDF protocollato ricevuto.</p>
      <div>
        <label for="ps-proto-numero" class="block text-xs font-medium text-slate-600 mb-1">Numero protocollo <span class="text-red-500">*</span></label>
        <input id="ps-proto-numero" type="text" x-model="proto.numero" placeholder="es. 2026/042"
               class="w-full border border-slate-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
      </div>
      <div>
        <label for="ps-proto-data" class="block text-xs font-medium text-slate-600 mb-1">Data protocollo</label>
        <input id="ps-proto-data" type="date" x-model="proto.data"
               class="w-full border border-slate-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
      </div>
      <div>
        <label class="block text-xs font-medium text-slate-600 mb-1">PDF protocollato</label>
        <input type="file" accept=".pdf" @change="onProtoPdfFile($event)"
               class="text-sm text-slate-500 file:mr-3 file:py-1.5 file:px-3 file:rounded file:border file:border-slate-300 file:text-xs file:bg-slate-50 file:text-slate-700 hover:file:bg-slate-100">
        <p x-show="proto._pdfFile" class="text-xs text-green-600 mt-1" x-text="'&#10003; '+(proto._pdfFile?.name??'')"></p>
      </div>
      <div>
        <label class="block text-xs font-medium text-slate-600 mb-1">Lettera di trasmissione (facoltativa)</label>
        <input type="file" accept=".pdf" @change="onProtoLettFile($event)"
               class="text-sm text-slate-500 file:mr-3 file:py-1.5 file:px-3 file:rounded file:border file:border-slate-300 file:text-xs file:bg-slate-50 file:text-slate-700 hover:file:bg-slate-100">
        <p x-show="proto._letteraFile" class="text-xs text-green-600 mt-1" x-text="'&#10003; '+(proto._letteraFile?.name??'')"></p>
      </div>
    </div>
    <div class="drawer-footer px-5 py-4 border-t border-slate-200 bg-slate-50">
      <div class="flex gap-3 justify-end">
        <button @click="drawerProtocolloAperto=false"
                class="text-sm text-slate-500 hover:text-slate-700 px-4 py-2 border border-slate-300 rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-slate-400">
          Annulla
        </button>
        <button @click="salvaProtocollo()" :disabled="proto.salvando"
                class="bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white text-sm font-medium px-5 py-2 rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2">
          <span x-text="proto.salvando ? 'Archiviazione...' : 'Salva e protocolla'"></span>
        </button>
      </div>
    </div>
  </div>

</div>
`;

// ── Registrazione ─────────────────────────────────────────────────────────────

window.MODULI_REGISTRATI = window.MODULI_REGISTRATI ?? {};
window.MODULI_REGISTRATI['proposta-sospensione'] = {
  monta(contenitore) {
    contenitore.innerHTML = _TEMPLATE_PS;
  },
};
