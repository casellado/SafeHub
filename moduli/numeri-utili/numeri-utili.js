/**
 * numeri-utili.js — Rubrica "Numeri Utili" del CSE.
 *
 * Modulo ISOLATO: nessuna dipendenza da cantiere corrente, root OneDrive o anagrafica.
 * I 5 numeri di emergenza nazionali sono costanti di codice: non eliminabili, non modificabili.
 * I contatti personali vivono in IDB → impostazioni_archivio → chiave 'rubrica_personale'.
 *
 * Perché IDB key e non store dedicato: evita il bump di DB_VERSIONE e permette di rimuovere
 * il modulo senza toccare lo schema IDB.
 */
'use strict';

// ── Emergenze nazionali ── costanti di codice, non salvate come dati utente ──

const _NAZIONALI_FISSI = [
  { id: 'nue', numero: '112', etichetta: 'Numero Unico Emergenze (NUE)' },
  { id: 'pol', numero: '113', etichetta: 'Polizia di Stato' },
  { id: 'vvf', numero: '115', etichetta: 'Vigili del Fuoco' },
  { id: 'gdf', numero: '117', etichetta: 'Guardia di Finanza' },
  { id: 'san', numero: '118', etichetta: 'Emergenza Sanitaria' },
];

const _CATEGORIE_RUBRICA = [
  { valore: 'ente',    etichetta: 'Ente pubblico' },
  { valore: 'sanita',  etichetta: 'Sanità' },
  { valore: 'impresa', etichetta: 'Impresa' },
  { valore: 'altro',   etichetta: 'Altro' },
];

// ── Storage ───────────────────────────────────────────────────────────────────

const _leggiContatti = async () => {
  try {
    const rec = await IDB.idbGet('impostazioni_archivio', 'rubrica_personale');
    return Array.isArray(rec?.value) ? rec.value : [];
  } catch {
    return [];
  }
};

const _salvaContatti = async (lista) => {
  await IDB.idbPut('impostazioni_archivio', { key: 'rubrica_personale', value: lista });
};

// ── Utility ───────────────────────────────────────────────────────────────────

/** Mantiene solo i caratteri ammessi in un href tel: (cifre e +). */
const _sanitizzaHref = (n) => n.replace(/[^\d+]/g, '');

/** Ordina per categoria poi per nome (locale IT). */
const _ordinaContatti = (lista) =>
  [...lista].sort((a, b) => {
    const ca = a.categoria || 'zzz', cb = b.categoria || 'zzz';
    if (ca !== cb) return ca.localeCompare(cb, 'it');
    return (a.nome || '').localeCompare(b.nome || '', 'it');
  });

// ── Componente Alpine ─────────────────────────────────────────────────────────

