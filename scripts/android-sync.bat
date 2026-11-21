@echo off
setlocal
cd /d "%~dp0\.."

where node >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Node.js was not found in PATH. Install Node.js 20 LTS first.
    exit /b 1
)

echo [M2S] Running Vite build and Capacitor Android sync...
call node scripts/cap-sync.mjs %*
if errorlevel 1 (
    echo [ERROR] Capacitor Android sync failed.
    exit /b 1
)

exit /b 0

