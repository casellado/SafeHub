/**
 * alpine-init.js — Registrazione store Alpine e sequenza di avvio (boot).
 *
 * Sequenza boot (M1-Fondazione.md §3.2):
 *  1. Shared/ già caricati dal browser (script sincroni prima di Alpine)
 *  2. Apre IDB (safehub_archivio_db)
 *  3. Verifica disponibilità File System Access API
 *  4. Recupera handle cartella radice; se permesso scaduto → pannello riconnessione
 *  5. Scansiona SafeHub-CSE-Lavori/ → popola cantieri_cache
 *  6. Ripristina ultimo cantiere o aspetta selezione
 *  7. Mostra cruscotto (stato 'pronto')
 *
 * Gli stati di $store.app.stato guidano il rendering in index.html:
 *   'avvio'            → spinner
 *   'caricamento'      → spinner
 *   'seleziona-cartella' → onboarding step 1 (primo avvio o handle perso)
 *   'riconnessione'    → pannello riconnessione (permesso scaduto — normale)
 *   'pronto'           → shell completa
 *   'errore-fatale'    → schermata errore
 */

document.addEventListener('alpine:init', () => {

  // ---- $store.app — stato globale applicazione ----
  Alpine.store('app', {
    stato: 'avvio',
    messaggioAvvio: 'Inizializzazione…',
    erroreDescrizione: null,
    moduloAttivo: null,
    versioneApp: '1.0.0-M1',

    setStato(s, msg = null) {
      this.stato = s;
      if (msg) this.messaggioAvvio = msg;
    },
  });

  // ---- $store.cantiere — cantiere corrente (unica fonte) ----
  Alpine.store('cantiere', CantiereCorrente());

  // ---- $store.cantieri — elenco cantieri da cache IDB ----
  Alpine.store('cantieri', {
    lista: [],
    caricamento: false,

    async ricarica() {
      this.caricamento = true;
      try {
        this.lista = await IDB.idbGetAll('cantieri_cache');
        this.lista.sort((a, b) =>
          (b.ultimo_aggiornamento_at ?? '').localeCompare(a.ultimo_aggiornamento_at ?? '')
        );
      } catch (err) {
        ERRORI.gestisciErrore('cantieri/ricarica', err);
      } finally {
        this.caricamento = false;
      }
    },
  });

  // ---- $store.sync — stato sincronizzazione e promemoria cartella ----
  Alpine.store('sync', {
    stato: 'sconosciuto',   // 'ok' | 'attesa' | 'problema' | 'sconosciuto'
    etichetta: '',
    setOk()            { this.stato = 'ok';       this.etichetta = 'Sincronizzato'; },
    setAttesa()        { this.stato = 'attesa';   this.etichetta = 'In sync…'; },
    setProblema(msg)   { this.stato = 'problema'; this.etichetta = msg ?? 'Problema sync'; },

    // FIX 3 — Promemoria cartella agganciata
    nomeCartella:     null,   // impostato in completaAvvio da rootHandle.name
    ultimoSalvataggio: null,  // aggiornato a ogni scriviJson (evento safehub-scrittura)
    get ultimoSalvataggioLabel() {
      if (!this.ultimoSalvataggio) return null;
      return new Date(this.ultimoSalvataggio).toLocaleString('it-IT', {
        day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
      });
    },

    // FIX 2 — stato spinner Riscansiona
    riscansionando: false,
  });

  // Aggiorna l'orario dell'ultimo salvataggio ogni volta che scriviJson scrive un file.
  document.addEventListener('safehub-scrittura', () => {
    Alpine.store('sync').ultimoSalvataggio = new Date().toISOString();
  });

  // ---- Avvio ----
  avviaApp();
});