function RubricaNumeri() {
  return {
    nazionaliFissi: _NAZIONALI_FISSI,
    contatti:       [],
    caricamento:    true,

    // Stato drawer form
    drawerAperto: false,
    formNuova:    true,
    formId:       null,
    form:         { nome: '', numero: '', categoria: 'ente', nota: '' },
    formErrore:   null,
    salvando:     false,
    _cleanupTrap: null,

    // Stato conferma eliminazione inline
    confermaElimina: null,

    init() { this._carica(); },

    async _carica() {
      this.caricamento = true;
      try {
        this.contatti = await _leggiContatti();
      } finally {
        this.caricamento = false;
      }
    },

    get contattiOrdinati() { return _ordinaContatti(this.contatti); },

    // Espone la costante al template (x-for nel select)
    _categorie() { return _CATEGORIE_RUBRICA; },

    etichettaCategoria(valore) {
      return _CATEGORIE_RUBRICA.find(c => c.valore === valore)?.etichetta ?? '';
    },

    sanitizzaHref(n) { return _sanitizzaHref(n); },

    // ── Drawer ─────────────────────────────────────────────────────────────

    apriFormNuovo() {
      this.formNuova   = true;
      this.formId      = null;
      this.form        = { nome: '', numero: '', categoria: 'ente', nota: '' };
      this.formErrore  = null;
      this.drawerAperto = true;
      this._aggancioTrap();
    },

    apriFormModifica(c) {
      this.formNuova   = false;
      this.formId      = c.id;
      this.form        = { nome: c.nome, numero: c.numero,
                           categoria: c.categoria || 'altro', nota: c.nota || '' };
      this.formErrore  = null;
      this.drawerAperto = true;
      this._aggancioTrap();
    },

    chiudiDrawer() {
      this.drawerAperto = false;
      if (this._cleanupTrap) { this._cleanupTrap(); this._cleanupTrap = null; }
    },

    _aggancioTrap() {
      Alpine.nextTick(() => {
        const dlg = this.$refs.drawerRubrica;
        if (!dlg) return;
        this._cleanupTrap = A11Y.trapFocus(dlg);
        const primo = dlg.querySelector('input, select, button');
        if (primo) A11Y.spostaFocus(primo);
      });
    },

    _valida() {
      if (!this.form.nome.trim())   return 'Il nome è obbligatorio.';
      if (!this.form.numero.trim()) return 'Il numero di telefono è obbligatorio.';
      if (!/^[0-9+()\-\s]{1,30}$/.test(this.form.numero.trim()))
        return 'Numero non valido (max 30 caratteri: cifre, +, -, spazi, parentesi).';
      return null;
    },

    async salva() {
      this.formErrore = this._valida();
      if (this.formErrore) return;
      this.salvando = true;
      try {
        const rec = {
          id:        this.formNuova ? ('ru_' + Date.now()) : this.formId,
          nome:      this.form.nome.trim(),
          numero:    this.form.numero.trim(),
          categoria: this.form.categoria || 'altro',
          nota:      this.form.nota.trim(),
        };
        if (this.formNuova) {
          this.contatti = [...this.contatti, rec];
          A11Y.annuncia(`Contatto «${rec.nome}» aggiunto.`);
          NOTIFICHE.successo('Contatto aggiunto', rec.nome);
        } else {
          this.contatti = this.contatti.map(c => c.id === this.formId ? rec : c);
          A11Y.annuncia(`Contatto «${rec.nome}» aggiornato.`);
          NOTIFICHE.successo('Contatto aggiornato', rec.nome);
        }
        await _salvaContatti(this.contatti);
        this.chiudiDrawer();
      } catch (err) {
        ERRORI.gestisciErrore('rubrica/salva', err);
      } finally {
        this.salvando = false;
      }
    },

    // ── Eliminazione inline ─────────────────────────────────────────────────

    avviaElimina(id)  { this.confermaElimina = id; },
    annullaElimina()  { this.confermaElimina = null; },

    async eliminaContatto() {
      const id   = this.confermaElimina;
      const nome = this.contatti.find(c => c.id === id)?.nome ?? '';
      this.contatti        = this.contatti.filter(c => c.id !== id);
      this.confermaElimina = null;
      try {
        await _salvaContatti(this.contatti);
        A11Y.annuncia(`Contatto «${nome}» eliminato.`);
        NOTIFICHE.successo('Contatto eliminato', nome);
      } catch (err) {
        ERRORI.gestisciErrore('rubrica/elimina', err);
      }
    },
  };
}

// ── Template HTML ─────────────────────────────────────────────────────────────

