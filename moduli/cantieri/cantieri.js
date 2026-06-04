/**
 * cantieri.js — Modulo M3: Gestione Cantieri.
 *
 * Due viste registrate:
 *  - MODULI_REGISTRATI['cruscotto']          → Cruscotto: lista cantieri, vista d'ingresso
 *  - MODULI_REGISTRATI['anagrafica-cantiere'] → SchedaCantiere: editor dati del lotto corrente
 *
 * Dipende da CANTIERI_SERVICE (crea/aggiorna/archivia) e dagli store M1
 * ($store.cantiere per il lotto corrente, $store.cantieri per la lista).
 */

// ============================================================
// COMPONENTE: Cruscotto cantieri
// ============================================================

function Cruscotto() {
  return {
    filtro: 'attivi',       // 'attivi' | 'tutti'
    mostraForm: false,      // form "nuovo cantiere" visibile
    formId:     '',
    formNome:   '',
    erroreId:   null,       // messaggio errore inline sul campo ID
    creando:    false,

    get cantieriFiltrati() {
      const lista = Alpine.store('cantieri').lista;
      if (this.filtro === 'attivi')  return lista.filter(c => c.stato !== 'concluso-archiviato' && c.stato !== 'cestinato');
      if (this.filtro === 'cestino') return lista.filter(c => c.stato === 'cestinato');
      // 'tutti': esclude cestinati — quelli vivono nel cestino, non nella lista operativa
      return lista.filter(c => c.stato !== 'cestinato');
    },

    get nAttivi()    { return Alpine.store('cantieri').lista.filter(c => c.stato !== 'concluso-archiviato' && c.stato !== 'cestinato').length; },
    get nArchiviati(){ return Alpine.store('cantieri').lista.filter(c => c.stato === 'concluso-archiviato').length; },
    get nCestinati() { return Alpine.store('cantieri').lista.filter(c => c.stato === 'cestinato').length; },

    init() {
      // Il cruscotto ascolta i cambi di cantiere per aggiornare la UI (es. selezione evidenziata)
      document.addEventListener('cantiere-cambiato', () => { /* reactivity via $store */ });
    },

    // ---- Validazione ID in tempo reale ----

    validaId() {
      const id = this.formId.trim();
      if (!id)                              { this.erroreId = null; return; }
      if (!UTILS.isIdCantierValido(id))     { this.erroreId = 'Solo lettere, numeri e trattini. Min 2 caratteri.'; return; }
      const duplicato = Alpine.store('cantieri').lista.some(c => c.cantiere_id === id.toUpperCase());
      if (duplicato)                        { this.erroreId = 'Questo ID esiste già.'; return; }
      this.erroreId = null;
    },

    apriForm() {
      this.mostraForm = true;
      this.formId = '';
      this.formNome = '';
      this.erroreId = null;
      // focus sul campo ID dopo il render
      this.$nextTick(() => document.getElementById('nuovo-id')?.focus());
    },

    chiudiForm() {
      this.mostraForm = false;
      this.erroreId = null;
    },

    // ---- Creazione ----

    async confermaCrea() {
      const id   = UTILS.normalizzaIdCantiere(this.formId.trim());
      const nome = this.formNome.trim();

      // Validazione finale (id è l'unico blocco duro: è il nome cartella sul filesystem)
      if (!UTILS.isIdCantierValido(id)) {
        this.erroreId = 'ID non valido: solo lettere, numeri e trattini. Min 2 caratteri.';
        return;
      }
      const duplicato = Alpine.store('cantieri').lista.some(c => c.cantiere_id === id);
      if (duplicato) {
        this.erroreId = `L'ID "${id}" è già in uso.`;
        return;
      }
      if (!nome) {
        NOTIFICHE.attenzione('Nuovo cantiere', 'Inserisci una denominazione per riconoscere il cantiere.');
        document.getElementById('nuovo-nome')?.focus();
        return;
      }

      this.creando = true;
      try {
        await CANTIERI_SERVICE.crea(id, nome);
        await Alpine.store('cantieri').ricarica();

        // Seleziona automaticamente il nuovo cantiere
        const dati = Alpine.store('cantieri').lista.find(c => c.cantiere_id === id);
        await Alpine.store('cantiere').seleziona(id, dati ?? { nome, stato: 'attivo' });

        NOTIFICHE.successo(`Cantiere ${id} creato`, nome);
        this.chiudiForm();
      } catch (err) {
        ERRORI.gestisciErrore('cantieri/crea', err);
      } finally {
        this.creando = false;
      }
    },

    // ---- Selezione ----

    async seleziona(id, dati) {
      await Alpine.store('cantiere').seleziona(id, dati);
    },

    apriScheda() {
      window.navigaA('anagrafica-cantiere');
    },

    // ---- Cantiere fuori app ----

    async inizializza(id) {
      try {
        await CANTIERI_SERVICE.inizializzaCantiereFuoriApp(id);
        await Alpine.store('cantieri').ricarica();
        NOTIFICHE.successo(`Cantiere ${id} inizializzato`);
      } catch (err) {
        ERRORI.gestisciErrore('cantieri/inizializza', err);
      }
    },

    // ---- Riscansione ----

    async riscansiona() {
      const root = FILESYSTEM.getHandleAttivo();
      if (!root) { NOTIFICHE.attenzione('Riscansiona', 'Cartella non disponibile.'); return; }
      try {
        await IDB.rigeneraIndice(root);
        await Alpine.store('cantieri').ricarica();
        NOTIFICHE.successo('Riscansione completata');
      } catch (err) {
        ERRORI.gestisciErrore('cantieri/riscansiona', err);
      }
    },

    // ---- Helpers UI ----

    isCorrente(id) { return Alpine.store('cantiere').id === id; },

    formatData(iso) { return UTILS.formatDataOra(iso).slice(0, 10); },

    badgeStato(c) {
      if (!c.scaffold_completo)             return { label: 'Incompleto',  cls: 'bg-amber-100 text-amber-800' };
      if (c.stato === 'cestinato')          return { label: 'Nel cestino', cls: 'bg-red-100 text-red-600' };
      if (c.stato === 'concluso-archiviato')return { label: 'Archiviato',  cls: 'bg-slate-100 text-slate-500' };
      if (c.stato === 'sospeso')            return { label: 'Sospeso',     cls: 'bg-orange-100 text-orange-700' };
      return                                       { label: 'Attivo',      cls: 'bg-green-100 text-green-700' };
    },
  };
}

