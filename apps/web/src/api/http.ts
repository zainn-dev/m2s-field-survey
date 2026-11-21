/** Thin fetch wrapper for the NestJS API (/api/v1). Session is an httpOnly cookie, so no tokens live in JS. */

export const API_BASE = '/api/v1';

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public data?: Record<string, unknown>
  ) {
    super(message);
  }
  /** True when the request never reached the server (offline, DNS, server down). */
  get isNetwork() {
    return this.status === 0;
  }
}

let onUnauthorized: (() => void) | null = null;
export const setUnauthorizedHandler = (fn: (() => void) | null) => {
  onUnauthorized = fn;
};

async function parseError(res: Response): Promise<ApiError> {
  let body: any = null;
  try {
    body = await res.json();
  } catch {
    /* non-JSON */
  }
  const payload = body?.message && typeof body.message === 'object' ? body.message : body;
  let message: string =
    (typeof payload?.message === 'string' && payload.message) ||
    (Array.isArray(payload?.message) && payload.message.join('. ')) ||
    res.statusText ||
    'Request failed';
  if (res.status === 413) message = 'File is too large (max 10 MB per page).';
  if (res.status === 429) message = 'Too many attempts. Please wait a minute and try again.';
  return new ApiError(res.status, payload?.code ?? `HTTP_${res.status}`, message, payload ?? undefined);
}

const REQUEST_TIMEOUT_MS = 30_000;
const UPLOAD_TIMEOUT_MS = 180_000;
const isGatewayDown = (status: number) => status === 502 || status === 503 || status === 504;

export async function api<T>(
  path: string,
  init: { method?: string; body?: unknown; form?: FormData; signal?: AbortSignal; quiet401?: boolean; timeoutMs?: number } = {}
): Promise<T> {
  // A hung request on flaky field networks would otherwise block the sync loop indefinitely.
  const ctrl = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    ctrl.abort();
  }, init.timeoutMs ?? REQUEST_TIMEOUT_MS);
  const onCallerAbort = () => ctrl.abort();
  if (init.signal?.aborted) ctrl.abort();
  else init.signal?.addEventListener('abort', onCallerAbort, { once: true });
  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      method: init.method ?? (init.body || init.form ? 'POST' : 'GET'),
      credentials: 'same-origin',
      headers: init.body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
      body: init.form ?? (init.body !== undefined ? JSON.stringify(init.body) : undefined),
      signal: ctrl.signal,
    });
  } catch (e) {
    if ((e as Error).name === 'AbortError' && !timedOut) throw e;
    throw new ApiError(0, 'NETWORK', timedOut ? 'The server took too long to respond.' : 'Cannot reach the server. Check your connection.');
  } finally {
    clearTimeout(timer);
    init.signal?.removeEventListener('abort', onCallerAbort);
  }
  if (!res.ok) {
    const err = await parseError(res);
    // Vite proxy answers 502/504 when the API process is down: treat like offline.
    if (isGatewayDown(res.status)) {
      throw new ApiError(0, 'NETWORK', 'Server is unreachable right now.');
    }
    if (res.status === 401 && !init.quiet401) onUnauthorized?.();
    throw err;
  }
  if (res.status === 204) return undefined as T;
  const type = res.headers.get('content-type') ?? '';
  return (type.includes('application/json') ? res.json() : res.text()) as Promise<T>;
}

/** Multipart upload with progress (fetch has no upload progress events). */
export function uploadWithProgress<T>(path: string, form: FormData, onProgress?: (pct: number) => void): Promise<T> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `${API_BASE}${path}`);
    xhr.withCredentials = true;
    xhr.timeout = UPLOAD_TIMEOUT_MS;
    xhr.ontimeout = () => reject(new ApiError(0, 'NETWORK', 'Upload timed out — the connection is too slow.'));
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress?.(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onerror = () => reject(new ApiError(0, 'NETWORK', 'Upload failed — connection lost.'));
    xhr.onload = async () => {
      const res = new Response(xhr.responseText, { status: xhr.status, headers: { 'content-type': xhr.getResponseHeader('content-type') ?? '' } });
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          return resolve(JSON.parse(xhr.responseText) as T);
        } catch {
          // e.g. a captive-portal / proxy HTML page answering 200: retry later rather than crash.
          return reject(new ApiError(0, 'NETWORK', 'Unexpected response from the server.'));
        }
      }
      if (xhr.status === 0 || isGatewayDown(xhr.status)) return reject(new ApiError(0, 'NETWORK', 'Server is unreachable right now.'));
      if (xhr.status === 401) onUnauthorized?.();
      reject(await parseError(res));
    };
    xhr.send(form);
  });
}

/** Downloads an authenticated file (export or document page) and saves it with the server-provided name. */
export async function downloadFile(path: string, fallbackName: string) {
  let res: Response;
  try {
    res = await fetch(path.startsWith('/api/') ? path : `${API_BASE}${path}`, { credentials: 'same-origin' });
  } catch {
    throw new ApiError(0, 'NETWORK', 'Cannot reach the server. Check your connection.');
  }
  if (!res.ok) {
    if (isGatewayDown(res.status)) throw new ApiError(0, 'NETWORK', 'Server is unreachable right now.');
    const err = await parseError(res);
    if (res.status === 401) onUnauthorized?.();
    throw err;
  }
  const blob = await res.blob();
  const cd = res.headers.get('content-disposition') ?? '';
  const name = /filename="([^"]+)"/.exec(cd)?.[1] ?? fallbackName;
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
  return name;
}
