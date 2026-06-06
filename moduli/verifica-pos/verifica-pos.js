/**
 * verifica-pos.js — Verifica di idoneità del POS (Mod.RE.01-5)
 * Quarto documento del Flusso B. Lettera formale CSE art.92 c.1 lett.b D.Lgs 81/08.
 *
 * NOTA STORAGE: usa 03_Verifiche-POS/ (già in scaffolding, NON 06_Verifiche-POS/
 * che appartiene a 06_Eventi-Incidentali nel schema archivio).
 *
 * Pattern identico a proposta/disposizione (v0.8.0):
 *   ciclo BOZZA→FINALIZZATO→PROTOCOLLATO, vista Protocollati, editor ricco, auto-save.
 * Differenza chiave: ESITO a SCELTA SINGOLA (radio, mutuamente esclusive).
 * Firma CSE: canvas + upload (da M2). Visto RL e Area: upload-only.
 *
 * NOTA DUPLICAZIONE: utility con suffisso VP (anti-regressione Flusso B).
 * Fattorizzazione in shared/flusso-b-helpers.js pianificata dopo 4° documento.
 */

'use strict';

// ── Costanti ─────────────────────────────────────────────────────────────────

const NOTE_NORMATIVE_VP = {
  'verifica-pos': [
    {
      titolo: 'Obbligo CSE — art. 92 c.1 lett. b) D.Lgs 81/08',
      testo:  'Il CSE verifica l\'idoneità del POS (piano complementare di dettaglio del PSC), ' +
              'assicurandone la coerenza col PSC. Criterio: rispondenza all\'Allegato XV del ' +
              'D.Lgs 81/08 e congruità col PSC.',
    },
    {
      titolo: 'Non idoneità: procedura',
      testo:  'In caso di POS non idoneo: richiedere integrazioni/modifiche tramite l\'impresa ' +
              'affidataria (che li trasmette alle esecutrici). I POS modificati devono pervenire ' +
              'prima dell\'inizio delle lavorazioni interessate.',
    },
    {
      titolo: 'Evidenza e trasmissione',
      testo:  'Dare evidenza dell\'esito al committente/RL e alle imprese coinvolte. Conservare ' +
              'copia. Trasmissione tracciabile (PEC / protocollo). ' +
              'Firma legale via GoSign (strumento esterno a SafeHub).',
    },
  ],
};

// ── Utility (suffisso VP — anti-regressione da copia-incolla) ─────────────────

function _intestazioneVP() {
  const m   = IMPOSTAZIONI_SERVICE.modulo('verifica-pos');
  const bad = new Set(['verifica-pos', '']);
  const _ok = (v, def) => (!v || bad.has(v)) ? def : v;
  return {
    modulo_titolo:   _ok(m.titolo,   'Verifica idoneità Piano Operativo di Sicurezza'),
    modulo_codice:   _ok(m.codice,   'Mod.RE.01-5'),
    modulo_versione: _ok(m.versione, 'Vers. 3.1 del 13/05/2026'),
    logo_aziendale:  IMPOSTAZIONI_SERVICE.logo().png_base64 ?? null,
  };
}

// ── VerificaPos Alpine component ──────────────────────────────────────────────

