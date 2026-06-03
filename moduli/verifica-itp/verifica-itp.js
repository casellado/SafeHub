/**
 * verifica-itp.js — Verifica idoneità tecnico-professionale (Mod.RE.01-13)
 * Quinto documento del Flusso B. Lettera firmata dal RESPONSABILE DEI LAVORI.
 *
 * OBBLIGO NORMATIVO: committente/RL ex art.90 c.9 + Allegato XVII D.Lgs 81/08.
 * Omessa verifica = sanzione PENALE (art.157). Il PO la redige, il RL la firma.
 * DISTINTA dalla Verifica POS (art.92, firmata dal CSE).
 *
 * NOTA STORAGE: usa 07_Verifiche-ITP/ (NON in scaffolding — slot 07 = 07_ODS-Inviati;
 * 03_Verifiche-POS/ è già usata dalla Verifica POS). Cartelle create on-demand.
 *
 * Pattern identico agli altri Flusso B (v0.8.0):
 *   ciclo BOZZA→FINALIZZATO→PROTOCOLLATO, vista Protocollati, auto-save, editor ricco.
 * Firme: RL e Visto Area — entrambe upload-only (firma legale = GoSign esterno).
 * CHECKLIST articolata: 4 blocchi, sempre tutti visibili (fedeltà al cartaceo).
 *   Blocchi condizionali con casella "non pertinente" che marca senza nascondere.
 *
 * NOTA DUPLICAZIONE: utility con suffisso IT. Fattorizzazione pianificata dopo questo.
 */

'use strict';

// ── Costanti ─────────────────────────────────────────────────────────────────

const _TITOLO_ITP = 'Verifica idoneità tecnico-professionale e ulteriori verifiche in capo ' +
                    'al Committente/Responsabile dei Lavori previste dall\'art. 90 del D.Lgs 81/08';

const NOTE_NORMATIVE_IT = {
  'verifica-itp': [
    {
      titolo: 'Obbligo committente/RL — art. 90 c.9 + Allegato XVII D.Lgs 81/08',
      testo:  'La verifica idoneità tecnico-professionale è obbligo del COMMITTENTE/RESPONSABILE ' +
              'DEI LAVORI (non del CSE). Allegato XVII: CCIAA, DVR/autocert, DURC, dichiarazione ' +
              'non oggetto provvedimenti art.14. L\'omessa verifica è sanzione PENALE (art.157).',
    },
    {
      titolo: 'Distinta dalla Verifica POS',
      testo:  'Questa verifica (art.90 c.9) è del committente/RL e riguarda l\'idoneità ' +
              'dell\'impresa. La Verifica POS (art.92) è del CSE e riguarda il piano di sicurezza. ' +
              'Sono due atti diversi, con due firmatari diversi.',
    },
    {
      titolo: 'Firma e trasmissione',
      testo:  'Firma: Responsabile dei Lavori. Firma legale via GoSign (strumento esterno). ' +
              'Destinatari: Area Amministrativa Gestionale Gare e Appalti; p.c. CSE, ' +
              'Responsabile Struttura Territoriale. Conservare copia. Trasmissione tracciabile.',
    },
  ],
};

// ── Utility (suffisso IT — anti-regressione) ──────────────────────────────────

