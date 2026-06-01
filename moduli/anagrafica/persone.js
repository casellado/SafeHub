/**
 * persone.js — M4 Fase 5: collezioni Persone Committente e Persone Terzi.
 *
 * Due registrazioni separate (nav ha due voci distinte):
 *   MODULI_REGISTRATI['personale-sicurezza'] → persone_committente (stazione appaltante)
 *   MODULI_REGISTRATI['enti-terzi']          → persone_terzi (ASL, INL, VVF, ...)
 *
 * Nessun impresa_id. Nessuna scadenza. Nessuna conformità.
 * Sono cartellini contatto — pattern cruscotto/soft-delete riutilizzato.
 *
 * Le persone_committente alimentano i <select> dei ruoli istituzionali
 * in M3 SchedaCantiere (aggancio completato in questa fase).
 */

// ── Utilità condivisa ─────────────────────────────────────────────────────────

function _factory(nomeCollezione, titolo, icona) {
  return {
    persone:      [],
    caricamento:  true,
    cerca:        '',
    mostraCestino: false,

    drawerAperto: false,
    formDati:     {},
    nuova:        true,
    salvando:     false,
    modDati:      false,

    _cantiereId: null,

    get personeFiltrate() {
      const t = this.cerca.toLowerCase();
      return this.persone.filter(p => !p._cestino)
        .filter(p => !t || [p.nome, p.cognome, p.qualifica, p.ruolo, p.ente]
          .some(v => v?.toLowerCase().includes(t)));
    },
    get personeCestino() { return this.persone.filter(p => p._cestino); },

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
        if (!id) { this.persone = []; this.caricamento = false; return; }
        this.caricamento = true;
        if (ANAGRAFICA_SERVICE.cantiereId === id) { this.caricaDati(); }
        else { document.addEventListener('anagrafica-caricata', (e) => { if (e.detail?.cantiereId === id) this.caricaDati(); }, { once: true }); }
      }
    },

    caricaDati() {
      this.persone      = [...(ANAGRAFICA_SERVICE.get(nomeCollezione, { inclCestino: true }) ?? [])];
      this.caricamento  = false;
    },

    nuovaPersona() {
      this.formDati = ANAGRAFICA_SERVICE.creaEntitaVuota(nomeCollezione);
      this.nuova = true; this.modDati = false; this.drawerAperto = true;
      this.$nextTick(() => document.getElementById('pers-cognome')?.focus());
    },

    modificaPersona(id) {
      const p = this.persone.find(x => x.id === id);
      if (!p) return;
      this.formDati = JSON.parse(JSON.stringify(p));
      this.nuova = false; this.modDati = false; this.drawerAperto = true;
    },

    chiudiDrawer(forza = false) {
      if (!forza && this.modDati && !confirm('Modifiche non salvate. Chiudere?')) return;
      this.drawerAperto = false; this.formDati = {};
    },

    async salvaPersona() {
      this.salvando = true;
      try {
        if (this.nuova) await ANAGRAFICA_SERVICE.aggiungi(nomeCollezione, this.formDati);
        else            await ANAGRAFICA_SERVICE.aggiorna(nomeCollezione, this.formDati.id, this.formDati);
        this.caricaDati();
        this.chiudiDrawer(true);
        NOTIFICHE.successo(this.nuova ? 'Persona aggiunta' : 'Persona aggiornata');
      } catch (err) { ERRORI.gestisciErrore(nomeCollezione + '/salva', err); }
      finally { this.salvando = false; }
    },

    async cestinaPersona(id) {
      try { await ANAGRAFICA_SERVICE.cestina(nomeCollezione, id); this.caricaDati(); NOTIFICHE.info('Spostato nel cestino'); }
      catch (err) { ERRORI.gestisciErrore(nomeCollezione + '/cestina', err); }
    },
    async ripristinaPersona(id) {
      try { await ANAGRAFICA_SERVICE.ripristina(nomeCollezione, id); this.caricaDati(); NOTIFICHE.successo('Ripristinato'); }
      catch (err) { ERRORI.gestisciErrore(nomeCollezione + '/ripristina', err); }
    },
    async eliminaPersona(id) {
      if (!confirm('Eliminare definitivamente?')) return;
      try { await ANAGRAFICA_SERVICE.eliminaDefinitivamente(nomeCollezione, id); this.caricaDati(); }
      catch (err) { ERRORI.gestisciErrore(nomeCollezione + '/elimina', err); }
    },

    // Extra: espone le costanti al template (inaccessibili direttamente da Alpine)
    _ruoli()    { return ANAGRAFICA_SERVICE.RUOLI_PERSONE_COMMITTENTE; },
    _tipiEnte() { return ANAGRAFICA_SERVICE.TIPI_ENTE_TERZI; },
    _titolo()   { return titolo; },
    _icona()    { return icona; },
    _nome()     { return nomeCollezione; },
  };
}

