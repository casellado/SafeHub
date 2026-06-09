/**
 * impostazioni.js — Modulo M2: Impostazioni Globali del PO.
 *
 * Interfaccia a 6 tab per configurare identità CSE, firma permanente (upload PNG),
 * logo aziendale, moduli qualità, soglie di scadenza e preferenze app.
 *
 * Registrato in MODULI_REGISTRATI['impostazioni'] (pattern modulo reale).
 * Legge da IMPOSTAZIONI_SERVICE (caricato al boot in completaAvvio) e scrive
 * su file tramite IMPOSTAZIONI_SERVICE.salva().
 */

// ---- Etichette leggibili per le chiavi dei dati ----

const ETICHETTE_SOGLIE = {
  abilitazione_operatore:   'Abilitazione/patentino operatore',
  verifica_periodica_mezzo:            'Verifica periodica mezzo sollevamento',
  verifica_mezzo_non_sollevamento:     'Verifica periodica mezzo (non sollevamento)',
  verifica_attrezzatura:               'Verifica ordinaria attrezzatura',
  nolo_fine_contratto:                 'Scadenza contratto di nolo',
  idoneita_sanitaria:       'Idoneità sanitaria lavoratore',
  pimus_ponteggi:           'PiMUS / autorizzazione ponteggi',
  patente_crediti:          'Patente a crediti impresa',
  formazione:               'Attestato di formazione',
  durc:                     'DURC',
  polizza_rc:               'Polizza RC',
  default:                  'Altri documenti (default)',
};

const ETICHETTE_MODULI = {
  'verbale-sopralluogo':  'Verbale di sopralluogo',
  'verbale-riunione':     'Verbale di riunione coordinamento',
  'verifica-pos':         'Verifica idoneità POS',
  'verifica-itp':         'Verifica idoneità tecnico-professionale',
  'proposta-sospensione': 'Proposta di sospensione lavori',
  'non-conformita':       'Non conformità',
  'evento-incidentale':   'Evento incidentale',
};

// ---- Factory del componente Alpine ----

