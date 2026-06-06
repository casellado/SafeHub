/**
 * disposizione-rl.js — Disposizione di Sospensione/Allontanamento del RL (Mod.RE.01-15)
 * Terzo documento del Flusso B. Lettera formale: il PO redige, il RL firma.
 *
 * NOTA FIRMA: la firma legale avviene via GoSign ESTERNO a SafeHub.
 * La firma in SafeHub è grafica/di lavoro, non obbligatoria per finalizzare.
 *
 * Pattern identico a proposta-sospensione.js (v0.7.0):
 *   ciclo BOZZA→FINALIZZATO_DA_PROTOCOLLARE→PROTOCOLLATO, vista Protocollati,
 *   editor ricco, auto-save, promemoria normativo.
 *   Differenze: firma RL (upload-only), firma Visto, tabella amm., VISTO/DISPONE.
 *
 * CAMPI MANUALI (non in schema anagrafica):
 *   - cse_pec: M2 non ha campo PEC per il CSE
 *   - rst_testo: lotto.strutturaTerritoriale è testo struttura, non persona FK
 *
 * Storage: 05_Disposizioni-RL/Bozze/<uuid>.json + Protocollati/<numero>.json
 *   (cartelle create on-demand: non pre-esistenti nel scaffolding)
 */

'use strict';

// ── Costanti ─────────────────────────────────────────────────────────────────

const NOTE_NORMATIVE_RL = {
  'disposizione-rl': [
    {
      titolo: 'Riferimento normativo — art. 92 c.1 lett. e)',
      testo:  'Questo atto è una DISPOSIZIONE del Responsabile dei Lavori: visto il ' +
              'provvedimento proposto dal CSE ex art.92 c.1 lett.e D.Lgs 81/08, il RL ' +
              'DISPONE la sospensione/allontanamento/risoluzione. È l\'atto esecutivo ' +
              'che consegue alla proposta del CSE.',
    },
    {
      titolo: 'Firma legale — GoSign esterno a SafeHub',
      testo:  'La firma legalmente valida del RL avviene via GoSign (strumento esterno). ' +
              'La firma in SafeHub è solo grafica/di lavoro e NON ha valore legale. ' +
              'Non è richiesta per finalizzare il documento in SafeHub.',
    },
    {
      titolo: 'Trasmissione e destinatari',
      testo:  'Destinatari: Impresa Affidataria (con PEC), per conoscenza a DL, RUP, ' +
              'CSE, Responsabile Struttura Territoriale. Trasmissione via PEC tracciabile. ' +
              'Conservare copia. Il documento richiama la proposta del CSE (data).',
    },
  ],
};

// ── Utility (duplicate con suffisso RL — pattern anti-regressione Flusso B) ───

// Aggiunge data-line="15" ai <p> dell'editor ricco privi dell'attributo
// Header modulo — override della chiave tecnica 'disposizione-rl' e di valori vuoti.
// IMPOSTAZIONI_SERVICE.modulo() restituisce { titolo: tipo } quando la chiave non è in M2:
// 'disposizione-rl' è truthy ma è il nome tecnico, non il titolo. Viene intercettato.
function _intestazioneRL() {
  const m   = IMPOSTAZIONI_SERVICE.modulo('disposizione-rl');
  const bad = new Set(['disposizione-rl', '']);   // chiave tecnica = non configurato
  const _ok = (v, def) => (!v || bad.has(v)) ? def : v;
  return {
    modulo_titolo:   _ok(m.titolo,   'Disposizione sospensione/allontanamento del Responsabile dei Lavori'),
    modulo_codice:   _ok(m.codice,   'Mod.RE.01-15'),
    modulo_versione: _ok(m.versione, 'Vers.3.0 del 22.01.2024'),
    logo_aziendale:  IMPOSTAZIONI_SERVICE.logo().png_base64 ?? null,
  };
}

// ── DisposizioneRL Alpine component ──────────────────────────────────────────