const _TEMPLATE_NUMERI_UTILI = `
<div x-data="RubricaNumeri()" x-init="init()" class="max-w-3xl">

  <!-- === HEADER === -->
  <div class="flex items-center justify-between mb-6">
    <div class="flex items-center gap-3">
      <span class="text-4xl leading-none" aria-hidden="true">☎️</span>
      <div>
        <h1 class="text-xl font-semibold text-slate-800">Numeri Utili</h1>
        <p class="text-xs text-slate-400 mt-0.5">Emergenze nazionali e contatti personali del CSE</p>
      </div>
    </div>
    <button @click="apriFormNuovo()"
            class="bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium
                   px-4 py-2 rounded-lg transition-colors
                   focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2">
      + Aggiungi contatto
    </button>
  </div>

  <!-- === EMERGENZE NAZIONALI (fissi, non eliminabili) === -->
  <section class="mb-8" aria-labelledby="rubrica-sez-nazionali">
    <h2 id="rubrica-sez-nazionali"
        class="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">
      Emergenze nazionali — fissi
    </h2>
    <ul class="space-y-2" role="list">
      <template x-for="c in nazionaliFissi" :key="c.id">
        <li class="flex items-center gap-3 border border-red-200 bg-red-50 rounded-xl px-4 py-3"
            role="listitem">
          <span class="shrink-0 text-xs font-bold text-red-600 bg-red-100 border border-red-200
                       rounded-full px-2 py-0.5" aria-hidden="true">🚨</span>
          <span class="flex-1 text-sm font-medium text-slate-800 min-w-0 truncate"
                x-text="c.etichetta"></span>
          <a :href="'tel:' + c.numero"
             :aria-label="'Chiama ' + c.etichetta + ': ' + c.numero"
             class="shrink-0 text-lg font-bold text-red-600 hover:text-red-800 tracking-wide
                    px-3 py-1 rounded-lg hover:bg-red-100 transition-colors
                    min-w-[44px] min-h-[44px] flex items-center justify-center
                    focus:outline-none focus:ring-2 focus:ring-red-400"
             x-text="c.numero">
          </a>
        </li>
      </template>
    </ul>
  </section>

  <!-- === CONTATTI PERSONALI === -->
  <section aria-labelledby="rubrica-sez-personali">
    <div class="flex items-center justify-between mb-3">
      <h2 id="rubrica-sez-personali"
          class="text-xs font-semibold text-slate-500 uppercase tracking-wider">
        Contatti personali
      </h2>
      <button @click="apriFormNuovo()"
              class="text-xs text-blue-600 hover:text-blue-800 px-2 py-1 rounded
                     focus:outline-none focus:ring-2 focus:ring-blue-400">
        + Aggiungi
      </button>
    </div>

    <!-- Caricamento -->
    <div x-show="caricamento" class="flex items-center gap-2 py-10 text-slate-400 text-sm">
      <div class="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"
           aria-hidden="true"></div>
      Caricamento…
    </div>

    <!-- Vuoto -->
    <div x-show="!caricamento && contattiOrdinati.length === 0"
         class="py-12 text-center">
      <p class="text-3xl mb-2" aria-hidden="true">📋</p>
      <p class="text-sm text-slate-400">Nessun contatto personale.</p>
      <p class="text-xs mt-1 text-slate-400">Aggiungi ASL, SPRESAL, Ispettorato del Lavoro, RSPP, committente…</p>
    </div>

    <!-- Lista contatti -->
    <ul class="space-y-2" role="list"
        x-show="!caricamento && contattiOrdinati.length > 0">
      <template x-for="c in contattiOrdinati" :key="c.id">
        <li class="border border-slate-200 bg-white rounded-xl px-4 py-3
                   hover:border-slate-300 transition-colors"
            role="listitem">

          <!-- Vista normale -->
          <div x-show="confermaElimina !== c.id">
            <div class="flex items-start gap-3">
              <div class="flex-1 min-w-0">
                <div x-show="c.categoria" class="mb-1">
                  <span class="text-xs text-slate-500 bg-slate-100 rounded-full px-2 py-0.5"
                        x-text="etichettaCategoria(c.categoria)"></span>
                </div>
                <p class="text-sm font-semibold text-slate-800 truncate" x-text="c.nome"></p>
                <p x-show="c.nota"
                   class="text-xs text-slate-400 mt-0.5 line-clamp-2"
                   x-text="c.nota"></p>
              </div>
              <!-- Numero tappabile -->
              <a :href="'tel:' + sanitizzaHref(c.numero)"
                 :aria-label="'Chiama ' + c.nome + ': ' + c.numero"
                 class="shrink-0 text-base font-bold text-blue-600 hover:text-blue-800
                        px-3 py-1 rounded-lg hover:bg-blue-50 transition-colors tracking-wide
                        min-w-[44px] min-h-[44px] flex items-center justify-center
                        focus:outline-none focus:ring-2 focus:ring-blue-400"
                 x-text="c.numero">
              </a>
            </div>
            <!-- Azioni -->
            <div class="flex gap-2 mt-2 justify-end">
              <button @click="apriFormModifica(c)"
                      :aria-label="'Modifica ' + c.nome"
                      class="text-xs text-slate-500 hover:text-blue-700 px-3 py-1.5
                             border border-slate-200 rounded-lg hover:border-blue-300 transition-colors
                             min-h-[36px] focus:outline-none focus:ring-2 focus:ring-blue-400">
                ✏ Modifica
              </button>
              <button @click="avviaElimina(c.id)"
                      :aria-label="'Elimina ' + c.nome"
                      class="text-xs text-slate-500 hover:text-red-700 px-3 py-1.5
                             border border-slate-200 rounded-lg hover:border-red-300 transition-colors
                             min-h-[36px] focus:outline-none focus:ring-2 focus:ring-red-400">
                🗑 Elimina
              </button>
            </div>
          </div>

          <!-- Conferma eliminazione inline (pattern cantieri.js) -->
          <div x-show="confermaElimina === c.id"
               class="flex items-center justify-between gap-3 flex-wrap">
            <p class="text-sm text-slate-700">
              Eliminare <strong x-text="c.nome"></strong>?
            </p>
            <div class="flex gap-2 shrink-0">
              <button @click="annullaElimina()"
                      class="text-sm text-slate-600 hover:text-slate-800 px-3 py-1.5
                             border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors
                             min-h-[44px] focus:outline-none focus:ring-2 focus:ring-slate-400">
                Annulla
              </button>
              <button @click="eliminaContatto()"
                      class="text-sm text-white bg-red-600 hover:bg-red-700 px-3 py-1.5
                             rounded-lg transition-colors
                             min-h-[44px] focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2">
                Sì, elimina
              </button>
            </div>
          </div>

        </li>
      </template>
    </ul>
  </section>


  <!-- ── Backdrop drawer ── -->
  <div x-show="drawerAperto" x-cloak
       class="drawer-backdrop" @click="chiudiDrawer()" aria-hidden="true"></div>

  <!-- ── Drawer: aggiungi / modifica contatto ── -->
  <aside x-show="drawerAperto" x-cloak
         x-ref="drawerRubrica"
         @keydown.escape.window="chiudiDrawer()"
         class="drawer"
         role="dialog"
         aria-modal="true"
         aria-labelledby="rubrica-drawer-titolo">

    <div class="drawer-header flex items-center justify-between">
      <h2 id="rubrica-drawer-titolo"
          class="text-base font-semibold text-slate-800"
          x-text="formNuova ? 'Nuovo contatto' : 'Modifica contatto'"></h2>
      <button @click="chiudiDrawer()" aria-label="Chiudi"
              class="p-1.5 rounded hover:bg-slate-100 text-slate-500 text-lg
                     focus:outline-none focus:ring-2 focus:ring-slate-400">✕</button>
    </div>

    <div class="drawer-body space-y-5">

      <!-- Errore validazione -->
      <div x-show="formErrore" role="alert"
           class="flex items-start gap-2 text-sm text-red-700 bg-red-50
                  border border-red-200 rounded-lg px-3 py-2.5">
        <span aria-hidden="true" class="shrink-0 mt-0.5">⚠</span>
        <span x-text="formErrore"></span>
      </div>

      <!-- Nome -->
      <div>
        <label for="rubrica-nome" class="block text-xs font-medium text-slate-700 mb-1.5">
          Nome / Etichetta
          <span class="text-red-500" aria-hidden="true">*</span>
          <span class="sr-only">(obbligatorio)</span>
        </label>
        <input id="rubrica-nome"
               type="text"
               x-model="form.nome"
               maxlength="80"
               autocomplete="off"
               placeholder="es. ASL Catanzaro, RSPP Impresa X…"
               class="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm
                      focus:outline-none focus:ring-2 focus:ring-blue-500">
      </div>

      <!-- Numero -->
      <div>
        <label for="rubrica-numero" class="block text-xs font-medium text-slate-700 mb-1.5">
          Numero di telefono
          <span class="text-red-500" aria-hidden="true">*</span>
          <span class="sr-only">(obbligatorio)</span>
        </label>
        <input id="rubrica-numero"
               type="tel"
               x-model="form.numero"
               maxlength="30"
               autocomplete="off"
               placeholder="es. 0961 883111"
               class="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm
                      focus:outline-none focus:ring-2 focus:ring-blue-500">
        <p class="text-xs text-slate-400 mt-1">Cifre, +, -, spazi, parentesi (max 30 car.).</p>
      </div>

      <!-- Categoria -->
      <div>
        <label for="rubrica-categoria" class="block text-xs font-medium text-slate-700 mb-1.5">
          Categoria
        </label>
        <select id="rubrica-categoria"
                x-model="form.categoria"
                class="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm
                       focus:outline-none focus:ring-2 focus:ring-blue-500">
          <option value="">— Nessuna —</option>
          <template x-for="cat in _categorie()" :key="cat.valore">
            <option :value="cat.valore" x-text="cat.etichetta"></option>
          </template>
        </select>
      </div>

      <!-- Nota -->
      <div>
        <label for="rubrica-nota" class="block text-xs font-medium text-slate-700 mb-1.5">
          Nota <span class="text-slate-400 font-normal">(facoltativa)</span>
        </label>
        <textarea id="rubrica-nota"
                  x-model="form.nota"
                  rows="2"
                  maxlength="200"
                  placeholder="es. Zona Catanzaro Lido · lun-ven ore 8-13"
                  class="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm resize-none
                         focus:outline-none focus:ring-2 focus:ring-blue-500"></textarea>
      </div>

    </div><!-- /drawer-body -->

    <div class="drawer-footer flex items-center justify-end gap-3">
      <button @click="chiudiDrawer()" :disabled="salvando"
              class="text-sm text-slate-600 hover:text-slate-800 px-4 py-2 border border-slate-300
                     rounded-lg hover:bg-slate-50 transition-colors disabled:opacity-50
                     focus:outline-none focus:ring-2 focus:ring-slate-400">
        Annulla
      </button>
      <button @click="salva()" :disabled="salvando"
              class="text-sm bg-blue-600 hover:bg-blue-700 text-white font-medium
                     px-5 py-2 rounded-lg transition-colors disabled:opacity-50
                     focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2">
        <span x-show="!salvando" x-text="formNuova ? 'Aggiungi' : 'Salva modifiche'"></span>
        <span x-show="salvando">⏳ Salvataggio…</span>
      </button>
    </div>

  </aside><!-- /drawer -->

</div>`;

// ── Registrazione ─────────────────────────────────────────────────────────────

window.MODULI_REGISTRATI['numeri-utili'] = {
  monta(contenitore) {
    contenitore.innerHTML = _TEMPLATE_NUMERI_UTILI;
  },
};