function VerificaPos() {
  return {
    lista: [], listaProtocollati: [], vistaLista: 'bozze', caricamento: false,
    corrente: null, scheda: 'documento', generando: false,
    _autosaveTimer: null, _statoSalvataggio: 'salvato',
    noteAperte: false, firmaModal: null, drawerProtocolloAperto: false,
    proto: { numero: '', data: '', _pdfFile: null, _letteraFile: null, salvando: false },

    get noteVP()           { return NOTE_NORMATIVE_VP['verifica-pos']; },
    get imprese()          { return ANAGRAFICA_SERVICE.get('imprese') ?? []; },
    formatDataLabel(d)     { return UTILS.formatData(d) ?? d; },

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

    // ── Lista bozze ──────────────────────────────────────────────────────────

    async _caricaLista() {
      const cantId = Alpine.store('cantiere').id;
      if (!cantId) { this.lista = []; return; }
      this.caricamento = true;
      try {
        const root = FILESYSTEM.getHandleAttivo();
        if (!root) return;
        const bDir = await FILESYSTEM.navigaPercorso(
          await root.getDirectoryHandle(cantId),
          ['03_Verifiche-POS', 'Bozze'], true
        );
        const voci = [];
        for await (const [nome] of bDir.entries()) {
          if (!nome.endsWith('.json')) continue;
          try { const d = await FILESYSTEM.leggiJson(bDir, nome); if (!d._cestino) voci.push(d); }
          catch { /* skip */ }
        }
        voci.sort((a, b) => (b.aggiornato_il ?? '').localeCompare(a.aggiornato_il ?? ''));
        this.lista = voci;
      } catch (err) { ERRORI.gestisciErrore('verifica-pos/carica-lista', err); }
      finally { this.caricamento = false; }
    },

    // ── Lista protocollati ────────────────────────────────────────────────────

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
            ['03_Verifiche-POS', 'Protocollati'], false
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
          (b.protocollo?.data_protocollo ?? '').localeCompare(a.protocollo?.data_protocollo ?? '')
        );
        this.listaProtocollati = voci;
      } catch (err) { ERRORI.gestisciErrore('verifica-pos/carica-protocollati', err); this.listaProtocollati = []; }
      finally { this.caricamento = false; }
    },

    async apriFileProt(filename) {
      if (!filename) return;
      try {
        const cantId = Alpine.store('cantiere').id;
        const prtDir = await FILESYSTEM.navigaPercorso(
          await FILESYSTEM.getHandleAttivo().getDirectoryHandle(cantId),
          ['03_Verifiche-POS', 'Protocollati']
        );
        const url = URL.createObjectURL(await (await prtDir.getFileHandle(filename)).getFile());
        window.open(url, '_blank');
        setTimeout(() => URL.revokeObjectURL(url), 60000);
      } catch (err) { ERRORI.gestisciErrore('verifica-pos/apri-file-prot', err); }
    },

    // ── Nuovo documento ──────────────────────────────────────────────────────

    async nuovo() {
      const cantiere = Alpine.store('cantiere');
      if (!cantiere.id) return;
      await ANAGRAFICA_SERVICE.carica(cantiere.id);

      const lotto = ANAGRAFICA_SERVICE.dati?.lotto ?? {};
      const cse   = IMPOSTAZIONI_SERVICE.cse();
      const firm  = IMPOSTAZIONI_SERVICE.firma();

      const impAfId = lotto.impresaAffidatariaId ?? null;
      const impAf   = impAfId ? ANAGRAFICA_SERVICE.getEntita('imprese', impAfId) : null;

      this.corrente = {
        id:          UTILS.uuid(),
        tipo_file:   'verifica_pos',
        cantiere_id: cantiere.id ?? '',
        stato:       'BOZZA',
        numero_progressivo: null,
        creato_il:    new Date().toISOString(),
        aggiornato_il: new Date().toISOString(),

        tabella_amm: {
          ppm_sil_oda:  lotto.codicePpmSil    ?? '',
          commessa:     lotto.commessaNumero   ?? '',
          voce_budget:  lotto.voceBudget       ?? '',
          cup:          lotto.cup              ?? '',
          cig:          lotto.cig              ?? '',
        },

        destinatari: {
          impresa_id:                  impAfId,
          impresa_nome:                impAf?.ragioneSociale ?? '',
          pec_impresa:                 impAf?.pec ?? '',
          resp_struttura_territoriale: lotto.strutturaTerritoriale ?? '',
        },

        intestazione: {
          ss:          lotto.ssNumero ?? lotto.progressivaInizio ?? '',
          lavori:      lotto.nome ?? '',
          cod_ppm_sil: lotto.codicePpmSil ?? '',
        },

        impresa_verificata: {
          impresa_id: impAfId,
          testo:      impAf?.ragioneSociale ?? '',
        },

        esito: null,  // "idoneo" | "idoneo_integrazioni" | "non_idoneo"
        note: '',

        firma_cse: {
          qualifica:        cse.qualifica    ?? 'Coordinatore Sicurezza in fase di Esecuzione',
          nome_cognome:     cse.nome_cognome ?? '',
          firma_png_base64: firm.firma_png_base64 ?? null,
          tipo_firma:       firm.firma_png_base64 ? 'permanente' : null,
          timestamp_firma:  firm.acquisita_il ?? null,
        },

        visto_rl: {
          qualifica:        'Il Responsabile dei Lavori',
          nome_cognome:     '',
          firma_png_base64: null,
          tipo_firma:       null,
          timestamp_firma:  null,
        },

        visto_area: {
          qualifica:        'Il Responsabile Area Gestione Rete / Il Responsabile Area Nuove Opere',
          nome_cognome:     '',
          firma_png_base64: null,
          tipo_firma:       null,
          timestamp_firma:  null,
        },

        protocollo: null,
      };

      this.scheda = 'documento';
      this._statoSalvataggio = 'non_salvato';
      this.$nextTick(() => this._caricaEditors());
    },

    async apri(id) {
      try {
        const dir = await this._bozzeDir();
        this.corrente = await FILESYSTEM.leggiJson(dir, `${id}.json`);
        this.scheda   = 'documento';
        this._statoSalvataggio = 'salvato';
        this.$nextTick(() => this._caricaEditors());
      } catch (err) { ERRORI.gestisciErrore('verifica-pos/apri', err); }
    },

    chiudiEditor() {
      clearTimeout(this._autosaveTimer);
      this.corrente = null;
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
      } catch (err) { this._statoSalvataggio = 'errore'; ERRORI.gestisciErrore('verifica-pos/salva', err); }
    },

    _scheduleAutosave() {
      this._statoSalvataggio = 'modificato';
      clearTimeout(this._autosaveTimer);
      this._autosaveTimer = setTimeout(() => this.salva(), 8000);
    },

    async cestina(id) {
      if (!confirm('Spostare la verifica nel cestino?')) return;
      try {
        const dir = await this._bozzeDir();
        const d   = await FILESYSTEM.leggiJson(dir, `${id}.json`);
        await FILESYSTEM.scriviJson(dir, `${id}.json`,
          { ...d, _cestino: true, _eliminato_il: new Date().toISOString() });
        this.lista = this.lista.filter(v => v.id !== id);
        if (this.corrente?.id === id) this.corrente = null;
        NOTIFICHE.successo('Spostato nel cestino', 'La verifica può essere ripristinata.');
      } catch (err) { ERRORI.gestisciErrore('verifica-pos/cestina', err); }
    },

    // ── Selezione da anagrafica ───────────────────────────────────────────────

    selezionaImpresaDestinatario(id) {
      if (!id || !this.corrente) return;
      const imp = ANAGRAFICA_SERVICE.getEntita('imprese', id);
      if (imp) {
        this.corrente.destinatari.impresa_id   = id;
        this.corrente.destinatari.impresa_nome = imp.ragioneSociale ?? '';
        this.corrente.destinatari.pec_impresa  = imp.pec ?? '';
      }
      this._scheduleAutosave();
    },

    selezionaImpresaVerificata(id) {
      if (!id || !this.corrente) return;
      const imp = ANAGRAFICA_SERVICE.getEntita('imprese', id);
      if (imp) {
        this.corrente.impresa_verificata.impresa_id = id;
        this.corrente.impresa_verificata.testo      = imp.ragioneSociale ?? '';
      }
      this._scheduleAutosave();
    },

    // ── Editor ricco (note) ───────────────────────────────────────────────────

    _caricaEditors() {
      const el = document.getElementById('ed-note-vp');
      if (el) el.innerHTML = _editorFromHtml(this.corrente?.note ?? '');
    },

    edBoldNote()       { this._edCmdVP('ed-note-vp', 'bold'); },
    edItalicNote()     { this._edCmdVP('ed-note-vp', 'italic'); },
    edAllineaNote(dir) { this._edCmdVP('ed-note-vp', { l:'justifyLeft', c:'justifyCenter', r:'justifyRight' }[dir]); },

    _edCmdVP(id, cmd) {
      const el = document.getElementById(id);
      if (!el) return;
      el.focus(); document.execCommand(cmd, false);
      if (el) this.corrente.note = _serEditor(el);
      this._scheduleAutosave();
    },

    onEditorNoteInput() {
      const el = document.getElementById('ed-note-vp');
      if (el) this.corrente.note = _serEditor(el);
      this._scheduleAutosave();
    },

    onEditorNotePaste(e) {
      e.preventDefault();
      document.execCommand('insertText', false, e.clipboardData.getData('text/plain'));
      const el = document.getElementById('ed-note-vp');
      if (el) this.corrente.note = _serEditor(el);
      this._scheduleAutosave();
    },

    // ── Firme ─────────────────────────────────────────────────────────────────

    apriCanvasFirma() { this.firmaModal = true; },

    onFirmaAcquisita(png) {
      if (!this.corrente) { this.firmaModal = null; return; }
      this.corrente.firma_cse.firma_png_base64 = png;
      this.corrente.firma_cse.tipo_firma      = 'canvas';
      this.corrente.firma_cse.timestamp_firma = new Date().toISOString();
      this.firmaModal = null;
      this._scheduleAutosave();
    },

    async onUploadFirmaCse(e) {
      const file = e.target.files?.[0];
      if (!file || !this.corrente) return;
      const png = await _leggiBase64(file);
      this.corrente.firma_cse.firma_png_base64 = png;
      this.corrente.firma_cse.tipo_firma      = 'upload';
      this.corrente.firma_cse.timestamp_firma = new Date().toISOString();
      e.target.value = '';
      this._scheduleAutosave();
    },

    rimuoviFirmaCse() {
      if (!this.corrente) return;
      this.corrente.firma_cse.firma_png_base64 = null;
      this.corrente.firma_cse.tipo_firma      = null;
      this._scheduleAutosave();
    },

    async onUploadVisto(campo, e) {
      const file = e.target.files?.[0];
      if (!file || !this.corrente) return;
      const png = await _leggiBase64(file);
      this.corrente[campo].firma_png_base64 = png;
      this.corrente[campo].tipo_firma      = 'upload';
      this.corrente[campo].timestamp_firma = new Date().toISOString();
      e.target.value = '';
      this._scheduleAutosave();
    },

    rimuoviVisto(campo) {
      if (!this.corrente) return;
      this.corrente[campo].firma_png_base64 = null;
      this.corrente[campo].tipo_firma      = null;
      this._scheduleAutosave();
    },

    // ── Finalizzazione ────────────────────────────────────────────────────────

    async finalizza() {
      if (!this.corrente) return;
      if (!this.corrente.esito) {
        const ok = confirm('Esito non selezionato. Puoi finalizzare comunque (guida non blocca). Procedere?');
        if (!ok) return;
      }
      if (!this.corrente.firma_cse.firma_png_base64) {
        const ok = confirm('Firma CSE non caricata (non bloccante — firma legale via GoSign esterno). Finalizzare comunque?');
        if (!ok) return;
      }
      this.generando = true;
      try {
        const corpo = await generaCorpoHtmlVerificaPos(this.corrente);
        const out   = await MOTORE_DOCX.generaDocumento({
          tipo: 'verifica-pos', header: _intestazioneVP(),
          corpo_html: corpo, formati: { html: true, docx: true },
        });
        this.corrente.stato      = 'FINALIZZATO_DA_PROTOCOLLARE';
        this.corrente.corpo_html = corpo;
        await this.salva();
        NOTIFICHE.successo('Finalizzata', 'DOCX pronto — usa il pulsante Scarica.');
        const win = window.open('', '_blank');
        if (win) { win.document.write(out.htmlString); win.document.close(); }
      } catch (err) { ERRORI.gestisciErrore('verifica-pos/finalizza', err); }
      finally { this.generando = false; }
    },

    async apriAnteprima() {
      if (!this.corrente) return;
      try {
        const corpo = await generaCorpoHtmlVerificaPos(this.corrente);
        const out   = await MOTORE_DOCX.generaDocumento({
          tipo: 'verifica-pos', header: _intestazioneVP(),
          corpo_html: corpo, formati: { html: true },
        });
        const win = window.open('', '_blank');
        if (win) { win.document.write(out.htmlString); win.document.close(); }
      } catch (err) { ERRORI.gestisciErrore('verifica-pos/anteprima', err); }
    },

    async scaricaDocx() {
      if (!this.corrente) return;
      this.generando = true;
      try {
        const corpo = this.corrente.corpo_html || await generaCorpoHtmlVerificaPos(this.corrente);
        const out   = await MOTORE_DOCX.generaDocumento({
          tipo: 'verifica-pos', header: _intestazioneVP(),
          corpo_html: corpo, formati: { docx: true },
        });
        const url = URL.createObjectURL(out.docxBlob);
        const a   = document.createElement('a');
        a.href = url; a.download = `verifica-pos-${this.corrente.creato_il?.slice(0,10) ?? UTILS.oggi()}.docx`;
        a.click(); setTimeout(() => URL.revokeObjectURL(url), 5000);
      } catch (err) { ERRORI.gestisciErrore('verifica-pos/scarica-docx', err); }
      finally { this.generando = false; }
    },

    // ── Protocollazione ───────────────────────────────────────────────────────

    async salvaProtocollo() {
      if (!this.proto.numero.trim()) {
        NOTIFICHE.attenzione('Campo richiesto', 'Inserisci il numero di protocollo.'); return;
      }
      this.proto.salvando = true;
      try {
        const cantId  = Alpine.store('cantiere').id;
        const root    = FILESYSTEM.getHandleAttivo();
        const cantDir = await root.getDirectoryHandle(cantId);
        const prtDir  = await FILESYSTEM.navigaPercorso(cantDir, ['03_Verifiche-POS', 'Protocollati'], true);
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

        // Hook diario — fire-and-forget: la protocollazione non deve mai fallire per questo
        _hookDiarioVPProtocollata(this.corrente, cantId).catch(e => console.warn('[diario] hook VP:', e));

        try {
          const bDir = await FILESYSTEM.navigaPercorso(cantDir, ['03_Verifiche-POS', 'Bozze']);
          const bz   = await FILESYSTEM.leggiJson(bDir, `${this.corrente.id}.json`);
          await FILESYSTEM.scriviJson(bDir, `${this.corrente.id}.json`,
            { ...bz, _cestino: true, _eliminato_il: new Date().toISOString() });
        } catch { /* bozza già rimossa: ok */ }
        this.drawerProtocolloAperto = false;
        this.proto = { numero: '', data: '', _pdfFile: null, _letteraFile: null, salvando: false };
        NOTIFICHE.successo('Protocollata', `Verifica n. ${this.corrente.numero_progressivo} archiviata.`);
        await this._caricaLista();
        this.vistaLista = 'protocollati';
        await this._caricaProtocollati();
        this.corrente = null;
      } catch (err) { ERRORI.gestisciErrore('verifica-pos/salva-protocollo', err); }
      finally { this.proto.salvando = false; }
    },

    onProtoPdfFile(e)  { this.proto._pdfFile     = e.target.files?.[0] ?? null; },
    onProtoLettFile(e) { this.proto._letteraFile = e.target.files?.[0] ?? null; },

    // ── Utility ──────────────────────────────────────────────────────────────

    async _bozzeDir(crea = false) {
      const cantDir = await FILESYSTEM.getHandleAttivo().getDirectoryHandle(Alpine.store('cantiere').id);
      return FILESYSTEM.navigaPercorso(cantDir, ['03_Verifiche-POS', 'Bozze'], crea);
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
    esitoLabel() {
      return { idoneo:'Idoneo', idoneo_integrazioni:'Idoneo con integrazioni', non_idoneo:'NON idoneo' }
             [this.corrente?.esito] ?? 'Esito non selezionato';
    },
  };
}

