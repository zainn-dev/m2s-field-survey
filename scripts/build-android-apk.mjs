/**
 * Builds the M2S Volunteer Android APK cleanly via Capacitor sync + Gradle.
 * Flags:
 *   --release   : Builds release APK (strict HTTPS, verifies release keystore configuration first).
 *   --emulator  : Pre-configures local Android Emulator API origin (http://10.0.2.2:3000).
 *   --skip-sync : Skips Vite build + Capacitor sync and runs Gradle directly.
 */
import fs from 'node:fs';
import path from 'node:path';
import {
  androidDir,
  buildAndroidToolEnv,
  isWin,
  rootDir,
  runOrExit,
} from './android-env.mjs';

const args = new Set(process.argv.slice(2));
const isRelease = args.has('--release');
const isEmulator = args.has('--emulator');
const skipSync = args.has('--skip-sync');

if (!fs.existsSync(androidDir)) {
  console.error(`[APK] Missing apps/mobile/android project at ${androidDir}`);
  process.exit(1);
}

if (isRelease) {
  const propsPath = path.join(androidDir, 'keystore.properties');
  const hasEnvKeystore = Boolean(process.env.M2S_RELEASE_STORE_FILE && process.env.M2S_RELEASE_KEY_ALIAS);
  if (!fs.existsSync(propsPath) && !hasEnvKeystore) {
    console.error('[APK] Release build blocked: signing credentials not configured.');
    console.error(`[APK] Provide ${propsPath} (see keystore.properties.example) or M2S_RELEASE_* env vars.`);
    process.exit(1);
  }
}

if (!skipSync) {
  const syncArgs = ['scripts/cap-sync.mjs'];
  if (!isRelease) {
    syncArgs.push(isEmulator ? '--emulator' : '--dev-http');
  }
  runOrExit(process.execPath, syncArgs, { cwd: rootDir, env: process.env });
}

const env = buildAndroidToolEnv();
const gradleCmd = path.join(androidDir, isWin ? 'gradlew.bat' : 'gradlew');
const task = isRelease ? 'assembleRelease' : 'assembleDebug';
const apkPath = path.join(
  androidDir,
  'app',
  'build',
  'outputs',
  'apk',
  isRelease ? 'release' : 'debug',
  isRelease ? 'app-release.apk' : 'app-debug.apk'
);

console.log(`[APK] JAVA_HOME=${env.JAVA_HOME ?? '(system PATH)'}`);
console.log(`[APK] ANDROID_HOME=${env.ANDROID_HOME ?? '(unset)'}`);
console.log(`[APK] Running Gradle ${task} in ${androidDir}...`);

runOrExit(gradleCmd, [task, '--no-daemon'], { cwd: androidDir, env });

if (!fs.existsSync(apkPath)) {
  console.error(`[APK] Expected APK was not generated at ${apkPath}`);
  process.exit(1);
}

const stats = fs.statSync(apkPath);
console.log(`[APK] ${isRelease ? 'Release' : 'Debug'} APK ready: ${apkPath} (${(stats.size / (1024 * 1024)).toFixed(2)} MB)`);
