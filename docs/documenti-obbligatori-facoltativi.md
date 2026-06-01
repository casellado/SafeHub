# DOCUMENTI OBBLIGATORI vs FACOLTATIVI — Logica di gradazione per il nuovo progetto
## SafeHub · 31 maggio 2026

> **Scopo.** Lo schema anagrafica v2.0 è la base del nuovo progetto. Questo documento definisce,
> per ogni documento, il suo GRADO normativo: OBBLIGATORIO (la legge lo impone), CONDIZIONATO
> (obbligatorio solo se ricorre una condizione), FACOLTATIVO (il CSE PUÒ richiederlo come clausola).
> Serve a graduare la UI guida-non-blocca: l'assenza di un obbligatorio è un warning FORTE,
> l'assenza di un facoltativo è un suggerimento BLANDO. Mai un blocco (principio P3 dello schema).

---

## 1. I TRE GRADI (come la UI deve trattarli)

| Grado | Significato | Trattamento UI |
|---|---|---|
| 🔴 **OBBLIGATORIO** | imposto dalla legge; la sua assenza è non-conformità | warning FORTE (giallo intenso), in evidenza |
| 🟠 **CONDIZIONATO** | obbligatorio solo SE ricorre una condizione (soglia, ruolo, tipo lavoro) | warning attivo SOLO se la condizione è vera |
| 🟢 **FACOLTATIVO** | il CSE può esigerlo come clausola contrattuale (facoltà art.90 / Interpello 7/2013) | suggerimento blando, non in evidenza |

Nessun grado BLOCCA il salvataggio. Il CSE resta sovrano: può aggiungere, omettere, motivare.

---

## 2. LA SOGLIA CHE CAMBIA TUTTO: 200 uomini-giorno + Allegato XI

Prima di classificare i documenti, va fissata la regola-cardine (art. 90 c.9):

- **Cantiere ≥ 200 uomini-giorno OPPURE con rischi particolari (All. XI)** → idoneità
  tecnico-professionale COMPLETA (All. XVII pieno): CCIAA + DVR + DURC + dich. art.14.
- **Cantiere < 200 uomini-giorno E SENZA rischi All. XI** → verifica SEMPLIFICATA: bastano
  **CCIAA + DURC + autocertificazione** del possesso degli altri requisiti All. XVII. DVR e dich.
  art.14 diventano autocertificabili.