// ---- Service Worker: DEV vs PRODUZIONE ----------------------------------------
//
// Il SW è attivo SOLO in produzione (GitHub Pages / HTTPS).
// Su localhost è deliberatamente DISATTIVATO: ogni F5 serve i file freschi
// dalla rete senza mai richiedere "Clear site data" o operazioni in DevTools.
//
// Causa dei problemi storici:
//  • In sviluppo il SW cachava i file (cache-first) → F5 serviva sempre la
//    versione vecchia, rendendo ogni modifica invisibile senza pulizia manuale.
//  • 'alpine-init.js' è dentro la cache SW → il fix al SW stesso arrivava
//    troppo tardi (era servito dalla vecchia cache).
//  • Porta variabile di avvia.bat: il SW registrato su :8080 non si aggiornava
//    se il server ripartiva su :8081, causando "unknown error when fetching".
//
// Soluzione: divisione netta dev / prod. Su localhost zero SW, zero problemi.
// In produzione il SW rimane attivo per velocità e offline.
// --------------------------------------------------------------------------

if ('serviceWorker' in navigator) {

  const IS_DEV = ['localhost', '127.0.0.1', '::1'].includes(location.hostname);

  if (IS_DEV) {
    // SVILUPPO — annulla tutti i SW esistenti e svuota le cache (una tantum),
    // poi ricarica per servire i file freschi. Dopo quella prima esecuzione,
    // ogni F5 successivo è già pulito: nessun SW da togliere, ricarica immediata.
    navigator.serviceWorker.getRegistrations()
      .then(regs => {
        if (regs.length === 0) return;  // già pulito: non fare nulla
        return Promise.all([
          ...regs.map(r => r.unregister()),
          caches.keys().then(keys => Promise.all(keys.map(k => caches.delete(k)))),
        ]).then(() => location.reload());  // ricarica una volta sola, poi basta
      })
      .catch(() => {});

  } else {
    // PRODUZIONE (GitHub Pages / HTTPS) — SW attivo con aggiornamento automatico.
    // Al cambio SW: toast "App aggiornata" + reload automatico dopo 1.5s.

    const hadController = !!navigator.serviceWorker.controller;
    let _ricaricaInCorso = false;

    const _ricarica = () => {
      if (_ricaricaInCorso) return;
      _ricaricaInCorso = true;
      const el = document.createElement('div');
      el.style.cssText =
        'position:fixed;top:1rem;right:1rem;background:#1d4ed8;color:#fff;' +
        'padding:.625rem 1rem;border-radius:.5rem;font-size:.8125rem;' +
        'z-index:9999;box-shadow:0 4px 16px rgba(0,0,0,.2)';
      el.textContent = '↻ App aggiornata, ricarico…';
      document.body?.appendChild(el);
      setTimeout(() => location.reload(), 1500);
    };

    const _monitoraWorker = (worker) => {
      if (!worker || !hadController) return;
      if (worker.state === 'activated') { _ricarica(); return; }
      worker.addEventListener('statechange', () => {
        if (worker.state === 'activated') _ricarica();
      });
    };

    navigator.serviceWorker.register('./sw.js')
      .then(reg => {
        if (reg.waiting)    _monitoraWorker(reg.waiting);
        if (reg.installing) _monitoraWorker(reg.installing);
        reg.addEventListener('updatefound', () => _monitoraWorker(reg.installing));
      })
      .catch(err => console.warn('[SW] Registrazione non riuscita:', err));

    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (hadController) _ricarica();
    });
  }
}

// ---------------------------------------------------------------------------
// Boot sequence
// ---------------------------------------------------------------------------

