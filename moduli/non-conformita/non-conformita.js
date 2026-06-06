/**
 * non-conformita.js — M14: vista/cruscotto Non Conformità.
 *
 * Usa NC_SERVICE (M14-a) per tutte le operazioni dati.
 * Pezzo b: elenco filtrato per stato + crea + modifica + cambia stato + cestina.
 * Pezzo c (aggancio nc_draft) e pezzo d (scadenze/semaforo): non qui.
 */

// ── Componente Alpine ─────────────────────────────────────────────────────────

function NonConformita() {
  return {
    lista:       [],
    imprese:     [],
    caricamento: true,
    filtroStato: 'APERTA',   // tab attiva

    // Drawer
    drawerAperto:              false,
    formDati:                  {},
    formNuova:                 true,
    salvando:                  false,
    modificatoDopoCaricamento: false,

    _cantiereId: null,

    // ── Computed ─────────────────────────────────────────────────────────────

    get listaFiltrata() {
      return this.lista.filter(nc => nc.stato_risoluzione === this.filtroStato);
    },

    get nAperte()        { return this.lista.filter(nc => nc.stato_risoluzione === 'APERTA').length; },
    get nInRisoluzione() { return this.lista.filter(nc => nc.stato_risoluzione === 'IN_RISOLUZIONE').length; },
    get nChiuse()        { return this.lista.filter(nc => nc.stato_risoluzione === 'CHIUSA').length; },

    // ── Lifecycle ─────────────────────────────────────────────────────────────

    init() {
      this._cantiereId = Alpine.store('cantiere')?.id;
      this.caricaDati();
    },

    aggiornaSeCantiereRicambia() {
      const id = Alpine.store('cantiere')?.id;
      if (id !== this._cantiereId) {
        this._cantiereId = id;
        if (this.drawerAperto) this.chiudiDrawer(true);
        this.caricaDati();
      }
    },

    async caricaDati() {
      this.caricamento = true;
      const cantId = this._cantiereId;
      if (!cantId) {
        this.lista   = [];
        this.imprese = [];
        this.caricamento = false;
        return;
      }
      try {
        if (!ANAGRAFICA_SERVICE.isCaricato || ANAGRAFICA_SERVICE.cantiereId !== cantId) {
          await ANAGRAFICA_SERVICE.carica(cantId);
        }
        this.imprese = [...(ANAGRAFICA_SERVICE.get('imprese') ?? [])];
        this.lista   = await NC_SERVICE.leggiNC(cantId);
      } catch (err) {
        ERRORI.gestisciErrore('non-conformita/carica', err);
        this.lista = [];
      } finally {
        this.caricamento = false;
      }
    },

    // ── Drawer ────────────────────────────────────────────────────────────────

    nuovaNC() {
      this.formDati  = NC_SERVICE.creaNCVuota(this._cantiereId);
      this.formNuova = true;
      this.modificatoDopoCaricamento = false;
      this.drawerAperto = true;
      this.$nextTick(() => document.getElementById('nc-descrizione')?.focus());
    },

    modificaNC(nc) {
      this.formDati  = JSON.parse(JSON.stringify(nc));
      this.formNuova = false;
      this.modificatoDopoCaricamento = false;
      this.drawerAperto = true;
      this.$nextTick(() => document.getElementById('nc-descrizione')?.focus());
    },

    chiudiDrawer(forza = false) {
      if (!forza && this.modificatoDopoCaricamento) {
        if (!confirm('Ci sono modifiche non salvate. Chiudere senza salvare?')) return;
      }
      this.drawerAperto = false;
      this.formDati = {};
    },

    async salvaNC() {
      if (!this.formDati.descrizione?.trim()) {
        NOTIFICHE.attenzione('NC', 'La descrizione è necessaria.');
        document.getElementById('nc-descrizione')?.focus();
        return;
      }
      this.salvando = true;
      try {
        if (this.formNuova) {
          await NC_SERVICE.creaNC(this.formDati);
          NOTIFICHE.successo('Non Conformità creata');
        } else {
          await NC_SERVICE.aggiornaNC(this.formDati);
          NOTIFICHE.successo('Non Conformità aggiornata');
        }
        await this.caricaDati();
        this.chiudiDrawer(true);
      } catch (err) {
        ERRORI.gestisciErrore('non-conformita/salva', err);
      } finally {
        this.salvando = false;
      }
    },

    // ── Cambia stato ──────────────────────────────────────────────────────────

    async cambiaStato(nc, nuovoStato) {
      if (nuovoStato === 'CHIUSA') {
        if (!confirm('Chiudere questa non conformità come risolta?')) return;
      }
      try {
        const aggiornata = await NC_SERVICE.cambiaStatoRisoluzione(nc, nuovoStato);
        // Aggiorna in-place: evita ricarica completa per operazione frequente
        const idx = this.lista.findIndex(n => n.id === nc.id);
        if (idx >= 0) this.lista[idx] = aggiornata;
        this.lista = [...this.lista];
      } catch (err) {
        ERRORI.gestisciErrore('non-conformita/cambia-stato', err);
      }
    },

    // ── Cestina ───────────────────────────────────────────────────────────────

    async cestinaNC(nc) {
      if (!confirm('Spostare questa non conformità nel cestino?')) return;
      try {
        const root     = FILESYSTEM.getHandleAttivo();
        const cantId   = nc.cantiere_id;
        const tombstone = { ...nc, _cestino: true, _eliminato_il: new Date().toISOString() };
        // Scrivi il tombstone in tutte le cartelle NC dove il file esiste
        // (gestisce sia v2 con file in Aperte/ sia legacy v1 con file altrove)
        for (const nomeSub of ['Aperte', 'In-Risoluzione', 'Chiuse']) {
          try {
            const dir = await FILESYSTEM.navigaPercorso(
              await root.getDirectoryHandle(cantId),
              ['05_Non-Conformita', nomeSub], false
            );
            try {
              await dir.getFileHandle(`${nc.id}.json`);   // verifica se esiste
              await FILESYSTEM.scriviJson(dir, `${nc.id}.json`, tombstone);
            } catch (e) {
              if (e.name !== 'NotFoundError') throw e;
            }
          } catch (e) {
            if (e.name !== 'NotFoundError') console.warn('cestinaNC:', e);
          }
        }
        this.lista = this.lista.filter(n => n.id !== nc.id);
        NOTIFICHE.info('Non conformità spostata nel cestino');
      } catch (err) {
        ERRORI.gestisciErrore('non-conformita/cestina', err);
      }
    },

    // ── Helper UI ─────────────────────────────────────────────────────────────

    nomeImpresa(impresaId) {
      if (!impresaId) return null;
      return this.imprese.find(i => i.id === impresaId)?.ragioneSociale ?? null;
    },

    livelloLabel(l) { return { lieve:'Lieve', grave:'Grave', gravissima:'Gravissima' }[l] ?? l; },

    livelloCls(l) {
      if (l === 'gravissima') return 'bg-red-100 text-red-800 font-semibold';
      if (l === 'grave')      return 'bg-orange-100 text-orange-800';
      return 'bg-amber-50 text-amber-700';
    },

    _imprese() { return this.imprese; },
  };
}