// ── Funzioni factory pubbliche ────────────────────────────────────────────────

function ListaPersoneCommittente() { return _factory('persone_committente', 'Personale Committente', '👤'); }
function ListaPersoneTerzi()        { return _factory('persone_terzi',       'Enti Terzi',            '🏛'); }

// ── Template: Persone Committente ─────────────────────────────────────────────

const _TEMPLATE_PC = `
<div x-data="ListaPersoneCommittente()" x-init="init()" x-effect="aggiornaSeCantiereRicambia()" class="max-w-4xl">

  <div class="flex items-center justify-between mb-5">
    <h1 class="text-xl font-semibold text-slate-800">👤 Personale Committente</h1>
    <button @click="nuovaPersona()" x-show="$store.cantiere.id"
            class="bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2">
      + Nuova persona
    </button>
  </div>

  <div x-show="!$store.cantiere.id" class="placeholder-modulo">
    <div class="text-3xl" aria-hidden="true">👤</div>
    <p class="text-slate-500">Seleziona un cantiere per gestire il personale committente.</p>
  </div>

  <div x-show="$store.cantiere.id">
    <div x-show="caricamento" class="flex items-center gap-3 py-10 text-slate-400 text-sm">
      <div class="w-5 h-5 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"></div>Caricamento…
    </div>

    <div x-show="!caricamento">
      <div class="mb-4">
        <input type="search" x-model="cerca" placeholder="Cerca nome, qualifica, ruolo…"
               class="w-full max-w-sm border border-slate-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
      </div>

      <div role="list" class="space-y-2">
        <div x-show="personeFiltrate.length === 0" class="py-10 text-center text-slate-400">
          <div class="text-3xl mb-2" aria-hidden="true">👤</div>
          <p x-show="!cerca">Nessuna persona. Clicca "+ Nuova persona" per iniziare.</p>
          <p x-show="cerca">Nessuna persona corrisponde alla ricerca.</p>
        </div>
        <template x-for="p in personeFiltrate" :key="p.id">
          <div role="listitem" class="border border-slate-200 bg-white hover:border-slate-300 rounded-xl px-4 py-3 flex items-center gap-4 transition-all">
            <div class="flex-1 min-w-0">
              <div class="flex items-center gap-2 flex-wrap">
                <span class="font-medium text-slate-800" x-text="[p.cognome,p.nome].filter(Boolean).join(' ') || '(senza nome)'"></span>
                <span x-show="p.ruolo" class="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full flex-shrink-0"
                      x-text="(_ruoli().find(r=>r.valore===p.ruolo)?.etichetta ?? p.ruolo)"></span>
              </div>
              <p x-show="p.qualifica || p.strutturaTerritoriale" class="text-xs text-slate-400 mt-0.5"
                 x-text="[p.qualifica, p.strutturaTerritoriale].filter(Boolean).join(' · ')"></p>
              <p x-show="p.email || p.telefono" class="text-xs text-slate-400"
                 x-text="[p.email, p.telefono].filter(Boolean).join(' · ')"></p>
            </div>
            <div class="flex gap-2 flex-shrink-0">
              <button @click="modificaPersona(p.id)" class="text-sm text-slate-600 hover:text-slate-900 px-3 py-1.5 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors focus:outline-none focus:ring-2 focus:ring-slate-400">✏ Modifica</button>
              <button @click="cestinaPersona(p.id)" class="text-sm text-red-400 hover:text-red-700 px-2 py-1.5 rounded-lg hover:bg-red-50 transition-colors focus:outline-none focus:ring-2 focus:ring-red-400" title="Cestina">🗑</button>
            </div>
          </div>
        </template>
      </div>

      <div class="mt-6">
        <button @click="mostraCestino = !mostraCestino" class="text-xs text-slate-400 hover:text-slate-600 underline focus:outline-none focus:ring-2 focus:ring-slate-400 rounded">
          <span x-text="(mostraCestino?'▾ Nascondi':'▸ Mostra') + ' cestino (' + personeCestino.length + ')'"></span>
        </button>
        <div x-show="mostraCestino && personeCestino.length > 0" class="mt-3 space-y-2">
          <template x-for="p in personeCestino" :key="p.id">
            <div class="border border-slate-200 bg-slate-50 rounded-xl px-4 py-3 flex items-center gap-4 opacity-60 hover:opacity-80">
              <div class="flex-1 min-w-0">
                <span class="text-sm text-slate-600 line-through" x-text="[p.cognome,p.nome].filter(Boolean).join(' ') || '(senza nome)'"></span>
                <p class="text-xs text-slate-400" x-text="'Eliminato il ' + UTILS.formatData(p._eliminato_il)"></p>
              </div>
              <div class="flex gap-2">
                <button @click="ripristinaPersona(p.id)" class="text-xs text-green-700 px-2 py-1 border border-green-300 rounded-lg hover:bg-green-50 focus:outline-none focus:ring-2 focus:ring-green-400">↩ Ripristina</button>
                <button @click="eliminaPersona(p.id)" class="text-xs text-red-500 px-2 py-1 rounded-lg hover:bg-red-50 focus:outline-none focus:ring-2 focus:ring-red-400">Elimina def.</button>
              </div>
            </div>
          </template>
        </div>
      </div>
    </div>
  </div>

  <!-- Drawer -->
  <div x-show="drawerAperto" x-cloak class="drawer-backdrop" @click="chiudiDrawer(false)" aria-hidden="true"></div>
  <div x-show="drawerAperto" x-cloak @input="modDati=true" @keydown.escape.window="chiudiDrawer(false)"
       class="drawer" role="dialog" aria-modal="true" aria-label="Editor persona committente">

    <div class="drawer-header flex items-center justify-between px-5 py-4 border-b border-slate-200 bg-white">
      <h2 class="text-base font-semibold text-slate-800">
        <span x-text="nuova ? 'Nuova persona committente' : ([formDati.cognome,formDati.nome].filter(Boolean).join(' ')||'Modifica')"></span>
      </h2>
      <button @click="chiudiDrawer(false)" aria-label="Chiudi" class="p-1.5 rounded hover:bg-slate-100 text-slate-500 text-lg focus:outline-none focus:ring-2 focus:ring-slate-400">✕</button>
    </div>

    <div class="drawer-body px-5 py-4 space-y-3">

      <details open class="border border-slate-200 rounded-xl overflow-hidden">
        <summary class="px-4 py-3 bg-slate-50 cursor-pointer text-sm font-medium text-slate-700 hover:bg-slate-100 list-none flex items-center justify-between">
          Identificazione <span class="text-slate-400 text-xs" aria-hidden="true">▾</span>
        </summary>
        <div class="p-4 grid gap-3 sm:grid-cols-2">
          <div>
            <label for="pers-cognome" class="block text-xs font-medium text-slate-600 mb-1">Cognome</label>
            <input id="pers-cognome" type="text" x-model="formDati.cognome" placeholder="ROSSI"
                   class="w-full border border-slate-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
          </div>
          <div>
            <label for="pers-nome" class="block text-xs font-medium text-slate-600 mb-1">Nome</label>
            <input id="pers-nome" type="text" x-model="formDati.nome" placeholder="Mario"
                   class="w-full border border-slate-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
          </div>
          <div>
            <label for="pers-qualifica" class="block text-xs font-medium text-slate-600 mb-1">Qualifica</label>
            <input id="pers-qualifica" type="text" x-model="formDati.qualifica" placeholder="es. Ing., Arch., Geom."
                   class="w-full border border-slate-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
          </div>
          <div>
            <label for="pers-ruolo" class="block text-xs font-medium text-slate-600 mb-1">Ruolo istituzionale</label>
            <select id="pers-ruolo" x-model="formDati.ruolo"
                    class="w-full border border-slate-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
              <option value="">— Seleziona —</option>
              <template x-for="r in _ruoli()" :key="r.valore">
                <option :value="r.valore" x-text="r.etichetta"></option>
              </template>
            </select>
          </div>
        </div>
      </details>

      <details class="border border-slate-200 rounded-xl overflow-hidden">
        <summary class="px-4 py-3 bg-slate-50 cursor-pointer text-sm font-medium text-slate-700 hover:bg-slate-100 list-none flex items-center justify-between">
          Struttura <span class="text-slate-400 text-xs" aria-hidden="true">▾</span>
        </summary>
        <div class="p-4 grid gap-3 sm:grid-cols-2">
          <div>
            <label for="pers-matr" class="block text-xs font-medium text-slate-600 mb-1">Matricola / Tessera</label>
            <input id="pers-matr" type="text" x-model="formDati.matricola"
                   class="w-full border border-slate-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
          </div>
          <div>
            <label for="pers-strutt" class="block text-xs font-medium text-slate-600 mb-1">Struttura territoriale</label>
            <input id="pers-strutt" type="text" x-model="formDati.strutturaTerritoriale"
                   class="w-full border border-slate-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
          </div>
        </div>
      </details>

      <details class="border border-slate-200 rounded-xl overflow-hidden">
        <summary class="px-4 py-3 bg-slate-50 cursor-pointer text-sm font-medium text-slate-700 hover:bg-slate-100 list-none flex items-center justify-between">
          Contatti <span class="text-slate-400 text-xs" aria-hidden="true">▾</span>
        </summary>
        <div class="p-4 grid gap-3 sm:grid-cols-2">
          <div>
            <label for="pers-email" class="block text-xs font-medium text-slate-600 mb-1">Email</label>
            <input id="pers-email" type="email" x-model="formDati.email"
                   class="w-full border border-slate-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
          </div>
          <div>
            <label for="pers-tel" class="block text-xs font-medium text-slate-600 mb-1">Telefono</label>
            <input id="pers-tel" type="tel" x-model="formDati.telefono"
                   class="w-full border border-slate-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
          </div>
        </div>
      </details>
    </div>

    <div class="drawer-footer px-5 py-4 border-t border-slate-200 bg-slate-50">
      <p class="text-xs text-slate-400 mb-3">Il salvataggio non è mai bloccato.</p>
      <div class="flex gap-3 justify-end">
        <button @click="chiudiDrawer(false)" class="text-sm text-slate-500 hover:text-slate-700 px-4 py-2 border border-slate-300 rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-slate-400">Annulla</button>
        <button @click="salvaPersona()" :disabled="salvando"
                class="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-medium px-5 py-2 rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2">
          <span x-text="salvando ? 'Salvataggio…' : 'Salva'"></span>
        </button>
      </div>
    </div>
  </div>
</div>
`;