// ============================================================
// COMPONENTE: Scheda dati cantiere
// ============================================================

function SchedaCantiere() {
  return {
    id:                null,
    lotto:             {},
    personeCommittente: [],   // M4 F5: alimenta i <select> ruoli istituzionali
    caricamento:       true,
    salvando:          false,
    archiviando:       false,
    riattivando:       false,
    cestinando:        false,
    feedbackMsg:       null,
    confermaArchivia:  false,
    confermaRiattiva:  false,
    confermaCestina:   false,

    init() {
      this.id = Alpine.store('cantiere').id;
      if (this.id) this.caricaDati();
      else          this.caricamento = false;
    },

    // x-effect nella root div per reagire ai cambi di cantiere senza event listener
    aggiornaSeCambia() {
      const newId = Alpine.store('cantiere').id;
      if (newId && newId !== this.id) {
        this.id = newId;
        this.caricaDati();
      }
    },

    async caricaDati() {
      this.caricamento = true;
      this.confermaArchivia = false;
      this.confermaRiattiva = false;
      this.confermaCestina  = false;
      try {
        const anagrafica = await CANTIERI_SERVICE.leggiAnagrafica(this.id);
        // Copia profonda per editing locale (non muta il service)
        this.lotto = JSON.parse(JSON.stringify(anagrafica.lotto));
        // Garantisce che i sotto-oggetti esistano anche su anagrafica più vecchie
        this.lotto.ruoli_istituzionali ??= {};
        // M4 F5: leggo persone_committente dallo stesso file già aperto (zero overhead)
        // per alimentare i <select> dei ruoli istituzionali sotto.
        this.personeCommittente = (anagrafica.persone_committente ?? []).filter(p => !p._cestino);
        this.lotto.csp                 ??= {};
      } catch (err) {
        ERRORI.gestisciErrore('scheda-cantiere/carica', err);
        this.lotto = {};
      } finally {
        this.caricamento = false;
      }
    },

    async salva() {
      this.salvando = true;
      try {
        await CANTIERI_SERVICE.aggiornaDatiLotto(this.id, this.lotto);
        await Alpine.store('cantieri').ricarica();
        this.feedbackMsg = '✓ Dati salvati';
        setTimeout(() => { this.feedbackMsg = null; }, 3000);
        // Aggiorna il nome nel selettore se è cambiato
        const dati = Alpine.store('cantieri').lista.find(c => c.cantiere_id === this.id);
        if (dati) await Alpine.store('cantiere').seleziona(this.id, dati);
      } catch (err) {
        ERRORI.gestisciErrore('scheda-cantiere/salva', err);
      } finally {
        this.salvando = false;
      }
    },

    async confermaSospendi() {
      this.lotto.stato = 'sospeso';
      await this.salva();
    },

    async confermaArchiviaFn() {
      this.archiviando = true;
      try {
        await CANTIERI_SERVICE.aggiornaDatiLotto(this.id, { ...this.lotto, stato: 'concluso-archiviato' });
        await Alpine.store('cantieri').ricarica();
        this.lotto.stato = 'concluso-archiviato';
        this.confermaArchivia = false;
        NOTIFICHE.successo(`Cantiere ${this.id} archiviato`);
        // Il cantiere archiviato resta corrente fino a selezione esplicita
      } catch (err) {
        ERRORI.gestisciErrore('scheda-cantiere/archivia', err);
      } finally {
        this.archiviando = false;
      }
    },

    async confermaRiattivazioneFn() {
      this.riattivando = true;
      try {
        await CANTIERI_SERVICE.aggiornaDatiLotto(this.id, { ...this.lotto, stato: 'attivo' });
        await Alpine.store('cantieri').ricarica();
        this.lotto.stato = 'attivo';
        this.confermaRiattiva = false;
        NOTIFICHE.successo(`Cantiere ${this.id} riattivato`);
      } catch (err) {
        ERRORI.gestisciErrore('scheda-cantiere/riattiva', err);
      } finally {
        this.riattivando = false;
      }
    },

    async confermaCestinaFn() {
      this.cestinando = true;
      try {
        const ts = new Date().toISOString();
        await CANTIERI_SERVICE.aggiornaDatiLotto(this.id, { ...this.lotto, stato: 'cestinato', _cestinato_il: ts });
        await Alpine.store('cantieri').ricarica();
        this.lotto.stato = 'cestinato';
        this.lotto._cestinato_il = ts;
        this.confermaCestina = false;
        NOTIFICHE.successo(`Cantiere ${this.id} spostato nel cestino`);
      } catch (err) {
        ERRORI.gestisciErrore('scheda-cantiere/cestina', err);
      } finally {
        this.cestinando = false;
      }
    },

    async confermaRipristinaDaCestinoFn() {
      this.riattivando = true;
      try {
        // Rimuove _cestinato_il dal payload prima di salvare
        const { _cestinato_il, ...lottoSenza } = this.lotto;
        await CANTIERI_SERVICE.aggiornaDatiLotto(this.id, { ...lottoSenza, stato: 'attivo' });
        await Alpine.store('cantieri').ricarica();
        this.lotto.stato = 'attivo';
        delete this.lotto._cestinato_il;
        this.confermaCestina = false;
        NOTIFICHE.successo(`Cantiere ${this.id} ripristinato dal cestino`);
      } catch (err) {
        ERRORI.gestisciErrore('scheda-cantiere/ripristina-cestino', err);
      } finally {
        this.riattivando = false;
      }
    },
  };
}

