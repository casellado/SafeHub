/**
 * eventi-incidentali-service.js — Motore dati M15: Registro eventi accidentali CSE.
 *
 * RUOLO: registro CSE degli eventi (infortuni, near-miss, incidenti a cose/ambiente)
 * dal punto di vista del coordinamento. NON sostituisce la denuncia INAIL (obbligo del
 * datore di lavoro, art.18 D.Lgs.81/08 + DPR 1124/65): annota solo gli estremi
 * informativi. Strumento di auto-tutela e alta vigilanza del CSE.
 *
 * COLLOCAZIONE: ogni evento vive in
 *   06_Eventi-Incidentali/<uuid>.json   (cartella piatta, posizione FISSA)
 *
 * RETROCOMPAT: cantieri creati con il vecchio scaffolding hanno Bozze/ e Finalizzati/
 * come sottocartelle. leggi() le scansiona anch'esse per non perdere nulla.
 * La posizione canonica dei nuovi record è sempre la cartella piatta.
 * Nessun file viene spostato: lo stato è un CAMPO nel record, non la posizione del file.
 *
 * DATI SENSIBILI: nessun CF, nessun dato sanitario/diagnosi nel record.
 * persona_coinvolta contiene SOLO id anagrafica + testo breve (nome/mansione).
 *
 * Dipende da: UTILS, FILESYSTEM, ANAGRAFICA_SERVICE (già caricati da shared/).
 */