async function avviaApp() {
  const app = Alpine.store('app');

  // Passo 2: IDB
  app.setStato('avvio', 'Apertura database locale…');
  try {
    await IDB.apri();
  } catch (err) {
    // L'IDB non è disponibile (sessione privata con restrizioni, browser bloccato).
    // Non blocchiamo: l'app può funzionare in lettura-da-file senza cache.
    console.error('[Boot/IDB]', err);
    NOTIFICHE.attenzione(
      'Cache locale non disponibile',
      'Il database locale non è stato aperto. I dati in OneDrive sono al sicuro.'
    );
  }

  // Passo 3: verifica FSA
  if (!FILESYSTEM.isDisponibile()) {
    app.erroreDescrizione =
      'SafeHub richiede Edge o Chrome su desktop. ' +
      'File System Access API non è disponibile in questo browser o da file://.';
    app.setStato('errore-fatale');
    return;
  }

  // Passo 4: handle cartella radice
  app.setStato('avvio', 'Connessione alla cartella OneDrive…');

  let handleSalvato = null, statoPermesso = 'denied';
  try {
    ({ handle: handleSalvato, statoPermesso } = await FILESYSTEM.getHandleCartella());
  } catch (err) {
    ERRORI.gestisciErrore('boot/get-handle', err, { silenziato: true });
  }

  if (!handleSalvato) {
    // Primo avvio o handle non trovato in IDB
    app.setStato('seleziona-cartella');
    return;
  }

  if (statoPermesso === 'prompt') {
    // Il permesso è scaduto con il riavvio del browser (comportamento atteso).
    // Mostriamo un pannello rassicurante, non un errore.
    window._handleInAttesa = handleSalvato;
    app.setStato('riconnessione');
    return;
  }

  if (statoPermesso === 'denied') {
    app.setStato('seleziona-cartella');
    return;
  }

  // Permesso 'granted': procediamo
  await completaAvvio(handleSalvato);
}

/**
 * Completa il boot dopo che rootHandle ha permesso 'granted'.
 * Chiamato sia da avviaApp(), sia dai pannelli onboarding/riconnessione.
 * @param {FileSystemDirectoryHandle} rootHandle
 */
async function completaAvvio(rootHandle) {
  const app = Alpine.store('app');

  // Espone il rootHandle a tutti i moduli (M2, M3, M4...) tramite FILESYSTEM.
  // Necessario perché i moduli non hanno accesso diretto alla variabile locale di avviaApp().
  FILESYSTEM.setHandleAttivo(rootHandle);

  // FIX 3 — promemoria cartella: nome della cartella agganciata
  Alpine.store('sync').nomeCartella = rootHandle.name;

  // Passo 4b: carica impostazioni globali (M2) — devono essere disponibili
  // prima di app.setStato('pronto') affinché M6 e i moduli documento le trovino pronte.
  app.setStato('caricamento', 'Caricamento impostazioni…');
  try {
    await IMPOSTAZIONI_SERVICE.carica(rootHandle);
  } catch (err) {
    ERRORI.gestisciErrore('boot/impostazioni', err, { silenziato: true });
    // Non blocchiamo: i moduli useranno i valori di default
  }

  // Passo 5: scansiona cartelle → popola cantieri_cache
  app.setStato('caricamento', 'Scansione cantieri…');
  try {
    await IDB.rigeneraIndice(rootHandle);
    await Alpine.store('cantieri').ricarica();
  } catch (err) {
    ERRORI.gestisciErrore('boot/scansione', err);
  }

  // Passo 6: ripristina ultimo cantiere selezionato
  try {
    const rec = await IDB.idbGet('impostazioni_archivio', 'ultimo_cantiere_id');
    const id  = rec?.value;
    if (id) {
      const dati = Alpine.store('cantieri').lista.find(c => c.cantiere_id === id);
      if (dati) await Alpine.store('cantiere').seleziona(id, dati);
    }
  } catch (err) {
    ERRORI.gestisciErrore('boot/ripristino-cantiere', err, { silenziato: true });
  }

  // Passo 4c: carica anagrafica del cantiere corrente (M4).
  // Va fatto PRIMA di setStato('pronto') affinché i componenti di M4
  // trovino i dati già in memoria quando vengono montati.
  try {
    const idCantiere = Alpine.store('cantiere').id;
    if (idCantiere) await ANAGRAFICA_SERVICE.carica(idCantiere);
  } catch (err) {
    ERRORI.gestisciErrore('boot/anagrafica', err, { silenziato: true });
  }

  Alpine.store('sync').setOk();

  // Passo 7: mostra cruscotto
  app.setStato('pronto');

  // FIX 1 — ricostruzione documenti_indice in background (non blocca l'avvio).
  // cantieri_cache è già pronto; questo aggiorna solo documenti_indice.
  IDB.rigeneraIndiceDocumenti(rootHandle)
    .catch(err => ERRORI.gestisciErrore('boot/documenti-indice', err, { silenziato: true }));

  await Alpine.nextTick();
  window.navigaA('cruscotto');
}

