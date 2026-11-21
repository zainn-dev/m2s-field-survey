import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ExternalLink, Loader2, MapPin, ShieldCheck, Trash2 } from 'lucide-react';
import type { GpsPermissionStatus, Language, SurveyRecord } from '../types/survey';
import { captureGpsCoordinates, googleMapsUrl, NativeGpsProvider, queryGpsPermission } from '../utils/gpsCapture';

interface GpsConsentCardProps {
  record: SurveyRecord;
  language: Language;
  disabled?: boolean;
  autoCapture?: boolean;
  nativeProvider?: NativeGpsProvider;
  onUpdate: (patch: Partial<SurveyRecord>) => void;
}

const PERM_LABEL: Record<GpsPermissionStatus, string> = {
  granted: 'Allowed',
  denied: 'Denied',
  prompt: 'Not requested',
  unavailable: 'Unavailable',
};

export const GpsConsentCard: React.FC<GpsConsentCardProps> = ({
  record,
  language,
  disabled,
  autoCapture = true,
  nativeProvider,
  onUpdate,
}) => {
  const hi = language === 'hi';
  const [capturing, setCapturing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const manualOptOutRef = useRef(false);
  const autoTriedRef = useRef(false);

  const captureNow = useCallback(async () => {
    if (disabled) return;
    setCapturing(true);
    setError(null);
    try {
      const reading = await captureGpsCoordinates(nativeProvider);
      onUpdate({
        gpsConsent: true,
        gpsLat: reading.lat,
        gpsLng: reading.lng,
        gpsAccuracyMeters: reading.accuracyMeters,
        gpsCapturedAt: reading.capturedAt,
        gpsPermissionStatus: reading.permissionStatus,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Could not capture GPS location.';
      setError(msg);
      if (/denied/i.test(msg)) onUpdate({ gpsPermissionStatus: 'denied' });
    } finally {
      setCapturing(false);
    }
  }, [disabled, nativeProvider, onUpdate]);

  useEffect(() => {
    let active = true;
    queryGpsPermission(nativeProvider).then((perm) => {
      if (!active) return;
      if (!record.gpsPermissionStatus && perm !== 'prompt') {
        onUpdate({ gpsPermissionStatus: perm });
      }
      if (
        autoCapture &&
        !disabled &&
        !manualOptOutRef.current &&
        !autoTriedRef.current &&
        record.gpsConsent !== false &&
        record.gpsLat == null &&
        perm !== 'denied' &&
        perm !== 'unavailable'
      ) {
        autoTriedRef.current = true;
        captureNow().catch(() => undefined);
      }
    });
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nativeProvider, autoCapture, disabled]);

  const toggleConsent = (agreed: boolean) => {
    setError(null);
    if (!agreed) {
      manualOptOutRef.current = true;
      onUpdate({
        gpsConsent: false,
        gpsLat: undefined,
        gpsLng: undefined,
        gpsAccuracyMeters: undefined,
        gpsCapturedAt: undefined,
      });
    } else {
      manualOptOutRef.current = false;
      onUpdate({ gpsConsent: true });
      if (record.gpsLat == null) {
        captureNow().catch(() => undefined);
      }
    }
  };

  const hasCoords = Boolean(record.gpsConsent && record.gpsLat != null && record.gpsLng != null);
  const perm = record.gpsPermissionStatus ?? 'prompt';

  return (
    <section className="bg-white rounded-[14px] border border-[#E7E2D4] p-4 space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="w-8 h-8 rounded-lg bg-[#FFF8D6] text-[#8C6200] grid place-items-center shrink-0">
            <MapPin className="w-4 h-4" />
          </span>
          <div>
            <h3 className="text-[14.5px] font-semibold text-[#181611]">
              {hi ? 'वैकल्पिक GPS लोकेशन (सहमति आधारित)' : 'Optional Household GPS Coordinates (Consent-Based)'}
            </h3>
            <p className="text-[12px] text-[#726C5D]">
              {hi
                ? 'प्रतिवादी की स्पष्ट अनुमति के बिना सटीक स्थान एकत्र न करें। केवल अधिकृत समन्वयक देख सकते हैं।'
                : 'Collect location only if the household head gives explicit consent. Access is restricted to authorized coordinators.'}
            </p>
          </div>
        </div>
        <span
          className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${
            perm === 'granted'
              ? 'bg-[#FFF8D6] text-[#8C6200]'
              : perm === 'denied'
              ? 'bg-[#FDECEA] text-[#A3312A]'
              : 'bg-[#EFECE2] text-[#5C5547]'
          }`}
        >
          {PERM_LABEL[perm]}
        </span>
      </div>

      <label
        className={`flex items-start gap-3 rounded-[10px] border p-3 cursor-pointer ${
          record.gpsConsent ? 'bg-[#FFF8D6] border-[#D9AE00]/40' : 'bg-[#FAF8F2] border-[#E7E2D4]'
        }`}
      >
        <input
          type="checkbox"
          disabled={disabled}
          checked={Boolean(record.gpsConsent)}
          onChange={(e) => toggleConsent(e.target.checked)}
          className="mt-0.5 w-4 h-4 accent-[#D9AE00]"
        />
        <div className="text-[13px] leading-snug">
          <div className="font-semibold text-[#181611]">
            {hi
              ? 'प्रतिवादी ने घर/कैंप की GPS लोकेशन साझा करने की सहमति दी है'
              : 'Respondent consented to share approximate GPS coordinates for cluster mapping'}
          </div>
          <div className="text-[11.5px] text-[#5C5547] mt-0.5">
            {hi ? 'वैकल्पिक: आप इसे अनचेक छोड़ सकते हैं और सर्वे आगे बढ़ा सकते हैं।' : 'Optional: unchecking clears stored GPS coordinates immediately.'}
          </div>
        </div>
      </label>

      {record.gpsConsent && (
        <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={disabled || capturing}
              onClick={captureNow}
              className="h-10 px-3.5 rounded-[10px] bg-[#FDC513] hover:bg-[#E5B00D] disabled:opacity-50 text-[#181611] text-[13px] font-semibold inline-flex items-center gap-2"
            >
              {capturing ? <Loader2 className="w-4 h-4 animate-spin" /> : <MapPin className="w-4 h-4" />}
              {hasCoords ? (hi ? 'GPS अपडेट करें' : 'Refresh GPS') : hi ? 'GPS कैप्चर करें' : 'Capture GPS Location'}
            </button>
            {hasCoords && !disabled && (
              <button
                type="button"
                onClick={() => {
                  manualOptOutRef.current = true;
                  onUpdate({
                    gpsLat: undefined,
                    gpsLng: undefined,
                    gpsAccuracyMeters: undefined,
                    gpsCapturedAt: undefined,
                  });
                }}
                className="h-10 px-3 rounded-[10px] border border-[#E7E2D4] text-[12.5px] font-medium text-[#5C5547] hover:bg-[#FAF8F2] inline-flex items-center gap-1.5"
              >
                <Trash2 className="w-3.5 h-3.5" />
                {hi ? 'हटाएँ' : 'Clear'}
              </button>
            )}
          </div>

          {hasCoords && record.gpsLat != null && record.gpsLng != null && (
            <a
              href={googleMapsUrl(record.gpsLat, record.gpsLng)}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 rounded-lg bg-[#FFF8D6] hover:bg-[#FFF0AE] px-2.5 py-1.5 text-[12px] text-[#5C4100] font-medium transition"
              title="Open coordinates in Google Maps"
            >
              <ShieldCheck className="w-3.5 h-3.5 shrink-0" />
              <span className="font-mono">
                {record.gpsLat.toFixed(5)}, {record.gpsLng.toFixed(5)}
              </span>
              <span>· ±{Math.round(record.gpsAccuracyMeters ?? 0)}m</span>
              <ExternalLink className="w-3 h-3 shrink-0 opacity-75" />
            </a>
          )}
        </div>
      )}

      {error && (
        <p className="rounded-[10px] bg-[#FDECEA] border border-[#F5C6C2] px-3 py-2 text-[12.5px] text-[#A3312A]" role="alert">
          {error}
        </p>
      )}
    </section>
  );
};

