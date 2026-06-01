/**
 * noli.js — M4 Fase 4: collezione Noli.
 *
 * Nolo FREDDO: solo mezzo, attestazione buono stato obbligatoria (art.72).
 * Nolo CALDO:  mezzo + operatore; se superaSoglieSubappalto → l'impresa
 *              noleggiante (se in anagrafica) è valutata con CONFORMITA_MATRIX.SUBAPPALTO.
 *
 * Collegamento bidirezionale nolo↔mezzo/attrezzatura gestito via
 * ANAGRAFICA_SERVICE.collegaNolo() — chiamato DOPO il salvataggio base.
 * Guida-non-blocca: se la sincronizzazione fallisce, avviso gentile.
 */

const _leggiFileBase64Noli = (file) =>
  new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload  = (e) => resolve(e.target.result);
    r.onerror = ()  => reject(new Error('Lettura file non riuscita'));
    r.readAsDataURL(file);
  });

// ── Componente Alpine ────────────────────────────────────────────────────────

function ListaNoli() {
  return {
    noli: [], imprese: [], mezzi: [], attrezzature: [], lavoratori: [],
    caricamento: true,

    cercaNoli: '', filtroImpresaId: '', mostraCestino: false,

    drawerNolo: false, formNolo: {}, nuovoNolo: true, salvandoNolo: false, modNolo: false,

    // UI-only: non salvati nel JSON
    _tipoBeneUI:        'nessuno',  // 'nessuno' | 'mezzo' | 'attrezzatura'
    _noleggiante_est:   false,      // true = noleggiante non in anagrafica → testo libero
    _operatore_est:     false,      // true = operatore non in anagrafica → testo libero

    _cantiereId: null,

    // ── Computed ─────────────────────────────────────────────────────────────

    get noliFiltrati() {
      const t = this.cercaNoli.toLowerCase();
      return this.noli.filter(n => !n._cestino)
        .filter(n => !this.filtroImpresaId ||
          n.impresa_utilizzatrice_id === this.filtroImpresaId ||
          n.impresa_noleggiante_id  === this.filtroImpresaId)
        .filter(n => !t || [n.oggetto, n.tipoNolo, n.noleggiante_nome]
          .some(v => v?.toLowerCase().includes(t)));
    },
    get noliCestino() { return this.noli.filter(n => n._cestino); },
    get contatori() {
      const a = this.noli.filter(n => !n._cestino);
      const c = a.map(n => ANAGRAFICA_SERVICE.calcolaConformitaNolo(n));
      return { totale: a.length, verde: c.filter(x=>x.stato==='verde').length, giallo: c.filter(x=>x.stato==='giallo').length, rosso: c.filter(x=>x.stato==='rosso').length };
    },

    // ── Lifecycle ─────────────────────────────────────────────────────────────

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
        this._cantiereId    = id;
        this.filtroImpresaId = '';
        if (!id) { this.noli = []; this.caricamento = false; return; }
        this.caricamento = true;
        if (ANAGRAFICA_SERVICE.cantiereId === id) { this.caricaDati(); }
        else { document.addEventListener('anagrafica-caricata', (e) => { if (e.detail?.cantiereId === id) this.caricaDati(); }, { once: true }); }
      }
    },

    caricaDati() {
      this.noli         = [...(ANAGRAFICA_SERVICE.get('noli',         { inclCestino: true }) ?? [])];
      this.imprese      = [...(ANAGRAFICA_SERVICE.get('imprese') ?? [])];
      this.mezzi        = [...(ANAGRAFICA_SERVICE.get('mezzi') ?? [])];
      this.attrezzature = [...(ANAGRAFICA_SERVICE.get('attrezzature') ?? [])];
      this.lavoratori   = [...(ANAGRAFICA_SERVICE.get('lavoratori') ?? [])];
      this.caricamento  = false;
    },

    // ── Drawer ────────────────────────────────────────────────────────────────

    nuovoNoloFn() {
      this.formNolo          = ANAGRAFICA_SERVICE.creaEntitaVuota('noli');
      this._tipoBeneUI       = 'nessuno';
      this._noleggiante_est  = false;
      this._operatore_est    = false;
      this.nuovoNolo = true; this.modNolo = false; this.drawerNolo = true;
    },

    modificaNolo(id) {
      const n = this.noli.find(x => x.id === id);
      if (!n) return;
      this.formNolo = JSON.parse(JSON.stringify(n));
      this.formNolo.operatore              ??= { nome: null, lavoratore_id: null, superaSoglieSubappalto: false };
      this.formNolo.attestazioneBuonoStato ??= { presente: false, data: null, filename: null, base64: null };

      // Deriva i flag UI dal contenuto del record
      this._tipoBeneUI      = this.formNolo.mezzo_id ? 'mezzo' : this.formNolo.attrezzatura_id ? 'attrezzatura' : 'nessuno';
      this._noleggiante_est = !this.formNolo.impresa_noleggiante_id && !!this.formNolo.noleggiante_nome;
      this._operatore_est   = !this.formNolo.operatore?.lavoratore_id && !!this.formNolo.operatore?.nome;
      this.nuovoNolo = false; this.modNolo = false; this.drawerNolo = true;
    },

    chiudiDrawerNolo(forza = false) {
      if (!forza && this.modNolo && !confirm('Modifiche non salvate. Chiudere?')) return;
      this.drawerNolo = false; this.formNolo = {};
    },

    async salvaIlNolo() {
      this.salvandoNolo = true;
      try {
        // FK old per collegaNolo cascade
        const oldNolo    = this.nuovoNolo ? null : this.noli.find(n => n.id === this.formNolo.id);
        const mz_old     = oldNolo?.mezzo_id ?? null;
        const att_old    = oldNolo?.attrezzatura_id ?? null;

        // Mutualmente esclusivi: azzera FK non selezionato
        if (this._tipoBeneUI !== 'mezzo')        this.formNolo.mezzo_id = null;
        if (this._tipoBeneUI !== 'attrezzatura') this.formNolo.attrezzatura_id = null;

        // Azzera noleggiante FK se in modalità testo libero
        if (this._noleggiante_est) this.formNolo.impresa_noleggiante_id = null;
        else this.formNolo.noleggiante_nome = '';

        // Azzera operatore FK se testo libero (o se FREDDO)
        if (this.formNolo.tipoNolo !== 'CALDO') {
          this.formNolo.operatore = { nome: null, lavoratore_id: null, superaSoglieSubappalto: false };
        } else if (this._operatore_est) {
          this.formNolo.operatore.lavoratore_id = null;
        } else {
          this.formNolo.operatore.nome = this.lavoratori.find(l => l.id === this.formNolo.operatore?.lavoratore_id)?.cognome ?? this.formNolo.operatore?.nome ?? null;
        }

        // Salva il nolo
        let savedNolo;
        if (this.nuovoNolo) savedNolo = await ANAGRAFICA_SERVICE.aggiungi('noli', this.formNolo);
        else                savedNolo = await ANAGRAFICA_SERVICE.aggiorna('noli', this.formNolo.id, this.formNolo);

        // Sincronizza nolo_id su mezzo/attrezzatura (guida-non-blocca)
        try {
          await ANAGRAFICA_SERVICE.collegaNolo(
            savedNolo.id,
            savedNolo.mezzo_id, mz_old,
            savedNolo.attrezzatura_id, att_old
          );
        } catch {
          NOTIFICHE.attenzione('Collegamento bene', 'Il collegamento mezzo/attrezzatura non è stato aggiornato automaticamente.');
        }

        this.caricaDati();
        this.chiudiDrawerNolo(true);
        NOTIFICHE.successo(this.nuovoNolo ? 'Nolo aggiunto' : 'Nolo aggiornato');
      } catch (err) { ERRORI.gestisciErrore('noli/salva', err); }
      finally { this.salvandoNolo = false; }
    },

    async cestinaIlNolo(id) {
      const nolo = this.noli.find(n => n.id === id);
      // Cascata: rimuovi nolo_id dal mezzo/attrezzatura collegata
      if (nolo?.mezzo_id || nolo?.attrezzatura_id) {
        try { await ANAGRAFICA_SERVICE.collegaNolo(null, null, nolo.mezzo_id, null, nolo.attrezzatura_id); }
        catch {} // guida-non-blocca
      }
      try {
        await ANAGRAFICA_SERVICE.cestina('noli', id);
        this.caricaDati();
        NOTIFICHE.info('Nolo nel cestino. Il collegamento col bene è stato rimosso.');
      } catch (err) { ERRORI.gestisciErrore('noli/cestina', err); }
    },

    async ripristinaNolo(id) {
      try { await ANAGRAFICA_SERVICE.ripristina('noli', id); this.caricaDati(); NOTIFICHE.successo('Nolo ripristinato'); }
      catch (err) { ERRORI.gestisciErrore('noli/ripristina', err); }
    },

    async eliminaNolo(id) {
      if (!confirm('Eliminare definitivamente?')) return;
      try { await ANAGRAFICA_SERVICE.eliminaDefinitivamente('noli', id); this.caricaDati(); }
      catch (err) { ERRORI.gestisciErrore('noli/elimina', err); }
    },

    async onAttBuonoStatoFile(ev) {
      const f = ev.target.files?.[0]; if (!f) return;
      const b64 = await _leggiFileBase64Noli(f);
      this.formNolo.attestazioneBuonoStato = { ...(this.formNolo.attestazioneBuonoStato ?? {}), filename: f.name, base64: b64 };
      this.formNolo = { ...this.formNolo }; this.modNolo = true;
    },

    onTipoBeneChange(tipo) {
      this._tipoBeneUI = tipo;
      if (tipo !== 'mezzo')        this.formNolo.mezzo_id = null;
      if (tipo !== 'attrezzatura') this.formNolo.attrezzatura_id = null;
      this.formNolo = { ...this.formNolo }; this.modNolo = true;
    },

    // ── Helpers ───────────────────────────────────────────────────────────────

    nomeImpresa(id)  { return this.imprese.find(i => i.id === id)?.ragioneSociale ?? null; },
    nomeMezzo(id)    { const m = this.mezzi.find(x=>x.id===id); return m ? [m.marca,m.modello].filter(Boolean).join(' ')||m.tipologia : null; },
    nomeAtt(id)      { const a = this.attrezzature.find(x=>x.id===id); return a ? a.descrizione||a.tipologia : null; },
    nomeLav(id)      { const l = this.lavoratori.find(x=>x.id===id); return l ? [l.cognome,l.nome].filter(Boolean).join(' ') : null; },

    nomeBeneNolo(n) {
      if (n.mezzo_id)        { const m=this.mezzi.find(x=>x.id===n.mezzo_id); return m ? [m.marca,m.modello].filter(Boolean).join(' ')||m.tipologia : '(mezzo non trovato)'; }
      if (n.attrezzatura_id) { const a=this.attrezzature.find(x=>x.id===n.attrezzatura_id); return a ? a.descrizione||a.tipologia : '(att. non trovata)'; }
      return n.oggetto || '—';
    },

    avvisoBeneNonDisponibile(n) {
      if (n.mezzo_id)        { const m=this.mezzi.find(x=>x.id===n.mezzo_id); if (!m||m._cestino) return 'Mezzo non disponibile'; }
      if (n.attrezzatura_id) { const a=this.attrezzature.find(x=>x.id===n.attrezzatura_id); if (!a||a._cestino) return 'Attrezzatura non disponibile'; }
      return null;
    },

    conformita(n)    { return ANAGRAFICA_SERVICE.calcolaConformitaNolo(n); },

    semaforoClass(stato) {
      if (stato === 'verde') return 'bg-green-100 text-green-700';
      if (stato === 'giallo') return 'bg-yellow-100 text-yellow-700';
      if (stato === 'rosso')  return 'bg-red-100 text-red-700';
      return 'bg-slate-100 text-slate-500';
    },

    _imprese()   { return this.imprese; },
    _mezzi()     { return this.mezzi.filter(m=>!m._cestino); },
    _att()       { return this.attrezzature.filter(a=>!a._cestino); },
    _lavs()      { return this.lavoratori.filter(l=>!l._cestino); },
    _tipiNolo()  { return ANAGRAFICA_SERVICE.TIPI_NOLO; },
  };
}

