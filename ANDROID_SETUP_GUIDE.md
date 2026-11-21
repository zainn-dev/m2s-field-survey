# M2S Field Survey — Windows 11 Android Setup, Emulator & APK Guide

This guide configures and builds the **Miles2Smile Foundation — Field Volunteer Mobile App** (`apps/mobile`, Android package `org.miles2smile.fieldsurvey`) using **Capacitor 6 + Vite + React + Gradle** on **Windows 11**.

> **Architecture Separation:**
> - **Android Mobile App (`apps/mobile`):** **Volunteers ONLY** (login, assigned clusters, household survey B1–B10 & Q1a–Q28 with bilingual EN/HI, consent-based GPS, native camera/gallery/PDF capture, offline Dexie IndexedDB & background/foreground sync, profile). Contains **zero Admin routes or review screens**.
> - **Admin Web Console (`apps/web`):** Separate browser application for coordinators, review/approval, GPS cluster map, supervisor monitoring, case-file PDFs, analytics, and exports.
> - **Backend (`apps/api`):** Shared NestJS + PostgreSQL + Prisma API with private document storage.

---

## 1. Windows 11 Prerequisites & Official Tools

| Tool | Recommended Version | Official Source | Typical Windows Path |
| :--- | :--- | :--- | :--- |
| **Node.js** | 20 LTS or 22 LTS | https://nodejs.org | `C:\Program Files\nodejs\` |
| **JDK** | OpenJDK 21 (or 17) | https://adoptium.net | `%LOCALAPPDATA%\Programs\Java\jdk-21...` |
| **Android Studio** | Ladybug / Meerkat+ | https://developer.android.com/studio | `C:\Program Files\Android\Android Studio` |
| **Android SDK** | API 34 (`compileSdkVersion = 34`, `targetSdkVersion = 34`, `minSdkVersion = 22`) | Installed via Android Studio SDK Manager | `%LOCALAPPDATA%\Android\Sdk` |

---

## 2. Install Android Studio & Required SDK Components

