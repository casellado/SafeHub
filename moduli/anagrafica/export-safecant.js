/**
 * export-safecant.js — M4 Fase 7: Export anagrafica variante leggera per SafeCant.
 *
 * Produce anagrafica_<cantiereId>_YYYY-MM-DD.json in SafeHub-Anagrafiche/,
 * la cartella OneDrive condivisa che SafeCant importa.
 *
 * Schema: identico al canonico v2.0, variante leggera (base64 svuotati,
 * entità e sotto-documenti cestinati esclusi, campi interni rimossi).
 * SafeCant legge le stesse chiavi senza trasformazioni — vedi SafeCant-Allineamento-e-Fix.md.
 *
 * Handle SafeHub-Anagrafiche/: picker una-tantum (pattern M1), poi automatico.
 * Chiave IDB: impostazioni_archivio → anagrafiche_handle.
 */

// ── Componente Alpine ─────────────────────────────────────────────────────────

function ExportSafeCant() {
  return {
    caricamento:            false,
    exporting:              false,
    confermaAperta:         false,
    validazione:            null,   // { ok: bool, warnings: [] } — risultato _validaPreExport

    // Stato export (tracciato per il badge "modifiche non esportate")
    ultimoExport:           null,   // ISO timestamp dell'ultimo export di questo cantiere
    ultimoExportCantiere:   null,   // cantiere_id dell'ultimo export
    datiGeneratoIl:         null,   // snapshot di ANAGRAFICA_SERVICE.dati.generato_il

    // Riepilogo entità per il pannello informativo
    riepilogo:              null,   // { n_imprese, n_lavoratori, n_mezzi, n_att, n_noli }

    _cantiereId:            null,

    // ── Computed ─────────────────────────────────────────────────────────────

    get haModificheNonEsportate() {
      if (!this.ultimoExport)                                   return false;
      if (this.ultimoExportCantiere !== this._cantiereId)       return false;
      if (!this.datiGeneratoIl)                                 return false;
      // Se l'anagrafica è stata salvata DOPO l'ultimo export → modifiche pendenti
      return this.datiGeneratoIl > this.ultimoExport;
    },

    // ── Apertura pannello conferma con pre-validazione ────────────────────────

    apriConferma() {
      this.validazione    = ANAGRAFICA_SERVICE.validaPreExport();
      this.confermaAperta = true;
    },

    // ── Lifecycle ─────────────────────────────────────────────────────────────

    init() {
      this._cantiereId = Alpine.store('cantiere')?.id;
      if (this._cantiereId) this.caricaDati();
    },

    aggiornaSeCantiereRicambia() {
      const id = Alpine.store('cantiere')?.id;
      if (id !== this._cantiereId) {
        this._cantiereId          = id;
        this.confermaAperta       = false;
        this.validazione          = null;
        this.ultimoExport         = null;
        this.ultimoExportCantiere = null;
        this.riepilogo            = null;
        this.datiGeneratoIl       = null;
        if (id) this.caricaDati();
      }
    },

    async caricaDati() {
      this.caricamento = true;
      try {
        // Ultimo export (per badge "modifiche non esportate")
        const rec = await IDB.idbGet('impostazioni_archivio', 'ultimo_export_anagrafica').catch(() => null);
        if (rec?.cantiere === this._cantiereId) {
          this.ultimoExport         = rec.value;
          this.ultimoExportCantiere = rec.cantiere;
        } else {
          this.ultimoExport = null;
        }

        // Snapshot generato_il per il confronto con l'ultimo export
        this.datiGeneratoIl = ANAGRAFICA_SERVICE.dati?.generato_il ?? null;

        // Conteggi entità (escluse cestinate)
        const d = ANAGRAFICA_SERVICE.dati;
        this.riepilogo = d ? {
          n_imprese:      (d.imprese ?? []).filter(e => !e._cestino).length,
          n_lavoratori:   (d.lavoratori ?? []).filter(e => !e._cestino).length,
          n_mezzi:        (d.mezzi ?? []).filter(e => !e._cestino).length,
          n_att:          (d.attrezzature ?? []).filter(e => !e._cestino).length,
          n_noli:         (d.noli ?? []).filter(e => !e._cestino).length,
        } : null;
      } finally {
        this.caricamento = false;
      }
    },

    // ── Export ────────────────────────────────────────────────────────────────

    async esporta() {
      if (this.exporting) return;
      this.exporting      = true;
      this.confermaAperta = false;

      try {
        // ── 1. Ottieni l'handle di SafeHub-Anagrafiche/ ──────────────────────
        const stored = await IDB.idbGet('impostazioni_archivio', 'anagrafiche_handle').catch(() => null);
        let anagHandle = stored?.handle ?? null;

        if (anagHandle) {
          // Controlla il permesso (scade ad ogni sessione browser)
          const perm = await anagHandle.queryPermission({ mode: 'readwrite' });
          if (perm === 'prompt') {
            const req = await anagHandle.requestPermission({ mode: 'readwrite' });
            if (req !== 'granted') anagHandle = null;
          } else if (perm === 'denied') {
            anagHandle = null;
          }
        }

        if (!anagHandle) {
          // Prima volta o permesso negato → picker (una-tantum)
          try {
            anagHandle = await window.showDirectoryPicker({
              mode: 'readwrite',
              id: 'safehub-anagrafiche',
            });
            await IDB.idbPut('impostazioni_archivio', { key: 'anagrafiche_handle', handle: anagHandle });
          } catch (err) {
            if (err.name !== 'AbortError') {
              ERRORI.gestisciErrore('export/picker', err);
            }
            return;  // utente ha annullato o errore
          }
        }

        // ── 2. Genera la variante leggera ────────────────────────────────────
        const leggera     = ANAGRAFICA_SERVICE.esportaLeggera();
        const cantiereId  = ANAGRAFICA_SERVICE.cantiereId;
        const dataOggi    = new Date().toISOString().slice(0, 10);
        const filename    = `anagrafica_${cantiereId}_${dataOggi}.json`;

        // ── 3. Scrive il file ────────────────────────────────────────────────
        await FILESYSTEM.scriviJson(anagHandle, filename, leggera);

        // ── 4. Salva il timestamp dell'export (per il badge) ─────────────────
        const now = new Date().toISOString();
        await IDB.idbPut('impostazioni_archivio', {
          key:      'ultimo_export_anagrafica',
          value:    now,
          cantiere: cantiereId,
        });
        this.ultimoExport         = now;
        this.ultimoExportCantiere = cantiereId;
        // Aggiorna snapshot: dopo l'export, datiGeneratoIl ≤ ultimoExport → badge scompare
        this.datiGeneratoIl       = leggera.generato_il;

        NOTIFICHE.successo(
          'Export completato',
          `File "${filename}" scritto in SafeHub-Anagrafiche. I colleghi vedranno l'aggiornamento al prossimo sync.`
        );

      } catch (err) {
        ERRORI.gestisciErrore('export/esporta', err);
      } finally {
        this.exporting = false;
      }
    },

    // ── Helpers UI ────────────────────────────────────────────────────────────

    formatExport() {
      return this.ultimoExport ? UTILS.formatDataOra(this.ultimoExport) : null;
    },
  };
}

