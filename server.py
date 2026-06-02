#!/usr/bin/env python3
"""
server.py — Server HTTP locale per SafeHub Archivio.

Serve i file statici con header Cache-Control: no-store.
Senza questo header Chrome riusa i JS dalla cache HTTP e le
modifiche non appaiono tra un F5 e l'altro durante lo sviluppo.

Uso: python3 server.py [porta]  (default 8080)
"""
import sys, os
from http.server import HTTPServer, SimpleHTTPRequestHandler

port = int(sys.argv[1]) if len(sys.argv) > 1 else 8080
os.chdir(os.path.dirname(os.path.abspath(__file__)))

class NoCacheHandler(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store')
        super().end_headers()

    def log_message(self, fmt, *args):
        pass  # silenzia request log (meno rumore in terminale)

print(f'\n SafeHub Archivio — Server locale (no-cache)')
print(f' Indirizzo: http://localhost:{port}')
print(' Ctrl+C per fermare.\n')
HTTPServer(('', port), NoCacheHandler).serve_forever()