function Impostazioni() {
  return {
    tabAttiva:   'identita',
    salvando:    false,
    feedbackMsg: null,

    // Copie locali in editing (non salvate finché l'utente non clicca Salva)
    cse:           {},
    firma:         {},
    logo:          {},
    moduliQualita: {},
    soglie:        {},
    preferenze:    {},
    ai:            {},

    // Tab AI — capability + lista modelli
    aiDisponibile:  null,   // null=verifica in corso, true, false
    modelliAi:      [],

    // Mini UI di test del ponte (temporanea, collaudo)
    aiTestPrompt:      '',
    aiTestRisposta:    '',
    aiTestGenerando:   false,
    _aiTestController: null,

    // Staging upload: file selezionato ma non ancora salvato
    firmaStaging: null,
    logoStaging:  null,

    // Avvisi inline per le soglie critiche (guardrail)
    avvisiSoglie: {},

    // Espone le costanti al template Alpine (che non può accedere a variabili di modulo)
    etichetteMod()    { return ETICHETTE_MODULI; },
    etichetteSoglie() { return ETICHETTE_SOGLIE; },

    // ---- Lifecycle ----

    init() {
      const d = IMPOSTAZIONI_SERVICE.dati;
      if (!d) return;
      this.cse           = { ...d.cse };
      this.firma         = { ...d.firma_permanente };
      this.logo          = { ...d.logo_aziendale };
      this.moduliQualita = JSON.parse(JSON.stringify(d.moduli_qualita));
      this.soglie        = JSON.parse(JSON.stringify(d.soglie_scadenza));
      this.preferenze    = { ...d.preferenze_app };
      this.ai            = { ...(d.ai ?? IMPOSTAZIONI_SERVICE.DEFAULT.ai) };
      this._verificaAi();
    },

    // ---- Helper ----

    mostraFeedback(msg) {
      this.feedbackMsg = msg;
      setTimeout(() => { this.feedbackMsg = null; }, 3000);
    },

    async eseguiSalvataggio(aggiornamenti, etichetta) {
      this.salvando = true;
      try {
        await IMPOSTAZIONI_SERVICE.salva(aggiornamenti);
        this.mostraFeedback(`✓ ${etichetta} salvato`);
      } catch (err) {
        ERRORI.gestisciErrore(`impostazioni/salva-${etichetta}`, err);
      } finally {
        this.salvando = false;
      }
    },

    // ---- Identità CSE ----

    async salvaIdentita() {
      if (!this.cse.nome_cognome?.trim()) {
        NOTIFICHE.attenzione('Identità CSE', 'Nome e cognome consigliato per i documenti.');
      }
      await this.eseguiSalvataggio({ cse: { ...this.cse } }, 'Identità CSE');
    },

    // ---- Firma permanente (solo upload PNG) ----

    async onFirmaFileSelezionato(event) {
      const file = event.target.files?.[0];
      if (!file) return;
      if (!file.type.startsWith('image/')) {
        NOTIFICHE.attenzione('Firma', 'Seleziona un file immagine PNG.');
        return;
      }
      this.firmaStaging = await _leggiFileBase64(file);
    },

    annullaFirmaStaging() {
      this.firmaStaging = null;
      const inp = document.getElementById('firma-file-input');
      if (inp) inp.value = '';
    },

    async salvaFirma() {
      if (!this.firmaStaging) return;
      this.firma = {
        firma_png_base64: this.firmaStaging,
        acquisita_il:     new Date().toISOString(),
        tipo_firma:       'permanente',
      };
      await this.eseguiSalvataggio({ firma_permanente: { ...this.firma } }, 'Firma');
      this.firmaStaging = null;
    },

    async rimuoviFirma() {
      this.firma = { firma_png_base64: null, acquisita_il: null, tipo_firma: 'permanente' };
      this.firmaStaging = null;
      await this.eseguiSalvataggio({ firma_permanente: { ...this.firma } }, 'Firma');
    },

    // ---- Logo aziendale ----

    async onLogoFileSelezionato(event) {
      const file = event.target.files?.[0];
      if (!file) return;
      if (!file.type.startsWith('image/')) {
        NOTIFICHE.attenzione('Logo', 'Seleziona un file immagine PNG.');
        return;
      }
      this.logoStaging = await _leggiFileBase64(file);
    },

    annullaLogoStaging() {
      this.logoStaging = null;
      const inp = document.getElementById('logo-file-input');
      if (inp) inp.value = '';
    },

    async salvaLogo() {
      if (!this.logoStaging) return;
      this.logo = { png_base64: this.logoStaging, descrizione: this.logo.descrizione ?? '' };
      await this.eseguiSalvataggio({ logo_aziendale: { ...this.logo } }, 'Logo');
      this.logoStaging = null;
    },

    async rimuoviLogo() {
      this.logo = { png_base64: null, descrizione: '' };
      this.logoStaging = null;
      await this.eseguiSalvataggio({ logo_aziendale: { ...this.logo } }, 'Logo');
    },

    // ---- Moduli qualità ----

    async salvaModuliQualita() {
      await this.eseguiSalvataggio(
        { moduli_qualita: JSON.parse(JSON.stringify(this.moduliQualita)) },
        'Moduli qualità'
      );
    },

    // ---- Soglie di scadenza ----

    /**
     * Guardrail per soglie critiche: min 1 giorno.
     * Principio P3: non blocca, reimposta silenziosamente con avviso gentile.
     */
    validaSoglia(chiave) {
      const s  = this.soglie[chiave];
      if (!s) return;
      const gg = parseInt(s.giorni, 10);
      if (isNaN(gg) || gg < 1) {
        s.giorni = 1;
        if (s.criticita === 'critica') {
          this.avvisiSoglie = { ...this.avvisiSoglie, [chiave]: 'Minimo 1 giorno per le soglie critiche.' };
          setTimeout(() => {
            const av = { ...this.avvisiSoglie };
            delete av[chiave];
            this.avvisiSoglie = av;
          }, 4000);
        }
      }
    },

    async salvaSoglie() {
      for (const k of Object.keys(this.soglie)) this.validaSoglia(k);
      await this.eseguiSalvataggio(
        { soglie_scadenza: JSON.parse(JSON.stringify(this.soglie)) },
        'Soglie'
      );
    },

    // ---- Preferenze ----

    async salvaPreferenze() {
      await this.eseguiSalvataggio({ preferenze_app: { ...this.preferenze } }, 'Preferenze');
    },

    // ---- Assistente AI (tab ai) ----

    async _verificaAi() {
      if (typeof AI_BRIDGE === 'undefined') { this.aiDisponibile = false; return; }
      this.aiDisponibile = await AI_BRIDGE.disponibile();
      if (this.aiDisponibile) {
        this.modelliAi = await AI_BRIDGE.modelli();
      }
    },

    async salvaAi() {
      await this.eseguiSalvataggio({ ai: { ...this.ai } }, 'Impostazioni AI');
    },

    // Mini UI di test del ponte
    async aiTestGenera() {
      if (!this.aiTestPrompt.trim() || this.aiTestGenerando) return;
      this._aiTestController = new AbortController();
      this.aiTestGenerando   = true;
      this.aiTestRisposta    = '';
      try {
        await AI_BRIDGE.genera({
          prompt: this.aiTestPrompt,
          system: 'Sei un assistente per il Coordinatore della Sicurezza in Esecuzione (CSE). Rispondi in italiano, in modo conciso e professionale.',
          onToken: (tok) => { this.aiTestRisposta += tok; },
          signal:  this._aiTestController.signal,
        });
      } catch (err) {
        if (err.name !== 'AbortError') {
          this.aiTestRisposta = `⚠ ${err.message}`;
        }
      } finally {
        this.aiTestGenerando   = false;
        this._aiTestController = null;
      }
    },

    aiTestInterrompi() {
      this._aiTestController?.abort();
      this.aiTestGenerando = false;
    },
  };
}