// ---------------------------------------------------------------------------
// Funzioni globali — chiamate da HTML Alpine (@click)
// ---------------------------------------------------------------------------

// Registry dei moduli reali: ogni modulo si registra qui con { monta(contenitore) }.
// navigaA() cerca qui prima di ricadere sul placeholder generico.
window.MODULI_REGISTRATI = {};

/**
 * Naviga a un modulo identificato da id.
 * Se esiste un modulo reale in MODULI_REGISTRATI, lo monta (Alpine.initTree).
 * Altrimenti mostra il placeholder generico "in costruzione".
 * @param {string} id
 */
window.navigaA = (id) => {
  const app = Alpine.store('app');
  if (!app) return;
  app.moduloAttivo = id;

  const contenitore = document.getElementById('contenuto-modulo');
  if (!contenitore) return;

  // Smonta il modulo precedente: Alpine rimuove i listener dei nodi eliminati
  contenitore.innerHTML = '';

  const moduloReale = window.MODULI_REGISTRATI[id];
  if (moduloReale) {
    moduloReale.monta(contenitore);
  } else if (typeof PLACEHOLDER !== 'undefined') {
    PLACEHOLDER.monta(id);
  }

  A11Y.spostaFocus('#modulo-attivo');
};

/** Gestisce il clic "Seleziona cartella" nell'onboarding (primo avvio). */
window.selezionaCartella = async () => {
  try {
    const handle = await FILESYSTEM.agganciaCartella();
    await completaAvvio(handle);
  } catch (err) {
    // AbortError = utente ha annullato il picker: silenzioso
    ERRORI.gestisciErrore('onboarding/seleziona-cartella', err);
  }
};

/** Gestisce il clic "Riconnetti" (permesso scaduto dopo riavvio browser). */
window.riconnetti = async () => {
  const handle = window._handleInAttesa;
  if (!handle) { window.selezionaCartella(); return; }
  try {
    const perm = await FILESYSTEM.richiediPermesso(handle);
    if (perm === 'granted') {
      await completaAvvio(handle);
    } else {
      // Utente ha negato esplicitamente: chiediamo di scegliere un'altra cartella
      Alpine.store('app').setStato('seleziona-cartella');
    }
  } catch (err) {
    ERRORI.gestisciErrore('onboarding/riconnetti', err);
  }
};

/**
 * FIX 2 — Riscansiona la cartella agganciata e aggiorna cantieri + documenti.
 * Usare dopo aver copiato file aggiornati nella cartella da un altro PC.
 */
window.riscansionaCartella = async () => {
  const root = FILESYSTEM.getHandleAttivo();
  if (!root) return;
  const sync = Alpine.store('sync');
  if (sync.riscansionando) return;
  sync.riscansionando = true;
  try {
    await IDB.rigeneraIndice(root);
    await IDB.rigeneraIndiceDocumenti(root);
    await Alpine.store('cantieri').ricarica();
    NOTIFICHE.successo('Cartella riscansionata', 'Cantieri e indice documenti aggiornati.');
  } catch (err) {
    ERRORI.gestisciErrore('riscansiona/cartella', err);
  } finally {
    sync.riscansionando = false;
  }
};
