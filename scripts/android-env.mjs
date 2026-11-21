/**
 * Shared Windows/Unix Android toolchain discovery helpers for M2S Mobile build & deploy scripts.
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const mobileDir = path.join(rootDir, 'apps', 'mobile');
export const androidDir = path.join(mobileDir, 'android');
export const isWin = process.platform === 'win32';
export const npmCmd = isWin ? 'npm.cmd' : 'npm';
export const npxCmd = isWin ? 'npx.cmd' : 'npx';

export function resolveJavaHome() {
  if (process.env.JAVA_HOME && fs.existsSync(process.env.JAVA_HOME)) {
    return process.env.JAVA_HOME;
  }
  const localJavaRoot = path.join(os.homedir(), 'AppData', 'Local', 'Programs', 'Java');
  if (fs.existsSync(localJavaRoot)) {
    const jdks = fs
      .readdirSync(localJavaRoot)
      .filter((d) => /^jdk-/i.test(d))
      .sort()
      .reverse();
    if (jdks.length > 0) return path.join(localJavaRoot, jdks[0]);
  }
  return undefined;
}

export function resolveAndroidHome() {
  if (process.env.ANDROID_HOME && fs.existsSync(process.env.ANDROID_HOME)) {
    return process.env.ANDROID_HOME;
  }
  if (process.env.ANDROID_SDK_ROOT && fs.existsSync(process.env.ANDROID_SDK_ROOT)) {
    return process.env.ANDROID_SDK_ROOT;
  }
  const defaultWin = path.join(os.homedir(), 'AppData', 'Local', 'Android', 'Sdk');
  if (fs.existsSync(defaultWin)) return defaultWin;
  return undefined;
}

export function buildAndroidToolEnv(extra = {}) {
  const env = { ...process.env, ...extra };
  const javaHome = resolveJavaHome();
  const androidHome = resolveAndroidHome();
  const extraPaths = [];

  if (javaHome) {
    env.JAVA_HOME = javaHome;
    extraPaths.push(path.join(javaHome, 'bin'));
  }
  if (androidHome) {
    env.ANDROID_HOME = androidHome;
    env.ANDROID_SDK_ROOT = androidHome;
    extraPaths.push(
      path.join(androidHome, 'platform-tools'),
      path.join(androidHome, 'emulator'),
      path.join(androidHome, 'cmdline-tools', 'latest', 'bin')
    );
  }
  if (extraPaths.length > 0) {
    env.PATH = `${extraPaths.filter((p) => fs.existsSync(p)).join(path.delimiter)}${path.delimiter}${env.PATH ?? ''}`;
  }
  return env;
}

export function findAdbExe() {
  const androidHome = resolveAndroidHome();
  if (androidHome) {
    const candidate = path.join(androidHome, 'platform-tools', isWin ? 'adb.exe' : 'adb');
    if (fs.existsSync(candidate)) return candidate;
  }
  return isWin ? 'adb.exe' : 'adb';
}

export function findAndroidStudioExe() {
  const candidates = [
    process.env.CAPACITOR_ANDROID_STUDIO_PATH,
    'C:\\Program Files\\Android\\Android Studio\\bin\\studio64.exe',
    path.join(os.homedir(), 'AppData', 'Local', 'Programs', 'Android Studio', 'bin', 'studio64.exe'),
  ].filter(Boolean);
  return candidates.find((p) => fs.existsSync(p)) ?? null;
}

export function runOrExit(command, args, opts = {}) {
  const useCmdShell = isWin && /\.(cmd|bat)$/i.test(command);
  const res = useCmdShell
    ? spawnSync('cmd.exe', ['/d', '/s', '/c', command, ...args], { stdio: 'inherit', ...opts })
    : spawnSync(command, args, { stdio: 'inherit', ...opts });

  if (res.error) {
    console.error(`[ANDROID] Failed to execute ${command}:`, res.error.message);
    process.exit(1);
  }
  if (res.status !== 0) {
    process.exit(res.status ?? 1);
  }
}

