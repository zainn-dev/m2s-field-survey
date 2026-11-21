import type { GpsPermissionStatus, SurveyRecord } from '../types/survey';
import {
  captureGpsCoordinates,
  describeStudyArea,
  queryGpsPermission,
  reverseGeocodeCoordinates,
  type NativeGpsProvider,
} from './gpsCapture';

export interface CachedDeviceGps {
  lat: number;
  lng: number;
  accuracyMeters: number;
  capturedAt: string;
  permissionStatus: GpsPermissionStatus;
  locationLabel?: string;
}

export type SessionGpsState = 'idle' | 'acquiring' | 'active' | 'denied' | 'unavailable';

export interface SessionLocationPayload {
  gpsLat?: number;
  gpsLng?: number;
  gpsAccuracyMeters?: number;
  gpsCapturedAt?: string;
  gpsPermissionStatus?: GpsPermissionStatus;
  locationLabel?: string;
  clusterName?: string;
}

export interface SessionLocationCaptureResult {
  state: SessionGpsState;
  reading: CachedDeviceGps | null;
  payload: SessionLocationPayload;
}

const STORAGE_KEY = 'm2s_last_device_gps';
export const DEVICE_GPS_MAX_AGE_MS = 10 * 60_000;

export function readCachedDeviceGps(maxAgeMs = DEVICE_GPS_MAX_AGE_MS): CachedDeviceGps | null {
  try {
    if (typeof localStorage === 'undefined') return null;
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<CachedDeviceGps>;
    if (!Number.isFinite(parsed.lat) || !Number.isFinite(parsed.lng) || typeof parsed.capturedAt !== 'string') {
      return null;
    }
    const ts = Date.parse(parsed.capturedAt);
    if (!Number.isFinite(ts) || Date.now() - ts > maxAgeMs) return null;
    return {
      lat: Number(parsed.lat),
      lng: Number(parsed.lng),
      accuracyMeters: Number.isFinite(parsed.accuracyMeters) ? Number(parsed.accuracyMeters) : 0,
      capturedAt: parsed.capturedAt,
      permissionStatus: parsed.permissionStatus ?? 'granted',
      locationLabel: typeof parsed.locationLabel === 'string' ? parsed.locationLabel : undefined,
    };
  } catch {
    return null;
  }
}

export function writeCachedDeviceGps(reading: CachedDeviceGps): void {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(reading));
    }
  } catch {
    /* ignore storage quota / private mode */
  }
}