// ── generaCorpoHtmlVerificaPos ─────────────────────────────────────────────────
// Funzione pura ASYNC. Fedele al Mod.RE.01-5.
// Esito = scelta singola → 3 voci sempre visibili con ☑/☐.

async function generaCorpoHtmlVerificaPos(d) {
  const esc  = (s) => UTILS.escapeHtml(s ?? '');
  const p    = [];
  const chkR = (val) => d.esito === val ? '☑' : '☐';

  // Pre-scala le 3 firme
  const [cseImg, rlImg, areaImg] = await Promise.all([
    _scalafirma(d.firma_cse?.firma_png_base64  ?? null),
    _scalafirma(d.visto_rl?.firma_png_base64   ?? null),
    _scalafirma(d.visto_area?.firma_png_base64 ?? null),
  ]);

  // 1. Tabella amministrativa
  p.push(
    '<table>' +
    '<thead><tr><th>PPM/SIL / OdA</th><th>Commessa</th><th>Voce di Budget/Spesa</th><th>CUP</th><th>CIG</th></tr></thead>' +
    '<tbody><tr>' +
    `<td>${esc(d.tabella_amm?.ppm_sil_oda)}</td>` +
    `<td>${esc(d.tabella_amm?.commessa)}</td>` +
    `<td>${esc(d.tabella_amm?.voce_budget)}</td>` +
    `<td>${esc(d.tabella_amm?.cup)}</td>` +
    `<td>${esc(d.tabella_amm?.cig)}</td>` +
    '</tr></tbody></table>'
  );
  p.push(`<p data-align="right">Protocollo n. ___________</p>`);

  // 2. Destinatari (data-indent=destra)
  const pd = 'data-indent="destra"';
  const impNome = esc(d.destinatari?.impresa_nome ?? '');
  const impPec  = esc(d.destinatari?.pec_impresa  ?? '');
  p.push(`<p ${pd}>All'Impresa Affidataria${impNome ? '<br>' + impNome : ''}${impPec ? '<br>PEC: ' + impPec : ''}</p>`);
  const rst = esc(d.destinatari?.resp_struttura_territoriale ?? '');
  p.push(`<p ${pd}>E, p.c.:<br>Al Responsabile della Struttura Territoriale SEDE${rst ? '<br>' + rst : ''}</p>`);

  // 3. Oggetto (data-line=exact280)
  const ss  = esc(d.intestazione?.ss ?? '');
  const lav = esc(d.intestazione?.lavori ?? '');
  const cod = esc(d.intestazione?.cod_ppm_sil ?? '');
  p.push(`<p data-line="exact280"><strong>Oggetto:</strong> S.S. n° ${ss}</p>`);
  if (lav) p.push(`<p data-line="exact280"><strong>Lavori:</strong> ${lav}</p>`);
  if (cod) p.push(`<p data-line="exact280"><strong>Cod. PPM/SIL:</strong> ${cod}</p>`);

  // 4. Titolo (centrato, bold, stacco dall'oggetto)
  p.push(`<p data-align="center" data-before="200"><strong>VERIFICA PIANO OPERATIVO DI SICUREZZA AI SENSI DELL'ART. 92 C.1 LETTERA B) DEL D.LGS 81/08</strong></p>`);

  // 5. Sottoscritto CSE (interlinea 1,5)
  const cseNome = esc(d.firma_cse?.nome_cognome ?? '');
  p.push(
    `<p data-line="15">Il sottoscritto <strong>${cseNome || '___'}</strong>, ` +
    `nella sua qualità di Coordinatore per l'Esecuzione dei lavori ai sensi e per gli effetti ` +
    `dell'art. 92 comma 1 del D.Lgs. 81/2008</p>`
  );

  // 6. VISTO + testo (interlinea 1,5, stacco da sottoscritto)
  p.push(`<p data-align="center" data-before="160"><strong>VISTO</strong></p>`);
  p.push(
    `<p data-line="15">Il Piano Operativo di Sicurezza inoltrato da codesta Impresa Affidataria e ` +
    `verificata la congruenza dello stesso a quanto previsto dal D.Lgs 81/08,</p>`
  );

  // 7. DICHIARA + 3 voci SCELTA SINGOLA (sempre visibili con ☑/☐)
  p.push(`<p data-align="center" data-before="160"><strong>DICHIARA</strong></p>`);

  const impVerif = d.impresa_verificata?.impresa_id
    ? _nomeImpresaGenVP(d.impresa_verificata.impresa_id)
    : (d.impresa_verificata?.testo?.trim() || '______');

  p.push(`<p data-indent="elenco">${chkR('idoneo')} idoneo il Piano Operativo di Sicurezza dell'impresa ${esc(impVerif)}</p>`);
  p.push(`<p data-indent="elenco">${chkR('idoneo_integrazioni')} idoneo il POS dell'impresa ${esc(impVerif)} con la richiesta delle seguenti integrazioni:</p>`);
  p.push(`<p data-indent="elenco">${chkR('non_idoneo')} NON idoneo il POS dell'impresa ${esc(impVerif)} in quanto non conforme con quanto previsto dall'Allegato XV del D.Lgs. 81/2008, con la richiesta di ripresentare il POS conformemente a quanto previsto dal citato Decreto.</p>`);

  // 8. Note (sempre presente, interlinea 1,5 via helper)
  if (d.note?.trim()) {
    p.push(_applicaInterlinea15(d.note));
  }

  // 9. Firme — 3 colonne: CSE | Visto RL | Visto Area
  const _bloccoF = (titolo, nome, img) => {
    const parts = [esc(titolo)];
    if (nome) parts.push(esc(nome));
    parts.push(img ? `<img src="${img}" alt="firma">` : '');
    return parts.join('<br>');
  };

  const cseFBlocco  = _bloccoF("Il Coordinatore per l'Esecuzione",            d.firma_cse?.nome_cognome  ?? '', cseImg);
  const rlFBlocco   = _bloccoF('Visto: Il Responsabile dei Lavori',            d.visto_rl?.nome_cognome   ?? '', rlImg);
  const areaFBlocco = _bloccoF('Visto: Il Resp. Area Gestione Rete / N.Opere', d.visto_area?.nome_cognome ?? '', areaImg);

  const tdA = 'data-align="center" style="text-align:center"';
  // Paragrafo vuoto con spacing come separatore prima della tabella firme
  p.push(`<p data-before="200"></p>`);
  p.push(
    '<table data-border="none"><tbody><tr>' +
    `<td ${tdA}>${cseFBlocco}</td>` +
    `<td ${tdA}>${rlFBlocco}</td>` +
    `<td ${tdA}>${areaFBlocco}</td>` +
    '</tr></tbody></table>'
  );

  return p.join('\n');
}