function _scalafirmaIT(src, cW = 210, cH = 80) {
  if (!src) return Promise.resolve(null);
  return new Promise(resolve => {
    const img = new Image();
    img.onload = () => {
      const r = Math.min((cW * 0.80) / img.naturalWidth, (cH * 0.80) / img.naturalHeight, 1);
      const w = Math.max(1, Math.round(img.naturalWidth * r));
      const h = Math.max(1, Math.round(img.naturalHeight * r));
      const cv = document.createElement('canvas');
      cv.width = cW; cv.height = cH;
      cv.getContext('2d').drawImage(img, Math.round((cW - w) / 2), Math.round((cH - h) / 2), w, h);
      resolve(cv.toDataURL('image/png'));
    };
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

function _leggiBase64IT(file) {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload  = e => res(e.target.result);
    r.onerror = ()  => rej(new Error('Lettura file non riuscita'));
    r.readAsDataURL(file);
  });
}

async function _scriviFileIT(dirHandle, nome, file) {
  const fh = await dirHandle.getFileHandle(nome, { create: true });
  const w  = await fh.createWritable();
  await w.write(await file.arrayBuffer());
  await w.close();
}

function _intestazioneIT() {
  const m   = IMPOSTAZIONI_SERVICE.modulo('verifica-itp');
  // Override dei valori errati presenti in M2 (Mod.IT.01 / Rev.1-2026 / titolo corto):
  // non sono la chiave tecnica, quindi il bad Set deve includerli esplicitamente.
  const bad = new Set([
    'verifica-itp', '',
    'Mod.IT.01', 'Rev.1 — 2026',
    'Verifica idoneità tecnico-professionale',
  ]);
  const _ok = (v, def) => (!v || bad.has(v)) ? def : v;
  return {
    modulo_titolo:   _ok(m.titolo,   _TITOLO_ITP),
    modulo_codice:   _ok(m.codice,   'Mod.RE.01-13'),
    modulo_versione: _ok(m.versione, 'Vers. 4.0 del 13/05/2026'),
    logo_aziendale:  IMPOSTAZIONI_SERVICE.logo().png_base64 ?? null,
  };
}

// ── VerificaItp Alpine component ──────────────────────────────────────────────

function VerificaItp() {
  return {
    lista: [], listaProtocollati: [], vistaLista: 'bozze', caricamento: false,
    corrente: null, scheda: 'documento', generando: false,
    _autosaveTimer: null, _statoSalvataggio: 'salvato',
    noteAperte: false, drawerProtocolloAperto: false,
    proto: { numero: '', data: '', _pdfFile: null, _letteraFile: null, salvando: false },

    get noteIT()           { return NOTE_NORMATIVE_IT['verifica-itp']; },
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
          ['07_Verifiche-ITP', 'Bozze'], true
        );
        const voci = [];
        for await (const [nome] of bDir.entries()) {
          if (!nome.endsWith('.json')) continue;
          try { const d = await FILESYSTEM.leggiJson(bDir, nome); if (!d._cestino) voci.push(d); }
          catch { /* skip */ }
        }
        voci.sort((a, b) => (b.aggiornato_il ?? '').localeCompare(a.aggiornato_il ?? ''));
        this.lista = voci;
      } catch (err) { ERRORI.gestisciErrore('verifica-itp/carica-lista', err); }
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
            ['07_Verifiche-ITP', 'Protocollati'], false
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
      } catch (err) { ERRORI.gestisciErrore('verifica-itp/carica-protocollati', err); this.listaProtocollati = []; }
      finally { this.caricamento = false; }
    },

    async apriFileProt(filename) {
      if (!filename) return;
      try {
        const cantId = Alpine.store('cantiere').id;
        const prtDir = await FILESYSTEM.navigaPercorso(
          await FILESYSTEM.getHandleAttivo().getDirectoryHandle(cantId),
          ['07_Verifiche-ITP', 'Protocollati']
        );
        const url = URL.createObjectURL(await (await prtDir.getFileHandle(filename)).getFile());
        window.open(url, '_blank');
        setTimeout(() => URL.revokeObjectURL(url), 60000);
      } catch (err) { ERRORI.gestisciErrore('verifica-itp/apri-file-prot', err); }
    },

    // ── Nuovo documento ──────────────────────────────────────────────────────

    async nuovo() {
      const cantiere = Alpine.store('cantiere');
      if (!cantiere.id) return;
      await ANAGRAFICA_SERVICE.carica(cantiere.id);

      const lotto = ANAGRAFICA_SERVICE.dati?.lotto ?? {};
      const cse   = IMPOSTAZIONI_SERVICE.cse();
      const impAfId = lotto.impresaAffidatariaId ?? null;
      const impAf   = impAfId ? ANAGRAFICA_SERVICE.getEntita('imprese', impAfId) : null;

      const _resPc = (id) => {
        if (!id) return {};
        const pc = ANAGRAFICA_SERVICE.getEntita('persone_committente', id);
        return pc ? { qualifica: [pc.qualifica, pc.cognome, pc.nome].filter(Boolean).join(' '), nome_cognome: [pc.qualifica, pc.cognome, pc.nome].filter(Boolean).join(' ') } : {};
      };
      const rlData = _resPc(lotto.ruoli_istituzionali?.responsabileLavoriId ?? null);

      this.corrente = {
        id:          UTILS.uuid(),
        tipo_file:   'verifica_itp',
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
          area_gare:           'Area Amministrativa Gestionale - Gare e Appalti',
          cse_nome:            cse.nome_cognome ?? '',
          pec_cse:             '',
          resp_struttura:      lotto.strutturaTerritoriale ?? '',
        },

        intestazione: {
          ss:                   lotto.ssNumero ?? lotto.progressivaInizio ?? '',
          denominazione:        lotto.nome ?? '',
          lavori:               lotto.nome ?? '',
          progetto_perizia_n:   '',
          progetto_perizia_del: '',
          dispositivo_n:        '',
          dispositivo_del:      '',
        },

        rl: {
          qualifica:    rlData.qualifica    ?? '',
          nome_cognome: rlData.nome_cognome ?? '',
        },

        impresa_affidataria: {
          impresa_id: impAfId,
          testo:      impAf?.ragioneSociale ?? '',
        },
        imprese_esecutrici: '',

        blocco_a: {
          cciaa: false, dvr: false, durc: false, dich_art14: false,
        },

        lav_autonomi: {
          non_pertinente: false,
          cciaa: false, conformita: false, dpi: false, attestati: false, durc: false,
        },

        scenario_oltre200: {
          non_pertinente: false,
          organico: false, ccnl: false, patente_soa: false,
        },

        scenario_sotto200: {
          non_pertinente: false,
          durc: false, autocert_ccnl: false, patente_soa: false,
        },

        firma_rl: {
          qualifica:        rlData.qualifica    ?? '',
          nome_cognome:     rlData.nome_cognome ?? '',
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
    },

    async apri(id) {
      try {
        const dir = await this._bozzeDir();
        this.corrente = await FILESYSTEM.leggiJson(dir, `${id}.json`);
        this.scheda   = 'documento';
        this._statoSalvataggio = 'salvato';
      } catch (err) { ERRORI.gestisciErrore('verifica-itp/apri', err); }
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
      } catch (err) { this._statoSalvataggio = 'errore'; ERRORI.gestisciErrore('verifica-itp/salva', err); }
    },

    _scheduleAutosave() {
      this._statoSalvataggio = 'modificato';
      clearTimeout(this._autosaveTimer);
      this._autosaveTimer = setTimeout(() => this.salva(), 8000);
    },

    async cestina(id) {
      if (!confirm('Spostare la verifica ITP nel cestino?')) return;
      try {
        const dir = await this._bozzeDir();
        const d   = await FILESYSTEM.leggiJson(dir, `${id}.json`);
        await FILESYSTEM.scriviJson(dir, `${id}.json`,
          { ...d, _cestino: true, _eliminato_il: new Date().toISOString() });
        this.lista = this.lista.filter(v => v.id !== id);
        if (this.corrente?.id === id) this.corrente = null;
        NOTIFICHE.successo('Spostato nel cestino', 'La verifica ITP può essere ripristinata.');
      } catch (err) { ERRORI.gestisciErrore('verifica-itp/cestina', err); }
    },

    // ── Selezione da anagrafica ───────────────────────────────────────────────

    selezionaImpresaAffidataria(id) {
      if (!id || !this.corrente) return;
      const imp = ANAGRAFICA_SERVICE.getEntita('imprese', id);
      if (imp) {
        this.corrente.impresa_affidataria.impresa_id = id;
        this.corrente.impresa_affidataria.testo      = imp.ragioneSociale ?? '';
      }
      this._scheduleAutosave();
    },

    selezionaRL(id) {
      if (!id || !this.corrente) return;
      const pc = ANAGRAFICA_SERVICE.getEntita('persone_committente', id);
      if (pc) {
        const nome = [pc.qualifica, pc.cognome, pc.nome].filter(Boolean).join(' ');
        this.corrente.rl.qualifica    = nome;
        this.corrente.rl.nome_cognome = nome;
        this.corrente.firma_rl.qualifica    = nome;
        this.corrente.firma_rl.nome_cognome = nome;
      }
      this._scheduleAutosave();
    },

    get personeCommittente() { return ANAGRAFICA_SERVICE.get('persone_committente') ?? []; },

    // ── Firme (upload only) ──────────────────────────────────────────────────

    async onUploadFirmaRL(e) {
      const file = e.target.files?.[0];
      if (!file || !this.corrente) return;
      const png = await _leggiBase64IT(file);
      this.corrente.firma_rl.firma_png_base64 = png;
      this.corrente.firma_rl.tipo_firma      = 'upload';
      this.corrente.firma_rl.timestamp_firma = new Date().toISOString();
      e.target.value = '';
      this._scheduleAutosave();
    },

    rimuoviFirmaRL() {
      if (!this.corrente) return;
      this.corrente.firma_rl.firma_png_base64 = null;
      this.corrente.firma_rl.tipo_firma      = null;
      this._scheduleAutosave();
    },

    async onUploadVisto(e) {
      const file = e.target.files?.[0];
      if (!file || !this.corrente) return;
      const png = await _leggiBase64IT(file);
      this.corrente.visto_area.firma_png_base64 = png;
      this.corrente.visto_area.tipo_firma      = 'upload';
      this.corrente.visto_area.timestamp_firma = new Date().toISOString();
      e.target.value = '';
      this._scheduleAutosave();
    },

    rimuoviVisto() {
      if (!this.corrente) return;
      this.corrente.visto_area.firma_png_base64 = null;
      this.corrente.visto_area.tipo_firma      = null;
      this._scheduleAutosave();
    },

    // ── Finalizzazione ────────────────────────────────────────────────────────

    async finalizza() {
      if (!this.corrente) return;
      if (!this.corrente.firma_rl.firma_png_base64) {
        const ok = confirm('Firma RL non caricata (non bloccante — firma legale via GoSign esterno). Finalizzare comunque?');
        if (!ok) return;
      }
      this.generando = true;
      try {
        const corpo = await generaCorpoHtmlVerificaItp(this.corrente);
        const out   = await MOTORE_DOCX.generaDocumento({
          tipo: 'verifica-itp', header: _intestazioneIT(),
          corpo_html: corpo, formati: { html: true, docx: true },
        });
        this.corrente.stato      = 'FINALIZZATO_DA_PROTOCOLLARE';
        this.corrente.corpo_html = corpo;
        await this.salva();
        NOTIFICHE.successo('Finalizzata', 'DOCX pronto — usa il pulsante Scarica.');
        const win = window.open('', '_blank');
        if (win) { win.document.write(out.htmlString); win.document.close(); }
      } catch (err) { ERRORI.gestisciErrore('verifica-itp/finalizza', err); }
      finally { this.generando = false; }
    },

    async apriAnteprima() {
      if (!this.corrente) return;
      try {
        const corpo = await generaCorpoHtmlVerificaItp(this.corrente);
        const out   = await MOTORE_DOCX.generaDocumento({
          tipo: 'verifica-itp', header: _intestazioneIT(),
          corpo_html: corpo, formati: { html: true },
        });
        const win = window.open('', '_blank');
        if (win) { win.document.write(out.htmlString); win.document.close(); }
      } catch (err) { ERRORI.gestisciErrore('verifica-itp/anteprima', err); }
    },

    async scaricaDocx() {
      if (!this.corrente) return;
      this.generando = true;
      try {
        const corpo = this.corrente.corpo_html || await generaCorpoHtmlVerificaItp(this.corrente);
        const out   = await MOTORE_DOCX.generaDocumento({
          tipo: 'verifica-itp', header: _intestazioneIT(),
          corpo_html: corpo, formati: { docx: true },
        });
        const url = URL.createObjectURL(out.docxBlob);
        const a   = document.createElement('a');
        a.href = url; a.download = `verifica-itp-${this.corrente.creato_il?.slice(0,10) ?? UTILS.oggi()}.docx`;
        a.click(); setTimeout(() => URL.revokeObjectURL(url), 5000);
      } catch (err) { ERRORI.gestisciErrore('verifica-itp/scarica-docx', err); }
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
        const prtDir  = await FILESYSTEM.navigaPercorso(cantDir, ['07_Verifiche-ITP', 'Protocollati'], true);
        const numEsc  = this.proto.numero.replace(/[\/\\:*?"<>|]/g, '-');
        if (this.proto._pdfFile)     await _scriviFileIT(prtDir, `${numEsc}.pdf`,         this.proto._pdfFile);
        if (this.proto._letteraFile) await _scriviFileIT(prtDir, `${numEsc}.lettera.pdf`, this.proto._letteraFile);
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
          const bDir = await FILESYSTEM.navigaPercorso(cantDir, ['07_Verifiche-ITP', 'Bozze']);
          const bz   = await FILESYSTEM.leggiJson(bDir, `${this.corrente.id}.json`);
          await FILESYSTEM.scriviJson(bDir, `${this.corrente.id}.json`,
            { ...bz, _cestino: true, _eliminato_il: new Date().toISOString() });
        } catch { /* bozza già rimossa: ok */ }
        this.drawerProtocolloAperto = false;
        this.proto = { numero: '', data: '', _pdfFile: null, _letteraFile: null, salvando: false };
        NOTIFICHE.successo('Protocollata', `Verifica ITP n. ${this.corrente.numero_progressivo} archiviata.`);
        await this._caricaLista();
        this.vistaLista = 'protocollati';
        await this._caricaProtocollati();
        this.corrente = null;
      } catch (err) { ERRORI.gestisciErrore('verifica-itp/salva-protocollo', err); }
      finally { this.proto.salvando = false; }
    },

    onProtoPdfFile(e)  { this.proto._pdfFile     = e.target.files?.[0] ?? null; },
    onProtoLettFile(e) { this.proto._letteraFile = e.target.files?.[0] ?? null; },

    // ── Utility ──────────────────────────────────────────────────────────────

    async _bozzeDir(crea = false) {
      const cantDir = await FILESYSTEM.getHandleAttivo().getDirectoryHandle(Alpine.store('cantiere').id);
      return FILESYSTEM.navigaPercorso(cantDir, ['07_Verifiche-ITP', 'Bozze'], crea);
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

// ── generaCorpoHtmlVerificaItp ─────────────────────────────────────────────────
// Funzione pura ASYNC. Fedele al Mod.RE.01-13.
// Tutti i blocchi SEMPRE presenti (fedeltà al cartaceo).
// "non pertinente" → label aggiunta ma voci visibili (guida-non-blocca).

async function generaCorpoHtmlVerificaItp(d) {
  const esc = (s) => UTILS.escapeHtml(s ?? '');
  const p   = [];
  const chk = (f) => f ? '☑' : '☐';
  const np  = (flag, testo) => flag ? `${esc(testo)} (NON PERTINENTE)` : esc(testo);

  // Pre-scala firme
  const [rlImg, areaImg] = await Promise.all([
    _scalafirmaIT(d.firma_rl?.firma_png_base64   ?? null),
    _scalafirmaIT(d.visto_area?.firma_png_base64 ?? null),
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
  p.push(`<p ${pd} data-before="120">All' ${esc(d.destinatari?.area_gare ?? 'Area Amministrativa Gestionale - Gare e Appalti')}</p>`);
  const cseNome = esc(d.destinatari?.cse_nome ?? '');
  const csePec  = esc(d.destinatari?.pec_cse  ?? '');
  p.push(`<p ${pd}>E, p.c.:<br>Al Coordinatore per la Sicurezza in Fase di Esecuzione${cseNome ? '<br>' + cseNome : ''}${csePec ? '<br>PEC: ' + csePec : ''}</p>`);
  const rst = esc(d.destinatari?.resp_struttura ?? '');
  p.push(`<p ${pd}>Al Responsabile Struttura Territoriale${rst ? '<br>' + rst : ''}</p>`);

  // 3. Oggetto (data-line=exact280)
  const ss  = esc(d.intestazione?.ss ?? '');
  const den = esc(d.intestazione?.denominazione ?? '');
  const lav = esc(d.intestazione?.lavori ?? '');
  const ppn = esc(d.intestazione?.progetto_perizia_n   ?? '___');
  const ppd = esc(d.intestazione?.progetto_perizia_del ?? '___');
  const dpn = esc(d.intestazione?.dispositivo_n        ?? '___');
  const dpd = esc(d.intestazione?.dispositivo_del      ?? '___');
  p.push(`<p data-line="exact280"><strong>Oggetto:</strong> S.S. n° ${ss}${den ? " '" + den + "'" : ''}</p>`);
  if (lav) p.push(`<p data-line="exact280"><strong>Lavori di:</strong> ${lav}</p>`);
  p.push(`<p data-line="exact280">Progetto/Perizia n° ${ppn} del ${ppd} – Dispositivo di approvazione n° ${dpn} del ${dpd}</p>`);

  // 4. Titolo (centrato, bold, stacco)
  p.push(`<p data-align="center" data-before="200"><strong>VERIFICA IDONEITÀ TECNICO-PROFESSIONALE</strong></p>`);
  p.push(`<p data-align="center"><strong>ai sensi dell'art. 90 c.9 lett. a) e b) del D.Lgs 81/08 e dell'Allegato XVII</strong></p>`);

  // 5. Sottoscritto RL (data-line=15)
  const rlNome = esc(d.rl?.nome_cognome ?? d.firma_rl?.nome_cognome ?? '');
  p.push(
    `<p data-line="15">Il Sottoscritto <strong>${rlNome || '___'}</strong>, Responsabile dei Lavori, ` +
    `ai sensi dell'art. 90 comma 9 lettera a) e b) del D.Lgs. 81/2008 concernente la verifica ` +
    `dell'idoneità tecnico professionale dell'impresa affidataria e delle imprese esecutrici, ` +
    `come previsto all'Allegato XVII del suddetto decreto,</p>`
  );

  // 6. VISTA + elenco documentazione (data-line=15, stacco)
  p.push(`<p data-align="center" data-before="160"><strong>VISTA</strong></p>`);
  const impAffNome = d.impresa_affidataria?.impresa_id
    ? _nomeImpresaGenIT(d.impresa_affidataria.impresa_id)
    : (d.impresa_affidataria?.testo?.trim() || '___');
  const impEsec = esc(d.imprese_esecutrici?.trim() || '___');
  p.push(
    `<p data-line="15">La documentazione di seguito elencata relativamente all'impresa affidataria ` +
    `<strong>${esc(impAffNome)}</strong> e a tutte le imprese esecutrici ${impEsec} già selezionate ` +
    `ai sensi dell'art. 90 c.9 lett. a)</p>`
  );

  // ── BLOCCO A — Documentazione impresa (lett. a, Allegato XVII) ─────────────
  const ba = d.blocco_a ?? {};
  p.push(`<p data-before="120"><strong>A — Documentazione dell'impresa affidataria e delle imprese esecutrici (Allegato XVII, lett. a)</strong></p>`);
  p.push(`<p data-indent="elenco">${chk(ba.cciaa)} a) Iscrizione alla C.C.I.A.A. con oggetto sociale inerente alla tipologia dell'appalto</p>`);
  p.push(`<p data-indent="elenco">${chk(ba.dvr)} b) Documento di Valutazione dei Rischi (art.17 c.1 a) ovvero autocertificazione di cui all'art.29 c.5 [equivalente al POS con accettazione del PSC]</p>`);
  p.push(`<p data-indent="elenco">${chk(ba.durc)} c) Documento Unico di Regolarità Contributiva (DURC — D.M. 24/10/2007)</p>`);
  p.push(`<p data-indent="elenco">${chk(ba.dich_art14)} d) Dichiarazione di non essere oggetto di provvedimenti di sospensione o interdittivi di cui all'art.14 del D.Lgs 81/08</p>`);

  // ── BLOCCO LAVORATORI AUTONOMI (sempre presente; "non pertinente" marca senza nascondere) ─
  const la = d.lav_autonomi ?? {};
  p.push(`<p data-before="120"><strong>${np(la.non_pertinente, 'LAVORATORI AUTONOMI — Documentazione aggiuntiva')}</strong></p>`);
  p.push(`<p data-indent="elenco">${chk(la.cciaa)} a) Iscrizione alla C.C.I.A.A.</p>`);
  p.push(`<p data-indent="elenco">${chk(la.conformita)} b) Conformità macchine/attrezzature/opere provvisionali</p>`);
  p.push(`<p data-indent="elenco">${chk(la.dpi)} c) Elenco dei DPI utilizzati</p>`);
  p.push(`<p data-indent="elenco">${chk(la.attestati)} d) Attestati di formazione e idoneità sanitaria ove previsti</p>`);
  p.push(`<p data-indent="elenco">${chk(la.durc)} e) Documento Unico di Regolarità Contributiva (DURC)</p>`);

  // ── BLOCCO lett. b) — Imprese CON organico >200 u/gg ──────────────────────
  const s2 = d.scenario_oltre200 ?? {};
  p.push(`<p data-before="120"><strong>${np(s2.non_pertinente, 'B — Imprese con organico medio annuo SUPERIORE a 200 unità/giorno (>200 u/gg)')}</strong></p>`);
  p.push(`<p data-indent="elenco">${chk(s2.organico)} Dichiarazione organico medio annuo suddiviso per qualifica, corredata da dichiarazione relativa al contratto collettivo stipulato dalle OO.SS. comparativamente più rappresentative, applicato ai lavoratori, nonché gli estremi delle denunce dei lavoratori effettuate all'INPS, INAIL e alle casse edili</p>`);
  p.push(`<p data-indent="elenco">${chk(s2.ccnl)} Dichiarazione relativa al contratto collettivo nazionale di lavoro (CCNL) applicato</p>`);
  p.push(`<p data-indent="elenco">${chk(s2.patente_soa)} Patente a crediti (art.27 D.Lgs 81/08) o, per i soggetti non tenuti, attestazione SOA con classifica pari o superiore alla terza</p>`);

  // ── BLOCCO lett. b) — Imprese CON organico <200 u/gg ──────────────────────
  const s1 = d.scenario_sotto200 ?? {};
  p.push(`<p data-before="120"><strong>${np(s1.non_pertinente, 'B — Imprese con organico medio annuo NON SUPERIORE a 200 unità/giorno (≤200 u/gg)')}</strong></p>`);
  p.push(`<p data-indent="elenco">${chk(s1.durc)} Documento Unico di Regolarità Contributiva (DURC)</p>`);
  p.push(`<p data-indent="elenco">${chk(s1.autocert_ccnl)} Autocertificazione del contratto collettivo nazionale di lavoro (CCNL) applicato</p>`);
  p.push(`<p data-indent="elenco">${chk(s1.patente_soa)} Patente a crediti (art.27 D.Lgs 81/08) o attestazione SOA con classifica pari o superiore alla terza</p>`);

  // 9. DICHIARA (centrato, stacco)
  p.push(`<p data-align="center" data-before="160"><strong>DICHIARA</strong></p>`);
  p.push(`<p data-line="15">di aver verificato quanto sopra della/e suddetta/e impresa/e.</p>`);

  // 10. Firme (2 colonne: RL | Visto Area)
  const _bloccoF = (titolo, nome, img) => {
    const parts = [esc(titolo)];
    if (nome) parts.push(esc(nome));
    parts.push(img ? `<img src="${img}" alt="firma">` : '');
    return parts.join('<br>');
  };
  const rlFBlocco   = _bloccoF('Il Responsabile dei Lavori', d.firma_rl?.nome_cognome ?? '', rlImg);
  const areaFBlocco = _bloccoF('Visto: Il Resp. Area Gestione Rete / N.Opere', d.visto_area?.nome_cognome ?? '', areaImg);
  const tdA = 'data-align="center" style="text-align:center"';
  p.push(`<p data-before="200"></p>`);
  p.push(
    '<table data-border="none"><tbody><tr>' +
    `<td ${tdA}>${rlFBlocco}</td>` +
    `<td ${tdA}>${areaFBlocco}</td>` +
    '</tr></tbody></table>'
  );

  return p.join('\n');
}

function _nomeImpresaGenIT(id) {
  try { return ANAGRAFICA_SERVICE.getEntita('imprese', id)?.ragioneSociale ?? id ?? ''; }
  catch { return id ?? ''; }
}

// ── Template HTML ─────────────────────────────────────────────────────────────

const _TEMPLATE_IT = /* html */`
<div x-data="VerificaItp()" x-init="init()"
     class="p-4 max-w-4xl mx-auto pb-32" role="region"
     aria-label="Verifica idoneità tecnico-professionale">

  <!-- HEADER -->
  <div class="flex flex-wrap items-center justify-between gap-3 mb-4">
    <div class="flex items-center gap-3">
      <button x-show="corrente !== null" @click="chiudiEditor()"
              class="text-slate-400 hover:text-slate-700 p-1 rounded transition-colors
                     focus:outline-none focus:ring-2 focus:ring-blue-500" aria-label="Torna">&#8592;</button>
      <h2 class="text-lg font-semibold text-slate-800">Verifica Idoneità Tecnico-Professionale</h2>
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
    <template x-for="nota in noteIT" :key="nota.titolo">
      <div><h4 x-text="nota.titolo"></h4><p x-text="nota.testo"></p></div>
    </template>
  </div>

  <!-- VISTA LISTA -->
  <div x-show="corrente === null">
    <div class="flex items-center gap-1 bg-slate-100 rounded-lg p-1 mb-4 w-fit">
      <button @click="vistaLista='bozze'; _caricaLista()"
              :class="vistaLista==='bozze' ? 'bg-white shadow text-slate-800' : 'text-slate-500 hover:text-slate-700'"
              class="text-sm font-medium px-3 py-1.5 rounded-md transition-all focus:outline-none focus:ring-2 focus:ring-blue-500">Bozze</button>
      <button @click="vistaLista='protocollati'; _caricaProtocollati()"
              :class="vistaLista==='protocollati' ? 'bg-white shadow text-slate-800' : 'text-slate-500 hover:text-slate-700'"
              class="text-sm font-medium px-3 py-1.5 rounded-md transition-all focus:outline-none focus:ring-2 focus:ring-blue-500">Protocollate</button>
    </div>

    <div class="flex justify-between items-center mb-3">
      <p class="text-sm text-slate-500">
        <span x-show="caricamento">Caricamento...</span>
        <span x-show="!caricamento && vistaLista==='bozze' && lista.length===0 && Alpine.store('cantiere').id">Nessuna bozza.</span>
        <span x-show="!caricamento && vistaLista==='protocollati' && listaProtocollati.length===0 && Alpine.store('cantiere').id">Nessuna verifica ITP protocollata.</span>
        <span x-show="!Alpine.store('cantiere').id" class="text-amber-600">Seleziona un cantiere.</span>
      </p>
      <button x-show="vistaLista==='bozze'" @click="nuovo()" :disabled="!Alpine.store('cantiere').id"
              class="bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white text-sm font-medium
                     px-4 py-2 rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2">
        + Nuova verifica ITP
      </button>
    </div>

    <div x-show="vistaLista==='bozze'" class="space-y-2">
      <template x-for="v in lista" :key="v.id">
        <div class="bg-white border border-slate-200 rounded-lg px-4 py-3 flex items-center gap-3 hover:border-slate-300 transition-colors">
          <div class="flex-1 min-w-0 cursor-pointer" @click="apri(v.id)">
            <div class="flex items-center gap-2 flex-wrap">
              <span class="text-sm font-medium text-slate-800"
                    x-text="v.impresa_affidataria?.testo || v.rl?.nome_cognome || 'Bozza'"></span>
              <span class="text-xs px-2 py-0.5 rounded-full font-medium"
                    :class="etichettaStato(v.stato)"
                    x-text="{ BOZZA:'Bozza', FINALIZZATO_DA_PROTOCOLLARE:'Da protocollare', PROTOCOLLATO:'Protocollato' }[v.stato]??v.stato"></span>
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
              <p class="text-xs text-slate-500 mt-0.5" x-text="v.impresa_affidataria?.testo || ''"></p>
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
            <template x-if="!corrente.firma_rl.firma_png_base64">
              <span class="ml-1 text-xs bg-amber-100 text-amber-700 rounded-full px-1.5">!</span>
            </template>
          </button>
        </div>

        <!-- TAB DOCUMENTO -->
        <div x-show="scheda==='documento'" role="tabpanel">

          <!-- Tabella amm. -->
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

          <!-- Responsabile dei Lavori (firmatario) -->
          <h3 class="text-sm font-semibold text-slate-700 mb-3">Responsabile dei Lavori (firmatario)</h3>
          <div class="bg-slate-50 border border-slate-200 rounded-lg p-3 mb-4">
            <select @change="selezionaRL($event.target.value)"
                    class="w-full text-xs border border-slate-300 rounded px-2 py-1.5 mb-2 focus:outline-none focus:ring-2 focus:ring-blue-500">
              <option value="">-- Seleziona da anagrafica o inserisci manuale --</option>
              <template x-for="pc in personeCommittente" :key="pc.id">
                <option :value="pc.id"
                        x-text="[pc.qualifica,pc.cognome,pc.nome].filter(Boolean).join(' ')"></option>
              </template>
            </select>
            <input type="text" x-model="corrente.rl.nome_cognome" @input="_scheduleAutosave()"
                   placeholder="Qualifica Cognome Nome"
                   class="w-full border border-slate-300 rounded px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
          </div>

          <!-- Oggetto -->
          <h3 class="text-sm font-semibold text-slate-700 mb-3">Oggetto (snapshot + campi manuali)</h3>
          <div class="grid grid-cols-2 gap-3 mb-4">
            <div>
              <label class="block text-xs text-slate-500 mb-1">S.S. n°</label>
              <input type="text" x-model="corrente.intestazione.ss" @input="_scheduleAutosave()"
                     class="w-full border border-slate-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
            </div>
            <div>
              <label class="block text-xs text-slate-500 mb-1">Denominazione (tra virgolette)</label>
              <input type="text" x-model="corrente.intestazione.denominazione" @input="_scheduleAutosave()"
                     class="w-full border border-slate-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
            </div>
            <div class="col-span-2">
              <label class="block text-xs text-slate-500 mb-1">Lavori di</label>
              <input type="text" x-model="corrente.intestazione.lavori" @input="_scheduleAutosave()"
                     class="w-full border border-slate-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
            </div>
            <div>
              <label class="block text-xs text-slate-500 mb-1">Progetto/Perizia n°</label>
              <input type="text" x-model="corrente.intestazione.progetto_perizia_n" @input="_scheduleAutosave()"
                     class="w-full border border-slate-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
            </div>
            <div>
              <label class="block text-xs text-slate-500 mb-1">del</label>
              <input type="date" x-model="corrente.intestazione.progetto_perizia_del" @change="_scheduleAutosave()"
                     class="w-full border border-slate-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
            </div>
            <div>
              <label class="block text-xs text-slate-500 mb-1">Dispositivo di approvazione n°</label>
              <input type="text" x-model="corrente.intestazione.dispositivo_n" @input="_scheduleAutosave()"
                     class="w-full border border-slate-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
            </div>
            <div>
              <label class="block text-xs text-slate-500 mb-1">del</label>
              <input type="date" x-model="corrente.intestazione.dispositivo_del" @change="_scheduleAutosave()"
                     class="w-full border border-slate-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
            </div>
          </div>

          <!-- Imprese -->
          <h3 class="text-sm font-semibold text-slate-700 mb-3">Imprese interessate</h3>
          <div class="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
            <div class="bg-slate-50 border border-slate-200 rounded-lg p-3">
              <p class="text-xs text-slate-400 mb-2">Impresa Affidataria</p>
              <select @change="selezionaImpresaAffidataria($event.target.value)"
                      class="w-full text-xs border border-slate-300 rounded px-2 py-1 mb-1 focus:outline-none focus:ring-2 focus:ring-blue-500">
                <option value="">-- Da anagrafica --</option>
                <template x-for="imp in imprese" :key="imp.id">
                  <option :value="imp.id" x-text="imp.ragioneSociale"></option>
                </template>
              </select>
              <input type="text" x-model="corrente.impresa_affidataria.testo" @input="_scheduleAutosave()"
                     placeholder="Ragione sociale (modificabile)"
                     class="w-full border border-slate-300 rounded px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
            </div>
            <div class="bg-slate-50 border border-slate-200 rounded-lg p-3">
              <p class="text-xs text-slate-400 mb-2">Imprese Esecutrici (testo libero)</p>
              <textarea x-model="corrente.imprese_esecutrici" @input="_scheduleAutosave()"
                        rows="3" placeholder="es. lista imprese esecutrici"
                        class="w-full border border-slate-300 rounded px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"></textarea>
            </div>
          </div>

          <!-- ───────── CHECKLIST ───────── -->

          <!-- BLOCCO A -->
          <fieldset class="mb-4 border border-slate-200 rounded-lg p-4">
            <legend class="text-xs font-semibold text-slate-700 px-2">A — Documentazione impresa (Allegato XVII, lett. a)</legend>
            <div class="space-y-2 mt-2">
              <label class="flex items-start gap-3 cursor-pointer text-sm">
                <input type="checkbox" x-model="corrente.blocco_a.cciaa" @change="_scheduleAutosave()"
                       class="mt-0.5 w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-2 focus:ring-blue-500">
                a) Iscrizione CCIAA con oggetto sociale inerente alla tipologia dell'appalto
              </label>
              <label class="flex items-start gap-3 cursor-pointer text-sm">
                <input type="checkbox" x-model="corrente.blocco_a.dvr" @change="_scheduleAutosave()"
                       class="mt-0.5 w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-2 focus:ring-blue-500">
                b) DVR (art.17 c.1 a) o autocertificazione (art.29 c.5) [equivalente al POS con accettazione PSC]
              </label>
              <label class="flex items-start gap-3 cursor-pointer text-sm">
                <input type="checkbox" x-model="corrente.blocco_a.durc" @change="_scheduleAutosave()"
                       class="mt-0.5 w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-2 focus:ring-blue-500">
                c) DURC (D.M. 24/10/2007)
              </label>
              <label class="flex items-start gap-3 cursor-pointer text-sm">
                <input type="checkbox" x-model="corrente.blocco_a.dich_art14" @change="_scheduleAutosave()"
                       class="mt-0.5 w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-2 focus:ring-blue-500">
                d) Dichiarazione di non essere oggetto di provvedimenti sospensione/interdittivi (art.14)
              </label>
            </div>
          </fieldset>

          <!-- BLOCCO LAVORATORI AUTONOMI -->
          <fieldset class="mb-4 border border-slate-200 rounded-lg p-4"
                    :class="corrente.lav_autonomi.non_pertinente ? 'opacity-60 bg-slate-50' : ''">
            <legend class="text-xs font-semibold text-slate-700 px-2">Lavoratori autonomi</legend>
            <label class="flex items-center gap-2 mt-2 mb-3 cursor-pointer text-xs font-medium text-amber-700">
              <input type="checkbox" x-model="corrente.lav_autonomi.non_pertinente" @change="_scheduleAutosave()"
                     class="w-4 h-4 rounded border-amber-400 text-amber-600 focus:ring-2 focus:ring-amber-500">
              NON PERTINENTE (barrare se non ci sono lavoratori autonomi)
            </label>
            <div class="space-y-2">
              <label class="flex items-start gap-3 cursor-pointer text-sm">
                <input type="checkbox" x-model="corrente.lav_autonomi.cciaa" @change="_scheduleAutosave()"
                       class="mt-0.5 w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-2 focus:ring-blue-500">
                a) Iscrizione CCIAA
              </label>
              <label class="flex items-start gap-3 cursor-pointer text-sm">
                <input type="checkbox" x-model="corrente.lav_autonomi.conformita" @change="_scheduleAutosave()"
                       class="mt-0.5 w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-2 focus:ring-blue-500">
                b) Conformità macchine/attrezzature/opere provvisionali
              </label>
              <label class="flex items-start gap-3 cursor-pointer text-sm">
                <input type="checkbox" x-model="corrente.lav_autonomi.dpi" @change="_scheduleAutosave()"
                       class="mt-0.5 w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-2 focus:ring-blue-500">
                c) Elenco dei DPI utilizzati
              </label>
              <label class="flex items-start gap-3 cursor-pointer text-sm">
                <input type="checkbox" x-model="corrente.lav_autonomi.attestati" @change="_scheduleAutosave()"
                       class="mt-0.5 w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-2 focus:ring-blue-500">
                d) Attestati di formazione e idoneità sanitaria ove previsti
              </label>
              <label class="flex items-start gap-3 cursor-pointer text-sm">
                <input type="checkbox" x-model="corrente.lav_autonomi.durc" @change="_scheduleAutosave()"
                       class="mt-0.5 w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-2 focus:ring-blue-500">
                e) DURC
              </label>
            </div>
          </fieldset>

          <!-- BLOCCO >200 u/gg -->
          <fieldset class="mb-4 border border-slate-200 rounded-lg p-4"
                    :class="corrente.scenario_oltre200.non_pertinente ? 'opacity-60 bg-slate-50' : ''">
            <legend class="text-xs font-semibold text-slate-700 px-2">B — Imprese >200 unità/giorno (lett. b)</legend>
            <label class="flex items-center gap-2 mt-2 mb-3 cursor-pointer text-xs font-medium text-amber-700">
              <input type="checkbox" x-model="corrente.scenario_oltre200.non_pertinente" @change="_scheduleAutosave()"
                     class="w-4 h-4 rounded border-amber-400 text-amber-600 focus:ring-2 focus:ring-amber-500">
              NON PERTINENTE (barrare se organico ≤200 u/gg)
            </label>
            <div class="space-y-2">
              <label class="flex items-start gap-3 cursor-pointer text-sm">
                <input type="checkbox" x-model="corrente.scenario_oltre200.organico" @change="_scheduleAutosave()"
                       class="mt-0.5 w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-2 focus:ring-blue-500">
                Dichiarazione organico medio annuo per qualifica + estremi denunce INPS/INAIL/casse edili e dichiarazione CCNL applicato
              </label>
              <label class="flex items-start gap-3 cursor-pointer text-sm">
                <input type="checkbox" x-model="corrente.scenario_oltre200.ccnl" @change="_scheduleAutosave()"
                       class="mt-0.5 w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-2 focus:ring-blue-500">
                Dichiarazione CCNL applicato
              </label>
              <label class="flex items-start gap-3 cursor-pointer text-sm">
                <input type="checkbox" x-model="corrente.scenario_oltre200.patente_soa" @change="_scheduleAutosave()"
                       class="mt-0.5 w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-2 focus:ring-blue-500">
                Patente a crediti (art.27 D.Lgs 81/08) o attestazione SOA (classifica ≥ 3^)
              </label>
            </div>
          </fieldset>

          <!-- BLOCCO ≤200 u/gg -->
          <fieldset class="mb-4 border border-slate-200 rounded-lg p-4"
                    :class="corrente.scenario_sotto200.non_pertinente ? 'opacity-60 bg-slate-50' : ''">
            <legend class="text-xs font-semibold text-slate-700 px-2">B — Imprese ≤200 unità/giorno (lett. b)</legend>
            <label class="flex items-center gap-2 mt-2 mb-3 cursor-pointer text-xs font-medium text-amber-700">
              <input type="checkbox" x-model="corrente.scenario_sotto200.non_pertinente" @change="_scheduleAutosave()"
                     class="w-4 h-4 rounded border-amber-400 text-amber-600 focus:ring-2 focus:ring-amber-500">
              NON PERTINENTE (barrare se organico >200 u/gg)
            </label>
            <div class="space-y-2">
              <label class="flex items-start gap-3 cursor-pointer text-sm">
                <input type="checkbox" x-model="corrente.scenario_sotto200.durc" @change="_scheduleAutosave()"
                       class="mt-0.5 w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-2 focus:ring-blue-500">
                DURC
              </label>
              <label class="flex items-start gap-3 cursor-pointer text-sm">
                <input type="checkbox" x-model="corrente.scenario_sotto200.autocert_ccnl" @change="_scheduleAutosave()"
                       class="mt-0.5 w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-2 focus:ring-blue-500">
                Autocertificazione CCNL applicato
              </label>
              <label class="flex items-start gap-3 cursor-pointer text-sm">
                <input type="checkbox" x-model="corrente.scenario_sotto200.patente_soa" @change="_scheduleAutosave()"
                       class="mt-0.5 w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-2 focus:ring-blue-500">
                Patente a crediti (art.27 D.Lgs 81/08) o attestazione SOA (classifica ≥ 3^)
              </label>
            </div>
          </fieldset>

          <!-- Destinatari (modifica manuale p.c.) -->
          <h3 class="text-sm font-semibold text-slate-700 mb-3">Destinatari (p.c.)</h3>
          <div class="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
            <div>
              <label class="block text-xs text-slate-500 mb-1">Area Gare e Appalti (fisso)</label>
              <input type="text" x-model="corrente.destinatari.area_gare" @input="_scheduleAutosave()"
                     class="w-full border border-slate-300 rounded px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
            </div>
            <div>
              <label class="block text-xs text-slate-500 mb-1">CSE p.c. (da M2)</label>
              <input type="text" x-model="corrente.destinatari.cse_nome" @input="_scheduleAutosave()"
                     placeholder="Qualifica Nome CSE"
                     class="w-full border border-slate-300 rounded px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
            </div>
            <div>
              <label class="block text-xs text-slate-500 mb-1">PEC CSE (manuale)</label>
              <input type="text" x-model="corrente.destinatari.pec_cse" @input="_scheduleAutosave()"
                     placeholder="pec@..."
                     class="w-full border border-slate-300 rounded px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
            </div>
            <div class="md:col-span-3">
              <label class="block text-xs text-slate-500 mb-1">Responsabile Struttura Territoriale</label>
              <input type="text" x-model="corrente.destinatari.resp_struttura" @input="_scheduleAutosave()"
                     placeholder="es. ANAS - Struttura Territoriale Calabria (manuale)"
                     class="w-full border border-slate-300 rounded px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
            </div>
          </div>

        </div><!-- /tab documento -->

        <!-- TAB FIRME -->
        <div x-show="scheda==='firme'" role="tabpanel">
          <div class="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 mb-4 text-xs text-amber-800">
            <strong>Nota firma legale:</strong> La firma legalmente valida avviene via <strong>GoSign</strong>
            (strumento esterno). Le firme in SafeHub sono grafiche/di lavoro, non bloccanti per la finalizzazione.
          </div>

          <!-- Firma RL -->
          <h3 class="text-sm font-semibold text-slate-700 mb-3">Il Responsabile dei Lavori</h3>
          <div class="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
            <p class="text-sm font-medium" x-text="corrente.firma_rl.nome_cognome || corrente.rl.nome_cognome || '(RL non configurato — vedi tab Documento)'"></p>
            <template x-if="corrente.firma_rl.firma_png_base64">
              <div class="flex items-center gap-3 mt-3">
                <img :src="corrente.firma_rl.firma_png_base64" class="h-10 border rounded bg-white" alt="firma RL">
                <span class="text-xs text-green-600">&#10003; Firma caricata</span>
                <button @click="rimuoviFirmaRL()" class="text-xs text-slate-400 hover:text-red-500 underline">Rimuovi</button>
              </div>
            </template>
            <template x-if="!corrente.firma_rl.firma_png_base64">
              <label class="mt-2 inline-flex text-xs bg-white text-blue-700 border border-blue-300 px-3 py-1.5 rounded hover:bg-blue-50 cursor-pointer transition-colors">
                &#128206; Carica firma PNG
                <input type="file" accept=".png,image/png" class="sr-only" @change="onUploadFirmaRL($event)">
              </label>
            </template>
          </div>

          <!-- Visto Area -->
          <h3 class="text-sm font-semibold text-slate-700 mb-3">Visto</h3>
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
                <img :src="corrente.visto_area.firma_png_base64" class="h-10 border rounded bg-white" alt="firma Visto">
                <span class="text-xs text-green-600">&#10003;</span>
                <button @click="rimuoviVisto()" class="text-xs text-slate-400 hover:text-red-500 underline">Rimuovi</button>
              </div>
            </template>
            <template x-if="!corrente.visto_area.firma_png_base64">
              <label class="inline-flex text-xs bg-white text-slate-700 border border-slate-300 px-3 py-1.5 rounded hover:bg-slate-50 cursor-pointer transition-colors">
                &#128206; Carica firma PNG
                <input type="file" accept=".png,image/png" class="sr-only" @change="onUploadVisto($event)">
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

  <!-- DRAWER PROTOCOLLAZIONE -->
  <div x-show="drawerProtocolloAperto" class="drawer-backdrop" @click="drawerProtocolloAperto=false"></div>
  <div x-show="drawerProtocolloAperto" x-transition.opacity class="drawer"
       role="dialog" aria-modal="true" aria-label="Protocollazione verifica ITP">
    <div class="drawer-header px-5 py-4 border-b border-slate-200 flex items-center justify-between">
      <h3 class="font-semibold text-slate-800">Protocolla verifica ITP</h3>
      <button @click="drawerProtocolloAperto=false"
              class="text-slate-400 hover:text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500 rounded"
              aria-label="Chiudi">&#10005;</button>
    </div>
    <div class="drawer-body px-5 py-4 space-y-4">
      <div>
        <label for="it-proto-numero" class="block text-xs font-medium text-slate-600 mb-1">Numero protocollo <span class="text-red-500">*</span></label>
        <input id="it-proto-numero" type="text" x-model="proto.numero" placeholder="es. 2026/045"
               class="w-full border border-slate-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
      </div>
      <div>
        <label for="it-proto-data" class="block text-xs font-medium text-slate-600 mb-1">Data protocollo</label>
        <input id="it-proto-data" type="date" x-model="proto.data"
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
window.MODULI_REGISTRATI['verifica-itp'] = {
  monta(contenitore) { contenitore.innerHTML = _TEMPLATE_IT; },
};