// ---- Utilità private ----

/** Legge un File come DataURL base64. */
const _leggiFileBase64 = (file) =>
  new Promise((resolve, reject) => {
    const reader    = new FileReader();
    reader.onload   = (e) => resolve(e.target.result);
    reader.onerror  = ()  => reject(new Error('Lettura file non riuscita'));
    reader.readAsDataURL(file);
  });

// ---- Template HTML del modulo ----

const _TEMPLATE_IMPOSTAZIONI = `
<div x-data="Impostazioni()" x-init="init()" class="max-w-3xl">

  <!-- Header + feedback salvataggio -->
  <div class="flex items-center justify-between mb-6">
    <h1 class="text-xl font-semibold text-slate-800">⚙ Impostazioni</h1>
    <span x-show="feedbackMsg" x-text="feedbackMsg" aria-live="polite"
          class="text-sm text-green-700 bg-green-50 border border-green-200
                 px-3 py-1 rounded-full"></span>
  </div>

  <!-- Tab bar (role=tablist) -->
  <div role="tablist" aria-label="Sezioni impostazioni"
       class="flex flex-wrap gap-1 border-b border-slate-200 mb-6">
    <template x-for="[tid, tlabel] in [
        ['identita','Identità CSE'],['firma','Firma'],['logo','Logo'],
        ['moduli','Moduli qualità'],['soglie','Soglie scadenza'],['preferenze','Preferenze'],
        ['ai','🤖 Assistente AI']
      ]" :key="tid">
      <button role="tab"
              :id="'tab-' + tid"
              :aria-selected="tabAttiva === tid"
              :aria-controls="'panel-' + tid"
              @click="tabAttiva = tid"
              :class="tabAttiva === tid
                ? 'border-b-2 border-blue-600 text-blue-700 font-semibold -mb-px bg-white px-4 py-2 text-sm rounded-t'
                : 'text-slate-500 hover:text-slate-800 px-4 py-2 text-sm rounded-t transition-colors'"
              x-text="tlabel">
      </button>
    </template>
  </div>

  <!-- ── PANEL 1: Identità CSE ─────────────────────────────── -->
  <section role="tabpanel" id="panel-identita" aria-labelledby="tab-identita"
           x-show="tabAttiva === 'identita'" class="space-y-4">

    <div class="grid gap-4 sm:grid-cols-2">

      <div class="sm:col-span-2">
        <label for="cse-nome" class="block text-sm font-medium text-slate-700 mb-1">
          Nome e cognome
          <span class="text-slate-400 text-xs font-normal">(usato nell'intestazione dei documenti)</span>
        </label>
        <input id="cse-nome" type="text" x-model="cse.nome_cognome"
               placeholder="COGNOME Nome"
               class="w-full border border-slate-300 rounded-md px-3 py-2 text-sm
                      focus:outline-none focus:ring-2 focus:ring-blue-500">
      </div>

      <div class="sm:col-span-2">
        <label for="cse-qualifica" class="block text-sm font-medium text-slate-700 mb-1">Qualifica</label>
        <input id="cse-qualifica" type="text" x-model="cse.qualifica"
               class="w-full border border-slate-300 rounded-md px-3 py-2 text-sm
                      focus:outline-none focus:ring-2 focus:ring-blue-500">
      </div>

      <div>
        <label for="cse-titolo" class="block text-sm font-medium text-slate-700 mb-1">
          Titolo professionale <span class="text-slate-400 text-xs font-normal">facoltativo</span>
        </label>
        <input id="cse-titolo" type="text" x-model="cse.titolo_professionale"
               placeholder="es. Geometra"
               class="w-full border border-slate-300 rounded-md px-3 py-2 text-sm
                      focus:outline-none focus:ring-2 focus:ring-blue-500">
      </div>

      <div>
        <label for="cse-estremi" class="block text-sm font-medium text-slate-700 mb-1">
          Estremi professionali <span class="text-slate-400 text-xs font-normal">facoltativo</span>
        </label>
        <input id="cse-estremi" type="text" x-model="cse.estremi"
               placeholder="es. n. iscrizione albo"
               class="w-full border border-slate-300 rounded-md px-3 py-2 text-sm
                      focus:outline-none focus:ring-2 focus:ring-blue-500">
      </div>
    </div>

    <div class="flex justify-end pt-2 border-t border-slate-100">
      <button @click="salvaIdentita()" :disabled="salvando"
              class="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white
                     text-sm font-medium px-5 py-2 rounded-lg transition-colors
                     focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2">
        Salva identità
      </button>
    </div>
  </section>

  <!-- ── PANEL 2: Firma permanente ─────────────────────────── -->
  <section role="tabpanel" id="panel-firma" aria-labelledby="tab-firma"
           x-show="tabAttiva === 'firma'" class="space-y-5">

    <div>
      <h2 class="text-sm font-semibold text-slate-700 mb-3">Firma corrente</h2>

      <template x-if="firma.firma_png_base64">
        <div class="space-y-3">
          <div class="border border-slate-200 rounded-lg p-3 bg-slate-50 inline-block">
            <img :src="firma.firma_png_base64" alt="Firma CSE attuale"
                 class="max-h-24 max-w-xs object-contain">
          </div>
          <p class="text-xs text-slate-400">
            Caricata il
            <span x-text="firma.acquisita_il
              ? new Date(firma.acquisita_il).toLocaleDateString('it-IT') : ''">
            </span>
          </p>
          <button @click="rimuoviFirma()" :disabled="salvando"
                  class="text-xs text-red-600 hover:text-red-800 underline disabled:opacity-50
                         focus:outline-none focus:ring-2 focus:ring-red-500 rounded">
            Rimuovi firma
          </button>
        </div>
      </template>

      <template x-if="!firma.firma_png_base64">
        <div class="border-2 border-dashed border-slate-300 rounded-lg p-6
                    text-center text-slate-400 text-sm">
          Nessuna firma caricata
        </div>
      </template>
    </div>

    <div class="border-t border-slate-100 pt-5">
      <h2 class="text-sm font-semibold text-slate-700 mb-1"
          x-text="firma.firma_png_base64 ? 'Sostituisci firma' : 'Carica firma'">
      </h2>
      <p class="text-xs text-slate-400 mb-4">
        Usa <strong>SafeHub Firma</strong> (Android) per acquisire un PNG professionale,
        poi selezionalo qui.
      </p>

      <!-- File input nascosto: attivato dal pulsante, non esposto da tastiera -->
      <input type="file" id="firma-file-input"
             accept="image/png,image/jpeg"
             @change="onFirmaFileSelezionato($event)"
             class="sr-only" tabindex="-1" aria-hidden="true">

      <div x-show="!firmaStaging">
        <button type="button"
                @click="document.getElementById('firma-file-input').click()"
                class="border border-slate-300 hover:border-blue-400 hover:bg-blue-50
                       text-sm text-slate-700 hover:text-blue-700 px-4 py-2 rounded-lg
                       transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500">
          📎 Seleziona file PNG firma…
        </button>
      </div>

      <!-- Anteprima staging (non ancora salvata) -->
      <div x-show="firmaStaging" class="space-y-3">
        <div class="border border-blue-200 rounded-lg p-3 bg-blue-50 inline-block">
          <img :src="firmaStaging ?? ''" alt="Anteprima nuova firma"
               class="max-h-24 max-w-xs object-contain">
        </div>
        <p class="text-xs text-slate-500">Anteprima — non ancora salvata.</p>
        <div class="flex gap-3">
          <button @click="annullaFirmaStaging()"
                  class="text-sm text-slate-500 hover:text-slate-700 px-4 py-2
                         border border-slate-300 rounded-lg transition-colors
                         focus:outline-none focus:ring-2 focus:ring-slate-400">
            Annulla
          </button>
          <button @click="salvaFirma()" :disabled="salvando"
                  class="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white
                         text-sm font-medium px-5 py-2 rounded-lg transition-colors
                         focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2">
            Salva firma
          </button>
        </div>
      </div>
    </div>
  </section>

  <!-- ── PANEL 3: Logo aziendale ───────────────────────────── -->
  <section role="tabpanel" id="panel-logo" aria-labelledby="tab-logo"
           x-show="tabAttiva === 'logo'" class="space-y-5">

    <div>
      <h2 class="text-sm font-semibold text-slate-700 mb-3">Logo corrente</h2>

      <template x-if="logo.png_base64">
        <div class="space-y-3">
          <div class="border border-slate-200 rounded-lg p-3 bg-slate-50 inline-block">
            <img :src="logo.png_base64" alt="Logo aziendale attuale"
                 class="max-h-20 max-w-xs object-contain">
          </div>
          <div>
            <label for="logo-descr" class="block text-xs text-slate-500 mb-1">Descrizione</label>
            <input id="logo-descr" type="text" x-model="logo.descrizione"
                   placeholder="es. logo studio / committente"
                   class="border border-slate-300 rounded px-2 py-1 text-sm w-64
                          focus:outline-none focus:ring-2 focus:ring-blue-500">
          </div>
          <button @click="rimuoviLogo()" :disabled="salvando"
                  class="text-xs text-red-600 hover:text-red-800 underline disabled:opacity-50
                         focus:outline-none focus:ring-2 focus:ring-red-500 rounded">
            Rimuovi logo
          </button>
        </div>
      </template>

      <template x-if="!logo.png_base64">
        <div class="border-2 border-dashed border-slate-300 rounded-lg p-6
                    text-center text-slate-400 text-sm">
          Nessun logo caricato
        </div>
      </template>
    </div>

    <div class="border-t border-slate-100 pt-5">
      <h2 class="text-sm font-semibold text-slate-700 mb-1"
          x-text="logo.png_base64 ? 'Sostituisci logo' : 'Carica logo'">
      </h2>
      <p class="text-xs text-slate-400 mb-4">
        Il logo appare nell'intestazione di ogni documento generato da M6.
        Usa un PNG con sfondo trasparente per il risultato migliore.
      </p>

      <input type="file" id="logo-file-input" accept="image/png"
             @change="onLogoFileSelezionato($event)"
             class="sr-only" tabindex="-1" aria-hidden="true">

      <div x-show="!logoStaging">
        <button type="button"
                @click="document.getElementById('logo-file-input').click()"
                class="border border-slate-300 hover:border-blue-400 hover:bg-blue-50
                       text-sm text-slate-700 hover:text-blue-700 px-4 py-2 rounded-lg
                       transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500">
          📎 Seleziona file PNG logo…
        </button>
      </div>

      <div x-show="logoStaging" class="space-y-3">
        <div class="border border-blue-200 rounded-lg p-3 bg-blue-50 inline-block">
          <img :src="logoStaging ?? ''" alt="Anteprima nuovo logo"
               class="max-h-20 max-w-xs object-contain">
        </div>
        <p class="text-xs text-slate-500">Anteprima — non ancora salvato.</p>
        <div class="flex gap-3">
          <button @click="annullaLogoStaging()"
                  class="text-sm text-slate-500 hover:text-slate-700 px-4 py-2
                         border border-slate-300 rounded-lg transition-colors
                         focus:outline-none focus:ring-2 focus:ring-slate-400">
            Annulla
          </button>
          <button @click="salvaLogo()" :disabled="salvando"
                  class="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white
                         text-sm font-medium px-5 py-2 rounded-lg transition-colors
                         focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2">
            Salva logo
          </button>
        </div>
      </div>
    </div>
  </section>

  <!-- ── PANEL 4: Moduli qualità ───────────────────────────── -->
  <section role="tabpanel" id="panel-moduli" aria-labelledby="tab-moduli"
           x-show="tabAttiva === 'moduli'" class="space-y-4">

    <p class="text-xs text-slate-500">
      Codice e versione appaiono nell'intestazione di ogni documento generato.
      Aggiorna con i valori reali del tuo sistema qualità.
    </p>

    <div class="overflow-x-auto">
      <table class="w-full text-sm border-collapse">
        <thead>
          <tr class="border-b-2 border-slate-200 text-left">
            <th class="pb-2 pr-4 text-xs font-semibold text-slate-500 uppercase tracking-wide">Tipo</th>
            <th class="pb-2 pr-3 text-xs font-semibold text-slate-500 uppercase tracking-wide w-28">Codice</th>
            <th class="pb-2 pr-3 text-xs font-semibold text-slate-500 uppercase tracking-wide w-36">Versione</th>
            <th class="pb-2     text-xs font-semibold text-slate-500 uppercase tracking-wide">Titolo</th>
          </tr>
        </thead>
        <tbody>
          <template x-for="[tipo, etich] in Object.entries(etichetteMod())" :key="tipo">
            <tr class="border-b border-slate-100 hover:bg-slate-50">
              <td class="py-2 pr-4 text-slate-600 text-xs" x-text="etich"></td>
              <td class="py-2 pr-3">
                <input type="text"
                       :value="moduliQualita[tipo]?.codice ?? ''"
                       @change="moduliQualita[tipo] = {...(moduliQualita[tipo]||{}), codice: $event.target.value}"
                       :aria-label="'Codice — ' + etich"
                       class="w-full border border-slate-200 rounded px-2 py-1 text-xs
                              focus:outline-none focus:ring-2 focus:ring-blue-500">
              </td>
              <td class="py-2 pr-3">
                <input type="text"
                       :value="moduliQualita[tipo]?.versione ?? ''"
                       @change="moduliQualita[tipo] = {...(moduliQualita[tipo]||{}), versione: $event.target.value}"
                       :aria-label="'Versione — ' + etich"
                       class="w-full border border-slate-200 rounded px-2 py-1 text-xs
                              focus:outline-none focus:ring-2 focus:ring-blue-500">
              </td>
              <td class="py-2">
                <input type="text"
                       :value="moduliQualita[tipo]?.titolo ?? ''"
                       @change="moduliQualita[tipo] = {...(moduliQualita[tipo]||{}), titolo: $event.target.value}"
                       :aria-label="'Titolo — ' + etich"
                       class="w-full border border-slate-200 rounded px-2 py-1 text-xs
                              focus:outline-none focus:ring-2 focus:ring-blue-500">
              </td>
            </tr>
          </template>
        </tbody>
      </table>
    </div>

    <div class="flex justify-end pt-2 border-t border-slate-100">
      <button @click="salvaModuliQualita()" :disabled="salvando"
              class="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white
                     text-sm font-medium px-5 py-2 rounded-lg transition-colors
                     focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2">
        Salva moduli qualità
      </button>
    </div>
  </section>

  <!-- ── PANEL 5: Soglie di scadenza ───────────────────────── -->
  <section role="tabpanel" id="panel-soglie" aria-labelledby="tab-soglie"
           x-show="tabAttiva === 'soglie'" class="space-y-4">

    <p class="text-xs text-slate-500">
      Giorni di preavviso per tipo di documento.
      Le soglie <span class="text-red-600 font-medium">critiche</span>
      richiedono almeno 1 giorno.
    </p>

    <div class="overflow-x-auto">
      <table class="w-full text-sm border-collapse">
        <thead>
          <tr class="border-b-2 border-slate-200 text-left">
            <th class="pb-2 pr-4 text-xs font-semibold text-slate-500 uppercase tracking-wide">Tipo documento</th>
            <th class="pb-2 pr-4 text-xs font-semibold text-slate-500 uppercase tracking-wide w-32">Giorni preavviso</th>
            <th class="pb-2     text-xs font-semibold text-slate-500 uppercase tracking-wide w-32">Criticità</th>
          </tr>
        </thead>
        <tbody>
          <template x-for="[chiave, etich] in Object.entries(etichetteSoglie())" :key="chiave">
            <tr class="border-b border-slate-100 hover:bg-slate-50">
              <td class="py-2 pr-4 text-slate-600 text-xs" x-text="etich"></td>
              <td class="py-2 pr-4">
                <div class="flex items-center gap-1">
                  <input type="number" min="1"
                         :value="soglie[chiave]?.giorni ?? 30"
                         @input="soglie[chiave] = {...(soglie[chiave]||{}), giorni: parseInt($event.target.value,10)||1}"
                         @blur="validaSoglia(chiave)"
                         :aria-label="'Giorni preavviso — ' + etich"
                         class="w-16 border border-slate-200 rounded px-2 py-1 text-xs text-center
                                focus:outline-none focus:ring-2 focus:ring-blue-500">
                  <span class="text-xs text-slate-400">gg</span>
                </div>
                <span x-show="avvisiSoglie[chiave]"
                      x-text="avvisiSoglie[chiave]"
                      class="text-xs text-amber-600 mt-0.5 block" aria-live="polite">
                </span>
              </td>
              <td class="py-2">
                <select :value="soglie[chiave]?.criticita ?? 'normale'"
                        @change="soglie[chiave] = {...(soglie[chiave]||{}), criticita: $event.target.value}"
                        :aria-label="'Criticità — ' + etich"
                        class="border border-slate-200 rounded px-2 py-1 text-xs
                               focus:outline-none focus:ring-2 focus:ring-blue-500">
                  <option value="critica">🔴 Critica</option>
                  <option value="alta">🟠 Alta</option>
                  <option value="normale">🟢 Normale</option>
                </select>
              </td>
            </tr>
          </template>
        </tbody>
      </table>
    </div>

    <div class="flex justify-end pt-2 border-t border-slate-100">
      <button @click="salvaSoglie()" :disabled="salvando"
              class="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white
                     text-sm font-medium px-5 py-2 rounded-lg transition-colors
                     focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2">
        Salva soglie
      </button>
    </div>
  </section>

  <!-- ── PANEL 6: Preferenze app ───────────────────────────── -->
  <section role="tabpanel" id="panel-preferenze" aria-labelledby="tab-preferenze"
           x-show="tabAttiva === 'preferenze'" class="space-y-4">

    <div class="grid gap-4 sm:grid-cols-2 max-w-sm">
      <div>
        <label for="pref-sync" class="block text-sm font-medium text-slate-700 mb-1">
          Avviso sync OneDrive (giorni)
        </label>
        <input id="pref-sync" type="number" min="1" max="30"
               x-model.number="preferenze.soglia_sync_avviso_giorni"
               class="w-24 border border-slate-300 rounded-md px-3 py-2 text-sm
                      focus:outline-none focus:ring-2 focus:ring-blue-500">
        <p class="text-xs text-slate-400 mt-1">
          Avviso se OneDrive non è sincronizzato da più di N giorni.
        </p>
      </div>

      <div>
        <label for="pref-tema" class="block text-sm font-medium text-slate-700 mb-1">Tema</label>
        <select id="pref-tema" x-model="preferenze.tema"
                class="border border-slate-300 rounded-md px-3 py-2 text-sm
                       focus:outline-none focus:ring-2 focus:ring-blue-500">
          <option value="chiaro">Chiaro</option>
          <option value="scuro" disabled>Scuro (in sviluppo)</option>
        </select>
      </div>
    </div>

    <div class="flex justify-end pt-2 border-t border-slate-100">
      <button @click="salvaPreferenze()" :disabled="salvando"
              class="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white
                     text-sm font-medium px-5 py-2 rounded-lg transition-colors
                     focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2">
        Salva preferenze
      </button>
    </div>
  </section>

  <!-- ── PANEL 7: Assistente AI ──────────────────────────────── -->
  <section role="tabpanel" id="panel-ai" aria-labelledby="tab-ai"
           x-show="tabAttiva === 'ai'" class="space-y-6">

    <!-- Stato disponibilità -->
    <div class="flex items-center gap-3 p-3 rounded-xl border"
         :class="aiDisponibile === null ? 'border-slate-200 bg-slate-50'
               : aiDisponibile         ? 'border-green-200 bg-green-50'
               :                         'border-amber-200 bg-amber-50'">
      <span class="text-xl" aria-hidden="true"
            x-text="aiDisponibile === null ? '⏳' : aiDisponibile ? '🟢' : '🟡'"></span>
      <div>
        <p class="text-sm font-medium text-slate-700"
           x-text="aiDisponibile === null ? 'Verifica in corso…'
                 : aiDisponibile         ? 'Ollama disponibile su localhost:11434'
                 :                         'Ollama non raggiungibile — avvia il servizio'">
        </p>
        <p class="text-xs text-slate-400 mt-0.5">
          L'assistente è locale: nessun dato esce dalla macchina.
        </p>
      </div>
      <button @click="_verificaAi()"
              class="ml-auto text-xs text-slate-500 hover:text-slate-800 px-3 py-1
                     border border-slate-200 rounded-lg transition-colors
                     focus:outline-none focus:ring-2 focus:ring-slate-400">
        ↻ Riverifica
      </button>
    </div>

    <!-- Selezione modello -->
    <div class="max-w-sm">
      <label for="ai-modello" class="block text-sm font-medium text-slate-700 mb-1">
        Modello predefinito
        <span class="text-slate-400 text-xs font-normal">
          (usato da tutte le funzioni AI)
        </span>
      </label>

      <!-- Select dinamico se Ollama disponibile, input testo altrimenti -->
      <template x-if="aiDisponibile && modelliAi.length > 0">
        <select id="ai-modello" x-model="ai.modello"
                class="w-full border border-slate-300 rounded-md px-3 py-2 text-sm
                       focus:outline-none focus:ring-2 focus:ring-blue-500">
          <template x-for="m in modelliAi" :key="m">
            <option :value="m" x-text="m"></option>
          </template>
        </select>
      </template>
      <template x-if="!aiDisponibile || modelliAi.length === 0">
        <input id="ai-modello" type="text" x-model="ai.modello"
               placeholder="es. llama3.2:3b"
               class="w-full border border-slate-300 rounded-md px-3 py-2 text-sm
                      focus:outline-none focus:ring-2 focus:ring-blue-500">
      </template>

      <p class="text-xs text-slate-400 mt-1">
        Seleziona dalla lista sopra il modello che hai installato con Ollama
        (es. <code class="bg-slate-100 px-1 rounded">gemma3:4b</code>,
        <code class="bg-slate-100 px-1 rounded">llama3.2:3b</code>, ecc.).
        Se la lista è vuota, avvia prima Ollama.
      </p>
    </div>

    <div class="flex justify-end pt-2 border-t border-slate-100">
      <button @click="salvaAi()" :disabled="salvando"
              class="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white
                     text-sm font-medium px-5 py-2 rounded-lg transition-colors
                     focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2">
        Salva impostazioni AI
      </button>
    </div>

    <!-- ── Mini UI di test del ponte (collaudo) ───────────────────── -->
    <div class="border border-dashed border-slate-300 rounded-xl p-4 space-y-3">
      <p class="text-xs font-semibold text-slate-500 uppercase tracking-wide">
        🧪 Test ponte AI — solo per collaudo
      </p>

      <div>
        <label for="ai-test-prompt" class="block text-xs text-slate-600 mb-1">Prompt di prova</label>
        <textarea id="ai-test-prompt" rows="3" x-model="aiTestPrompt"
                  placeholder="Es. Descrivi in due righe il ruolo del CSE in un cantiere."
                  class="w-full border border-slate-300 rounded-md px-3 py-2 text-sm resize-none
                         focus:outline-none focus:ring-2 focus:ring-blue-500
                         placeholder:text-slate-400"></textarea>
      </div>

      <div class="flex gap-2">
        <button @click="aiTestGenera()"
                :disabled="!aiDisponibile || aiTestGenerando || !aiTestPrompt.trim()"
                class="bg-violet-600 hover:bg-violet-700 disabled:opacity-50 text-white
                       text-sm font-medium px-4 py-2 rounded-lg transition-colors
                       focus:outline-none focus:ring-2 focus:ring-violet-500">
          <span x-text="aiTestGenerando ? '⏳ Generazione…' : '▶ Genera'"></span>
        </button>
        <button @click="aiTestInterrompi()" x-show="aiTestGenerando"
                class="bg-red-50 hover:bg-red-100 text-red-700 border border-red-200
                       text-sm font-medium px-4 py-2 rounded-lg transition-colors
                       focus:outline-none focus:ring-2 focus:ring-red-400">
          ■ Interrompi
        </button>
        <button @click="aiTestRisposta = ''" x-show="aiTestRisposta && !aiTestGenerando"
                class="text-xs text-slate-400 hover:text-slate-600 px-3 py-2 rounded-lg
                       focus:outline-none focus:ring-2 focus:ring-slate-400">
          Cancella
        </button>
      </div>

      <!-- Risposta in streaming -->
      <div x-show="aiTestRisposta"
           class="bg-slate-50 border border-slate-200 rounded-lg px-4 py-3
                  text-sm text-slate-700 whitespace-pre-wrap leading-relaxed min-h-[3rem]"
           x-text="aiTestRisposta"
           aria-live="polite">
      </div>
      <p x-show="!aiDisponibile"
         class="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-3 py-2">
        Ollama non disponibile — avvia il servizio per testare.
      </p>
    </div>

  </section>

</div>
`;

// ---- Registrazione nel registry moduli ----

window.MODULI_REGISTRATI = window.MODULI_REGISTRATI ?? {};

window.MODULI_REGISTRATI['impostazioni'] = {
  monta(contenitore) {
    contenitore.innerHTML = _TEMPLATE_IMPOSTAZIONI;
    // Alpine 3.x: il MutationObserver processa automaticamente i nuovi nodi.
    // Chiamare anche Alpine.initTree() causerebbe una doppia inizializzazione.
  },
};