> ⚠️ Per la GRANDE OPERA del progetto (decine di cantieri, ~1000 persone): si è SEMPRE sopra le
> 200 uomini-giorno e quasi sempre in presenza di rischi All. XI. **Quindi per questo progetto vale
> sistematicamente il regime COMPLETO.** La semplificazione < 200 u/g è teoricamente nello schema
> ma praticamente non si applica ai lotti grandi. Va comunque modellata: il campo lotto può avere
> `regimeIdoneita: "completo|semplificato"` (default completo), così la UI sa quali documenti
> pretendere. Allegato XI = elenco lavori comportanti rischi particolari (es. seppellimento,
> caduta dall'alto >2m in certe condizioni, amianto, esplosivi, annegamento, ecc.).

---

## 3. IMPRESA — gradazione documenti

### Idoneità tecnico-professionale (All. XVII)
| Documento | Grado | Condizione / Norma |
|---|---|---|
| Iscrizione CCIAA (oggetto sociale inerente) | 🔴 OBBLIGATORIO | sempre · All.XVII 1.a — NON autocertificabile mai |
| DURC in corso di validità | 🔴 OBBLIGATORIO | sempre · All.XVII 1.c — NON autocertificabile mai |
| DVR o autocertificazione (<10 dip.) | 🔴/🟠 | completo: obbligatorio; <200u/g: autocertificabile |
| Dichiarazione art.14 (no sospensioni/interdittivi) | 🔴/🟠 | completo: obbligatorio; <200u/g: autocertificabile |
| **Patente a crediti** (codice INL ≥15) | 🔴 OBBLIGATORIO | dal 01/10/2024 · D.M.132/2024 · per chi opera fisicamente |
| DOMA (organico medio annuo + denunce + CCNL) | 🔴/🟠 | completo: obbligatorio; <200u/g: sostituito da DURC + autocert. CCNL |

### Documenti dell'affidataria (art. 97) — solo se tipoRapporto = APPALTO
| Documento | Grado | Norma |
|---|---|---|
| Verifica idoneità subappaltatori | 🔴 OBBLIGATORIO | art.97 c.2 (obbligo dell'affidataria) |
| Verifica congruenza POS esecutrici | 🔴 OBBLIGATORIO | art.97 c.3.b |
| Formazione DL/dirigenti/preposti affidataria | 🔴 OBBLIGATORIO | art.97 c.3-ter |

### POS e piani
| Documento | Grado | Condizione |
|---|---|---|
| POS | 🔴/— | OBBLIGATORIO per esecutrice/subappalto/forn.posa; NON dovuto per affidataria-pura, nolo freddo, mera fornitura, servizio |
| Ricezione PSC dal CSE | 🔴 OBBLIGATORIO | per tutte le esecutrici (art.100) |

### Figure di sicurezza e nomine
| Documento | Grado | Note |
|---|---|---|
| Nomina RSPP | 🔴 OBBLIGATORIO | ogni impresa con dipendenti |
| Nomina Medico Competente | 🟠 CONDIZIONATO | obbligatorio se rischi che impongono sorveglianza sanitaria (in edilizia: di fatto sempre) |
| Designazione RLS / RLST | 🔴 OBBLIGATORIO | RLS interno o territoriale |
| Indicazione preposti | 🔴 OBBLIGATORIO | art.18-19 |
| Polizza RC | 🟢 FACOLTATIVO | non imposta da TUSL; spesso clausola contrattuale/capitolato |

---

## 4. LAVORATORE (dipendente) — gradazione

| Documento | Grado | Condizione / Norma |
|---|---|---|
| Formazione generale + specifica (art.37) | 🔴 OBBLIGATORIO | sempre · aggiornamento quinquennale |
| Formazione preposto | 🟠 CONDIZIONATO | solo se è preposto · aggiornamento biennale (dal 2022) |
| Abilitazioni attrezzature (gru, PLE, carrelli…) | 🟠 CONDIZIONATO | solo se usa quelle attrezzature · art.73 c.5 / ASR 22/02/2012 |
| Idoneità sanitaria (visita medica) | 🟠 CONDIZIONATO | obbligatoria se mansione soggetta a sorveglianza (edilizia: di norma sì) · art.41 |
| Tessera di riconoscimento (foto+generalità) | 🔴 OBBLIGATORIO | in appalto/subappalto · art.26 c.8 / art.18 c.1.u |
| Badge di cantiere | 🟠 CONDIZIONATO | dall'attuazione del D.M. · DL 159/2025 — si aggiunge alla tessera, non la sostituisce |
| Formazione amianto/funi/ponteggi | 🟠 CONDIZIONATO | solo per quelle lavorazioni (norme speciali) |

---

## 5. LAVORATORE AUTONOMO — il caso speciale (la distinzione più sottile)

Qui obbligatorio/facoltativo è giuridicamente NETTO e spesso frainteso. Fonte: art.21, art.94,
All.XVII p.2, **Interpello 7/2013**.

**Documenti che il CSE DEVE verificare (🔴 obbligatori da esibire):**
| Documento | Norma |
|---|---|
| Iscrizione CCIAA (oggetto sociale inerente) | All.XVII 2.a |
| Documentazione conformità macchine/attrezzature/opere provvisionali | All.XVII 2.b |
| Elenco DPI in dotazione | All.XVII 2.c |
| DURC | All.XVII 2.e |
| Tessera di riconoscimento (se appalto/subappalto) | art.21 c.1.c |
| Patente a crediti (se opera fisicamente in cantiere) | D.M.132/2024 |

**Documenti che il CSE NON può esigere ma PUÒ richiedere (🟢 facoltativi) — Interpello 7/2013:**
| Documento | Perché facoltativo |
|---|---|
| Attestati di formazione del lav. autonomo | art.21 c.2.b: la formazione è una FACOLTÀ del lav. autonomo, non obbligo (salvo norme speciali) |
| Idoneità sanitaria del lav. autonomo | art.21 c.2.a: sorveglianza sanitaria FACOLTATIVA (salvo rischi specifici imposti da norme speciali) |

> 🎯 Punto chirurgico: per un DIPENDENTE la formazione (art.37) è OBBLIGATORIA; per un LAVORATORE
> AUTONOMO la stessa formazione (art.21) è FACOLTATIVA. Lo schema deve trattarli diversamente: stesso
> campo `attestatoFormazione`, ma grado diverso secondo che il soggetto sia dipendente o autonomo.
> Il CSE può comunque esigere gli attestati come clausola contrattuale (facoltà art.90) — e in una
> grande opera è prassi farlo. La UI lo segnali come "facoltativo ma raccomandato".
>
> ECCEZIONE: per amianto, lavori su funi, montaggio ponteggi → la formazione torna OBBLIGATORIA
> anche per l'autonomo (norme speciali). Condizionato al tipo di lavorazione.

---

## 6. MEZZI / ATTREZZATURE — gradazione

| Documento | Grado | Condizione / Norma |
|---|---|---|
| Dichiarazione conformità CE | 🔴 OBBLIGATORIO | ogni macchina marcata CE · dir. macchine |
| Libretto/manuale uso e manutenzione | 🔴 OBBLIGATORIO | sempre · art.71 |
| Matricola INAIL (messa in servizio CIVA) | 🟠 CONDIZIONATO | solo attrezzature di sollevamento All.VII |
| Verifiche periodiche (1ª INAIL poi abilitato) | 🟠 CONDIZIONATO | solo All.VII · periodicità per tipo · art.71 c.11 |
| Registro controlli/manutenzione | 🔴 OBBLIGATORIO | sempre |
| Indagine supplementare | 🟠 CONDIZIONATO | solo attrezzature >20 anni · D.M.11/04/2011 |
| **PiMUS** | 🔴 OBBLIGATORIO | solo ponteggi · art.136 / All.XXII |
| Autorizzazione ministeriale ponteggio | 🔴 OBBLIGATORIO | solo ponteggi · art.131 |
| Progetto/disegno esecutivo ponteggio | 🟠 CONDIZIONATO | se >24m o configurazione non standard · art.133 |

---

## 7. NOLI — gradazione (governata da tipoNolo + superaSoglieSubappalto)

| Documento | Nolo FREDDO | Nolo CALDO < soglia | Nolo CALDO > soglia |
|---|:-:|:-:|:-:|
| Attestazione buono stato (art.72 c.2) | 🔴 OBBLIGATORIO | 🔴 OBBLIGATORIO | — (assorbito) |
| Conformità CE attrezzatura | 🔴 OBBLIGATORIO | 🔴 OBBLIGATORIO | 🔴 OBBLIGATORIO |
| Documenti operatore (form.+abilit.+sanit.) | — (no operatore) | 🔴 OBBLIGATORIO | 🔴 OBBLIGATORIO |
| POS | — | — | 🔴 OBBLIGATORIO (= subappalto) |
| Idoneità All.XVII + patente | — | 🟢 eventuale | 🔴 OBBLIGATORIO (= subappalto) |

---

## 8. COME LO SCHEMA RECEPISCE QUESTA GRADAZIONE

Lo schema v2.0 NON memorizza il grado nei dati (sarebbe ridondante e fragile): il grado è LOGICA
APPLICATIVA, calcolata da `tipoRapporto` + tipo soggetto + (per il lotto) `regimeIdoneita` +
condizioni. Suggerimenti minimi di campo:

1. `lotto`: aggiungere `regimeIdoneita: "completo|semplificato"` (default "completo") e
   `entitaUominiGiorno: number|null` + `rischiAllegatoXI: boolean` per calcolarlo.
2. `imprese` e soggetti: il grado di ciascun documento atteso si deriva a runtime dalla tabella di
   questo documento (è la "tabella di verità" della UI). Nessun nuovo campo dati necessario oltre al
   punto 1.
3. La UI colora: 🔴 mancante = warning forte · 🟠 mancante con condizione vera = warning · 🟢
   mancante = suggerimento blando · presente = verde · non pertinente = grigio. **Mai rosso bloccante.**

> Coerenza col principio P3: la gradazione serve a INFORMARE meglio il CSE, non a sostituirne il
> giudizio. Un cantiere reale ha sempre eccezioni; lo schema le ammette tutte.

---

*Fonti: D.Lgs 81/2008 (artt. 18, 19, 21, 26, 37, 41, 71, 73, 90, 94, 96, 97, 100, 101, 131, 133, 136;
All. VII, XI, XVII, XXII); D.M. 132/2024; D.M. 11/04/2011; DL 159/2025; Interpello Min. Lavoro 7/2013;
Accordo Stato-Regioni 22/02/2012. Ricerca 31/05/2026.*