// ── Hook Diario CSE — best-effort (non blocca mai la protocollazione) ─────────

async function _hookDiarioVPProtocollata(corrente, cantiere_id) {
  if (typeof DIARIO_SERVICE === 'undefined') return;
  const numero   = corrente.numero_progressivo ?? '';
  const dataProt = corrente.protocollo?.data_protocollo
                   ? UTILS.formatData(corrente.protocollo.data_protocollo) : '';
  const impId    = corrente.impresa_verificata?.impresa_id ?? corrente.impresa_id ?? '';
  const impNome  = impId ? (_nomeImpresaGenVP(impId) || impId) : '';
  const esitoMap = { idoneo: 'idonea', idoneo_integrazioni: 'idonea con integrazioni', non_idoneo: 'non idonea' };
  const esito    = esitoMap[corrente.esito] ?? '';
  const titolo   = impNome
    ? `Verifica POS impresa ${impNome} protocollata${numero ? ': n. ' + numero : ''}`
    : `Verifica POS protocollata${numero ? ': n. ' + numero : ''}`;
  const desc     = [
    impNome  ? `Impresa: ${impNome}`          : null,
    esito    ? `Esito: ${esito}`              : null,
    dataProt ? `Data protocollo: ${dataProt}` : null,
  ].filter(Boolean).join('\n');
  await DIARIO_SERVICE.creaVoceAuto({
    cantiere_id,
    tipo:        'VERIFICA_POS',
    titolo,
    descrizione: desc,
    soggetti:    impNome ? [impNome] : [],
    riferimento: corrente.id,
  });
}

