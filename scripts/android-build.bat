@echo off
setlocal
cd /d "%~dp0\.."

where node >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Node.js was not found in PATH. Install Node.js 20 LTS first.
    exit /b 1
)

echo [M2S] Building M2S Field Survey Volunteer Debug APK...
call node scripts/build-android-apk.mjs %*
if errorlevel 1 (
    echo [ERROR] Android APK build failed.
    exit /b 1
)

exit /b 0

