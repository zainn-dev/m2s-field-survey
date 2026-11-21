import { Geolocation } from '@capacitor/geolocation';
import type { GpsPermissionStatus } from '@m2s/shared/types/survey';
import type { NativeGpsProvider } from '@m2s/shared/utils/gpsCapture';
import { isNativeCapacitor } from '../api/http';

function toPermissionState(state: string | undefined): GpsPermissionStatus {
  if (state === 'granted') return 'granted';
  if (state === 'denied') return 'denied';
  return 'prompt';
}

export const mobileNativeGpsProvider: NativeGpsProvider | undefined = isNativeCapacitor()
  ? {
      checkPermissions: async () => {
        const res = await Geolocation.checkPermissions();
        return { location: toPermissionState(res.location), coarseLocation: toPermissionState(res.coarseLocation) };
      },
      requestPermissions: async () => {
        const res = await Geolocation.requestPermissions();
        return { location: toPermissionState(res.location), coarseLocation: toPermissionState(res.coarseLocation) };
      },
      getCurrentPosition: async (options) => {
        const pos = await Geolocation.getCurrentPosition(options);
        return {
          coords: {
            latitude: pos.coords.latitude,
            longitude: pos.coords.longitude,
            accuracy: pos.coords.accuracy,
          },
          timestamp: pos.timestamp,
        };
      },
    }
  : undefined;
