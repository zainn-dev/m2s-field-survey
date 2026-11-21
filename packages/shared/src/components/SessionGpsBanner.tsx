import React from 'react';
import { RefreshCw } from 'lucide-react';
import type { CachedDeviceGps, SessionGpsState } from '../utils/sessionLocation';

interface SessionGpsBannerProps {
  gpsState: SessionGpsState;
  deviceGps: CachedDeviceGps | null;
  hi?: boolean;
  onRefresh: () => void;
}

export const SessionGpsBanner: React.FC<SessionGpsBannerProps> = ({ gpsState, deviceGps, hi = false, onRefresh }) => (
  <div className="rounded-[12px] bg-white border border-[#E7E2D4] px-3.5 py-2.5 flex items-center justify-between gap-2 text-[12px]">
    <div className="flex items-center gap-2 min-w-0">
      <span
        className={`w-2 h-2 rounded-full shrink-0 ${
          gpsState === 'active'
            ? 'bg-[#217045]'
            : gpsState === 'denied'
              ? 'bg-[#C93B32]'
              : 'bg-[#D9AE00] animate-pulse'
        }`}
      />
      <span className="font-semibold text-[#181611] truncate">
        {gpsState === 'active' && deviceGps
          ? `GPS Active · ${deviceGps.locationLabel || `${deviceGps.lat.toFixed(4)}, ${deviceGps.lng.toFixed(4)}`}`
          : gpsState === 'denied'
            ? hi
              ? 'GPS अनुमति अवरुद्ध (सेटिंग्स से चालू करें)'
              : 'Location permission blocked in device/browser settings'
            : hi
              ? 'स्वतः GPS लोकेशन प्राप्त की जा रही है…'
              : 'Auto-capturing field GPS location…'}
      </span>
    </div>
    <button
      type="button"
      onClick={onRefresh}
      className="text-[11.5px] font-semibold text-[#8C6200] hover:underline shrink-0 inline-flex items-center gap-1"
    >
      <RefreshCw className={`w-3 h-3 ${gpsState === 'acquiring' ? 'animate-spin' : ''}`} />
      {hi ? 'ताज़ा करें' : 'Refresh'}
    </button>
  </div>
);