// ============================================================
// TEMPLATE: Cruscotto
// ============================================================

const _TEMPLATE_CRUSCOTTO = `
<div x-data="Cruscotto()" x-init="init()" class="max-w-4xl">

  <!-- Header -->
  <div class="flex items-center justify-between mb-6">
    <h1 class="text-xl font-semibold text-slate-800">🏗 Cantieri</h1>
    <div class="flex gap-2">
      <button @click="riscansiona()"
              title="Riscansiona la cartella OneDrive"
              class="text-xs text-slate-500 hover:text-slate-800 px-3 py-1.5 border border-slate-200
                     rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-slate-400">
        ↻ Riscansiona
      </button>
      <button @click="apriForm()" x-show="!mostraForm"
              class="bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium
                     px-4 py-2 rounded-lg transition-colors
                     focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2">
        + Nuovo cantiere
      </button>
    </div>
  </div>

  <!-- Form nuovo cantiere (espandibile) -->
  <div x-show="mostraForm" x-cloak
       class="bg-blue-50 border border-blue-200 rounded-xl p-5 mb-6">
    <h2 class="text-sm font-semibold text-blue-800 mb-4">Nuovo cantiere</h2>
    <div class="grid gap-4 sm:grid-cols-2">
      <div>
        <label for="nuovo-id" class="block text-sm font-medium text-slate-700 mb-1">
          ID cantiere <span class="text-slate-400 font-normal text-xs">(es. CZ399 — opaco, nessun riferimento reale)</span>
        </label>
        <input id="nuovo-id" type="text" x-model="formId"
               @input="formId = formId.toUpperCase(); validaId()"
               @keydown.enter="confermaCrea()"
               placeholder="CZ399"
               maxlength="50"
               class="w-full border rounded-md px-3 py-2 text-sm uppercase
                      focus:outline-none focus:ring-2 focus:ring-blue-500"
               :class="erroreId ? 'border-red-400 bg-red-50' : 'border-slate-300'">
        <p x-show="erroreId" x-text="erroreId"
           class="text-xs text-red-600 mt-1" aria-live="polite"></p>
      </div>
      <div>
        <label for="nuovo-nome" class="block text-sm font-medium text-slate-700 mb-1">
          Denominazione interna <span class="text-slate-400 font-normal text-xs">(leggibile, solo per te)</span>
        </label>
        <input id="nuovo-nome" type="text" x-model="formNome"
               @keydown.enter="confermaCrea()"
               placeholder="es. Variante nord — lotto 3"
               class="w-full border border-slate-300 rounded-md px-3 py-2 text-sm
                      focus:outline-none focus:ring-2 focus:ring-blue-500">
      </div>
    </div>
    <div class="flex gap-3 mt-4">
      <button @click="confermaCrea()" :disabled="creando || !!erroreId"
              class="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white
                     text-sm font-medium px-5 py-2 rounded-lg transition-colors
                     focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2">
        <span x-text="creando ? 'Creazione…' : 'Crea cantiere'"></span>
      </button>
      <button @click="chiudiForm()" :disabled="creando"
              class="text-sm text-slate-500 hover:text-slate-700 px-4 py-2
                     border border-slate-300 rounded-lg transition-colors
                     focus:outline-none focus:ring-2 focus:ring-slate-400">
        Annulla
      </button>
    </div>
  </div>

  <!-- Filtro Attivi / Tutti -->
  <div class="flex gap-1 mb-4" role="tablist" aria-label="Filtro cantieri">
    <button @click="filtro='attivi'" role="tab" :aria-selected="filtro==='attivi'"
            :class="filtro==='attivi'
              ? 'bg-blue-100 text-blue-700 font-semibold'
              : 'text-slate-500 hover:text-slate-800'"
            class="px-4 py-1.5 text-sm rounded-full transition-colors
                   focus:outline-none focus:ring-2 focus:ring-blue-500">
      Attivi (<span x-text="nAttivi"></span>)
    </button>
    <button @click="filtro='tutti'" role="tab" :aria-selected="filtro==='tutti'"
            :class="filtro==='tutti'
              ? 'bg-blue-100 text-blue-700 font-semibold'
              : 'text-slate-500 hover:text-slate-800'"
            class="px-4 py-1.5 text-sm rounded-full transition-colors
                   focus:outline-none focus:ring-2 focus:ring-blue-500">
      Tutti (<span x-text="nAttivi + nArchiviati"></span>)
    </button>
    <button @click="filtro='cestino'" role="tab" :aria-selected="filtro==='cestino'"
            :class="filtro==='cestino'
              ? 'bg-red-100 text-red-700 font-semibold'
              : 'text-slate-500 hover:text-slate-800'"
            class="px-4 py-1.5 text-sm rounded-full transition-colors
                   focus:outline-none focus:ring-2 focus:ring-red-500"
            x-show="nCestinati > 0">
      🗑 Cestino (<span x-text="nCestinati"></span>)
    </button>
  </div>

  <!-- Lista cantieri -->
  <div class="space-y-3" role="list" aria-label="Lista cantieri">

    <!-- Empty state -->
    <div x-show="cantieriFiltrati.length === 0 && !$store.cantieri.caricamento"
         class="py-16 text-center text-slate-400">
      <div class="text-4xl mb-3" aria-hidden="true">🏗</div>
      <p class="font-medium text-slate-600 mb-1">Nessun cantiere trovato</p>
      <p class="text-sm">Crea il primo cantiere con il pulsante in alto.</p>
    </div>

    <template x-for="c in cantieriFiltrati" :key="c.cantiere_id">
      <div role="listitem"
           :class="isCorrente(c.cantiere_id)
             ? 'border-blue-400 bg-blue-50 ring-1 ring-blue-300'
             : 'border-slate-200 bg-white hover:border-slate-300'"
           class="border rounded-xl p-4 transition-all">

        <div class="flex items-start justify-between gap-4">
          <!-- Info principale -->
          <div class="min-w-0 flex-1">
            <div class="flex items-center gap-2 flex-wrap mb-1">
              <!-- Badge stato -->
              <span :class="badgeStato(c).cls"
                    x-text="badgeStato(c).label"
                    class="text-xs font-medium px-2 py-0.5 rounded-full flex-shrink-0">
              </span>

              <!-- ID + Nome -->
              <span class="font-mono text-sm font-semibold text-slate-800"
                    x-text="c.cantiere_id"></span>
              <span x-show="c.nome && c.nome !== c.cantiere_id"
                    class="text-sm text-slate-600 truncate"
                    x-text="'— ' + c.nome"></span>

              <!-- Badge corrente -->
              <span x-show="isCorrente(c.cantiere_id)"
                    class="text-xs bg-blue-600 text-white px-2 py-0.5 rounded-full font-medium">
                corrente
              </span>
            </div>

            <!-- Conteggi sintetici -->
            <div class="flex items-center gap-4 text-xs text-slate-400 mt-1">
              <span x-show="c.scaffold_completo">
                <span x-text="c.n_imprese ?? 0"></span> imprese
              </span>
              <span x-show="c.ultimo_aggiornamento_at">
                aggiornato il <span x-text="formatData(c.ultimo_aggiornamento_at)"></span>
              </span>
            </div>

            <!-- Avviso struttura incompleta -->
            <div x-show="!c.scaffold_completo"
                 class="mt-2 text-xs text-amber-700 bg-amber-50 border border-amber-200
                        rounded-lg px-3 py-1.5 inline-flex items-center gap-2">
              <span aria-hidden="true">⚠</span>
              Struttura incompleta (cartella trovata fuori dall'app).
              <button @click.stop="inizializza(c.cantiere_id)"
                      class="font-semibold underline hover:no-underline
                             focus:outline-none focus:ring-1 focus:ring-amber-600 rounded">
                Inizializza
              </button>
            </div>
          </div>

          <!-- Azioni -->
          <div class="flex gap-2 flex-shrink-0">
            <button x-show="!isCorrente(c.cantiere_id)"
                    @click="seleziona(c.cantiere_id, c)"
                    class="text-sm font-medium text-blue-600 hover:text-blue-800
                           px-3 py-1.5 border border-blue-300 rounded-lg
                           hover:bg-blue-50 transition-colors
                           focus:outline-none focus:ring-2 focus:ring-blue-500">
              Seleziona
            </button>
            <button x-show="c.scaffold_completo"
                    @click="seleziona(c.cantiere_id, c); apriScheda()"
                    class="text-sm text-slate-600 hover:text-slate-900
                           px-3 py-1.5 border border-slate-200 rounded-lg
                           hover:bg-slate-50 transition-colors
                           focus:outline-none focus:ring-2 focus:ring-slate-400">
              ✏ Dati
            </button>
          </div>
        </div>
      </div>
    </template>

  </div>
</div>
`;

