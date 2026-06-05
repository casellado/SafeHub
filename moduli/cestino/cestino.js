/**
 * cestino.js — Modulo Cestino: vista unificata degli elementi eliminati.
 *
 * Prima release (#2a): sezione Cantieri nel cestino.
 * Le entità anagrafiche (lavoratori, imprese, ecc.) arriveranno nell'intervento #2b.
 *
 * Cantieri cestinati: letti da cantieri_cache (stato === 'cestinato') — lista piatta, veloce.
 * _cestinato_il: non è in cache, si legge dal file anagrafica per ogni cestinato.
 * Ripristino: riusa aggiornaDatiLotto (stesso meccanismo della scheda cantiere).
 * Eliminazione definitiva: svuotaCantiereDaIdb + avviso persistente sulla cartella disco.
 */

// ============================================================
// COMPONENTE ALPINE
// ============================================================

function CestinoCruscotto() {
  return {
    cantieri:        [],
    caricamento:     true,
    ripristinando:   null,   // cantiere_id in corso di ripristino
    eliminando:      null,   // cantiere_id in corso di eliminazione definitiva
    confermaElimina: null,   // cantiere_id — step-1 conferma aperto
    step2Elimina:    null,   // cantiere_id — step-2 conferma aperto (definitivo)

    async init() {
      await this.carica();
    },

    async carica() {
      this.caricamento = true;
      try {
        const tutti     = await IDB.idbGetAll('cantieri_cache');
        const cestinati = tutti.filter(c => c.stato === 'cestinato');

        // Arricchisce ogni record con _cestinato_il letto dal file anagrafica
        this.cantieri = await Promise.all(
          cestinati.map(async (c) => {
            try {
              const anag = await CANTIERI_SERVICE.leggiAnagrafica(c.cantiere_id);
              return { ...c, _cestinato_il: anag.lotto?._cestinato_il ?? null };
            } catch {
              return { ...c, _cestinato_il: null };
            }
          })
        );

        // Ordina: più recenti in cima
        this.cantieri.sort((a, b) =>
          (b._cestinato_il ?? '').localeCompare(a._cestinato_il ?? '')
        );
      } catch (err) {
        ERRORI.gestisciErrore('cestino/carica', err);
      } finally {
        this.caricamento = false;
      }
    },

    formatData(iso) {
      if (!iso) return '—';
      return new Date(iso).toLocaleDateString('it-IT', {
        day: '2-digit', month: '2-digit', year: 'numeric',
      });
    },

    annullaConferma() {
      this.confermaElimina = null;
      this.step2Elimina    = null;
    },

    async ripristina(cantiere_id) {
      this.ripristinando = cantiere_id;
      try {
        // Legge il file per rimuovere _cestinato_il dal nodo lotto prima di salvare
        const anag = await CANTIERI_SERVICE.leggiAnagrafica(cantiere_id);
        const { _cestinato_il, ...lottoSenza } = anag.lotto;
        await CANTIERI_SERVICE.aggiornaDatiLotto(cantiere_id, { ...lottoSenza, stato: 'attivo' });
        await Alpine.store('cantieri').ricarica();
        this.cantieri = this.cantieri.filter(c => c.cantiere_id !== cantiere_id);
        NOTIFICHE.successo(`Cantiere ${cantiere_id} ripristinato`);
      } catch (err) {
        ERRORI.gestisciErrore('cestino/ripristina', err);
      } finally {
        this.ripristinando = null;
      }
    },

    async eliminaDefinitivamente(cantiere_id) {
      this.eliminando = cantiere_id;
      try {
        await CANTIERI_SERVICE.svuotaCantiereDaIdb(cantiere_id);
        await Alpine.store('cantieri').ricarica();
        this.cantieri        = this.cantieri.filter(c => c.cantiere_id !== cantiere_id);
        this.confermaElimina = null;
        this.step2Elimina    = null;
        NOTIFICHE.successo(`Cantiere ${cantiere_id} rimosso dall'app`);
        // Avviso persistente: la cartella su disco non è stata toccata
        NOTIFICHE.attenzione(
          'Cartella su disco da eliminare a mano',
          `SafeHub-CSE-Lavori/${cantiere_id}/ resta su disco. Eliminala da Esplora File quando vuoi liberarne lo spazio.`,
          0,
        );
      } catch (err) {
        ERRORI.gestisciErrore('cestino/elimina', err);
      } finally {
        this.eliminando = null;
      }
    },

    // ── Entità anagrafiche ──────────────────────────────────

    entita:               [],
    caricamentoEntita:    false,
    entitaCaricate:       false,
    sezioneEntitaAperta:  false,
    filtroEntitaCantiere: '',
    filtroEntitaTipo:     '',
    confermaEliminaEntita: null,   // entity id — step-1
    step2EliminaEntita:    null,   // entity id — step-2
    ripristinaEntitaId:    null,   // entity id in corso di ripristino
    eliminandoEntitaId:    null,   // entity id in corso di eliminazione

    get entitaFiltrate() {
      return this.entita.filter(e =>
        (!this.filtroEntitaCantiere || e.cantiere_id === this.filtroEntitaCantiere) &&
        (!this.filtroEntitaTipo     || e.tipo         === this.filtroEntitaTipo)
      );
    },

    get cantierUnici() {
      const mappa = new Map();
      for (const e of this.entita) {
        if (!mappa.has(e.cantiere_id))
          mappa.set(e.cantiere_id, { cantiere_id: e.cantiere_id, cantiere_nome: e.cantiere_nome });
      }
      return [...mappa.values()];
    },

    get tipiUnici() {
      return [...new Set(this.entita.map(e => e.tipo))].sort();
    },

    async toggleSezioneEntita() {
      this.sezioneEntitaAperta = !this.sezioneEntitaAperta;
      // Carica le entità solo al primo expand
      if (this.sezioneEntitaAperta && !this.entitaCaricate) {
        await this.caricaEntita();
      }
    },

    async caricaEntita() {
      this.caricamentoEntita = true;
      try {
        const tuttiCantieri = await IDB.idbGetAll('cantieri_cache');
        const risultati = [];
        // Legge ogni anagrafica in parallelo; gli errori su singoli cantieri non bloccano gli altri
        await Promise.all(
          tuttiCantieri.map(async (c) => {
            try {
              const cestinate = await ANAGRAFICA_SERVICE.leggiEntitaCestinate(c.cantiere_id);
              risultati.push(...cestinate);
            } catch { /* cantiere non accessibile: continua */ }
          })
        );
        // Ordina per data eliminazione discendente (più recenti in cima)
        risultati.sort((a, b) => (b._eliminato_il ?? '').localeCompare(a._eliminato_il ?? ''));
        this.entita        = risultati;
        this.entitaCaricate = true;
      } catch (err) {
        ERRORI.gestisciErrore('cestino/carica-entita', err);
      } finally {
        this.caricamentoEntita = false;
      }
    },

    annullaConfermaEntita() {
      this.confermaEliminaEntita = null;
      this.step2EliminaEntita    = null;
    },

    async ripristinaEntita(cantiere_id, collezione, entita_id) {
      this.ripristinaEntitaId = entita_id;
      try {
        await ANAGRAFICA_SERVICE.ripristinaEntitaArbitraria(cantiere_id, collezione, entita_id);
        this.entita = this.entita.filter(e => e.id !== entita_id);
        NOTIFICHE.successo(`Entità ripristinata nel cantiere ${cantiere_id}`);
      } catch (err) {
        ERRORI.gestisciErrore('cestino/ripristina-entita', err);
      } finally {
        this.ripristinaEntitaId = null;
      }
    },

    async eliminaEntitaDefinitivamente(cantiere_id, collezione, entita_id) {
      this.eliminandoEntitaId = entita_id;
      try {
        await ANAGRAFICA_SERVICE.eliminaEntitaArbitraria(cantiere_id, collezione, entita_id);
        this.entita                = this.entita.filter(e => e.id !== entita_id);
        this.confermaEliminaEntita = null;
        this.step2EliminaEntita    = null;
        NOTIFICHE.successo('Entità eliminata definitivamente');
      } catch (err) {
        ERRORI.gestisciErrore('cestino/elimina-entita', err);
      } finally {
        this.eliminandoEntitaId = null;
      }
    },
  };
}