function _nomeImpresaGenVP(id) {
  try { return ANAGRAFICA_SERVICE.getEntita('imprese', id)?.ragioneSociale ?? id ?? ''; }
  catch { return id ?? ''; }
}

// ── Template HTML ─────────────────────────────────────────────────────────────

const _TEMPLATE_VP = /* html */`
<div x-data="VerificaPos()" x-init="init()"
     class="p-4 max-w-4xl mx-auto pb-32" role="region"
     aria-label="Verifica idoneità Piano Operativo di Sicurezza"
     @firma-acquisita="onFirmaAcquisita($event.detail.png)"
     @firma-annullata="firmaModal = null">

  <!-- HEADER -->
  <div class="flex flex-wrap items-center justify-between gap-3 mb-4">
    <div class="flex items-center gap-3">
      <button x-show="corrente !== null" @click="chiudiEditor()"
              class="text-slate-400 hover:text-slate-700 p-1 rounded transition-colors
                     focus:outline-none focus:ring-2 focus:ring-blue-500" aria-label="Torna">&#8592;</button>
      <h2 class="text-lg font-semibold text-slate-800">Verifica idoneità Piano Operativo di Sicurezza</h2>
    </div>
    <div class="flex items-center gap-2">
      <button @click="noteAperte = !noteAperte" :aria-expanded="String(noteAperte)"
              class="text-xs text-sky-700 bg-sky-50 border border-sky-200 px-2.5 py-1 rounded-full
                     hover:bg-sky-100 transition-colors focus:outline-none focus:ring-2 focus:ring-sky-400">
        &#x2139; Note normative
      </button>
      <template x-if="corrente !== null">
        <span class="text-xs px-2 py-0.5 rounded-full font-medium"
              :class="etichettaStato(corrente.stato)" x-text="statoLabel"></span>
      </template>
    </div>
  </div>

  <!-- NOTE NORMATIVE -->
  <div x-show="noteAperte" x-transition class="nota-normativa-panel mb-4" role="note">
    <p class="text-xs text-sky-500 mb-2 italic">Promemoria per il CSE — non compare nel documento.</p>
    <template x-for="nota in noteVP" :key="nota.titolo">
      <div><h4 x-text="nota.titolo"></h4><p x-text="nota.testo"></p></div>
    </template>
  </div>

  <!-- VISTA LISTA -->
  <div x-show="corrente === null">
    <div class="flex items-center gap-1 bg-slate-100 rounded-lg p-1 mb-4 w-fit">
      <button @click="vistaLista='bozze'; _caricaLista()"
              :class="vistaLista==='bozze' ? 'bg-white shadow text-slate-800' : 'text-slate-500 hover:text-slate-700'"
              class="text-sm font-medium px-3 py-1.5 rounded-md transition-all focus:outline-none focus:ring-2 focus:ring-blue-500">
        Bozze
      </button>
      <button @click="vistaLista='protocollati'; _caricaProtocollati()"
              :class="vistaLista==='protocollati' ? 'bg-white shadow text-slate-800' : 'text-slate-500 hover:text-slate-700'"
              class="text-sm font-medium px-3 py-1.5 rounded-md transition-all focus:outline-none focus:ring-2 focus:ring-blue-500">
        Protocollate
      </button>
    </div>

    <div class="flex justify-between items-center mb-3">
      <p class="text-sm text-slate-500">
        <span x-show="caricamento">Caricamento...</span>
        <span x-show="!caricamento && vistaLista==='bozze' && lista.length===0 && Alpine.store('cantiere').id">Nessuna bozza.</span>
        <span x-show="!caricamento && vistaLista==='protocollati' && listaProtocollati.length===0 && Alpine.store('cantiere').id">Nessuna verifica protocollata.</span>
        <span x-show="!Alpine.store('cantiere').id" class="text-amber-600">Seleziona un cantiere.</span>
      </p>
      <button x-show="vistaLista==='bozze'" @click="nuovo()" :disabled="!Alpine.store('cantiere').id"
              class="bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white text-sm font-medium
                     px-4 py-2 rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2">
        + Nuova verifica POS
      </button>
    </div>

    <div x-show="vistaLista==='bozze'" class="space-y-2">
      <template x-for="v in lista" :key="v.id">
        <div class="bg-white border border-slate-200 rounded-lg px-4 py-3 flex items-center gap-3 hover:border-slate-300 transition-colors">
          <div class="flex-1 min-w-0 cursor-pointer" @click="apri(v.id)">
            <div class="flex items-center gap-2 flex-wrap">
              <span class="text-sm font-medium text-slate-800"
                    x-text="v.impresa_verificata?.testo || v.destinatari?.impresa_nome || 'Bozza'"></span>
              <span class="text-xs px-2 py-0.5 rounded-full font-medium"
                    :class="etichettaStato(v.stato)"
                    x-text="{ BOZZA:'Bozza', FINALIZZATO_DA_PROTOCOLLARE:'Da protocollare', PROTOCOLLATO:'Protocollato' }[v.stato]??v.stato"></span>
              <template x-if="v.esito">
                <span class="text-xs text-slate-400"
                      x-text="{ idoneo:'Idoneo', idoneo_integrazioni:'Idoneo+integ.', non_idoneo:'NON idoneo' }[v.esito]"></span>
              </template>
            </div>
            <p class="text-xs text-slate-400 mt-0.5" x-text="v.creato_il ? 'Creata il ' + formatDataLabel(v.creato_il) : ''"></p>
          </div>
          <button @click.stop="cestina(v.id)"
                  class="text-slate-300 hover:text-red-500 text-lg p-1 transition-colors focus:outline-none focus:ring-2 focus:ring-red-400 rounded"
                  aria-label="Cestina">&#10005;</button>
        </div>
      </template>
    </div>

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
                 x-text="v.impresa_verificata?.testo || ''"></p>
            </div>
            <div class="flex items-center gap-2 flex-shrink-0">
              <button x-show="v.protocollo?.file_pdf_protocollato"
                      @click="apriFileProt(v.protocollo.file_pdf_protocollato)"
                      class="text-xs text-blue-600 bg-blue-50 border border-blue-200 px-2 py-1 rounded hover:bg-blue-100 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500">
                &#128196; PDF
              </button>
              <button x-show="v.protocollo?.file_lettera"
                      @click="apriFileProt(v.protocollo.file_lettera)"
                      class="text-xs text-slate-600 bg-slate-50 border border-slate-200 px-2 py-1 rounded hover:bg-slate-100 transition-colors focus:outline-none focus:ring-2 focus:ring-slate-400">
                &#128196; Lettera
              </button>
            </div>
          </div>
        </div>
      </template>
    </div>
  </div>

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
          <button role="tab" class="modulo-tab" :class="{'attiva': scheda==='firme'}"
                  @click="scheda='firme'" :aria-selected="String(scheda==='firme')">Firme
            <template x-if="!corrente.firma_cse.firma_png_base64">
              <span class="ml-1 text-xs bg-amber-100 text-amber-700 rounded-full px-1.5">!</span>
            </template>
          </button>
        </div>

        <!-- TAB DOCUMENTO -->
        <div x-show="scheda==='documento'" role="tabpanel">

          <!-- Tabella amministrativa -->
          <h3 class="text-sm font-semibold text-slate-700 mb-3">Dati amministrativi (da anagrafica)</h3>
          <div class="grid grid-cols-2 md:grid-cols-3 gap-3 mb-4">
            <div>
              <label class="block text-xs text-slate-500 mb-1">PPM/SIL / OdA</label>
              <input type="text" x-model="corrente.tabella_amm.ppm_sil_oda" @input="_scheduleAutosave()"
                     class="w-full border border-slate-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
            </div>
            <div>
              <label class="block text-xs text-slate-500 mb-1">Commessa</label>
              <input type="text" x-model="corrente.tabella_amm.commessa" @input="_scheduleAutosave()"
                     class="w-full border border-slate-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
            </div>
            <div>
              <label class="block text-xs text-slate-500 mb-1">Voce di Budget/Spesa</label>
              <input type="text" x-model="corrente.tabella_amm.voce_budget" @input="_scheduleAutosave()"
                     class="w-full border border-slate-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
            </div>
            <div>
              <label class="block text-xs text-slate-500 mb-1">CUP</label>
              <input type="text" x-model="corrente.tabella_amm.cup" @input="_scheduleAutosave()"
                     class="w-full border border-slate-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
            </div>
            <div>
              <label class="block text-xs text-slate-500 mb-1">CIG</label>
              <input type="text" x-model="corrente.tabella_amm.cig" @input="_scheduleAutosave()"
                     class="w-full border border-slate-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
            </div>
          </div>
          <p class="text-xs text-slate-400 mb-4 italic">Il riquadro 'Protocollo' è lasciato vuoto — compilato dai superiori.</p>

          <!-- Impresa verificata -->
          <h3 class="text-sm font-semibold text-slate-700 mb-3">Impresa di cui si verifica il POS</h3>
          <div class="bg-slate-50 border border-slate-200 rounded-lg p-3 mb-4">
            <select @change="selezionaImpresaVerificata($event.target.value)"
                    class="w-full text-xs border border-slate-300 rounded px-2 py-1.5 mb-2 focus:outline-none focus:ring-2 focus:ring-blue-500">
              <option value="">-- Seleziona da anagrafica --</option>
              <template x-for="imp in imprese" :key="imp.id">
                <option :value="imp.id" x-text="imp.ragioneSociale"></option>
              </template>
            </select>
            <input type="text" x-model="corrente.impresa_verificata.testo" @input="_scheduleAutosave()"
                   placeholder="Ragione sociale (modificabile)"
                   class="w-full border border-slate-300 rounded px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
          </div>

          <!-- Destinatari -->
          <h3 class="text-sm font-semibold text-slate-700 mb-3">Destinatari</h3>
          <div class="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
            <div class="bg-slate-50 border border-slate-200 rounded-lg p-3">
              <p class="text-xs text-slate-400 mb-2">All'Impresa Affidataria</p>
              <select @change="selezionaImpresaDestinatario($event.target.value)"
                      class="w-full text-xs border border-slate-300 rounded px-2 py-1 mb-1 focus:outline-none focus:ring-2 focus:ring-blue-500">
                <option value="">-- Da anagrafica --</option>
                <template x-for="imp in imprese" :key="imp.id">
                  <option :value="imp.id" x-text="imp.ragioneSociale"></option>
                </template>
              </select>
              <input type="text" x-model="corrente.destinatari.impresa_nome" @input="_scheduleAutosave()"
                     placeholder="Ragione sociale"
                     class="w-full border border-slate-300 rounded px-2 py-1 text-sm mb-1 focus:outline-none focus:ring-2 focus:ring-blue-500">
              <input type="text" x-model="corrente.destinatari.pec_impresa" @input="_scheduleAutosave()"
                     placeholder="PEC impresa (manuale o da anagrafica)"
                     class="w-full border border-slate-300 rounded px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
            </div>
            <div class="bg-slate-50 border border-slate-200 rounded-lg p-3">
              <p class="text-xs text-slate-400 mb-2">p.c. Responsabile Struttura Territoriale SEDE</p>
              <input type="text" x-model="corrente.destinatari.resp_struttura_territoriale"
                     @input="_scheduleAutosave()"
                     placeholder="es. ANAS - Struttura Territoriale Calabria (manuale)"
                     class="w-full border border-slate-300 rounded px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
            </div>
          </div>

          <!-- DICHIARA — esito a scelta SINGOLA (radio) -->
          <fieldset class="mb-4">
            <legend class="text-xs font-semibold text-slate-700 mb-3">DICHIARA — esito (scelta singola)</legend>
            <div class="space-y-3">
              <label class="flex items-start gap-3 cursor-pointer p-2 rounded-lg hover:bg-green-50 transition-colors"
                     :class="corrente.esito==='idoneo' ? 'bg-green-50 border border-green-200' : 'border border-transparent'">
                <input type="radio" value="idoneo" x-model="corrente.esito" @change="_scheduleAutosave()"
                       class="mt-0.5 w-4 h-4 text-green-600 focus:ring-2 focus:ring-green-500">
                <span class="text-sm">idoneo il Piano Operativo di Sicurezza dell'impresa
                  <em x-text="corrente.impresa_verificata?.testo || '___'"></em>
                </span>
              </label>
              <label class="flex items-start gap-3 cursor-pointer p-2 rounded-lg hover:bg-amber-50 transition-colors"
                     :class="corrente.esito==='idoneo_integrazioni' ? 'bg-amber-50 border border-amber-200' : 'border border-transparent'">
                <input type="radio" value="idoneo_integrazioni" x-model="corrente.esito" @change="_scheduleAutosave()"
                       class="mt-0.5 w-4 h-4 text-amber-600 focus:ring-2 focus:ring-amber-500">
                <span class="text-sm">idoneo il POS dell'impresa
                  <em x-text="corrente.impresa_verificata?.testo || '___'"></em>
                  con la richiesta delle seguenti integrazioni:
                </span>
              </label>
              <label class="flex items-start gap-3 cursor-pointer p-2 rounded-lg hover:bg-red-50 transition-colors"
                     :class="corrente.esito==='non_idoneo' ? 'bg-red-50 border border-red-200' : 'border border-transparent'">
                <input type="radio" value="non_idoneo" x-model="corrente.esito" @change="_scheduleAutosave()"
                       class="mt-0.5 w-4 h-4 text-red-600 focus:ring-2 focus:ring-red-500">
                <span class="text-sm">NON idoneo il POS dell'impresa
                  <em x-text="corrente.impresa_verificata?.testo || '___'"></em>
                  in quanto non conforme con quanto previsto dall'Allegato XV del D.Lgs. 81/2008,
                  con la richiesta di ripresentare il POS.
                </span>
              </label>
            </div>
          </fieldset>

          <!-- Note (SEMPRE disponibili, editor ricco) -->
          <h3 class="text-sm font-semibold text-slate-700 mb-2">
            Note
            <span class="text-xs font-normal text-slate-400 ml-1">— sempre presente (integrazioni richieste, motivazione, ecc.)</span>
          </h3>
          <div class="editor-ricco-wrapper mb-4">
            <div class="editor-toolbar" role="toolbar" aria-label="Formattazione note">
              <button type="button" @mousedown.prevent="edBoldNote()"><strong>B</strong></button>
              <button type="button" @mousedown.prevent="edItalicNote()"><em>I</em></button>
              <div class="sep"></div>
              <button type="button" @mousedown.prevent="edAllineaNote('l')">&#8678;</button>
              <button type="button" @mousedown.prevent="edAllineaNote('c')">&#9675;</button>
              <button type="button" @mousedown.prevent="edAllineaNote('r')">&#8680;</button>
            </div>
            <div id="ed-note-vp" contenteditable="true" role="textbox" aria-multiline="true"
                 aria-label="Note (integrazioni richieste, motivazione)"
                 @input.debounce.300ms="onEditorNoteInput()"
                 @paste.prevent="onEditorNotePaste($event)"
                 class="editor-area"></div>
          </div>

        </div><!-- /tab documento -->

        <!-- TAB FIRME -->
        <div x-show="scheda==='firme'" role="tabpanel">
          <div class="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 mb-4 text-xs text-amber-800">
            <strong>Nota firma legale:</strong> La firma legalmente valida avviene via <strong>GoSign</strong>
            (strumento esterno a SafeHub). Le firme qui caricate sono grafiche/di lavoro e non hanno valore legale.
          </div>

          <!-- Firma CSE (canvas + upload) -->
          <h3 class="text-sm font-semibold text-slate-700 mb-3">Il Coordinatore per l'Esecuzione</h3>
          <div class="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
            <p class="text-sm font-medium" x-text="corrente.firma_cse.nome_cognome || '(identità non configurata in Impostazioni)'"></p>
            <p class="text-xs text-slate-600 mt-0.5" x-text="corrente.firma_cse.qualifica"></p>
            <template x-if="corrente.firma_cse.tipo_firma === 'permanente'">
              <p class="text-xs text-blue-500 mt-0.5">Firma permanente da Impostazioni.</p>
            </template>
            <template x-if="corrente.firma_cse.firma_png_base64">
              <div class="flex items-center gap-3 mt-3">
                <img :src="corrente.firma_cse.firma_png_base64" class="h-10 border rounded bg-white" alt="firma CSE">
                <span class="text-xs text-green-600">&#10003; Firmato</span>
                <button @click="rimuoviFirmaCse()" class="text-xs text-slate-400 hover:text-red-500 underline">Sostituisci</button>
              </div>
            </template>
            <template x-if="!corrente.firma_cse.firma_png_base64">
              <div class="flex gap-2 flex-wrap mt-2">
                <button @click="apriCanvasFirma()"
                        class="text-xs bg-blue-600 text-white px-3 py-1.5 rounded hover:bg-blue-700 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500">
                  &#9997; Firma con canvas
                </button>
                <label class="text-xs bg-white text-blue-700 border border-blue-300 px-3 py-1.5 rounded hover:bg-blue-50 cursor-pointer transition-colors">
                  &#128206; Carica PNG
                  <input type="file" accept=".png,image/png" class="sr-only" @change="onUploadFirmaCse($event)">
                </label>
              </div>
            </template>
          </div>

          <!-- Visto RL (upload) -->
          <h3 class="text-sm font-semibold text-slate-700 mb-3">Visto: Il Responsabile dei Lavori</h3>
          <div class="bg-slate-50 border border-slate-200 rounded-lg p-4 mb-4">
            <div class="mb-2">
              <label class="block text-xs text-slate-500 mb-1">Cognome e Nome RL (opzionale)</label>
              <input type="text" x-model="corrente.visto_rl.nome_cognome" @input="_scheduleAutosave()"
                     class="w-full border border-slate-300 rounded px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
            </div>
            <template x-if="corrente.visto_rl.firma_png_base64">
              <div class="flex items-center gap-3">
                <img :src="corrente.visto_rl.firma_png_base64" class="h-10 border rounded bg-white" alt="firma RL">
                <span class="text-xs text-green-600">&#10003;</span>
                <button @click="rimuoviVisto('visto_rl')" class="text-xs text-slate-400 hover:text-red-500 underline">Rimuovi</button>
              </div>
            </template>
            <template x-if="!corrente.visto_rl.firma_png_base64">
              <label class="inline-flex text-xs bg-white text-slate-700 border border-slate-300 px-3 py-1.5 rounded hover:bg-slate-50 cursor-pointer transition-colors">
                &#128206; Carica firma PNG
                <input type="file" accept=".png,image/png" class="sr-only" @change="onUploadVisto('visto_rl', $event)">
              </label>
            </template>
          </div>

          <!-- Visto Area (upload) -->
          <h3 class="text-sm font-semibold text-slate-700 mb-3">Visto: Il Responsabile Area Gestione Rete / Nuove Opere</h3>
          <div class="bg-slate-50 border border-slate-200 rounded-lg p-4">
            <div class="mb-2">
              <label class="block text-xs text-slate-500 mb-1">Qualifica (modificabile)</label>
              <input type="text" x-model="corrente.visto_area.qualifica" @input="_scheduleAutosave()"
                     class="w-full border border-slate-300 rounded px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
            </div>
            <div class="mb-2">
              <label class="block text-xs text-slate-500 mb-1">Cognome e Nome (opzionale)</label>
              <input type="text" x-model="corrente.visto_area.nome_cognome" @input="_scheduleAutosave()"
                     class="w-full border border-slate-300 rounded px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
            </div>
            <template x-if="corrente.visto_area.firma_png_base64">
              <div class="flex items-center gap-3">
                <img :src="corrente.visto_area.firma_png_base64" class="h-10 border rounded bg-white" alt="firma Area">
                <span class="text-xs text-green-600">&#10003;</span>
                <button @click="rimuoviVisto('visto_area')" class="text-xs text-slate-400 hover:text-red-500 underline">Rimuovi</button>
              </div>
            </template>
            <template x-if="!corrente.visto_area.firma_png_base64">
              <label class="inline-flex text-xs bg-white text-slate-700 border border-slate-300 px-3 py-1.5 rounded hover:bg-slate-50 cursor-pointer transition-colors">
                &#128206; Carica firma PNG
                <input type="file" accept=".png,image/png" class="sr-only" @change="onUploadVisto('visto_area', $event)">
              </label>
            </template>
          </div>

        </div><!-- /tab firme -->

        <!-- FOOTER AZIONI -->
        <div class="fixed bottom-0 left-0 right-0 bg-white border-t border-slate-200
                    px-6 py-4 flex flex-wrap items-center justify-between gap-3 z-50"
             style="left: var(--nav-width, 220px);">
          <button @click="chiudiEditor()"
                  class="text-sm text-slate-500 hover:text-slate-700 px-4 py-2 border border-slate-300
                         rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-slate-400">
            &#8592; Torna alla lista
          </button>
          <div class="flex gap-2 flex-wrap">
            <button x-show="corrente.stato !== 'PROTOCOLLATO'" @click="salva()" :disabled="generando"
                    class="text-sm text-slate-700 border border-slate-300 px-4 py-2 rounded-lg hover:bg-slate-50
                           transition-colors disabled:opacity-40 focus:outline-none focus:ring-2 focus:ring-slate-400">
              Salva bozza
            </button>
            <button x-show="corrente.stato !== 'PROTOCOLLATO'" @click="apriAnteprima()" :disabled="generando"
                    class="text-sm text-slate-700 border border-slate-300 px-4 py-2 rounded-lg hover:bg-slate-50
                           transition-colors disabled:opacity-40 focus:outline-none focus:ring-2 focus:ring-slate-400">
              Anteprima
            </button>
            <button x-show="corrente.stato === 'BOZZA'" @click="finalizza()" :disabled="generando"
                    class="bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white text-sm font-medium
                           px-5 py-2 rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2">
              <span x-text="generando ? 'Generazione...' : 'Finalizza'"></span>
            </button>
            <button x-show="corrente.stato === 'FINALIZZATO_DA_PROTOCOLLARE'"
                    @click="scaricaDocx()" :disabled="generando"
                    class="bg-green-600 hover:bg-green-700 disabled:opacity-40 text-white text-sm font-medium
                           px-5 py-2 rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2">
              <span x-text="generando ? 'Generazione...' : '&#8595; Scarica DOCX'"></span>
            </button>
            <button x-show="corrente.stato === 'FINALIZZATO_DA_PROTOCOLLARE'"
                    @click="drawerProtocolloAperto = true"
                    class="text-sm text-slate-700 border border-slate-300 px-4 py-2 rounded-lg hover:bg-slate-50
                           transition-colors focus:outline-none focus:ring-2 focus:ring-slate-400">
              Protocolla
            </button>
          </div>
        </div>

      </div>
    </template>
  </div>

  <!-- MODAL CANVAS FIRMA CSE -->
  <div x-show="firmaModal !== null" x-transition.opacity
       class="fixed inset-0 z-[200] flex items-center justify-center bg-black/40 p-4"
       @keydown.escape.window="firmaModal = null">
    <template x-if="firmaModal !== null">
      <div class="bg-white rounded-xl shadow-2xl p-5 w-full max-w-md"
           x-data="FirmaCanvas()" x-init="init()"
           @firma-acquisita="$root.onFirmaAcquisita($event.detail.png)"
           @firma-annullata="$root.firmaModal = null"
           role="dialog" aria-modal="true" aria-label="Canvas firma CSE">
        <h3 class="text-sm font-semibold text-slate-800 mb-3">Traccia firma CSE</h3>
        <canvas x-ref="canvas" class="firma-canvas-area"
                @pointerdown="startDraw($event)" @pointermove="draw($event)"
                @pointerup="endDraw()" @pointercancel="endDraw()"></canvas>
        <div class="flex gap-2 mt-3 justify-end">
          <button @click="pulisci()" class="text-sm text-slate-500 border border-slate-300 px-3 py-1.5 rounded-lg hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-slate-400">Pulisci</button>
          <button @click="annulla()" class="text-sm text-slate-500 border border-slate-300 px-3 py-1.5 rounded-lg hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-slate-400">Annulla</button>
          <button @click="usa()" class="text-sm bg-blue-600 text-white px-4 py-1.5 rounded-lg hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500">Usa firma</button>
        </div>
      </div>
    </template>
  </div>

  <!-- DRAWER PROTOCOLLAZIONE -->
  <div x-show="drawerProtocolloAperto" class="drawer-backdrop" @click="drawerProtocolloAperto=false"></div>
  <div x-show="drawerProtocolloAperto" x-transition.opacity class="drawer"
       role="dialog" aria-modal="true" aria-label="Protocollazione verifica POS">
    <div class="drawer-header px-5 py-4 border-b border-slate-200 flex items-center justify-between">
      <h3 class="font-semibold text-slate-800">Protocolla verifica POS</h3>
      <button @click="drawerProtocolloAperto=false"
              class="text-slate-400 hover:text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500 rounded"
              aria-label="Chiudi">&#10005;</button>
    </div>
    <div class="drawer-body px-5 py-4 space-y-4">
      <div>
        <label for="vp-proto-numero" class="block text-xs font-medium text-slate-600 mb-1">Numero protocollo <span class="text-red-500">*</span></label>
        <input id="vp-proto-numero" type="text" x-model="proto.numero" placeholder="es. 2026/044"
               class="w-full border border-slate-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
      </div>
      <div>
        <label for="vp-proto-data" class="block text-xs font-medium text-slate-600 mb-1">Data protocollo</label>
        <input id="vp-proto-data" type="date" x-model="proto.data"
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
window.MODULI_REGISTRATI['verifica-pos'] = {
  monta(contenitore) { contenitore.innerHTML = _TEMPLATE_VP; },
};
