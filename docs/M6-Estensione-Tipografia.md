# SPEC — Estensione tipografica di M6 (interlinea, spaziatura, indentazione)
## Obiettivo: i documenti del Flusso B devono "respirare" come il modulo ufficiale ANAS

> PROBLEMA ATTUALE: M6 genera i paragrafi compressi (interlinea minima, nessuno stacco tra sezioni,
> nessuna indentazione), quindi i documenti escono schiacciati in alto e spogli rispetto ai moduli
> ufficiali. SOLUZIONE: estendere M6 affinché sappia applicare ai paragrafi proprietà tipografiche
> (interlinea, spazio prima/dopo, indentazione), pilotate da attributi nell'HTML in ingresso.
> Questo è un miglioramento del MOTORE: vale per TUTTI i documenti (proposta, verbale, futuri).

---

## VALORI REALI estratti dal modulo ufficiale ANAS Mod.RE.01-14 (riferimento)

(unità Word: twip = 1/20 di punto; 567 twip ≈ 1 cm)

- **Margini pagina**: top/right/bottom/left = 720 (1,27 cm), header = 425.
- **Testo corrente / paragrafi narrativi**: interlinea `w:line="360" w:lineRule="auto"` (≈ 1,5 righe).
- **Oggetto** (righe SS/CodPPM/Lavori): interlinea `w:line="280" w:lineRule="exact"`.
- **Voci elenco con casella** (provvedimenti, inosservanze): indentazione `w:ind w:left="567" w:hanging="283"` (rientro ~1 cm con la casella che sporge a sinistra).
- **Blocco destinatari**: rientrato a destra, `w:ind w:left="5529"` circa (≈ 9,7 cm da sinistra → blocco a destra).
- **Firma CSE**: rientrata a destra `w:ind w:left="5670"`, allineamento center.
- **Titolo proposta** (art.92): dimensione `w:sz="20"` (10pt), giustificato.
- **Tra le sezioni**: il modulo usa paragrafi di spaziatura/righe con sz ridotta come stacco.

---

## COSA ESTENDERE IN M6 (convertitore HTML→OOXML)

Il convertitore deve riconoscere alcuni **ATTRIBUTI sull'HTML in ingresso** e tradurli in proprietà
del paragrafo OOXML (`w:pPr`). Contratto attributi (M6 li legge e li applica):

### 1. INTERLINEA — attributo `data-line` sul `<p>`

| Valore | OOXML | Uso |
|---|---|---|
| `data-line="15"` | `<w:spacing w:line="360" w:lineRule="auto"/>` | Testo narrativo (1,5 righe) |
| `data-line="exact280"` | `<w:spacing w:line="280" w:lineRule="exact"/>` | Righe oggetto/compatte |
| _(nessun attributo)_ | `<w:spacing w:line="276" w:lineRule="auto"/>` | Default ragionevole (≈1,15) invece di compresso |

### 2. SPAZIO PRIMA/DOPO il paragrafo — attributi `data-before` / `data-after` (in twip)

- `data-after="120"` → `<w:spacing w:after="120"/>` (stacco di 6pt dopo)
- Usare uno stacco standard tra le SEZIONI (h3 e blocchi) per dare respiro.
- Default h3: `spacing before="160" after="80"` (piccolo stacco visibile).

### 3. INDENTAZIONE — attributo `data-indent` sul `<p>`

| Valore | OOXML | Uso |
|---|---|---|
| `data-indent="elenco"` | `<w:ind w:left="567" w:hanging="283"/>` | Voci con casella ☑/☐ |
| `data-indent="destra"` | `<w:ind w:left="5529"/>` | Blocco destinatari (proposta) |
| `data-indent="firma"` | `<w:ind w:left="5670"/>` | Blocco firma CSE |

In alternativa: `data-left` / `data-hanging` in twip per valori arbitrari (generalità).

### 4. SPACING DEFAULT SU h3

Ogni `<h3>` in uscita OOXML deve avere: `<w:spacing w:before="200" w:after="80"/>` così le sezioni
non si toccano mai senza bisogno di attributi espliciti.

> NB IMPORTANTE: M6 SAPPIA applicare queste proprietà; i VALORI specifici li passa il documento via
> attributi HTML. Così verbale e proposta possono usare gli stessi attributi con valori coerenti.
> NON hardcodare valori specifici-proposta dentro M6.

---

## COME USARLI NEI DOCUMENTI

| Elemento | Attributo | Note |
|---|---|---|
| Paragrafi narrativi (racconto, relativamente_a, frase introduttiva) | `data-line="15"` | Interlinea 1,5 |
| Righe oggetto (SS, CodPPM, Lavori) | `data-line="exact280"` | Compatto e preciso |
| Voci provvedimenti/inosservanze + voci checklist verbale | `data-indent="elenco"` | ☑/☐ rientrato |
| Blocco destinatari (proposta) | `data-indent="destra"` | Allineato a destra |
| Blocco firma | `data-indent="firma"` | Allineato a destra |
| Stacco sezioni | default h3 + eventuale `data-after` | Spacing automatico |

---

## VINCOLI / CAUTELE

- M6 è il motore condiviso: l'estensione NON deve rompere ciò che già rende. Il **verbale** (già collaudato) va **ricollaudato** dopo la modifica: deve restare corretto e beneficiare del respiro tipografico.
- Anteprima HTML e DOCX devono restare coerenti: applicare gli stili anche nell'anteprima con CSS equivalente (es. `[data-line="15"]{line-height:1.5}`, `[data-indent="elenco"]{padding-left:2em}`).
- Mantenere il sottoinsieme tag esistente; si aggiungono solo **attributi opzionali** sui tag già supportati.
- Niente "righe vuote finte" per fare spazio: usare le proprietà di `spacing` (modo robusto e pulito).

---

## OBIETTIVO DI RISULTATO (onesto)

Il DOCX non sarà identico-al-pixel al cartaceo ANAS (niente cornici/box/sfondi grigi), ma deve
passare da "schiacciato e spoglio" a "documento che respira": interlinea adeguata, sezioni staccate,
elenchi rientrati, blocchi destinatari/firma posizionati. Aspetto professionale, consegnabile senza
ritocchi manuali sostanziali.

---

## COLLAUDO

1. **Rigenera la PROPOSTA**: deve respirare — interlinea 1,5 sui testi, caselle rientrate, destinatari a destra, firma a destra, sezioni staccate. Confronta col modulo ufficiale Mod.RE.01-14.
2. **RICOLLAUDA il VERBALE**: rigenera un verbale e verifica che sia ancora corretto e **migliorato** (non peggiorato) dalla nuova spaziatura.
3. **Anteprima HTML coerente** col DOCX in entrambi.

---

*Spec M6-Estensione-Tipografia — salvata 02 giugno 2026.*
*Prerequisito: M6 motore documenti (v0.6.0) già funzionante. Da implementare prima del collaudo finale Proposta Sospensione.*
