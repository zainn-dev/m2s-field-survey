import type { Request } from 'express';

const ipLocationCache = new Map<string, { label: string; exp: number }>();
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

export function parseTrustProxy(raw: string | undefined): boolean | number | string {
  const val = raw?.trim();
  if (val) {
    if (val === 'true') return true;
    if (val === 'false') return false;
    if (/^\d+$/.test(val)) return Number(val);
    return val;
  }
  if (process.env.NODE_ENV === 'production' || process.env.RAILWAY_ENVIRONMENT || process.env.RAILWAY_PUBLIC_DOMAIN) {
    return 1;
  }
  return 'loopback';
}

function normalizeIpToken(raw: string): string {
  let ip = raw.trim();
  if (!ip) return '';
  if (ip.startsWith('::ffff:')) ip = ip.slice(7);
  // Strip IPv4 :port suffix (leave IPv6 intact unless bracketed)
  if (ip.startsWith('[') && ip.includes(']:')) {
    ip = ip.slice(1, ip.indexOf(']:'));
  } else if (/^\d{1,3}(\.\d{1,3}){3}:\d+$/.test(ip)) {
    ip = ip.split(':')[0];
  }
  return ip.slice(0, 64);
}

type IpRequest = Pick<Request, 'headers' | 'ip' | 'socket'> & { app?: { get?: (name: string) => unknown } };

/** True when the direct peer is a proxy we were told to trust (Express `trust proxy`), so its headers are meaningful. */
function fromTrustedProxy(req: IpRequest): boolean {
  const trust = req.app?.get?.('trust proxy fn');
  const peer = req.socket?.remoteAddress;
  return typeof trust === 'function' && !!peer && !!(trust as (addr: string, i: number) => boolean)(peer, 0);
}

/**
 * Real caller IP. `req.ip` already walks X-Forwarded-For only as far as `trust proxy` allows, so a client cannot
 * spoof its audit IP by sending its own header. CF-Connecting-IP / X-Real-IP are used only from a trusted proxy.
 */
export function extractClientIp(req?: IpRequest | null): string | undefined {
  if (!req) return undefined;
  const headers = req.headers ?? {};
  const firstHeader = (val: unknown): string => {
    if (Array.isArray(val)) return String(val[0] ?? '');
    return typeof val === 'string' ? val : '';
  };
  const trusted = fromTrustedProxy(req);
  const candidates = [
    ...(trusted ? [firstHeader(headers['cf-connecting-ip']).split(',')[0], firstHeader(headers['x-real-ip']).split(',')[0]] : []),
    req.ip ?? '',
    req.socket?.remoteAddress ?? '',
  ];
  for (const c of candidates) {
    const clean = normalizeIpToken(c ?? '');
    if (clean) return clean;
  }
  return undefined;
}

export function isPrivateOrLocalIp(ip: string): boolean {
  if (!ip) return true;
  if (ip === '127.0.0.1' || ip === '::1' || ip === '0:0:0:0:0:0:0:1') return true;
  if (ip.startsWith('10.') || ip.startsWith('192.168.') || ip.startsWith('169.254.')) return true;
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(ip)) return true;
  if (/^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./.test(ip)) return true;
  if (/^(fc|fd|fe80)/i.test(ip)) return true;
  return false;
}

/** Resolves coarse city/region/country for an IP via proxy headers or bounded non-blocking cache lookup. */
export async function resolveIpLocation(
  ip?: string,
  req?: IpRequest | null
): Promise<string | undefined> {
  // Edge geo headers (Vercel / Cloudflare) are only believable when a trusted proxy forwarded the request.
  const h = req && fromTrustedProxy(req) ? req.headers ?? {} : {};
  const headerCity = String(h['x-vercel-ip-city'] ?? h['cf-ipcity'] ?? '').trim();
  const headerRegion = String(h['x-vercel-ip-country-region'] ?? h['cf-region'] ?? '').trim();
  const headerCountry = String(h['x-vercel-ip-country'] ?? h['cf-ipcountry'] ?? '').trim();
  const fromHeaders = [headerCity, headerRegion, headerCountry]
    .filter((v) => v && v.toUpperCase() !== 'XX' && v.toLowerCase() !== 'unknown')
    .join(', ');
  if (fromHeaders) return fromHeaders.slice(0, 120);

  if (!ip) return undefined;
  if (isPrivateOrLocalIp(ip)) return 'Local / Private Network';

  const now = Date.now();
  const cached = ipLocationCache.get(ip);
  if (cached && cached.exp > now) return cached.label;
  if (process.env.NODE_ENV === 'test') return undefined;

  try {
    const res = await fetch(`https://ipwho.is/${encodeURIComponent(ip)}?fields=success,city,region,country`, {
      signal: AbortSignal.timeout(1200),
    });
    if (!res.ok) return undefined;
    const json = (await res.json()) as { success?: boolean; city?: string; region?: string; country?: string };
    if (!json?.success) return undefined;
    const label = [json.city, json.region, json.country].map((s) => s?.trim()).filter(Boolean).join(', ').slice(0, 120);
    if (!label) return undefined;
    if (ipLocationCache.size >= 500) {
      const oldestKey = ipLocationCache.keys().next().value;
      if (oldestKey) ipLocationCache.delete(oldestKey);
    }
    ipLocationCache.set(ip, { label, exp: now + CACHE_TTL_MS });
    return label;
  } catch {
    return undefined;
  }
}

export function describeGpsArea(lat?: number | null, lng?: number | null): string | undefined {
  if (lat == null || lng == null || !Number.isFinite(lat) || !Number.isFinite(lng)) return undefined;
  if (lat >= 26.15 && lat <= 26.55 && lng >= 92.45 && lng <= 92.95) {
    return 'Lutumari / Nagaon Study Area';
  }
  return undefined;
}

