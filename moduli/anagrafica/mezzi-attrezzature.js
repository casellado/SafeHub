/**
 * mezzi-attrezzature.js — M4 Fase 3: collezioni Mezzi e Attrezzature.
 *
 * Due tab in un solo modulo; due drawer separati (entrambi .drawer condiviso).
 * Mezzi = macchine semoventi/sollevamento (TIPI_MEZZO, verifica INAIL).
 * Attrezzature = strumenti non semoventi (TIPOLOGIE_ATTREZZATURA, CE + verifiche).
 *
 * Nota tecnica (futura): i TIPI_MEZZO di sollevamento (gru, PLE, ecc.) si
 * sovrappongono a TIPI_ABILITAZIONE_OPERATORE — la coppia lavoratore-abilitato /
 * mezzo-verificato sarà collegabile in un'analisi futura, non in questa fase.
 */

const _leggiFileBase64MA = (file) =>
  new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload  = (e) => resolve(e.target.result);
    r.onerror = ()  => reject(new Error('Lettura file non riuscita'));
    r.readAsDataURL(file);
  });

// ── Componente Alpine ────────────────────────────────────────────────────────

function ListaMezziAttrezzature() {
  return {
    tabAttiva: 'mezzi',

    // Dati
    mezzi: [], attrezzature: [], imprese: [],
    caricamento: true,

    // Filtri mezzi
    cercaMezzi: '', filtroImpresaMezzi: '', soloPresenti: false, mostraCestinoMezzi: false,
    // Filtri attrezzature
    cercaAtt: '', filtroImpresaAtt: '', mostraCestinoAtt: false,

    // Drawer mezzo
    drawerMezzo: false, formMezzo: {}, nuovoMezzo: true, salvandoMezzo: false, modMezzo: false,
    // Drawer attrezzatura
    drawerAtt: false, formAtt: {}, nuovaAtt: true, salvandoAtt: false, modAtt: false,

    _cantiereId: null,

    // ── Documenti extra mezzo (raccoglitore libero) ────────────────────────
    mostraFormExtraMz:   false,
    idExtraInModificaMz: null,
    formExtraMz: { titolo: '', scadenza: '', filename: null, base64: null },

    // ── Documenti extra attrezzatura (raccoglitore libero) ─────────────────
    mostraFormExtraAtt:   false,
    idExtraInModificaAtt: null,
    formExtraAtt: { titolo: '', scadenza: '', filename: null, base64: null },

    // ── Computed mezzi ────────────────────────────────────────────────────

    get mezziFiltrati() {
      const t = this.cercaMezzi.toLowerCase();
      return this.mezzi.filter(m => !m._cestino)
        .filter(m => !this.soloPresenti || m.presenteInCantiere)
        .filter(m => !this.filtroImpresaMezzi || m.impresa_id === this.filtroImpresaMezzi)
        .filter(m => !t || [m.marca, m.modello, m.matricola, m.tipologia].some(v => v?.toLowerCase().includes(t)));
    },
    get mezziCestino() { return this.mezzi.filter(m => m._cestino); },
    get contatoriMezzi() {
      const a = this.mezzi.filter(m => !m._cestino);
      const c = a.map(m => ANAGRAFICA_SERVICE.calcolaConformitaMezzo(m));
      return { totale: a.length, verde: c.filter(x=>x.stato==='verde').length, giallo: c.filter(x=>x.stato==='giallo').length, rosso: c.filter(x=>x.stato==='rosso').length };
    },
    get alertCriticiMezzi() {
      return this.mezzi.filter(m => !m._cestino).flatMap(m => {
        const conf = ANAGRAFICA_SERVICE.calcolaConformitaMezzo(m);
        return conf.scadenze.filter(s => s.stato === 'scaduto' && s.criticita === 'critica')
          .map(s => ({ mezzoId: m.id, descrizione: [m.marca, m.modello].filter(Boolean).join(' ') || m.tipologia || m.id, ...s }));
      });
    },

    // ── Computed attrezzature ─────────────────────────────────────────────

    get attFiltrate() {
      const t = this.cercaAtt.toLowerCase();
      return this.attrezzature.filter(a => !a._cestino)
        .filter(a => !this.filtroImpresaAtt || a.impresa_id === this.filtroImpresaAtt)
        .filter(a => !t || [a.tipologia, a.descrizione, a.matricola].some(v => v?.toLowerCase().includes(t)));
    },
    get attCestino() { return this.attrezzature.filter(a => a._cestino); },
    get contatoriAtt() {
      const a = this.attrezzature.filter(a => !a._cestino);
      const c = a.map(a => ANAGRAFICA_SERVICE.calcolaConformitaAttrezzatura(a));
      return { totale: a.length, verde: c.filter(x=>x.stato==='verde').length, giallo: c.filter(x=>x.stato==='giallo').length, rosso: c.filter(x=>x.stato==='rosso').length };
    },
    get alertCriticiAtt() {
      return this.attrezzature.filter(a => !a._cestino).flatMap(a => {
        const conf = ANAGRAFICA_SERVICE.calcolaConformitaAttrezzatura(a);
        return conf.scadenze.filter(s => s.stato === 'scaduto' && s.criticita === 'critica')
          .map(s => ({ attId: a.id, descrizione: a.descrizione || a.tipologia || a.id, ...s }));
      });
    },

    // ── Lifecycle ─────────────────────────────────────────────────────────

    init() {
      this._cantiereId = Alpine.store('cantiere')?.id;
      if (ANAGRAFICA_SERVICE.isCaricato && ANAGRAFICA_SERVICE.cantiereId === this._cantiereId) {
        this.caricaDati();
      } else {
        this.caricamento = true;
        document.addEventListener('anagrafica-caricata', () => this.caricaDati(), { once: true });
      }
    },

    aggiornaSeCantiereRicambia() {
      const id = Alpine.store('cantiere')?.id;
      if (id !== this._cantiereId) {
        this._cantiereId = id;
        this.filtroImpresaMezzi = ''; this.filtroImpresaAtt = '';
        if (!id) { this.mezzi = []; this.attrezzature = []; this.imprese = []; this.caricamento = false; return; }
        this.caricamento = true;
        if (ANAGRAFICA_SERVICE.cantiereId === id) { this.caricaDati(); }
        else { document.addEventListener('anagrafica-caricata', (e) => { if (e.detail?.cantiereId === id) this.caricaDati(); }, { once: true }); }
      }
    },

    caricaDati() {
      this.mezzi         = [...(ANAGRAFICA_SERVICE.get('mezzi',         { inclCestino: true }) ?? [])];
      this.attrezzature  = [...(ANAGRAFICA_SERVICE.get('attrezzature',  { inclCestino: true }) ?? [])];
      this.imprese       = [...(ANAGRAFICA_SERVICE.get('imprese') ?? [])];
      this.caricamento   = false;
    },

    // ── Drawer mezzo ──────────────────────────────────────────────────────

    nuovoMezzoFn() {
      this.formMezzo = ANAGRAFICA_SERVICE.creaEntitaVuota('mezzi');
      this.nuovoMezzo = true; this.modMezzo = false; this.drawerMezzo = true;
      this.$nextTick(() => document.getElementById('mz-tipologia')?.focus());
    },

    modificaMezzo(id) {
      const m = this.mezzi.find(x => x.id === id);
      if (!m) return;
      this.formMezzo = JSON.parse(JSON.stringify(m));
      this.formMezzo.verifichePeriodiche ??= [];
      // Assegna id alle verifiche pre-esistenti che ne sono prive (retrocompatibilità)
      for (const vp of this.formMezzo.verifichePeriodiche) {
        if (!vp.id) vp.id = UTILS.generaId('vpz');
      }
      this.formMezzo.libretto            ??= {};
      this.formMezzo.documenti_extra     ??= [];
      this.nuovoMezzo = false; this.modMezzo = false; this.drawerMezzo = true;
    },

    chiudiDrawerMezzo(forza = false) {
      if (!forza && this.modMezzo && !confirm('Modifiche non salvate. Chiudere?')) return;
      this.drawerMezzo = false; this.formMezzo = {};
    },

    async salvaIlMezzo() {
      this.salvandoMezzo = true;
      try {
        if (this.nuovoMezzo) await ANAGRAFICA_SERVICE.aggiungi('mezzi', this.formMezzo);
        else                 await ANAGRAFICA_SERVICE.aggiorna('mezzi', this.formMezzo.id, this.formMezzo);
        this.caricaDati(); this.chiudiDrawerMezzo(true);
        NOTIFICHE.successo(this.nuovoMezzo ? 'Mezzo aggiunto' : 'Mezzo aggiornato');
      } catch (err) { ERRORI.gestisciErrore('mezzi/salva', err); }
      finally { this.salvandoMezzo = false; }
    },

    async cestinaMezzo(id) {
      try { await ANAGRAFICA_SERVICE.cestina('mezzi', id); this.caricaDati(); NOTIFICHE.info('Mezzo nel cestino'); }
      catch (err) { ERRORI.gestisciErrore('mezzi/cestina', err); }
    },
    async ripristinaMezzo(id) {
      try { await ANAGRAFICA_SERVICE.ripristina('mezzi', id); this.caricaDati(); NOTIFICHE.successo('Mezzo ripristinato'); }
      catch (err) { ERRORI.gestisciErrore('mezzi/ripristina', err); }
    },
    async eliminaMezzo(id) {
      if (!confirm('Eliminare definitivamente?')) return;
      try { await ANAGRAFICA_SERVICE.eliminaDefinitivamente('mezzi', id); this.caricaDati(); }
      catch (err) { ERRORI.gestisciErrore('mezzi/elimina', err); }
    },

    // Verifiche periodiche mezzo (lista dinamica — soft-delete per storico)
    aggiungiVerificaMezzo() {
      (this.formMezzo.verifichePeriodiche ??= []).push({
        id: UTILS.generaId('vpz'),
        tipo: '', data: null, prossima: null, ente: '', filename: null, base64: null,
      });
      this.formMezzo = { ...this.formMezzo }; this.modMezzo = true;
    },
    rimuoviVerificaMezzo(id) {
      const idx = (this.formMezzo.verifichePeriodiche ?? []).findIndex(vp => vp.id === id && !vp._cestino);
      if (idx < 0) return;
      this.formMezzo.verifichePeriodiche[idx] = {
        ...this.formMezzo.verifichePeriodiche[idx],
        _cestino: true,
        _eliminato_il: new Date().toISOString(),
      };
      this.formMezzo = { ...this.formMezzo }; this.modMezzo = true;
    },
    async onVerificaMezzoFile(id, ev) {
      const f = ev.target.files?.[0]; if (!f) return;
      const b64 = await _leggiFileBase64MA(f);
      const old    = (this.formMezzo.verifichePeriodiche ?? []).find(vp => vp.id === id && !vp._cestino);
      if (!old) return;
      const oldIdx = this.formMezzo.verifichePeriodiche.indexOf(old);
      this.formMezzo.verifichePeriodiche[oldIdx] = { ...old, _cestino: true, _eliminato_il: new Date().toISOString() };
      this.formMezzo.verifichePeriodiche.push({
        id: UTILS.generaId('vpz'), tipo: old.tipo, data: old.data,
        prossima: old.prossima, ente: old.ente, filename: f.name, base64: b64,
      });
      this.formMezzo = { ...this.formMezzo }; this.modMezzo = true;
    },

    get verificheAttiveMz() {
      return (this.formMezzo.verifichePeriodiche ?? []).filter(vp => !vp._cestino);
    },
    storicoVerificaMz(tipo) {
      return (this.formMezzo.verifichePeriodiche ?? [])
        .filter(vp => vp._cestino && vp.tipo === tipo)
        .sort((a, b) => (b._eliminato_il ?? '').localeCompare(a._eliminato_il ?? ''));
    },

    async onLibrettoMezzoFile(ev) {
      const f = ev.target.files?.[0]; if (!f) return;
      this.formMezzo.libretto = { filename: f.name, base64: await _leggiFileBase64MA(f) };
      this.formMezzo = { ...this.formMezzo }; this.modMezzo = true;
    },

    // ── Documenti extra mezzo — metodi raccoglitore ───────────────────────

    get extraAttiviMz() {
      return (this.formMezzo.documenti_extra ?? []).filter(e => !e._cestino);
    },

    apriFormExtraMz() {
      this.idExtraInModificaMz = null;
      this.formExtraMz = { titolo: '', scadenza: '', filename: null, base64: null };
      this.mostraFormExtraMz = true;
    },

    apriModificaExtraMz(id) {
      const ex = (this.formMezzo.documenti_extra ?? []).find(e => e.id === id && !e._cestino);
      if (!ex) return;
      this.idExtraInModificaMz = id;
      this.formExtraMz = { titolo: ex.titolo ?? '', scadenza: ex.scadenza ?? '', filename: ex.filename, base64: ex.base64 };
      this.mostraFormExtraMz = true;
    },

    chiudiFormExtraMz() {
      this.mostraFormExtraMz = false;
      this.idExtraInModificaMz = null;
      this.formExtraMz = { titolo: '', scadenza: '', filename: null, base64: null };
    },

    async onExtraFileMz(event) {
      const file = event.target.files?.[0];
      if (!file) return;
      this.formExtraMz = { ...this.formExtraMz, filename: file.name, base64: await _leggiFileBase64MA(file) };
    },

    salvaExtraMz() {
      const titolo = (this.formExtraMz.titolo ?? '').trim();
      if (!titolo) return;
      if (!this.formMezzo.documenti_extra) this.formMezzo.documenti_extra = [];

      // Soft-delete del record precedente in caso di modifica
      if (this.idExtraInModificaMz) {
        const idx = this.formMezzo.documenti_extra.findIndex(e => e.id === this.idExtraInModificaMz);
        if (idx >= 0) {
          this.formMezzo.documenti_extra[idx] = {
            ...this.formMezzo.documenti_extra[idx],
            _cestino: true,
            _eliminato_il: new Date().toISOString(),
          };
        }
      }

      this.formMezzo.documenti_extra.push({
        id:       UTILS.generaId('ext'),
        titolo,
        scadenza: this.formExtraMz.scadenza || null,
        filename: this.formExtraMz.filename ?? null,
        base64:   this.formExtraMz.base64   ?? null,
      });
      this.formMezzo = { ...this.formMezzo };
      this.modMezzo = true;
      this.chiudiFormExtraMz();
    },

    cestinaExtraMz(id) {
      const idx = (this.formMezzo.documenti_extra ?? []).findIndex(e => e.id === id && !e._cestino);
      if (idx < 0) return;
      this.formMezzo.documenti_extra[idx] = {
        ...this.formMezzo.documenti_extra[idx],
        _cestino: true,
        _eliminato_il: new Date().toISOString(),
      };
      this.formMezzo = { ...this.formMezzo };
      this.modMezzo = true;
    },

    // ── Drawer attrezzatura ───────────────────────────────────────────────

    nuovaAttFn() {
      this.formAtt = ANAGRAFICA_SERVICE.creaEntitaVuota('attrezzature');
      this.nuovaAtt = true; this.modAtt = false; this.drawerAtt = true;
      this.$nextTick(() => document.getElementById('att-tipologia')?.focus());
    },

    modificaAtt(id) {
      const a = this.attrezzature.find(x => x.id === id);
      if (!a) return;
      this.formAtt = JSON.parse(JSON.stringify(a));
      this.formAtt.verifiche             ??= [];
      this.formAtt.documentiSpecifici    ??= [];
      this.formAtt.dichiarazioneConformitaCE ??= { presente: false };
      this.formAtt.libretto              ??= {};
      this.formAtt.documenti_extra       ??= [];
      this.nuovaAtt = false; this.modAtt = false; this.drawerAtt = true;
    },

    chiudiDrawerAtt(forza = false) {
      if (!forza && this.modAtt && !confirm('Modifiche non salvate. Chiudere?')) return;
      this.drawerAtt = false; this.formAtt = {};
    },

    async salvaLaAtt() {
      this.salvandoAtt = true;
      try {
        if (this.nuovaAtt) await ANAGRAFICA_SERVICE.aggiungi('attrezzature', this.formAtt);
        else               await ANAGRAFICA_SERVICE.aggiorna('attrezzature', this.formAtt.id, this.formAtt);
        this.caricaDati(); this.chiudiDrawerAtt(true);
        NOTIFICHE.successo(this.nuovaAtt ? 'Attrezzatura aggiunta' : 'Attrezzatura aggiornata');
      } catch (err) { ERRORI.gestisciErrore('attrezzature/salva', err); }
      finally { this.salvandoAtt = false; }
    },

    async cestinaAtt(id) {
      try { await ANAGRAFICA_SERVICE.cestina('attrezzature', id); this.caricaDati(); NOTIFICHE.info('Attrezzatura nel cestino'); }
      catch (err) { ERRORI.gestisciErrore('attrezzature/cestina', err); }
    },
    async ripristinaAtt(id) {
      try { await ANAGRAFICA_SERVICE.ripristina('attrezzature', id); this.caricaDati(); NOTIFICHE.successo('Attrezzatura ripristinata'); }
      catch (err) { ERRORI.gestisciErrore('attrezzature/ripristina', err); }
    },
    async eliminaAtt(id) {
      if (!confirm('Eliminare definitivamente?')) return;
      try { await ANAGRAFICA_SERVICE.eliminaDefinitivamente('attrezzature', id); this.caricaDati(); }
      catch (err) { ERRORI.gestisciErrore('attrezzature/elimina', err); }
    },

    // Verifiche attrezzatura
    aggiungiVerificaAtt() {
      (this.formAtt.verifiche ??= []).push({ tipo: '', data: null, prossima: null, filename: null, base64: null });
      this.formAtt = { ...this.formAtt }; this.modAtt = true;
    },
    rimuoviVerificaAtt(idx) {
      this.formAtt.verifiche.splice(idx, 1);
      this.formAtt = { ...this.formAtt }; this.modAtt = true;
    },
    async onVerificaAttFile(idx, ev) {
      const f = ev.target.files?.[0]; if (!f) return;
      const b64 = await _leggiFileBase64MA(f);
      this.formAtt.verifiche[idx] = { ...this.formAtt.verifiche[idx], filename: f.name, base64: b64 };
      this.formAtt = { ...this.formAtt }; this.modAtt = true;
    },

    // Documenti specifici attrezzatura (ponteggi)
    aggiungiDocSpecAtt() {
      (this.formAtt.documentiSpecifici ??= []).push({ tipo: '', scadenza: null, filename: null, base64: null });
      this.formAtt = { ...this.formAtt }; this.modAtt = true;
    },
    rimuoviDocSpecAtt(idx) {
      this.formAtt.documentiSpecifici.splice(idx, 1);
      this.formAtt = { ...this.formAtt }; this.modAtt = true;
    },
    async onDocSpecAttFile(idx, ev) {
      const f = ev.target.files?.[0]; if (!f) return;
      const b64 = await _leggiFileBase64MA(f);
      this.formAtt.documentiSpecifici[idx] = { ...this.formAtt.documentiSpecifici[idx], filename: f.name, base64: b64 };
      this.formAtt = { ...this.formAtt }; this.modAtt = true;
    },

    async onConformitaCEFile(ev) {
      const f = ev.target.files?.[0]; if (!f) return;
      this.formAtt.dichiarazioneConformitaCE = { ...(this.formAtt.dichiarazioneConformitaCE ?? {}), filename: f.name, base64: await _leggiFileBase64MA(f) };
      this.formAtt = { ...this.formAtt }; this.modAtt = true;
    },
    async onLibrettoAttFile(ev) {
      const f = ev.target.files?.[0]; if (!f) return;
      this.formAtt.libretto = { filename: f.name, base64: await _leggiFileBase64MA(f) };
      this.formAtt = { ...this.formAtt }; this.modAtt = true;
    },

    // ── Documenti extra attrezzatura — metodi raccoglitore ────────────────

    get extraAttiviAtt() {
      return (this.formAtt.documenti_extra ?? []).filter(e => !e._cestino);
    },

    apriFormExtraAtt() {
      this.idExtraInModificaAtt = null;
      this.formExtraAtt = { titolo: '', scadenza: '', filename: null, base64: null };
      this.mostraFormExtraAtt = true;
    },

    apriModificaExtraAtt(id) {
      const ex = (this.formAtt.documenti_extra ?? []).find(e => e.id === id && !e._cestino);
      if (!ex) return;
      this.idExtraInModificaAtt = id;
      this.formExtraAtt = { titolo: ex.titolo ?? '', scadenza: ex.scadenza ?? '', filename: ex.filename, base64: ex.base64 };
      this.mostraFormExtraAtt = true;
    },

    chiudiFormExtraAtt() {
      this.mostraFormExtraAtt = false;
      this.idExtraInModificaAtt = null;
      this.formExtraAtt = { titolo: '', scadenza: '', filename: null, base64: null };
    },

    async onExtraFileAtt(event) {
      const file = event.target.files?.[0];
      if (!file) return;
      this.formExtraAtt = { ...this.formExtraAtt, filename: file.name, base64: await _leggiFileBase64MA(file) };
    },

    salvaExtraAtt() {
      const titolo = (this.formExtraAtt.titolo ?? '').trim();
      if (!titolo) return;
      if (!this.formAtt.documenti_extra) this.formAtt.documenti_extra = [];

      // Soft-delete del record precedente in caso di modifica
      if (this.idExtraInModificaAtt) {
        const idx = this.formAtt.documenti_extra.findIndex(e => e.id === this.idExtraInModificaAtt);
        if (idx >= 0) {
          this.formAtt.documenti_extra[idx] = {
            ...this.formAtt.documenti_extra[idx],
            _cestino: true,
            _eliminato_il: new Date().toISOString(),
          };
        }
      }

      this.formAtt.documenti_extra.push({
        id:       UTILS.generaId('ext'),
        titolo,
        scadenza: this.formExtraAtt.scadenza || null,
        filename: this.formExtraAtt.filename ?? null,
        base64:   this.formExtraAtt.base64   ?? null,
      });
      this.formAtt = { ...this.formAtt };
      this.modAtt = true;
      this.chiudiFormExtraAtt();
    },

    cestinaExtraAtt(id) {
      const idx = (this.formAtt.documenti_extra ?? []).findIndex(e => e.id === id && !e._cestino);
      if (idx < 0) return;
      this.formAtt.documenti_extra[idx] = {
        ...this.formAtt.documenti_extra[idx],
        _cestino: true,
        _eliminato_il: new Date().toISOString(),
      };
      this.formAtt = { ...this.formAtt };
      this.modAtt = true;
    },

    // ── Storico versioni precedenti (sola lettura) ────────────────────────
    storicoExtraMz(titolo) {
      return (this.formMezzo.documenti_extra ?? [])
        .filter(e => e._cestino && e.titolo === titolo)
        .sort((a, b) => (b._eliminato_il ?? '').localeCompare(a._eliminato_il ?? ''));
    },

    storicoExtraAtt(titolo) {
      return (this.formAtt.documenti_extra ?? [])
        .filter(e => e._cestino && e.titolo === titolo)
        .sort((a, b) => (b._eliminato_il ?? '').localeCompare(a._eliminato_il ?? ''));
    },

    // ── Helpers UI ────────────────────────────────────────────────────────

    nomeImpresa(id)     { return this.imprese.find(i => i.id === id)?.ragioneSociale ?? null; },
    conformitaMezzo(m)  { return ANAGRAFICA_SERVICE.calcolaConformitaMezzo(m); },
    conformitaAtt(a)    { return ANAGRAFICA_SERVICE.calcolaConformitaAttrezzatura(a); },

    semaforoClass(stato) {
      if (stato === 'verde') return 'bg-green-100 text-green-700';
      if (stato === 'giallo') return 'bg-yellow-100 text-yellow-700';
      if (stato === 'rosso')  return 'bg-red-100 text-red-700';
      return 'bg-slate-100 text-slate-500';
    },

    tipoMezzoInLista(tipo)  { return ANAGRAFICA_SERVICE.TIPI_MEZZO.some(t => t.valore === tipo); },
    tipoAttInLista(tipo)    { return ANAGRAFICA_SERVICE.TIPOLOGIE_ATTREZZATURA.some(t => t.valore === tipo); },
    tipoVerMezzoInLista(v)  { return ANAGRAFICA_SERVICE.TIPI_VERIFICA_MEZZO.some(t => t.valore === v); },
    tipoVerAttInLista(v)    { return ANAGRAFICA_SERVICE.TIPI_VERIFICA_ATT.some(t => t.valore === v); },

    _tipiMezzo()       { return ANAGRAFICA_SERVICE.TIPI_MEZZO; },
    _tipiAtt()         { return ANAGRAFICA_SERVICE.TIPOLOGIE_ATTREZZATURA; },
    _tipiVerMezzo()    { return ANAGRAFICA_SERVICE.TIPI_VERIFICA_MEZZO; },
    _tipiVerAtt()      { return ANAGRAFICA_SERVICE.TIPI_VERIFICA_ATT; },
    _tipiDocSpecAtt()  { return ANAGRAFICA_SERVICE.TIPI_DOC_SPECIFICO_ATT; },
    _imprese()         { return this.imprese; },
  };
}

