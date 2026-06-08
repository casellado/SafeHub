#!/usr/bin/env python3
"""
validate_rag.py — Guardiano di integrità del RAG normativo CSE (SafeHub / SecondBrain).

Da rieseguire OGNI VOLTA che il RAG viene aggiornato (nuovi chunk, correzioni).
Verifica l'integrità STRUTTURALE, non il merito normativo (quello spetta al CSE).

Uso:
    python3 validate_rag.py rag_cse_completo.json

Esce con codice 0 se tutto ok, 1 se trova errori bloccanti.
"""
import json
import sys
from collections import Counter

# ── Vocabolari controllati (lista chiusa: estendere consapevolmente) ──
TIPI_AMMESSI = {"norma", "buona_pratica", "giurisprudenza"}
TEMI_AMMESSI = {
    "psc", "pos", "contestazione", "vigilanza", "sospensione", "coordinamento",
    "lavori_in_quota", "ponteggi", "scavi", "dpi", "rischio_elettrico",
    "rischio_interferenziale", "notifica_preliminare", "idoneita_tecnico_professionale",
    "infortuni", "formazione", "costi_sicurezza", "patente_a_crediti",
}
AMBITI_AMMESSI = {"cantiere", "cse", "grandi_infrastrutture"}
CAMPI_OBBLIGATORI = {"id", "tipo", "fonte", "riferimento", "tema", "ambito",
                     "titolo", "testo", "note_cse", "collegamenti"}
CAMPI_OPZIONALI = {"testo_originale"}
LUNGHEZZA_MIN_TESTO = 120


def valida(path):
    errori, avvisi = [], []
    with open(path, encoding="utf-8") as f:
        d = json.load(f)

    if "meta" not in d or "chunks" not in d:
        errori.append("Manca 'meta' o 'chunks' alla radice.")
        return errori, avvisi, None
    ch = d["chunks"]
    ids = [c.get("id") for c in ch]

    # 1. id univoci e presenti
    if None in ids:
        errori.append("Almeno un chunk è privo di 'id'.")
    dup = [i for i, n in Counter(ids).items() if n > 1]
    if dup:
        errori.append(f"id duplicati: {dup}")

    # 2. schema: campi obbligatori presenti, nessun campo sconosciuto
    ammessi = CAMPI_OBBLIGATORI | CAMPI_OPZIONALI
    for c in ch:
        cid = c.get("id", "?")
        manca = CAMPI_OBBLIGATORI - set(c)
        if manca:
            errori.append(f"[{cid}] campi obbligatori mancanti: {sorted(manca)}")
        sconosciuti = set(c) - ammessi
        if sconosciuti:
            avvisi.append(f"[{cid}] campi non previsti: {sorted(sconosciuti)}")

    # 3. vocabolari controllati
    for c in ch:
        cid = c.get("id", "?")
        if c.get("tipo") not in TIPI_AMMESSI:
            errori.append(f"[{cid}] tipo non ammesso: {c.get('tipo')}")
        for t in c.get("tema", []):
            if t not in TEMI_AMMESSI:
                avvisi.append(f"[{cid}] tema fuori vocabolario: {t}")
        for a in c.get("ambito", []):
            if a not in AMBITI_AMMESSI:
                avvisi.append(f"[{cid}] ambito fuori vocabolario: {a}")

    # 4. collegamenti integri (puntano a id esistenti)
    idset = set(ids)
    for c in ch:
        for link in c.get("collegamenti", []):
            if link not in idset:
                errori.append(f"[{c.get('id','?')}] collegamento rotto -> {link}")

    # 5. contenuto non vuoto / non troppo corto
    for c in ch:
        cid = c.get("id", "?")
        if not str(c.get("riferimento", "")).strip():
            errori.append(f"[{cid}] riferimento vuoto")
        if not str(c.get("note_cse", "")).strip():
            avvisi.append(f"[{cid}] note_cse vuota")
        if len(str(c.get("testo", ""))) < LUNGHEZZA_MIN_TESTO:
            avvisi.append(f"[{cid}] testo molto corto (<{LUNGHEZZA_MIN_TESTO} char)")

    # 6. coerenza meta vs dati reali
    per_tipo_reale = dict(Counter(c.get("tipo") for c in ch))
    if d["meta"].get("totale_chunk") != len(ch):
        errori.append(f"meta.totale_chunk={d['meta'].get('totale_chunk')} ma chunk reali={len(ch)}")
    if d["meta"].get("per_tipo") != per_tipo_reale:
        errori.append(f"meta.per_tipo={d['meta'].get('per_tipo')} ma reale={per_tipo_reale}")

    return errori, avvisi, {"totale": len(ch), "per_tipo": per_tipo_reale}


def main():
    if len(sys.argv) < 2:
        print("Uso: python3 validate_rag.py <file.json>")
        sys.exit(2)
    errori, avvisi, sintesi = valida(sys.argv[1])

    if sintesi:
        print(f"Chunk totali: {sintesi['totale']}  |  per tipo: {sintesi['per_tipo']}")
    print()
    if avvisi:
        print(f"AVVISI ({len(avvisi)}) — non bloccanti:")
        for a in avvisi:
            print(f"  ⚠   {a}")
        print()
    if errori:
        print(f"ERRORI ({len(errori)}) — DA CORREGGERE:")
        for e in errori:
            print(f"  ✖  {e}")
        print("\nESITO: NON VALIDO")
        sys.exit(1)
    print("ESITO: VALIDO ✓ (integrità strutturale ok; la validazione di merito spetta al CSE)")
    sys.exit(0)


if __name__ == "__main__":
    main()
