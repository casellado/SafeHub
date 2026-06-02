# SPECIFICA — Proposta di Sospensione/Allontanamento del CSE (Mod.RE.01-14)
## Secondo documento del Flusso B — variazione del pilota Verbale di Riunione

> NATURA: è una LETTERA FORMALE (non un modulo a tabelle come il verbale). Documento testuale
> indirizzato a destinatari, con caselle da spuntare e campi compilabili.
> RIUSA il pattern del pilota Verbale di Riunione: stesso motore M6, stesso ciclo di vita
> (BOZZA → FINALIZZATO → PROTOCOLLATO), stessa vista Protocollati con link ai file, stesso
> editor ricco sui campi liberi, stesso promemoria normativo (pannello ℹ️), stessa collocazione
> menu sotto Operatività, stesso storage tipizzato per cantiere. NON reinventare nulla di tutto
> questo: copiare il pattern del verbale e cambiare il contenuto.

---

## MODELLO DATI (analogo al verbale, adattato)
```json
{
  "id": "UUID",
  "tipo_file": "proposta_sospensione",
  "cantiere_id": "...",
  "stato": "BOZZA | FINALIZZATO_DA_PROTOCOLLARE | PROTOCOLLATO",
  "numero_progressivo": null,
  "creato_il": "...", "aggiornato_il": "...",

  "luogo_data": "",
  "intestazione": {
    "ss": "", "cod_ppm_sil": "", "lavori": ""
  },
  "destinatari": {
    "direttore_lavori": "",
    "rup": ""
  },
  "contestazione": {
    "numero": "",
    "data": ""
  },
  "firma_cse": {},

  "provvedimenti": {
    "sospensione_lavori": false,
    "allontanamento_imprese":     { "flag": false, "valore": "", "impresa_id": null },
    "allontanamento_lav_autonomi":{ "flag": false, "valore": "", "rif_id": null },
    "risoluzione_contratto":      { "flag": false, "valore": "", "rif_id": null }
  },
  "inosservanze": {
    "art_94": false, "art_95": false, "art_96": false,
    "art_97_c1": false, "prescrizioni_art_100": false
  },
  "relativamente_a": "",
  "protocollo": null
}
```

---

## STRUTTURA DEL CORPO (generaCorpoHtmlPropostaSospensione)
Lettera formale. Solo tag del sottoinsieme M6 (h3, p, p[data-align], strong, em, br, table per firme, img).
**NON ripetere il titolo nel corpo** se è già nell'header del template (lezione dal verbale).

**1. LUOGO E DATA** — in alto a destra:
```html
<p data-align="right">[luogo_data]</p>
```
(campo libero; se vuoto, riga vuota)

**2. DESTINATARI** — blocco testo:
```
Al Responsabile dei Lavori
e, p.c. Al Direttore dei Lavori — [destinatari.direttore_lavori]
Al Responsabile Unico del Progetto (se figura diversa da RL) — [destinatari.rup]
```

**3. OGGETTO**:
```
Oggetto: S.S. n° [intestazione.ss]
Cod PPM/SIL [intestazione.cod_ppm_sil]
Lavori di [intestazione.lavori]
```

**4. TITOLO PARAGRAFO** (fisso, bold, centrato):
```
PROPOSTA DI SOSPENSIONE/ALLONTANAMENTO AI SENSI DELL'ART. 92 C.1 LETTERA E) DEL D.LGS. 81/08
```

**5. FRASE INTRODUTTIVA** (con campi inline):
```
Con riferimento al cantiere in oggetto e alla contestazione n. [contestazione.numero] del
[contestazione.data] all'impresa affidataria, il sottoscritto [qualifica nome cognome CSE],
in qualità di Coordinatore per la Sicurezza in fase di Esecuzione dei lavori, con la presente
```

**6. "PROPONE"** (centrato) — "di adottare il seguente provvedimento:"
4 voci con ☑/☐ (mostrare TUTTE e 4):
- ☑/☐ Sospensione dei lavori
- ☑/☐ Allontanamento della/e impresa/e [valore se presente]
- ☑/☐ Allontanamento del/i lavoratore/i autonomo/i [valore]
- ☑/☐ Risoluzione del contratto con l'impresa/il lavoratore autonomo [valore]

**7. "in quanto ha riscontrato le seguenti gravi inosservanze alle disposizioni di cui:"**
5 voci con ☑/☐ (tutte mostrate):
- ☑/☐ all'articolo 94 del D.Lgs 81/08
- ☑/☐ all'articolo 95 del D.Lgs 81/08
- ☑/☐ all'articolo 96 del D.Lgs 81/08
- ☑/☐ all'articolo 97 comma 1 del D.Lgs 81/08
- ☑/☐ alle prescrizioni del piano di cui all'articolo 100 del D.Lgs 81/08

