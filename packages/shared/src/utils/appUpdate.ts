/**
 * In-App Update management and version check utilities for M2S Field Survey.
 */

export interface AppVersionPayload {
  version: string;
  versionCode: number;
  buildDate: string;
  buildTime: number;
  apkUrl: string;
  apkSize?: string;
  title: string;
  releaseNotes: string;
  mandatory?: boolean;
}

/**
 * Embedded local version information.
 * When a volunteer runs the APK, this identifies the installed binary version.
 */
export const LOCAL_APP_VERSION: AppVersionPayload = {
  version: '1.1.0',
  versionCode: 2,
  buildDate: '2026-11-13',
  buildTime: 1794584400000,
  apkUrl: 'https://m2s-app-production.up.railway.app/m2s-field-survey.apk',
  apkSize: '7.4 MB',
  title: 'M2S Field Survey v1.1.0',
  releaseNotes: 'B2 single-select document verification, removed cluster target restrictions, and in-app update support.',
};

/**
 * Checks server endpoints for the latest released app version.
 */
export async function fetchServerAppVersion(apiOrigin: string = ''): Promise<AppVersionPayload | null> {
  const cleanOrigin = (apiOrigin || '').replace(/\/+$/, '');
  const candidateUrls: string[] = [];

  if (cleanOrigin) {
    candidateUrls.push(`${cleanOrigin}/api/v1/health/app/version`);
    candidateUrls.push(`${cleanOrigin}/app-version.json`);
  }

  // Fallback direct production URLs
  candidateUrls.push('https://m2s-app-production.up.railway.app/api/v1/health/app/version');
  candidateUrls.push('https://m2s-app-production.up.railway.app/app-version.json');
  candidateUrls.push('/app-version.json');

  const seen = new Set<string>();

  for (const url of candidateUrls) {
    if (seen.has(url)) continue;
    seen.add(url);
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 4000);
      const res = await fetch(url, {
        signal: ctrl.signal,
        cache: 'no-store',
      });
      clearTimeout(timer);
      if (res.ok) {
        const data = await res.json();
        if (data && typeof data === 'object' && typeof data.version === 'string' && typeof data.versionCode === 'number') {
          return data as AppVersionPayload;
        }
      }
    } catch {
      // Continue to next fallback
    }
  }

  return null;
}

/**
 * Compares local versionCode with server versionCode.
 */
export function isUpdateAvailable(
  local: { versionCode: number; version: string },
  server: { versionCode: number; version: string }
): boolean {
  if (server.versionCode > local.versionCode) return true;
  if (server.versionCode === local.versionCode && server.version !== local.version) return true;
  return false;
}

/**
 * Initiates direct download of the APK on Android / mobile browser.
 */
export function triggerApkDownload(apkUrl: string): void {
  const fullUrl = apkUrl.startsWith('http://') || apkUrl.startsWith('https://')
    ? apkUrl
    : `https://m2s-app-production.up.railway.app${apkUrl.startsWith('/') ? '' : '/'}${apkUrl}`;

  // 1. Try Capacitor system browser intent
  try {
    const opened = window.open(fullUrl, '_system');
    if (opened) return;
  } catch {
    // Ignore and proceed to anchor
  }

  // 2. Standard DOM anchor download trigger
  try {
    const a = document.createElement('a');
    a.href = fullUrl;
    a.download = 'm2s-field-survey.apk';
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      try {
        document.body.removeChild(a);
      } catch {}
    }, 500);
  } catch {
    window.location.href = fullUrl;
  }
}
