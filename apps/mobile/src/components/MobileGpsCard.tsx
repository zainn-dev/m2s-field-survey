import React, { useMemo } from 'react';
import { Geolocation } from '@capacitor/geolocation';
import type { Language, SurveyRecord } from '@m2s/shared/types/survey';
import { GpsConsentCard } from '@m2s/shared/components/GpsConsentCard';
import type { NativeGpsProvider } from '@m2s/shared/utils/gpsCapture';
import { isNativeCapacitor } from '../api/http';

interface MobileGpsCardProps {
  record: SurveyRecord;
  language: Language;
  disabled?: boolean;
  onUpdate: (patch: Partial<SurveyRecord>) => void;
}

export const MobileGpsCard: React.FC<MobileGpsCardProps> = ({ record, language, disabled, onUpdate }) => {
  const nativeProvider = useMemo<NativeGpsProvider | undefined>(() => {
    if (!isNativeCapacitor()) return undefined;
    return {
      checkPermissions: () => Geolocation.checkPermissions(),
      requestPermissions: () => Geolocation.requestPermissions(),
      getCurrentPosition: (options) => Geolocation.getCurrentPosition(options),
    };
  }, []);

  return (
    <GpsConsentCard
      record={record}
      language={language}
      disabled={disabled}
      nativeProvider={nativeProvider}
      onUpdate={onUpdate}
    />
  );
};