/** Forget the last device fix (sign-out on a shared phone must not leak the previous volunteer's position). */
export function clearCachedDeviceGps(): void {
  try {
    if (typeof localStorage !== 'undefined') localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

export const SURVEY_PREFILL_MAX_AGE_MS = 2 * 60_000;

export function initialSurveyGpsFields(): Pick<
  SurveyRecord,
  'gpsConsent' | 'gpsLat' | 'gpsLng' | 'gpsAccuracyMeters' | 'gpsCapturedAt' | 'gpsPermissionStatus'
> {
  // A survey's location must be where the household is: only reuse a fix taken moments ago, otherwise the
  // wizard captures a fresh one (the 10-minute session cache can be several households away).
  const cached = readCachedDeviceGps(SURVEY_PREFILL_MAX_AGE_MS);
  if (cached) {
    return {
      gpsConsent: true,
      gpsLat: cached.lat,
      gpsLng: cached.lng,
      gpsAccuracyMeters: cached.accuracyMeters,
      gpsCapturedAt: cached.capturedAt,
      gpsPermissionStatus: cached.permissionStatus,
    };
  }
  return {
    gpsConsent: true,
    gpsPermissionStatus: 'prompt',
  };
}

/**
 * Automatically acquires current GPS coordinates (without user interaction when permission allows)
 * and builds the /auth/location payload with area/cluster fallback.
 */
export async function captureSessionLocation(
  nativeProvider?: NativeGpsProvider,
  fallbackClusterName?: string
): Promise<SessionLocationCaptureResult> {
  const cached = readCachedDeviceGps();
  const initialPerm = await queryGpsPermission(nativeProvider).catch(() => 'prompt' as GpsPermissionStatus);
  if (initialPerm === 'denied' || initialPerm === 'unavailable') {
    return {
      state: initialPerm,
      reading: cached,
      payload: {
        gpsPermissionStatus: initialPerm,
        ...(cached
          ? {
              gpsLat: cached.lat,
              gpsLng: cached.lng,
              gpsAccuracyMeters: cached.accuracyMeters,
              gpsCapturedAt: cached.capturedAt,
            }
          : {}),
        locationLabel: cached?.locationLabel,
        clusterName: fallbackClusterName,
      },
    };
  }

  try {
    const reading = await captureGpsCoordinates(nativeProvider);
    const geoName = await reverseGeocodeCoordinates(reading.lat, reading.lng).catch(() => undefined);
    const label = geoName
      ? `${geoName} (${reading.lat.toFixed(4)}, ${reading.lng.toFixed(4)})`
      : `${reading.lat.toFixed(4)}°, ${reading.lng.toFixed(4)}°`;
    const saved: CachedDeviceGps = {
      lat: reading.lat,
      lng: reading.lng,
      accuracyMeters: reading.accuracyMeters,
      capturedAt: reading.capturedAt,
      permissionStatus: 'granted',
      locationLabel: label,
    };
    writeCachedDeviceGps(saved);
    return {
      state: 'active',
      reading: saved,
      payload: {
        gpsLat: saved.lat,
        gpsLng: saved.lng,
        gpsAccuracyMeters: saved.accuracyMeters,
        gpsCapturedAt: saved.capturedAt,
        gpsPermissionStatus: 'granted',
        locationLabel: label,
        clusterName: fallbackClusterName,
      },
    };
  } catch {
    const afterPerm = await queryGpsPermission(nativeProvider).catch(() => initialPerm);
    return {
      state: afterPerm === 'denied' ? 'denied' : 'unavailable',
      reading: cached,
      payload: {
        gpsPermissionStatus: afterPerm,
        ...(cached
          ? {
              gpsLat: cached.lat,
              gpsLng: cached.lng,
              gpsAccuracyMeters: cached.accuracyMeters,
              gpsCapturedAt: cached.capturedAt,
            }
          : {}),
        locationLabel: cached?.locationLabel,
        clusterName: fallbackClusterName,
      },
    };
  }
}

export function mergeSurveyGpsReading(record: SurveyRecord, reading: CachedDeviceGps): SurveyRecord {
  if (record.gpsLat != null || record.gpsConsent === false) return record;
  return {
    ...record,
    gpsConsent: true,
    gpsLat: reading.lat,
    gpsLng: reading.lng,
    gpsAccuracyMeters: reading.accuracyMeters,
    gpsCapturedAt: reading.capturedAt,
    gpsPermissionStatus: reading.permissionStatus,
  };
}

export async function dispatchSessionLocationPing(opts: {
  fallbackClusterName?: string;
  nativeProvider?: NativeGpsProvider;
  isOnline: () => boolean;
  isSignedIn: () => boolean;
  postLocation: (body: SessionLocationPayload) => Promise<unknown>;
  onState: (state: SessionGpsState) => void;
  onReading: (reading: CachedDeviceGps) => void;
}): Promise<void> {
  const cached = readCachedDeviceGps();
  if (!cached) opts.onState('acquiring');

  if (opts.isOnline() && opts.isSignedIn()) {
    await opts
      .postLocation({
        clusterName: opts.fallbackClusterName,
        ...(cached
          ? {
              gpsLat: cached.lat,
              gpsLng: cached.lng,
              gpsAccuracyMeters: cached.accuracyMeters,
              gpsCapturedAt: cached.capturedAt,
              gpsPermissionStatus: cached.permissionStatus,
              locationLabel: cached.locationLabel,
            }
          : {}),
      })
      .catch(() => undefined);
  }

  const result = await captureSessionLocation(opts.nativeProvider, opts.fallbackClusterName);
  opts.onState(result.state);
  if (result.reading) opts.onReading(result.reading);

  if (opts.isOnline() && opts.isSignedIn()) {
    await opts.postLocation(result.payload).catch(() => undefined);
  }
}

