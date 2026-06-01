@echo off
setlocal enabledelayedexpansion

:: SafeHub Archivio — Server locale
:: Versione robusta: cartella fissa, Python automatico, porta libera

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

:: ── 4. Trova prima porta libera a partire da 8080
::    netstat -an elenca le connessioni TCP; cerchiamo una porta in stato LISTENING.
::    Se occupata incrementiamo fino a 8099.
set PORT=8080
:find_free_port
netstat -an 2>nul | findstr /C:":%PORT% " | findstr /I "LISTENING" >nul 2>&1
if not errorlevel 1 (
    :: errorlevel 0 = findstr ha trovato la porta in LISTENING = occupata
    set /a PORT=PORT+1
    if !PORT! lss 8100 goto find_free_port
    echo  Nessuna porta libera tra 8080 e 8099.
    echo  Chiudi altre applicazioni che usano quelle porte e riprova.
    echo.
    pause
    exit /b 1
)

echo  Cartella : %CD%
echo  Apri Edge o Chrome su: http://localhost:%PORT%
echo  Premi Ctrl+C per fermare il server.
echo.
!PYTHON! -m http.server !PORT!
pause
