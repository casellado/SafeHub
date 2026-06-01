#!/usr/bin/env bash
# SafeHub Archivio — Server locale
# Versione robusta: cartella fissa, Python automatico, porta libera

# ── 1. Cartella: sempre quella dello script, qualunque sia il cwd di chi lo lancia
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# ── 2. Sanity check: siamo nella cartella giusta?
if [ ! -f "index.html" ]; then
    echo ""
    echo " ERRORE: index.html non trovato in:"
    echo "   $SCRIPT_DIR"
    echo " Verifica che avvia.sh sia nella cartella di SafeHub Archivio."
    exit 1
fi

# ── 3. Trova Python 3 (prova python3 poi python, verifica versione)
PYTHON=""
for cmd in python3 python; do
    if command -v "$cmd" &>/dev/null; then
        if "$cmd" -c "import sys; sys.exit(0 if sys.version_info[0] >= 3 else 1)" 2>/dev/null; then
            PYTHON="$cmd"
            break
        fi
    fi
done

if [ -z "$PYTHON" ]; then
    echo ""
    echo " ERRORE: Python 3 non trovato."
    echo " Su Ubuntu: sudo apt install python3"
    exit 1
fi

# ── 4. Trova prima porta libera a partire da 8080 (usa Python per affidabilità cross-OS)
PORT=$("$PYTHON" <<'PYEOF'
import socket, sys
for p in range(8080, 8100):
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        s.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 0)
        s.bind(('', p))
        s.close()
        print(p)
        sys.exit(0)
    except OSError:
        pass
print(-1)
PYEOF
)

if [ "$PORT" = "-1" ]; then
    echo ""
    echo " Nessuna porta libera tra 8080 e 8099."
    echo " Chiudi altre applicazioni che usano quelle porte e riprova."
    exit 1
fi

echo ""
echo " SafeHub Archivio — Server locale"
echo " ──────────────────────────────────"
echo " Cartella : $SCRIPT_DIR"
echo " Indirizzo: http://localhost:$PORT"
echo " Ctrl+C per fermare."
echo ""

# exec sostituisce il processo shell con Python: Ctrl+C chiude tutto cleanly
exec "$PYTHON" -m http.server "$PORT"
