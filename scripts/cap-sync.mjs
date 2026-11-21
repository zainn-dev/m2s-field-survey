/**
 * Builds apps/mobile with Vite and syncs assets/plugins into apps/mobile/android.
 * Flags:
 *   --emulator : Sets CAPACITOR_DEV_HTTP=true and VITE_API_ORIGIN=http://10.0.2.2:3000 for local emulator runs.
 *   --dev-http : Sets CAPACITOR_DEV_HTTP=true (permits mixed HTTP debugging) without setting a default IP.
 */
import fs from 'node:fs';
import { androidDir, buildAndroidToolEnv, mobileDir, npmCmd, npxCmd, runOrExit } from './android-env.mjs';

const args = new Set(process.argv.slice(2));
const emulatorMode = args.has('--emulator');
const devHttpMode = emulatorMode || args.has('--dev-http');

if (!fs.existsSync(androidDir)) {
  console.error(`[SYNC] Missing Android project directory at ${androidDir}`);
  process.exit(1);
}

const extraEnv = {};
if (devHttpMode) {
  extraEnv.CAPACITOR_DEV_HTTP = 'true';
} else {
  extraEnv.CAPACITOR_DEV_HTTP = 'false';
}

if (emulatorMode && !process.env.VITE_API_ORIGIN) {
  extraEnv.VITE_API_ORIGIN = 'http://10.0.2.2:3000';
}

const env = buildAndroidToolEnv(extraEnv);
console.log(
  `[SYNC] Building apps/mobile (${emulatorMode ? 'emulator HTTP 10.0.2.2:3000' : devHttpMode ? 'debug mixed-HTTP enabled' : 'production HTTPS'})...`
);

runOrExit(npmCmd, ['run', 'build'], { cwd: mobileDir, env });
runOrExit(npxCmd, ['cap', 'sync', 'android'], { cwd: mobileDir, env });
console.log('[SYNC] Capacitor Android sync completed cleanly.');