// ── Template HTML ─────────────────────────────────────────────────────────────

const _TEMPLATE_NC = `
<div x-data="NonConformita()" x-init="init()" x-effect="aggiornaSeCantiereRicambia()"
     class="max-w-4xl">

  <!-- === HEADER === -->
  <div class="flex items-center justify-between mb-5">
    <div>
      <h1 class="text-xl font-semibold text-slate-800">⚠ Non Conformità</h1>
      <p class="text-xs text-slate-400 mt-0.5"
         x-text="lista.length + ' NC · ' + nAperte + ' aperte · ' + nInRisoluzione + ' in risoluzione · ' + nChiuse + ' chiuse'">
      </p>
    </div>
    <button @click="nuovaNC()" x-show="$store.cantiere.id"
            class="bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium
                   px-4 py-2 rounded-lg transition-colors
                   focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2">
      + Nuova NC
    </button>
  </div>

  <!-- Nessun cantiere -->
  <div x-show="!$store.cantiere.id" class="placeholder-modulo">
    <div class="text-3xl" aria-hidden="true">⚠</div>
    <p class="text-slate-500">Seleziona un cantiere per gestire le non conformità.</p>
  </div>

  <div x-show="$store.cantiere.id">

    <!-- Caricamento -->
    <div x-show="caricamento" class="flex items-center gap-3 py-10 text-slate-400 text-sm">
      <div class="w-5 h-5 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
      Caricamento…
    </div>

    <div x-show="!caricamento">

      <!-- === TAB STATO === -->
      <div class="flex gap-1 mb-4 border-b border-slate-200" role="tablist" aria-label="Filtra per stato">

        <button @click="filtroStato = 'APERTA'" role="tab"
                :aria-selected="filtroStato === 'APERTA'"
                :class="filtroStato === 'APERTA'
                  ? 'border-b-2 border-red-500 text-red-700 font-semibold'
                  : 'text-slate-500 hover:text-slate-800'"
                class="px-4 py-2 text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-red-400 focus:ring-offset-1 rounded-t">
          Aperte
          <span x-show="nAperte > 0"
                class="ml-1.5 inline-flex items-center justify-center w-5 h-5 rounded-full text-xs font-bold bg-red-100 text-red-700"
                x-text="nAperte"></span>
        </button>

        <button @click="filtroStato = 'IN_RISOLUZIONE'" role="tab"
                :aria-selected="filtroStato === 'IN_RISOLUZIONE'"
                :class="filtroStato === 'IN_RISOLUZIONE'
                  ? 'border-b-2 border-amber-500 text-amber-700 font-semibold'
                  : 'text-slate-500 hover:text-slate-800'"
                class="px-4 py-2 text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-amber-400 focus:ring-offset-1 rounded-t">
          In risoluzione
          <span x-show="nInRisoluzione > 0"
                class="ml-1.5 inline-flex items-center justify-center w-5 h-5 rounded-full text-xs font-bold bg-amber-100 text-amber-700"
                x-text="nInRisoluzione"></span>
        </button>

        <button @click="filtroStato = 'CHIUSA'" role="tab"
                :aria-selected="filtroStato === 'CHIUSA'"
                :class="filtroStato === 'CHIUSA'
                  ? 'border-b-2 border-green-500 text-green-700 font-semibold'
                  : 'text-slate-500 hover:text-slate-800'"
                class="px-4 py-2 text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-green-400 focus:ring-offset-1 rounded-t">
          Chiuse
          <span x-show="nChiuse > 0"
                class="ml-1.5 inline-flex items-center justify-center w-5 h-5 rounded-full text-xs font-bold bg-green-100 text-green-700"
                x-text="nChiuse"></span>
        </button>

      </div>

      <!-- === LISTA NC === -->
      <div role="list" aria-label="Non conformità" class="space-y-2">

        <!-- Elenco vuoto -->
        <div x-show="listaFiltrata.length === 0"
             class="py-12 text-center text-slate-400">
          <div class="text-3xl mb-2" aria-hidden="true">✓</div>
          <p x-show="filtroStato === 'APERTA'">Nessuna non conformità aperta.</p>
          <p x-show="filtroStato === 'IN_RISOLUZIONE'">Nessuna non conformità in risoluzione.</p>
          <p x-show="filtroStato === 'CHIUSA'">Nessuna non conformità chiusa.</p>
        </div>

        <template x-for="nc in listaFiltrata" :key="nc.id">
          <div role="listitem"
               class="border border-slate-200 bg-white rounded-xl px-4 py-3 space-y-2
                      hover:border-slate-300 transition-all">

            <!-- Riga 1: badge livello + descrizione -->
            <div class="flex items-start gap-2">
              <span :class="livelloCls(nc.livello)"
                    class="flex-shrink-0 text-xs px-2 py-0.5 rounded-full mt-0.5"
                    x-text="livelloLabel(nc.livello)"></span>
              <p class="text-sm font-medium text-slate-800 leading-snug"
                 x-text="nc.descrizione || '(nessuna descrizione)'"></p>
            </div>

            <!-- Riga 2: impresa + date -->
            <div class="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">

              <!-- Impresa -->
              <template x-if="nomeImpresa(nc.impresa_id)">
                <span class="bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full"
                      x-text="nomeImpresa(nc.impresa_id)"></span>
              </template>
              <template x-if="!nc.impresa_id">
                <span class="bg-amber-50 text-amber-700 px-2 py-0.5 rounded-full font-medium">
                  ⚠ impresa da assegnare
                </span>
              </template>

              <!-- Data rilevazione -->
              <span x-show="nc.data_rilevazione"
                    x-text="'Rilevata: ' + UTILS.formatData(nc.data_rilevazione)"></span>

              <!-- Scadenza risoluzione (senza semaforo — pezzo d) -->
              <span x-show="nc.scadenza_risoluzione"
                    class="font-medium"
                    :class="UTILS.giorniAllaScadenza(nc.scadenza_risoluzione) !== null && UTILS.giorniAllaScadenza(nc.scadenza_risoluzione) < 0
                            ? 'text-red-600' : 'text-slate-500'"
                    x-text="'Scad. risoluzione: ' + UTILS.formatData(nc.scadenza_risoluzione)"></span>

              <!-- Origine -->
              <span x-show="nc.origine === 'da_verbale_sopralluogo'"
                    class="text-slate-400 italic">da verbale</span>
            </div>

            <!-- Riga 3: azioni -->
            <div class="flex flex-wrap items-center gap-2 pt-1">

              <!-- Transizioni stato (dipendono dal tab attivo) -->
              <template x-if="nc.stato_risoluzione === 'APERTA'">
                <button @click="cambiaStato(nc, 'IN_RISOLUZIONE')"
                        class="text-xs text-amber-700 bg-amber-50 border border-amber-200
                               px-2.5 py-1 rounded-lg hover:bg-amber-100 transition-colors
                               focus:outline-none focus:ring-2 focus:ring-amber-400">
                  → In risoluzione
                </button>
              </template>

              <template x-if="nc.stato_risoluzione === 'IN_RISOLUZIONE'">
                <span class="flex gap-2">
                  <button @click="cambiaStato(nc, 'APERTA')"
                          class="text-xs text-slate-600 bg-slate-50 border border-slate-200
                                 px-2.5 py-1 rounded-lg hover:bg-slate-100 transition-colors
                                 focus:outline-none focus:ring-2 focus:ring-slate-400">
                    ← Riapri
                  </button>
                  <button @click="cambiaStato(nc, 'CHIUSA')"
                          class="text-xs text-green-700 bg-green-50 border border-green-200
                                 px-2.5 py-1 rounded-lg hover:bg-green-100 transition-colors
                                 focus:outline-none focus:ring-2 focus:ring-green-400">
                    ✓ Chiudi
                  </button>
                </span>
              </template>

              <template x-if="nc.stato_risoluzione === 'CHIUSA'">
                <button @click="cambiaStato(nc, 'IN_RISOLUZIONE')"
                        class="text-xs text-slate-600 bg-slate-50 border border-slate-200
                               px-2.5 py-1 rounded-lg hover:bg-slate-100 transition-colors
                               focus:outline-none focus:ring-2 focus:ring-slate-400">
                  ↩ Riapri
                </button>
              </template>

              <!-- Modifica -->
              <button @click="modificaNC(nc)"
                      class="text-xs text-slate-600 hover:text-slate-900 px-2.5 py-1
                             border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors
                             focus:outline-none focus:ring-2 focus:ring-slate-400"
                      :aria-label="'Modifica NC: ' + (nc.descrizione || nc.id)">
                ✏ Modifica
              </button>

              <!-- Cestina -->
              <button @click="cestinaNC(nc)"
                      class="text-xs text-red-400 hover:text-red-700 px-2 py-1
                             rounded-lg hover:bg-red-50 transition-colors ml-auto
                             focus:outline-none focus:ring-2 focus:ring-red-400"
                      title="Sposta nel cestino">🗑</button>
            </div>

          </div>
        </template>
      </div>

    </div><!-- /!caricamento -->
  </div><!-- /$store.cantiere.id -->


  <!-- ═══════════════════════════════════════════════════════════════
       DRAWER: Editor NC — posizione fixed right, 40% width.
       ═══════════════════════════════════════════════════════════════ -->
  <div x-show="drawerAperto" x-cloak
       class="drawer-backdrop"
       @click="chiudiDrawer(false)"
       aria-hidden="true"></div>

  <div x-show="drawerAperto" x-cloak
       @input="modificatoDopoCaricamento = true"
       @keydown.escape.window="chiudiDrawer(false)"
       class="drawer"
       role="dialog" aria-modal="true" aria-label="Editor non conformità">

    <!-- header fisso -->
    <div class="drawer-header flex items-center justify-between px-5 py-4 border-b border-slate-200 bg-white">
      <h2 class="text-base font-semibold text-slate-800"
          x-text="formNuova ? 'Nuova non conformità' : 'Modifica non conformità'"></h2>
      <button @click="chiudiDrawer(false)" aria-label="Chiudi"
              class="p-1.5 rounded hover:bg-slate-100 text-slate-500 text-lg
                     focus:outline-none focus:ring-2 focus:ring-slate-400">✕</button>
    </div>

    <!-- corpo scrollabile -->
    <div class="drawer-body px-5 py-4 space-y-4">

      <!-- Descrizione -->
      <div>
        <label for="nc-descrizione" class="block text-xs font-medium text-slate-700 mb-1">
          Descrizione <span class="text-red-500">*</span>
        </label>
        <textarea id="nc-descrizione" rows="3"
                  x-model="formDati.descrizione"
                  placeholder="Descrivi la non conformità rilevata…"
                  class="w-full border border-slate-300 rounded-md px-3 py-2 text-sm resize-none
                         focus:outline-none focus:ring-2 focus:ring-blue-500
                         placeholder:text-slate-400"></textarea>
      </div>

      <!-- Livello + Data rilevazione -->
      <div class="grid grid-cols-2 gap-3">
        <div>
          <label for="nc-livello" class="block text-xs font-medium text-slate-700 mb-1">Livello</label>
          <select id="nc-livello" x-model="formDati.livello"
                  class="w-full border border-slate-300 rounded-md px-3 py-2 text-sm
                         focus:outline-none focus:ring-2 focus:ring-blue-500">
            <option value="lieve">Lieve</option>
            <option value="grave">Grave</option>
            <option value="gravissima">Gravissima</option>
          </select>
        </div>
        <div>
          <label for="nc-data-rile" class="block text-xs font-medium text-slate-700 mb-1">Data rilevazione</label>
          <input id="nc-data-rile" type="date" x-model="formDati.data_rilevazione"
                 class="w-full border border-slate-300 rounded-md px-3 py-2 text-sm
                        focus:outline-none focus:ring-2 focus:ring-blue-500">
        </div>
      </div>

      <!-- Impresa (facoltativa) -->
      <div>
        <label for="nc-impresa" class="block text-xs font-medium text-slate-700 mb-1">
          Impresa <span class="text-slate-400 font-normal">(facoltativa)</span>
        </label>
        <select id="nc-impresa" x-model="formDati.impresa_id"
                class="w-full border border-slate-300 rounded-md px-3 py-2 text-sm
                       focus:outline-none focus:ring-2 focus:ring-blue-500">
          <option value="">— Nessuna impresa assegnata —</option>
          <template x-for="imp in _imprese()" :key="imp.id">
            <option :value="imp.id" x-text="imp.ragioneSociale"></option>
          </template>
        </select>
        <p x-show="!formDati.impresa_id"
           class="mt-1 text-xs text-slate-400">
          Senza impresa la NC è valida — potrai assegnarla in seguito.
        </p>
      </div>

      <!-- Scadenza risoluzione -->
      <div>
        <label for="nc-scadenza" class="block text-xs font-medium text-slate-700 mb-1">
          Scadenza risoluzione <span class="text-slate-400 font-normal">(opzionale)</span>
        </label>
        <input id="nc-scadenza" type="date" x-model="formDati.scadenza_risoluzione"
               class="w-full border border-slate-300 rounded-md px-3 py-2 text-sm
                      focus:outline-none focus:ring-2 focus:ring-blue-500">
      </div>

      <!-- Note -->
      <div>
        <label for="nc-note" class="block text-xs font-medium text-slate-700 mb-1">Note</label>
        <textarea id="nc-note" rows="3"
                  x-model="formDati.note"
                  placeholder="Note aggiuntive…"
                  class="w-full border border-slate-300 rounded-md px-3 py-2 text-sm resize-none
                         focus:outline-none focus:ring-2 focus:ring-blue-500
                         placeholder:text-slate-400"></textarea>
      </div>

      <!-- Stato risoluzione (visibile solo in modifica) -->
      <div x-show="!formNuova"
           class="rounded-xl border border-slate-200 p-3 bg-slate-50">
        <p class="text-xs font-medium text-slate-600 mb-2">Stato risoluzione</p>
        <div class="flex gap-2">
          <template x-for="[val, label, cls] in [
            ['APERTA',         'Aperta',        'border-red-300 text-red-700 bg-red-50'],
            ['IN_RISOLUZIONE', 'In risoluzione', 'border-amber-300 text-amber-700 bg-amber-50'],
            ['CHIUSA',         'Chiusa',         'border-green-300 text-green-700 bg-green-50']
          ]" :key="val">
            <button type="button"
                    @click="formDati.stato_risoluzione = val; modificatoDopoCaricamento = true"
                    :class="formDati.stato_risoluzione === val
                      ? cls + ' font-semibold ring-1 ring-offset-1'
                      : 'border-slate-200 text-slate-500 bg-white hover:bg-slate-100'"
                    class="flex-1 px-2 py-1.5 rounded-lg border text-xs transition-all
                           focus:outline-none focus:ring-2 focus:ring-slate-400"
                    x-text="label"></button>
          </template>
        </div>
        <p class="mt-2 text-xs text-slate-400">
          Cambiare lo stato qui e salvare ha lo stesso effetto dei pulsanti in elenco.
        </p>
      </div>

    </div><!-- /corpo -->

    <!-- footer fisso -->
    <div class="drawer-footer px-5 py-4 border-t border-slate-200 bg-slate-50">
      <p class="text-xs text-slate-400 mb-3">
        Il salvataggio non è mai bloccato. I campi mancanti generano avvisi, non errori.
      </p>
      <div class="flex gap-3 justify-end">
        <button @click="chiudiDrawer(false)"
                class="text-sm text-slate-500 hover:text-slate-700 px-4 py-2
                       border border-slate-300 rounded-lg transition-colors
                       focus:outline-none focus:ring-2 focus:ring-slate-400">
          Annulla
        </button>
        <button @click="salvaNC()" :disabled="salvando"
                class="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white
                       text-sm font-medium px-5 py-2 rounded-lg transition-colors
                       focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2">
          <span x-text="salvando ? 'Salvataggio…' : (formNuova ? 'Crea NC' : 'Salva modifiche')"></span>
        </button>
      </div>
    </div>

  </div><!-- /drawer -->

</div>
`;

// ── Registrazione ─────────────────────────────────────────────────────────────

window.MODULI_REGISTRATI = window.MODULI_REGISTRATI ?? {};
window.MODULI_REGISTRATI['non-conformita'] = {
  monta(contenitore) { contenitore.innerHTML = _TEMPLATE_NC; },
};
