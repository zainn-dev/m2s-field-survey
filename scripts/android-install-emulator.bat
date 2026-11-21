@echo off
setlocal
cd /d "%~dp0\.."

where node >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Node.js was not found in PATH. Install Node.js 20 LTS first.
    exit /b 1
)

echo [M2S] Installing Volunteer Debug APK onto connected Android Emulator / Device...
call node scripts/install-android-apk.mjs
if errorlevel 1 (
    echo [ERROR] Android APK installation failed.
    exit /b 1
)

exit /b 0

