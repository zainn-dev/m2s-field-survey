/**
 * Installs app-debug.apk onto a connected Android Emulator or USB device and launches the app.
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { androidDir, findAdbExe, runOrExit } from './android-env.mjs';

const apkPath = path.join(androidDir, 'app', 'build', 'outputs', 'apk', 'debug', 'app-debug.apk');
if (!fs.existsSync(apkPath)) {
  console.error(`[INSTALL] Debug APK not found at ${apkPath}`);
  console.error('[INSTALL] Run `npm run android:build` first to generate the APK.');
  process.exit(1);
}

const adb = findAdbExe();
const listRes = spawnSync(adb, ['devices'], { encoding: 'utf8' });
if (listRes.error) {
  console.error(`[INSTALL] Failed to run ADB (${adb}):`, listRes.error.message);
  process.exit(1);
}

const readyDevices = listRes.stdout
  .split(/\r?\n/)
  .slice(1)
  .map((line) => line.trim().split(/\s+/))
  .filter((parts) => parts.length >= 2 && parts[1] === 'device')
  .map((parts) => parts[0]);

if (readyDevices.length === 0) {
  console.error('[INSTALL] No online Android Emulator or physical USB device detected via `adb devices`.');
  console.error('[INSTALL] Raw ADB output:\n' + listRes.stdout.trim());
  console.error('[INSTALL] Action: Boot an AVD in Android Studio Device Manager (requires BIOS SVM/VT-x + AEHD) OR connect an Android phone with USB Debugging enabled.');
  process.exit(1);
}

const targetSerial = process.env.ANDROID_SERIAL && readyDevices.includes(process.env.ANDROID_SERIAL)
  ? process.env.ANDROID_SERIAL
  : readyDevices[0];

console.log(`[INSTALL] Installing ${apkPath} on ${targetSerial}...`);
runOrExit(adb, ['-s', targetSerial, 'install', '-r', apkPath]);

console.log('[INSTALL] Launching org.miles2smile.fieldsurvey/.MainActivity...');
runOrExit(adb, ['-s', targetSerial, 'shell', 'am', 'start', '-n', 'org.miles2smile.fieldsurvey/.MainActivity']);
console.log(`[INSTALL] Installed & launched cleanly on ${targetSerial}.`);