// ============================================================
// TEMPLATE
// ============================================================

const _TEMPLATE_CESTINO = `
<div x-data="CestinoCruscotto()" x-init="init()" class="max-w-3xl">

  <!-- Intestazione -->
  <div class="mb-6">
    <h1 class="text-2xl font-bold text-slate-800">🗑 Cestino</h1>
    <p class="text-sm text-slate-500 mt-1">
      Ripristina gli elementi o eliminali definitivamente dall'app.
      La cartella su disco non viene mai toccata dall'eliminazione definitiva.
    </p>
  </div>

  <!-- Stato di caricamento -->
  <div x-show="caricamento" class="py-16 text-center text-slate-400">
    <p class="text-sm">Caricamento…</p>
  </div>

  <div x-show="!caricamento">

    <!-- ── SEZIONE: Cantieri nel cestino ────────────────────── -->
    <section aria-labelledby="cestino-cantieri-hd">
      <h2 id="cestino-cantieri-hd"
          class="text-xs font-semibold text-slate-500 uppercase tracking-widest mb-3">
        Cantieri
      </h2>

      <!-- Stato vuoto -->
      <div x-show="cantieri.length === 0"
           class="py-12 text-center border border-dashed border-slate-200 rounded-xl bg-slate-50">
        <div class="text-3xl mb-2" aria-hidden="true">🗑</div>
        <p class="font-medium text-slate-600">Il cestino è vuoto</p>
        <p class="text-sm text-slate-400 mt-1">Nessun cantiere cestinato.</p>
      </div>

      <!-- Lista cantieri cestinati -->
      <ul class="space-y-3" role="list" x-show="cantieri.length > 0">
        <template x-for="c in cantieri" :key="c.cantiere_id">
          <li class="border border-slate-200 rounded-xl bg-white overflow-hidden">

            <!-- Riga principale: info + azioni -->
            <div class="flex items-start justify-between gap-4 p-4">
              <div class="min-w-0">
                <div class="flex items-center gap-2 flex-wrap">
                  <span class="font-mono text-sm font-semibold text-slate-700"
                        x-text="c.cantiere_id"></span>
                  <span class="text-slate-300" aria-hidden="true">—</span>
                  <span class="text-sm text-slate-700"
                        x-text="c.nome || '(denominazione non inserita)'"></span>
                </div>
                <p class="text-xs text-slate-400 mt-0.5">
                  Cestinato il <span x-text="formatData(c._cestinato_il)"></span>
                </p>
              </div>

              <!-- Pulsanti azione (nascosti quando è aperta la conferma per questa riga) -->
              <div x-show="confermaElimina !== c.cantiere_id"
                   class="flex items-center gap-2 flex-shrink-0">
                <button @click="ripristina(c.cantiere_id)"
                        :disabled="ripristinando === c.cantiere_id"
                        class="text-sm font-medium text-emerald-700 border border-emerald-300 bg-white
                               px-3 py-1.5 rounded-lg hover:bg-emerald-50 disabled:opacity-50
                               transition-colors whitespace-nowrap
                               focus:outline-none focus:ring-2 focus:ring-emerald-500">
                  <span x-text="ripristinando === c.cantiere_id ? 'Ripristino…' : '↩ Ripristina'"></span>
                </button>
                <button @click="confermaElimina = c.cantiere_id; step2Elimina = null"
                        class="text-sm font-medium text-red-600 border border-red-200 bg-white
                               px-3 py-1.5 rounded-lg hover:bg-red-50 transition-colors whitespace-nowrap
                               focus:outline-none focus:ring-2 focus:ring-red-500">
                  Elimina…
                </button>
              </div>
            </div>

            <!-- Conferma step-1: avviso e prima conferma -->
            <div x-show="confermaElimina === c.cantiere_id && step2Elimina !== c.cantiere_id"
                 class="border-t border-amber-200 bg-amber-50 p-4">
              <p class="text-sm font-semibold text-amber-900 mb-1">⚠ Eliminazione definitiva</p>
              <p class="text-xs text-amber-700 mb-3">
                Il cantiere <strong x-text="c.cantiere_id"></strong> sarà rimosso dall'app
                (dati e cache). La cartella su disco resterà e dovrà essere eliminata a mano.
                Questa azione non può essere annullata.
              </p>
              <div class="flex items-center gap-3">
                <button @click="step2Elimina = c.cantiere_id"
                        class="text-sm font-semibold text-red-700 border border-red-300 bg-white
                               px-4 py-2 rounded-lg hover:bg-red-50 transition-colors
                               focus:outline-none focus:ring-2 focus:ring-red-500">
                  Sì, voglio eliminarlo
                </button>
                <button @click="annullaConferma()"
                        class="text-sm text-slate-500 hover:text-slate-700
                               focus:outline-none focus:ring-2 focus:ring-slate-400 rounded px-2">
                  Annulla
                </button>
              </div>
            </div>

            <!-- Conferma step-2: definitiva e irreversibile -->
            <div x-show="step2Elimina === c.cantiere_id"
                 class="border-t border-red-300 bg-red-50 p-4">
              <p class="text-sm font-semibold text-red-900 mb-1">⛔ Conferma finale — azione irreversibile</p>
              <p class="text-xs text-red-700 mb-3">
                Il cantiere <strong x-text="c.cantiere_id"></strong> sarà rimosso definitivamente
                dall'app. La cartella
                <code class="font-mono bg-red-100 px-1 rounded"
                      x-text="'SafeHub-CSE-Lavori/' + c.cantiere_id + '/'"></code>
                resterà su disco: eliminala da Esplora File.
              </p>
              <div class="flex items-center gap-3">
                <button @click="eliminaDefinitivamente(c.cantiere_id)"
                        :disabled="eliminando === c.cantiere_id"
                        class="text-sm font-semibold bg-red-600 hover:bg-red-700 text-white
                               disabled:opacity-50 px-4 py-2 rounded-lg transition-colors
                               focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2">
                  <span x-text="eliminando === c.cantiere_id ? 'Eliminazione…' : 'Elimina definitivamente'"></span>
                </button>
                <button @click="annullaConferma()" :disabled="eliminando === c.cantiere_id"
                        class="text-sm text-slate-500 hover:text-slate-700 disabled:opacity-50
                               focus:outline-none focus:ring-2 focus:ring-slate-400 rounded px-2">
                  Annulla
                </button>
              </div>
            </div>

          </li>
        </template>
      </ul>
    </section>

    <!-- ── SEZIONE: Entità anagrafiche nel cestino (lazy) ─── -->
    <section class="mt-8" aria-labelledby="cestino-entita-hd">

      <!-- Header collassabile -->
      <button @click="toggleSezioneEntita()"
              class="flex items-center justify-between w-full text-left py-1 mb-3 group"
              :aria-expanded="sezioneEntitaAperta">
        <h2 id="cestino-entita-hd"
            class="text-xs font-semibold text-slate-500 uppercase tracking-widest">
          Entità anagrafiche
          <span x-show="entitaCaricate && entita.length > 0"
                class="normal-case tracking-normal font-normal text-slate-400"
                x-text="'(' + entita.length + ')'"></span>
        </h2>
        <span class="text-xs text-slate-400 group-hover:text-slate-600 transition-colors"
              x-text="sezioneEntitaAperta ? '▲ Chiudi' : '▼ Espandi'"></span>
      </button>

      <div x-show="sezioneEntitaAperta">

        <!-- Spinner caricamento lazy -->
        <div x-show="caricamentoEntita" class="py-8 text-center text-slate-400">
          <p class="text-sm">Caricamento entità da tutti i cantieri…</p>
        </div>

        <div x-show="!caricamentoEntita && entitaCaricate">

          <!-- Filtri -->
          <div x-show="entita.length > 0" class="flex gap-3 mb-4 flex-wrap">
            <select x-model="filtroEntitaCantiere"
                    class="text-sm border border-slate-200 rounded-lg px-3 py-1.5 bg-white
                           focus:outline-none focus:ring-2 focus:ring-blue-500">
              <option value="">Tutti i cantieri</option>
              <template x-for="c in cantierUnici" :key="c.cantiere_id">
                <option :value="c.cantiere_id"
                        x-text="c.cantiere_id + (c.cantiere_nome ? ' — ' + c.cantiere_nome : '')"></option>
              </template>
            </select>
            <select x-model="filtroEntitaTipo"
                    class="text-sm border border-slate-200 rounded-lg px-3 py-1.5 bg-white
                           focus:outline-none focus:ring-2 focus:ring-blue-500">
              <option value="">Tutti i tipi</option>
              <template x-for="t in tipiUnici" :key="t">
                <option :value="t" x-text="t"></option>
              </template>
            </select>
          </div>

          <!-- Stato vuoto totale -->
          <div x-show="entita.length === 0"
               class="py-10 text-center border border-dashed border-slate-200 rounded-xl bg-slate-50">
            <p class="font-medium text-slate-600">Nessuna entità nel cestino</p>
            <p class="text-sm text-slate-400 mt-1">Lavoratori, imprese, mezzi e altri elementi sono tutti attivi.</p>
          </div>

          <!-- Lista entità cestinate -->
          <ul class="space-y-2" role="list" x-show="entita.length > 0">
            <template x-for="e in entitaFiltrate" :key="e.id">
              <li class="border border-slate-200 rounded-xl bg-white overflow-hidden">

                <!-- Riga principale: info + azioni -->
                <div class="flex items-start justify-between gap-4 p-3">
                  <div class="min-w-0">
                    <div class="flex items-center gap-2 flex-wrap">
                      <span class="text-xs font-medium px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 whitespace-nowrap"
                            x-text="e.tipo"></span>
                      <span class="text-sm font-medium text-slate-700 truncate"
                            x-text="e.nome"></span>
                    </div>
                    <p class="text-xs text-slate-400 mt-0.5">
                      Cantiere <span class="font-mono" x-text="e.cantiere_id"></span>
                      <template x-if="e.cantiere_nome">
                        <span x-text="' — ' + e.cantiere_nome"></span>
                      </template>
                      &middot; Eliminato il <span x-text="formatData(e._eliminato_il)"></span>
                    </p>
                  </div>

                  <!-- Azioni (nascoste durante la conferma per questa riga) -->
                  <div x-show="confermaEliminaEntita !== e.id"
                       class="flex items-center gap-2 flex-shrink-0">
                    <button @click="ripristinaEntita(e.cantiere_id, e.collezione, e.id)"
                            :disabled="ripristinaEntitaId === e.id"
                            class="text-xs font-medium text-emerald-700 border border-emerald-300 bg-white
                                   px-2.5 py-1.5 rounded-lg hover:bg-emerald-50 disabled:opacity-50
                                   transition-colors whitespace-nowrap
                                   focus:outline-none focus:ring-2 focus:ring-emerald-500">
                      <span x-text="ripristinaEntitaId === e.id ? 'Ripristino…' : '↩ Ripristina'"></span>
                    </button>
                    <button @click="confermaEliminaEntita = e.id; step2EliminaEntita = null"
                            class="text-xs font-medium text-red-600 border border-red-200 bg-white
                                   px-2.5 py-1.5 rounded-lg hover:bg-red-50 transition-colors whitespace-nowrap
                                   focus:outline-none focus:ring-2 focus:ring-red-500">
                      Elimina&hellip;
                    </button>
                  </div>
                </div>

                <!-- Conferma step-1: primo avviso -->
                <div x-show="confermaEliminaEntita === e.id && step2EliminaEntita !== e.id"
                     class="border-t border-amber-200 bg-amber-50 p-3">
                  <p class="text-xs font-semibold text-amber-900 mb-1">&#9888; Eliminazione definitiva</p>
                  <p class="text-xs text-amber-700 mb-2">
                    <strong x-text="e.nome"></strong> sarà rimosso definitivamente
                    dall'anagrafica del cantiere <strong x-text="e.cantiere_id"></strong>.
                    Questa azione non può essere annullata.
                  </p>
                  <div class="flex items-center gap-3">
                    <button @click="step2EliminaEntita = e.id"
                            class="text-xs font-semibold text-red-700 border border-red-300 bg-white
                                   px-3 py-1.5 rounded-lg hover:bg-red-50 transition-colors
                                   focus:outline-none focus:ring-2 focus:ring-red-500">
                      Sì, voglio eliminarlo
                    </button>
                    <button @click="annullaConfermaEntita()"
                            class="text-xs text-slate-500 hover:text-slate-700
                                   focus:outline-none focus:ring-2 focus:ring-slate-400 rounded px-2">
                      Annulla
                    </button>
                  </div>
                </div>

                <!-- Conferma step-2: definitiva e irreversibile -->
                <div x-show="step2EliminaEntita === e.id"
                     class="border-t border-red-300 bg-red-50 p-3">
                  <p class="text-xs font-semibold text-red-900 mb-1">&#9940; Conferma finale</p>
                  <p class="text-xs text-red-700 mb-2">
                    <strong x-text="e.nome"></strong> sarà eliminato definitivamente
                    dall'anagrafica del cantiere <strong x-text="e.cantiere_id"></strong>.
                  </p>
                  <div class="flex items-center gap-3">
                    <button @click="eliminaEntitaDefinitivamente(e.cantiere_id, e.collezione, e.id)"
                            :disabled="eliminandoEntitaId === e.id"
                            class="text-xs font-semibold bg-red-600 hover:bg-red-700 text-white
                                   disabled:opacity-50 px-3 py-1.5 rounded-lg transition-colors
                                   focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2">
                      <span x-text="eliminandoEntitaId === e.id ? 'Eliminazione…' : 'Elimina definitivamente'"></span>
                    </button>
                    <button @click="annullaConfermaEntita()" :disabled="eliminandoEntitaId === e.id"
                            class="text-xs text-slate-500 hover:text-slate-700 disabled:opacity-50
                                   focus:outline-none focus:ring-2 focus:ring-slate-400 rounded px-2">
                      Annulla
                    </button>
                  </div>
                </div>

              </li>
            </template>
          </ul>

          <!-- Empty state dopo filtro (entità ci sono ma nessuna corrisponde) -->
          <div x-show="entita.length > 0 && entitaFiltrate.length === 0"
               class="py-6 text-center text-slate-400 text-sm">
            Nessuna entità corrisponde ai filtri selezionati.
          </div>

        </div>
      </div>

    </section>

  </div>
</div>
`;

// ============================================================
// Registrazione nel registry moduli
// ============================================================

window.MODULI_REGISTRATI = window.MODULI_REGISTRATI ?? {};

window.MODULI_REGISTRATI['cestino'] = {
  monta(contenitore) { contenitore.innerHTML = _TEMPLATE_CESTINO; },
};