// ============================================================
// TEMPLATE: Scheda dati cantiere
// ============================================================

const _TEMPLATE_SCHEDA = `
<div x-data="SchedaCantiere()" x-init="init()" x-effect="aggiornaSeCambia()" class="max-w-3xl">

  <!-- Caso: nessun cantiere selezionato -->
  <div x-show="!id && !caricamento"
       class="py-16 text-center text-slate-400">
    <div class="text-4xl mb-3" aria-hidden="true">🏗</div>
    <p class="text-slate-600 font-medium mb-2">Nessun cantiere selezionato</p>
    <p class="text-sm mb-4">Seleziona un cantiere dal cruscotto per modificarne i dati.</p>
    <button @click="navigaA('cruscotto')"
            class="text-sm text-blue-600 underline hover:no-underline
                   focus:outline-none focus:ring-2 focus:ring-blue-500 rounded">
      Vai al cruscotto cantieri
    </button>
  </div>

  <!-- Spinner caricamento -->
  <div x-show="caricamento" class="flex items-center gap-3 py-12 text-slate-500 text-sm">
    <div class="w-5 h-5 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
    Caricamento dati cantiere…
  </div>

  <!-- Scheda principale -->
  <div x-show="id && !caricamento">

    <!-- Header -->
    <div class="flex items-center justify-between mb-6">
      <div>
        <h1 class="text-xl font-semibold text-slate-800">
          🏗 Dati cantiere
          <span class="font-mono text-blue-700 ml-1" x-text="id"></span>
        </h1>
        <p class="text-sm text-slate-500 mt-0.5" x-text="lotto.nome || '(denominazione non inserita)'"></p>
      </div>
      <div class="flex items-center gap-3">
        <span x-show="feedbackMsg" x-text="feedbackMsg"
              class="text-sm text-green-700 bg-green-50 border border-green-200
                     px-3 py-1 rounded-full" aria-live="polite"></span>
        <button @click="salva()" :disabled="salvando || lotto.stato === 'cestinato'"
                :title="lotto.stato === 'cestinato' ? 'Ripristina il cantiere dal cestino per modificarlo' : ''"
                class="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white
                       text-sm font-medium px-5 py-2 rounded-lg transition-colors
                       focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2">
          <span x-text="salvando ? 'Salvataggio…' : 'Salva'"></span>
        </button>
      </div>
    </div>

    <!-- ── SEZIONE 1: Dati principali ─────────────────────── -->
    <details open class="mb-4 border border-slate-200 rounded-xl overflow-hidden">
      <summary class="px-4 py-3 bg-slate-50 cursor-pointer font-medium text-sm text-slate-700
                      hover:bg-slate-100 list-none flex items-center justify-between">
        <span>Dati principali</span>
        <span class="text-slate-400 text-xs">▾</span>
      </summary>
      <div class="p-4 grid gap-4 sm:grid-cols-2">

        <div>
          <label class="block text-xs font-medium text-slate-500 mb-1 uppercase tracking-wide">
            ID cantiere
          </label>
          <input type="text" :value="lotto.id ?? id" disabled
                 class="w-full border border-slate-200 rounded-md px-3 py-2 text-sm
                        bg-slate-50 text-slate-500 cursor-not-allowed"
                 title="L'ID non è modificabile dopo la creazione">
        </div>

        <div>
          <label for="lotto-stato" class="block text-xs font-medium text-slate-500 mb-1 uppercase tracking-wide">
            Stato cantiere
          </label>
          <select id="lotto-stato" x-model="lotto.stato"
                  class="w-full border border-slate-300 rounded-md px-3 py-2 text-sm
                         focus:outline-none focus:ring-2 focus:ring-blue-500">
            <option value="attivo">Attivo</option>
            <option value="sospeso">Sospeso</option>
          </select>
        </div>

        <div class="sm:col-span-2">
          <label for="lotto-nome" class="block text-xs font-medium text-slate-500 mb-1 uppercase tracking-wide">
            Denominazione interna <span class="text-slate-400 normal-case font-normal">(leggibile per il PO, non identificativa)</span>
          </label>
          <input id="lotto-nome" type="text" x-model="lotto.nome"
                 placeholder="es. Variante nord — lotto 3"
                 class="w-full border border-slate-300 rounded-md px-3 py-2 text-sm
                        focus:outline-none focus:ring-2 focus:ring-blue-500">
        </div>

        <div class="sm:col-span-2">
          <label for="lotto-comm" class="block text-xs font-medium text-slate-500 mb-1 uppercase tracking-wide">
            Committente <span class="text-slate-400 normal-case font-normal">(termine generico, no riferimenti identificativi)</span>
          </label>
          <input id="lotto-comm" type="text" x-model="lotto.committente"
                 placeholder="es. committente"
                 class="w-full border border-slate-300 rounded-md px-3 py-2 text-sm
                        focus:outline-none focus:ring-2 focus:ring-blue-500">
        </div>

        <div>
          <label for="lotto-strutt" class="block text-xs font-medium text-slate-500 mb-1 uppercase tracking-wide">
            Struttura territoriale
          </label>
          <input id="lotto-strutt" type="text" x-model="lotto.strutturaTerritoriale"
                 class="w-full border border-slate-300 rounded-md px-3 py-2 text-sm
                        focus:outline-none focus:ring-2 focus:ring-blue-500">
        </div>

        <div>
          <label for="lotto-ss" class="block text-xs font-medium text-slate-500 mb-1 uppercase tracking-wide">
            SS / Strada n.
          </label>
          <input id="lotto-ss" type="text" x-model="lotto.ssNumero"
                 class="w-full border border-slate-300 rounded-md px-3 py-2 text-sm
                        focus:outline-none focus:ring-2 focus:ring-blue-500">
        </div>

        <div>
          <label for="lotto-prog-ini" class="block text-xs font-medium text-slate-500 mb-1 uppercase tracking-wide">
            Progressiva inizio
          </label>
          <input id="lotto-prog-ini" type="text" x-model="lotto.progressivaInizio"
                 placeholder="es. km 0+000"
                 class="w-full border border-slate-300 rounded-md px-3 py-2 text-sm
                        focus:outline-none focus:ring-2 focus:ring-blue-500">
        </div>

        <div>
          <label for="lotto-prog-fin" class="block text-xs font-medium text-slate-500 mb-1 uppercase tracking-wide">
            Progressiva fine
          </label>
          <input id="lotto-prog-fin" type="text" x-model="lotto.progressivaFine"
                 placeholder="es. km 17+000"
                 class="w-full border border-slate-300 rounded-md px-3 py-2 text-sm
                        focus:outline-none focus:ring-2 focus:ring-blue-500">
        </div>
      </div>
    </details>

    <!-- ── SEZIONE 2: Riferimenti contrattuali ────────────── -->
    <details open class="mb-4 border border-slate-200 rounded-xl overflow-hidden">
      <summary class="px-4 py-3 bg-slate-50 cursor-pointer font-medium text-sm text-slate-700
                      hover:bg-slate-100 list-none flex items-center justify-between">
        <span>Riferimenti contrattuali</span>
        <span class="text-slate-400 text-xs">▾</span>
      </summary>
      <div class="p-4 grid gap-4 sm:grid-cols-2">

        <div>
          <label for="lotto-cup" class="block text-xs font-medium text-slate-500 mb-1 uppercase tracking-wide">CUP</label>
          <input id="lotto-cup" type="text" x-model="lotto.cup"
                 class="w-full border border-slate-300 rounded-md px-3 py-2 text-sm
                        focus:outline-none focus:ring-2 focus:ring-blue-500">
        </div>

        <div>
          <label for="lotto-cig" class="block text-xs font-medium text-slate-500 mb-1 uppercase tracking-wide">CIG</label>
          <input id="lotto-cig" type="text" x-model="lotto.cig"
                 class="w-full border border-slate-300 rounded-md px-3 py-2 text-sm
                        focus:outline-none focus:ring-2 focus:ring-blue-500">
        </div>

        <div>
          <label for="lotto-cnr" class="block text-xs font-medium text-slate-500 mb-1 uppercase tracking-wide">N. contratto</label>
          <input id="lotto-cnr" type="text" x-model="lotto.contrattoNumero"
                 class="w-full border border-slate-300 rounded-md px-3 py-2 text-sm
                        focus:outline-none focus:ring-2 focus:ring-blue-500">
        </div>

        <div>
          <label for="lotto-cdata" class="block text-xs font-medium text-slate-500 mb-1 uppercase tracking-wide">Data contratto</label>
          <input id="lotto-cdata" type="date" x-model="lotto.contrattoData"
                 class="w-full border border-slate-300 rounded-md px-3 py-2 text-sm
                        focus:outline-none focus:ring-2 focus:ring-blue-500">
        </div>

        <div>
          <label for="lotto-imp" class="block text-xs font-medium text-slate-500 mb-1 uppercase tracking-wide">Importo contratto (€)</label>
          <input id="lotto-imp" type="number" min="0" step="0.01" x-model.number="lotto.importoContratto"
                 class="w-full border border-slate-300 rounded-md px-3 py-2 text-sm
                        focus:outline-none focus:ring-2 focus:ring-blue-500">
        </div>

        <div>
          <label for="lotto-commessa" class="block text-xs font-medium text-slate-500 mb-1 uppercase tracking-wide">N. commessa</label>
          <input id="lotto-commessa" type="text" x-model="lotto.commessaNumero"
                 class="w-full border border-slate-300 rounded-md px-3 py-2 text-sm
                        focus:outline-none focus:ring-2 focus:ring-blue-500">
        </div>

        <div>
          <label for="lotto-ppm" class="block text-xs font-medium text-slate-500 mb-1 uppercase tracking-wide">Codice PPM/SIL</label>
          <input id="lotto-ppm" type="text" x-model="lotto.codicePpmSil"
                 class="w-full border border-slate-300 rounded-md px-3 py-2 text-sm
                        focus:outline-none focus:ring-2 focus:ring-blue-500">
        </div>

        <div>
          <label for="lotto-vb" class="block text-xs font-medium text-slate-500 mb-1 uppercase tracking-wide">Voce budget</label>
          <input id="lotto-vb" type="text" x-model="lotto.voceBudget"
                 class="w-full border border-slate-300 rounded-md px-3 py-2 text-sm
                        focus:outline-none focus:ring-2 focus:ring-blue-500">
        </div>
      </div>
    </details>

    <!-- ── SEZIONE 3: Date di realizzazione ───────────────── -->
    <details open class="mb-4 border border-slate-200 rounded-xl overflow-hidden">
      <summary class="px-4 py-3 bg-slate-50 cursor-pointer font-medium text-sm text-slate-700
                      hover:bg-slate-100 list-none flex items-center justify-between">
        <span>Date di realizzazione</span>
        <span class="text-slate-400 text-xs">▾</span>
      </summary>
      <div class="p-4 grid gap-4 sm:grid-cols-2">

        <div>
          <label for="lotto-dconsegna" class="block text-xs font-medium text-slate-500 mb-1 uppercase tracking-wide">Data consegna lavori</label>
          <input id="lotto-dconsegna" type="date" x-model="lotto.dataConsegnaLavori"
                 class="w-full border border-slate-300 rounded-md px-3 py-2 text-sm
                        focus:outline-none focus:ring-2 focus:ring-blue-500">
        </div>

        <div>
          <label for="lotto-durata" class="block text-xs font-medium text-slate-500 mb-1 uppercase tracking-wide">Durata contrattuale (gg)</label>
          <input id="lotto-durata" type="number" min="1" x-model.number="lotto.durataContrattuale"
                 class="w-full border border-slate-300 rounded-md px-3 py-2 text-sm
                        focus:outline-none focus:ring-2 focus:ring-blue-500">
        </div>

        <div>
          <label for="lotto-sospens" class="block text-xs font-medium text-slate-500 mb-1 uppercase tracking-wide">Giorni di sospensione</label>
          <input id="lotto-sospens" type="number" min="0" x-model.number="lotto.giorniSospensione"
                 class="w-full border border-slate-300 rounded-md px-3 py-2 text-sm
                        focus:outline-none focus:ring-2 focus:ring-blue-500">
        </div>

        <div>
          <label for="lotto-dini" class="block text-xs font-medium text-slate-500 mb-1 uppercase tracking-wide">Data inizio effettiva</label>
          <input id="lotto-dini" type="date" x-model="lotto.dataInizioEffettiva"
                 class="w-full border border-slate-300 rounded-md px-3 py-2 text-sm
                        focus:outline-none focus:ring-2 focus:ring-blue-500">
        </div>

        <div>
          <label for="lotto-dfin" class="block text-xs font-medium text-slate-500 mb-1 uppercase tracking-wide">Data fine effettiva</label>
          <input id="lotto-dfin" type="date" x-model="lotto.dataFineEffettiva"
                 class="w-full border border-slate-300 rounded-md px-3 py-2 text-sm
                        focus:outline-none focus:ring-2 focus:ring-blue-500">
        </div>
      </div>
    </details>

    <!-- ── SEZIONE 4: Ruoli istituzionali ─────────────────── -->
    <details class="mb-4 border border-slate-200 rounded-xl overflow-hidden">
      <summary class="px-4 py-3 bg-slate-50 cursor-pointer font-medium text-sm text-slate-700
                      hover:bg-slate-100 list-none flex items-center justify-between">
        <span>Ruoli istituzionali</span>
        <span class="text-slate-400 text-xs">▾</span>
      </summary>
      <div class="p-4 space-y-3">
        <!-- M4 F5: i ruoli sono ora <select> su persone_committente.
             Retrocompatibilità: valori legacy non-pc_ mostrati come opzione disabilitata.
             Persona cestinata: "(persona non disponibile)". Guida-non-blocca sempre. -->

        <!-- Nota unica (mostrata una volta, non per ogni campo) -->
        <p x-show="personeCommittente.length === 0"
           class="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-2">
          ℹ Nessuna persona committente inserita. Aggiungile in
          <strong>Anagrafiche → Pers. Committente</strong> per abilitare la selezione.
        </p>

        <div class="grid gap-4 sm:grid-cols-2">
          <template x-for="[chiave, etich] in [
            ['rupId','RUP — Resp. Unico del Procedimento'],
            ['dlId','DL — Direttore dei Lavori'],
            ['cseTitolareId','CSE Titolare'],
            ['direttoreOperativoId','Direttore Operativo'],
            ['responsabileLavoriId','RL — Responsabile dei Lavori'],
            ['ispettoreCantiereId','Ispettore di Cantiere']
          ]" :key="chiave">
            <div>
              <label :for="'ruolo-' + chiave"
                     class="block text-xs font-medium text-slate-500 mb-1 uppercase tracking-wide"
                     x-text="etich"></label>
              <select :id="'ruolo-' + chiave"
                      :value="lotto.ruoli_istituzionali?.[chiave] ?? ''"
                      @change="(lotto.ruoli_istituzionali ??= {})[chiave] = $event.target.value || null; lotto={...lotto}"
                      class="w-full border border-slate-300 rounded-md px-3 py-2 text-sm
                             focus:outline-none focus:ring-2 focus:ring-blue-500">
                <option value="">— Non assegnato —</option>
                <!-- Valore legacy (testo libero, non pc_): conservato, non cancellato -->
                <template x-if="lotto.ruoli_istituzionali?.[chiave] && !lotto.ruoli_istituzionali[chiave]?.startsWith('pc_')">
                  <option disabled :value="lotto.ruoli_istituzionali[chiave]"
                          x-text="'(valore precedente: ' + lotto.ruoli_istituzionali[chiave] + ')'"></option>
                </template>
                <!-- Persona cestinata: FK valido ma non in lista -->
                <template x-if="lotto.ruoli_istituzionali?.[chiave]?.startsWith('pc_') && !personeCommittente.some(p => p.id === lotto.ruoli_istituzionali[chiave])">
                  <option disabled :value="lotto.ruoli_istituzionali[chiave]">(persona non disponibile)</option>
                </template>
                <!-- Opzioni persone committente -->
                <template x-for="p in personeCommittente" :key="p.id">
                  <option :value="p.id"
                          x-text="[p.cognome,p.nome].filter(Boolean).join(' ') + (p.qualifica ? ' — ' + p.qualifica : '')">
                  </option>
                </template>
              </select>
              <!-- Invito a sostituire valori legacy -->
              <p x-show="lotto.ruoli_istituzionali?.[chiave] && !lotto.ruoli_istituzionali[chiave]?.startsWith('pc_')"
                 class="mt-0.5 text-xs text-slate-400">
                ↑ Seleziona una persona dall'elenco per aggiornare il valore.
              </p>
            </div>
          </template>
        </div>

        <!-- CSP esterno -->
        <div class="border-t border-slate-100 pt-3">
          <p class="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">CSP esterno (testo libero)</p>
          <div class="grid gap-4 sm:grid-cols-3">
            <div>
              <label for="csp-nome" class="block text-xs text-slate-500 mb-1">Nome CSP</label>
              <input id="csp-nome" type="text"
                     :value="lotto.csp?.nome ?? ''"
                     @input="(lotto.csp ??= {}).nome = $event.target.value"
                     class="w-full border border-slate-300 rounded-md px-3 py-2 text-sm
                            focus:outline-none focus:ring-2 focus:ring-blue-500">
            </div>
            <div>
              <label for="csp-qual" class="block text-xs text-slate-500 mb-1">Qualifica</label>
              <input id="csp-qual" type="text"
                     :value="lotto.csp?.qualifica ?? ''"
                     @input="(lotto.csp ??= {}).qualifica = $event.target.value"
                     class="w-full border border-slate-300 rounded-md px-3 py-2 text-sm
                            focus:outline-none focus:ring-2 focus:ring-blue-500">
            </div>
            <div>
              <label for="csp-rec" class="block text-xs text-slate-500 mb-1">Recapito</label>
              <input id="csp-rec" type="text"
                     :value="lotto.csp?.recapito ?? ''"
                     @input="(lotto.csp ??= {}).recapito = $event.target.value"
                     class="w-full border border-slate-300 rounded-md px-3 py-2 text-sm
                            focus:outline-none focus:ring-2 focus:ring-blue-500">
            </div>
          </div>
        </div>
      </div>
    </details>

    <!-- ── ZONA PERICOLO: Archiviazione (nascosta se già archiviato o cestinato) ── -->
    <div x-show="lotto.stato !== 'concluso-archiviato' && lotto.stato !== 'cestinato'"
         class="mt-6 border border-red-200 rounded-xl p-4 bg-red-50">
      <h2 class="text-sm font-semibold text-red-800 mb-1">Archivia cantiere</h2>
      <p class="text-xs text-red-600 mb-3">
        Il cantiere uscirà dalla lista "Attivi" ma resterà consultabile. I dati non vengono mai cancellati.
      </p>
      <div x-show="!confermaArchivia">
        <button @click="confermaArchivia = true"
                class="text-sm font-medium text-red-700 border border-red-300 bg-white
                       px-4 py-2 rounded-lg hover:bg-red-100 transition-colors
                       focus:outline-none focus:ring-2 focus:ring-red-500">
          Archivia cantiere…
        </button>
      </div>
      <div x-show="confermaArchivia" class="flex items-center gap-3">
        <span class="text-xs text-red-700 font-medium">Confermi l'archiviazione?</span>
        <button @click="confermaArchiviaFn()" :disabled="archiviando"
                class="text-sm font-semibold bg-red-600 hover:bg-red-700 text-white
                       px-4 py-2 rounded-lg transition-colors
                       focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2">
          <span x-text="archiviando ? 'Archiviazione…' : 'Sì, archivia'"></span>
        </button>
        <button @click="confermaArchivia = false"
                class="text-sm text-slate-500 hover:text-slate-700
                       focus:outline-none focus:ring-2 focus:ring-slate-400 rounded px-2">
          Annulla
        </button>
      </div>
    </div>

    <!-- ── Sposta nel cestino (visibile per tutti gli stati non-cestinato) ── -->
    <div x-show="lotto.stato !== 'cestinato'"
         class="mt-4 border border-slate-200 rounded-xl p-4 bg-white">
      <div class="flex items-center justify-between gap-4">
        <p class="text-sm text-slate-500">
          Sposta nel cestino per rimuoverlo dalle liste operative. Potrai ripristinarlo in qualsiasi momento.
        </p>
        <div x-show="!confermaCestina">
          <button @click="confermaCestina = true"
                  class="text-sm font-medium text-slate-600 border border-slate-300 bg-white
                         px-4 py-2 rounded-lg hover:bg-slate-100 transition-colors whitespace-nowrap
                         focus:outline-none focus:ring-2 focus:ring-slate-400">
            🗑 Nel cestino…
          </button>
        </div>
        <div x-show="confermaCestina" class="flex items-center gap-3">
          <span class="text-xs text-slate-600 font-medium whitespace-nowrap">Spostare nel cestino?</span>
          <button @click="confermaCestinaFn()" :disabled="cestinando"
                  class="text-sm font-semibold bg-slate-700 hover:bg-slate-800 text-white
                         px-4 py-2 rounded-lg transition-colors whitespace-nowrap
                         focus:outline-none focus:ring-2 focus:ring-slate-500 focus:ring-offset-2">
            <span x-text="cestinando ? 'Spostamento…' : 'Sì, nel cestino'"></span>
          </button>
          <button @click="confermaCestina = false"
                  class="text-sm text-slate-500 hover:text-slate-700
                         focus:outline-none focus:ring-2 focus:ring-slate-400 rounded px-2">
            Annulla
          </button>
        </div>
      </div>
    </div>

    <!-- Blocco riattivazione (quando già archiviato) -->
    <div x-show="lotto.stato === 'concluso-archiviato'"
         class="mt-4 border border-slate-200 rounded-xl p-4 bg-slate-50">
      <div class="flex items-center justify-between gap-4">
        <p class="text-sm text-slate-500">
          Cantiere archiviato — sola lettura. I dati sono conservati.
        </p>
        <div x-show="!confermaRiattiva">
          <button @click="confermaRiattiva = true"
                  class="text-sm font-medium text-emerald-700 border border-emerald-300 bg-white
                         px-4 py-2 rounded-lg hover:bg-emerald-50 transition-colors whitespace-nowrap
                         focus:outline-none focus:ring-2 focus:ring-emerald-500">
            Riattiva cantiere…
          </button>
        </div>
        <div x-show="confermaRiattiva" class="flex items-center gap-3">
          <span class="text-xs text-slate-600 font-medium whitespace-nowrap">Riportare ad attivo?</span>
          <button @click="confermaRiattivazioneFn()" :disabled="riattivando"
                  class="text-sm font-semibold bg-emerald-600 hover:bg-emerald-700 text-white
                         px-4 py-2 rounded-lg transition-colors whitespace-nowrap
                         focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2">
            <span x-text="riattivando ? 'Riattivazione…' : 'Sì, riattiva'"></span>
          </button>
          <button @click="confermaRiattiva = false"
                  class="text-sm text-slate-500 hover:text-slate-700
                         focus:outline-none focus:ring-2 focus:ring-slate-400 rounded px-2">
            Annulla
          </button>
        </div>
      </div>
    </div>

    <!-- Blocco ripristino dal cestino (quando cestinato) -->
    <div x-show="lotto.stato === 'cestinato'"
         class="mt-4 border border-red-200 rounded-xl p-4 bg-red-50">
      <div class="flex items-center justify-between gap-4">
        <div>
          <p class="text-sm font-medium text-red-800">Cantiere nel cestino</p>
          <p class="text-xs text-red-600 mt-0.5">
            Non compare nelle liste operative. Ripristinalo per tornare a lavorarci.
            <template x-if="lotto._cestinato_il">
              <span x-text="' Cestinato il ' + new Date(lotto._cestinato_il).toLocaleDateString('it-IT') + '.'"></span>
            </template>
          </p>
        </div>
        <div x-show="!riattivando">
          <button @click="confermaRipristinaDaCestinoFn()"
                  class="text-sm font-medium text-emerald-700 border border-emerald-300 bg-white
                         px-4 py-2 rounded-lg hover:bg-emerald-50 transition-colors whitespace-nowrap
                         focus:outline-none focus:ring-2 focus:ring-emerald-500">
            ↩ Ripristina cantiere
          </button>
        </div>
        <div x-show="riattivando"
             class="text-sm text-slate-500 italic whitespace-nowrap">
          Ripristino…
        </div>
      </div>
    </div>

  </div>
</div>
`;

// ============================================================
// Registrazione nel registry moduli
// ============================================================

window.MODULI_REGISTRATI = window.MODULI_REGISTRATI ?? {};

window.MODULI_REGISTRATI['cruscotto'] = {
  monta(contenitore) {
    contenitore.innerHTML = _TEMPLATE_CRUSCOTTO;
    // MutationObserver di Alpine processa automaticamente il nuovo nodo
  },
};

window.MODULI_REGISTRATI['anagrafica-cantiere'] = {
  monta(contenitore) {
    contenitore.innerHTML = _TEMPLATE_SCHEDA;
  },
};