**8.** "relativamente a:" + campo `relativamente_a` (HTML editor ricco)

**9. FIRMA** (solo CSE) — blocco fisso a destra, centrato, schema identico al verbale:
"Il Coordinatore per L'Esecuzione" / "[qualifica nome cognome]" / firma (img, dimensione uniforme)

---

## CAMPI / COMPORTAMENTI

| Campo | Fonte | Note |
|---|---|---|
| `luogo_data` | Manuale | Campo testo libero |
| `intestazione.ss` | Snapshot da `lotto.ssNumero` | alla creazione |
| `intestazione.cod_ppm_sil` | Snapshot da `lotto.codicePpmSil` | alla creazione |
| `intestazione.lavori` | Snapshot da `lotto.nome` | alla creazione |
| `destinatari.direttore_lavori` | Anagrafica `ruoli_istituzionali.dlId` | popola qualifica+nome |
| `destinatari.rup` | Anagrafica `ruoli_istituzionali.rupId` | popola qualifica+nome |
| `contestazione.numero` | **MANUALE** | TODO M14 (vedi sotto) |
| `contestazione.data` | **MANUALE** | TODO M14 (vedi sotto) |
| `provvedimenti` | UI: 4 checkbox + campi testo/select | impresa da anagrafica o libero |
| `inosservanze` | UI: 5 checkbox | |
| `relativamente_a` | Editor ricco | same/em/p[data-align]/br |
| `firma_cse` | Pre-popolata da M2 | sovrascrivibile canvas/upload |

```javascript
// TODO M14: quando esiste il modulo Non Conformità, sostituire i due campi manuali
// contestazione.numero e contestazione.data con una select/tendina delle NC del cantiere,
// ordinate per DATA DECRESCENTE (più recente in cima), che precompila numero e data.
// Per ora: input manuali.
```

---

## CICLO DI VITA E STORAGE (identico al verbale)

```
BOZZA  →  FINALIZZATO_DA_PROTOCOLLARE  →  PROTOCOLLATO
```

- Storage: `04_Proposte-Sospensione-CSE/Bozze/<uuid>.json` + `Protocollati/<numero>.json`
- Vista lista con toggle Bozze ↔ Protocollati
- Protocollati: numero/data + link FSA per PDF protocollato + lettera (stesso pattern del verbale)
- Output via M6: HTML + DOCX (NO PDF). M6 NON si tocca.

---

## PROMEMORIA NORMATIVO (NOTE_NORMATIVE, chiave `'proposta-sospensione'`)

```javascript
'proposta-sospensione': [
  {
    titolo: 'Riferimento normativo — lettera e)',
    testo: 'Proposta ex art. 92 c.1 lett. e) D.Lgs 81/08: il CSE PROPONE al Responsabile '
         + 'dei Lavori la sospensione/allontanamento/risoluzione in caso di gravi inosservanze. '
         + 'Il RL decide; il CSE non ha potere esecutivo diretto con questa lettera.',
  },
  {
    titolo: 'Distinzione lett. e) vs lett. f)',
    testo: 'Lettera e) = PROPOSTA al RL (questo modulo). '
         + 'Lettera f) = sospensione DIRETTA delle singole lavorazioni da parte del CSE '
         + 'in caso di pericolo grave e imminente direttamente riscontrato, senza dover '
         + 'passare dal RL. Sono due atti diversi: non confonderli.',
  },
  {
    titolo: 'Trasmissione',
    testo: 'Destinatari: Responsabile dei Lavori; per conoscenza al DL e al RUP (se diverso). '
         + 'Conservare copia. Trasmissione tracciabile (PEC / protocollo). '
         + 'La proposta richiama una contestazione/NC precedente: compilare numero e data.',
  },
]
```

---

## COLLAUDO

1. Crea proposta → intestazione+destinatari da anagrafica (SS, Lavori di, DL, RUP)
2. Compila contestazione (manuale: numero e data)
3. Spunta provvedimenti (es. allontanamento impresa → seleziona da anagrafica)
4. Spunta inosservanze (es. art. 94 + art. 96)
5. Compila campo "relativamente a" con editor ricco (grassetto, corsivo)
6. Firma CSE → finalizza
7. Anteprima HTML = struttura DOCX (lettera con destinatari, oggetto, ☑/☐, firma a destra)
8. Scarica DOCX → confronta col PDF ufficiale Mod.RE.01-14
9. Protocolla → compare in Protocollati con link al file
10. Verificare: nessun "undefined", nessun "ANAS" hardcoded, nessun campo vuoto spezzato

---

*Specifica M13 Proposta Sospensione CSE — salvata 02 giugno 2026.*
*Riusa il pattern dal pilota Verbale di Riunione (v0.6.0). Storage: `04_Proposte-Sospensione-CSE/`.*
