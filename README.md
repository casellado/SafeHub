# SafeHub Archivio

PWA desktop per la gestione della documentazione di sicurezza nei cantieri (CSE).

## Stack

- **Alpine.js** + **Tailwind CSS** (CDN) + vanilla JS — nessun build tool
- **File System Access API** — lettura/scrittura diretta su OneDrive locale
- **IndexedDB** — cache locale rigenerabile dai file (file = stato)
- **Service Worker** — avvio istantaneo e aggiornamento automatico

## Avvio locale

```bash
# Linux / macOS
./avvia.sh

# Windows
avvia.bat
```

Poi apri `http://localhost:8080` in **Edge** o **Chrome**.

> File System Access API non è disponibile da `file://` né in Firefox.

## Struttura

```
shared/          → servizi condivisi (IDB, filesystem, store Alpine)
moduli/          → moduli funzionali (anagrafica, cantieri, impostazioni…)
templates/       → template Word per la generazione documenti (M6)
assets/          → icone PWA
docs/            → documentazione di design
```

## Licenza

Uso interno. Tutti i diritti riservati.
