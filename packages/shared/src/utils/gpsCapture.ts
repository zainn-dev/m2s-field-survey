import type { GpsPermissionStatus } from '../types/survey';

export interface GpsReading {
  lat: number;
  lng: number;
  accuracyMeters: number;
  capturedAt: string;
  permissionStatus: GpsPermissionStatus;
}

export interface NativeGpsProvider {
  checkPermissions(): Promise<{ location: string; coarseLocation?: string }>;
  requestPermissions(): Promise<{ location: string; coarseLocation?: string }>;
  getCurrentPosition(options?: { enableHighAccuracy?: boolean; timeout?: number }): Promise<{
    coords: { latitude: number; longitude: number; accuracy: number };
    timestamp: number;
  }>;
}

/** Android "Approximate only" grants coarseLocation while location stays denied: either grant is usable. */
function mapNativePerm(p: { location?: string; coarseLocation?: string }): GpsPermissionStatus {
  if (p.location === 'granted' || p.coarseLocation === 'granted') return 'granted';
  if (p.location === 'denied' && (!p.coarseLocation || p.coarseLocation === 'denied')) return 'denied';
  return 'prompt';
}

function mapPerm(state: string | undefined): GpsPermissionStatus {
  if (state === 'granted') return 'granted';
  if (state === 'denied') return 'denied';
  return 'prompt';
}

export async function queryGpsPermission(nativeProvider?: NativeGpsProvider): Promise<GpsPermissionStatus> {
  if (nativeProvider) {
    try {
      const p = await nativeProvider.checkPermissions();
      return mapNativePerm(p);
    } catch {
      return 'prompt';
    }
  }
  if (typeof navigator === 'undefined' || !('geolocation' in navigator)) return 'unavailable';
  try {
    if ('permissions' in navigator && navigator.permissions?.query) {
      const status = await navigator.permissions.query({ name: 'geolocation' as PermissionName });
      return mapPerm(status.state);
    }
  } catch {
    /* ignore */
  }
  return 'prompt';
}

export async function captureGpsCoordinates(nativeProvider?: NativeGpsProvider): Promise<GpsReading> {
  if (nativeProvider) {
    let perm = await nativeProvider.checkPermissions();
    if (perm.location !== 'granted' && perm.coarseLocation !== 'granted') {
      perm = await nativeProvider.requestPermissions();
    }
    const status = mapNativePerm(perm);
    if (status === 'denied') {
      throw new Error('Location permission denied on device. Enable Location in Android Settings to capture GPS.');
    }
    const pos = await nativeProvider.getCurrentPosition({ enableHighAccuracy: true, timeout: 15_000 });
    return {
      lat: Number(pos.coords.latitude.toFixed(6)),
      lng: Number(pos.coords.longitude.toFixed(6)),
      accuracyMeters: Math.round(pos.coords.accuracy ?? 0),
      capturedAt: new Date(pos.timestamp || Date.now()).toISOString(),
      permissionStatus: 'granted',
    };
  }

  if (typeof navigator === 'undefined' || !('geolocation' in navigator)) {
    throw new Error('Geolocation is unavailable on this browser/device.');
  }

  return new Promise<GpsReading>((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(
      (pos) =>
        resolve({
          lat: Number(pos.coords.latitude.toFixed(6)),
          lng: Number(pos.coords.longitude.toFixed(6)),
          accuracyMeters: Math.round(pos.coords.accuracy ?? 0),
          capturedAt: new Date(pos.timestamp || Date.now()).toISOString(),
          permissionStatus: 'granted',
        }),
      (err) => {
        if (err.code === err.PERMISSION_DENIED) {
          reject(new Error('Location permission was denied by browser/device.'));
        } else if (err.code === err.TIMEOUT) {
          reject(new Error('GPS signal timed out. Move to an open area or retry.'));
        } else {
          reject(new Error(err.message || 'Unable to read GPS location.'));
        }
      },
      { enableHighAccuracy: true, timeout: 15_000, maximumAge: 30_000 }
    );
  });
}

/** Direct Google Maps coordinate link for admin verification. */
export function googleMapsUrl(lat: number, lng: number): string {
  return `https://maps.google.com/?q=${lat.toFixed(6)},${lng.toFixed(6)}`;
}

/** Compact coordinate display helper. */
export function formatGpsCoords(lat: number, lng: number): string {
  return `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
}

/** Labels coordinates falling inside the Lutumari / Nagaon study bounding box. */
export function describeStudyArea(lat: number, lng: number): string | undefined {
  if (lat >= 26.15 && lat <= 26.55 && lng >= 92.45 && lng <= 92.95) {
    return 'Lutumari / Nagaon Study Area';
  }
  return undefined;
}

/** Resolves actual locality / city / state for coordinates via fast reverse geocode. */
export async function reverseGeocodeCoordinates(lat: number, lng: number): Promise<string | undefined> {
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 3000);
    const res = await fetch(
      `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lng}&localityLanguage=en`,
      { signal: ctrl.signal }
    );
    clearTimeout(timer);
    if (res.ok) {
      const data = (await res.json()) as {
        locality?: string;
        city?: string;
        principalSubdivision?: string;
        countryName?: string;
      };
      const loc = data.locality || data.city;
      const sub = data.principalSubdivision;
      const parts = [loc, sub].map((s) => s?.trim()).filter(Boolean);
      if (parts.length > 0) return parts.join(', ');
    }
  } catch {
    /* ignore network failure / offline */
  }

  // Fallback to study area if within bounding box
  return describeStudyArea(lat, lng);
}

