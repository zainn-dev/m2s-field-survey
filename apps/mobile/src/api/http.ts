import { Capacitor } from '@capacitor/core';
import { Preferences } from '@capacitor/preferences';

const ORIGIN_KEY = 'm2s_api_origin';
const TOKEN_KEY = 'm2s_mobile_token';

export function isNativeCapacitor(): boolean {
  try {
    return Capacitor.isNativePlatform();
  } catch {
    return false;
  }
}

export function defaultApiOrigin(): string {
  const envOrigin = (import.meta as unknown as { env?: Record<string, string> }).env?.VITE_API_ORIGIN;
  if (envOrigin) return envOrigin.trim().replace(/\/+$/, '');
  return 'https://m2s-app-production.up.railway.app';
}

let cachedOrigin: string | null = null;
let cachedToken: string | null = null;

export function getApiOrigin(): string {
  if (cachedOrigin !== null) return cachedOrigin;
  try {
    const saved = (localStorage.getItem(ORIGIN_KEY) ?? '').trim().replace(/\/+$/, '');
    cachedOrigin = saved || defaultApiOrigin();
  } catch {
    cachedOrigin = defaultApiOrigin();
  }
  return cachedOrigin;
}

/**
 * Normalises a user-typed server URL ("api.example.org/", "https://x/api/v1") to an origin.
 * Returns '' for "use the default"; throws for anything that is not an http(s) URL.
 */
export function normalizeApiOrigin(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return '';
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  let url: URL;
  try {
    url = new URL(withScheme);
  } catch {
    throw new Error('Enter a valid server address, e.g. https://api.example.org');
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') throw new Error('Server address must start with https:// or http://');
  const path = url.pathname.replace(/\/+$/, '').replace(/\/api(\/v1)?$/i, '');
  return `${url.protocol}//${url.host}${path}`;
}

export async function setApiOrigin(origin: string): Promise<string> {
  const normalized = normalizeApiOrigin(origin);
  const previous = getApiOrigin();
  cachedOrigin = normalized || defaultApiOrigin();
  // A session token belongs to the server that issued it: never send it to a different server.
  if (cachedOrigin !== previous) await setAuthToken(null);
  try {
    if (normalized) localStorage.setItem(ORIGIN_KEY, normalized);
    else localStorage.removeItem(ORIGIN_KEY);
  } catch {
    /* ignore */
  }
  if (normalized) await Preferences.set({ key: ORIGIN_KEY, value: normalized }).catch(() => undefined);
  else await Preferences.remove({ key: ORIGIN_KEY }).catch(() => undefined);
  return cachedOrigin;
}

export function getAuthToken(): string | null {
  if (cachedToken !== null) return cachedToken || null;
  try {
    cachedToken = localStorage.getItem(TOKEN_KEY) ?? '';
  } catch {
    cachedToken = '';
  }
  return cachedToken || null;
}

export async function setAuthToken(token: string | null): Promise<void> {
  cachedToken = token ?? '';
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* ignore */
  }
  if (token) await Preferences.set({ key: TOKEN_KEY, value: token }).catch(() => undefined);
  else await Preferences.remove({ key: TOKEN_KEY }).catch(() => undefined);
}

/** Hydrate persisted Preferences into memory cache on startup (Android storage fallback). */
export async function hydrateMobileAuthConfig(): Promise<void> {
  try {
    const [o, t] = await Promise.all([Preferences.get({ key: ORIGIN_KEY }), Preferences.get({ key: TOKEN_KEY })]);
    const persistedOrigin = (o.value ?? '').trim().replace(/\/+$/, '');
    if (persistedOrigin) {
      cachedOrigin = persistedOrigin;
      localStorage.setItem(ORIGIN_KEY, cachedOrigin);
    } else if (o.value !== null && o.value !== undefined) {
      localStorage.removeItem(ORIGIN_KEY);
      await Preferences.remove({ key: ORIGIN_KEY }).catch(() => undefined);
      cachedOrigin = defaultApiOrigin();
    }
    if (t.value) {
      cachedToken = t.value;
      localStorage.setItem(TOKEN_KEY, t.value);
    }
  } catch {
    /* ignore */
  }
}

export function apiUrl(path: string): string {
  const base = getApiOrigin();
  if (path.startsWith('http://') || path.startsWith('https://')) return path;
  if (isNativeCapacitor() && !base) {
    throw new ApiError(0, 'M2S API Server URL is not configured yet. Open API Server Configuration to set it.', undefined, true);
  }
  if (path.startsWith('/api/')) return `${base}${path}`;
  return `${base}/api/v1${path.startsWith('/') ? path : `/${path}`}`;
}

export class ApiError extends Error {
  status: number;
  data?: Record<string, unknown>;
  isNetwork: boolean;

  constructor(status: number, message: string, data?: Record<string, unknown>, isNetwork = false) {
    super(message);
    this.status = status;
    this.data = data;
    this.isNetwork = isNetwork;
  }
}

let onUnauthorized: (() => void) | null = null;
export const setUnauthorizedHandler = (fn: (() => void) | null) => {
  onUnauthorized = fn;
};

function authHeaders(extra: Record<string, string> = {}): Record<string, string> {
  const headers: Record<string, string> = { ...extra };
  if (isNativeCapacitor()) headers['X-Client-Platform'] = 'capacitor';
  const token = getAuthToken();
  if (token) headers['Authorization'] = `Bearer ${token}`;
  return headers;
}