// ── Template ──────────────────────────────────────────────────────────────────

const _TEMPLATE_MA = `
<div x-data="ListaMezziAttrezzature()" x-init="init()" x-effect="aggiornaSeCantiereRicambia()" class="max-w-5xl">

  <!-- Tab bar -->
  <div class="flex items-center gap-2 mb-5">
    <div role="tablist" class="flex gap-1 border-b border-slate-200 flex-1">
      <button role="tab" :aria-selected="tabAttiva==='mezzi'" @click="tabAttiva='mezzi'"
              :class="tabAttiva==='mezzi' ? 'border-b-2 border-blue-600 text-blue-700 font-semibold -mb-px bg-white px-4 py-2 text-sm rounded-t' : 'text-slate-500 hover:text-slate-800 px-4 py-2 text-sm rounded-t transition-colors'">
        🚜 Mezzi
        <span class="ml-1 text-xs" :class="tabAttiva==='mezzi'?'text-blue-500':'text-slate-400'"
              x-text="'(' + contatoriMezzi.totale + ')'"></span>
      </button>
      <button role="tab" :aria-selected="tabAttiva==='attrezzature'" @click="tabAttiva='attrezzature'"
              :class="tabAttiva==='attrezzature' ? 'border-b-2 border-blue-600 text-blue-700 font-semibold -mb-px bg-white px-4 py-2 text-sm rounded-t' : 'text-slate-500 hover:text-slate-800 px-4 py-2 text-sm rounded-t transition-colors'">
        🔧 Attrezzature
        <span class="ml-1 text-xs" :class="tabAttiva==='attrezzature'?'text-blue-500':'text-slate-400'"
              x-text="'(' + contatoriAtt.totale + ')'"></span>
      </button>
    </div>
    <button @click="tabAttiva==='mezzi' ? nuovoMezzoFn() : nuovaAttFn()" x-show="$store.cantiere.id"
            class="bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2">
      <span x-text="tabAttiva==='mezzi' ? '+ Nuovo mezzo' : '+ Nuova attrezzatura'"></span>
    </button>
  </div>

  <div x-show="!$store.cantiere.id" class="placeholder-modulo">
    <div class="text-3xl" aria-hidden="true">🚜</div>
    <p class="text-slate-500">Seleziona un cantiere per gestire mezzi e attrezzature.</p>
  </div>

  <div x-show="$store.cantiere.id">
    <div x-show="caricamento" class="flex items-center gap-3 py-10 text-slate-400 text-sm">
      <div class="w-5 h-5 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
      Caricamento…
    </div>

    <div x-show="!caricamento">

      <!-- ══════════════════ TAB MEZZI ══════════════════ -->
      <div x-show="tabAttiva === 'mezzi'">

        <!-- Alert critici -->
        <div x-show="alertCriticiMezzi.length > 0" class="mb-4 border border-red-200 bg-red-50 rounded-xl p-4" role="alert">
          <p class="text-sm font-semibold text-red-800 mb-2">
            🔴 <span x-text="alertCriticiMezzi.length"></span> verifica critica scaduta (non silenziabile)
          </p>
          <ul class="space-y-1">
            <template x-for="a in alertCriticiMezzi" :key="a.mezzoId+'_'+a.tipo">
              <li class="text-xs text-red-700">
                <button @click="modificaMezzo(a.mezzoId)" class="font-semibold underline hover:no-underline mr-1 focus:outline-none focus:ring-1 focus:ring-red-600 rounded" x-text="a.descrizione"></button>
                — <span x-text="a.label"></span>
                (<span x-text="a.giorni < 0 ? 'scaduta ' + Math.abs(a.giorni) + ' gg fa' : 'tra ' + a.giorni + ' gg'"></span>)
              </li>
            </template>
          </ul>
        </div>

        <!-- Barra strumenti mezzi -->
        <div class="flex flex-wrap gap-3 mb-4">
          <input type="search" x-model="cercaMezzi" placeholder="Cerca marca, modello, matricola…"
                 class="flex-1 min-w-48 border border-slate-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
          <select x-model="filtroImpresaMezzi" class="border border-slate-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
            <option value="">Tutte le imprese</option>
            <template x-for="imp in _imprese()" :key="imp.id">
              <option :value="imp.id" x-text="imp.ragioneSociale"></option>
            </template>
          </select>
          <label class="flex items-center gap-2 text-sm cursor-pointer text-slate-600">
            <input type="checkbox" x-model="soloPresenti" class="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-2 focus:ring-blue-500">
            Solo presenti
          </label>
        </div>

        <!-- Lista mezzi -->
        <div role="list" class="space-y-2">
          <div x-show="mezziFiltrati.length === 0" class="py-10 text-center text-slate-400">
            <div class="text-3xl mb-2" aria-hidden="true">🚜</div>
            <p x-show="!cercaMezzi && !filtroImpresaMezzi">Nessun mezzo. Clicca "+ Nuovo mezzo" per iniziare.</p>
            <p x-show="cercaMezzi || filtroImpresaMezzi">Nessun mezzo corrisponde ai filtri.</p>
          </div>
          <template x-for="m in mezziFiltrati" :key="m.id">
            <div role="listitem" class="border border-slate-200 bg-white hover:border-slate-300 rounded-xl px-4 py-3 flex items-center gap-4 transition-all">
              <span :class="semaforoClass(conformitaMezzo(m).stato)"
                    class="flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold" aria-hidden="true">
                <span x-text="conformitaMezzo(m).stato==='verde'?'✓':conformitaMezzo(m).stato==='giallo'?'⚠':'✕'"></span>
              </span>
              <div class="flex-1 min-w-0">
                <div class="flex items-center gap-2 flex-wrap">
                  <span class="font-medium text-slate-800" x-text="[m.marca, m.modello].filter(Boolean).join(' ') || m.tipologia || '(senza nome)'"></span>
                  <span x-show="m.tipologia" class="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full" x-text="(_tipiMezzo().find(t=>t.valore===m.tipologia)?.etichetta ?? m.tipologia)"></span>
                  <span x-show="m.presenteInCantiere" class="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full">In cantiere</span>
                  <template x-if="nomeImpresa(m.impresa_id)">
                    <span class="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full" x-text="nomeImpresa(m.impresa_id)"></span>
                  </template>
                  <template x-if="!m.impresa_id">
                    <span class="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">⚠ Non assegnato</span>
                  </template>
                </div>
                <template x-if="conformitaMezzo(m).scadenze.length > 0">
                  <p class="text-xs mt-0.5" :class="conformitaMezzo(m).scadenze[0].stato==='scaduto'?'text-red-600':'text-amber-600'"
                     x-text="conformitaMezzo(m).scadenze[0].label + ': ' + (conformitaMezzo(m).scadenze[0].giorni < 0 ? 'scaduta ' + Math.abs(conformitaMezzo(m).scadenze[0].giorni) + ' gg fa' : 'tra ' + conformitaMezzo(m).scadenze[0].giorni + ' gg')"></p>
                </template>
              </div>
              <div class="flex gap-2 flex-shrink-0">
                <button @click="modificaMezzo(m.id)" class="text-sm text-slate-600 hover:text-slate-900 px-3 py-1.5 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors focus:outline-none focus:ring-2 focus:ring-slate-400">✏ Modifica</button>
                <button @click="cestinaMezzo(m.id)" class="text-sm text-red-400 hover:text-red-700 px-2 py-1.5 rounded-lg hover:bg-red-50 transition-colors focus:outline-none focus:ring-2 focus:ring-red-400" title="Cestina">🗑</button>
              </div>
            </div>
          </template>
        </div>

        <!-- Cestino mezzi -->
        <div class="mt-6">
          <button @click="mostraCestinoMezzi = !mostraCestinoMezzi" class="text-xs text-slate-400 hover:text-slate-600 underline focus:outline-none focus:ring-2 focus:ring-slate-400 rounded">
            <span x-text="(mostraCestinoMezzi?'▾ Nascondi':'▸ Mostra') + ' cestino (' + mezziCestino.length + ')'"></span>
          </button>
          <div x-show="mostraCestinoMezzi && mezziCestino.length > 0" class="mt-3 space-y-2">
            <template x-for="m in mezziCestino" :key="m.id">
              <div class="border border-slate-200 bg-slate-50 rounded-xl px-4 py-3 flex items-center gap-4 opacity-60 hover:opacity-80">
                <div class="flex-1 min-w-0">
                  <span class="text-sm text-slate-600 line-through" x-text="[m.marca, m.modello].filter(Boolean).join(' ') || m.tipologia || '(senza nome)'"></span>
                  <p class="text-xs text-slate-400" x-text="'Eliminato il ' + UTILS.formatData(m._eliminato_il)"></p>
                </div>
                <div class="flex gap-2">
                  <button @click="ripristinaMezzo(m.id)" class="text-xs text-green-700 px-2 py-1 border border-green-300 rounded-lg hover:bg-green-50 focus:outline-none focus:ring-2 focus:ring-green-400">↩ Ripristina</button>
                  <button @click="eliminaMezzo(m.id)" class="text-xs text-red-500 px-2 py-1 rounded-lg hover:bg-red-50 focus:outline-none focus:ring-2 focus:ring-red-400">Elimina def.</button>
                </div>
              </div>
            </template>
          </div>
        </div>

      </div><!-- /tab mezzi -->

      <!-- ══════════════════ TAB ATTREZZATURE ══════════════════ -->
      <div x-show="tabAttiva === 'attrezzature'">

        <!-- Alert critici -->
        <div x-show="alertCriticiAtt.length > 0" class="mb-4 border border-red-200 bg-red-50 rounded-xl p-4" role="alert">
          <p class="text-sm font-semibold text-red-800 mb-2">
            🔴 <span x-text="alertCriticiAtt.length"></span> documento critico scaduto (non silenziabile)
          </p>
          <ul class="space-y-1">
            <template x-for="a in alertCriticiAtt" :key="a.attId+'_'+a.tipo">
              <li class="text-xs text-red-700">
                <button @click="modificaAtt(a.attId)" class="font-semibold underline hover:no-underline mr-1 focus:outline-none focus:ring-1 focus:ring-red-600 rounded" x-text="a.descrizione"></button>
                — <span x-text="a.label"></span>
                (<span x-text="a.giorni < 0 ? 'scaduto ' + Math.abs(a.giorni) + ' gg fa' : 'tra ' + a.giorni + ' gg'"></span>)
              </li>
            </template>
          </ul>
        </div>

        <!-- Barra strumenti att -->
        <div class="flex flex-wrap gap-3 mb-4">
          <input type="search" x-model="cercaAtt" placeholder="Cerca tipologia, descrizione, matricola…"
                 class="flex-1 min-w-48 border border-slate-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
          <select x-model="filtroImpresaAtt" class="border border-slate-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
            <option value="">Tutte le imprese</option>
            <template x-for="imp in _imprese()" :key="imp.id">
              <option :value="imp.id" x-text="imp.ragioneSociale"></option>
            </template>
          </select>
        </div>

        <!-- Lista attrezzature -->
        <div role="list" class="space-y-2">
          <div x-show="attFiltrate.length === 0" class="py-10 text-center text-slate-400">
            <div class="text-3xl mb-2" aria-hidden="true">🔧</div>
            <p x-show="!cercaAtt && !filtroImpresaAtt">Nessuna attrezzatura. Clicca "+ Nuova attrezzatura" per iniziare.</p>
            <p x-show="cercaAtt || filtroImpresaAtt">Nessuna attrezzatura corrisponde ai filtri.</p>
          </div>
          <template x-for="a in attFiltrate" :key="a.id">
            <div role="listitem" class="border border-slate-200 bg-white hover:border-slate-300 rounded-xl px-4 py-3 flex items-center gap-4 transition-all">
              <span :class="semaforoClass(conformitaAtt(a).stato)"
                    class="flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold" aria-hidden="true">
                <span x-text="conformitaAtt(a).stato==='verde'?'✓':conformitaAtt(a).stato==='giallo'?'⚠':'✕'"></span>
              </span>
              <div class="flex-1 min-w-0">
                <div class="flex items-center gap-2 flex-wrap">
                  <span class="font-medium text-slate-800" x-text="a.descrizione || (_tipiAtt().find(t=>t.valore===a.tipologia)?.etichetta ?? a.tipologia) || '(senza descrizione)'"></span>
                  <span x-show="a.tipologia" class="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full" x-text="(_tipiAtt().find(t=>t.valore===a.tipologia)?.etichetta ?? a.tipologia)"></span>
                  <span x-show="!a.dichiarazioneConformitaCE?.presente" class="text-xs bg-yellow-100 text-yellow-700 px-2 py-0.5 rounded-full">CE mancante</span>
                  <template x-if="nomeImpresa(a.impresa_id)">
                    <span class="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full" x-text="nomeImpresa(a.impresa_id)"></span>
                  </template>
                  <template x-if="!a.impresa_id">
                    <span class="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">⚠ Non assegnata</span>
                  </template>
                </div>
                <template x-if="conformitaAtt(a).scadenze.length > 0">
                  <p class="text-xs mt-0.5" :class="conformitaAtt(a).scadenze[0].stato==='scaduto'?'text-red-600':'text-amber-600'"
                     x-text="conformitaAtt(a).scadenze[0].label + ': ' + (conformitaAtt(a).scadenze[0].giorni < 0 ? 'scaduto ' + Math.abs(conformitaAtt(a).scadenze[0].giorni) + ' gg fa' : 'tra ' + conformitaAtt(a).scadenze[0].giorni + ' gg')"></p>
                </template>
              </div>
              <div class="flex gap-2 flex-shrink-0">
                <button @click="modificaAtt(a.id)" class="text-sm text-slate-600 hover:text-slate-900 px-3 py-1.5 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors focus:outline-none focus:ring-2 focus:ring-slate-400">✏ Modifica</button>
                <button @click="cestinaAtt(a.id)" class="text-sm text-red-400 hover:text-red-700 px-2 py-1.5 rounded-lg hover:bg-red-50 transition-colors focus:outline-none focus:ring-2 focus:ring-red-400" title="Cestina">🗑</button>
              </div>
            </div>
          </template>
        </div>

        <!-- Cestino attrezzature -->
        <div class="mt-6">
          <button @click="mostraCestinoAtt = !mostraCestinoAtt" class="text-xs text-slate-400 hover:text-slate-600 underline focus:outline-none focus:ring-2 focus:ring-slate-400 rounded">
            <span x-text="(mostraCestinoAtt?'▾ Nascondi':'▸ Mostra') + ' cestino (' + attCestino.length + ')'"></span>
          </button>
          <div x-show="mostraCestinoAtt && attCestino.length > 0" class="mt-3 space-y-2">
            <template x-for="a in attCestino" :key="a.id">
              <div class="border border-slate-200 bg-slate-50 rounded-xl px-4 py-3 flex items-center gap-4 opacity-60 hover:opacity-80">
                <div class="flex-1 min-w-0">
                  <span class="text-sm text-slate-600 line-through" x-text="a.descrizione || a.tipologia || '(senza nome)'"></span>
                  <p class="text-xs text-slate-400" x-text="'Eliminata il ' + UTILS.formatData(a._eliminato_il)"></p>
                </div>
                <div class="flex gap-2">
                  <button @click="ripristinaAtt(a.id)" class="text-xs text-green-700 px-2 py-1 border border-green-300 rounded-lg hover:bg-green-50 focus:outline-none focus:ring-2 focus:ring-green-400">↩ Ripristina</button>
                  <button @click="eliminaAtt(a.id)" class="text-xs text-red-500 px-2 py-1 rounded-lg hover:bg-red-50 focus:outline-none focus:ring-2 focus:ring-red-400">Elimina def.</button>
                </div>
              </div>
            </template>
          </div>
        </div>

      </div><!-- /tab attrezzature -->

    </div><!-- /!caricamento -->
  </div><!-- /$store.cantiere.id -->

  <!-- ══════════════════════════════════════════════════════════════
       DRAWER MEZZO
       ══════════════════════════════════════════════════════════════ -->
  <div x-show="drawerMezzo" x-cloak class="drawer-backdrop" @click="chiudiDrawerMezzo(false)" aria-hidden="true"></div>
  <div x-show="drawerMezzo" x-cloak @input="modMezzo=true" @keydown.escape.window="chiudiDrawerMezzo(false)"
       class="drawer" role="dialog" aria-modal="true" aria-label="Editor mezzo">

    <div class="drawer-header flex items-center justify-between px-5 py-4 border-b border-slate-200 bg-white">
      <h2 class="text-base font-semibold text-slate-800">
        <span x-text="nuovoMezzo ? 'Nuovo mezzo' : ([formMezzo.marca, formMezzo.modello].filter(Boolean).join(' ') || 'Modifica mezzo')"></span>
      </h2>
      <button @click="chiudiDrawerMezzo(false)" aria-label="Chiudi" class="p-1.5 rounded hover:bg-slate-100 text-slate-500 text-lg focus:outline-none focus:ring-2 focus:ring-slate-400">✕</button>
    </div>

    <div class="drawer-body px-5 py-4 space-y-3">

      <!-- 1. Assegnazione impresa -->
      <details open class="border border-slate-200 rounded-xl overflow-hidden">
        <summary class="px-4 py-3 bg-slate-50 cursor-pointer text-sm font-medium text-slate-700 hover:bg-slate-100 list-none flex items-center justify-between">Impresa di appartenenza <span class="text-slate-400 text-xs" aria-hidden="true">▾</span></summary>
        <div class="p-4">
          <select x-model="formMezzo.impresa_id" class="w-full border border-slate-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
            <option value="">— Nessuna impresa assegnata —</option>
            <template x-for="imp in _imprese()" :key="imp.id"><option :value="imp.id" x-text="imp.ragioneSociale"></option></template>
          </select>
          <p x-show="_imprese().length===0" class="mt-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-1.5">Nessuna impresa disponibile. Aggiungila in Anagrafiche → Imprese.</p>
          <p x-show="_imprese().length>0 && !formMezzo.impresa_id" class="mt-1 text-xs text-slate-400">Salvabile anche senza impresa — apparirà come "Non assegnato".</p>
        </div>
      </details>

      <!-- 2. Identificazione -->
      <details open class="border border-slate-200 rounded-xl overflow-hidden">
        <summary class="px-4 py-3 bg-slate-50 cursor-pointer text-sm font-medium text-slate-700 hover:bg-slate-100 list-none flex items-center justify-between">Identificazione <span class="text-slate-400 text-xs" aria-hidden="true">▾</span></summary>
        <div class="p-4 grid gap-3 sm:grid-cols-2">
          <div class="sm:col-span-2">
            <label for="mz-tipologia" class="block text-xs font-medium text-slate-600 mb-1">Tipologia</label>
            <select id="mz-tipologia" :value="tipoMezzoInLista(formMezzo.tipologia) ? formMezzo.tipologia : (formMezzo.tipologia?'ALTRO':'')"
                    @change="formMezzo.tipologia = $event.target.value !== 'ALTRO' ? $event.target.value : ''; formMezzo={...formMezzo}"
                    class="w-full border border-slate-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
              <option value="">— Seleziona —</option>
              <template x-for="t in _tipiMezzo()" :key="t.valore"><option :value="t.valore" x-text="t.etichetta + (t.sollevamento ? ' 🔴' : '')"></option></template>
            </select>
            <input x-show="!tipoMezzoInLista(formMezzo.tipologia)" type="text" :value="formMezzo.tipologia" @input="formMezzo.tipologia=$event.target.value;formMezzo={...formMezzo}" placeholder="Descrivi il tipo di mezzo" class="mt-1.5 w-full border border-slate-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
          </div>
          <div><label for="mz-marca" class="block text-xs font-medium text-slate-600 mb-1">Marca</label><input id="mz-marca" type="text" x-model="formMezzo.marca" class="w-full border border-slate-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"></div>
          <div><label for="mz-modello" class="block text-xs font-medium text-slate-600 mb-1">Modello</label><input id="mz-modello" type="text" x-model="formMezzo.modello" class="w-full border border-slate-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"></div>
          <div><label for="mz-matr" class="block text-xs font-medium text-slate-600 mb-1">Matricola INAIL (CIVA)</label><input id="mz-matr" type="text" x-model="formMezzo.matricola" @input="formMezzo.matricola=$event.target.value.toUpperCase()" class="w-full border border-slate-300 rounded-md px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"></div>
          <div><label for="mz-ns" class="block text-xs font-medium text-slate-600 mb-1">N. serie</label><input id="mz-ns" type="text" x-model="formMezzo.numeroSerie" @input="formMezzo.numeroSerie=$event.target.value.toUpperCase()" class="w-full border border-slate-300 rounded-md px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"></div>
          <div><label for="mz-anno" class="block text-xs font-medium text-slate-600 mb-1">Anno</label><input id="mz-anno" type="number" min="1950" max="2100" :value="formMezzo.anno ?? ''" @input="formMezzo.anno=$event.target.value?+$event.target.value:null" class="w-full border border-slate-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"></div>
          <div class="sm:col-span-2">
            <label class="flex items-center gap-2 text-sm cursor-pointer">
              <input type="checkbox" x-model="formMezzo.presenteInCantiere" class="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-2 focus:ring-blue-500">
              Presente in cantiere
            </label>
          </div>
        </div>
      </details>

      <!-- 3. Libretto -->
      <details class="border border-slate-200 rounded-xl overflow-hidden">
        <summary class="px-4 py-3 bg-slate-50 cursor-pointer text-sm font-medium text-slate-700 hover:bg-slate-100 list-none flex items-center justify-between">Libretto / manuale <span class="text-slate-400 text-xs" aria-hidden="true">▾</span></summary>
        <div class="p-4">
          <label class="cursor-pointer text-xs text-blue-600 hover:text-blue-800">
            <input type="file" accept=".pdf,.png,.jpg" class="sr-only" @change="onLibrettoMezzoFile($event)">
            <span x-text="formMezzo.libretto?.filename ? '📎 ' + formMezzo.libretto.filename : '📎 Allega libretto'"></span>
          </label>
        </div>
      </details>

      <!-- 4. Verifiche periodiche -->
      <details open class="border border-slate-200 rounded-xl overflow-hidden">
        <summary class="px-4 py-3 bg-slate-50 cursor-pointer text-sm font-medium text-slate-700 hover:bg-slate-100 list-none flex items-center justify-between">
          Verifiche periodiche <span class="text-xs font-normal text-slate-400 ml-1" x-text="verificheAttiveMz.length ? '(' + verificheAttiveMz.length + ')' : ''"></span>
          <span class="text-slate-400 text-xs" aria-hidden="true">▾</span>
        </summary>
        <div class="p-4 space-y-3">
          <p class="text-xs text-slate-400">🔴 = verifica su mezzo di sollevamento (critica, art.71 c.11, D.M. 11/04/2011)</p>
          <template x-for="vp in verificheAttiveMz" :key="vp.id">
            <div class="border border-slate-200 rounded-lg p-3 space-y-2 relative">
              <button @click="rimuoviVerificaMezzo(vp.id)" class="absolute top-2 right-2 text-red-400 hover:text-red-700 text-sm focus:outline-none" aria-label="Rimuovi">×</button>
              <div class="grid gap-2 sm:grid-cols-2">
                <div>
                  <label class="block text-xs text-slate-500 mb-1">Tipo verifica</label>
                  <select :value="tipoVerMezzoInLista(vp.tipo) ? vp.tipo : (vp.tipo?'ALTRO':'')"
                          @change="vp.tipo=$event.target.value!=='ALTRO'?$event.target.value:'';formMezzo={...formMezzo}"
                          class="w-full border border-slate-300 rounded px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500">
                    <option value="">— Seleziona —</option>
                    <template x-for="t in _tipiVerMezzo()" :key="t.valore"><option :value="t.valore" x-text="t.etichetta"></option></template>
                  </select>
                  <input x-show="!tipoVerMezzoInLista(vp.tipo)" type="text" :value="vp.tipo" @input="vp.tipo=$event.target.value;formMezzo={...formMezzo}" placeholder="Descrivi la verifica" class="mt-1.5 w-full border border-slate-300 rounded px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500">
                </div>
                <div><label class="block text-xs text-slate-500 mb-1">Ente verificatore</label><input type="text" :value="vp.ente??''" @input="vp.ente=$event.target.value;formMezzo={...formMezzo}" class="w-full border border-slate-300 rounded px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"></div>
                <div><label class="block text-xs text-slate-500 mb-1">Data eseguita</label><input type="date" :value="vp.data??''" @input="vp.data=$event.target.value||null;formMezzo={...formMezzo}" class="w-full border border-slate-300 rounded px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"></div>
                <div>
                  <label class="block text-xs text-slate-500 mb-1">Prossima verifica 🔴</label>
                  <input type="date" :value="vp.prossima??''" @input="vp.prossima=$event.target.value||null;formMezzo={...formMezzo}"
                         class="w-full border border-slate-300 rounded px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
                         :class="vp.prossima && UTILS.giorniAllaScadenza(vp.prossima)<0?'border-red-400 bg-red-50':''">
                </div>
              </div>
              <label class="cursor-pointer text-xs text-blue-600 hover:text-blue-800">
                <input type="file" accept=".pdf,.png,.jpg" class="sr-only" @change="onVerificaMezzoFile(vp.id,$event)">
                <span x-text="vp.filename ? '↑ Sostituisci verbale' : '📎 Allega verbale'"></span>
              </label>
              <!-- Storico: versioni precedenti di questa verifica (sola lettura) -->
              <template x-if="storicoVerificaMz(vp.tipo).length > 0">
                <details class="mt-1 text-xs">
                  <summary class="cursor-pointer text-slate-400 hover:text-slate-600 select-none">
                    Storico (<span x-text="storicoVerificaMz(vp.tipo).length"></span> vers. prec.)
                  </summary>
                  <ul class="mt-1 ml-1 border-l border-slate-100 pl-2 space-y-0.5">
                    <template x-for="v in storicoVerificaMz(vp.tipo)" :key="(v._eliminato_il??'')+(v.filename??'')">
                      <li class="flex items-center gap-2 text-slate-400">
                        <span class="flex-shrink-0" x-text="UTILS.formatData(v._eliminato_il)"></span>
                        <button x-show="v.base64" type="button"
                                @click.stop="ALLEGATI.apriAllegato(v.base64, v.filename)"
                                class="text-blue-500 hover:text-blue-700 truncate text-left
                                       focus:outline-none focus:ring-1 focus:ring-blue-400 rounded"
                                :title="'Apri ' + v.filename">
                          📎 <span x-text="v.filename"></span>
                        </button>
                        <span x-show="!v.base64"
                              class="text-slate-300 cursor-not-allowed truncate"
                              title="Documento non disponibile"
                              x-text="v.filename ? '📎 ' + v.filename : '—'"></span>
                      </li>
                    </template>
                  </ul>
                </details>
              </template>
            </div>
          </template>
          <button @click="aggiungiVerificaMezzo()" type="button" class="text-sm text-blue-600 hover:text-blue-800 border border-blue-300 px-3 py-1.5 rounded-lg hover:bg-blue-50 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500">+ Aggiungi verifica</button>
        </div>
      </details>

      <!-- 5. Nolo (placeholder M4 F4) -->
      <details class="border border-slate-100 rounded-xl overflow-hidden opacity-50">
        <summary class="px-4 py-3 bg-slate-50 cursor-not-allowed text-sm font-medium text-slate-500 list-none flex items-center justify-between">
          Collegamento nolo <span class="text-xs font-normal">(disponibile in M4 F4)</span>
        </summary>
      </details>

      <!-- 6. Altri documenti (raccoglitore libero) -->
      <details class="border border-slate-200 rounded-xl overflow-hidden">
        <summary class="px-4 py-3 bg-slate-50 cursor-pointer text-sm font-medium text-slate-700 hover:bg-slate-100 list-none flex items-center justify-between">
          <span>
            Altri documenti
            <span x-show="extraAttiviMz.length > 0"
                  class="ml-1 text-xs font-normal text-slate-400"
                  x-text="'(' + extraAttiviMz.length + ')'"></span>
          </span>
          <span class="text-slate-400 text-xs" aria-hidden="true">▾</span>
        </summary>
        <div class="p-4 space-y-3">

          <div class="flex items-center justify-between mb-2">
            <span class="text-xs text-slate-400">Documenti aggiuntivi non previsti dallo schema (titolo libero, scadenza opzionale).</span>
            <button type="button" @click="apriFormExtraMz()"
                    x-show="!mostraFormExtraMz"
                    class="ml-3 flex-shrink-0 text-xs text-blue-600 hover:text-blue-800 border border-blue-300
                           px-2 py-1 rounded hover:bg-blue-50 transition-colors
                           focus:outline-none focus:ring-2 focus:ring-blue-500">
              + Allega altro documento
            </button>
          </div>

          <!-- Form inline add/modifica -->
          <div x-show="mostraFormExtraMz"
               class="mb-3 border border-blue-200 rounded-lg p-3 bg-blue-50 space-y-2">
            <div class="grid gap-2 sm:grid-cols-2">
              <div>
                <label class="block text-xs font-medium text-slate-600 mb-1">Titolo <span class="text-red-500">*</span></label>
                <input type="text" x-model="formExtraMz.titolo"
                       placeholder="es. Libretto revisione, Dichiarazione collaudo…"
                       class="w-full border border-slate-300 rounded px-2 py-1.5 text-xs
                              focus:outline-none focus:ring-2 focus:ring-blue-500">
              </div>
              <div>
                <label class="block text-xs font-medium text-slate-600 mb-1">Scadenza (opzionale)</label>
                <input type="date" x-model="formExtraMz.scadenza"
                       class="w-full border border-slate-300 rounded px-2 py-1.5 text-xs
                              focus:outline-none focus:ring-2 focus:ring-blue-500">
              </div>
            </div>
            <label class="flex items-center gap-2 cursor-pointer text-xs text-blue-600 hover:text-blue-800">
              <input type="file" accept=".pdf,.png,.jpg,.jpeg" class="sr-only"
                     @change="onExtraFileMz($event)">
              <span x-text="formExtraMz.filename ? '📎 ' + formExtraMz.filename : '📎 Seleziona file (opzionale)'"></span>
            </label>
            <div class="flex items-center gap-2 pt-1">
              <button type="button" @click="salvaExtraMz()"
                      :disabled="!(formExtraMz.titolo ?? '').trim()"
                      class="text-xs font-semibold bg-blue-600 hover:bg-blue-700 text-white
                             disabled:opacity-40 px-3 py-1.5 rounded-lg transition-colors
                             focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1">
                <span x-text="idExtraInModificaMz ? 'Aggiorna' : 'Conferma'"></span>
              </button>
              <button type="button" @click="chiudiFormExtraMz()"
                      class="text-xs text-slate-500 hover:text-slate-700
                             focus:outline-none focus:ring-1 focus:ring-slate-400 rounded px-2">
                Annulla
              </button>
            </div>
          </div>

          <!-- Lista documenti extra presenti -->
          <ul class="space-y-1.5" x-show="extraAttiviMz.length > 0">
            <template x-for="ex in extraAttiviMz" :key="ex.id">
              <li class="flex items-start justify-between gap-3 bg-white border border-slate-200
                          rounded-lg px-3 py-2 text-xs">
                <div class="min-w-0 flex-1">
                  <div class="flex items-center gap-2 flex-wrap">
                    <span class="font-medium text-slate-700" x-text="ex.titolo"></span>
                    <span x-show="ex.scadenza" class="font-normal"
                          :class="ex.scadenza && UTILS.giorniAllaScadenza(ex.scadenza) < 0 ? 'text-red-600' : 'text-slate-400'"
                          x-text="'· scad. ' + UTILS.formatData(ex.scadenza)"></span>
                  </div>
                  <div x-show="ex.filename" class="mt-1 flex items-center gap-1.5 flex-wrap">
                    <button x-show="ex.base64" type="button"
                            @click="ALLEGATI.apriAllegato(ex.base64, ex.filename)"
                            class="text-blue-700 bg-blue-50 border border-blue-200 px-1.5 py-0.5
                                   rounded hover:bg-blue-100 focus:outline-none focus:ring-1 focus:ring-blue-400"
                            :title="'Apri ' + ex.filename">
                      📎 <span x-text="ex.filename"></span>
                    </button>
                    <span x-show="!ex.base64"
                          class="text-slate-400 bg-slate-50 border border-slate-200 px-1.5 py-0.5 rounded cursor-not-allowed"
                          title="Documento non disponibile in questa copia"
                          x-text="'📎 ' + ex.filename"></span>
                    <button x-show="ex.base64" type="button"
                            @click="ALLEGATI.scaricaAllegato(ex.base64, ex.filename)"
                            class="text-slate-500 hover:text-blue-600 transition-colors
                                   focus:outline-none focus:ring-1 focus:ring-slate-400 rounded px-0.5"
                            :aria-label="'Scarica ' + ex.titolo" title="Scarica">⬇</button>
                  </div>
                  <!-- Storico: versioni precedenti di questo documento (sola lettura) -->
                  <template x-if="storicoExtraMz(ex.titolo).length > 0">
                    <details class="mt-1.5 text-xs">
                      <summary class="cursor-pointer text-slate-400 hover:text-slate-600 select-none">
                        Storico (<span x-text="storicoExtraMz(ex.titolo).length"></span> vers. prec.)
                      </summary>
                      <ul class="mt-1 ml-1 border-l border-slate-100 pl-2 space-y-0.5">
                        <template x-for="v in storicoExtraMz(ex.titolo)" :key="(v._eliminato_il??'')+(v.filename??'')">
                          <li class="flex items-center gap-2 text-slate-400">
                            <span class="flex-shrink-0" x-text="UTILS.formatData(v._eliminato_il)"></span>
                            <button x-show="v.base64" type="button"
                                    @click.stop="ALLEGATI.apriAllegato(v.base64, v.filename)"
                                    class="text-blue-500 hover:text-blue-700 truncate text-left
                                           focus:outline-none focus:ring-1 focus:ring-blue-400 rounded"
                                    :title="'Apri ' + v.filename">
                              📎 <span x-text="v.filename"></span>
                            </button>
                            <span x-show="!v.base64"
                                  class="text-slate-300 cursor-not-allowed truncate"
                                  title="Documento non disponibile"
                                  x-text="v.filename ? '📎 ' + v.filename : '—'"></span>
                          </li>
                        </template>
                      </ul>
                    </details>
                  </template>
                </div>
                <div class="flex items-center gap-2 flex-shrink-0">
                  <button type="button" @click="apriModificaExtraMz(ex.id)"
                          class="text-slate-500 hover:text-blue-600 transition-colors
                                 focus:outline-none focus:ring-1 focus:ring-slate-400 rounded px-1"
                          title="Modifica" aria-label="Modifica documento extra">✏</button>
                  <button type="button" @click="cestinaExtraMz(ex.id)"
                          class="text-red-400 hover:text-red-600
                                 focus:outline-none focus:ring-1 focus:ring-red-400 rounded">
                    Rimuovi
                  </button>
                </div>
              </li>
            </template>
          </ul>

          <p x-show="extraAttiviMz.length === 0 && !mostraFormExtraMz"
             class="text-xs text-slate-400 text-center py-2">Nessun documento aggiuntivo</p>

        </div>
      </details>

    </div>

    <div class="drawer-footer px-5 py-4 border-t border-slate-200 bg-slate-50">
      <p class="text-xs text-slate-400 mb-3">Il salvataggio non è mai bloccato. I campi mancanti generano avvisi, non errori.</p>
      <div class="flex gap-3 justify-end">
        <button @click="chiudiDrawerMezzo(false)" class="text-sm text-slate-500 hover:text-slate-700 px-4 py-2 border border-slate-300 rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-slate-400">Annulla</button>
        <button @click="salvaIlMezzo()" :disabled="salvandoMezzo" class="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-medium px-5 py-2 rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2">
          <span x-text="salvandoMezzo ? 'Salvataggio…' : 'Salva mezzo'"></span>
        </button>
      </div>
    </div>
  </div><!-- /drawer mezzo -->

  <!-- ══════════════════════════════════════════════════════════════
       DRAWER ATTREZZATURA
       ══════════════════════════════════════════════════════════════ -->
  <div x-show="drawerAtt" x-cloak class="drawer-backdrop" @click="chiudiDrawerAtt(false)" aria-hidden="true"></div>
  <div x-show="drawerAtt" x-cloak @input="modAtt=true" @keydown.escape.window="chiudiDrawerAtt(false)"
       class="drawer" role="dialog" aria-modal="true" aria-label="Editor attrezzatura">

    <div class="drawer-header flex items-center justify-between px-5 py-4 border-b border-slate-200 bg-white">
      <h2 class="text-base font-semibold text-slate-800">
        <span x-text="nuovaAtt ? 'Nuova attrezzatura' : (formAtt.descrizione || formAtt.tipologia || 'Modifica attrezzatura')"></span>
      </h2>
      <button @click="chiudiDrawerAtt(false)" aria-label="Chiudi" class="p-1.5 rounded hover:bg-slate-100 text-slate-500 text-lg focus:outline-none focus:ring-2 focus:ring-slate-400">✕</button>
    </div>

    <div class="drawer-body px-5 py-4 space-y-3">

      <!-- 1. Assegnazione impresa -->
      <details open class="border border-slate-200 rounded-xl overflow-hidden">
        <summary class="px-4 py-3 bg-slate-50 cursor-pointer text-sm font-medium text-slate-700 hover:bg-slate-100 list-none flex items-center justify-between">Impresa di appartenenza <span class="text-slate-400 text-xs" aria-hidden="true">▾</span></summary>
        <div class="p-4">
          <select x-model="formAtt.impresa_id" class="w-full border border-slate-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
            <option value="">— Nessuna impresa assegnata —</option>
            <template x-for="imp in _imprese()" :key="imp.id"><option :value="imp.id" x-text="imp.ragioneSociale"></option></template>
          </select>
          <p x-show="_imprese().length===0" class="mt-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-1.5">Nessuna impresa disponibile. Aggiungila in Anagrafiche → Imprese.</p>
        </div>
      </details>

      <!-- 2. Identificazione -->
      <details open class="border border-slate-200 rounded-xl overflow-hidden">
        <summary class="px-4 py-3 bg-slate-50 cursor-pointer text-sm font-medium text-slate-700 hover:bg-slate-100 list-none flex items-center justify-between">Identificazione <span class="text-slate-400 text-xs" aria-hidden="true">▾</span></summary>
        <div class="p-4 grid gap-3 sm:grid-cols-2">
          <div class="sm:col-span-2">
            <label for="att-tipologia" class="block text-xs font-medium text-slate-600 mb-1">Tipologia</label>
            <select id="att-tipologia" :value="tipoAttInLista(formAtt.tipologia) ? formAtt.tipologia : (formAtt.tipologia?'ALTRO':'')"
                    @change="formAtt.tipologia=$event.target.value!=='ALTRO'?$event.target.value:'';formAtt={...formAtt}"
                    class="w-full border border-slate-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
              <option value="">— Seleziona —</option>
              <template x-for="t in _tipiAtt()" :key="t.valore"><option :value="t.valore" x-text="t.etichetta + (t.ponteggio?' 🔴':'')"></option></template>
            </select>
            <input x-show="!tipoAttInLista(formAtt.tipologia)" type="text" :value="formAtt.tipologia" @input="formAtt.tipologia=$event.target.value;formAtt={...formAtt}" placeholder="Descrivi la tipologia" class="mt-1.5 w-full border border-slate-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
          </div>
          <div class="sm:col-span-2">
            <label for="att-descr" class="block text-xs font-medium text-slate-600 mb-1">Descrizione</label>
            <input id="att-descr" type="text" x-model="formAtt.descrizione" placeholder="es. Ponteggio facciata nord, piano 2-5" class="w-full border border-slate-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
          </div>
          <div>
            <label for="att-matr" class="block text-xs font-medium text-slate-600 mb-1">Matricola <span class="text-slate-400 font-normal">(se presente)</span></label>
            <input id="att-matr" type="text" :value="formAtt.matricola??''" @input="formAtt.matricola=$event.target.value||null" class="w-full border border-slate-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
          </div>
        </div>
      </details>

      <!-- 3. Conformità CE -->
      <details open class="border border-slate-200 rounded-xl overflow-hidden">
        <summary class="px-4 py-3 bg-slate-50 cursor-pointer text-sm font-medium text-slate-700 hover:bg-slate-100 list-none flex items-center justify-between">
          <span>Dichiarazione di conformità CE</span>
          <span x-show="!formAtt.dichiarazioneConformitaCE?.presente" class="text-xs text-amber-600 font-medium">⚠ mancante</span>
        </summary>
        <div class="p-4 space-y-2">
          <label class="flex items-center gap-2 text-sm cursor-pointer">
            <input type="checkbox" :checked="formAtt.dichiarazioneConformitaCE?.presente" @change="(formAtt.dichiarazioneConformitaCE??={}).presente=$event.target.checked;formAtt={...formAtt}" class="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-2 focus:ring-blue-500">
            Dichiarazione CE presente
          </label>
          <label x-show="formAtt.dichiarazioneConformitaCE?.presente" class="cursor-pointer text-xs text-blue-600 hover:text-blue-800">
            <input type="file" accept=".pdf,.png,.jpg" class="sr-only" @change="onConformitaCEFile($event)">
            <span x-text="formAtt.dichiarazioneConformitaCE?.filename ? '📎 ' + formAtt.dichiarazioneConformitaCE.filename : '📎 Allega copia'"></span>
          </label>
        </div>
      </details>

      <!-- 4. Libretto -->
      <details class="border border-slate-200 rounded-xl overflow-hidden">
        <summary class="px-4 py-3 bg-slate-50 cursor-pointer text-sm font-medium text-slate-700 hover:bg-slate-100 list-none flex items-center justify-between">Libretto / manuale <span class="text-slate-400 text-xs" aria-hidden="true">▾</span></summary>
        <div class="p-4">
          <label class="cursor-pointer text-xs text-blue-600 hover:text-blue-800">
            <input type="file" accept=".pdf,.png,.jpg" class="sr-only" @change="onLibrettoAttFile($event)">
            <span x-text="formAtt.libretto?.filename ? '📎 ' + formAtt.libretto.filename : '📎 Allega libretto'"></span>
          </label>
        </div>
      </details>

      <!-- 5. Verifiche -->
      <details class="border border-slate-200 rounded-xl overflow-hidden">
        <summary class="px-4 py-3 bg-slate-50 cursor-pointer text-sm font-medium text-slate-700 hover:bg-slate-100 list-none flex items-center justify-between">
          Verifiche <span class="text-xs font-normal text-slate-400 ml-1" x-text="(formAtt.verifiche??[]).length ? '(' + (formAtt.verifiche??[]).length + ')' : ''"></span>
          <span class="text-slate-400 text-xs" aria-hidden="true">▾</span>
        </summary>
        <div class="p-4 space-y-3">
          <template x-for="(v, idx) in (formAtt.verifiche??[])" :key="idx">
            <div class="border border-slate-200 rounded-lg p-3 space-y-2 relative">
              <button @click="rimuoviVerificaAtt(idx)" class="absolute top-2 right-2 text-red-400 hover:text-red-700 text-sm focus:outline-none" aria-label="Rimuovi">×</button>
              <div class="grid gap-2 sm:grid-cols-2">
                <div>
                  <label class="block text-xs text-slate-500 mb-1">Tipo</label>
                  <select :value="tipoVerAttInLista(v.tipo)?v.tipo:(v.tipo?'ALTRO':'')"
                          @change="formAtt.verifiche[idx].tipo=$event.target.value!=='ALTRO'?$event.target.value:'';formAtt={...formAtt}"
                          class="w-full border border-slate-300 rounded px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500">
                    <option value="">— Seleziona —</option>
                    <template x-for="t in _tipiVerAtt()" :key="t.valore"><option :value="t.valore" x-text="t.etichetta"></option></template>
                  </select>
                  <input x-show="!tipoVerAttInLista(v.tipo)" type="text" :value="v.tipo" @input="formAtt.verifiche[idx].tipo=$event.target.value;formAtt={...formAtt}" placeholder="Tipo verifica" class="mt-1.5 w-full border border-slate-300 rounded px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500">
                </div>
                <div><label class="block text-xs text-slate-500 mb-1">Data eseguita</label><input type="date" :value="v.data??''" @input="formAtt.verifiche[idx].data=$event.target.value||null;formAtt={...formAtt}" class="w-full border border-slate-300 rounded px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"></div>
                <div><label class="block text-xs text-slate-500 mb-1">Prossima verifica</label><input type="date" :value="v.prossima??''" @input="formAtt.verifiche[idx].prossima=$event.target.value||null;formAtt={...formAtt}" class="w-full border border-slate-300 rounded px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"></div>
              </div>
              <label class="cursor-pointer text-xs text-blue-600 hover:text-blue-800">
                <input type="file" accept=".pdf,.png,.jpg" class="sr-only" @change="onVerificaAttFile(idx,$event)">
                <span x-text="v.filename ? '📎 ' + v.filename : '📎 Allega verbale'"></span>
              </label>
            </div>
          </template>
          <button @click="aggiungiVerificaAtt()" type="button" class="text-sm text-blue-600 hover:text-blue-800 border border-blue-300 px-3 py-1.5 rounded-lg hover:bg-blue-50 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500">+ Aggiungi verifica</button>
        </div>
      </details>

      <!-- 6. Documenti specifici (ponteggi) -->
      <details class="border border-slate-200 rounded-xl overflow-hidden">
        <summary class="px-4 py-3 bg-slate-50 cursor-pointer text-sm font-medium text-slate-700 hover:bg-slate-100 list-none flex items-center justify-between">
          Documenti specifici (ponteggi / opere provvisionali)
          <span class="text-xs font-normal text-slate-400 ml-1" x-text="(formAtt.documentiSpecifici??[]).length ? '(' + (formAtt.documentiSpecifici??[]).length + ')' : ''"></span>
          <span class="text-slate-400 text-xs" aria-hidden="true">▾</span>
        </summary>
        <div class="p-4 space-y-3">
          <p class="text-xs text-slate-400">🔴 = PiMUS e Autorizzazione ministeriale (scadenza critica)</p>
          <template x-for="(d, idx) in (formAtt.documentiSpecifici??[])" :key="idx">
            <div class="border border-slate-200 rounded-lg p-3 space-y-2 relative">
              <button @click="rimuoviDocSpecAtt(idx)" class="absolute top-2 right-2 text-red-400 hover:text-red-700 text-sm focus:outline-none" aria-label="Rimuovi">×</button>
              <div class="grid gap-2 sm:grid-cols-2">
                <div>
                  <label class="block text-xs text-slate-500 mb-1">Tipo documento</label>
                  <select :value="d.tipo??''" @change="formAtt.documentiSpecifici[idx].tipo=$event.target.value;formAtt={...formAtt}" class="w-full border border-slate-300 rounded px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500">
                    <option value="">— Seleziona —</option>
                    <template x-for="t in _tipiDocSpecAtt()" :key="t.valore"><option :value="t.valore" x-text="t.etichetta + (t.critico?' 🔴':'')"></option></template>
                  </select>
                </div>
                <div>
                  <label class="block text-xs text-slate-500 mb-1">Scadenza <span x-show="d.tipo==='PIMUS'||d.tipo==='AUTORIZZAZIONE_MINISTERIALE'" class="text-red-500">🔴</span></label>
                  <input type="date" :value="d.scadenza??''" @input="formAtt.documentiSpecifici[idx].scadenza=$event.target.value||null;formAtt={...formAtt}"
                         class="w-full border border-slate-300 rounded px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
                         :class="d.scadenza && UTILS.giorniAllaScadenza(d.scadenza)<0?'border-red-400 bg-red-50':''">
                </div>
              </div>
              <label class="cursor-pointer text-xs text-blue-600 hover:text-blue-800">
                <input type="file" accept=".pdf,.png,.jpg" class="sr-only" @change="onDocSpecAttFile(idx,$event)">
                <span x-text="d.filename ? '📎 ' + d.filename : '📎 Allega documento'"></span>
              </label>
            </div>
          </template>
          <button @click="aggiungiDocSpecAtt()" type="button" class="text-sm text-blue-600 hover:text-blue-800 border border-blue-300 px-3 py-1.5 rounded-lg hover:bg-blue-50 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500">+ Aggiungi documento</button>
        </div>
      </details>

      <!-- 7. Nolo (placeholder M4 F4) -->
      <details class="border border-slate-100 rounded-xl overflow-hidden opacity-50">
        <summary class="px-4 py-3 bg-slate-50 cursor-not-allowed text-sm font-medium text-slate-500 list-none flex items-center justify-between">
          Collegamento nolo <span class="text-xs font-normal">(disponibile in M4 F4)</span>
        </summary>
      </details>

      <!-- 8. Altri documenti (raccoglitore libero) -->
      <details class="border border-slate-200 rounded-xl overflow-hidden">
        <summary class="px-4 py-3 bg-slate-50 cursor-pointer text-sm font-medium text-slate-700 hover:bg-slate-100 list-none flex items-center justify-between">
          <span>
            Altri documenti
            <span x-show="extraAttiviAtt.length > 0"
                  class="ml-1 text-xs font-normal text-slate-400"
                  x-text="'(' + extraAttiviAtt.length + ')'"></span>
          </span>
          <span class="text-slate-400 text-xs" aria-hidden="true">▾</span>
        </summary>
        <div class="p-4 space-y-3">

          <div class="flex items-center justify-between mb-2">
            <span class="text-xs text-slate-400">Documenti aggiuntivi non previsti dallo schema (titolo libero, scadenza opzionale).</span>
            <button type="button" @click="apriFormExtraAtt()"
                    x-show="!mostraFormExtraAtt"
                    class="ml-3 flex-shrink-0 text-xs text-blue-600 hover:text-blue-800 border border-blue-300
                           px-2 py-1 rounded hover:bg-blue-50 transition-colors
                           focus:outline-none focus:ring-2 focus:ring-blue-500">
              + Allega altro documento
            </button>
          </div>

          <!-- Form inline add/modifica -->
          <div x-show="mostraFormExtraAtt"
               class="mb-3 border border-blue-200 rounded-lg p-3 bg-blue-50 space-y-2">
            <div class="grid gap-2 sm:grid-cols-2">
              <div>
                <label class="block text-xs font-medium text-slate-600 mb-1">Titolo <span class="text-red-500">*</span></label>
                <input type="text" x-model="formExtraAtt.titolo"
                       placeholder="es. Certificato collaudo, Scheda tecnica…"
                       class="w-full border border-slate-300 rounded px-2 py-1.5 text-xs
                              focus:outline-none focus:ring-2 focus:ring-blue-500">
              </div>
              <div>
                <label class="block text-xs font-medium text-slate-600 mb-1">Scadenza (opzionale)</label>
                <input type="date" x-model="formExtraAtt.scadenza"
                       class="w-full border border-slate-300 rounded px-2 py-1.5 text-xs
                              focus:outline-none focus:ring-2 focus:ring-blue-500">
              </div>
            </div>
            <label class="flex items-center gap-2 cursor-pointer text-xs text-blue-600 hover:text-blue-800">
              <input type="file" accept=".pdf,.png,.jpg,.jpeg" class="sr-only"
                     @change="onExtraFileAtt($event)">
              <span x-text="formExtraAtt.filename ? '📎 ' + formExtraAtt.filename : '📎 Seleziona file (opzionale)'"></span>
            </label>
            <div class="flex items-center gap-2 pt-1">
              <button type="button" @click="salvaExtraAtt()"
                      :disabled="!(formExtraAtt.titolo ?? '').trim()"
                      class="text-xs font-semibold bg-blue-600 hover:bg-blue-700 text-white
                             disabled:opacity-40 px-3 py-1.5 rounded-lg transition-colors
                             focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1">
                <span x-text="idExtraInModificaAtt ? 'Aggiorna' : 'Conferma'"></span>
              </button>
              <button type="button" @click="chiudiFormExtraAtt()"
                      class="text-xs text-slate-500 hover:text-slate-700
                             focus:outline-none focus:ring-1 focus:ring-slate-400 rounded px-2">
                Annulla
              </button>
            </div>
          </div>

          <!-- Lista documenti extra presenti -->
          <ul class="space-y-1.5" x-show="extraAttiviAtt.length > 0">
            <template x-for="ex in extraAttiviAtt" :key="ex.id">
              <li class="flex items-start justify-between gap-3 bg-white border border-slate-200
                          rounded-lg px-3 py-2 text-xs">
                <div class="min-w-0 flex-1">
                  <div class="flex items-center gap-2 flex-wrap">
                    <span class="font-medium text-slate-700" x-text="ex.titolo"></span>
                    <span x-show="ex.scadenza" class="font-normal"
                          :class="ex.scadenza && UTILS.giorniAllaScadenza(ex.scadenza) < 0 ? 'text-red-600' : 'text-slate-400'"
                          x-text="'· scad. ' + UTILS.formatData(ex.scadenza)"></span>
                  </div>
                  <div x-show="ex.filename" class="mt-1 flex items-center gap-1.5 flex-wrap">
                    <button x-show="ex.base64" type="button"
                            @click="ALLEGATI.apriAllegato(ex.base64, ex.filename)"
                            class="text-blue-700 bg-blue-50 border border-blue-200 px-1.5 py-0.5
                                   rounded hover:bg-blue-100 focus:outline-none focus:ring-1 focus:ring-blue-400"
                            :title="'Apri ' + ex.filename">
                      📎 <span x-text="ex.filename"></span>
                    </button>
                    <span x-show="!ex.base64"
                          class="text-slate-400 bg-slate-50 border border-slate-200 px-1.5 py-0.5 rounded cursor-not-allowed"
                          title="Documento non disponibile in questa copia"
                          x-text="'📎 ' + ex.filename"></span>
                    <button x-show="ex.base64" type="button"
                            @click="ALLEGATI.scaricaAllegato(ex.base64, ex.filename)"
                            class="text-slate-500 hover:text-blue-600 transition-colors
                                   focus:outline-none focus:ring-1 focus:ring-slate-400 rounded px-0.5"
                            :aria-label="'Scarica ' + ex.titolo" title="Scarica">⬇</button>
                  </div>
                  <!-- Storico: versioni precedenti di questo documento (sola lettura) -->
                  <template x-if="storicoExtraAtt(ex.titolo).length > 0">
                    <details class="mt-1.5 text-xs">
                      <summary class="cursor-pointer text-slate-400 hover:text-slate-600 select-none">
                        Storico (<span x-text="storicoExtraAtt(ex.titolo).length"></span> vers. prec.)
                      </summary>
                      <ul class="mt-1 ml-1 border-l border-slate-100 pl-2 space-y-0.5">
                        <template x-for="v in storicoExtraAtt(ex.titolo)" :key="(v._eliminato_il??'')+(v.filename??'')">
                          <li class="flex items-center gap-2 text-slate-400">
                            <span class="flex-shrink-0" x-text="UTILS.formatData(v._eliminato_il)"></span>
                            <button x-show="v.base64" type="button"
                                    @click.stop="ALLEGATI.apriAllegato(v.base64, v.filename)"
                                    class="text-blue-500 hover:text-blue-700 truncate text-left
                                           focus:outline-none focus:ring-1 focus:ring-blue-400 rounded"
                                    :title="'Apri ' + v.filename">
                              📎 <span x-text="v.filename"></span>
                            </button>
                            <span x-show="!v.base64"
                                  class="text-slate-300 cursor-not-allowed truncate"
                                  title="Documento non disponibile"
                                  x-text="v.filename ? '📎 ' + v.filename : '—'"></span>
                          </li>
                        </template>
                      </ul>
                    </details>
                  </template>
                </div>
                <div class="flex items-center gap-2 flex-shrink-0">
                  <button type="button" @click="apriModificaExtraAtt(ex.id)"
                          class="text-slate-500 hover:text-blue-600 transition-colors
                                 focus:outline-none focus:ring-1 focus:ring-slate-400 rounded px-1"
                          title="Modifica" aria-label="Modifica documento extra">✏</button>
                  <button type="button" @click="cestinaExtraAtt(ex.id)"
                          class="text-red-400 hover:text-red-600
                                 focus:outline-none focus:ring-1 focus:ring-red-400 rounded">
                    Rimuovi
                  </button>
                </div>
              </li>
            </template>
          </ul>

          <p x-show="extraAttiviAtt.length === 0 && !mostraFormExtraAtt"
             class="text-xs text-slate-400 text-center py-2">Nessun documento aggiuntivo</p>

        </div>
      </details>

    </div>

    <div class="drawer-footer px-5 py-4 border-t border-slate-200 bg-slate-50">
      <p class="text-xs text-slate-400 mb-3">Il salvataggio non è mai bloccato. I campi mancanti generano avvisi, non errori.</p>
      <div class="flex gap-3 justify-end">
        <button @click="chiudiDrawerAtt(false)" class="text-sm text-slate-500 hover:text-slate-700 px-4 py-2 border border-slate-300 rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-slate-400">Annulla</button>
        <button @click="salvaLaAtt()" :disabled="salvandoAtt" class="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-medium px-5 py-2 rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2">
          <span x-text="salvandoAtt ? 'Salvataggio…' : 'Salva attrezzatura'"></span>
        </button>
      </div>
    </div>
  </div><!-- /drawer attrezzatura -->

</div>
`;

// ── Registrazione ──────────────────────────────────────────────────────────

window.MODULI_REGISTRATI = window.MODULI_REGISTRATI ?? {};
window.MODULI_REGISTRATI['mezzi-attrezzature'] = {
  monta(contenitore) { contenitore.innerHTML = _TEMPLATE_MA; },
};