function DisposizioneRL() {
  return {
    lista: [], listaProtocollati: [], vistaLista: 'bozze', caricamento: false,
    corrente: null, scheda: 'documento', generando: false,
    _autosaveTimer: null, _statoSalvataggio: 'salvato',
    noteAperte: false, drawerProtocolloAperto: false,
    proto: { numero: '', data: '', _pdfFile: null, _letteraFile: null, salvando: false },

    get noteRL()           { return NOTE_NORMATIVE_RL['disposizione-rl']; },
    get imprese()          { return ANAGRAFICA_SERVICE.get('imprese') ?? []; },
    get personeCommittente(){ return ANAGRAFICA_SERVICE.get('persone_committente') ?? []; },
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
          ['05_Disposizioni-RL', 'Bozze'], true
        );
        const voci = [];
        for await (const [nome] of bDir.entries()) {
          if (!nome.endsWith('.json')) continue;
          try { const d = await FILESYSTEM.leggiJson(bDir, nome); if (!d._cestino) voci.push(d); }
          catch { /* skip */ }
        }
        voci.sort((a, b) => (b.aggiornato_il ?? '').localeCompare(a.aggiornato_il ?? ''));
        this.lista = voci;
      } catch (err) { ERRORI.gestisciErrore('disposizione-rl/carica-lista', err); }
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
            ['05_Disposizioni-RL', 'Protocollati'], false
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
      } catch (err) { ERRORI.gestisciErrore('disposizione-rl/carica-protocollati', err); this.listaProtocollati = []; }
      finally { this.caricamento = false; }
    },

    async apriFileProt(filename) {
      if (!filename) return;
      try {
        const cantId = Alpine.store('cantiere').id;
        const prtDir = await FILESYSTEM.navigaPercorso(
          await FILESYSTEM.getHandleAttivo().getDirectoryHandle(cantId),
          ['05_Disposizioni-RL', 'Protocollati']
        );
        const url = URL.createObjectURL(await (await prtDir.getFileHandle(filename)).getFile());
        window.open(url, '_blank');
        setTimeout(() => URL.revokeObjectURL(url), 60000);
      } catch (err) { ERRORI.gestisciErrore('disposizione-rl/apri-file-prot', err); }
    },

    // ── Nuovo documento ──────────────────────────────────────────────────────

    async nuovo() {
      const cantiere = Alpine.store('cantiere');
      if (!cantiere.id) return;
      await ANAGRAFICA_SERVICE.carica(cantiere.id);

      const lotto = ANAGRAFICA_SERVICE.dati?.lotto ?? {};
      const cse   = IMPOSTAZIONI_SERVICE.cse();

      // Helper: risolve persone_committente per FK
      const _resPc = (id) => {
        if (!id) return '';
        const pc = ANAGRAFICA_SERVICE.getEntita('persone_committente', id);
        return pc ? [pc.qualifica, pc.cognome, pc.nome].filter(Boolean).join(' ') : '';
      };

      // Impresa affidataria
      const impAfId   = lotto.impresaAffidatariaId ?? null;
      const impAf     = impAfId ? ANAGRAFICA_SERVICE.getEntita('imprese', impAfId) : null;
      const impAfNome = impAf?.ragioneSociale ?? '';
      const impAfPec  = impAf?.pec           ?? '';

      const rlId  = lotto.ruoli_istituzionali?.responsabileLavoriId ?? null;
      const dlId  = lotto.ruoli_istituzionali?.dlId  ?? null;
      const rupId = lotto.ruoli_istituzionali?.rupId ?? null;
      const rlTesto = _resPc(rlId);

      this.corrente = {
        id:          UTILS.uuid(),
        tipo_file:   'disposizione_rl',
        cantiere_id: cantiere.id ?? '',
        stato:       'BOZZA',
        numero_progressivo: null,
        creato_il:    new Date().toISOString(),
        aggiornato_il: new Date().toISOString(),

        // Snapshot tabella amministrativa dalla anagrafica
        tabella_amm: {
          ppm_sil:      lotto.codicePpmSil    ?? '',
          commessa:     lotto.commessaNumero   ?? '',
          voce_budget:  lotto.voceBudget       ?? '',
          cup:          lotto.cup              ?? '',
          cig:          lotto.cig              ?? '',
        },

        // Snapshot intestazione/oggetto
        intestazione: {
          ss:                lotto.ssNumero        ?? lotto.progressivaInizio ?? '',
          lavori:            lotto.nome            ?? '',
          cod_ppm_sil:       lotto.codicePpmSil    ?? '',
          contratto_numero:  lotto.contrattoNumero ?? '',
          contratto_data:    lotto.contrattoData   ?? '',
        },

        // Destinatari (con FK + testo per modifica manuale)
        destinatari: {
          impresa_id:   impAfId,
          impresa_nome: impAfNome,
          impresa_pec:  impAfPec,
          dl_id:        dlId,
          dl_testo:     _resPc(dlId),
          rup_id:       rupId,
          rup_testo:    _resPc(rupId),
          cse_nome:     cse.nome_cognome ?? '',
          cse_pec:      '',  // MANUALE — PEC del CSE non presente in M2
          rst_testo:    lotto.strutturaTerritoriale ?? '', // testo struttura, non persona FK
        },

        rl_id:   rlId,
        rl_testo: rlTesto,

        // TODO M13: agganciare la data proposta alla Proposta di Sospensione del cantiere
        // quando esisterà un riferimento diretto. Per ora: campo manuale.
        visto_data_proposta: '',

        provvedimenti: {
          sospensione_lavori:        false,
          allontanamento_imprese:    { flag: false, valore: '', impresa_id: null },
          allontanamento_lav_autonomi:{ flag: false, valore: '', rif_id: null },
          risoluzione_contratto:     { flag: false, valore: '', rif_id: null },
          altro:                     { flag: false, valore: '' },
        },

        // Firma RL: SOLO UPLOAD (firma legale = GoSign esterno, non SafeHub)
        firma_rl: {
          qualifica: rlTesto,
          nome_cognome: '',
          firma_png_base64: null,
          tipo_firma: null,
          timestamp_firma: null,
        },

        // Firma Visto: upload, non bloccante
        visto_firma: {
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
      } catch (err) { ERRORI.gestisciErrore('disposizione-rl/apri', err); }
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
      } catch (err) {
        this._statoSalvataggio = 'errore';
        ERRORI.gestisciErrore('disposizione-rl/salva', err);
      }
    },

    _scheduleAutosave() {
      this._statoSalvataggio = 'modificato';
      clearTimeout(this._autosaveTimer);
      this._autosaveTimer = setTimeout(() => this.salva(), 8000);
    },

    async cestina(id) {
      if (!confirm('Spostare la disposizione nel cestino?')) return;
      try {
        const dir = await this._bozzeDir();
        const d   = await FILESYSTEM.leggiJson(dir, `${id}.json`);
        await FILESYSTEM.scriviJson(dir, `${id}.json`,
          { ...d, _cestino: true, _eliminato_il: new Date().toISOString() });
        this.lista = this.lista.filter(v => v.id !== id);
        if (this.corrente?.id === id) this.corrente = null;
        NOTIFICHE.successo('Spostato nel cestino', 'La disposizione può essere ripristinata.');
      } catch (err) { ERRORI.gestisciErrore('disposizione-rl/cestina', err); }
    },

    // ── Selezione da anagrafica ───────────────────────────────────────────────

    selezionaImpresaDestinatario(impresaId) {
      if (!impresaId || !this.corrente) return;
      const imp = ANAGRAFICA_SERVICE.getEntita('imprese', impresaId);
      if (imp) {
        this.corrente.destinatari.impresa_id   = impresaId;
        this.corrente.destinatari.impresa_nome = imp.ragioneSociale ?? '';
        this.corrente.destinatari.impresa_pec  = imp.pec ?? '';
      }
      this._scheduleAutosave();
    },

    selezionaPersonaDestinatario(campo, personaId) {
      if (!personaId || !this.corrente) return;
      const pc = ANAGRAFICA_SERVICE.getEntita('persone_committente', personaId);
      if (pc) {
        this.corrente.destinatari[campo + '_id']    = personaId;
        this.corrente.destinatari[campo + '_testo'] = [pc.qualifica, pc.cognome, pc.nome].filter(Boolean).join(' ');
      }
      this._scheduleAutosave();
    },

    selezionaRl(personaId) {
      if (!personaId || !this.corrente) return;
      const pc = ANAGRAFICA_SERVICE.getEntita('persone_committente', personaId);
      if (pc) {
        this.corrente.rl_id    = personaId;
        this.corrente.rl_testo = [pc.qualifica, pc.cognome, pc.nome].filter(Boolean).join(' ');
        this.corrente.firma_rl.qualifica    = this.corrente.rl_testo;
        this.corrente.firma_rl.nome_cognome = this.corrente.rl_testo;
      }
      this._scheduleAutosave();
    },

    selezionaImpresaProvvedimento(campo, impresaId) {
      if (!impresaId || !this.corrente) return;
      const imp = ANAGRAFICA_SERVICE.getEntita('imprese', impresaId);
      if (imp) {
        this.corrente.provvedimenti[campo].impresa_id = impresaId;
        this.corrente.provvedimenti[campo].valore     = imp.ragioneSociale ?? '';
      }
      this._scheduleAutosave();
    },

    // ── Firme (upload only) ──────────────────────────────────────────────────

    async onUploadFirmaRL(e) {
      const file = e.target.files?.[0];
      if (!file || !this.corrente) return;
      const png = await _leggiBase64(file);
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
      this.corrente.firma_rl.timestamp_firma = null;
      this._scheduleAutosave();
    },

    async onUploadVisto(e) {
      const file = e.target.files?.[0];
      if (!file || !this.corrente) return;
      const png = await _leggiBase64(file);
      this.corrente.visto_firma.firma_png_base64 = png;
      this.corrente.visto_firma.tipo_firma      = 'upload';
      this.corrente.visto_firma.timestamp_firma = new Date().toISOString();
      e.target.value = '';
      this._scheduleAutosave();
    },

    rimuoviVisto() {
      if (!this.corrente) return;
      this.corrente.visto_firma.firma_png_base64 = null;
      this.corrente.visto_firma.tipo_firma      = null;
      this._scheduleAutosave();
    },

    // ── Finalizzazione ────────────────────────────────────────────────────────

    async finalizza() {
      if (!this.corrente) return;
      // Firma RL non bloccante: avviso ma non impedisce (firma legale = GoSign esterno)
      if (!this.corrente.firma_rl.firma_png_base64) {
        const ok = confirm('Firma del Responsabile dei Lavori non caricata (non bloccante — firma legale via GoSign esterno). Finalizzare comunque?');
        if (!ok) return;
      }
      this.generando = true;
      try {
        const corpo = await generaCorpoHtmlDisposizioneRL(this.corrente);
        const out   = await MOTORE_DOCX.generaDocumento({
          tipo: 'disposizione-rl',
          header: _intestazioneRL(),
          corpo_html: corpo,
          formati: { html: true, docx: true },
        });
        this.corrente.stato      = 'FINALIZZATO_DA_PROTOCOLLARE';
        this.corrente.corpo_html = corpo;
        await this.salva();
        NOTIFICHE.successo('Finalizzata', 'DOCX pronto — usa il pulsante Scarica.');
        const win = window.open('', '_blank');
        if (win) { win.document.write(out.htmlString); win.document.close(); }
      } catch (err) { ERRORI.gestisciErrore('disposizione-rl/finalizza', err); }
      finally { this.generando = false; }
    },

    async apriAnteprima() {
      if (!this.corrente) return;
      try {
        const corpo = await generaCorpoHtmlDisposizioneRL(this.corrente);
        const out   = await MOTORE_DOCX.generaDocumento({
          tipo: 'disposizione-rl', header: _intestazioneRL(),
          corpo_html: corpo, formati: { html: true },
        });
        const win = window.open('', '_blank');
        if (win) { win.document.write(out.htmlString); win.document.close(); }
      } catch (err) { ERRORI.gestisciErrore('disposizione-rl/anteprima', err); }
    },

    async scaricaDocx() {
      if (!this.corrente) return;
      this.generando = true;
      try {
        const corpo = this.corrente.corpo_html || await generaCorpoHtmlDisposizioneRL(this.corrente);
        const out   = await MOTORE_DOCX.generaDocumento({
          tipo: 'disposizione-rl', header: _intestazioneRL(),
          corpo_html: corpo, formati: { docx: true },
        });
        const url  = URL.createObjectURL(out.docxBlob);
        const a    = document.createElement('a');
        a.href = url; a.download = `disposizione-rl-${this.corrente.creato_il?.slice(0,10) ?? UTILS.oggi()}.docx`;
        a.click(); setTimeout(() => URL.revokeObjectURL(url), 5000);
      } catch (err) { ERRORI.gestisciErrore('disposizione-rl/scarica-docx', err); }
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
        const prtDir  = await FILESYSTEM.navigaPercorso(cantDir, ['05_Disposizioni-RL', 'Protocollati'], true);
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
        _hookDiarioRLProtocollata(this.corrente, cantId).catch(e => console.warn('[diario] hook RL:', e));

        try {
          const bDir = await FILESYSTEM.navigaPercorso(cantDir, ['05_Disposizioni-RL', 'Bozze']);
          const bz   = await FILESYSTEM.leggiJson(bDir, `${this.corrente.id}.json`);
          await FILESYSTEM.scriviJson(bDir, `${this.corrente.id}.json`,
            { ...bz, _cestino: true, _eliminato_il: new Date().toISOString() });
        } catch { /* bozza già rimossa: ok */ }
        this.drawerProtocolloAperto = false;
        this.proto = { numero: '', data: '', _pdfFile: null, _letteraFile: null, salvando: false };
        NOTIFICHE.successo('Protocollata', `Disposizione n. ${this.corrente.numero_progressivo} archiviata.`);
        await this._caricaLista();
        this.vistaLista = 'protocollati';
        await this._caricaProtocollati();
        this.corrente = null;
      } catch (err) { ERRORI.gestisciErrore('disposizione-rl/salva-protocollo', err); }
      finally { this.proto.salvando = false; }
    },

    onProtoPdfFile(e)  { this.proto._pdfFile     = e.target.files?.[0] ?? null; },
    onProtoLettFile(e) { this.proto._letteraFile = e.target.files?.[0] ?? null; },

    // ── Utility ──────────────────────────────────────────────────────────────

    async _bozzeDir(crea = false) {
      const cantDir = await FILESYSTEM.getHandleAttivo().getDirectoryHandle(Alpine.store('cantiere').id);
      return FILESYSTEM.navigaPercorso(cantDir, ['05_Disposizioni-RL', 'Bozze'], crea);
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

// ── generaCorpoHtmlDisposizioneRL ─────────────────────────────────────────────
// Funzione pura ASYNC. Fedele al Mod.RE.01-15.
// Attributi M6: destinatari=destra, oggetto=exact280, narrativi=line15, voci=elenco, firma=firma.
// NON include il promemoria normativo (UI-only).

async function generaCorpoHtmlDisposizioneRL(d) {
  const esc = (s) => UTILS.escapeHtml(s ?? '');
  const p   = [];
  const chk = (f) => f ? '☑' : '☐';

  // Pre-scala firme (canvas fisso 210×80px = dimensioni uniformi)
  const [rlImg, vistoImg] = await Promise.all([
    _scalafirma(d.firma_rl?.firma_png_base64  ?? null),
    _scalafirma(d.visto_firma?.firma_png_base64 ?? null),
  ]);

  // 1. Tabella amministrativa (snapshot anagrafica)
  p.push(
    '<table>' +
    '<thead><tr><th>PPM/SIL / OdA</th><th>Commessa</th><th>Voce di Budget/Spesa</th><th>CUP</th><th>CIG</th></tr></thead>' +
    '<tbody><tr>' +
    `<td>${esc(d.tabella_amm?.ppm_sil)}</td>` +
    `<td>${esc(d.tabella_amm?.commessa)}</td>` +
    `<td>${esc(d.tabella_amm?.voce_budget)}</td>` +
    `<td>${esc(d.tabella_amm?.cup)}</td>` +
    `<td>${esc(d.tabella_amm?.cig)}</td>` +
    '</tr></tbody></table>'
  );
  // Protocollo: vuoto — lo compilano i superiori al protocollo
  p.push(`<p data-align="right">Protocollo n. ___________</p>`);

  // 2. Destinatari (data-indent=destra, come lettera formale ANAS)
  const pd = 'data-indent="destra"';
  const impNome = esc(d.destinatari?.impresa_nome ?? '');
  const impPec  = esc(d.destinatari?.impresa_pec  ?? '');
  p.push(`<p ${pd}>All'Impresa Affidataria${impNome ? '<br>' + impNome : ''}${impPec ? '<br>PEC: ' + impPec : ''}</p>`);
  const dlTesto = esc(d.destinatari?.dl_testo ?? '');
  p.push(`<p ${pd}>e, p.c.<br>Al Direttore dei Lavori${dlTesto ? '<br>' + dlTesto : ''}</p>`);
  const rupTesto = esc(d.destinatari?.rup_testo ?? '');
  if (rupTesto) {
    p.push(`<p ${pd}>Al Responsabile Unico del Progetto (se figura diversa da RL)<br>${rupTesto}</p>`);
  }
  const cseNome = esc(d.destinatari?.cse_nome ?? '');
  const csePec  = esc(d.destinatari?.cse_pec  ?? '');
  p.push(`<p ${pd}>Al Coordinatore per l'Esecuzione${cseNome ? '<br>' + cseNome : ''}${csePec ? '<br>PEC: ' + csePec : ''}</p>`);
  const rstTesto = esc(d.destinatari?.rst_testo ?? '');
  if (rstTesto) {
    p.push(`<p ${pd}>Al Responsabile Struttura Territoriale<br>${rstTesto}</p>`);
  }

  // 3. Oggetto (data-line=exact280, compatto)
  const ss  = esc(d.intestazione?.ss ?? '');
  const lav = esc(d.intestazione?.lavori ?? '');
  const cod = esc(d.intestazione?.cod_ppm_sil ?? '');
  const ctr = esc(d.intestazione?.contratto_numero ?? '');
  const ctd = d.intestazione?.contratto_data ? esc(UTILS.formatData(d.intestazione.contratto_data)) : '';
  p.push(`<p data-line="exact280"><strong>Oggetto:</strong> S.S. n° ${ss}</p>`);
  if (lav) p.push(`<p data-line="exact280"><strong>Lavori di:</strong> ${lav}</p>`);
  if (cod) p.push(`<p data-line="exact280"><strong>Cod. PPM/SIL:</strong> ${cod}</p>`);
  if (ctr) p.push(`<p data-line="exact280"><strong>Contratto n°:</strong> ${ctr}${ctd ? ' del ' + ctd : ''}</p>`);

  // 4. Titolo (bold, centrato) — data-before per stacco dall'oggetto sopra
  p.push(`<p data-align="center" data-before="200"><strong>DISPOSIZIONE DEL RESPONSABILE DEI LAVORI AI SENSI DELL'ART. 92 C.1 LETTERA E) DEL D.LGS. 81/08</strong></p>`);

  // 5. Sottoscritto RL (interlinea 1,5)
  const rlNome = esc(d.rl_testo ?? '');
  p.push(
    `<p data-line="15">Il sottoscritto <strong>${rlNome || '___'}</strong>, ` +
    `in qualità di Responsabile dei Lavori di cui all'oggetto</p>`
  );

  // 6. VISTO + testo (interlinea 1,5) — data-before per stacco da sottoscritto
  p.push(`<p data-align="center" data-before="160"><strong>VISTO</strong></p>`);
  const dataProp = esc(d.visto_data_proposta ?? '');
  p.push(
    `<p data-line="15">la proposta di provvedimenti avanzata ai sensi dell'art. 92 c.1 lett. e) ` +
    `dal Coordinatore per l'Esecuzione dei lavori, del ${dataProp || '___'}</p>`
  );

  // 7. DISPONE + 5 caselle (data-indent=elenco) — data-before per stacco da VISTO
  p.push(`<p data-align="center" data-before="160"><strong>DISPONE</strong></p>`);
  p.push(`<p data-line="15">di adottare il seguente provvedimento:</p>`);

  const prov = d.provvedimenti ?? {};
  const _val = (obj) => {
    const v = obj?.impresa_id ? _nomeImpresaGenRL(obj.impresa_id) : (obj?.valore?.trim() ?? '');
    return v ? ` ${esc(v)}` : ' ______';
  };
  p.push(`<p data-indent="elenco">${chk(prov.sospensione_lavori)} Sospensione dei lavori</p>`);
  p.push(`<p data-indent="elenco">${chk(prov.allontanamento_imprese?.flag)} Allontanamento della/e impresa/e${_val(prov.allontanamento_imprese)}</p>`);
  p.push(`<p data-indent="elenco">${chk(prov.allontanamento_lav_autonomi?.flag)} Allontanamento del/i lavoratore/i autonomo/i${_val(prov.allontanamento_lav_autonomi)}</p>`);
  p.push(`<p data-indent="elenco">${chk(prov.risoluzione_contratto?.flag)} Risoluzione del contratto${_val(prov.risoluzione_contratto)}</p>`);
  const altroTesto = prov.altro?.valore?.trim() ? esc(prov.altro.valore) : '______';
  p.push(`<p data-indent="elenco">${chk(prov.altro?.flag)} Altro: ${altroTesto}</p>`);

  // 8. Firma RL (destra, centrata)
  // data-before="200" stacca il blocco firma dalle caselle sopra (respiro)
  const pr   = 'data-indent="firma" data-align="center" style="padding-left:52%;text-align:center"';
  const prF  = `data-indent="firma" data-align="center" data-before="200" style="padding-left:52%;text-align:center"`;
  const rlNomeFirma = esc(d.firma_rl?.nome_cognome || d.rl_testo || '');
  p.push(`<p ${prF}>Il Responsabile dei Lavori</p>`);
  p.push(`<p ${pr}>${rlNomeFirma}</p>`);
  if (rlImg)   p.push(`<p ${pr}><img src="${rlImg}" alt="firma RL"></p>`);

  // 9. Visto firma (destra, centrata)
  const vistoQual = esc(d.visto_firma?.qualifica ?? 'Il Responsabile Area Gestione Rete / Il Responsabile Area Nuove Opere');
  const vistoNome = esc(d.visto_firma?.nome_cognome ?? '');
  p.push(`<p ${pr}>Visto:</p>`);
  p.push(`<p ${pr}>${vistoQual}</p>`);
  if (vistoNome) p.push(`<p ${pr}>${vistoNome}</p>`);
  if (vistoImg)  p.push(`<p ${pr}><img src="${vistoImg}" alt="firma Visto"></p>`);

  return p.join('\n');
}

// ── Hook Diario CSE — best-effort (non blocca mai la protocollazione) ─────────

async function _hookDiarioRLProtocollata(corrente, cantiere_id) {
  if (typeof DIARIO_SERVICE === 'undefined') return;
  const numero   = corrente.numero_progressivo ?? '';
  const dataProt = corrente.protocollo?.data_protocollo
                   ? UTILS.formatData(corrente.protocollo.data_protocollo) : '';
  const impNome  = corrente.destinatari?.impresa_nome
                   || (corrente.destinatari?.impresa_id ? _nomeImpresaGenRL(corrente.destinatari.impresa_id) : '');
  const prov     = corrente.provvedimenti ?? {};
  const provvElencati = [
    prov.sospensione_lavori                ? 'sospensione lavori'          : null,
    prov.allontanamento_imprese?.flag      ? 'allontanamento impresa'      : null,
    prov.allontanamento_lav_autonomi?.flag ? 'allontanamento lav.autonomo' : null,
    prov.risoluzione_contratto?.flag       ? 'risoluzione contratto'       : null,
  ].filter(Boolean).join(', ');
  const titolo = `Disposizione RL protocollata${numero ? ': n. ' + numero : ''}`;
  const desc   = [
    impNome       ? `Destinatario: ${impNome}`         : null,
    provvElencati ? `Provvedimenti: ${provvElencati}`  : null,
    dataProt      ? `Data protocollo: ${dataProt}`     : null,
  ].filter(Boolean).join('\n');
  await DIARIO_SERVICE.creaVoceAuto({
    cantiere_id,
    tipo:        'DISPOSIZIONE_RL',
    titolo,
    descrizione: desc,
    soggetti:    impNome ? [impNome] : [],
    riferimento: corrente.id,
  });
}

function _nomeImpresaGenRL(id) {
  try { return ANAGRAFICA_SERVICE.getEntita('imprese', id)?.ragioneSociale ?? id ?? ''; }
  catch { return id ?? ''; }
}

// ── Template HTML ─────────────────────────────────────────────────────────────

const _TEMPLATE_RL = /* html */`
<div x-data="DisposizioneRL()" x-init="init()"
     class="p-4 max-w-4xl mx-auto pb-32" role="region"
     aria-label="Disposizione di sospensione/allontanamento del RL">

  <!-- HEADER -->
  <div class="flex flex-wrap items-center justify-between gap-3 mb-4">
    <div class="flex items-center gap-3">
      <button x-show="corrente !== null" @click="chiudiEditor()"
              class="text-slate-400 hover:text-slate-700 p-1 rounded transition-colors
                     focus:outline-none focus:ring-2 focus:ring-blue-500"
              aria-label="Torna alla lista">&#8592;</button>
      <h2 class="text-lg font-semibold text-slate-800">Disposizione del Responsabile dei Lavori</h2>
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

  <!-- NOTE NORMATIVE -->
  <div x-show="noteAperte" x-transition class="nota-normativa-panel mb-4" role="note">
    <p class="text-xs text-sky-500 mb-2 italic">Promemoria per il CSE — non compare nel documento generato.</p>
    <template x-for="nota in noteRL" :key="nota.titolo">
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
        <span x-show="!caricamento && vistaLista==='protocollati' && listaProtocollati.length===0 && Alpine.store('cantiere').id">Nessuna disposizione protocollata.</span>
        <span x-show="!Alpine.store('cantiere').id" class="text-amber-600">Seleziona un cantiere.</span>
      </p>
      <button x-show="vistaLista==='bozze'" @click="nuovo()" :disabled="!Alpine.store('cantiere').id"
              class="bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white text-sm font-medium
                     px-4 py-2 rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2">
        + Nuova disposizione
      </button>
    </div>

    <!-- Lista BOZZE -->
    <div x-show="vistaLista==='bozze'" class="space-y-2">
      <template x-for="v in lista" :key="v.id">
        <div class="bg-white border border-slate-200 rounded-lg px-4 py-3 flex items-center gap-3 hover:border-slate-300 transition-colors">
          <div class="flex-1 min-w-0 cursor-pointer" @click="apri(v.id)">
            <div class="flex items-center gap-2 flex-wrap">
              <span class="text-sm font-medium text-slate-800"
                    x-text="v.rl_testo || 'Bozza'"></span>
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
              <p class="text-xs text-slate-500 mt-0.5" x-text="v.rl_testo || ''"></p>
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
          <button role="tab" class="modulo-tab" :class="{'attiva': scheda==='firme'}"
                  @click="scheda='firme'" :aria-selected="String(scheda==='firme')">Firme
            <template x-if="!corrente.firma_rl.firma_png_base64">
              <span class="ml-1 text-xs bg-amber-100 text-amber-700 rounded-full px-1.5">!</span>
            </template>
          </button>
        </div>

        <!-- TAB DOCUMENTO -->
        <div x-show="scheda==='documento'" role="tabpanel">

          <!-- Tabella amministrativa -->
          <h3 class="text-sm font-semibold text-slate-700 mb-3">Dati amministrativi (da anagrafica)</h3>
          <div class="grid grid-cols-2 md:grid-cols-3 gap-3 mb-6">
            <div>
              <label class="block text-xs text-slate-500 mb-1">PPM/SIL / OdA</label>
              <input type="text" x-model="corrente.tabella_amm.ppm_sil" @input="_scheduleAutosave()"
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
          <p class="text-xs text-slate-400 mb-4 italic">Il riquadro 'Protocollo' è lasciato vuoto — compilato dai superiori al protocollo.</p>

          <!-- RL -->
          <h3 class="text-sm font-semibold text-slate-700 mb-3">Responsabile dei Lavori (firma l'atto)</h3>
          <div class="mb-4">
            <label class="block text-xs text-slate-500 mb-1">Seleziona da anagrafica</label>
            <select @change="selezionaRl($event.target.value)"
                    class="w-full text-xs border border-slate-300 rounded-md px-2 py-1.5 mb-2 focus:outline-none focus:ring-2 focus:ring-blue-500">
              <option value="">-- Seleziona o inserisci manuale --</option>
              <template x-for="pc in personeCommittente" :key="pc.id">
                <option :value="pc.id"
                        x-text="[pc.qualifica,pc.cognome,pc.nome].filter(Boolean).join(' ')"></option>
              </template>
            </select>
            <input type="text" x-model="corrente.rl_testo" @input="_scheduleAutosave()"
                   placeholder="Qualifica Cognome Nome"
                   class="w-full border border-slate-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
          </div>

          <!-- Destinatari -->
          <h3 class="text-sm font-semibold text-slate-700 mb-3">Destinatari</h3>
          <div class="space-y-3 mb-4">

            <!-- Impresa affidataria -->
            <div class="bg-slate-50 border border-slate-200 rounded-lg p-3">
              <p class="text-xs text-slate-400 mb-2">Impresa Affidataria</p>
              <select @change="selezionaImpresaDestinatario($event.target.value)"
                      class="w-full text-xs border border-slate-300 rounded px-2 py-1 mb-2 focus:outline-none focus:ring-2 focus:ring-blue-500">
                <option value="">-- Da anagrafica o manuale --</option>
                <template x-for="imp in imprese" :key="imp.id">
                  <option :value="imp.id" x-text="imp.ragioneSociale"></option>
                </template>
              </select>
              <div class="grid grid-cols-2 gap-2">
                <input type="text" x-model="corrente.destinatari.impresa_nome" @input="_scheduleAutosave()"
                       placeholder="Ragione sociale"
                       class="text-sm border border-slate-300 rounded px-2 py-1 focus:outline-none focus:ring-2 focus:ring-blue-500">
                <input type="text" x-model="corrente.destinatari.impresa_pec" @input="_scheduleAutosave()"
                       placeholder="PEC impresa"
                       class="text-sm border border-slate-300 rounded px-2 py-1 focus:outline-none focus:ring-2 focus:ring-blue-500">
              </div>
            </div>

            <!-- DL -->
            <div class="bg-slate-50 border border-slate-200 rounded-lg p-3">
              <p class="text-xs text-slate-400 mb-2">p.c. Direttore dei Lavori</p>
              <select @change="selezionaPersonaDestinatario('dl', $event.target.value)"
                      class="w-full text-xs border border-slate-300 rounded px-2 py-1 mb-1 focus:outline-none focus:ring-2 focus:ring-blue-500">
                <option value="">-- Da anagrafica o manuale --</option>
                <template x-for="pc in personeCommittente" :key="pc.id">
                  <option :value="pc.id" x-text="[pc.qualifica,pc.cognome,pc.nome].filter(Boolean).join(' ')"></option>
                </template>
              </select>
              <input type="text" x-model="corrente.destinatari.dl_testo" @input="_scheduleAutosave()"
                     placeholder="Qualifica Cognome Nome"
                     class="w-full text-sm border border-slate-300 rounded px-2 py-1 focus:outline-none focus:ring-2 focus:ring-blue-500">
            </div>

            <!-- RUP -->
            <div class="bg-slate-50 border border-slate-200 rounded-lg p-3">
              <p class="text-xs text-slate-400 mb-2">p.c. RUP (se diverso da RL)</p>
              <select @change="selezionaPersonaDestinatario('rup', $event.target.value)"
                      class="w-full text-xs border border-slate-300 rounded px-2 py-1 mb-1 focus:outline-none focus:ring-2 focus:ring-blue-500">
                <option value="">-- Da anagrafica o manuale --</option>
                <template x-for="pc in personeCommittente" :key="pc.id">
                  <option :value="pc.id" x-text="[pc.qualifica,pc.cognome,pc.nome].filter(Boolean).join(' ')"></option>
                </template>
              </select>
              <input type="text" x-model="corrente.destinatari.rup_testo" @input="_scheduleAutosave()"
                     placeholder="Qualifica Cognome Nome (opzionale)"
                     class="w-full text-sm border border-slate-300 rounded px-2 py-1 focus:outline-none focus:ring-2 focus:ring-blue-500">
            </div>

            <!-- CSE -->
            <div class="bg-slate-50 border border-slate-200 rounded-lg p-3">
              <p class="text-xs text-slate-400 mb-2">p.c. Coordinatore per l'Esecuzione (CSE)</p>
              <div class="grid grid-cols-2 gap-2">
                <input type="text" x-model="corrente.destinatari.cse_nome" @input="_scheduleAutosave()"
                       placeholder="Qualifica Cognome Nome (da M2)"
                       class="text-sm border border-slate-300 rounded px-2 py-1 focus:outline-none focus:ring-2 focus:ring-blue-500">
                <input type="text" x-model="corrente.destinatari.cse_pec" @input="_scheduleAutosave()"
                       placeholder="PEC CSE (manuale)"
                       class="text-sm border border-slate-300 rounded px-2 py-1 focus:outline-none focus:ring-2 focus:ring-blue-500">
              </div>
            </div>

            <!-- RST -->
            <div class="bg-slate-50 border border-slate-200 rounded-lg p-3">
              <p class="text-xs text-slate-400 mb-2">p.c. Responsabile Struttura Territoriale (manuale)</p>
              <input type="text" x-model="corrente.destinatari.rst_testo" @input="_scheduleAutosave()"
                     placeholder="Nome RST (campo manuale)"
                     class="w-full text-sm border border-slate-300 rounded px-2 py-1 focus:outline-none focus:ring-2 focus:ring-blue-500">
            </div>
          </div>

          <!-- Oggetto -->
          <h3 class="text-sm font-semibold text-slate-700 mb-3">Oggetto (snapshot da anagrafica)</h3>
          <div class="grid grid-cols-2 gap-3 mb-4">
            <div>
              <label class="block text-xs text-slate-500 mb-1">S.S. n°</label>
              <input type="text" x-model="corrente.intestazione.ss" @input="_scheduleAutosave()"
                     class="w-full border border-slate-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
            </div>
            <div>
              <label class="block text-xs text-slate-500 mb-1">Cod. PPM/SIL</label>
              <input type="text" x-model="corrente.intestazione.cod_ppm_sil" @input="_scheduleAutosave()"
                     class="w-full border border-slate-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
            </div>
            <div class="col-span-2">
              <label class="block text-xs text-slate-500 mb-1">Lavori di</label>
              <input type="text" x-model="corrente.intestazione.lavori" @input="_scheduleAutosave()"
                     class="w-full border border-slate-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
            </div>
            <div>
              <label class="block text-xs text-slate-500 mb-1">Contratto n°</label>
              <input type="text" x-model="corrente.intestazione.contratto_numero" @input="_scheduleAutosave()"
                     class="w-full border border-slate-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
            </div>
            <div>
              <label class="block text-xs text-slate-500 mb-1">del</label>
              <input type="date" x-model="corrente.intestazione.contratto_data" @change="_scheduleAutosave()"
                     class="w-full border border-slate-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
            </div>
          </div>

          <!-- VISTO -->
          <div class="bg-amber-50 border border-amber-200 rounded-lg p-3 mb-4">
            <p class="text-xs text-amber-700 font-medium mb-2">
              VISTO — data proposta CSE
              <span class="font-normal text-amber-600 ml-1">
                <!-- TODO M13: sostituire con select delle Proposte di Sospensione del cantiere -->
                — inserimento manuale per ora
              </span>
            </p>
            <input type="date" x-model="corrente.visto_data_proposta" @change="_scheduleAutosave()"
                   placeholder="Data proposta CSE (manuale)"
                   class="w-full border border-slate-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
          </div>

          <!-- DISPONE — provvedimenti -->
          <fieldset class="mb-4">
            <legend class="text-xs font-semibold text-slate-700 mb-3">DISPONE di adottare il seguente provvedimento</legend>
            <div class="space-y-3">

              <label class="flex items-center gap-3 cursor-pointer">
                <input type="checkbox" x-model="corrente.provvedimenti.sospensione_lavori"
                       @change="_scheduleAutosave()"
                       class="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-2 focus:ring-blue-500">
                <span class="text-sm">Sospensione dei lavori</span>
              </label>

              <div>
                <label class="flex items-center gap-3 cursor-pointer mb-1">
                  <input type="checkbox" x-model="corrente.provvedimenti.allontanamento_imprese.flag"
                         @change="_scheduleAutosave()"
                         class="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-2 focus:ring-blue-500">
                  <span class="text-sm">Allontanamento della/e impresa/e</span>
                </label>
                <div x-show="corrente.provvedimenti.allontanamento_imprese.flag" class="ml-7 flex gap-2">
                  <select @change="selezionaImpresaProvvedimento('allontanamento_imprese', $event.target.value)"
                          class="text-xs border border-slate-300 rounded px-2 py-1 focus:outline-none focus:ring-2 focus:ring-blue-500">
                    <option value="">-- Da anagrafica --</option>
                    <template x-for="imp in imprese" :key="imp.id">
                      <option :value="imp.id" x-text="imp.ragioneSociale"></option>
                    </template>
                  </select>
                  <input type="text" x-model="corrente.provvedimenti.allontanamento_imprese.valore"
                         @input="_scheduleAutosave()" placeholder="Ragione sociale"
                         class="flex-1 border border-slate-300 rounded px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                </div>
              </div>

              <div>
                <label class="flex items-center gap-3 cursor-pointer mb-1">
                  <input type="checkbox" x-model="corrente.provvedimenti.allontanamento_lav_autonomi.flag"
                         @change="_scheduleAutosave()"
                         class="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-2 focus:ring-blue-500">
                  <span class="text-sm">Allontanamento del/i lavoratore/i autonomo/i</span>
                </label>
                <div x-show="corrente.provvedimenti.allontanamento_lav_autonomi.flag" class="ml-7">
                  <input type="text" x-model="corrente.provvedimenti.allontanamento_lav_autonomi.valore"
                         @input="_scheduleAutosave()" placeholder="Nome lavoratore autonomo"
                         class="w-full border border-slate-300 rounded px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                </div>
              </div>

              <div>
                <label class="flex items-center gap-3 cursor-pointer mb-1">
                  <input type="checkbox" x-model="corrente.provvedimenti.risoluzione_contratto.flag"
                         @change="_scheduleAutosave()"
                         class="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-2 focus:ring-blue-500">
                  <span class="text-sm">Risoluzione del contratto</span>
                </label>
                <div x-show="corrente.provvedimenti.risoluzione_contratto.flag" class="ml-7 flex gap-2">
                  <select @change="selezionaImpresaProvvedimento('risoluzione_contratto', $event.target.value)"
                          class="text-xs border border-slate-300 rounded px-2 py-1 focus:outline-none focus:ring-2 focus:ring-blue-500">
                    <option value="">-- Da anagrafica --</option>
                    <template x-for="imp in imprese" :key="imp.id">
                      <option :value="imp.id" x-text="imp.ragioneSociale"></option>
                    </template>
                  </select>
                  <input type="text" x-model="corrente.provvedimenti.risoluzione_contratto.valore"
                         @input="_scheduleAutosave()" placeholder="Impresa o lavoratore autonomo"
                         class="flex-1 border border-slate-300 rounded px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                </div>
              </div>

              <div>
                <label class="flex items-center gap-3 cursor-pointer mb-1">
                  <input type="checkbox" x-model="corrente.provvedimenti.altro.flag"
                         @change="_scheduleAutosave()"
                         class="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-2 focus:ring-blue-500">
                  <span class="text-sm">Altro</span>
                </label>
                <div x-show="corrente.provvedimenti.altro.flag" class="ml-7">
                  <input type="text" x-model="corrente.provvedimenti.altro.valore"
                         @input="_scheduleAutosave()" placeholder="Specificare..."
                         class="w-full border border-slate-300 rounded px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                </div>
              </div>

            </div>
          </fieldset>

        </div><!-- /tab documento -->

        <!-- TAB FIRME -->
        <div x-show="scheda==='firme'" role="tabpanel">
          <div class="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 mb-4 text-xs text-amber-800">
            <strong>Nota firma legale:</strong> La firma legalmente valida avviene via
            <strong>GoSign</strong> (strumento esterno a SafeHub). La firma qui caricata è solo
            grafica/di lavoro e non ha valore legale. Non è richiesta per finalizzare.
          </div>

          <!-- Firma RL -->
          <h3 class="text-sm font-semibold text-slate-700 mb-3">Il Responsabile dei Lavori</h3>
          <div class="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
            <p class="text-sm font-medium" x-text="corrente.rl_testo || '(RL non configurato — vedi tab Documento)'"></p>
            <p class="text-xs text-slate-500 mt-0.5">Firma: solo upload (firma legale = GoSign esterno)</p>
            <template x-if="corrente.firma_rl.firma_png_base64">
              <div class="flex items-center gap-3 mt-3">
                <img :src="corrente.firma_rl.firma_png_base64" class="h-10 border rounded bg-white" alt="firma RL">
                <span class="text-xs text-green-600">&#10003; Firma caricata</span>
                <button @click="rimuoviFirmaRL()" class="text-xs text-slate-400 hover:text-red-500 underline">Rimuovi</button>
              </div>
            </template>
            <template x-if="!corrente.firma_rl.firma_png_base64">
              <label class="mt-3 inline-flex text-xs bg-white text-blue-700 border border-blue-300 px-3 py-1.5 rounded hover:bg-blue-50 cursor-pointer transition-colors">
                &#128206; Carica firma PNG
                <input type="file" accept=".png,image/png" class="sr-only" @change="onUploadFirmaRL($event)">
              </label>
            </template>
          </div>

          <!-- Visto firma -->
          <h3 class="text-sm font-semibold text-slate-700 mb-3">Visto</h3>
          <div class="bg-slate-50 border border-slate-200 rounded-lg p-4">
            <div class="mb-2">
              <label class="block text-xs text-slate-500 mb-1">Qualifica</label>
              <input type="text" x-model="corrente.visto_firma.qualifica" @input="_scheduleAutosave()"
                     class="w-full border border-slate-300 rounded px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
            </div>
            <div class="mb-2">
              <label class="block text-xs text-slate-500 mb-1">Cognome e Nome</label>
              <input type="text" x-model="corrente.visto_firma.nome_cognome" @input="_scheduleAutosave()"
                     placeholder="(opzionale)"
                     class="w-full border border-slate-300 rounded px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
            </div>
            <template x-if="corrente.visto_firma.firma_png_base64">
              <div class="flex items-center gap-3">
                <img :src="corrente.visto_firma.firma_png_base64" class="h-10 border rounded bg-white" alt="firma Visto">
                <span class="text-xs text-green-600">&#10003; Firma caricata</span>
                <button @click="rimuoviVisto()" class="text-xs text-slate-400 hover:text-red-500 underline">Rimuovi</button>
              </div>
            </template>
            <template x-if="!corrente.visto_firma.firma_png_base64">
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
  </div><!-- /editor -->

  <!-- DRAWER PROTOCOLLAZIONE -->
  <div x-show="drawerProtocolloAperto" class="drawer-backdrop" @click="drawerProtocolloAperto=false"></div>
  <div x-show="drawerProtocolloAperto" x-transition.opacity class="drawer"
       role="dialog" aria-modal="true" aria-label="Protocollazione disposizione">
    <div class="drawer-header px-5 py-4 border-b border-slate-200 flex items-center justify-between">
      <h3 class="font-semibold text-slate-800">Protocolla disposizione</h3>
      <button @click="drawerProtocolloAperto=false"
              class="text-slate-400 hover:text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500 rounded"
              aria-label="Chiudi">&#10005;</button>
    </div>
    <div class="drawer-body px-5 py-4 space-y-4">
      <div>
        <label for="rl-proto-numero" class="block text-xs font-medium text-slate-600 mb-1">Numero protocollo <span class="text-red-500">*</span></label>
        <input id="rl-proto-numero" type="text" x-model="proto.numero" placeholder="es. 2026/043"
               class="w-full border border-slate-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
      </div>
      <div>
        <label for="rl-proto-data" class="block text-xs font-medium text-slate-600 mb-1">Data protocollo</label>
        <input id="rl-proto-data" type="date" x-model="proto.data"
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
window.MODULI_REGISTRATI['disposizione-rl'] = {
  monta(contenitore) { contenitore.innerHTML = _TEMPLATE_RL; },
};
