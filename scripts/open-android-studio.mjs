/**
 * Opens apps/mobile/android in Android Studio on Windows/macOS/Linux.
 */
import fs from 'node:fs';
import {
  androidDir,
  buildAndroidToolEnv,
  findAndroidStudioExe,
  isWin,
  mobileDir,
  npxCmd,
  runOrExit,
} from './android-env.mjs';

if (!fs.existsSync(androidDir)) {
  console.error(`[OPEN] Missing Android project directory at ${androidDir}`);
  process.exit(1);
}

if (isWin) {
  const studioExe = findAndroidStudioExe();
  if (!studioExe) {
    console.error('[OPEN] Android Studio is not installed in standard Windows directories.');
    console.error('[OPEN] Install Android Studio from https://developer.android.com/studio (or set CAPACITOR_ANDROID_STUDIO_PATH),');
    console.error(`[OPEN] then open folder: ${androidDir}`);
    process.exit(1);
  }
  const env = buildAndroidToolEnv({ CAPACITOR_ANDROID_STUDIO_PATH: studioExe });
  console.log(`[OPEN] Opening ${androidDir} in ${studioExe}...`);
  runOrExit(npxCmd, ['cap', 'open', 'android'], { cwd: mobileDir, env });
} else {
  const env = buildAndroidToolEnv();
  runOrExit(npxCmd, ['cap', 'open', 'android'], { cwd: mobileDir, env });
}

