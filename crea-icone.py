"""
crea-icone.py — Genera le icone PNG per la PWA SafeHub Archivio.
Usa solo librerie standard Python (nessuna dipendenza esterna).
Esegui una volta prima del primo avvio: python crea-icone.py
"""
import zlib, struct, os

def crea_png(w, h, r, g, b):
    """PNG RGB a colore solido, senza dipendenze esterne."""
    def chunk(tipo, dati):
        crc = zlib.crc32(tipo + dati) & 0xffffffff
        return struct.pack('>I', len(dati)) + tipo + dati + struct.pack('>I', crc)

    # Ogni riga: byte filtro 0x00 (nessun filtro) + pixel RGB
    riga = b'\x00' + bytes([r, g, b] * w)
    idat = zlib.compress(riga * h, 9)

    png  = b'\x89PNG\r\n\x1a\n'
    png += chunk(b'IHDR', struct.pack('>IIBBBBB', w, h, 8, 2, 0, 0, 0))
    png += chunk(b'IDAT', idat)
    png += chunk(b'IEND', b'')
    return png

os.makedirs('assets', exist_ok=True)

# Blu SafeHub: #1d4ed8 → R=29 G=78 B=216
for dim in [192, 512]:
    path = f'assets/icon-{dim}.png'
    with open(path, 'wb') as f:
        f.write(crea_png(dim, dim, 29, 78, 216))
    print(f'✓ {path}')

print('\nIcone create. Avvia con avvia.bat (Windows) o ./avvia.sh (Linux).')