1. Download and run the official Windows installer from [developer.android.com/studio](https://developer.android.com/studio).
2. In the Setup Wizard (or **More Actions -> SDK Manager**):
   - **SDK Platforms tab:** Install **Android 14.0 ("UpsideDownCake", API Level 34)** including **Google APIs Intel x86_64 Atom System Image**.
   - **SDK Tools tab:** Install:
     - **Android SDK Build-Tools 34.0.0**
     - **Android SDK Command-line Tools (latest)**
     - **Android SDK Platform-Tools** (`adb`)
     - **Android Emulator**
     - **Android Emulator hypervisor driver** (for AMD Ryzen / Intel CPUs on Windows)

---

## 3. Configure Windows Environment Variables

Open **System Properties -> Environment Variables** and ensure the following **User** or **System** variables are set:

- `JAVA_HOME` = `C:\Users\<USER>\AppData\Local\Programs\Java\jdk-21...` (or Android Studio's bundled `jbr` path)
- `ANDROID_HOME` = `C:\Users\<USER>\AppData\Local\Android\Sdk`
- `ANDROID_SDK_ROOT` = `C:\Users\<USER>\AppData\Local\Android\Sdk`

Add to `Path`:
```text
%JAVA_HOME%\bin
%ANDROID_HOME%\platform-tools
%ANDROID_HOME%\emulator
%ANDROID_HOME%\cmdline-tools\latest\bin
```

Verify in a fresh PowerShell window:
```powershell
java -version
adb version
```

> Note: All Node automation scripts in `scripts/` also auto-detect `JAVA_HOME` (`%LOCALAPPDATA%\Programs\Java`) and `ANDROID_HOME` (`%LOCALAPPDATA%\Android\Sdk`) even if terminal env vars have not been restarted yet.

---

## 4. Enable Hardware Virtualization & Emulator Driver (Windows 11)

Android's fast `x86_64` AVD emulator requires hardware virtualization:

1. **Check virtualization status** in PowerShell:
   ```powershell
   systeminfo | findstr /B /C:"Hyper-V Requirements"
   "%LOCALAPPDATA%\Android\Sdk\emulator\emulator.exe" -accel-check
   ```
   If `Virtualization Enabled In Firmware` says **No**:
   - Reboot Windows into UEFI/BIOS (`F2` / `Del` / `F10` at startup).
   - **AMD Ryzen CPUs:** Enable **SVM Mode** (often under *Advanced -> CPU Configuration*).
   - **Intel CPUs:** Enable **Intel Virtualization Technology (VT-x)**.
   - Save & reboot Windows.
2. **Install the Hypervisor Driver (AEHD)** as **Administrator** in PowerShell:
   ```powershell
   cd "$env:LOCALAPPDATA\Android\Sdk\extras\google\Android_Emulator_Hypervisor_Driver"
   .\silent_install.bat
   ```
   If Hyper-V / Virtual Machine Platform conflicts exist, either keep **Windows Hypervisor Platform** enabled (for Hyper-V compatible Emulator) or reboot after `silent_install.bat`.
3. Re-run `emulator.exe -accel-check` — confirm AEHD/WHPX reports usable (`0`).

---

## 5. Create & Start an Android Emulator (AVD)

In **Android Studio -> Device Manager -> Create Virtual Device**:
1. Select **Phone -> Pixel 7** (Play Store / Google APIs).
2. Select **API 34 (x86_64 Google APIs)** system image.
3. Click **Finish**, then click **Play (Cold Boot / Launch)**.

Or launch via CLI:
```powershell
"%LOCALAPPDATA%\Android\Sdk\emulator\emulator.exe" -avd Pixel_7_API_34
adb wait-for-device
adb devices
```

---

## 6. Clean Dependency Setup, Sync, Build & Run Commands

Run from the repository root (`m2s-field-survey`):

| Goal | NPM Command | Windows Batch Script |
| :--- | :--- | :--- |
| Sync Vite bundle (`dist/`) + Capacitor plugins into `apps/mobile/android` (strict HTTPS) | `npm run android:sync` | `scripts\android-sync.bat` |
| Sync with local Emulator API default (`http://10.0.2.2:3000`) + open Android Studio | `npm -w apps/mobile run cap:sync:emulator` then `npm run android:open` | `scripts\android-dev.bat` |
| Open native project in Android Studio | `npm run android:open` | — |
| Build Debug APK (`app-debug.apk`) | `npm run android:build` | `scripts\android-build.bat` |
| Build Emulator-preconfigured Debug APK (`http://10.0.2.2:3000`) | `npm -w apps/mobile run apk:emulator` | `scripts\android-build.bat --emulator` |
| Install `app-debug.apk` onto running Emulator/USB device & launch | `npm run android:install` | `scripts\android-install-emulator.bat` |
| Build Signed Release APK (`app-release.apk`, strict HTTPS) | `npm run android:release` | — |

Generated Debug APK location:
```text
apps/mobile/android/app/build/outputs/apk/debug/app-debug.apk
```

---

## 7. API Connectivity Rules (Emulator vs Real Phone vs Production)

Never use `http://localhost:3000` inside an Android device/emulator to reach your host PC API directly (inside Android, `localhost` is the phone itself) unless you configure `adb reverse`.

1. **Start Host API + PostgreSQL:**
   ```powershell
   npm run dev
   ```
   (NestJS listens on port `3000` on the Windows host.)
2. **Android Studio Emulator -> Host API:**
   - Use **`http://10.0.2.2:3000`** in the Login or Profile **API Server Configuration** box (or build with `scripts\android-dev.bat` / `npm -w apps/mobile run apk:emulator`).
   - Debug builds allow HTTP traffic strictly via `apps/mobile/android/app/src/debug/AndroidManifest.xml` (`usesCleartextTraffic="true"`).
3. **Physical Android Phone (USB Cable + ADB):**
   - Run `adb reverse tcp:3000 tcp:3000` after plugging in the phone, then enter **`http://localhost:3000`** in **API Server Configuration**.
4. **Physical Android Phone (Same Wi-Fi LAN during testing):**
   - Find your Windows LAN IP (`ipconfig`, e.g., `192.168.1.42`).
   - Allow port `3000` through Windows Firewall and make sure NestJS binds `0.0.0.0` (or verify `API_HOST=0.0.0.0`), then enter `http://192.168.1.42:3000` in **API Server Configuration**.
5. **Production Builds:**
   - Set **`VITE_API_ORIGIN=https://your-production-api.example.org`** at build time (see `apps/mobile/.env.example`), sync cleanly (`npm run android:sync`), and build Release (`npm run android:release`).
   - Release builds enforce **`android:usesCleartextTraffic="false"`** in `apps/mobile/android/app/src/main/AndroidManifest.xml` and disable WebView mixed content.

---

## 8. Release Signing Setup (Play Store / Organization Distribution)

**Never commit `.keystore`, `.jks`, or `keystore.properties` files to Git or release ZIPs.**

1. Generate an upload keystore once using JDK `keytool`:
   ```powershell
   keytool -genkeypair -v -keystore C:\secure\m2s-release-upload.jks -alias m2s_upload_key -keyalg RSA -keysize 2048 -validity 10000
   ```
2. Copy template:
   ```powershell
   Copy-Item apps/mobile/android/keystore.properties.example apps/mobile/android/keystore.properties
   ```
3. Edit `apps/mobile/android/keystore.properties` (already `.gitignore`d) OR export env variables `M2S_RELEASE_STORE_FILE`, `M2S_RELEASE_STORE_PASSWORD`, `M2S_RELEASE_KEY_ALIAS`, `M2S_RELEASE_KEY_PASSWORD`.
4. Build the release APK:
   ```powershell
   npm run android:release
   ```
   Output: `apps/mobile/android/app/build/outputs/apk/release/app-release.apk`.

---

## 9. Installing on a Physical Android Phone (USB / Direct APK)

### Option A — Via ADB (Recommended for testing & Logcat)
1. On the Android phone: **Settings -> About phone -> Tap "Build number" 7 times**.
2. Open **Settings -> System -> Developer options -> Enable USB debugging**.
3. Connect USB cable -> approve the **"Allow USB debugging"** RSA prompt on the phone.
4. Run:
   ```powershell
   adb devices
   npm run android:install
   ```

### Option B — Direct APK Transfer
1. Copy `apps/mobile/android/app/build/outputs/apk/debug/app-debug.apk` (or `app-release.apk`) to the phone via USB / Drive.
2. Tap the `.apk` on the phone and allow **Install unknown apps** for your file manager.
3. Open **M2S Field Survey**, expand **API Server Configuration**, enter your HTTPS (or LAN debug) API URL, tap **Test**, and sign in with a Volunteer account.

---

## 10. Verification & Logcat Troubleshooting

| Issue | Likely Cause / Resolution |
| :--- | :--- |
| `Virtualization Enabled In Firmware: No` | Enable **SVM Mode** (AMD) or **VT-x** (Intel) in motherboard BIOS, then install AEHD (`silent_install.bat`). |
| `adb devices` shows `unauthorized` | Unlock phone screen and tap **Allow** on the USB Debugging RSA popup. |
| `adb devices` shows `offline` | Restart ADB (`adb kill-server && adb start-server`) or use a cold-booted accelerated AVD. |
| `Network error` when signing in on Emulator | Ensure API is running on host port `3000` (`npm run dev`) and in-app **API Server Configuration** uses `http://10.0.2.2:3000`. |
| `CLEARTEXT communication not permitted` | You built a **Release** APK against an `http://` URL. Production requires `https://`; use a Debug APK (`npm run android:build`) for `http://` local dev. |
| Inspect APK manifest/permissions | `"%LOCALAPPDATA%\Android\Sdk\build-tools\34.0.0\aapt2.exe" dump permissions apps/mobile/android/app/build/outputs/apk/debug/app-debug.apk` |
| Stream live Android WebView & Capacitor logs | `adb logcat -s Capacitor/Console Chromium` |

