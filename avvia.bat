@echo off
setlocal enabledelayedexpansion

:: SafeHub Archivio — Server locale
:: Porta FISSA 8080: l'icona PWA installata da Edge dipende dall'origine
:: http://localhost:8080 — non cambiare porta o l'icona smettera' di funzionare.

:: ── 1. Cartella: sempre quella dello script, qualunque sia il cwd di chi lo lancia
::    %~dp0 = drive+path del file .bat, con backslash finale (es. C:\Progetti\safehub\)
cd /d "%~dp0"

echo.
echo  SafeHub Archivio - Avvio server locale
echo  ----------------------------------------
echo.

:: ── 2. Sanity check: siamo nella cartella giusta?
if not exist "index.html" (
    echo  ERRORE: index.html non trovato in:
    echo    %CD%
    echo  Verifica che avvia.bat sia nella cartella di SafeHub Archivio.
    echo.
    pause
    exit /b 1
)

:: ── 3. Trova Python 3 (prova python, poi py, poi python3)
::    - python  : installazione classica da python.org con "Add to PATH"
::    - py      : Python Launcher (installato automaticamente da python.org)
::    - python3 : Windows Store Python o ambienti non standard
set PYTHON=
for %%c in (python py python3) do (
    if "!PYTHON!"=="" (
        %%c --version >nul 2>&1
        if not errorlevel 1 (
            %%c -c "import sys; sys.exit(0 if sys.version_info[0]>=3 else 1)" >nul 2>&1
            if not errorlevel 1 set PYTHON=%%c
        )
    )
)

if "!PYTHON!"=="" (
    echo  Python 3 non trovato sul PC.
    echo.
    echo  Opzione 1 - Microsoft Store: cerca "Python 3"
    echo  Opzione 2 - python.org: https://www.python.org/downloads/windows/
    echo.
    echo  Dopo l'installazione, riavvia questo script.
    echo.
    pause
    exit /b 1
)

:: ── 4. Verifica porta 8080 (porta FISSA — non si cambia)
::    Se occupata: SafeHub e' gia' in esecuzione, oppure un altro programma usa 8080.
::    Non si scivola su 8081: l'icona PWA e' agganciata a http://localhost:8080.
netstat -an 2>nul | findstr /C:":8080 " | findstr /I "LISTENING" >nul 2>&1
if not errorlevel 1 (
    echo  Porta 8080 gia' occupata.
    echo.
    echo  SafeHub e' gia' avviato? Apri l'app dall'icona sul desktop.
    echo  Altrimenti chiudi il programma che usa la porta 8080 e riprova.
    echo.
    pause
    exit /b 1
)

echo  Cartella : %CD%
echo  Indirizzo: http://localhost:8080
echo.
echo  *** Tieni questa finestra aperta mentre usi SafeHub.          ***
echo  *** Chiudila solo per spegnere il server a fine giornata.     ***
echo.

:: ── 5. Apri il browser automaticamente (Edge/Chrome/default)
start "" "http://localhost:8080"

:: ── 6. Avvia il server con Cache-Control: no-store (server.py — come avvia.sh)
!PYTHON! server.py 8080
pause
