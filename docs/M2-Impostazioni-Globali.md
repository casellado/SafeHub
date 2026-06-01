# MODULO M2 — IMPOSTAZIONI GLOBALI DEL PO
## L'identità del CSE e la configurazione che alimenta tutto · v1.0 · 31 maggio 2026

> **Cosa è questo documento.** Il design del modulo che raccoglie, in un solo posto configurato una
> volta, i dati fissi del PO/CSE: identità, firma permanente, logo, codici e versioni dei moduli
> qualità, soglie di scadenza. Questi dati **alimentano tutti gli altri moduli** — in particolare M6
> (logo + codici nell'header dei documenti) e ogni documento firmato dal CSE. Si configura raramente,
> si usa ovunque.

> **Dipendenze.** Poggia su M1 (fondazione, filesystem, IDB). Alimenta M6 (motore DOCX) e tutti i
> moduli di Flusso A/B che producono documenti firmati dal CSE. Storage in `_config/` (contratto
> tecnico §3.2).

---

## 1. INQUADRAMENTO

### 1.1 Cosa fa M2
Gestisce la configurazione globale del PO, che non cambia da cantiere a cantiere:
- **Identità del CSE**: nome, cognome, qualifica, eventuali estremi professionali.
- **Firma permanente**: la firma PNG del CSE, acquisita una volta, riusata in ogni documento.
- **Logo aziendale**: il PNG che M6 inserisce nell'header (`{%logo_aziendale}`).
- **Moduli qualità**: per ogni tipo di documento, il codice modulo e la versione (header dei documenti).
- **Soglie di scadenza**: i preavvisi per tipo di documento (alimentano i cruscotti dell'Anagrafica).
- **Preferenze app**: ultimo cantiere, opzioni di visualizzazione, soglia sync, ecc.

### 1.2 Cosa NON fa M2
- Non gestisce dati di cantiere (quelli sono in M3/M4).
- Non gestisce le persone del cantiere (quelle sono anagrafica, M4). M2 è SOLO il PO stesso.
- Non genera documenti: fornisce i dati a chi li genera (M6 e moduli).

### 1.3 Principio chiave: configura una volta, usa ovunque
Il valore di M2 è eliminare la riscrittura. Il PO inserisce la sua firma, il suo logo e i codici
moduli UNA volta; da lì ogni verbale, verifica, NC li eredita automaticamente. È l'opposto del
reinserire i propri dati ad ogni documento.

---

## 2. STORAGE

### 2.1 Dove vivono i dati
File unico in `_config/` (dal contratto tecnico §3.2):
```
SafeHub-CSE-Lavori/_config/
└── impostazioni-archivio.json     ← tutta la configurazione globale del PO
```
Cache in IDB store `impostazioni_archivio` (da M1 §4). Il file è canonico, l'IDB è cache.

### 2.2 Perché un file unico
Le impostazioni si leggono all'avvio e si usano ovunque; tenerle in un file solo, letto una volta e
cacheato, è semplice e robusto. Niente frammentazione.

### 2.3 Riservatezza
Il file vive nel tenant del committente (OneDrive aziendale). La firma PNG e l'identità del PO sono
dati personali del PO stesso — nessun dato di terzi qui. Coerente col principio di riservatezza
(nessun riferimento identificativo del committente nei dati pubblici, ma questo file è interno).

---

## 3. STRUTTURA DEI DATI (impostazioni-archivio.json)

```jsonc
{
  "schema_version": "1.0",
  "aggiornato_il": "2026-05-31T...",

  "cse": {                              // identità del PO/CSE — usata in firma e header
    "nome_cognome": "<COGNOME NOME>",
    "qualifica": "Coordinatore Sicurezza in fase di Esecuzione",
    "titolo_professionale": "<es. Geometra>",   // facoltativo
    "estremi": "<albo/n. iscrizione, facoltativo>"
  },

  "firma_permanente": {                 // la firma del CSE, riusata in ogni documento
    "firma_png_base64": "data:image/png;base64,...",
    "acquisita_il": "2026-05-31T...",
    "tipo_firma": "permanente"          // coerente col redattore del contratto tecnico
  },

  "logo_aziendale": {                   // alimenta {%logo_aziendale} di M6
    "png_base64": "data:image/png;base64,...",
    "descrizione": "<es. logo studio / committente>"
  },

  "moduli_qualita": {                   // per tipo documento: codice + versione (header M6)
    "verbale-sopralluogo":  { "codice": "Mod.VS.01", "versione": "Rev.2 — 05/2026", "titolo": "Verbale di sopralluogo" },
    "verbale-riunione":     { "codice": "Mod.VR.01", "versione": "Rev.1 — 05/2026", "titolo": "Verbale di riunione di coordinamento" },
    "verifica-pos":         { "codice": "Mod.VP.01", "versione": "Rev.1 — 05/2026", "titolo": "Verifica idoneità POS" },
    "verifica-itp":         { "codice": "Mod.IT.01", "versione": "Rev.1 — 05/2026", "titolo": "Verifica idoneità tecnico-professionale" },
    "proposta-sospensione": { "codice": "Mod.PS.01", "versione": "Rev.1 — 05/2026", "titolo": "Proposta di sospensione lavori" },
    "non-conformita":       { "codice": "Mod.NC.01", "versione": "Rev.1 — 05/2026", "titolo": "Non conformità" },
    "evento-incidentale":   { "codice": "Mod.EI.01", "versione": "Rev.1 — 05/2026", "titolo": "Evento incidentale" }
    // ... estendibile per ogni nuovo tipo di documento
  },

  "soglie_scadenza": {                  // preavvisi PER DOCUMENTO (alimentano cruscotti Anagrafica §5.4)
    "abilitazione_operatore": { "giorni": 60, "criticita": "critica" },
    "verifica_periodica_mezzo": { "giorni": 60, "criticita": "critica" },
    "idoneita_sanitaria": { "giorni": 45, "criticita": "critica" },
    "pimus_ponteggi": { "giorni": 60, "criticita": "critica" },
    "patente_crediti": { "giorni": 45, "criticita": "critica" },
    "formazione": { "giorni": 45, "criticita": "alta" },
    "durc": { "giorni": 30, "criticita": "alta" },
    "polizza_rc": { "giorni": 30, "criticita": "alta" },
    "default": { "giorni": 30, "criticita": "normale" }
  },

  "preferenze_app": {
    "ultimo_cantiere_id": "CZ399",
    "soglia_sync_avviso_giorni": 7,
    "tema": "chiaro"
  }
}
```

> Nota: la tabella `soglie_scadenza` è la materializzazione della decisione PO su Anagrafica §5.4
> (preavvisi per documento, scadenze critiche di sicurezza). Vive QUI perché è configurazione globale
> del PO, e l'Anagrafica la legge. Un solo posto dove regolare i preavvisi.

---

## 4. INTERFACCIA (sezioni del modulo)

Modulo a sezioni (tab o accordion), ognuna autosufficiente:

### 4.1 Identità CSE
Form: nome/cognome, qualifica, titolo professionale, estremi. Semplice, testuale.

### 4.2 Firma permanente
- Pulsante "Acquisisci/Aggiorna firma" → apre il canvas di firma (stesso componente di SafeCant,
  `firme-canvas.js`: Pointer Events, crop bounding box, PNG trasparente base64).
- Anteprima della firma corrente.
- La firma acquisita qui è quella che ogni documento del CSE userà. Aggiornarla aggiorna i documenti
  futuri (non quelli già finalizzati).

### 4.3 Logo aziendale
- Upload PNG → salvato base64.
- Anteprima.
- È il logo che M6 inserisce nell'header dei documenti.

### 4.4 Moduli qualità
- Per ogni tipo di documento: campi codice, versione, titolo.
- Modificabili (i codici/versioni cambiano nel tempo col sistema qualità).
- Il titolo serve a M6 se si adotta il template a titolo variabile (M6 §9).

### 4.5 Soglie di scadenza
- Tabella editabile: per ogni tipo di documento, giorni di preavviso + livello di criticità.
- Valori iniziali precompilati (§3). Il PO può regolarli.
- Le scadenze "critica" non si possono portare a 0 giorni (guardrail: una scadenza critica DEVE avere
  preavviso). Coerente con la richiesta "nessuna sorpresa" dell'Anagrafica.

### 4.6 Preferenze app
Ultimo cantiere (gestito in automatico), soglia avviso sync, tema. Minimali.

---

## 5. COME GLI ALTRI MODULI USANO M2

M2 espone (via `shared/`) un accesso in sola lettura alla configurazione:
- **M6** legge `logo_aziendale`, `moduli_qualita[tipo]` (codice/versione/titolo) per l'header.
- **Ogni modulo documento** (Flusso A/B) legge `cse` + `firma_permanente` per inserire identità e
  firma del CSE nel `corpo_html` (la firma del CSE va nel corpo come `<img>`, pattern SafeCant).
- **Anagrafica (M4)** legge `soglie_scadenza` per calcolare gli alert dei cruscotti.
- **M1** legge/scrive `preferenze_app` (ultimo cantiere).

Nessun modulo duplica questi dati: li legge da M2. Aggiornare la firma o un codice modulo in M2 si
riflette ovunque.

---

## 6. RELAZIONE CON IL "REDATTORE" DI SAFECANT

Nel contratto tecnico, il verbale ha un `redattore` con `nome_cognome`, `qualifica`,
`firma_png_base64`, `tipo_firma: "permanente"`. In Archivio, questi valori vengono da M2 (`cse` +
`firma_permanente`): il CSE titolare è il redattore dei documenti che produce in Archivio.

> Aggancio col bug SafeCant (nome compilatore mancante): in SafeCant il redattore è l'ispettore di
> cantiere configurato sul dispositivo; in Archivio è il PO/CSE da M2. Sono due configurazioni
> analoghe in due prodotti — stesso pattern "identità + firma permanente configurata una volta". Quando
> si sistemerà SafeCant, il concetto sarà lo stesso di M2.

---

## 7. CRITERIO DI CHIUSURA DI M2

M2 è chiuso quando:
- la configurazione si salva in `_config/impostazioni-archivio.json` e si ricarica all'avvio (cache IDB);
- l'identità CSE si inserisce e si modifica;
- la firma permanente si acquisisce col canvas e si vede in anteprima;
- il logo si carica e si vede in anteprima;
- i moduli qualità (codice/versione/titolo per tipo) si editano;
- le soglie di scadenza si editano, con guardrail sulle critiche (no 0 giorni);
- un modulo di prova (o M6) legge correttamente logo + codici da M2;
- aggiornare un valore in M2 si riflette nei moduli che lo leggono (nessuna copia locale).

---

## 8. DECISIONI APERTE PER IL PO

1. **Codici moduli qualità reali**: i valori in §3 sono placeholder (`Mod.VS.01`...). Servono i codici
   e versioni reali del tuo sistema qualità. Li inserisci tu in fase di configurazione, ma se li hai
   già definiti possiamo precompilarli.
2. **Una firma o più firme?** Il CSE ha una firma sola, immagino. Confermi che basta una firma
   permanente (non, ad esempio, una firma diversa per tipo di documento)?

---

## 9. PROSSIMI PASSI

1. Il PO rivede questo design.
2. Congelato M2 → è tra i primi moduli da costruire (fondazione dati), subito dopo M1 ed M6, perché
   M6 dipende dal logo/codici che M2 fornisce.
3. Poi M3 (gestione cantieri) e M4 (anagrafica), che useranno il cantiere corrente di M1 e le soglie di M2.

---

*Design M2 Impostazioni globali v1.0 — 31 maggio 2026. Poggia su M1 (fondazione, _config). Alimenta M6
(logo/codici) e ogni modulo documento (identità/firma CSE). Le soglie scadenza materializzano la
decisione di Anagrafica §5.4. Configura una volta, usa ovunque.*
