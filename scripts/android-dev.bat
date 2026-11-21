@echo off
setlocal
cd /d "%~dp0\.."

where node >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Node.js was not found in PATH. Install Node.js 20 LTS first.
    exit /b 1
)

echo [M2S] Syncing Volunteer Mobile App for local Android Emulator (http://10.0.2.2:3000)...
call node scripts/cap-sync.mjs --emulator
if errorlevel 1 (
    echo [ERROR] Capacitor Android emulator sync failed.
    exit /b 1
)

echo [M2S] Opening Android project in Android Studio...
call node scripts/open-android-studio.mjs
if errorlevel 1 (
    echo [ERROR] Could not launch Android Studio automatically. Resolve the issue above and re-run.
    exit /b 1
)

exit /b 0