// ── Template HTML ─────────────────────────────────────────────────────────────

const _TEMPLATE_NOLI = `
<div x-data="ListaNoli()" x-init="init()" x-effect="aggiornaSeCantiereRicambia()" class="max-w-5xl">

  <!-- Header -->
  <div class="flex items-center justify-between mb-5">
    <div>
      <h1 class="text-xl font-semibold text-slate-800">🔗 Noli</h1>
      <p class="text-xs text-slate-400 mt-0.5"
         x-text="contatori.totale + ' noli: ' + contatori.verde + ' ✓  ' + contatori.giallo + ' ⚠  ' + contatori.rosso + ' ✕'">
      </p>
    </div>
    <button @click="nuovoNoloFn()" x-show="$store.cantiere.id"
            class="bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2">
      + Nuovo nolo
    </button>
  </div>

  <div x-show="!$store.cantiere.id" class="placeholder-modulo">
    <div class="text-3xl" aria-hidden="true">🔗</div>
    <p class="text-slate-500">Seleziona un cantiere per gestire i noli.</p>
  </div>

  <div x-show="$store.cantiere.id">
    <div x-show="caricamento" class="flex items-center gap-3 py-10 text-slate-400 text-sm">
      <div class="w-5 h-5 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
      Caricamento noli…
    </div>

    <div x-show="!caricamento">

      <!-- Barra strumenti -->
      <div class="flex flex-wrap gap-3 mb-4">
        <input type="search" x-model="cercaNoli" placeholder="Cerca oggetto, tipo, noleggiante…"
               class="flex-1 min-w-48 border border-slate-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
        <select x-model="filtroImpresaId" class="border border-slate-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
          <option value="">Tutte le imprese</option>
          <template x-for="imp in _imprese()" :key="imp.id">
            <option :value="imp.id" x-text="imp.ragioneSociale"></option>
          </template>
        </select>
      </div>

      <!-- Lista noli -->
      <div role="list" class="space-y-2">
        <div x-show="noliFiltrati.length === 0" class="py-10 text-center text-slate-400">
          <div class="text-3xl mb-2" aria-hidden="true">🔗</div>
          <p x-show="!cercaNoli && !filtroImpresaId">Nessun nolo. Clicca "+ Nuovo nolo" per iniziare.</p>
          <p x-show="cercaNoli || filtroImpresaId">Nessun nolo corrisponde ai filtri.</p>
        </div>

        <template x-for="n in noliFiltrati" :key="n.id">
          <div role="listitem" class="border border-slate-200 bg-white hover:border-slate-300 rounded-xl px-4 py-3 flex items-center gap-4 transition-all">
            <span :class="semaforoClass(conformita(n).stato)"
                  class="flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold" aria-hidden="true">
              <span x-text="conformita(n).stato==='verde'?'✓':conformita(n).stato==='giallo'?'⚠':conformita(n).stato==='rosso'?'✕':'—'"></span>
            </span>
            <div class="flex-1 min-w-0">
              <div class="flex items-center gap-2 flex-wrap">
                <span class="font-medium text-slate-800" x-text="n.oggetto || nomeBeneNolo(n) || '(oggetto non specificato)'"></span>
                <span x-show="n.tipoNolo" class="text-xs px-2 py-0.5 rounded-full"
                      :class="n.tipoNolo==='CALDO' ? 'bg-orange-100 text-orange-700' : 'bg-blue-100 text-blue-700'"
                      x-text="n.tipoNolo==='CALDO' ? 'Caldo' : 'Freddo'"></span>
                <span x-show="n.operatore?.superaSoglieSubappalto" class="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded-full">Sopra soglia</span>
              </div>
              <div class="flex items-center gap-3 flex-wrap text-xs text-slate-400 mt-0.5">
                <span x-show="nomeImpresa(n.impresa_utilizzatrice_id)" x-text="'Utiliz.: ' + nomeImpresa(n.impresa_utilizzatrice_id)"></span>
                <span x-show="nomeImpresa(n.impresa_noleggiante_id) || n.noleggiante_nome"
                      x-text="'Noleg.: ' + (nomeImpresa(n.impresa_noleggiante_id) || n.noleggiante_nome)"></span>
                <span x-show="n.mezzo_id || n.attrezzatura_id" x-text="'Bene: ' + nomeBeneNolo(n)"></span>
                <span x-show="n.dataFine" x-text="'Fine: ' + UTILS.formatData(n.dataFine)"></span>
              </div>
              <!-- Avviso bene non disponibile -->
              <p x-show="avvisoBeneNonDisponibile(n)" class="text-xs text-amber-600 mt-0.5"
                 x-text="'⚠ ' + avvisoBeneNonDisponibile(n)"></p>
              <!-- Scadenze -->
              <template x-if="conformita(n).scadenze.length > 0">
                <p class="text-xs mt-0.5" :class="conformita(n).scadenze[0].stato==='scaduto'?'text-red-600':'text-amber-600'"
                   x-text="conformita(n).scadenze[0].label + ': ' + (conformita(n).scadenze[0].giorni < 0 ? 'scaduto ' + Math.abs(conformita(n).scadenze[0].giorni) + ' gg fa' : 'tra ' + conformita(n).scadenze[0].giorni + ' gg')"></p>
              </template>
            </div>
            <div class="flex gap-2 flex-shrink-0">
              <button @click="modificaNolo(n.id)" class="text-sm text-slate-600 hover:text-slate-900 px-3 py-1.5 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors focus:outline-none focus:ring-2 focus:ring-slate-400">✏ Modifica</button>
              <button @click="cestinaIlNolo(n.id)" class="text-sm text-red-400 hover:text-red-700 px-2 py-1.5 rounded-lg hover:bg-red-50 transition-colors focus:outline-none focus:ring-2 focus:ring-red-400" title="Cestina">🗑</button>
            </div>
          </div>
        </template>
      </div>

      <!-- Cestino -->
      <div class="mt-6">
        <button @click="mostraCestino = !mostraCestino" class="text-xs text-slate-400 hover:text-slate-600 underline focus:outline-none focus:ring-2 focus:ring-slate-400 rounded">
          <span x-text="(mostraCestino?'▾ Nascondi':'▸ Mostra') + ' cestino (' + noliCestino.length + ')'"></span>
        </button>
        <div x-show="mostraCestino && noliCestino.length > 0" class="mt-3 space-y-2">
          <template x-for="n in noliCestino" :key="n.id">
            <div class="border border-slate-200 bg-slate-50 rounded-xl px-4 py-3 flex items-center gap-4 opacity-60 hover:opacity-80">
              <div class="flex-1 min-w-0">
                <span class="text-sm text-slate-600 line-through" x-text="n.oggetto || '(nolo)'"></span>
                <p class="text-xs text-slate-400" x-text="'Eliminato il ' + UTILS.formatData(n._eliminato_il)"></p>
              </div>
              <div class="flex gap-2">
                <button @click="ripristinaNolo(n.id)" class="text-xs text-green-700 px-2 py-1 border border-green-300 rounded-lg hover:bg-green-50 focus:outline-none focus:ring-2 focus:ring-green-400">↩ Ripristina</button>
                <button @click="eliminaNolo(n.id)" class="text-xs text-red-500 px-2 py-1 rounded-lg hover:bg-red-50 focus:outline-none focus:ring-2 focus:ring-red-400">Elimina def.</button>
              </div>
            </div>
          </template>
        </div>
      </div>

    </div><!-- /!caricamento -->
  </div><!-- /$store.cantiere.id -->

  <!-- ══════════════════════════════════════════════════════════════
       DRAWER NOLO — usa .drawer CSS condiviso (no inline style)
       ══════════════════════════════════════════════════════════════ -->
  <div x-show="drawerNolo" x-cloak class="drawer-backdrop" @click="chiudiDrawerNolo(false)" aria-hidden="true"></div>
  <div x-show="drawerNolo" x-cloak @input="modNolo=true" @keydown.escape.window="chiudiDrawerNolo(false)"
       class="drawer" role="dialog" aria-modal="true" aria-label="Editor nolo">

    <div class="drawer-header flex items-center justify-between px-5 py-4 border-b border-slate-200 bg-white">
      <h2 class="text-base font-semibold text-slate-800">
        <span x-text="nuovoNolo ? 'Nuovo nolo' : (formNolo.oggetto || 'Modifica nolo')"></span>
      </h2>
      <button @click="chiudiDrawerNolo(false)" aria-label="Chiudi" class="p-1.5 rounded hover:bg-slate-100 text-slate-500 text-lg focus:outline-none focus:ring-2 focus:ring-slate-400">✕</button>
    </div>

    <div class="drawer-body px-5 py-4 space-y-3">

      <!-- 1. Tipo + oggetto + date + contratto -->
      <details open class="border border-slate-200 rounded-xl overflow-hidden">
        <summary class="px-4 py-3 bg-slate-50 cursor-pointer text-sm font-medium text-slate-700 hover:bg-slate-100 list-none flex items-center justify-between">
          Tipo e dati generali <span class="text-slate-400 text-xs" aria-hidden="true">▾</span>
        </summary>
        <div class="p-4 grid gap-3 sm:grid-cols-2">
          <div class="sm:col-span-2">
            <label for="nl-tipo" class="block text-xs font-medium text-slate-600 mb-1">Tipo nolo</label>
            <select id="nl-tipo" x-model="formNolo.tipoNolo"
                    class="w-full border border-slate-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
              <option value="">— Seleziona —</option>
              <template x-for="t in _tipiNolo()" :key="t.valore">
                <option :value="t.valore" x-text="t.etichetta"></option>
              </template>
            </select>
          </div>
          <div class="sm:col-span-2">
            <label for="nl-oggetto" class="block text-xs font-medium text-slate-600 mb-1">
              Oggetto del nolo <span class="text-slate-400 font-normal">(es. "Autogru 50t", "Ponteggio 200mq")</span>
            </label>
            <input id="nl-oggetto" type="text" x-model="formNolo.oggetto"
                   class="w-full border border-slate-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
          </div>
          <div>
            <label for="nl-ini" class="block text-xs font-medium text-slate-600 mb-1">Data inizio</label>
            <input id="nl-ini" type="date" x-model="formNolo.dataInizio"
                   class="w-full border border-slate-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
          </div>
          <div>
            <label for="nl-fine" class="block text-xs font-medium text-slate-600 mb-1">
              Data fine <span class="text-amber-600">🟠</span>
            </label>
            <input id="nl-fine" type="date" x-model="formNolo.dataFine"
                   class="w-full border border-slate-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                   :class="formNolo.dataFine && UTILS.giorniAllaScadenza(formNolo.dataFine)<0 ? 'border-red-400 bg-red-50' : ''">
          </div>
          <div class="sm:col-span-2">
            <label for="nl-contratto" class="block text-xs font-medium text-slate-600 mb-1">N. contratto / riferimento</label>
            <input id="nl-contratto" type="text" x-model="formNolo.contrattoRiferimento"
                   class="w-full border border-slate-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
          </div>
        </div>
      </details>

      <!-- 2. Impresa utilizzatrice (FK) -->
      <details open class="border border-slate-200 rounded-xl overflow-hidden">
        <summary class="px-4 py-3 bg-slate-50 cursor-pointer text-sm font-medium text-slate-700 hover:bg-slate-100 list-none flex items-center justify-between">Impresa utilizzatrice <span class="text-slate-400 text-xs" aria-hidden="true">▾</span></summary>
        <div class="p-4">
          <select x-model="formNolo.impresa_utilizzatrice_id"
                  class="w-full border border-slate-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
            <option value="">— Seleziona —</option>
            <template x-for="imp in _imprese()" :key="imp.id">
              <option :value="imp.id" x-text="imp.ragioneSociale"></option>
            </template>
          </select>
        </div>
      </details>

      <!-- 3. Impresa / soggetto noleggiante (FK o testo) -->
      <details open class="border border-slate-200 rounded-xl overflow-hidden">
        <summary class="px-4 py-3 bg-slate-50 cursor-pointer text-sm font-medium text-slate-700 hover:bg-slate-100 list-none flex items-center justify-between">Soggetto noleggiante <span class="text-slate-400 text-xs" aria-hidden="true">▾</span></summary>
        <div class="p-4 space-y-2">
          <label class="flex items-center gap-2 text-xs text-slate-500 cursor-pointer mb-2">
            <input type="checkbox" x-model="_noleggiante_est"
                   @change="if(_noleggiante_est){formNolo.impresa_noleggiante_id=null;}else{formNolo.noleggiante_nome='';}; formNolo={...formNolo}"
                   class="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-2 focus:ring-blue-500">
            Il noleggiante non è nell'anagrafica (inserisci manualmente)
          </label>
          <template x-if="!_noleggiante_est">
            <select x-model="formNolo.impresa_noleggiante_id"
                    class="w-full border border-slate-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
              <option value="">— Seleziona (o usa il campo testo sopra) —</option>
              <template x-for="imp in _imprese()" :key="imp.id">
                <option :value="imp.id" x-text="imp.ragioneSociale"></option>
              </template>
            </select>
          </template>
          <template x-if="_noleggiante_est">
            <input type="text" x-model="formNolo.noleggiante_nome"
                   placeholder="Ragione sociale / nome noleggiante"
                   class="w-full border border-slate-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
          </template>
        </div>
      </details>

      <!-- 4. Bene noleggiato (mezzo / attrezzatura / solo oggetto) -->
      <details class="border border-slate-200 rounded-xl overflow-hidden">
        <summary class="px-4 py-3 bg-slate-50 cursor-pointer text-sm font-medium text-slate-700 hover:bg-slate-100 list-none flex items-center justify-between">
          Bene noleggiato
          <span x-show="formNolo.mezzo_id || formNolo.attrezzatura_id" class="text-xs text-blue-600 font-normal ml-1"
                x-text="formNolo.mezzo_id ? '→ ' + (nomeMezzo(formNolo.mezzo_id)||'mezzo') : '→ ' + (nomeAtt(formNolo.attrezzatura_id)||'att.')"></span>
          <span class="text-slate-400 text-xs" aria-hidden="true">▾</span>
        </summary>
        <div class="p-4 space-y-3">
          <p class="text-xs text-slate-400">Collega il bene all'anagrafica (mezzo o attrezzatura) se è già censito. Altrimenti descrivilo nell'oggetto del nolo.</p>
          <div class="flex gap-3">
            <template x-for="[val, lab] in [['nessuno','Solo oggetto'],['mezzo','Mezzo'],['attrezzatura','Attrezzatura']]" :key="val">
              <label class="flex items-center gap-1.5 text-sm cursor-pointer">
                <input type="radio" :value="val" :checked="_tipoBeneUI===val" @change="onTipoBeneChange(val)"
                       class="w-4 h-4 border-slate-300 text-blue-600 focus:ring-2 focus:ring-blue-500">
                <span x-text="lab"></span>
              </label>
            </template>
          </div>
          <template x-if="_tipoBeneUI === 'mezzo'">
            <select x-model="formNolo.mezzo_id" class="w-full border border-slate-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
              <option value="">— Seleziona mezzo —</option>
              <template x-for="m in _mezzi()" :key="m.id">
                <option :value="m.id" x-text="[m.marca,m.modello].filter(Boolean).join(' ') || m.tipologia"></option>
              </template>
            </select>
          </template>
          <template x-if="_tipoBeneUI === 'attrezzatura'">
            <select x-model="formNolo.attrezzatura_id" class="w-full border border-slate-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
              <option value="">— Seleziona attrezzatura —</option>
              <template x-for="a in _att()" :key="a.id">
                <option :value="a.id" x-text="a.descrizione || a.tipologia"></option>
              </template>
            </select>
          </template>
        </div>
      </details>

      <!-- 5. Attestazione buono stato (sempre; obbligatoria per FREDDO) -->
      <details open class="border border-slate-200 rounded-xl overflow-hidden">
        <summary class="px-4 py-3 bg-slate-50 cursor-pointer text-sm font-medium text-slate-700 hover:bg-slate-100 list-none flex items-center justify-between">
          <span>Attestazione buono stato (art.72)
            <span x-show="formNolo.tipoNolo==='FREDDO'" class="text-red-500 font-normal text-xs ml-1">obbligatoria</span>
          </span>
          <span x-show="!formNolo.attestazioneBuonoStato?.presente && formNolo.tipoNolo==='FREDDO'"
                class="text-amber-600 text-xs font-medium">⚠ assente</span>
        </summary>
        <div class="p-4 space-y-2">
          <label class="flex items-center gap-2 text-sm cursor-pointer">
            <input type="checkbox" :checked="formNolo.attestazioneBuonoStato?.presente"
                   @change="(formNolo.attestazioneBuonoStato??={}).presente=$event.target.checked;formNolo={...formNolo}"
                   class="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-2 focus:ring-blue-500">
            Attestazione presente
          </label>
          <template x-if="formNolo.attestazioneBuonoStato?.presente">
            <div class="grid gap-2 sm:grid-cols-2">
              <div>
                <label class="block text-xs text-slate-500 mb-1">Data attestazione</label>
                <input type="date" :value="formNolo.attestazioneBuonoStato?.data??''"
                       @input="(formNolo.attestazioneBuonoStato??={}).data=$event.target.value||null;formNolo={...formNolo}"
                       class="w-full border border-slate-300 rounded px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500">
              </div>
              <div class="flex items-end">
                <label class="cursor-pointer text-xs text-blue-600 hover:text-blue-800">
                  <input type="file" accept=".pdf,.png,.jpg" class="sr-only" @change="onAttBuonoStatoFile($event)">
                  <span x-text="formNolo.attestazioneBuonoStato?.filename ? '📎 ' + formNolo.attestazioneBuonoStato.filename : '📎 Allega'"></span>
                </label>
              </div>
            </div>
          </template>
        </div>
      </details>

      <!-- 6 + 7 + 8. Sezioni solo per CALDO -->
      <template x-if="formNolo.tipoNolo === 'CALDO'">
        <div class="space-y-3">

          <!-- 6. Operatore -->
          <details open class="border border-slate-200 rounded-xl overflow-hidden">
            <summary class="px-4 py-3 bg-slate-50 cursor-pointer text-sm font-medium text-slate-700 hover:bg-slate-100 list-none flex items-center justify-between">
              <span>Operatore <span class="text-slate-400 font-normal text-xs">(dipendente della ditta noleggiante)</span></span>
              <span class="text-slate-400 text-xs" aria-hidden="true">▾</span>
            </summary>
            <div class="p-4 space-y-2">
              <label class="flex items-center gap-2 text-xs text-slate-500 cursor-pointer mb-2">
                <input type="checkbox" x-model="_operatore_est"
                       @change="if(_operatore_est){formNolo.operatore.lavoratore_id=null;}else{formNolo.operatore.nome=null;}; formNolo={...formNolo}"
                       class="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-2 focus:ring-blue-500">
                Operatore non censito nell'anagrafica (inserisci manualmente)
              </label>
              <template x-if="!_operatore_est">
                <select x-model="formNolo.operatore.lavoratore_id" @change="formNolo={...formNolo}"
                        class="w-full border border-slate-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                  <option value="">— Seleziona lavoratore —</option>
                  <template x-for="l in _lavs()" :key="l.id">
                    <option :value="l.id" x-text="[l.cognome,l.nome].filter(Boolean).join(' ')"></option>
                  </template>
                </select>
              </template>
              <template x-if="_operatore_est">
                <input type="text" :value="formNolo.operatore?.nome??''"
                       @input="(formNolo.operatore??={}).nome=$event.target.value||null;formNolo={...formNolo}"
                       placeholder="Nome e cognome operatore"
                       class="w-full border border-slate-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
              </template>
            </div>
          </details>

          <!-- 7. Soglie subappalto -->
          <details class="border border-slate-200 rounded-xl overflow-hidden">
            <summary class="px-4 py-3 bg-slate-50 cursor-pointer text-sm font-medium text-slate-700 hover:bg-slate-100 list-none flex items-center justify-between">
              Soglie di subappalto <span class="text-slate-400 text-xs" aria-hidden="true">▾</span>
            </summary>
            <div class="p-4 space-y-3">
              <label class="flex items-center gap-2 text-sm cursor-pointer">
                <input type="checkbox" :checked="formNolo.operatore?.superaSoglieSubappalto"
                       @change="(formNolo.operatore??={}).superaSoglieSubappalto=$event.target.checked;formNolo={...formNolo}"
                       class="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-2 focus:ring-blue-500">
                Supera le soglie di subappalto
              </label>
              <template x-if="formNolo.operatore?.superaSoglieSubappalto">
                <div class="text-xs bg-amber-50 border border-amber-200 rounded-lg p-3 text-amber-700">
                  <strong>Nota:</strong> questo nolo a caldo supera le soglie — va trattato come subappalto.
                  Se l'impresa noleggiante è in anagrafica, la sua conformità viene calcolata
                  con la matrice SUBAPPALTO (POS, idoneità tecnico-professionale, patente a crediti).
                  Verificare la scheda dell'impresa noleggiante in Anagrafiche → Imprese.
                </div>
              </template>
            </div>
          </details>

        </div>
      </template>

    </div><!-- /drawer-body -->

    <div class="drawer-footer px-5 py-4 border-t border-slate-200 bg-slate-50">
      <p class="text-xs text-slate-400 mb-3">Il salvataggio non è mai bloccato. I campi mancanti generano avvisi, non errori.</p>
      <div class="flex gap-3 justify-end">
        <button @click="chiudiDrawerNolo(false)" class="text-sm text-slate-500 hover:text-slate-700 px-4 py-2 border border-slate-300 rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-slate-400">Annulla</button>
        <button @click="salvaIlNolo()" :disabled="salvandoNolo"
                class="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-medium px-5 py-2 rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2">
          <span x-text="salvandoNolo ? 'Salvataggio…' : 'Salva nolo'"></span>
        </button>
      </div>
    </div>

  </div><!-- /drawer nolo -->

</div>
`;

// ── Registrazione ──────────────────────────────────────────────────────────

window.MODULI_REGISTRATI = window.MODULI_REGISTRATI ?? {};
window.MODULI_REGISTRATI['noli'] = {
  monta(contenitore) { contenitore.innerHTML = _TEMPLATE_NOLI; },
};
