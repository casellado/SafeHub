/**
 * eventi-incidentali.js — M15 pezzo a: registrazione minima (vista provvisoria).
 *
 * STATO: pezzo a (motore/record). La vista ricca Alpine con form completo,
 * filtri per categoria, drawer e cruscotto è il pezzo b.
 *
 * Questa registrazione permette di:
 * 1. Navigare alla voce "Eventi Incidentali" nella sidebar senza il placeholder generico.
 * 2. Testare EVENTI_SERVICE via console del browser.
 * 3. Verificare che scaffolding e storage funzionino prima di costruire la UI.
 *
 * NON usa Alpine.initTree (nessun x-data in questo template provvisorio).
 * Nessun dato reale di persone nei test — solo nomi fittizi.
 */

'use strict';

// ── Template provvisorio (solo markup statico + info di test) ─────────────────

function _buildTemplateProvvisorio() {
  const cantiere    = Alpine.store('cantiere');
  const cantId      = cantiere?.id
    ? cantiere.nome ?? cantiere.id
    : '(nessun cantiere selezionato)';
  const cantIdRaw   = cantiere?.id ?? '';
  const hasCantiere = !!cantiere?.id;

  const cmdBase  = `EVENTI_SERVICE.creaVuota('${cantIdRaw}')`;
  const cmdCrea  = `const ev = ${cmdBase};\nev.descrizione = 'Near miss attrezzatura — test fittizio (Lavoratore A)';\nev.categoria = 'near_miss';\nev.gravita = 'potenziale_grave';\nawait EVENTI_SERVICE.crea(ev);\nconsole.log('Creato:', ev.id);`;
  const cmdLeggi = `const lista = await EVENTI_SERVICE.leggi('${cantIdRaw}');\nconsole.log('Letti:', lista.length, lista);`;
  const cmdStato = `// Dopo crea(): prendi l'id dal log sopra\nconst aggiornato = await EVENTI_SERVICE.cambiaStato(lista[0], 'chiuso');\nconsole.log('Chiuso:', aggiornato.stato);`;
  const cmdConst = `console.log('Categorie:', EVENTI_SERVICE.CATEGORIE);\nconsole.log('Gravità per infortunio:', EVENTI_SERVICE.GRAVITA.infortunio);`;

  const avviso = hasCantiere ? '' : `
    <div style="background:#fef3c7;border:1px solid #fbbf24;border-radius:6px;
                padding:10px 14px;margin-bottom:16px;font-size:0.8125rem;color:#92400e">
      ⚠ Nessun cantiere selezionato — selezionane uno prima di eseguire i comandi.
    </div>`;

  const blocco = (titolo, codice) => `
    <div style="margin-bottom:16px">
      <p style="font-size:0.75rem;font-weight:600;text-transform:uppercase;
                letter-spacing:.05em;color:#64748b;margin:0 0 4px">${titolo}</p>
      <pre style="background:#0f172a;color:#e2e8f0;padding:12px;border-radius:6px;
                  font-size:0.78rem;line-height:1.55;overflow-x:auto;margin:0;
                  font-family:ui-monospace,SFMono-Regular,Menlo,monospace;
                  white-space:pre-wrap">${codice}</pre>
    </div>`;

  return `
<div role="region" aria-label="Eventi Incidentali — test pezzo a"
     style="max-width:700px;margin:0 auto;padding:24px 16px;font-family:inherit">

  <!-- Header -->
  <div style="display:flex;align-items:center;gap:10px;margin-bottom:6px">
    <span aria-hidden="true" style="font-size:1.75rem">🚨</span>
    <div>
      <h2 style="font-size:1.15rem;font-weight:700;color:#1e293b;margin:0">
        Eventi Incidentali
      </h2>
      <p style="font-size:0.8rem;color:#94a3b8;margin:2px 0 0">
        M15 — pezzo a attivo · vista provvisoria · cantiere: <strong>${cantId}</strong>
      </p>
    </div>
  </div>

  <!-- Nota pezzo a -->
  <div style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:6px;
              padding:10px 14px;margin:14px 0;font-size:0.8125rem;color:#1e40af">
    <strong>Pezzo a (motore)</strong> attivo. <code>EVENTI_SERVICE</code> è disponibile in console.
    La vista completa (form, cruscotto, filtri, allegati) è il <strong>pezzo b</strong>.
  </div>

  ${avviso}

  <!-- Comandi collaudo -->
  <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:16px;margin-bottom:16px">
    <p style="font-size:0.875rem;font-weight:600;color:#374151;margin:0 0 14px">
      Collaudo via console (F12 → Console)
    </p>

    ${blocco('1 — Costanti dominio', cmdConst)}
    ${blocco('2 — Crea evento (nome fittizio obbligatorio)', cmdCrea)}
    ${blocco('3 — Leggi tutti gli eventi del cantiere', cmdLeggi)}
    ${blocco('4 — Cambia stato aperto → chiuso', cmdStato)}
  </div>

  <!-- Checklist collaudo -->
  <details style="font-size:0.8125rem;color:#374151">
    <summary style="cursor:pointer;font-weight:600;padding:4px 0;list-style:none">
      ☑ Checklist collaudo pezzo a
    </summary>
    <ul style="margin:8px 0 0 16px;line-height:2;color:#4b5563">
      <li>Scaffolding: nuovo cantiere crea <code>06_Events-Incidentali/</code> senza Bozze/Finalizzati</li>
      <li>leggi() su cantiere con vecchie sottocartelle non si rompe</li>
      <li>crea() scrive <code>&lt;uuid&gt;.json</code> con schema corretto</li>
      <li>aggiorna() riscrive in posizione fissa (nessuno spostamento)</li>
      <li>cambiaStato() cambia campo, file fermo</li>
      <li>cestina() scrive tombstone in tutte le posizioni note</li>
      <li>ripristina() / eliminaDefinitiva() funzionano</li>
      <li>Nessun CF/dato sanitario nel record; test con nomi fittizi</li>
      <li>NC, diario, anagrafica e altri moduli: invariati</li>
    </ul>
  </details>
</div>`;
}

// ── Registrazione ─────────────────────────────────────────────────────────────

window.MODULI_REGISTRATI = window.MODULI_REGISTRATI ?? {};
window.MODULI_REGISTRATI['eventi-incidentali'] = {
  monta(contenitore) {
    contenitore.innerHTML = _buildTemplateProvvisorio();
  },
};