export interface RequestOptions {
  method?: string;
  body?: unknown;
  quiet401?: boolean;
  timeoutMs?: number;
}

const REQUEST_TIMEOUT_MS = 30_000;
const UPLOAD_TIMEOUT_MS = 180_000;
const isGatewayDown = (status: number) => status === 502 || status === 503 || status === 504;

/** fetch with a hard timeout: a hung request on a weak field network must not stall the sync loop forever. */
async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number): Promise<Response> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: ctrl.signal });
  } finally {
    clearTimeout(timer);
  }
}

export async function api<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  const isForm = opts.body instanceof FormData;
  const targetUrl = apiUrl(path);
  let res: Response;
  try {
    res = await fetchWithTimeout(
      targetUrl,
      {
        method: opts.method ?? (opts.body ? 'POST' : 'GET'),
        credentials: 'include',
        headers: authHeaders(opts.body && !isForm ? { 'Content-Type': 'application/json' } : {}),
        body: opts.body ? (isForm ? (opts.body as FormData) : JSON.stringify(opts.body)) : undefined,
      },
      opts.timeoutMs ?? REQUEST_TIMEOUT_MS
    );
  } catch {
    throw new ApiError(0, 'Network connection unavailable. Saved work remains safe offline.', undefined, true);
  }

  let text: string;
  try {
    text = await res.text();
  } catch {
    throw new ApiError(0, 'Connection dropped while receiving data. Saved work remains safe offline.', undefined, true);
  }
  let data: Record<string, unknown> | undefined;
  let parsed = true;
  try {
    data = text ? (JSON.parse(text) as Record<string, unknown>) : undefined;
  } catch {
    data = undefined;
    parsed = false;
  }

  // Proxy / server restarting: behave like offline so queued work is retried, not marked failed.
  if (isGatewayDown(res.status)) throw new ApiError(0, 'Server is unreachable right now. Saved work remains safe offline.', undefined, true);
  // A 2xx that is not JSON is a captive portal / wrong server URL, never a real API answer.
  if (res.ok && !parsed) {
    throw new ApiError(0, 'Unexpected response from the server. Check the network or the API server address.', undefined, true);
  }

  if (!res.ok) {
    if (res.status === 401 && !opts.quiet401) {
      await setAuthToken(null);
      onUnauthorized?.();
    }
    const msg =
      (Array.isArray(data?.message) ? (data!.message as string[]).join(', ') : (data?.message as string | undefined)) ||
      `Request failed (${res.status})`;
    throw new ApiError(res.status, msg, data, false);
  }

  return data as T;
}

export function uploadWithProgress<T>(path: string, form: FormData, onProgress?: (pct: number) => void): Promise<T> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', apiUrl(path));
    xhr.withCredentials = true;
    xhr.timeout = UPLOAD_TIMEOUT_MS;
    xhr.ontimeout = () => reject(new ApiError(0, 'Upload timed out on a slow connection. Queued for automatic retry.', undefined, true));
    const h = authHeaders();
    Object.entries(h).forEach(([k, v]) => xhr.setRequestHeader(k, v));

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && onProgress) onProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () => {
      let data: Record<string, unknown> | undefined;
      try {
        data = xhr.responseText ? (JSON.parse(xhr.responseText) as Record<string, unknown>) : undefined;
      } catch {
        data = undefined;
      }
      if (xhr.status >= 200 && xhr.status < 300 && data) {
        onProgress?.(100);
        resolve(data as T);
      } else if (xhr.status === 0 || isGatewayDown(xhr.status) || (xhr.status >= 200 && xhr.status < 300)) {
        reject(new ApiError(0, 'Server is unreachable right now. Queued for automatic retry.', undefined, true));
      } else {
        if (xhr.status === 401) {
          void setAuthToken(null);
          onUnauthorized?.();
        }
        const msg = (data?.message as string) || `Upload failed (${xhr.status})`;
        reject(new ApiError(xhr.status, msg, data, false));
      }
    };
    xhr.onerror = () => reject(new ApiError(0, 'Network unavailable during upload. Queued for automatic retry.', undefined, true));
    xhr.send(form);
  });
}

export async function fetchAuthorizedBlobUrl(rawUrl: string): Promise<string> {
  if (!rawUrl || rawUrl.startsWith('blob:') || rawUrl.startsWith('data:')) return rawUrl;
  const res = await fetchWithTimeout(apiUrl(rawUrl), { credentials: 'include', headers: authHeaders() }, 60_000);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const blob = await res.blob();
  return URL.createObjectURL(blob);
}

export async function checkApiHealth(origin: string): Promise<{ ok: boolean; status?: number; error?: string }> {
  let clean: string;
  try {
    clean = normalizeApiOrigin(origin) || defaultApiOrigin();
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
  const target = `${clean}/api/v1/health`;
  try {
    const res = await fetchWithTimeout(target, { method: 'GET' }, 10_000);
    if (!res.ok) return { ok: false, status: res.status, error: `Server responded HTTP ${res.status}` };
    // Any web page answers 200; only the M2S API answers { ok: true }.
    const body = (await res.json().catch(() => null)) as { ok?: unknown } | null;
    return body?.ok === true
      ? { ok: true, status: res.status }
      : { ok: false, status: res.status, error: 'That address is reachable but is not an M2S API server.' };
  } catch (e) {
    const timedOut = (e as Error)?.name === 'AbortError';
    return { ok: false, error: timedOut ? 'Server did not respond in time.' : e instanceof Error ? e.message : 'Network unreachable' };
  }
}