const EVENTI_SERVICE = (() => {

  const _CARTELLA = '06_Eventi-Incidentali';

  // Sottocartelle create dal vecchio scaffolding — scansionate da leggi() per retrocompat.
  // I nuovi record vanno sempre nella cartella piatta (non qui dentro).
  const _LEGACY_SUBS = ['Bozze', 'Finalizzati'];

  // ── Costanti dominio ────────────────────────────────────────────────────────

  /**
   * Categorie evento (enum controllato — necessario per correlazione AI futura).
   */
  const CATEGORIE = Object.freeze({
    INFORTUNIO:              'infortunio',
    NEAR_MISS:               'near_miss',
    INCIDENTE_COSE_AMBIENTE: 'incidente_cose_ambiente',
  });

  /**
   * Valori di gravità validi per categoria.
   * Enum controllati (non testo libero) per raggruppamento AI e semaforo cruscotto.
   * - infortuni: gravità reale accaduta
   * - near_miss: gravità POTENZIALE (cosa sarebbe potuto succedere)
   * - incidente_cose_ambiente: entità del danno materiale/ambientale
   */
  const GRAVITA = Object.freeze({
    infortunio:              ['lieve', 'prognosi_oltre_3gg', 'grave', 'mortale'],
    near_miss:               ['potenziale_lieve', 'potenziale_grave', 'potenziale_mortale'],
    incidente_cose_ambiente: ['danno_lieve', 'danno_rilevante'],
  });

  const STATI = Object.freeze({ APERTO: 'aperto', CHIUSO: 'chiuso' });

  // ── Directory helpers ───────────────────────────────────────────────────────

  /**
   * Restituisce il handle della cartella piatta (posizione canonica).
   * @param {string}  cantiereId
   * @param {boolean} [crea=false]
   */
  const _getDirFlat = async (cantiereId, crea = false) => {
    const root = FILESYSTEM.getHandleAttivo();
    return FILESYSTEM.navigaPercorso(
      await root.getDirectoryHandle(cantiereId),
      [_CARTELLA],
      crea
    );
  };

  // ── Helper impresa ──────────────────────────────────────────────────────────

  /**
   * Recupera la ragione sociale dall'anagrafica in memoria (best-effort).
   * Restituisce null se impresa_id è vuoto o l'anagrafica non è caricata.
   */
  const _nomeImpresa = (impresaId) => {
    if (!impresaId) return null;
    return ANAGRAFICA_SERVICE.get('imprese').find(i => i.id === impresaId)?.ragioneSociale ?? impresaId;
  };

  // ── Schema ──────────────────────────────────────────────────────────────────

  /**
   * Crea un record evento vuoto con tutti i campi dello schema.
   * La categoria di default è 'infortunio'; la gravità di default è il primo valore
   * valido per quella categoria ('lieve').
   * REGOLA DATI SENSIBILI: persona_coinvolta ha SOLO id + testo breve (NO CF, NO sanitari).
   * @param {string} cantiereId
   * @returns {object}
   */
  const creaVuota = (cantiereId) => ({
    id:                  UTILS.uuid(),
    tipo_file:           'evento_incidentale',
    cantiere_id:         cantiereId ?? '',

    // ── Classificazione ───────────────────────────────────────────────────────
    categoria:           CATEGORIE.INFORTUNIO,
    gravita:             GRAVITA.infortunio[0],          // 'lieve'
    data_ora:            new Date().toISOString(),
    luogo:               '',                             // progressiva o descrizione del luogo

    // ── Soggetto ──────────────────────────────────────────────────────────────
    impresa_id:          '',                             // FK anagrafica (facoltativo)

    // Persona coinvolta — SOLO per infortuni; MINIMO necessario: NO CF, NO diagnosi.
    // lavoratore_id: FK anagrafica (opzionale) per il recupero di nome/mansione.
    // testo: fallback se il lavoratore non è in anagrafica (es. "Addetto ponteggi").
    persona_coinvolta:   { lavoratore_id: null, testo: '' },

    // ── Fatto ─────────────────────────────────────────────────────────────────
    descrizione:         '',                             // dinamica dell'evento

    // ── INAIL — solo infortuni, solo estremi informativi ────────────────────
    // La denuncia è obbligo del datore di lavoro (art.18 D.Lgs.81/08 + DPR 1124/65).
    // Il CSE annota solo se è a conoscenza della denuncia e i suoi estremi.
    denuncia_inail:      { effettuata: false, data: '', estremi: '' },

    // ── Azioni CSE ────────────────────────────────────────────────────────────
    azioni_conseguenti:  '',                             // cosa ha fatto il CSE (testo libero)
    nc_collegata_id:     '',                             // link unidirezionale evento → NC (opzionale)

    // ── AI-ready ──────────────────────────────────────────────────────────────
    // Campo narrativo per il RAG AI (M26). NO dati personali/sanitari qui.
    testo_ai:            '',

    // ── Allegati ──────────────────────────────────────────────────────────────
    allegati:            [],                             // [{ filename, base64 }]

    // ── Stato e metadati ──────────────────────────────────────────────────────
    stato:               STATI.APERTO,                  // 'aperto' | 'chiuso'
    note:                '',
    origine:             'manuale',
    creato_il:           new Date().toISOString(),
    aggiornato_il:       new Date().toISOString(),
  });

  // ── CRUD ────────────────────────────────────────────────────────────────────

  /**
   * Scrive un nuovo evento in 06_Eventi-Incidentali/<uuid>.json.
   * Crea la cartella al volo se non esiste (primo evento su un cantiere pulito).
   * @param {object} evento  record creato con creaVuota() e popolato
   * @returns {Promise<object>}
   */
  const crea = async (evento) => {
    evento.aggiornato_il = new Date().toISOString();
    const dir = await _getDirFlat(evento.cantiere_id, true);
    await FILESYSTEM.scriviJson(dir, `${evento.id}.json`, evento);
    // Hook diario — fire-and-forget: un errore qui non blocca mai la registrazione evento
    _hookDiarioEventoCreato(evento).catch(e => console.warn('[diario] hook evento creato:', e));
    return evento;
  };

  /**
   * Aggiorna un evento nella sua posizione fissa (cartella piatta).
   * Non sposta il file: riscrive nella posizione canonica.
   * Se il record originale era in una sottocartella legacy (Bozze/ o Finalizzati/),
   * la nuova versione canonica in flat "vince" la deduplicazione di leggi()
   * in virtù dell'aggiornato_il più recente.
   * @param {object} evento
   * @returns {Promise<object>}
   */
  const aggiorna = async (evento) => {
    evento.aggiornato_il = new Date().toISOString();
    const dir = await _getDirFlat(evento.cantiere_id);
    await FILESYSTEM.scriviJson(dir, `${evento.id}.json`, evento);
    return evento;
  };

  /**
   * Cambia lo stato dell'evento (aperto ↔ chiuso).
   * Aggiorna solo il campo nel record, riscrive nella posizione fissa.
   * @param {object} evento
   * @param {string} nuovoStato  'aperto' | 'chiuso'
   * @returns {Promise<object>}
   */
  const cambiaStato = async (evento, nuovoStato) => {
    if (!Object.values(STATI).includes(nuovoStato)) {
      throw new Error(`EVENTI_SERVICE: stato non valido: "${nuovoStato}"`);
    }
    if (evento.stato === nuovoStato) return evento;
    const aggiornato = await aggiorna({ ...evento, stato: nuovoStato });
    // Hook diario solo alla CHIUSURA — riapri/altri cambi non generano voci
    if (nuovoStato === STATI.CHIUSO) {
      _hookDiarioEventoChiuso(aggiornato).catch(e => console.warn('[diario] hook evento chiuso:', e));
    }
    return aggiornato;
  };

  // ── Leggi (flat + sottocartelle legacy) ─────────────────────────────────────

  /**
   * Legge tutti gli eventi (non cestinati) per il cantiere dato.
   *
   * Scansiona:
   *   1. la cartella piatta 06_Eventi-Incidentali/  (posizione canonica)
   *   2. 06_Eventi-Incidentali/Bozze/               (retrocompat vecchio scaffolding)
   *   3. 06_Eventi-Incidentali/Finalizzati/          (idem)
   *
   * Deduplicazione per id: vince la versione con aggiornato_il più recente.
   * Ordine: data_ora decrescente (più recente prima).
   *
   * @param {string} cantiereId
   * @returns {Promise<object[]>}
   */
  const leggi = async (cantiereId) => {
    const root    = FILESYSTEM.getHandleAttivo();
    const cantDir = await root.getDirectoryHandle(cantiereId);
    const byId    = new Map();

    // Posizioni da cercare: [] = flat root, ['Bozze'] e ['Finalizzati'] = legacy
    const posizioni = [[], ..._LEGACY_SUBS.map(s => [s])];

    for (const subPath of posizioni) {
      let dir;
      try {
        dir = await FILESYSTEM.navigaPercorso(
          cantDir,
          [_CARTELLA, ...subPath],
          false
        );
      } catch (e) {
        if (e.name === 'NotFoundError') continue;  // sottocartella non esistente — normale
        throw e;
      }

      for await (const [nome, fh] of dir.entries()) {
        if (fh.kind !== 'file' || !nome.endsWith('.json')) continue;
        try {
          const ev = await FILESYSTEM.leggiJson(dir, nome);
          if (ev._cestino) continue;
          // Deduplicazione: mantieni la versione con aggiornato_il più recente
          const esistente = byId.get(ev.id);
          if (!esistente ||
              (ev.aggiornato_il ?? '') > (esistente.aggiornato_il ?? '')) {
            byId.set(ev.id, ev);
          }
        } catch { /* file corrotto o temporaneamente non leggibile — continua */ }
      }
    }

    const risultati = [...byId.values()];
    risultati.sort((a, b) =>
      (b.data_ora ?? b.creato_il ?? '').localeCompare(a.data_ora ?? a.creato_il ?? '')
    );
    return risultati;
  };

  // ── Cestino ──────────────────────────────────────────────────────────────────

  /**
   * Soft-delete: aggiunge _cestino:true + _eliminato_il al record.
   * Scrive il tombstone in TUTTE le posizioni note (flat + legacy) dove il file esiste,
   * così leggi() non legge mai la versione non-cestinata da una sottocartella legacy.
   * @param {object} evento
   * @returns {Promise<object>}  il tombstone
   */
  const cestina = async (evento) => {
    const tombstone = {
      ...evento,
      _cestino:      true,
      _eliminato_il: new Date().toISOString(),
    };
    const root    = FILESYSTEM.getHandleAttivo();
    const cantDir = await root.getDirectoryHandle(evento.cantiere_id);

    for (const subPath of [[], ..._LEGACY_SUBS.map(s => [s])]) {
      try {
        const dir = await FILESYSTEM.navigaPercorso(
          cantDir,
          [_CARTELLA, ...subPath],
          false
        );
        try {
          // Scrivi il tombstone solo se il file esiste in questa posizione
          await dir.getFileHandle(`${evento.id}.json`);
          await FILESYSTEM.scriviJson(dir, `${evento.id}.json`, tombstone);
        } catch (e) {
          if (e.name !== 'NotFoundError') throw e;
        }
      } catch (e) {
        if (e.name !== 'NotFoundError') console.warn('[eventi] cestina:', e);
      }
    }
    return tombstone;
  };

  /**
   * Ripristina un evento cestinato: rimuove _cestino e _eliminato_il.
   * Scrive sempre nella posizione canonica (flat), migrando implicitamente
   * i record legacy alla nuova collocazione.
   * @param {object} evento  il record con _cestino:true
   * @returns {Promise<object>}  il record ripristinato
   */
  const ripristina = async (evento) => {
    // eslint-disable-next-line no-unused-vars
    const { _cestino, _eliminato_il, ...ripristinato } = evento;
    ripristinato.aggiornato_il = new Date().toISOString();
    const dir = await _getDirFlat(ripristinato.cantiere_id, true);
    await FILESYSTEM.scriviJson(dir, `${ripristinato.id}.json`, ripristinato);
    return ripristinato;
  };

  /**
   * Eliminazione fisica definitiva del file (solo post-cestino su conferma utente).
   * Tenta in tutte le posizioni note: flat + legacy.
   * @param {object} evento
   */
  const eliminaDefinitiva = async (evento) => {
    const root    = FILESYSTEM.getHandleAttivo();
    const cantDir = await root.getDirectoryHandle(evento.cantiere_id);

    for (const subPath of [[], ..._LEGACY_SUBS.map(s => [s])]) {
      try {
        const dir = await FILESYSTEM.navigaPercorso(
          cantDir,
          [_CARTELLA, ...subPath],
          false
        );
        const fh = await dir.getFileHandle(`${evento.id}.json`);
        await fh.remove?.();   // File System Access API — non tutti i browser la supportano
      } catch (e) {
        if (e.name !== 'NotFoundError') console.warn('[eventi] eliminaDefinitiva:', e);
      }
    }
  };

  // ── Utility pubbliche ────────────────────────────────────────────────────────

  /**
   * Etichetta leggibile per la categoria.
   * @param {string} cat
   * @returns {string}
   */
  const etichettaCategoria = (cat) => ({
    infortunio:              'Infortunio',
    near_miss:               'Near miss',
    incidente_cose_ambiente: 'Incidente (cose/ambiente)',
  }[cat] ?? cat ?? '—');

  /**
   * Etichetta leggibile per la gravità (condizionale alla categoria).
   * @param {string} gravita
   * @param {string} categoria
   * @returns {string}
   */
  const etichettaGravita = (gravita, categoria) => {
    const LABELS = {
      // infortuni
      lieve:                'Lieve',
      prognosi_oltre_3gg:   'Prognosi > 3 gg',
      grave:                'Grave',
      mortale:              'Mortale',
      // near-miss (gravità potenziale)
      potenziale_lieve:     'Potenziale lieve',
      potenziale_grave:     'Potenziale grave',
      potenziale_mortale:   'Potenziale mortale',
      // incidente cose/ambiente
      danno_lieve:          'Danno lieve',
      danno_rilevante:      'Danno rilevante',
    };
    return LABELS[gravita] ?? gravita ?? '—';
  };

  /**
   * CSS class semaforo per la gravità (usato dalla vista cruscotto).
   * Logica: mortale/potenziale_mortale/danno_rilevante = rosso;
   *         grave/prognosi_oltre_3gg/potenziale_grave   = arancio;
   *         lieve/potenziale_lieve/danno_lieve           = giallo.
   */
  const gravitaCls = (gravita) => {
    if (['mortale', 'potenziale_mortale'].includes(gravita))
      return 'bg-red-100 text-red-800 font-semibold';
    if (['grave', 'prognosi_oltre_3gg', 'potenziale_grave', 'danno_rilevante'].includes(gravita))
      return 'bg-orange-100 text-orange-800';
    return 'bg-amber-50 text-amber-700';
  };

  /**
   * Restituisce i valori di gravità validi per una data categoria.
   * Usato dalla vista per popolare il selettore gravità al cambio categoria.
   * @param {string} categoria
   * @returns {string[]}
   */
  const gravitaPerCategoria = (categoria) => GRAVITA[categoria] ?? [];

  // ── Hook Diario CSE — best-effort (non bloccano mai l'operazione evento) ──────

  /**
   * Tenta di registrare la CREAZIONE di un evento nel Diario CSE.
   * DATI SENSIBILI: propaga solo categoria, gravità, impresa e data —
   * MAI persona coinvolta, CF o dati sanitari (la voce diario è un promemoria).
   */
  const _hookDiarioEventoCreato = async (evento) => {
    if (typeof DIARIO_SERVICE === 'undefined') return;
    const impresa  = _nomeImpresa(evento.impresa_id);
    const soggetti = impresa ? [impresa] : [];
    await DIARIO_SERVICE.creaVoceAuto({
      cantiere_id: evento.cantiere_id,
      tipo:        'EVENTO_INCIDENTALE',
      titolo:      `Evento registrato — ${etichettaCategoria(evento.categoria)}`,
      descrizione: [
        `Categoria: ${etichettaCategoria(evento.categoria)}`,
        `Gravità: ${etichettaGravita(evento.gravita, evento.categoria)}`,
        impresa         ? `Impresa: ${impresa}`                          : null,
        evento.data_ora ? `Data evento: ${UTILS.formatData(evento.data_ora)}` : null,
      ].filter(Boolean).join('\n'),
      soggetti,
      riferimento: evento.id,
    });
  };

  /**
   * Tenta di registrare la CHIUSURA di un evento nel Diario CSE.
   * Chiamata solo quando nuovoStato === 'chiuso'. Stessa regola dati sensibili.
   */
  const _hookDiarioEventoChiuso = async (evento) => {
    if (typeof DIARIO_SERVICE === 'undefined') return;
    const impresa  = _nomeImpresa(evento.impresa_id);
    const soggetti = impresa ? [impresa] : [];
    await DIARIO_SERVICE.creaVoceAuto({
      cantiere_id: evento.cantiere_id,
      tipo:        'EVENTO_INCIDENTALE',
      titolo:      `Evento chiuso — ${etichettaCategoria(evento.categoria)}`,
      descrizione: [
        `Categoria: ${etichettaCategoria(evento.categoria)}`,
        `Gravità: ${etichettaGravita(evento.gravita, evento.categoria)}`,
        impresa ? `Impresa: ${impresa}` : null,
        `Data chiusura: ${UTILS.formatData(new Date().toISOString())}`,
      ].filter(Boolean).join('\n'),
      soggetti,
      riferimento: evento.id,
    });
  };

  // ── API pubblica ─────────────────────────────────────────────────────────────

  return {
    // Costanti
    CATEGORIE,
    GRAVITA,
    STATI,
    // Schema
    creaVuota,
    // CRUD
    crea,
    aggiorna,
    cambiaStato,
    // Lettura
    leggi,
    // Ciclo vita
    cestina,
    ripristina,
    eliminaDefinitiva,
    // Utility vista
    etichettaCategoria,
    etichettaGravita,
    gravitaCls,
    gravitaPerCategoria,
    // Helper (accessibile per test console)
    _nomeImpresa,
  };

})();