// ── Template: Enti Terzi ──────────────────────────────────────────────────────

const _TEMPLATE_PT = `
<div x-data="ListaPersoneTerzi()" x-init="init()" x-effect="aggiornaSeCantiereRicambia()" class="max-w-4xl">

  <div class="flex items-center justify-between mb-5">
    <h1 class="text-xl font-semibold text-slate-800">🏛 Enti Terzi</h1>
    <button @click="nuovaPersona()" x-show="$store.cantiere.id"
            class="bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2">
      + Nuovo contatto
    </button>
  </div>

  <div x-show="!$store.cantiere.id" class="placeholder-modulo">
    <div class="text-3xl" aria-hidden="true">🏛</div>
    <p class="text-slate-500">Seleziona un cantiere per gestire gli enti terzi.</p>
  </div>

  <div x-show="$store.cantiere.id">
    <div x-show="caricamento" class="flex items-center gap-3 py-10 text-slate-400 text-sm">
      <div class="w-5 h-5 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"></div>Caricamento…
    </div>

    <div x-show="!caricamento">
      <div class="mb-4">
        <input type="search" x-model="cerca" placeholder="Cerca nome, ente, tipo…"
               class="w-full max-w-sm border border-slate-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
      </div>

      <div role="list" class="space-y-2">
        <div x-show="personeFiltrate.length === 0" class="py-10 text-center text-slate-400">
          <div class="text-3xl mb-2" aria-hidden="true">🏛</div>
          <p x-show="!cerca">Nessun ente/contatto. Clicca "+ Nuovo contatto" per iniziare.</p>
          <p x-show="cerca">Nessun risultato corrisponde alla ricerca.</p>
        </div>
        <template x-for="p in personeFiltrate" :key="p.id">
          <div role="listitem" class="border border-slate-200 bg-white hover:border-slate-300 rounded-xl px-4 py-3 flex items-center gap-4 transition-all">
            <div class="flex-1 min-w-0">
              <div class="flex items-center gap-2 flex-wrap">
                <span class="font-medium text-slate-800" x-text="[p.cognome,p.nome].filter(Boolean).join(' ') || '(senza nome)'"></span>
                <span x-show="p.tipoEnte" class="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full flex-shrink-0"
                      x-text="(_tipiEnte().find(t=>t.valore===p.tipoEnte)?.etichetta ?? p.tipoEnte)"></span>
              </div>
              <p x-show="p.ente || p.qualifica" class="text-xs text-slate-400 mt-0.5"
                 x-text="[p.ente, p.qualifica].filter(Boolean).join(' · ')"></p>
              <p x-show="p.email || p.telefono" class="text-xs text-slate-400"
                 x-text="[p.email, p.telefono].filter(Boolean).join(' · ')"></p>
            </div>
            <div class="flex gap-2 flex-shrink-0">
              <button @click="modificaPersona(p.id)" class="text-sm text-slate-600 hover:text-slate-900 px-3 py-1.5 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors focus:outline-none focus:ring-2 focus:ring-slate-400">✏ Modifica</button>
              <button @click="cestinaPersona(p.id)" class="text-sm text-red-400 hover:text-red-700 px-2 py-1.5 rounded-lg hover:bg-red-50 transition-colors focus:outline-none focus:ring-2 focus:ring-red-400" title="Cestina">🗑</button>
            </div>
          </div>
        </template>
      </div>

      <div class="mt-6">
        <button @click="mostraCestino = !mostraCestino" class="text-xs text-slate-400 hover:text-slate-600 underline focus:outline-none focus:ring-2 focus:ring-slate-400 rounded">
          <span x-text="(mostraCestino?'▾ Nascondi':'▸ Mostra') + ' cestino (' + personeCestino.length + ')'"></span>
        </button>
        <div x-show="mostraCestino && personeCestino.length > 0" class="mt-3 space-y-2">
          <template x-for="p in personeCestino" :key="p.id">
            <div class="border border-slate-200 bg-slate-50 rounded-xl px-4 py-3 flex items-center gap-4 opacity-60 hover:opacity-80">
              <div class="flex-1 min-w-0">
                <span class="text-sm text-slate-600 line-through" x-text="[p.cognome,p.nome].filter(Boolean).join(' ') || '(senza nome)'"></span>
                <p class="text-xs text-slate-400" x-text="'Eliminato il ' + UTILS.formatData(p._eliminato_il)"></p>
              </div>
              <div class="flex gap-2">
                <button @click="ripristinaPersona(p.id)" class="text-xs text-green-700 px-2 py-1 border border-green-300 rounded-lg hover:bg-green-50 focus:outline-none focus:ring-2 focus:ring-green-400">↩ Ripristina</button>
                <button @click="eliminaPersona(p.id)" class="text-xs text-red-500 px-2 py-1 rounded-lg hover:bg-red-50 focus:outline-none focus:ring-2 focus:ring-red-400">Elimina def.</button>
              </div>
            </div>
          </template>
        </div>
      </div>
    </div>
  </div>

  <!-- Drawer -->
  <div x-show="drawerAperto" x-cloak class="drawer-backdrop" @click="chiudiDrawer(false)" aria-hidden="true"></div>
  <div x-show="drawerAperto" x-cloak @input="modDati=true" @keydown.escape.window="chiudiDrawer(false)"
       class="drawer" role="dialog" aria-modal="true" aria-label="Editor ente terzo">

    <div class="drawer-header flex items-center justify-between px-5 py-4 border-b border-slate-200 bg-white">
      <h2 class="text-base font-semibold text-slate-800">
        <span x-text="nuova ? 'Nuovo contatto ente terzo' : ([formDati.cognome,formDati.nome].filter(Boolean).join(' ')||'Modifica')"></span>
      </h2>
      <button @click="chiudiDrawer(false)" aria-label="Chiudi" class="p-1.5 rounded hover:bg-slate-100 text-slate-500 text-lg focus:outline-none focus:ring-2 focus:ring-slate-400">✕</button>
    </div>

    <div class="drawer-body px-5 py-4 space-y-3">

      <details open class="border border-slate-200 rounded-xl overflow-hidden">
        <summary class="px-4 py-3 bg-slate-50 cursor-pointer text-sm font-medium text-slate-700 hover:bg-slate-100 list-none flex items-center justify-between">
          Ente <span class="text-slate-400 text-xs" aria-hidden="true">▾</span>
        </summary>
        <div class="p-4 grid gap-3 sm:grid-cols-2">
          <div>
            <label for="ent-tipo" class="block text-xs font-medium text-slate-600 mb-1">Tipo ente</label>
            <select id="ent-tipo" x-model="formDati.tipoEnte"
                    class="w-full border border-slate-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
              <option value="">— Seleziona —</option>
              <template x-for="t in _tipiEnte()" :key="t.valore">
                <option :value="t.valore" x-text="t.etichetta"></option>
              </template>
            </select>
          </div>
          <div>
            <label for="ent-ente" class="block text-xs font-medium text-slate-600 mb-1">Nome ente / sede</label>
            <input id="ent-ente" type="text" x-model="formDati.ente"
                   placeholder="es. ASL CN2 — Alba"
                   class="w-full border border-slate-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
          </div>
        </div>
      </details>

      <details open class="border border-slate-200 rounded-xl overflow-hidden">
        <summary class="px-4 py-3 bg-slate-50 cursor-pointer text-sm font-medium text-slate-700 hover:bg-slate-100 list-none flex items-center justify-between">
          Referente <span class="text-slate-400 text-xs" aria-hidden="true">▾</span>
        </summary>
        <div class="p-4 grid gap-3 sm:grid-cols-2">
          <div>
            <label for="ent-cognome" class="block text-xs font-medium text-slate-600 mb-1">Cognome</label>
            <input id="ent-cognome" type="text" x-model="formDati.cognome" placeholder="VERDI"
                   class="w-full border border-slate-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
          </div>
          <div>
            <label for="ent-nome" class="block text-xs font-medium text-slate-600 mb-1">Nome</label>
            <input id="ent-nome" type="text" x-model="formDati.nome" placeholder="Luca"
                   class="w-full border border-slate-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
          </div>
          <div class="sm:col-span-2">
            <label for="ent-qualifica" class="block text-xs font-medium text-slate-600 mb-1">Qualifica / Funzione</label>
            <input id="ent-qualifica" type="text" x-model="formDati.qualifica"
                   placeholder="es. Medico del Lavoro, Ispettore"
                   class="w-full border border-slate-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
          </div>
          <div>
            <label for="ent-email" class="block text-xs font-medium text-slate-600 mb-1">Email</label>
            <input id="ent-email" type="email" x-model="formDati.email"
                   class="w-full border border-slate-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
          </div>
          <div>
            <label for="ent-tel" class="block text-xs font-medium text-slate-600 mb-1">Telefono</label>
            <input id="ent-tel" type="tel" x-model="formDati.telefono"
                   class="w-full border border-slate-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
          </div>
        </div>
      </details>
    </div>

    <div class="drawer-footer px-5 py-4 border-t border-slate-200 bg-slate-50">
      <p class="text-xs text-slate-400 mb-3">Il salvataggio non è mai bloccato.</p>
      <div class="flex gap-3 justify-end">
        <button @click="chiudiDrawer(false)" class="text-sm text-slate-500 hover:text-slate-700 px-4 py-2 border border-slate-300 rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-slate-400">Annulla</button>
        <button @click="salvaPersona()" :disabled="salvando"
                class="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-medium px-5 py-2 rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2">
          <span x-text="salvando ? 'Salvataggio…' : 'Salva'"></span>
        </button>
      </div>
    </div>
  </div>
</div>
`;

// ── Registrazioni ──────────────────────────────────────────────────────────

window.MODULI_REGISTRATI = window.MODULI_REGISTRATI ?? {};
window.MODULI_REGISTRATI['personale-sicurezza'] = {
  monta(contenitore) { contenitore.innerHTML = _TEMPLATE_PC; },
};
window.MODULI_REGISTRATI['enti-terzi'] = {
  monta(contenitore) { contenitore.innerHTML = _TEMPLATE_PT; },
};