// ── Template HTML ─────────────────────────────────────────────────────────────

const _TEMPLATE_EXPORT = `
<div x-data="ExportSafeCant()" x-init="init()" x-effect="aggiornaSeCantiereRicambia()" class="max-w-2xl">

  <!-- Header -->
  <div class="flex items-center justify-between mb-5">
    <div>
      <h1 class="text-xl font-semibold text-slate-800">📤 Esporta per SafeCant</h1>
      <p class="text-xs text-slate-400 mt-0.5">Genera l'anagrafica leggera per i colleghi ispettori</p>
    </div>
    <button @click="caricaDati()" title="Aggiorna"
            class="text-xs text-slate-400 hover:text-slate-700 px-3 py-1.5 border border-slate-200 rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-slate-400">
      ↻ Aggiorna
    </button>
  </div>

  <!-- Nessun cantiere -->
  <div x-show="!$store.cantiere.id" class="placeholder-modulo">
    <div class="text-3xl" aria-hidden="true">📤</div>
    <p class="text-slate-500">Seleziona un cantiere per esportare l'anagrafica.</p>
  </div>

  <div x-show="$store.cantiere.id">

    <!-- Spinner -->
    <div x-show="caricamento" class="flex items-center gap-3 py-10 text-slate-400 text-sm">
      <div class="w-5 h-5 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
      Caricamento…
    </div>

    <div x-show="!caricamento" class="space-y-4">

      <!-- ── Card cantiere + conteggi ───────────────────────────────────── -->
      <div class="border border-slate-200 bg-white rounded-xl p-5">
        <div class="flex items-start justify-between mb-3">
          <div>
            <p class="text-xs text-slate-400 uppercase tracking-wide">Cantiere corrente</p>
            <p class="font-semibold text-slate-800 mt-0.5" x-text="$store.cantiere.nome || $store.cantiere.id || '—'"></p>
            <p class="text-xs font-mono text-slate-400" x-text="$store.cantiere.id"></p>
          </div>
        </div>

        <!-- Conteggi entità -->
        <template x-if="riepilogo">
          <div class="grid grid-cols-5 gap-2 mt-3 pt-3 border-t border-slate-100">
            <template x-for="[k, v, icona] in [
              ['Imprese',      riepilogo.n_imprese,    '🏢'],
              ['Lavoratori',   riepilogo.n_lavoratori, '👷'],
              ['Mezzi',        riepilogo.n_mezzi,      '🚜'],
              ['Attrezzature', riepilogo.n_att,        '🔧'],
              ['Noli',         riepilogo.n_noli,       '🔗']
            ]" :key="k">
              <div class="text-center">
                <div class="text-lg font-bold text-slate-700" x-text="v"></div>
                <div class="text-xs text-slate-400 mt-0.5" x-text="icona + ' ' + k"></div>
              </div>
            </template>
          </div>
        </template>

        <div x-show="!riepilogo" class="text-xs text-amber-600 mt-2">
          ℹ Anagrafica non ancora caricata per questo cantiere.
        </div>
      </div>

      <!-- ── Stato export ────────────────────────────────────────────────── -->
      <div class="border border-slate-200 bg-white rounded-xl p-5">
        <p class="text-sm font-semibold text-slate-700 mb-2">Stato export verso SafeCant</p>

        <div x-show="!ultimoExport" class="text-sm text-slate-500">
          Questo cantiere non è ancora stato esportato.
        </div>

        <div x-show="ultimoExport" class="space-y-2">
          <p class="text-sm text-slate-600">
            Ultimo export: <strong class="text-slate-800" x-text="formatExport()"></strong>
          </p>

          <!-- Badge modifiche non esportate -->
          <div x-show="haModificheNonEsportate"
               class="flex items-center gap-2 text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2"
               role="alert">
            <span aria-hidden="true">⚠</span>
            <span>Ci sono modifiche all'anagrafica successive all'ultimo export. I colleghi stanno lavorando con una versione precedente.</span>
          </div>

          <!-- Badge tutto ok -->
          <div x-show="!haModificheNonEsportate"
               class="flex items-center gap-2 text-sm text-green-700 bg-green-50 border border-green-200 rounded-lg px-3 py-2">
            <span aria-hidden="true">✓</span>
            <span>SafeCant è allineato all'anagrafica corrente.</span>
          </div>
        </div>
      </div>

      <!-- ── Pulsante export ─────────────────────────────────────────────── -->
      <div x-show="!confermaAperta" class="space-y-3">
        <button @click="apriConferma()"
                :disabled="!riepilogo"
                class="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-semibold
                       py-3 px-6 rounded-xl transition-colors
                       focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2">
          📤 Esporta anagrafica per SafeCant
        </button>
        <p class="text-xs text-slate-400 text-center">
          Vengono esportati solo i dati identificativi (nomi, mansioni, scadenze, targhe).
          I documenti PDF/PNG rimangono su questo PC e non vengono mai trasmessi.
        </p>
      </div>

      <!-- ── Pannello conferma (inline, senza drawer) ─────────────────────── -->
      <div x-show="confermaAperta"
           class="border border-blue-200 bg-blue-50 rounded-xl p-5 space-y-4">
        <div>
          <p class="font-semibold text-slate-800 mb-1">
            Esportare l'anagrafica per SafeCant?
          </p>
          <p class="text-sm text-slate-600">
            Verrà scritto il file
            <code class="bg-slate-100 px-1 rounded text-xs"
                  x-text="'anagrafica_' + $store.cantiere.id + '_' + new Date().toISOString().slice(0,10) + '.json'">
            </code>
            nella cartella <code class="bg-slate-100 px-1 rounded text-xs">SafeHub-Anagrafiche</code>.
          </p>
          <p class="text-xs text-slate-400 mt-1">
            I colleghi vedranno l'aggiornamento al prossimo sync di OneDrive.
          </p>
        </div>

        <!-- Note al primo export -->
        <div x-show="!ultimoExport"
             class="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
          Primo export: ti verrà chiesto di selezionare la cartella <strong>SafeHub-Anagrafiche</strong> su OneDrive.
          Verrà ricordata automaticamente per i prossimi export.
        </div>

        <!-- ── Warning incompletezze (non bloccante) ───────────────────────── -->
        <template x-if="validazione && !validazione.ok">
          <div class="border border-amber-200 bg-amber-50 rounded-lg px-3 py-3 space-y-2">
            <p class="text-xs font-semibold text-amber-800">
              Alcuni dati sono incompleti — SafeCant potrebbe non visualizzarli correttamente.
              Puoi esportare comunque e correggere alla fonte prima del prossimo export.
            </p>
            <ul class="space-y-1.5" role="list">
              <template x-for="w in validazione.warnings" :key="w.etichetta">
                <li class="text-xs text-amber-700">
                  <span class="font-medium" x-text="'⚠ ' + w.etichetta"></span>
                  <template x-if="w.dettaglio && w.dettaglio.length">
                    <span class="text-amber-600" x-text="': ' + w.dettaglio.join(', ')"></span>
                  </template>
                </li>
              </template>
            </ul>
          </div>
        </template>

        <div class="flex gap-3">
          <button @click="confermaAperta = false"
                  class="flex-1 text-sm text-slate-600 hover:text-slate-800 py-2 border border-slate-300
                         rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-slate-400">
            Annulla
          </button>
          <button @click="esporta()" :disabled="exporting"
                  class="flex-1 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-medium
                         py-2 rounded-lg transition-colors
                         focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2">
            <span x-text="exporting ? '⏳ Esportazione…' : '✓ Conferma ed esporta'"></span>
          </button>
        </div>
      </div>

    </div><!-- /!caricamento -->
  </div><!-- /$store.cantiere.id -->

</div>
`;

// ── Registrazione ──────────────────────────────────────────────────────────

window.MODULI_REGISTRATI = window.MODULI_REGISTRATI ?? {};
window.MODULI_REGISTRATI['export-safecant'] = {
  monta(contenitore) { contenitore.innerHTML = _TEMPLATE_EXPORT; },
};
